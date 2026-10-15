<?php
// Parámetros del presupuesto de obra (Administrador › Parámetros de presupuesto). Se guardan como la
// configuración: tabla configuracion (Supabase) o config/parametros_presupuesto.json.
//
//   utilidad_modo / utilidad_pct   forma y % de utilidad con que nace un presupuesto nuevo
//                                  (sin % propio se usa el parámetro de costos 101, como antes)
//   indirectos_modo                ninguno · unico · oficina_campo
//   indirecto_pct, indirecto_oficina_pct, indirecto_campo_pct
//                                  se aplican como conceptos de Gastos de Operación de cálculo automático
//                                  sobre el costo directo (Materia Prima + Mano de Obra): así no se cuentan dos veces
//   financiamiento_pct             % de financiamiento con que nace el Análisis P.U.
//   iva_tasas / iva_defecto        tasas que se pueden elegir en el presupuesto y la de uno nuevo
require_once __DIR__ . '/bd.php';

const ACRI_PRES_INDIRECTOS = [
    'unico'         => ['indirecto_pct' => 'INDIRECTOS'],
    'oficina_campo' => ['indirecto_oficina_pct' => 'INDIRECTOS DE OFICINA', 'indirecto_campo_pct' => 'INDIRECTOS DE CAMPO'],
];

function parametrosPresupuestoDefecto(): array
{
    return [
        'utilidad_modo' => 'costo', 'utilidad_pct' => null,
        'indirectos_modo' => 'ninguno', 'indirecto_pct' => 0, 'indirecto_oficina_pct' => 0, 'indirecto_campo_pct' => 0,
        'financiamiento_pct' => 0,
        'iva_tasas' => [['nombre' => 'IVA 16 %', 'pct' => 16], ['nombre' => 'IVA frontera 8 %', 'pct' => 8], ['nombre' => 'Exento', 'pct' => 0]],
        'iva_defecto' => 16,
    ];
}

function parametrosPresupuesto(): array
{
    $p = configLeer('parametros_presupuesto') + parametrosPresupuestoDefecto();
    if (!is_array($p['iva_tasas']) || !$p['iva_tasas']) $p['iva_tasas'] = parametrosPresupuestoDefecto()['iva_tasas'];
    return $p;
}

// Nombres de los conceptos de Gastos de Operación que son indirectos (para calcularlos sobre el costo directo)
function parametrosIndirectosNombres(): array
{
    return array_merge(...array_values(array_map('array_values', ACRI_PRES_INDIRECTOS)));
}

// Los conceptos de indirectos del modo elegido, con su %: ['INDIRECTOS DE OFICINA' => 8.5, …]
function parametrosIndirectosActivos(array $p): array
{
    $r = [];
    foreach (ACRI_PRES_INDIRECTOS[$p['indirectos_modo']] ?? [] as $campo => $nombre) $r[$nombre] = (float) $p[$campo];
    return $r;
}

// true si la tasa de IVA (en %) es una de las configuradas
function parametrosIvaValida(float $pct, array $p): bool
{
    foreach ($p['iva_tasas'] as $t) if (abs((float) $t['pct'] - $pct) < 0.0001) return true;
    return false;
}

function parametrosPresupuestoGuardar(array $d): array
{
    $pct = function ($v, string $que, float $max = 100) {
        if ($v === '' || $v === null) return 0.0;
        if (!is_numeric($v) || (float) $v < 0 || (float) $v >= $max) error("$que debe ser de 0 a " . ($max - 0.01) . ' %.');
        return round((float) $v, 4);
    };
    $p = parametrosPresupuestoDefecto();
    $p['utilidad_modo'] = ($d['utilidad_modo'] ?? '') === 'margen' ? 'margen' : 'costo';
    $p['utilidad_pct'] = trim((string) ($d['utilidad_pct'] ?? '')) === '' ? null
        : $pct($d['utilidad_pct'], 'La utilidad', $p['utilidad_modo'] === 'margen' ? 100 : 1000.01);
    $p['indirectos_modo'] = in_array($d['indirectos_modo'] ?? '', ['unico', 'oficina_campo'], true) ? $d['indirectos_modo'] : 'ninguno';
    $p['indirecto_pct'] = $pct($d['indirecto_pct'] ?? 0, 'El indirecto');
    $p['indirecto_oficina_pct'] = $pct($d['indirecto_oficina_pct'] ?? 0, 'El indirecto de oficina');
    $p['indirecto_campo_pct'] = $pct($d['indirecto_campo_pct'] ?? 0, 'El indirecto de campo');
    $p['financiamiento_pct'] = $pct($d['financiamiento_pct'] ?? 0, 'El financiamiento');

    $tasas = [];
    foreach ((array) ($d['iva_tasas'] ?? []) as $t) {
        $nombre = trim((string) ($t['nombre'] ?? ''));
        if ($nombre === '' && ($t['pct'] ?? '') === '') continue;
        if ($nombre === '') error('Hay una tasa de IVA sin nombre.');
        $v = $pct($t['pct'] ?? '', "La tasa «{$nombre}»");
        foreach ($tasas as $x) if (abs($x['pct'] - $v) < 0.0001) error("La tasa de {$v} % está repetida.");
        $tasas[] = ['nombre' => mb_substr($nombre, 0, 40), 'pct' => $v];
    }
    if (!$tasas) error('Captura al menos una tasa de IVA.');
    $p['iva_tasas'] = $tasas;
    $p['iva_defecto'] = round((float) ($d['iva_defecto'] ?? $tasas[0]['pct']), 4);
    if (!parametrosIvaValida($p['iva_defecto'], $p)) $p['iva_defecto'] = $tasas[0]['pct'];

    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        parametrosSincronizarIndirectos($p);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    configGuardar('parametros_presupuesto', $p);
    return $p;
}

// Conceptos de indirectos en el catálogo de Gastos de Operación: los del modo elegido quedan de cálculo automático
// con su %; los otros dejan de calcularse solos (no se borran: los presupuestos guardados los usan).
function parametrosSincronizarIndirectos(array $p): void
{
    $activos = parametrosIndirectosActivos($p);
    $conEstatus = bd_tiene_columna('AW', 'conceptos_gas_operacion_obra', 'estatus');
    foreach (parametrosIndirectosNombres() as $nombre) {
        $id = (int) bd_valor('AW', 'select min(concepto_gas_operacion_obra_id) from conceptos_gas_operacion_obra where upper(trim(descripcion)) = ?', [$nombre]);
        $usar = isset($activos[$nombre]);
        $campos = ['calculo_automatico' => $usar ? 'True' : 'False', 'porcentaje_calculo' => $usar ? $activos[$nombre] : 0];
        if ($conEstatus) $campos['estatus'] = $usar ? 'A' : 'B';
        if ($id) {
            bd_ejecutar('AW', 'update conceptos_gas_operacion_obra set ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($campos)))
                . ' where concepto_gas_operacion_obra_id = ?', array_merge(array_values($campos), [$id]));
        } elseif ($usar) {
            bd_insertar('AW', 'conceptos_gas_operacion_obra', 'concepto_gas_operacion_obra_id',
                ['descripcion' => $nombre, 'es_concepto_seguro' => 'F'] + $campos);
        }
    }
}
