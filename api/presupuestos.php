<?php
// Altas y cambios de presupuestos de obra (AW-Management en el servidor local, Supabase en la nube)
// POST ?accion=guardar     cuerpo JSON con encabezado y conceptos; regresa { id, folio }
// POST ?accion=eliminar    { id }
// Los ids nuevos salen de GEN_ID(ID_CATALOGOS) en Firebird (igual que los triggers de AW)
// y de las columnas identity en Supabase. El folio lo asigna la base (trigger / secuencia).
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/bd.php';
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
const ESTATUS = ['Pendiente', 'Aceptado', 'Rechazado', 'Cancelado'];

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

function guardar(array $d): array
{
    $id = (int) ($d['id'] ?? 0);
    $fecha = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($d['fecha'] ?? '')) ? $d['fecha'] : date('Y-m-d');
    $estatus = in_array($d['estatus'] ?? '', ESTATUS, true) ? $d['estatus'] : 'Pendiente';
    $cliente = texto($d['cliente'] ?? '', 150);
    if ($cliente === null) error('Captura el cliente antes de guardar.');

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
            if (!bd_valor('AW', 'select count(*) from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$id])) {
                error('El presupuesto ya no existe (¿lo eliminaron?).', 404);
            }
            bd_ejecutar('AW', 'update doctos_sugerido_obra set ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($enc)))
                . ' where docto_sugerido_obra_id = ?', array_merge(array_values($enc), [$id]));
            // Los renglones se reemplazan completos (con sus artículos importados)
            bd_ejecutar('AW', 'delete from doctos_suge_obra_det_mat where docto_sugerido_obra_det_id in
                                 (select docto_sugerido_obra_det_id from doctos_sugerido_obra_det where docto_sugerido_obra_id = ?)', [$id]);
            bd_ejecutar('AW', 'delete from doctos_sugerido_obra_det where docto_sugerido_obra_id = ?', [$id]);
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
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    return ['id' => $id, 'folio' => (int) bd_valor('AW', 'select folio from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$id])];
}

function eliminar(int $id): void
{
    if (!$id) error('Falta el presupuesto a eliminar.');
    if (bd_valor('AW', 'select count(*) from reg_obras where sugerido_id = ?', [$id])) {
        error('No se puede eliminar: el presupuesto ya tiene una obra registrada.');
    }
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
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
        case 'eliminar':
            eliminar((int) (entrada()['id'] ?? 0));
            responder(['ok' => true]);
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/presupuestos: ' . $e->getMessage());
    error('No se pudo guardar en AW-Management: ' . bd_mensaje_error($e), 500);
}
