<?php
// Altas y cambios de presupuestos de obra (AW-Management en el servidor local, Supabase en la nube)
// POST ?accion=guardar     cuerpo JSON con encabezado, conceptos, empleados, comisiones, seguros y relacionados; regresa { id, folio }
// POST ?accion=estatus     { id, estatus, autoriza? }  cambia el estatus con las reglas del Form46
// POST ?accion=registrar_obra { id, nom_obra }  crea la obra del presupuesto; regresa { obra_id, nom_obra, nueva }
// POST ?accion=eliminar    { id, autoriza? }  solo un presupuesto Cancelado
// Los ids nuevos salen de GEN_ID(ID_CATALOGOS) en Firebird (igual que los triggers de AW)
// y de las columnas identity en Supabase. El folio lo asigna la base (trigger / secuencia).
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/bd.php';
require __DIR__ . '/../includes/autenticacion.php';
require __DIR__ . '/../includes/permisos.php';
require __DIR__ . '/../includes/estatus.php';
require __DIR__ . '/../includes/tareas.php';
require __DIR__ . '/../includes/respuesta.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') error('Método no permitido.', 405);
if (modoConfiguracion()) error('Modo configuración: aún no hay conexión a AW-Management.', 503);
exigirCsrf();
exigirPermiso('NUEVO_SUGERIDO_OBRA', 'MODIFICAR_SUGERIDO_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'ADMIN_USER');
session_write_close();

// Catálogo de conceptos de cada sección: tabla, columna id
const CATALOGOS = [
    'MP' => ['conceptos_mat_prima_obra', 'concepto_mat_prima_id'],
    'MO' => ['conceptos_mano_obra', 'concepto_mano_obra_id'],
    'GO' => ['conceptos_gas_operacion_obra', 'concepto_gas_operacion_obra_id'],
];

function texto($v, int $largo): ?string
{
    $v = trim((string) ($v ?? ''));
    return $v === '' ? null : mb_substr($v, 0, $largo);
}

function numero($v, int $decimales = 2): float
{
    return round(is_numeric($v) ? (float) $v : 0.0, $decimales);
}

// Id del concepto por su descripción; si no está en el catálogo se da de alta
function conceptoId(string $tipo, string $descripcion, array &$cache): int
{
    $k = $tipo . '|' . mb_strtoupper($descripcion);
    if (isset($cache[$k])) return $cache[$k];
    [$tabla, $col] = CATALOGOS[$tipo];
    $id = (int) bd_valor('AW', "select min($col) from $tabla where upper(trim(descripcion)) = ?", [mb_strtoupper($descripcion)]);
    if (!$id) $id = bd_insertar('AW', $tabla, $col, ['descripcion' => mb_substr($descripcion, 0, 80)]);
    return $cache[$k] = $id;
}

// Id del vendedor de obra por su nombre; si no existe se da de alta
function vendedorId(?string $nombre): ?int
{
    if ($nombre === null) return null;
    $id = (int) bd_valor('AW', 'select min(vendedor_obra_id) from vendedores_obras where upper(trim(nombre)) = ?', [mb_strtoupper($nombre)]);
    return $id ?: bd_insertar('AW', 'vendedores_obras', 'vendedor_obra_id', ['nombre' => $nombre, 'estatus' => 'A']);
}

// Estatus guardado del presupuesto (error si ya no existe)
function estatusActual(int $id): string
{
    $e = bd_valor('AW', 'select estatus from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$id]);
    if ($e === null || $e === false) error('El presupuesto ya no existe (¿lo eliminaron?).', 404);
    return trim((string) $e);
}

// Detalle del Form46 que cuelga del encabezado: empleados (grid_man_obra), comisiones, anexo de seguro y
// sugeridos relacionados. Se reemplaza completo al guardar. tabla => [columna id, columna del presupuesto, generador de AW]
const DETALLES = [
    'mano_obra_detalle'      => ['mano_obra_det_id', 'docto_sugerido_obra_id', 'id_catalogos'],
    'comisiones_obra_det'    => ['comision_obra_det_id', 'docto_sugerido_obra_id', 'id_catalogos'],
    'anexos_obra_seguro'     => ['anexo_obra_idd', 'docto_sugerido_obra_id', 'id_elementos'],
    'sugeridos_relacionados' => ['sug_relacion_id', 'sugerido_id_padre', 'id_elementos'],
];

function borrarDetalles(int $id): void
{
    foreach (DETALLES as $tabla => [, $colPadre]) bd_ejecutar('AW', "delete from $tabla where $colPadre = ?", [$id]);
}

function guardarDetalles(int $id, array $d, array &$cache): void
{
    $ins = function (string $tabla, array $campos) {
        [$colId, , $gen] = DETALLES[$tabla];
        bd_insertar('AW', $tabla, $colId, $campos, $gen);
    };
    $vistos = [];
    foreach ($d['empleados'] ?? [] as $e) {
        $clave = (int) ($e['clave'] ?? 0);
        $emp = (int) ($e['empleado_id'] ?? 0);
        if ($emp && isset($vistos[$emp])) continue;   // valida_empledo_no_exista
        $vistos[$emp] = 1;
        $sueldo = numero($e['sueldo'] ?? 0);
        $dias = numero($e['dias'] ?? 0);
        $ins('mano_obra_detalle', [
            'docto_sugerido_obra_id' => $id,
            'empleado_id'    => $emp ?: null,
            'clave_empleado' => $clave ?: null,
            'nombre'         => texto($e['nombre'] ?? '', 200),
            'sueldo_diario'  => $sueldo,
            'num_dias'       => $dias,
            'total'          => numero($sueldo * $dias),
        ]);
    }
    foreach ($d['comisiones'] ?? [] as $c) {
        $ins('comisiones_obra_det', [
            'docto_sugerido_obra_id' => $id,
            'tipo_empleado_id' => (int) ($c['tipo_id'] ?? 0) ?: null,
            'nombre'           => texto($c['nombre'] ?? '', 50),
            'porcentaje'       => numero($c['porcentaje'] ?? 0, 4),
            'total_comision'   => numero($c['total'] ?? 0),
        ]);
    }
    foreach ($d['seguros'] ?? [] as $s) {
        $nombre = texto($s['concepto'] ?? '', 80);
        if ($nombre === null) continue;
        $ins('anexos_obra_seguro', [
            'docto_sugerido_obra_id'         => $id,
            'concepto_gas_operacion_obra_id' => conceptoId('GO', $nombre, $cache),
            'nombre'                         => $nombre,
            'porcentaje_1'                   => numero($s['porcentaje_1'] ?? 0),
            'porcentaje_2'                   => numero($s['porcentaje_2'] ?? 0),
            'total'                          => numero($s['total'] ?? 0),
        ]);
    }
    $vistos = [];
    foreach ($d['relacionados'] ?? [] as $r) {
        $hijo = (int) ($r['sugerido_id'] ?? 0);
        if (!$hijo || $hijo === $id || isset($vistos[$hijo])) continue;
        $vistos[$hijo] = 1;
        $h = bd_fila('AW', 'select folio, cliente from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$hijo]);
        if (!$h) continue;   // lo eliminaron mientras tanto
        $ins('sugeridos_relacionados', [
            'sugerido_id_padre'     => $id,
            'sugerido_id_hijo'      => $hijo,
            'folio_sugerido_hijo'   => (int) $h['folio'],
            'cliente_sugerido_hijo' => texto($h['cliente'], 100),
            'tipo'                  => 'SO',
        ]);
    }
}

function guardar(array $d): array
{
    $id = (int) ($d['id'] ?? 0);
    $fecha = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($d['fecha'] ?? '')) ? $d['fecha'] : date('Y-m-d');
    $cliente = texto($d['cliente'] ?? '', 150);
    if ($cliente === null) error('Captura el cliente antes de guardar.');
    // Form46: el correo del contacto de HubSpot y el proyecto son obligatorios
    $email = texto($d['email'] ?? '', 150);
    if ($email === null || mb_strlen($email) <= 10 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        error('Es necesario colocar el correo del contacto con el que se registró en HubSpot para guardar el presupuesto.');
    }
    if (texto($d['proyecto'] ?? '', 200) === null) error('Es necesario capturar el nombre del Proyecto para guardar el presupuesto.');
    // El estatus no cambia al guardar (eso es ?accion=estatus); uno nuevo nace Pendiente
    $estatus = 'Pendiente';
    if ($id) {
        $estatus = estatusActual($id);
        if (estatusBloqueaCambios($estatus)) error("El presupuesto está $estatus: ya no es posible hacerle modificaciones.");
    }

    $conceptos = [];
    foreach ($d['conceptos'] ?? [] as $c) {
        $tipo = strtoupper((string) ($c['tipo'] ?? ''));
        $nombre = texto($c['concepto'] ?? '', 80);
        if (!isset(CATALOGOS[$tipo])) continue;
        if ($nombre === null) {
            if (numero($c['presupuesto'] ?? 0) == 0) continue;   // renglón vacío
            error('Hay un concepto con importe pero sin nombre en ' . ['MP' => 'Materia Prima', 'MO' => 'Mano de Obra', 'GO' => 'Gastos de Operacion'][$tipo] . '.');
        }
        $c['tipo'] = $tipo;
        $c['concepto'] = $nombre;
        $conceptos[] = $c;
    }

    $t = $d['totales'] ?? [];
    $enc = [
        'fecha'             => $fecha,
        'cliente'           => $cliente,
        'proyecto'          => texto($d['proyecto'] ?? '', 200),
        'ubicacion'         => texto($d['ubicacion'] ?? '', 150),
        'vendedor_obra_id'  => null,
        'estatus'           => $estatus,
        'utilidad_neta_por' => numero($d['utilidad_por'] ?? 0, 4),
        'cos_primo'         => numero($t['cos_primo'] ?? 0),
        'gas_operacion'     => numero($t['gas_operacion'] ?? 0),
        'utilidad_neta'     => numero($t['utilidad_neta'] ?? 0),
        'subtotal'          => numero($t['subtotal'] ?? 0),
        'iva'               => numero($t['iva'] ?? 0),
        'total'             => numero($t['total'] ?? 0),
        'notas'             => texto($d['notas'] ?? '', 32000),
    ];
    $idHs = preg_replace('/\D/', '', (string) ($d['id_hs'] ?? ''));
    if (bd_tiene_columna('AW', 'doctos_sugerido_obra', 'id_hs')) $enc['id_hs'] = $idHs !== '' && $idHs !== '0' ? $idHs : null;
    if (bd_tiene_columna('AW', 'doctos_sugerido_obra', 'correo_electronico')) $enc['correo_electronico'] = texto($d['email'] ?? '', 150);

    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        $enc['vendedor_obra_id'] = vendedorId(texto($d['vendedor'] ?? '', 150));

        if ($id) {
            bd_ejecutar('AW', 'update doctos_sugerido_obra set ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($enc)))
                . ' where docto_sugerido_obra_id = ?', array_merge(array_values($enc), [$id]));
            // Los renglones se reemplazan completos (con sus artículos importados y el detalle del Form46)
            bd_ejecutar('AW', 'delete from doctos_suge_obra_det_mat where docto_sugerido_obra_det_id in
                                 (select docto_sugerido_obra_det_id from doctos_sugerido_obra_det where docto_sugerido_obra_id = ?)', [$id]);
            bd_ejecutar('AW', 'delete from doctos_sugerido_obra_det where docto_sugerido_obra_id = ?', [$id]);
            borrarDetalles($id);
        } else {
            // folio 0 / sin folio: lo asigna el trigger (Firebird) o la secuencia (Supabase)
            $enc['usuario_creador'] = mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50);
            if (bd_motor('AW') === 'firebird') $enc['folio'] = 0;
            $id = bd_insertar('AW', 'doctos_sugerido_obra', 'docto_sugerido_obra_id', $enc);
        }

        $cache = [];
        foreach ($conceptos as $c) {
            $docto = (int) ($c['docto_imp_id'] ?? 0);
            $detId = bd_insertar('AW', 'doctos_sugerido_obra_det', 'docto_sugerido_obra_det_id', [
                'docto_sugerido_obra_id' => $id,
                'concepto_id'            => conceptoId($c['tipo'], $c['concepto'], $cache),
                'presupuesto'            => numero($c['presupuesto'] ?? 0),
                'subtotal'               => numero($c['presupuesto'] ?? 0),
                'total'                  => numero($c['presupuesto'] ?? 0),
                'porcentaje'             => numero($c['porcentaje'] ?? 0),
                'docto_imp_id'           => !empty($c['importar']) && $docto ? $docto : null,
                'folio'                  => texto($c['folio'] ?? '', 20),
                'notas'                  => texto($c['notas'] ?? '', 32000),
                'tipo_concepto'          => $c['tipo'],
            ]);
            foreach ($c['articulos'] ?? [] as $a) {
                bd_insertar('AW', 'doctos_suge_obra_det_mat', 'docto_suge_obra_det_mat_id', [
                    'docto_sugerido_obra_det_id' => $detId,
                    'docto_id'       => (int) ($a['docto_id'] ?? 0) ?: null,
                    'folio'          => texto($a['folio'] ?? '', 10),
                    'id_articulo'    => (int) ($a['id_articulo'] ?? 0) ?: null,
                    'clave_articulo' => texto($a['clave_articulo'] ?? '', 30),
                    'nom_articulo'   => texto($a['nom_articulo'] ?? '', 200),
                    'unidades'       => numero($a['unidades'] ?? 0),
                    'precio_unit'    => numero($a['precio_unit'] ?? 0),
                    'precio_total'   => numero($a['precio_total'] ?? 0),
                    'unid_medida'    => texto($a['unid_medida'] ?? '', 30),
                ]);
            }
        }
        guardarDetalles($id, $d, $cache);
        // Conceptos/Tareas (fechas, responsable, avance…); sin la tabla se guarda el resto del presupuesto
        if (isset($d['tareas']) && tareasDisponibles()) guardarTareas($id, (array) $d['tareas']);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    return ['id' => $id, 'folio' => (int) bd_valor('AW', 'select folio from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$id])];
}

// Registra la obra del presupuesto (reg_obras) y la liga al presupuesto (doctos_sugerido_obra.obra_id).
// Si ya tiene obra, regresa la existente. El vendedor del presupuesto queda como responsable
// y el presupuesto pasa a Aceptado.
function registrarObra(array $d): array
{
    $autorizo = tienePermiso('NUEVO_OBRA', 'ADMIN_USER') ? null : autorizacion($d['autoriza'] ?? null, 'NUEVO_OBRA');
    $id = (int) ($d['id'] ?? 0);
    if (!$id) error('Guarda el presupuesto antes de registrar la obra.');
    $p = bd_fila('AW', 'select docto_sugerido_obra_id, folio, cliente, proyecto, ubicacion, vendedor_obra_id, estatus, obra_id
                          from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$id]);
    if (!$p) error('El presupuesto ya no existe (¿lo eliminaron?).', 404);
    $estatus = trim((string) $p['estatus']);
    if (in_array(mb_strtoupper($estatus), ['CANCELADO', 'RECHAZADO'], true)) error("El presupuesto está $estatus: no se puede registrar la obra.");

    // Ya registrada (por obra_id o por una obra que apunte al presupuesto)
    $obraId = (int) $p['obra_id'];
    if ($obraId && !bd_valor('AW', 'select count(*) from reg_obras where obra_id = ?', [$obraId])) $obraId = 0;
    if (!$obraId) $obraId = (int) bd_valor('AW', 'select min(obra_id) from reg_obras where sugerido_id = ?', [$id]);
    if ($obraId) {
        if ((int) $p['obra_id'] !== $obraId) bd_ejecutar('AW', 'update doctos_sugerido_obra set obra_id = ? where docto_sugerido_obra_id = ?', [$obraId, $id]);
        $nom = (string) bd_valor('AW', 'select nom_obra from reg_obras where obra_id = ?', [$obraId]);
        return ['obra_id' => $obraId, 'nom_obra' => $nom, 'nueva' => false, 'estatus' => $estatus];
    }

    $nombre = texto($d['nom_obra'] ?? '', 200) ?? texto($p['proyecto'], 200) ?? texto($p['cliente'], 200);
    $obra = [
        'sugerido_id'      => $id,
        'nom_obra'         => $nombre,
        'direccion'        => texto($p['ubicacion'], 200),
        'contacto'         => texto($p['cliente'], 150),
        'fecha_ini'        => date('Y-m-d'),
        'estatus'          => 'Planificacion',
        'fecha_creacion'   => date('Y-m-d H:i:s'),
        'usuario_creacion' => mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50),
    ];
    if ($autorizo !== null) $obra['notas'] = mb_substr("Registro autorizado por $autorizo.", 0, 200);
    if (bd_tiene_columna('AW', 'reg_obras', 'gasto_administrativo')) $obra['gasto_administrativo'] = 26;
    if (bd_tiene_columna('AW', 'reg_obras', 'avance_obra')) $obra['avance_obra'] = 0;

    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        $obraId = bd_insertar('AW', 'reg_obras', 'obra_id', $obra);
        // Como en el sistema de escritorio: al registrar la obra el presupuesto queda Aceptado
        bd_ejecutar('AW', "update doctos_sugerido_obra set obra_id = ?, estatus = 'Aceptado' where docto_sugerido_obra_id = ?", [$obraId, $id]);
        if ((int) $p['vendedor_obra_id']) {
            bd_insertar('AW', 'responsables_de_obra', 'res_obra_id', [
                'obra_id' => $obraId, 'vendedor_obra_id' => (int) $p['vendedor_obra_id'], 'fecha_hora_asig' => date('Y-m-d H:i:s'),
            ], 'id_elementos');   // mismo generador que el trigger RESPONSABLES_DE_OBRA_BI
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['obra_id' => $obraId, 'nom_obra' => $nombre, 'nueva' => true, 'estatus' => 'Aceptado'];
}

// Actualizar Estatus / Cancelar del Form46: requiere MODIFICAR_SUGERIDO_OBRA (o que otro usuario lo autorice)
function cambiarEstatus(array $d): array
{
    $id = (int) ($d['id'] ?? 0);
    if (!$id) error('Es necesario guardar el presupuesto antes de cambiar su estatus.');
    $nuevo = estatusValido($d['estatus'] ?? '');
    if ($nuevo === null) error('Estatus no válido.');
    $antes = estatusActual($id);
    if ($motivo = estatusTransicion($antes, $nuevo)) error($motivo);
    $autorizo = tienePermiso('MODIFICAR_SUGERIDO_OBRA', 'ADMIN_USER') ? null : autorizacion($d['autoriza'] ?? null, 'MODIFICAR_SUGERIDO_OBRA');
    bd_ejecutar('AW', 'update doctos_sugerido_obra set estatus = ? where docto_sugerido_obra_id = ?', [$nuevo, $id]);
    return ['estatus' => $nuevo, 'autorizo' => $autorizo];
}

// Form46: solo se elimina un presupuesto Cancelado
function eliminar(array $d): void
{
    $id = (int) ($d['id'] ?? 0);
    if (!$id) error('Falta el presupuesto a eliminar.');
    $estatus = estatusActual($id);
    if (mb_strtoupper($estatus) !== 'CANCELADO') error("Solo se puede eliminar un presupuesto Cancelado (este está $estatus).");
    if (bd_valor('AW', 'select count(*) from reg_obras where sugerido_id = ?', [$id])) {
        error('No se puede eliminar: el presupuesto ya tiene una obra registrada.');
    }
    if (!tienePermiso('MODIFICAR_SUGERIDO_OBRA', 'ADMIN_USER')) autorizacion($d['autoriza'] ?? null, 'MODIFICAR_SUGERIDO_OBRA');
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        borrarDetalles($id);
        if (tareasDisponibles()) bd_ejecutar('AW', 'delete from conceptos_tareas where docto_sugerido_obra_id = ?', [$id]);
        // Si otro presupuesto lo tenía relacionado, deja de estarlo
        bd_ejecutar('AW', 'delete from sugeridos_relacionados where sugerido_id_hijo = ?', [$id]);
        bd_ejecutar('AW', 'delete from doctos_suge_obra_det_mat where docto_sugerido_obra_det_id in
                             (select docto_sugerido_obra_det_id from doctos_sugerido_obra_det where docto_sugerido_obra_id = ?)', [$id]);
        bd_ejecutar('AW', 'delete from doctos_sugerido_obra_det where docto_sugerido_obra_id = ?', [$id]);
        bd_ejecutar('AW', 'delete from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$id]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

try {
    switch ($_GET['accion'] ?? '') {
        case 'guardar':
            responder(['ok' => true] + guardar(entrada()));
        case 'registrar_obra':
            responder(['ok' => true] + registrarObra(entrada()));
        case 'estatus':
            responder(['ok' => true] + cambiarEstatus(entrada()));
        case 'autorizar':
            // «Modificar» sin el permiso: otro usuario con MODIFICAR_SUGERIDO_OBRA lo autoriza
            responder(['ok' => true, 'autorizo' => autorizacion(entrada()['autoriza'] ?? null, 'MODIFICAR_SUGERIDO_OBRA')]);
        case 'eliminar':
            eliminar(entrada());
            responder(['ok' => true]);
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/presupuestos: ' . $e->getMessage());
    error('No se pudo guardar en AW-Management: ' . bd_mensaje_error($e), 500);
}
