<?php
// Catálogos de conceptos del Presupuesto de Obra (mismas tablas en AW-Management y en Supabase).
// Se administran en Administrador › Conceptos de … y salen desglosados en las secciones
// Materia Prima / Mano de Obra / Gastos de Operacion del presupuesto.
require_once __DIR__ . '/bd.php';

// tipo => tabla, columna id, sigla de doctos_sugerido_obra_det.tipo_concepto, título y campos extra de la tabla
const ACRI_CONCEPTOS = [
    'mp' => [
        'tabla' => 'conceptos_mat_prima_obra', 'id' => 'concepto_mat_prima_id', 'sigla' => 'MP',
        'titulo' => 'Conceptos de Materia Prima',
        'extra' => ['calculo_automatico', 'porcentaje_calculo', 'afecta_gasto_oper'],
    ],
    'mo' => [
        'tabla' => 'conceptos_mano_obra', 'id' => 'concepto_mano_obra_id', 'sigla' => 'MO',
        'titulo' => 'Conceptos de Mano de Obra',
        'extra' => [],
    ],
    'go' => [
        'tabla' => 'conceptos_gas_operacion_obra', 'id' => 'concepto_gas_operacion_obra_id', 'sigla' => 'GO',
        'titulo' => 'Conceptos de Gastos de Operacion',
        'extra' => ['calculo_automatico', 'porcentaje_calculo', 'es_concepto_seguro'],
    ],
];

// Conceptos con id fijo en el Form46 de AW. En Supabase los ids son otros: se buscan por descripción.
//   mano_obra:  renglón de MO con el total de los empleados × días (3580843)
//   comisiones: renglón de MO con el total de comisiones (3580844)
//   base_mp:    gastos de operación que se calculan sobre la materia prima + mano de obra, no sobre el subtotal
const ACRI_CONCEPTOS_FIJOS = [
    'mano_obra'  => ['tipo' => 'mo', 'ids' => [3580843], 'descripcion' => 'MANO DE OBRA INTERNA'],
    'comisiones' => ['tipo' => 'mo', 'ids' => [3580844], 'descripcion' => 'COMISIONES'],
    'base_mp'    => ['tipo' => 'go', 'ids' => [3592620, 4051235, 4186327], 'descripcion' => 'GASTOS DE OPERACI%'],
];

// true si el catálogo tiene la columna estatus (Supabase con supabase_roles_conceptos.sql; AW no la tiene)
function conceptosConEstatus(string $tipo): bool
{
    return bd_tiene_columna('AW', ACRI_CONCEPTOS[$tipo]['tabla'], 'estatus');
}

// Ids de un concepto fijo: los de AW si existen; si no, los que coinciden con la descripción
function conceptosFijosIds(string $clave): array
{
    $f = ACRI_CONCEPTOS_FIJOS[$clave];
    $c = ACRI_CONCEPTOS[$f['tipo']];
    $marcas = implode(', ', array_fill(0, count($f['ids']), '?'));
    $ids = array_map('intval', array_column(bd_filas('AW', "select {$c['id']} as id from {$c['tabla']} where {$c['id']} in ($marcas)", $f['ids']), 'id'));
    if ($ids) return $ids;
    return array_map('intval', array_column(bd_filas('AW',
        "select {$c['id']} as id from {$c['tabla']} where upper(trim(descripcion)) like ? order by {$c['id']}", [$f['descripcion']]), 'id'));
}

// Catálogos para el presupuesto: { mp: [{nombre, activo, auto, pct, …}], mo: […], go: […] }
//   auto/pct: cálculo automático (porcentaje del subtotal, o de la base de MP si base_mp)
//   afecta:   MP, multiplicador del importe en la base de los gastos base_mp
//   base:     MO, el importe entra a la base de los gastos base_mp (todos menos las comisiones)
//   seguro:   GO, aparece en el Anexo de seguro
function conceptosPresupuesto(): array
{
    $fijos = array_map('conceptosFijosIds', array_combine(array_keys(ACRI_CONCEPTOS_FIJOS), array_keys(ACRI_CONCEPTOS_FIJOS)));
    $lista = [];
    foreach (ACRI_CONCEPTOS as $tipo => $c) {
        $estatus = conceptosConEstatus($tipo) ? 'estatus' : "'A'";
        $extra = implode('', array_map(fn($x) => ", $x", $c['extra']));
        $lista[$tipo] = array_map(function ($f) use ($tipo, $fijos) {
            $id = (int) $f['id'];
            $o = ['id' => $id, 'nombre' => $f['descripcion'], 'activo' => strtoupper((string) $f['estatus']) !== 'B'];
            if (array_key_exists('calculo_automatico', $f)) {
                $o['auto'] = strcasecmp(trim((string) $f['calculo_automatico']), 'True') === 0;
                $o['pct'] = (float) $f['porcentaje_calculo'];
            }
            if ($tipo === 'mp') $o['afecta'] = (float) $f['afecta_gasto_oper'];
            if ($tipo === 'mo') $o['base'] = !in_array($id, $fijos['comisiones'], true);
            if ($tipo === 'go') {
                $o['seguro'] = strtoupper(trim((string) $f['es_concepto_seguro'])) === 'T';
                $o['base_mp'] = in_array($id, $fijos['base_mp'], true);
            }
            return $o;
        }, bd_filas('AW', "select {$c['id']} as id, descripcion, $estatus as estatus$extra from {$c['tabla']}
                            where descripcion is not null and trim(descripcion) <> '' order by descripcion"));
    }
    return $lista;
}

// Nombres de los renglones fijos de Mano de Obra: { mano_obra: 'MANO DE OBRA INTERNA', comisiones: 'COMISIONES' }
function conceptosFijosNombres(array $catalogo): array
{
    $r = [];
    foreach (['mano_obra', 'comisiones'] as $clave) {
        $ids = conceptosFijosIds($clave);
        $nombre = null;
        foreach ($catalogo['mo'] ?? [] as $c) if (in_array($c['id'], $ids, true)) { $nombre = $c['nombre']; break; }
        $r[$clave] = $nombre ?? ACRI_CONCEPTOS_FIJOS[$clave]['descripcion'];
    }
    return $r;
}
