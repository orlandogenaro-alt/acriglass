<?php
// Contrato de obra y convenios (migraciones/009) y libro de movimientos de la obra (migraciones/003).
// Las funciones contrato* son puras (pruebas/contratos.php); libroAjustar escribe en la base.
require_once __DIR__ . '/bd.php';

const CONTRATO_TIPOS_CONVENIO = ['aditiva' => 'Aditiva', 'deductiva' => 'Deductiva', 'orden_cambio' => 'Orden de cambio', 'plazo' => 'Ampliación de plazo'];

// Monto con el signo que corresponde al tipo: aditiva suma, deductiva resta, plazo no mueve dinero,
// orden de cambio con el signo capturado
function contratoMontoConvenio(string $tipo, float $monto): float
{
    switch ($tipo) {
        case 'aditiva':   return round(abs($monto), 2);
        case 'deductiva': return round(-abs($monto), 2);
        case 'plazo':     return 0.0;
        default:          return round($monto, 2);
    }
}

// Cifras vigentes del contrato: solo cuentan los convenios autorizados.
// $contrato: monto, iva_pct, anticipo_pct, fondo_garantia_pct, retencion_pct, fecha_termino · $convenios: [tipo, monto, dias, estatus]
function contratoVigente(array $contrato, array $convenios): array
{
    $r = ['original' => round((float) $contrato['monto'], 2), 'aditivas' => 0.0, 'deductivas' => 0.0, 'ordenes_cambio' => 0.0,
          'dias' => 0, 'pendientes' => 0, 'pendiente_monto' => 0.0];
    foreach ($convenios as $c) {
        $estatus = trim((string) ($c['estatus'] ?? ''));
        $monto = contratoMontoConvenio((string) $c['tipo'], (float) $c['monto']);
        if ($estatus === 'pendiente') { $r['pendientes']++; $r['pendiente_monto'] += $monto; continue; }
        if ($estatus !== 'autorizado') continue;
        if ($c['tipo'] === 'aditiva') $r['aditivas'] += $monto;
        elseif ($c['tipo'] === 'deductiva') $r['deductivas'] += $monto;
        elseif ($c['tipo'] === 'orden_cambio') $r['ordenes_cambio'] += $monto;
        $r['dias'] += (int) ($c['dias'] ?? 0);
    }
    $r['monto'] = round($r['original'] + $r['aditivas'] + $r['deductivas'] + $r['ordenes_cambio'], 2);
    $r['iva'] = round($r['monto'] * (float) $contrato['iva_pct'] / 100, 2);
    $r['total'] = round($r['monto'] + $r['iva'], 2);
    $r['anticipo'] = round($r['monto'] * (float) $contrato['anticipo_pct'] / 100, 2);
    $r['fondo_garantia_pct'] = (float) $contrato['fondo_garantia_pct'];
    $r['retencion_pct'] = (float) $contrato['retencion_pct'];
    $r['fecha_termino'] = null;
    if (!empty($contrato['fecha_termino'])) {
        $r['fecha_termino'] = (new DateTime((string) $contrato['fecha_termino']))->modify(($r['dias'] >= 0 ? '+' : '') . $r['dias'] . ' days')->format('Y-m-d');
    }
    foreach (['aditivas', 'deductivas', 'ordenes_cambio', 'pendiente_monto'] as $k) $r[$k] = round($r[$k], 2);
    return $r;
}

// ---------- Libro de movimientos de la obra (obra_movimientos) ----------
// Deja el total de un documento en $objetivo: anota solo la diferencia contra lo que ya tiene el libro para ese
// documento y clase (nunca borra; una reversa es un renglón negativo). Sin la tabla no hace nada.
// $m: obra_id, naturaleza, clase, origen_tipo, origen_id, iva_pct, moneda, tipo_cambio, concepto, fecha, tipo_costo?
function libroAjustar(array $m, float $objetivo): float
{
    if (!bd_tiene_tabla('AW', 'obra_movimientos')) return 0.0;
    $actual = (float) bd_valor('AW', 'select coalesce(sum(importe), 0) from obra_movimientos where origen_tipo = ? and origen_id = ? and clase = ?',
        [$m['origen_tipo'], $m['origen_id'], $m['clase']]);
    $dif = round($objetivo - $actual, 2);
    if (abs($dif) < 0.005) return 0.0;
    bd_insertar('AW', 'obra_movimientos', 'movimiento_id', [
        'obra_id' => $m['obra_id'], 'fecha' => $m['fecha'] ?? date('Y-m-d'), 'naturaleza' => $m['naturaleza'], 'clase' => $m['clase'],
        'tipo_costo' => $m['tipo_costo'] ?? null, 'importe' => $dif, 'iva' => round($dif * (float) ($m['iva_pct'] ?? 0) / 100, 2),
        'moneda' => $m['moneda'] ?? 'MXN', 'tipo_cambio' => (float) ($m['tipo_cambio'] ?? 1) ?: 1,
        'origen_tipo' => $m['origen_tipo'], 'origen_id' => $m['origen_id'], 'concepto' => mb_substr((string) ($m['concepto'] ?? ''), 0, 200),
        'usuario' => mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50),
    ]);
    return $dif;
}
