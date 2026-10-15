<?php
// Catálogo de conceptos del contrato y estimaciones (migraciones/011). Las funciones estimacion* son puras
// (pruebas/estimaciones.php).
//
// Catálogo del contrato: cada concepto analizado toma su costo directo unitario igual que el Análisis P.U.
// del presupuesto (materiales + equipo + mano de obra × FSR × (1 + % herramienta menor)); los renglones de
// Materia Prima / Mano de Obra capturados por importe (sin análisis) entran como un lote. El precio unitario es
//     P.U. = costo directo unitario × factor,   factor = monto del contrato ÷ costo directo total
// para que la suma de los conceptos dé el monto contratado (un descuento negociado se reparte en proporción).
//
// Estimación (importes sin IVA salvo el IVA y el neto):
//     amortización   = importe × % anticipo        (sin pasar de lo que falta por amortizar)
//     subtotal       = importe − amortización
//     IVA            = subtotal × % IVA
//     fondo garantía = importe × % fondo · retención = importe × % retención
//     neto a cobrar  = subtotal + IVA − fondo de garantía − retención
// Un anticipo es una estimación sin conceptos: su importe es el anticipo del contrato y no lleva deducciones.

const ESTIMACION_FIJOS = ['MATERIALES SEGUN ANALISIS P.U.', 'MANO DE OBRA SEGUN ANALISIS P.U.'];

// $analisis: JSON del Análisis P.U. · $renglones: [['tipo' => MP|MO|GO, 'concepto' => nombre, 'presupuesto' => importe]]
// $fijos: ['comisiones' => nombre, 'mano_obra' => nombre] · $conEmpleados: el presupuesto tenía empleados (su FSR va en la MO interna)
function estimacionCatalogo(array $analisis, array $renglones, array $fijos, bool $conEmpleados, float $montoContrato): array
{
    $fsr = (float) ($analisis['fsr'] ?? 1) > 0 ? (float) $analisis['fsr'] : 1.0;
    $hm = (float) ($analisis['hm'] ?? 0) / 100;
    $clave = fn($s) => mb_strtoupper(trim((string) $s));
    $lista = [];
    foreach ($analisis['conceptos'] ?? [] as $i => $c) {
        $cant = (float) ($c['cantidad'] ?? 0);
        if ($cant <= 0) continue;
        $u = ['MAT' => 0.0, 'MO' => 0.0, 'EQ' => 0.0];
        foreach ($c['insumos'] ?? [] as $x) {
            $tipo = in_array($x['tipo'] ?? '', ['MAT', 'MO', 'EQ'], true) ? $x['tipo'] : 'MAT';
            $q = $tipo === 'MO' && (float) ($x['rinde'] ?? 0) > 0 ? 1 / (float) $x['rinde'] : (float) ($x['cantidad'] ?? 0);
            $u[$tipo] += $q * (float) ($x['costo'] ?? 0);
        }
        $cd = $u['MAT'] + $u['EQ'] + $u['MO'] * $fsr * (1 + $hm);
        $lista[] = ['clave' => (string) ($c['clave'] ?? ''), 'partida' => (string) ($c['partida'] ?? ''), 'descripcion' => (string) ($c['descripcion'] ?? ''),
                    'unidad' => (string) ($c['unidad'] ?? ''), 'cantidad' => $cant, 'cd_unitario' => $cd, 'origen' => 'analisis'];
    }
    $n = 0;
    foreach ($renglones as $r) {
        $tipo = strtoupper(trim((string) $r['tipo']));
        $k = $clave($r['concepto']);
        $base = (float) $r['presupuesto'];
        if (!in_array($tipo, ['MP', 'MO'], true) || in_array($k, ESTIMACION_FIJOS, true) || (!$k && !$base)) continue;
        if ($tipo === 'MO' && $k === $clave($fijos['comisiones'] ?? 'COMISIONES')) continue;   // cargo adicional, va en el factor
        $cd = $base;
        if ($tipo === 'MO') {
            $ajuste = $conEmpleados && $k === $clave($fijos['mano_obra'] ?? 'MANO DE OBRA INTERNA') ? $base * ($fsr - 1) : 0;
            $cd = ($base + $ajuste) * (1 + $hm);
        }
        if ($cd <= 0) continue;
        $lista[] = ['clave' => $tipo . '-' . str_pad((string) ++$n, 3, '0', STR_PAD_LEFT), 'partida' => $tipo === 'MP' ? 'Materia Prima' : 'Mano de Obra',
                    'descripcion' => (string) $r['concepto'], 'unidad' => 'Lote', 'cantidad' => 1.0, 'cd_unitario' => $cd, 'origen' => 'importe'];
    }
    $cdTotal = array_sum(array_map(fn($x) => $x['cd_unitario'] * $x['cantidad'], $lista));
    $factor = $cdTotal > 0 ? $montoContrato / $cdTotal : 0.0;
    $suma = 0.0;
    foreach ($lista as &$x) {
        $x['pu'] = round($x['cd_unitario'] * $factor, 2);
        $x['importe'] = round($x['pu'] * $x['cantidad'], 2);
        $x['cd_unitario'] = round($x['cd_unitario'], 6);
        $suma += $x['importe'];
    }
    unset($x);
    return ['conceptos' => $lista, 'factor' => round($factor, 6), 'cd_total' => round($cdTotal, 2), 'suma' => round($suma, 2),
            'diferencia' => round($montoContrato - $suma, 2)];
}

// Totales de una estimación. $c: iva_pct, anticipo_pct, fondo_garantia_pct, retencion_pct del contrato.
// $anticipoPendiente: anticipo cobrado que falta por amortizar (con las estimaciones anteriores).
function estimacionTotales(float $importe, array $c, float $anticipoPendiente, bool $esAnticipo = false): array
{
    $importe = round($importe, 2);
    $amort = $esAnticipo ? 0.0 : round(min($importe * (float) $c['anticipo_pct'] / 100, max(0, $anticipoPendiente)), 2);
    $subtotal = round($importe - $amort, 2);
    $iva = round($subtotal * (float) $c['iva_pct'] / 100, 2);
    $fondo = $esAnticipo ? 0.0 : round($importe * (float) $c['fondo_garantia_pct'] / 100, 2);
    $ret = $esAnticipo ? 0.0 : round($importe * (float) $c['retencion_pct'] / 100, 2);
    return ['importe' => $importe, 'amortizacion' => $amort, 'subtotal' => $subtotal, 'iva' => $iva, 'total' => round($subtotal + $iva, 2),
            'fondo_garantia' => $fondo, 'retencion' => $ret, 'neto' => round($subtotal + $iva - $fondo - $ret, 2)];
}
