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

// Matriz dentro de matriz: un insumo puede tener componentes (una cuadrilla = 1 aluminero + 1 ayudante por jornada;
// un mortero = cemento + arena por m³), y estos a su vez los suyos, hasta PC_NIVELES. Su costo por unidad es la suma
// de sus componentes (cantidad × costo, cada uno con sus propias reglas y su FSR); a él no se le vuelve a aplicar FSR.
// Dentro de un compuesto todo es por unidad del compuesto: no hay costo fijo por concepto ni % de la mano de obra.
const PC_NIVELES = 5;

function pcComponentes(array $i): array
{
    $c = $i['componentes'] ?? [];
    return is_array($c) ? array_values(array_filter($c, 'is_array')) : [];
}

function pcEnCompuesto(array $c): array
{
    $c['base'] = 'unidad';
    return $c;
}

// Costo de una unidad del insumo: base (la mano de obra con su salario base, sin FSR) y real
// (la mano de obra: salario base × FSR + viáticos, alimentación y hospedaje)
function pcCostos(array $i, float $fsrAnalisis = 1, int $nivel = 0): array
{
    $comp = pcComponentes($i);
    if ($comp && $nivel < PC_NIVELES) {
        $r = ['base' => 0.0, 'real' => 0.0];
        foreach ($comp as $c) {
            $q = pcCantidad(pcEnCompuesto($c));
            $k = pcCostos($c, $fsrAnalisis, $nivel + 1);
            $r['base'] += $q * $k['base'];
            $r['real'] += $q * $k['real'];
        }
        return $r;
    }
    $x = pcInsumo($i);
    if ($x['tipo'] !== 'MO') return ['base' => $x['costo'], 'real' => $x['costo']];
    return ['base' => $x['costo'], 'real' => $x['costo'] * pcFsrInsumo($x, $fsrAnalisis) + $x['viaticos'] + $x['alimentacion'] + $x['hospedaje']];
}

function pcCostoReal(array $i, float $fsrAnalisis = 1): float
{
    return pcCostos($i, $fsrAnalisis)['real'];
}

// Componentes de un insumo compuesto por UNA unidad de él: cantidad, costo base y real, e importe de cada uno
function pcDesgloseCompuesto(array $i, float $fsrAnalisis = 1): array
{
    $r = [];
    foreach (pcComponentes($i) as $c) {
        $q = pcCantidad(pcEnCompuesto($c));
        $k = pcCostos($c, $fsrAnalisis, 1);
        $x = pcInsumo($c);
        $r[] = ['tipo' => $x['tipo'], 'cantidad' => $q, 'base' => $k['base'], 'costo' => $k['real'], 'importe' => $q * $k['real'],
                'compuesto' => (bool) pcComponentes($c)] + ($x['tipo'] === 'MO' && !pcComponentes($c) ? ['fsr' => pcFsrInsumo($x, $fsrAnalisis)] : []);
    }
    return $r;
}

// Desglose por UNA unidad del concepto: cada insumo con su cantidad resultante, costo base y real, e importe, y los
// totales por tipo. mo = salario base (sin FSR), moReal = con FSR y viáticos; hm = herramienta menor del análisis.
function pcConcepto(array $c, array $analisis): array
{
    $fsr = pcFsr($analisis);
    $cantConcepto = pcNum($c['cantidad'] ?? 0);
    $t = ['mat' => 0.0, 'mo' => 0.0, 'moReal' => 0.0, 'eq' => 0.0, 'maq' => 0.0, 'her' => 0.0, 'otro' => 0.0, 'hm' => 0.0, 'cd' => 0.0];
    $lista = array_values(array_map(fn($x) => (array) $x, $c['insumos'] ?? []));
    $renglones = [];
    $pctMo = [];
    foreach ($lista as $n => $raw) {
        $i = pcInsumo($raw);
        if ($i['base'] === 'pct_mo') { $pctMo[] = $n; $renglones[$n] = null; continue; }
        $q = pcCantidad($raw, $cantConcepto);
        $k = pcCostos($raw, $fsr);
        $imp = $q * $k['real'];
        if ($i['tipo'] === 'MO') {
            $t['mo'] += $q * $k['base'];
            $t['moReal'] += $imp;
        } else {
            $t[strtolower($i['tipo'])] += $imp;
        }
        $renglones[$n] = ['tipo' => $i['tipo'], 'cantidad' => $q, 'base' => $k['base'], 'costo' => $k['real'], 'importe' => $imp,
                          'compuesto' => (bool) pcComponentes($raw)];
        // FSR de la mano de obra; en una cuadrilla compuesta, el que resulta de sus componentes
        if ($i['tipo'] === 'MO') $renglones[$n]['fsr'] = pcComponentes($raw) ? ($k['base'] > 0 ? $k['real'] / $k['base'] : 1.0) : pcFsrInsumo($i, $fsr);
    }
    // Los porcentajes de la mano de obra van después: su base es la mano de obra real ya sumada
    foreach ($pctMo as $n) {
        $i = pcInsumo($lista[$n]);
        $q = pcCantidad($i, $cantConcepto);
        $imp = $t['moReal'] * $q / 100;
        $t[$i['tipo'] === 'MO' ? 'moReal' : strtolower($i['tipo'])] += $imp;
        $renglones[$n] = ['tipo' => $i['tipo'], 'cantidad' => $q, 'base' => 0.0, 'costo' => 0.0, 'importe' => $imp, 'compuesto' => false];
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

// Explosión de insumos: todo lo que llevan los conceptos (cantidad del concepto × lo que lleva una unidad), sumado por
// tipo + descripción + unidad. Con $desglosar, los compuestos se desarman hasta sus insumos básicos (la cuadrilla en
// aluminero y ayudante); sin él, el compuesto es un renglón. Un % de la mano de obra suma solo su importe (unidad «%»).
// Importe = cantidad × costo real (la mano de obra con su FSR). La herramienta menor del análisis va en totales['hm'].
// Regresa ['insumos' => [{tipo, codigo, descripcion, unidad, cantidad, importe}] (por tipo y descripción), 'totales' => [tipo…, hm, total]]
function pcExplosion(array $analisis, bool $desglosar = true): array
{
    $fsr = pcFsr($analisis);
    $grupos = [];
    $tot = array_fill_keys(PC_TIPOS, 0.0) + ['hm' => 0.0];
    $sumar = function (array $i, string $unidad, float $cant, float $imp) use (&$grupos, &$tot) {
        $x = pcInsumo($i);
        $desc = trim((string) ($i['descripcion'] ?? ''));
        $k = $x['tipo'] . '|' . mb_strtoupper($desc) . '|' . mb_strtoupper($unidad);
        if (!isset($grupos[$k])) $grupos[$k] = ['tipo' => $x['tipo'], 'codigo' => '', 'descripcion' => $desc, 'unidad' => $unidad, 'cantidad' => 0.0, 'importe' => 0.0];
        if ($grupos[$k]['codigo'] === '') $grupos[$k]['codigo'] = trim((string) ($i['codigo'] ?? ''));
        $grupos[$k]['cantidad'] += $cant;
        $grupos[$k]['importe'] += $imp;
        $tot[$x['tipo']] += $imp;
    };
    $hojas = function (array $i, float $cant, int $nivel) use (&$hojas, $sumar, $fsr, $desglosar) {
        if ($cant <= 0) return;
        if ($desglosar && $nivel < PC_NIVELES && pcComponentes($i)) {
            foreach (pcComponentes($i) as $c) $hojas($c, $cant * pcCantidad(pcEnCompuesto($c)), $nivel + 1);
            return;
        }
        $sumar($i, trim((string) ($i['unidad'] ?? '')), $cant, $cant * pcCostoReal($i, $fsr));
    };
    foreach ($analisis['conceptos'] ?? [] as $c) {
        $cc = pcNum($c['cantidad'] ?? 0);
        if ($cc <= 0) continue;
        $d = pcConcepto($c, $analisis);
        foreach (array_values($c['insumos'] ?? []) as $n => $i) {
            $i = (array) $i;
            if (($i['base'] ?? '') === 'pct_mo') {
                if ($d['insumos'][$n]['importe'] > 0) $sumar($i, '%', 0.0, $cc * $d['insumos'][$n]['importe']);
                continue;
            }
            $hojas($i, $cc * $d['insumos'][$n]['cantidad'], 0);
        }
        $tot['hm'] += $cc * $d['totales']['hm'];
    }
    $lista = array_values($grupos);
    usort($lista, fn($a, $b) => [array_search($a['tipo'], PC_TIPOS), $a['descripcion']] <=> [array_search($b['tipo'], PC_TIPOS), $b['descripcion']]);
    $tot['total'] = array_sum($tot);
    return ['insumos' => $lista, 'totales' => $tot];
}

// % de financiamiento estimado (sugerencia en la ventana Sobrecosto; el % que se usa es el que se captura):
//   el costo del dinero durante la obra = tasa de interés anual × plazo en meses / 12, sobre la parte que no cubre el anticipo
//   12 % anual, 6 meses, 30 % de anticipo → 12 × 6 / 12 × (1 − 0.30) = 4.20 %
function pcFinanciamientoEstimado(float $tasaAnualPct, float $plazoMeses, float $anticipoPct): float
{
    return max(0, $tasaAnualPct) * max(0, $plazoMeses) / 12 * (1 - min(max($anticipoPct, 0), 100) / 100);
}
