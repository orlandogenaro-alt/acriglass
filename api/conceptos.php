<?php
// Administrador › Conceptos de Materia Prima / Mano de Obra / Gastos de Operacion
// ?tipo=mp|mo|go en todas las peticiones
// GET  ?accion=listar
// POST ?accion=guardar   {clave, nuevo, descripcion, clave_concepto, calculo_automatico, porcentaje_calculo, afecta_gasto_oper, es_concepto_seguro}
// POST ?accion=activar   {clave}   alta / baja (solo si la tabla tiene estatus)
// POST ?accion=eliminar  {clave}   solo si ningún presupuesto lo usa
// clave = id del concepto
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/conceptos.php';
require __DIR__ . '/../includes/respuesta.php';

exigirPermiso('ADMIN_USER');
if (modoConfiguracion()) error('Modo configuración: aún no hay conexión a AW-Management.', 503);

$tipo = $_GET['tipo'] ?? '';
if (!isset(ACRI_CONCEPTOS[$tipo])) error('Tipo de concepto no válido.');
$cat = ACRI_CONCEPTOS[$tipo];

$accion = $_GET['accion'] ?? 'listar';
if ($accion !== 'listar') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
    exigirCsrf();
}
session_write_close();

$in = entrada();

// Renglones de presupuesto (y anexos de seguro) que usan el concepto
function usos(array $cat, int $id): int
{
    $n = (int) bd_valor('AW', 'select count(*) from doctos_sugerido_obra_det where concepto_id = ? and trim(tipo_concepto) = ?', [$id, $cat['sigla']]);
    if ($cat['sigla'] === 'GO') $n += (int) bd_valor('AW', 'select count(*) from anexos_obra_seguro where concepto_gas_operacion_obra_id = ?', [$id]);
    return $n;
}

function listar(string $tipo, array $cat): void
{
    $conEstatus = conceptosConEstatus($tipo);
    $cols = implode(', ', array_merge(["c.{$cat['id']} as id", 'c.clave', 'c.descripcion', $conEstatus ? 'c.estatus' : "'A' as estatus"],
        array_map(fn($x) => "c.$x", $cat['extra'])));
    $filas = [];
    foreach (bd_filas('AW',
        "select $cols,
                (select count(*) from doctos_sugerido_obra_det d where d.concepto_id = c.{$cat['id']} and trim(d.tipo_concepto) = ?) as usos
           from {$cat['tabla']} c
          order by c.descripcion", [$cat['sigla']]) as $f) {
        $fila = [
            'clave'          => (string) $f['id'],
            'clave_concepto' => $f['clave'] ?? '',
            'descripcion'    => $f['descripcion'] ?? '',
            'usos'           => (int) $f['usos'],
            'activa'         => strtoupper((string) $f['estatus']) !== 'B',
        ];
        if (in_array('calculo_automatico', $cat['extra'], true)) {
            $fila['calculo_automatico'] = strcasecmp(trim((string) $f['calculo_automatico']), 'True') === 0;
            $fila['porcentaje_calculo'] = (float) $f['porcentaje_calculo'];
        }
        if (in_array('afecta_gasto_oper', $cat['extra'], true)) $fila['afecta_gasto_oper'] = (int) $f['afecta_gasto_oper'] === 1;
        if (in_array('es_concepto_seguro', $cat['extra'], true)) $fila['es_concepto_seguro'] = strtoupper(trim((string) $f['es_concepto_seguro'])) === 'T';
        $filas[] = $fila;
    }
    responder(['ok' => true, 'filas' => $filas, 'tipo' => $tipo, 'extra' => $cat['extra'], 'con_estatus' => $conEstatus]);
}

function concepto(array $cat, $clave): int
{
    $id = (int) bd_valor('AW', "select {$cat['id']} from {$cat['tabla']} where {$cat['id']} = ?", [(int) $clave]);
    if (!$id) error('El concepto ya no existe.', 404);
    return $id;
}

try {
    switch ($accion) {
        case 'listar':
            listar($tipo, $cat);

        case 'guardar':
            $nuevo = !empty($in['nuevo']);
            $desc  = trim(preg_replace('/\s+/u', ' ', (string) ($in['descripcion'] ?? '')));
            $clave = mb_strtoupper(trim((string) ($in['clave_concepto'] ?? '')));
            if ($desc === '' || mb_strlen($desc) > 80) error('Escribe la descripción del concepto (máximo 80 caracteres).');
            if (mb_strlen($clave) > 10) error('La clave puede tener máximo 10 caracteres.');

            $id = $nuevo ? 0 : concepto($cat, $in['clave'] ?? 0);
            if (bd_valor('AW', "select count(*) from {$cat['tabla']} where upper(trim(descripcion)) = ? and {$cat['id']} <> ?", [mb_strtoupper($desc), $id])) {
                error("Ya existe el concepto «{$desc}».");
            }

            $campos = ['descripcion' => $desc, 'clave' => $clave !== '' ? $clave : null];
            if (in_array('calculo_automatico', $cat['extra'], true)) {
                $pct = $in['porcentaje_calculo'] ?? 0;
                if ($pct !== '' && !is_numeric($pct)) error('El porcentaje debe ser un número.');
                $pct = (float) $pct;
                if ($pct < 0 || $pct > 100) error('El porcentaje debe estar entre 0 y 100.');
                $campos['calculo_automatico'] = !empty($in['calculo_automatico']) ? 'True' : 'False';
                $campos['porcentaje_calculo'] = round($pct, $cat['sigla'] === 'GO' ? 4 : 2);
            }
            if (in_array('afecta_gasto_oper', $cat['extra'], true)) $campos['afecta_gasto_oper'] = !empty($in['afecta_gasto_oper']) ? 1 : 0;
            if (in_array('es_concepto_seguro', $cat['extra'], true)) $campos['es_concepto_seguro'] = !empty($in['es_concepto_seguro']) ? 'T' : 'F';

            if ($nuevo) {
                bd_insertar('AW', $cat['tabla'], $cat['id'], $campos);
            } else {
                bd_ejecutar('AW', "update {$cat['tabla']} set " . implode(', ', array_map(fn($k) => "$k = ?", array_keys($campos)))
                    . " where {$cat['id']} = ?", array_merge(array_values($campos), [$id]));
            }
            listar($tipo, $cat);

        case 'activar':
            if (!conceptosConEstatus($tipo)) error('Este catálogo no tiene estatus: corre Consultas/supabase_roles_conceptos.sql en Supabase.');
            $id = concepto($cat, $in['clave'] ?? 0);
            bd_ejecutar('AW', "update {$cat['tabla']} set estatus = case when estatus = 'B' then 'A' else 'B' end where {$cat['id']} = ?", [$id]);
            listar($tipo, $cat);

        case 'eliminar':
            $id = concepto($cat, $in['clave'] ?? 0);
            if (usos($cat, $id)) {
                error('El concepto ya se usa en presupuestos y no se puede eliminar.'
                    . (conceptosConEstatus($tipo) ? ' Usa «Activar / Desactivar» para que ya no aparezca en los presupuestos nuevos.' : ''));
            }
            bd_ejecutar('AW', "delete from {$cat['tabla']} where {$cat['id']} = ?", [$id]);
            listar($tipo, $cat);
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/conceptos: ' . $e->getMessage());
    error('No se pudo completar en AW-Management: ' . bd_mensaje_error($e), 500);
}
