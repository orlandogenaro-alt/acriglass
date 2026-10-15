<?php
// Catálogo de conceptos con su matriz de insumos (migraciones/006_conceptos_pu_versiones.sql; solo Supabase)
// GET  ?accion=listar            renglones del menú Catalogos › Conceptos P.U., con su costo directo
// GET  ?accion=ficha&id=N        registro, matriz con costos y costo directo (id 0 = nuevo)
// POST ?accion=guardar           {id, codigo, descripcion, descripcion_tecnica, unidad_id, familia, notas, activo, matriz (JSON)}
// POST ?accion=eliminar          {id}
// El precio unitario (con indirectos, financiamiento y utilidad) se calcula en el presupuesto.
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/bd.php';
require __DIR__ . '/../includes/pu.php';
require __DIR__ . '/../includes/respuesta.php';

if (modoConfiguracion()) error('Modo configuración: aún no hay conexión a la base.', 503);
exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_SUGERIDO_OBRA', 'MODIFICAR_SUGERIDO_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA',
    'CATALOGO_INSUMOS', 'PRECIOS_INSUMOS', 'ADMIN_USER');
$accion = $_GET['accion'] ?? 'listar';
if ($accion === 'guardar' || $accion === 'eliminar') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
    exigirCsrf();
    exigirPermiso('CATALOGO_INSUMOS', 'ADMIN_USER');
}
$puedeModificar = tienePermiso('CATALOGO_INSUMOS', 'ADMIN_USER');
session_write_close();

if (!bd_tiene_tabla('AW', 'conceptos_pu')) {
    error('El catálogo de conceptos aún no está en la base: aplica migraciones/006_conceptos_pu_versiones.sql (php herramientas/migrar.php --aplicar).', 503);
}

function texto($v, int $largo): ?string
{
    $v = trim(preg_replace('/[ \t]+/u', ' ', (string) ($v ?? '')));
    return $v === '' ? null : mb_substr($v, 0, $largo);
}

// Matriz guardada de cada concepto: [concepto_pu_id => [renglones]]
function matrices(?int $id = null): array
{
    $m = [];
    $sql = 'select concepto_pu_id, insumo_id, cantidad, rendimiento, desperdicio_pct from concepto_pu_insumos'
        . ($id ? ' where concepto_pu_id = ?' : '') . ' order by concepto_pu_id, orden, concepto_pu_insumo_id';
    foreach (bd_filas('AW', $sql, $id ? [$id] : []) as $r) $m[(int) $r['concepto_pu_id']][] = $r;
    return $m;
}

function listar(): array
{
    [$insumos, $componentes] = puCargarCatalogo();
    $tc = puTiposCambio();
    $matrices = matrices();
    $filas = [];
    foreach (bd_filas('AW', 'select c.concepto_pu_id, c.codigo, c.descripcion, c.familia, c.estatus, u.clave as unidad
                               from conceptos_pu c join unidades u on u.unidad_id = c.unidad_id order by c.codigo') as $c) {
        $id = (int) $c['concepto_pu_id'];
        $r = puCostoConcepto($matrices[$id] ?? [], $insumos, $componentes, $tc);
        $sinMatriz = empty($matrices[$id]);
        $filas[] = ['id' => $id, 'codigo' => $c['codigo'], 'descripcion' => $c['descripcion'], 'unidad' => $c['unidad'], 'familia' => $c['familia'],
                    'insumos' => count($matrices[$id] ?? []),
                    'costo_directo' => $sinMatriz ? 'Sin matriz' : ($r['cd'] === null ? 'Pendiente' : number_format($r['cd'], 2)),
                    'estatus' => trim((string) $c['estatus']) === 'B' ? 'Baja' : 'Activo'];
    }
    return $filas;
}

function ficha(int $id): array
{
    $r = ['registro' => null, 'componentes' => [], 'cd' => null, 'faltan' => [],
          'unidades' => bd_filas('AW', "select unidad_id as id, clave || ' · ' || nombre as nombre from unidades where estatus = 'A' order by clave")];
    if (!$id) return $r;
    $reg = bd_fila('AW', 'select * from conceptos_pu where concepto_pu_id = ?', [$id]);
    if (!$reg) error('El concepto ya no existe (¿lo eliminaron?).', 404);
    $reg['id'] = $id;
    $reg['nombre'] = $reg['codigo'] . ' · ' . $reg['descripcion'];
    $reg['activo'] = trim((string) $reg['estatus']) !== 'B';
    $r['registro'] = $reg;
    [$insumos, $componentes] = puCargarCatalogo();
    try {
        $c = puCostoConcepto(matrices($id)[$id] ?? [], $insumos, $componentes, puTiposCambio());
        $r['componentes'] = $c['filas'];
        $r['cd'] = $c['cd'];
        $r['faltan'] = $c['faltan'];
    } catch (RuntimeException $e) {
        $r['faltan'] = [$e->getMessage()];
    }
    return $r;
}

function guardar(array $d): array
{
    $id = (int) ($d['id'] ?? 0);
    if ($id && !bd_valor('AW', 'select count(*) from conceptos_pu where concepto_pu_id = ?', [$id])) error('El concepto ya no existe.', 404);
    $codigo = texto(mb_strtoupper((string) ($d['codigo'] ?? '')), 30);
    $desc = texto($d['descripcion'] ?? '', 250);
    if ($codigo === null) error('Captura el código del concepto.');
    if ($desc === null) error('Captura la descripción corta del concepto.');
    if (bd_valor('AW', 'select count(*) from conceptos_pu where upper(trim(codigo)) = ? and concepto_pu_id <> ?', [$codigo, $id])) {
        error("Ya existe otro concepto con el código «{$codigo}».");
    }
    $unidad = (int) ($d['unidad_id'] ?? 0);
    if (!$unidad || !bd_valor('AW', 'select count(*) from unidades where unidad_id = ?', [$unidad])) error('Selecciona la unidad del concepto.');
    $campos = [
        'codigo' => $codigo, 'descripcion' => $desc, 'descripcion_tecnica' => texto($d['descripcion_tecnica'] ?? '', 8000),
        'unidad_id' => $unidad, 'familia' => texto(mb_strtoupper((string) ($d['familia'] ?? '')), 80),
        'notas' => texto($d['notas'] ?? '', 4000), 'estatus' => !empty($d['activo']) ? 'A' : 'B',
    ];

    $matriz = null;
    if (array_key_exists('componentes', $d)) {
        $lista = json_decode((string) $d['componentes'], true);
        if (!is_array($lista)) error('La matriz del concepto no es válida.');
        $matriz = [];
        foreach ($lista as $i => $r) {
            $iid = (int) ($r['insumo_id'] ?? 0);
            $n = $i + 1;
            if (!$iid || !bd_valor('AW', 'select count(*) from insumos where insumo_id = ?', [$iid])) error("El insumo del renglón $n ya no existe.");
            $rend = trim((string) ($r['rendimiento'] ?? ''));
            $rend = $rend === '' ? null : (is_numeric($rend) && (float) $rend > 0 ? round((float) $rend, 6) : error("El rendimiento del renglón $n debe ser mayor que cero."));
            $cant = $rend ? round(1 / $rend, 6) : (is_numeric($r['cantidad'] ?? '') ? round((float) $r['cantidad'], 6) : 0);
            if ($cant <= 0) error("La cantidad del renglón $n debe ser mayor que cero (o captura su rendimiento).");
            $desp = is_numeric($r['desperdicio_pct'] ?? 0) ? (float) ($r['desperdicio_pct'] ?? 0) : -1;
            if ($desp < 0 || $desp >= 100) error("El desperdicio del renglón $n debe ser de 0 a 99.99 %.");
            if (isset($matriz[$iid])) error("Un insumo está repetido en la matriz (renglón $n): súmalo en un solo renglón.");
            $matriz[$iid] = ['cantidad' => $cant, 'rendimiento' => $rend, 'desperdicio_pct' => round($desp, 4), 'orden' => count($matriz)];
        }
    }

    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        if ($id) {
            bd_ejecutar('AW', 'update conceptos_pu set ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($campos))) . ' where concepto_pu_id = ?',
                array_merge(array_values($campos), [$id]));
        } else {
            $campos['usuario_creacion'] = mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50);
            $id = bd_insertar('AW', 'conceptos_pu', 'concepto_pu_id', $campos);
        }
        if ($matriz !== null) {
            bd_ejecutar('AW', 'delete from concepto_pu_insumos where concepto_pu_id = ?', [$id]);
            foreach ($matriz as $iid => $r) bd_insertar('AW', 'concepto_pu_insumos', 'concepto_pu_insumo_id', ['concepto_pu_id' => $id, 'insumo_id' => $iid] + $r);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['id' => $id];
}

try {
    switch ($accion) {
        case 'listar':
            responder(['ok' => true, 'filas' => listar(), 'puede_modificar' => $puedeModificar]);
        case 'ficha':
            responder(['ok' => true, 'puede_modificar' => $puedeModificar] + ficha((int) ($_GET['id'] ?? 0)));
        case 'guardar':
            responder(['ok' => true] + guardar(entrada()));
        case 'eliminar':
            bd_ejecutar('AW', 'delete from conceptos_pu where concepto_pu_id = ?', [(int) (entrada()['id'] ?? 0)]);
            responder(['ok' => true]);
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/conceptos-pu: ' . $e->getMessage());
    error('No se pudo completar: ' . bd_mensaje_error($e), 500);
}
