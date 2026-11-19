<?php
// ACRINEO · «Imprimir reportes» (Opciones del Presupuesto › Reporte), como los reportes de Neodata:
//   presupuesto  · partidas con sus conceptos (código, concepto, unidad, cantidad, P.U., importe), subtotal, IVA y total con letra
//   analisis     · análisis de precios unitarios: la matriz de cada concepto por tipo de insumo, costo directo, sobrecosto y P.U.
//   explosion    · explosión de insumos de todo el presupuesto (con submatrices) por tipo de insumo
// Los datos salen igual que en la hoja; la página acrineo-reporte.php los imprime (PDF) o los baja a Excel.
require_once __DIR__ . '/hoja.php';
require_once __DIR__ . '/calculo.php';
require_once __DIR__ . '/sobrecosto.php';
require_once __DIR__ . '/presupuestos.php';
require_once __DIR__ . '/tipos-insumo.php';

const ACRINEO_REPORTES = [
    'presupuesto' => 'Presupuesto',
    'analisis'    => 'Análisis de precios unitarios',
    'explosion'   => 'Explosión de insumos',
];

// Número entero con letra, en mayúsculas («MIL DOSCIENTOS»)
function acrineoNumeroConLetra(int $n): string
{
    $u = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
          'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUN', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO',
          'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
    $d = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    $c = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
    $menorMil = function (int $x) use ($u, $d, $c): string {
        if ($x === 100) return 'CIEN';
        $t = $c[intdiv($x, 100)];
        $r = $x % 100;
        if ($r) $t .= ($t ? ' ' : '') . ($r < 30 ? $u[$r] : $d[intdiv($r, 10)] . ($r % 10 ? ' Y ' . $u[$r % 10] : ''));
        return $t;
    };
    if ($n <= 0) return 'CERO';
    $partes = [];
    $mill = intdiv($n, 1000000);
    $miles = intdiv($n, 1000) % 1000;
    $resto = $n % 1000;
    if ($mill) $partes[] = $mill === 1 ? 'UN MILLON' : acrineoNumeroConLetra($mill) . ' MILLONES';
    if ($miles) $partes[] = $miles === 1 ? 'MIL' : $menorMil($miles) . ' MIL';
    if ($resto) $partes[] = $menorMil($resto);
    return implode(' ', $partes);
}

// Importe con letra: «(MIL DOSCIENTOS PESOS 50/100 M.N.)»
function acrineoImporteConLetra(float $n): string
{
    $centavos = (int) round(max(0, $n) * 100);
    $entero = intdiv($centavos, 100);
    return '(' . acrineoNumeroConLetra($entero) . ($entero && $entero % 1000000 === 0 ? ' DE' : '') . ($entero === 1 ? ' PESO ' : ' PESOS ')
        . str_pad((string) ($centavos % 100), 2, '0', STR_PAD_LEFT) . '/100 M.N.)';
}

// Datos generales que van en el encabezado de los reportes
function acrineoReporteEncabezado(array $ctx): array
{
    $p = acrineoObtener($ctx['id']) ?? [];
    $pr = $p['presupuesto'] ?? [];
    $g = $p['generales'] ?? [];
    $lugar = implode(', ', array_filter([trim((string) ($pr['direccion'] ?? '')), trim((string) ($pr['colonia'] ?? '')),
                                         trim((string) ($pr['ciudad_nombre'] ?? '')), trim((string) ($pr['estado'] ?? ''))]));
    return [
        'codigo' => $ctx['codigo'], 'nombre' => $ctx['nombre'], 'descripcion' => (string) ($pr['descripcion'] ?? ''),
        'cliente' => (string) ($g['cliente_nombre'] ?? ''), 'contacto' => (string) ($g['contacto_cliente'] ?? ''),
        'empresa' => (string) ($g['empresa_nombre'] ?? ''), 'lugar' => $lugar,
        // «Lugar» del formato PRESUPUESTO DE OBRA: la ciudad (o el domicilio si no tiene ciudad)
        'ciudad' => trim((string) ($pr['ciudad_nombre'] ?? '')) !== '' ? trim((string) $pr['ciudad_nombre']) : $lugar,
        'iva_pct' => (float) ($p['calculo']['iva'] ?? 16), 'fecha' => date('Y-m-d'),
        'sobrecosto_pct' => $ctx['sobrecosto_pct'],
    ];
}

// $marcados: ids de concepto (vacío = todos)
function acrineoReporteFiltro(array $marcados): callable
{
    $ids = array_flip(array_map('intval', $marcados));
    return fn(int $conceptoId) => !$ids || isset($ids[$conceptoId]);
}

// Presupuesto: partidas (con nivel) y sus conceptos, importe de cada partida (con sus subpartidas) y totales
function acrineoReportePresupuesto(array $ctx, array $marcados = []): array
{
    $usa = acrineoReporteFiltro($marcados);
    $porPartida = [];
    foreach (acrineoRenglonesDe($ctx, 'p.presupuesto_id = ?', [$ctx['id']]) as $r) {
        if ($usa($r['concepto_id'])) $porPartida[$r['partida_id']][] = $r;
    }
    $partidas = acrineoPartidas($ctx);
    // Importe por partida con lo filtrado (los suyos más los de sus subpartidas)
    $propio = [];
    foreach ($porPartida as $pid => $rs) $propio[$pid] = array_sum(array_column($rs, 'importe'));
    $padre = array_column($partidas, 'padre_id', 'id');
    $total = [];
    foreach ($propio as $pid => $v) {
        for ($x = $pid; $x !== null; $x = $padre[$x] ?? null) $total[$x] = ($total[$x] ?? 0) + $v;
    }
    $salida = [];
    foreach ($partidas as $p) {
        if (!isset($total[$p['id']])) continue;   // sin conceptos (ni en sus subpartidas)
        $salida[] = [
            'id' => $p['id'], 'codigo' => $p['codigo'], 'descripcion' => $p['descripcion'], 'nivel' => $p['nivel'],
            'importe' => round($total[$p['id']] ?? 0, $ctx['dec_costos']),
            'conceptos' => array_map(fn($r) => ['codigo' => $r['codigo'], 'descripcion' => $r['descripcion'], 'unidad' => $r['unidad'],
                                                'cantidad' => $r['cantidad'], 'precio' => $r['precio'], 'importe' => $r['importe']], $porPartida[$p['id']] ?? []),
        ];
    }
    $enc = acrineoReporteEncabezado($ctx);
    $subtotal = round(array_sum($propio), $ctx['dec_costos']);
    $iva = round($subtotal * $enc['iva_pct'] / 100, 2);
    return ['partidas' => $salida, 'subtotal' => $subtotal, 'iva_pct' => $enc['iva_pct'], 'iva' => $iva,
            'total' => round($subtotal + $iva, 2), 'letra' => acrineoImporteConLetra($subtotal + $iva)];
}

// Renglones del sobrecosto de un concepto: la cascada de factores (si son los que dan el % vigente) o un solo renglón
function acrineoReporteSobrecosto(float $cd, array $ctx, array $factores): array
{
    $dec = $ctx['dec_costos'];
    $d = acrineoSobrecostoDesglose($factores);
    if (array_sum($factores) > 0 && abs($d['sobrecosto_pct'] - $ctx['sobrecosto_pct']) < 0.00005) {
        $ind = $cd * $d['indirecto_total'] / 100;
        $s1 = $cd + $ind;
        $fin = $s1 * $factores['financiamiento'] / 100;
        $s2 = $s1 + $fin;
        $uti = $s2 * $factores['utilidad'] / 100;
        $s3 = $s2 + $uti;
        $car = $s3 * $factores['cargos_adicionales'] / 100;
        return [
            ['Indirectos', $d['indirecto_total'], round($ind, $dec)],
            ['Subtotal', null, round($s1, $dec)],
            ['Financiamiento', $factores['financiamiento'], round($fin, $dec)],
            ['Subtotal', null, round($s2, $dec)],
            ['Utilidad', $factores['utilidad'], round($uti, $dec)],
            ['Subtotal', null, round($s3, $dec)],
            ['Cargos adicionales', $factores['cargos_adicionales'], round($car, $dec)],
        ];
    }
    return $ctx['sobrecosto_pct'] ? [['Sobrecosto', $ctx['sobrecosto_pct'], round($cd * $ctx['sobrecosto_pct'] / 100, $dec)]] : [];
}

// Análisis de precios unitarios: un bloque por concepto (en el orden del presupuesto, sin repetir)
function acrineoReporteAnalisis(array $ctx, array $marcados = []): array
{
    $usa = acrineoReporteFiltro($marcados);
    $matrices = acrineoCalculoMatrices($ctx);
    $tipos = acrineoTiposInsumo();
    $factores = acrineoSobrecostoFactores($ctx)['factores'];
    $conceptos = [];
    foreach (acrineoPresupuestoCompletoRenglones($ctx) as $r) {
        $cid = $r['concepto_id'];
        if (!$usa($cid)) continue;
        if (isset($conceptos[$cid])) { $conceptos[$cid]['cantidad'] += $r['cantidad']; continue; }
        $grupos = [];
        if (isset($matrices[$cid][0])) {
            foreach (acrineoCalcularMatriz($matrices[$cid][0], $ctx['dec_costos'])['filas'] as $f) {
                $t = $f['tipo'];
                $grupos[$t] = $grupos[$t] ?? ['tipo' => $t, 'nombre' => $tipos[$t] ?? $t, 'filas' => [], 'total' => 0.0];
                $grupos[$t]['filas'][] = ['codigo' => $f['codigo'], 'descripcion' => $f['descripcion'], 'unidad' => $f['base'] ? '%' : $f['unidad'],
                                          'costo' => $f['base'] ? null : (float) $f['costo'], 'cantidad' => (float) $f['cantidad'],
                                          'desperdicio' => (float) $f['desperdicio_pct'], 'importe' => (float) $f['importe'],
                                          'analisis' => isset($matrices[$cid][$f['matriz_id']])];
                $grupos[$t]['total'] += (float) $f['importe'];
            }
        }
        $orden = array_keys($tipos);
        uksort($grupos, fn($a, $b) => [array_search($a, $orden, true) === false ? 99 : array_search($a, $orden, true), $a]
                                      <=> [array_search($b, $orden, true) === false ? 99 : array_search($b, $orden, true), $b]);
        foreach ($grupos as &$g) $g['total'] = round($g['total'], $ctx['dec_costos']);
        unset($g);
        $cd = (float) $r['costo'];
        $conceptos[$cid] = [
            'codigo' => $r['codigo'], 'descripcion' => $r['descripcion'], 'unidad' => $r['unidad'], 'cantidad' => $r['cantidad'],
            'partida' => $r['partida_codigo'], 'grupos' => array_values($grupos), 'costo_directo' => $cd,
            'sobrecosto' => $r['precio_alzado'] ? [] : acrineoReporteSobrecosto($cd, $ctx, $factores),
            'precio_alzado' => $r['precio_alzado'], 'precio' => (float) $r['precio'], 'letra' => acrineoImporteConLetra((float) $r['precio']),
        ];
    }
    return ['conceptos' => array_values($conceptos)];
}

// Los renglones de todo el presupuesto en orden de partidas (con el código de su partida)
function acrineoPresupuestoCompletoRenglones(array $ctx): array
{
    $porPartida = [];
    foreach (acrineoRenglonesDe($ctx, 'p.presupuesto_id = ?', [$ctx['id']]) as $r) $porPartida[$r['partida_id']][] = $r;
    $filas = [];
    foreach (acrineoPartidas($ctx) as $p) {
        foreach ($porPartida[$p['id']] ?? [] as $r) { $r['partida_codigo'] = $p['codigo']; $filas[] = $r; }
    }
    return $filas;
}

// Explosión de insumos de todo el presupuesto, por tipo de insumo, con su total
function acrineoReporteExplosion(array $ctx): array
{
    $tipos = acrineoTiposInsumo();
    $grupos = [];
    foreach (acrineoExplosionAcoplada($ctx, '', 'contiene', 'insumos')['insumos'] as $i) {
        $t = $i['tipo'];
        $grupos[$t] = $grupos[$t] ?? ['tipo' => $t, 'nombre' => $tipos[$t] ?? $t, 'insumos' => [], 'total' => 0.0];
        $grupos[$t]['insumos'][] = ['codigo' => $i['codigo'], 'descripcion' => $i['descripcion'], 'unidad' => $i['unidad'], 'n' => $i['n'],
                                    'costo' => $i['pct'] ? null : $i['costo'], 'cantidad' => $i['pct'] ? null : $i['cantidad'], 'importe' => $i['importe']];
        $grupos[$t]['total'] += $i['importe'];
    }
    $orden = array_keys($tipos);
    uksort($grupos, fn($a, $b) => [array_search($a, $orden, true) === false ? 99 : array_search($a, $orden, true), $a]
                                  <=> [array_search($b, $orden, true) === false ? 99 : array_search($b, $orden, true), $b]);
    $total = 0.0;
    foreach ($grupos as &$g) { $g['total'] = round($g['total'], $ctx['dec_costos']); $total += $g['total']; }
    unset($g);
    return ['grupos' => array_values($grupos), 'total' => round($total, $ctx['dec_costos'])];
}

function acrineoReporte(array $ctx, string $tipo, array $marcados = []): array
{
    if (!isset(ACRINEO_REPORTES[$tipo])) throw new AcrineoError('Ese reporte no existe.', 404);
    $datos = match ($tipo) {
        'presupuesto' => acrineoReportePresupuesto($ctx, $marcados),
        'analisis'    => acrineoReporteAnalisis($ctx, $marcados),
        'explosion'   => acrineoReporteExplosion($ctx),
    };
    return ['tipo' => $tipo, 'titulo' => ACRINEO_REPORTES[$tipo], 'encabezado' => acrineoReporteEncabezado($ctx), 'marcados' => count($marcados)] + $datos;
}
