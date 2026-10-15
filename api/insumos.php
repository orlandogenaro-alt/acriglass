<?php
// Catálogo de insumos y básicos (migraciones/004_insumos.sql; solo Supabase)
// GET  ?accion=listar                   renglones del menú Catalogos › Insumos, con su costo
// GET  ?accion=ficha&id=N               registro, precios, componentes y costo (id 0 = nuevo)
// GET  ?accion=buscar&q=…&excluir=N     insumos activos para agregar a un básico (30 como máximo)
// POST ?accion=guardar                  {id, clave, descripcion, tipo, unidad_id, …, componentes (JSON), precio_nuevo…}
// POST ?accion=eliminar                 {id}   solo si no tiene historial de precios ni se usa en un básico
// Un cambio de precio no sobrescribe: agrega un renglón con su vigencia (insumo_precios).
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/bd.php';
require __DIR__ . '/../includes/permisos.php';
require __DIR__ . '/../includes/pu.php';
require __DIR__ . '/../includes/respuesta.php';

if (modoConfiguracion()) error('Modo configuración: aún no hay conexión a la base.', 503);
exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_SUGERIDO_OBRA', 'MODIFICAR_SUGERIDO_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA',
    'CATALOGO_INSUMOS', 'PRECIOS_INSUMOS', 'ADMIN_USER');
$accion = $_GET['accion'] ?? 'listar';
if ($accion === 'guardar' || $accion === 'eliminar') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
    exigirCsrf();
    exigirPermiso('CATALOGO_INSUMOS', 'PRECIOS_INSUMOS', 'ADMIN_USER');
}
$puedeModificar = tienePermiso('CATALOGO_INSUMOS', 'ADMIN_USER');
$puedePrecios = tienePermiso('PRECIOS_INSUMOS', 'ADMIN_USER');
session_write_close();

if (!puDisponible()) error('El catálogo de insumos aún no está en la base: aplica migraciones/004_insumos.sql (php herramientas/migrar.php --aplicar).', 503);

const TIPOS_INSUMO = ['MAT' => 'Material', 'MO' => 'Mano de obra', 'EQ' => 'Equipo / maquinaria', 'HER' => 'Herramienta', 'BAS' => 'Básico / cuadrilla'];
const FUENTES_PRECIO = ['captura' => 'Captura', 'proveedor' => 'Cotización de proveedor', 'microsip' => 'Microsip', 'importacion' => 'Importación'];

function texto($v, int $largo): ?string
{
    $v = trim(preg_replace('/\s+/u', ' ', (string) ($v ?? '')));
    return $v === '' ? null : mb_substr($v, 0, $largo);
}

function numeroValido($v, string $campo): float
{
    if (!is_numeric($v)) error("$campo debe ser un número.");
    return (float) $v;
}

// Tipos de cambio vigentes para los precios en otra moneda (Catalogos › Parámetros de costos)
function tiposCambio(): array
{
    static $tc = null;
    return $tc ?? ($tc = puTiposCambio());
}

// Migración 005: FASAR ligado a la mano de obra y costo horario del equipo
function conFasar(): bool { return bd_tiene_columna('AW', 'insumos', 'fasar_id'); }
function conCostoHorario(): bool { return bd_tiene_tabla('AW', 'costos_horarios'); }

function costoTexto(array $r): string
{
    return $r['costo'] === null ? 'Pendiente' : number_format($r['costo'], 2);
}

function listar(): array
{
    [$insumos, $componentes] = puCargarCatalogo();
    $tc = tiposCambio();
    $memo = [];
    $filas = [];
    foreach ($insumos as $id => $i) {
        try {
            $r = puCostoInsumo($id, $insumos, $componentes, $tc, $memo);
        } catch (RuntimeException $e) {
            $r = ['costo' => null, 'faltan' => [$e->getMessage()]];
        }
        $filas[] = [
            'id' => $id, 'clave' => $i['clave'], 'descripcion' => $i['descripcion'], 'tipo' => TIPOS_INSUMO[$i['tipo']] ?? $i['tipo'],
            'unidad' => $i['unidad'], 'familia' => $i['familia'], 'costo' => costoTexto($r),
            'precio' => $i['precio'] === null ? '' : number_format((float) $i['precio'], 2) . ' ' . $i['moneda'],
            'vigencia' => $i['vigente_desde'], 'estatus' => strtoupper(trim((string) $i['estatus'])) === 'B' ? 'Baja' : 'Activo',
        ];
    }
    usort($filas, fn($a, $b) => strcmp($a['clave'], $b['clave']));
    return $filas;
}

function ficha(int $id): array
{
    $r = [
        'registro' => null, 'componentes' => [], 'precios' => [], 'costo' => null, 'faltan' => [],
        'unidades' => bd_filas('AW', "select unidad_id as id, clave || ' · ' || nombre as nombre from unidades where estatus = 'A' order by clave"),
        'tipos' => array_map(fn($k, $v) => ['id' => $k, 'nombre' => $v], array_keys(TIPOS_INSUMO), TIPOS_INSUMO),
        'fuentes' => array_map(fn($k, $v) => ['id' => $k, 'nombre' => $v], array_keys(FUENTES_PRECIO), FUENTES_PRECIO),
        'monedas' => [['id' => 'MXN', 'nombre' => 'MXN · Pesos'], ['id' => 'USD', 'nombre' => 'USD · Dólares']],
        'tipos_cambio' => tiposCambio(),
        'fasar' => conFasar() ? bd_filas('AW', "select fasar_id as id, nombre || ' · FSR ' || fsr as nombre from fasar where estatus = 'A' order by nombre") : [],
        'con_costo_horario' => conCostoHorario(),
        'costo_horario' => null,
    ];
    if (!$id) return $r;
    $reg = bd_fila('AW', 'select * from insumos where insumo_id = ?', [$id]);
    if (!$reg) error('El insumo ya no existe (¿lo eliminaron?).', 404);
    $reg['id'] = $id;
    $reg['nombre'] = $reg['clave'] . ' · ' . $reg['descripcion'];
    $reg['activo'] = strtoupper(trim((string) $reg['estatus'])) !== 'B';
    $r['registro'] = $reg;
    $r['precios'] = bd_filas('AW', 'select precio_id, precio, moneda, vigente_desde, fuente, proveedor, notas, usuario, fecha_registro
                                      from insumo_precios where insumo_id = ? order by vigente_desde desc, precio_id desc limit 50', [$id]);
    [$insumos, $componentes] = puCargarCatalogo();
    try {
        $c = puCostoInsumo($id, $insumos, $componentes, tiposCambio());
        $r['costo'] = $c['costo'];
        $r['faltan'] = $c['faltan'];
        if ($reg['tipo'] === 'BAS') $r['componentes'] = puDesglose($id, $insumos, $componentes, tiposCambio());
    } catch (RuntimeException $e) {
        $r['faltan'] = [$e->getMessage()];
    }
    if ($reg['tipo'] === 'EQ' && conCostoHorario()) {
        $ch = bd_fila('AW', 'select parametros, costo, fecha_mod, usuario_mod from costos_horarios where insumo_id = ?', [$id]);
        if ($ch) $r['costo_horario'] = ['parametros' => json_decode((string) $ch['parametros'], true), 'costo' => (float) $ch['costo'],
                                         'fecha' => $ch['fecha_mod'], 'usuario' => $ch['usuario_mod']];
    }
    $r['usado_en'] = bd_filas('AW', 'select i.insumo_id as id, i.clave, i.descripcion from insumo_componentes c
                                      join insumos i on i.insumo_id = c.insumo_id where c.componente_insumo_id = ? order by i.clave', [$id]);
    return $r;
}

function buscar(string $q, int $excluir): array
{
    $q = mb_strtoupper(trim($q));
    $filas = bd_filas('AW', "select i.insumo_id as id, i.clave, i.descripcion, i.tipo, u.clave as unidad
                               from insumos i join unidades u on u.unidad_id = i.unidad_id
                              where i.estatus = 'A' and i.insumo_id <> ?
                                and (upper(i.clave) like ? or upper(i.descripcion) like ?)
                              order by i.clave limit 30", [$excluir, "%$q%", "%$q%"]);
    [$insumos, $componentes] = puCargarCatalogo();
    $memo = [];
    foreach ($filas as &$f) {
        try {
            $f['costo'] = puCostoInsumo((int) $f['id'], $insumos, $componentes, tiposCambio(), $memo)['costo'];
        } catch (RuntimeException $e) {
            $f['costo'] = null;
        }
    }
    return $filas;
}

function guardar(array $d, bool $puedeModificar, bool $puedePrecios): array
{
    $id = (int) ($d['id'] ?? 0);
    $actual = $id ? bd_fila('AW', 'select tipo from insumos where insumo_id = ?', [$id]) : null;
    if ($id && !$actual) error('El insumo ya no existe (¿lo eliminaron?).', 404);

    $precio = trim((string) ($d['precio_nuevo'] ?? ''));
    $hayPrecio = $precio !== '';
    if (!$puedeModificar && (!$id || !$hayPrecio)) error('No tienes el permiso para dar de alta o cambiar insumos (CATALOGO_INSUMOS).', 403);
    if ($hayPrecio && !$puedePrecios) error('No tienes el permiso para cambiar precios de insumos (PRECIOS_INSUMOS).', 403);

    $tipo = strtoupper((string) ($d['tipo'] ?? ''));
    if (!isset(TIPOS_INSUMO[$tipo])) error('Selecciona el tipo de insumo.');
    $campos = null;
    if ($puedeModificar) {
        $clave = texto(mb_strtoupper((string) ($d['clave'] ?? '')), 30);
        $desc = texto($d['descripcion'] ?? '', 250);
        if ($clave === null) error('Captura la clave del insumo.');
        if ($desc === null) error('Captura la descripción del insumo.');
        if (bd_valor('AW', 'select count(*) from insumos where upper(trim(clave)) = ? and insumo_id <> ?', [$clave, $id])) {
            error("Ya existe otro insumo con la clave «{$clave}».");
        }
        $unidad = (int) ($d['unidad_id'] ?? 0);
        if (!$unidad || !bd_valor('AW', 'select count(*) from unidades where unidad_id = ?', [$unidad])) error('Selecciona la unidad.');
        $fsr = trim((string) ($d['fsr'] ?? '')) === '' ? 1.0 : numeroValido($d['fsr'], 'El FSR');
        if ($fsr <= 0 || $fsr >= 10) error('El FSR debe ser mayor que 0 y menor que 10.');
        // Mano de obra ligada a un FASAR: toma su FSR (Catalogos › Parámetros de costos)
        $fasarId = $tipo === 'MO' && conFasar() ? (int) ($d['fasar_id'] ?? 0) : 0;
        if ($fasarId) {
            $f = bd_fila('AW', 'select fsr, estatus from fasar where fasar_id = ?', [$fasarId]);
            if (!$f) error('El FASAR seleccionado ya no existe.');
            if (trim((string) $f['estatus']) === 'B' && (int) bd_valor('AW', 'select coalesce(fasar_id, 0) from insumos where insumo_id = ?', [$id]) !== $fasarId) {
                error('El FASAR seleccionado está dado de baja.');
            }
            $fsr = (float) $f['fsr'];
        }
        $campos = [
            'clave' => $clave, 'descripcion' => $desc, 'tipo' => $tipo, 'unidad_id' => $unidad,
            'familia' => texto(mb_strtoupper((string) ($d['familia'] ?? '')), 60),
            'fsr' => $tipo === 'MO' ? $fsr : 1,
            'clave_microsip' => texto(mb_strtoupper((string) ($d['clave_microsip'] ?? '')), 30),
            'notas' => texto($d['notas'] ?? '', 4000),
            'estatus' => !empty($d['activo']) ? 'A' : 'B',
        ];
        if (conFasar()) $campos['fasar_id'] = $fasarId ?: null;
    } elseif ($tipo !== $actual['tipo']) {
        error('No tienes el permiso para cambiar el tipo del insumo.', 403);
    }

    // Componentes del básico (lista completa; reemplaza la anterior)
    $componentes = null;
    if ($puedeModificar && $tipo === 'BAS' && array_key_exists('componentes', $d)) {
        $lista = json_decode((string) $d['componentes'], true);
        if (!is_array($lista)) error('Los componentes del básico no son válidos.');
        $componentes = [];
        foreach ($lista as $i => $c) {
            $cid = (int) ($c['insumo_id'] ?? 0);
            $cant = numeroValido($c['cantidad'] ?? '', 'La cantidad del componente ' . ($i + 1));
            $desp = numeroValido($c['desperdicio_pct'] ?? 0, 'El desperdicio del componente ' . ($i + 1));
            if (!$cid) error('Hay un componente sin insumo.');
            if ($cid === $id) error('Un básico no puede llevarse a sí mismo.');
            if ($cant <= 0) error('La cantidad de cada componente debe ser mayor que cero.');
            if ($desp < 0 || $desp >= 100) error('El desperdicio debe ser de 0 a 99.99 %.');
            if (isset($componentes[$cid])) error('Un insumo está repetido en los componentes: súmalo en un solo renglón.');
            $componentes[$cid] = ['cantidad' => round($cant, 6), 'desperdicio_pct' => round($desp, 4), 'orden' => count($componentes)];
        }
    }
    if ($puedeModificar && $id && $actual['tipo'] === 'BAS' && $tipo !== 'BAS'
        && bd_valor('AW', 'select count(*) from insumo_componentes where insumo_id = ?', [$id])) {
        error('El básico tiene componentes: quítalos antes de cambiarle el tipo.');
    }

    // Costo horario del equipo: se calcula aquí y su resultado entra al historial de precios
    $costoHorario = null;
    $datosCh = trim((string) ($d['costo_horario'] ?? ''));
    if ($tipo === 'EQ' && $datosCh !== '' && $datosCh !== 'null' && conCostoHorario()) {
        if (!$puedePrecios) error('No tienes el permiso para cambiar precios de insumos (PRECIOS_INSUMOS): el costo horario cambia el precio.', 403);
        if ($hayPrecio) error('Captura el precio o el costo horario, no los dos.');
        $p = json_decode($datosCh, true);
        if (!is_array($p)) error('Los datos del costo horario no son válidos.');
        try {
            $costoHorario = puCostoHorario($p);
        } catch (InvalidArgumentException $e) {
            error($e->getMessage());
        }
    }

    if ($hayPrecio) {
        if ($tipo === 'BAS') error('El costo de un básico sale de sus componentes: no se le captura precio.');
        $valor = numeroValido($precio, 'El precio');
        if ($valor < 0) error('El precio no puede ser negativo.');
        $moneda = in_array($d['moneda_nuevo'] ?? 'MXN', ['MXN', 'USD'], true) ? $d['moneda_nuevo'] : 'MXN';
        $desde = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($d['vigente_desde'] ?? '')) ? $d['vigente_desde'] : date('Y-m-d');
        $fuente = isset(FUENTES_PRECIO[$d['fuente'] ?? '']) ? $d['fuente'] : 'captura';
    }

    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        if ($campos !== null) {
            if ($id) {
                bd_ejecutar('AW', 'update insumos set ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($campos))) . ' where insumo_id = ?',
                    array_merge(array_values($campos), [$id]));
            } else {
                $campos['usuario_creacion'] = mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50);
                $id = bd_insertar('AW', 'insumos', 'insumo_id', $campos);
            }
        }
        if ($componentes !== null) {
            bd_ejecutar('AW', 'delete from insumo_componentes where insumo_id = ?', [$id]);
            foreach ($componentes as $cid => $c) {
                bd_insertar('AW', 'insumo_componentes', 'componente_id', ['insumo_id' => $id, 'componente_insumo_id' => $cid] + $c);
            }
        }
        if ($costoHorario !== null) {
            $antes = bd_fila('AW', 'select parametros, costo from costos_horarios where insumo_id = ?', [$id]);
            $param = json_encode($costoHorario['datos']);
            if ($antes) bd_ejecutar('AW', 'update costos_horarios set parametros = cast(? as jsonb), costo = ?, fecha_mod = ?, usuario_mod = ? where insumo_id = ?',
                [$param, $costoHorario['costo'], date('c'), mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50), $id]);
            else bd_ejecutar('AW', 'insert into costos_horarios (insumo_id, parametros, costo, fecha_mod, usuario_mod) values (?, cast(? as jsonb), ?, ?, ?)',
                [$id, $param, $costoHorario['costo'], date('c'), mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50)]);
            // Al historial solo si cambió el costo que rige hoy
            $vigente = bd_fila('AW', 'select precio, moneda from insumos_precio_vigente where insumo_id = ?', [$id]);
            if (!$vigente || trim($vigente['moneda']) !== 'MXN' || abs((float) $vigente['precio'] - $costoHorario['costo']) >= 0.000001) {
                bd_insertar('AW', 'insumo_precios', 'precio_id', [
                    'insumo_id' => $id, 'precio' => $costoHorario['costo'], 'moneda' => 'MXN', 'vigente_desde' => date('Y-m-d'),
                    'fuente' => 'costo_horario', 'notas' => 'Costo horario calculado', 'usuario' => mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50),
                ]);
            }
        }
        if ($hayPrecio) {
            bd_insertar('AW', 'insumo_precios', 'precio_id', [
                'insumo_id' => $id, 'precio' => round($valor, 6), 'moneda' => $moneda, 'vigente_desde' => $desde, 'fuente' => $fuente,
                'proveedor' => texto($d['proveedor'] ?? '', 150), 'notas' => texto($d['notas_precio'] ?? '', 500),
                'usuario' => mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50),
            ]);
        }
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        // Mensajes de la base que el usuario puede corregir (referencia circular, básico con componentes)
        if (preg_match('/(Referencia circular[^\n]*|Solo un insumo básico[^\n]*)/u', $e->getMessage(), $m)) error(trim(preg_replace('/\s*CONTEXT:.*$/s', '', $m[1])));
        throw $e;
    }
    return ['id' => $id];
}

function eliminar(int $id): void
{
    if (!bd_valor('AW', 'select count(*) from insumos where insumo_id = ?', [$id])) error('El insumo ya no existe.', 404);
    if (bd_valor('AW', 'select count(*) from insumo_componentes where componente_insumo_id = ?', [$id])) {
        error('El insumo se usa en un básico: quítalo de ahí o desmarca «Activo» para darlo de baja.');
    }
    if (bd_valor('AW', 'select count(*) from insumo_precios where insumo_id = ?', [$id])) {
        error('El insumo tiene historial de precios y no se elimina: desmarca «Activo» para darlo de baja.');
    }
    bd_ejecutar('AW', 'delete from insumos where insumo_id = ?', [$id]);
}

try {
    switch ($accion) {
        case 'listar':
            responder(['ok' => true, 'filas' => listar(), 'puede_modificar' => $puedeModificar || $puedePrecios]);
        case 'ficha':
            responder(['ok' => true, 'puede_modificar' => $puedeModificar || $puedePrecios, 'puede_catalogo' => $puedeModificar,
                'puede_precios' => $puedePrecios] + ficha((int) ($_GET['id'] ?? 0)));
        case 'buscar':
            responder(['ok' => true, 'filas' => buscar((string) ($_GET['q'] ?? ''), (int) ($_GET['excluir'] ?? 0))]);
        case 'guardar':
            responder(['ok' => true] + guardar(entrada(), $puedeModificar, $puedePrecios));
        case 'eliminar':
            if (!$puedeModificar) error('No tienes el permiso para eliminar insumos (CATALOGO_INSUMOS).', 403);
            eliminar((int) (entrada()['id'] ?? 0));
            responder(['ok' => true]);
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/insumos: ' . $e->getMessage());
    error('No se pudo completar: ' . bd_mensaje_error($e), 500);
}
