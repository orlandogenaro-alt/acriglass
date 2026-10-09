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

// true si el catálogo tiene la columna estatus (Supabase con supabase_roles_conceptos.sql; AW no la tiene)
function conceptosConEstatus(string $tipo): bool
{
    return bd_tiene_columna('AW', ACRI_CONCEPTOS[$tipo]['tabla'], 'estatus');
}

// Descripciones de cada catálogo para el presupuesto: { mp: [{nombre, activo}], mo: […], go: […] }
function conceptosPresupuesto(): array
{
    $lista = [];
    foreach (ACRI_CONCEPTOS as $tipo => $c) {
        $estatus = conceptosConEstatus($tipo) ? 'estatus' : "'A'";
        $lista[$tipo] = array_map(fn($f) => ['nombre' => $f['descripcion'], 'activo' => strtoupper((string) $f['estatus']) !== 'B'],
            bd_filas('AW', "select descripcion, $estatus as estatus from {$c['tabla']}
                             where descripcion is not null and trim(descripcion) <> '' order by descripcion"));
    }
    return $lista;
}
