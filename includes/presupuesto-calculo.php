<?php
// Motor de cálculo del Análisis de Precios Unitarios del presupuesto (como Neodata), en un solo lugar.
// Funciones puras, sin base de datos: las usan el servidor (api/presupuestos.php ?accion=calcular, explosión)
// y las pruebas. js/presupuesto-calculo.js es su gemelo para la vista previa en vivo de la pantalla; los dos
// se prueban con los mismos casos (pruebas/presupuesto-calculo.json), así que dan exactamente lo mismo.
//
// Insumo de la matriz (lo que lleva UNA unidad del concepto):
//   tipo          MAT material · MO mano de obra · EQ equipo · MAQ maquinaria · HER herramienta · OTRO flete / servicio
//   tipo_calculo  'cantidad'    (A) cantidad directa: 3.30 m² de vidrio por cancel
//                 'rendimiento' (B) unidades del concepto por unidad del insumo: 3 canceles por jornada → 1/3 jornada
//                 Sin capturar: 'rendimiento' si es mano de obra con rinde > 0 (como siempre), si no 'cantidad'.
//   base          'unidad' (por unidad del concepto) · 'fijo' (para todo el concepto: se reparte entre su cantidad)
//                 · 'pct_mo' (cantidad = % sobre la mano de obra real del concepto; p. ej. herramienta 3 %)
//   cantidad, rinde, factor (1), merma_pct (0), costo
//   Mano de obra: costo = salario base por jornada; fsr del insumo (0 = el FSR del análisis);
//                 viaticos, alimentacion, hospedaje por jornada (se suman al salario real, sin FSR)
//
//   cantidad resultante = (cantidad | 1 / rinde) [÷ cantidad del concepto si es fijo] × factor × (1 + merma / 100)
//   costo real          = costo; en mano de obra: costo × FSR + viáticos + alimentación + hospedaje
//   importe por unidad  = cantidad resultante × costo real;  pct_mo: % × mano de obra real del concepto
//
// Costo directo por unidad = materiales + mano de obra real + equipo + maquinaria + herramienta + otros
//                            + herramienta menor (% del análisis sobre la mano de obra real)
// Sin los campos nuevos da exactamente lo mismo que antes (MAT / MO / EQ, cantidad o rinde de la mano de obra).

const PC_TIPOS = ['MAT', 'MO', 'EQ', 'MAQ', 'HER', 'OTRO'];

function pcNum($v): float
{
    return is_numeric($v) ? (float) $v : 0.0;
}

function pcFsr(array $analisis): float
{
    $fsr = pcNum($analisis['fsr'] ?? 1);
    return $fsr > 0 ? $fsr : 1.0;
}

// Insumo con todos sus campos (los que faltan con su valor por omisión)
function pcInsumo(array $i): array
{
    $tipo = in_array($i['tipo'] ?? '', PC_TIPOS, true) ? $i['tipo'] : 'MAT';
    $rinde = max(0, pcNum($i['rinde'] ?? 0));
    $tc = $i['tipo_calculo'] ?? '';
    if (!in_array($tc, ['cantidad', 'rendimiento'], true)) $tc = $tipo === 'MO' && $rinde > 0 ? 'rendimiento' : 'cantidad';
    $base = in_array($i['base'] ?? '', ['unidad', 'fijo', 'pct_mo'], true) ? $i['base'] : 'unidad';
    $factor = isset($i['factor']) && $i['factor'] !== '' && $i['factor'] !== null ? max(0, pcNum($i['factor'])) : 1.0;
    return [
        'tipo' => $tipo, 'tipo_calculo' => $tc, 'base' => $base,
        'cantidad' => max(0, pcNum($i['cantidad'] ?? 0)), 'rinde' => $rinde, 'factor' => $factor,
        'merma_pct' => max(0, pcNum($i['merma_pct'] ?? 0)), 'costo' => max(0, pcNum($i['costo'] ?? 0)),
        'fsr' => max(0, pcNum($i['fsr'] ?? 0)),
        'viaticos' => max(0, pcNum($i['viaticos'] ?? 0)), 'alimentacion' => max(0, pcNum($i['alimentacion'] ?? 0)),
        'hospedaje' => max(0, pcNum($i['hospedaje'] ?? 0)),
    ];
}

// Cantidad del insumo por UNA unidad del concepto (en pct_mo es el %)
function pcCantidad(array $i, float $cantConcepto = 0): float
{
    $i = pcInsumo($i);
    $q = $i['tipo_calculo'] === 'rendimiento' ? ($i['rinde'] > 0 ? 1 / $i['rinde'] : 0.0) : $i['cantidad'];
    if ($i['base'] === 'pct_mo') return $q;
    if ($i['base'] === 'fijo' && $cantConcepto > 0) $q /= $cantConcepto;
    return $q * $i['factor'] * (1 + $i['merma_pct'] / 100);
}

// FSR que se aplica a una mano de obra: el suyo (de un FASAR o capturado) o, sin él, el del análisis
function pcFsrInsumo(array $i, float $fsrAnalisis = 1): float
{
    $i = pcInsumo($i);
    return $i['fsr'] > 0 ? $i['fsr'] : ($fsrAnalisis > 0 ? $fsrAnalisis : 1.0);
}

// Costo real de una unidad del insumo (la mano de obra: salario base × FSR + viáticos, alimentación y hospedaje)
function pcCostoReal(array $i, float $fsrAnalisis = 1): float
{
    $i = pcInsumo($i);
    if ($i['tipo'] !== 'MO') return $i['costo'];
    return $i['costo'] * pcFsrInsumo($i, $fsrAnalisis) + $i['viaticos'] + $i['alimentacion'] + $i['hospedaje'];
}

// Desglose por UNA unidad del concepto: cada insumo con su cantidad resultante, costo real e importe, y los totales
// por tipo. mo = salario base (sin FSR), moReal = con FSR y viáticos; hm = herramienta menor del análisis.
function pcConcepto(array $c, array $analisis): array
{
    $fsr = pcFsr($analisis);
    $cantConcepto = pcNum($c['cantidad'] ?? 0);
    $t = ['mat' => 0.0, 'mo' => 0.0, 'moReal' => 0.0, 'eq' => 0.0, 'maq' => 0.0, 'her' => 0.0, 'otro' => 0.0, 'hm' => 0.0, 'cd' => 0.0];
    $renglones = [];
    $pctMo = [];
    foreach (array_values($c['insumos'] ?? []) as $n => $raw) {
        $i = pcInsumo((array) $raw);
        if ($i['base'] === 'pct_mo') { $pctMo[] = $n; $renglones[$n] = null; continue; }
        $q = pcCantidad($i, $cantConcepto);
        $costo = pcCostoReal($i, $fsr);
        $imp = $q * $costo;
        if ($i['tipo'] === 'MO') {
            $t['mo'] += $q * $i['costo'];
            $t['moReal'] += $imp;
        } else {
            $t[strtolower($i['tipo'])] += $imp;
        }
        $renglones[$n] = ['tipo' => $i['tipo'], 'cantidad' => $q, 'costo' => $costo, 'importe' => $imp];
        if ($i['tipo'] === 'MO') $renglones[$n]['fsr'] = pcFsrInsumo($i, $fsr);
    }
    // Los porcentajes de la mano de obra van después: su base es la mano de obra real ya sumada
    foreach ($pctMo as $n) {
        $i = pcInsumo((array) $c['insumos'][$n]);
        $imp = $t['moReal'] * pcCantidad($i, $cantConcepto) / 100;
        $t[$i['tipo'] === 'MO' ? 'moReal' : strtolower($i['tipo'])] += $imp;
        $renglones[$n] = ['tipo' => $i['tipo'], 'cantidad' => pcCantidad($i, $cantConcepto), 'costo' => 0.0, 'importe' => $imp];
    }
    ksort($renglones);
    $t['hm'] = $t['moReal'] * pcNum($analisis['hm'] ?? 0) / 100;
    $t['cd'] = $t['mat'] + $t['moReal'] + $t['eq'] + $t['maq'] + $t['her'] + $t['otro'] + $t['hm'];
    return ['insumos' => array_values($renglones), 'totales' => $t];
}

// Resumen del análisis del concepto como Neodata: materiales, mano de obra, maquinaria / equipo, gastos de operación
// (herramienta + herramienta menor) y otros (fletes, servicios), sumando el costo directo
function pcResumen(array $totales): array
{
    return [
        'materiales'         => $totales['mat'],
        'mano_obra'          => $totales['moReal'],
        'maquinaria_equipo'  => $totales['eq'] + $totales['maq'],
        'gastos_operacion'   => $totales['her'] + $totales['hm'],
        'otros'              => $totales['otro'],
        'costo_directo'      => $totales['cd'],
    ];
}

// Sobrecosto en cascada sobre el costo directo (como Neodata):
//   Financiamiento = (CD + Ind) × %fin
//   Utilidad       = (CD + Ind + Fin) × %util, con el % equivalente a la Utilidad Neta del presupuesto
//                    (con FSR 1, sin herramienta ni financiamiento da el mismo subtotal que el Form46)
//   Cargos         = % del precio de venta (comisiones y anexo de seguro, que el Form46 cobra sobre el subtotal)
//   Precio         = (CD + Ind + Fin + Util) / (1 − cargos);  factor de sobrecosto = Precio / CD
// $ind en pesos; $finPct y $utilDocPct en %; $ca en fracción (0.05 = 5 %); $modo 'costo' o 'margen'
function pcSobrecosto(float $cd, float $ind, float $finPct, float $utilDocPct, string $modo, float $ca): array
{
    $ca = min(max($ca, 0), 0.99);
    $fin = ($cd + $ind) * $finPct / 100;
    $m = $utilDocPct / 100;
    if ($modo === 'costo') $utilPct = 1 - $ca * (1 + $m) > 0 ? ((1 + $m) * (1 - $ca) / (1 - $ca * (1 + $m)) - 1) * 100 : 0.0;
    else $utilPct = 1 - $m - $ca > 0 ? $m / (1 - $m - $ca) * 100 : 0.0;
    $util = ($cd + $ind + $fin) * $utilPct / 100;
    $pv = ($cd + $ind + $fin + $util) / (1 - $ca);
    return ['cd' => $cd, 'ind' => $ind, 'fin' => $fin, 'util_pct' => $utilPct, 'util' => $util, 'ca' => $ca,
            'cargos' => $pv * $ca, 'pv' => $pv, 'factor' => $cd > 0 ? $pv / $cd : 0.0];
}

// Precio unitario de un concepto con el sobrecosto de la obra: cada cargo (indirectos, financiamiento, utilidad y
// cargos adicionales) en la misma proporción que tiene sobre el costo directo de la obra, así que
// P.U. = CD del concepto × factor de sobrecosto. $s: el resultado de pcSobrecosto (cd, ind, fin, util, cargos, pv)
function pcPrecioConcepto(float $cdU, array $s): array
{
    $k = (float) ($s['cd'] ?? 0) > 0 ? $cdU / (float) $s['cd'] : 0.0;
    return ['cd' => $cdU, 'ind' => (float) $s['ind'] * $k, 'fin' => (float) $s['fin'] * $k, 'util' => (float) $s['util'] * $k,
            'cargos' => (float) $s['cargos'] * $k, 'pu' => (float) $s['pv'] * $k];
}

// Gasto de Operación del presupuesto calculado (pestaña Gastos de Operación):
//   base 'unidad', 'hora' o 'jornada': cantidad × costo (p. ej. 3 jornadas de plataforma × $1,200)
//   base 'pct_mo': % × mano de obra del presupuesto (p. ej. herramienta 3 % de la mano de obra)
//   sin base: importe fijo, se captura (como siempre); regresa null
// $g: ['base', 'cantidad', 'costo', 'pct']; $manoObra: total de Mano de Obra sin comisiones
const PC_GASTO_BASES = ['unidad', 'hora', 'jornada', 'pct_mo'];

function pcGastoOperacion(array $g, float $manoObra): ?float
{
    $base = in_array($g['base'] ?? '', PC_GASTO_BASES, true) ? $g['base'] : '';
    if ($base === '') return null;
    if ($base === 'pct_mo') return $manoObra * max(0, pcNum($g['pct'] ?? 0)) / 100;
    return max(0, pcNum($g['cantidad'] ?? 0)) * max(0, pcNum($g['costo'] ?? 0));
}
