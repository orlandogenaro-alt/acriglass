<?php
// ACRINEO · Cálculos de la hoja del presupuesto (funciones puras, sin base de datos: pruebas/acrineo.php).
//   precio unitario = costo directo unitario × (1 + % sobrecosto), redondeado a los decimales de costos
//   importe         = cantidad × unitario, redondeado a los decimales de costos (cada renglón, como Neodata)
//   la partida suma sus renglones más los de sus subpartidas

function acrineoPrecioUnitario(float $costo, float $sobrecostoPct, int $decimales): float
{
    return round($costo * (1 + $sobrecostoPct / 100), $decimales);
}

function acrineoImporte(float $cantidad, float $unitario, int $decimales): float
{
    return round($cantidad * $unitario, $decimales);
}

// Precio unitario del concepto: con P.A. (precio alzado) es el precio fijo capturado; si no, costo × sobrecosto
function acrineoPrecioConcepto(float $costo, float $sobrecostoPct, int $decimales, bool $precioAlzado, ?float $precioFijo): float
{
    return $precioAlzado ? round((float) $precioFijo, $decimales) : acrineoPrecioUnitario($costo, $sobrecostoPct, $decimales);
}

// URL del concepto: vacía (null) o una dirección http/https válida. Regresa [url|null, error|null]
function acrineoUrlConcepto($v): array
{
    $v = trim((string) ($v ?? ''));
    if ($v === '') return [null, null];
    if (mb_strlen($v) > 500) return [null, 'Máximo 500 caracteres.'];
    if (!preg_match('~^https?://\S+$~i', $v) || filter_var($v, FILTER_VALIDATE_URL) === false) {
        return [null, 'Debe ser una dirección que empiece con http:// o https://'];
    }
    return [$v, null];
}

const ACRINEO_TIPOS_INSUMO = ['MAT' => 'Materiales', 'MO' => 'Mano de obra', 'EQ' => 'Equipo y maquinaria', 'HER' => 'Herramienta',
                              'BAS' => 'Básicos', 'OTR' => 'Otros'];

// Matriz de precio unitario de un concepto (por unidad del concepto).
//   Renglón por unidad:  importe = cantidad × (1 + % desperdicio) × costo
//   Renglón % de M.O.:   importe = cantidad % × Σ importes de mano de obra (los renglones por unidad)
//   Renglón % de mat.:   importe = cantidad % × Σ importes de materiales  (los renglones por unidad)
// Cada importe se redondea a los decimales de costos; el costo directo del concepto es su suma.
// Regresa ['filas' => [... + importe, cantidad_efectiva], 'totales' => [tipo => importe], 'total' => costo directo]
function acrineoCalcularMatriz(array $filas, int $decimales): array
{
    $base = ['MO' => 0.0, 'MAT' => 0.0];
    foreach ($filas as $i => $f) {
        if (!empty($f['base'])) continue;
        $cant = (float) $f['cantidad'] * (1 + (float) ($f['desperdicio_pct'] ?? 0) / 100);
        $filas[$i]['cantidad_efectiva'] = round($cant, 6);
        $filas[$i]['importe'] = round($cant * (float) $f['costo'], $decimales);
        if (isset($base[$f['tipo']])) $base[$f['tipo']] += $filas[$i]['importe'];
    }
    $totales = array_fill_keys(array_keys(ACRINEO_TIPOS_INSUMO), 0.0);
    foreach ($filas as $i => $f) {
        if (!empty($f['base'])) {
            $sobre = $f['base'] === 'pct_mo' ? $base['MO'] : $base['MAT'];
            $filas[$i]['cantidad_efectiva'] = round((float) $f['cantidad'], 6);
            $filas[$i]['costo'] = round($sobre, $decimales);   // la base sobre la que se aplica el %
            $filas[$i]['importe'] = round((float) $f['cantidad'] / 100 * $sobre, $decimales);
        }
        $totales[$f['tipo']] += $filas[$i]['importe'];
    }
    $totales = array_map(fn($v) => round($v, $decimales), $totales);
    return ['filas' => $filas, 'totales' => $totales, 'total' => round(array_sum($totales), $decimales)];
}

// $padres: [partida_id => padre_id|null] · $propios: [partida_id => ['costo' => x, 'venta' => y]] (solo sus renglones)
// Regresa [partida_id => ['costo' => …, 'venta' => …]] con lo de sus subpartidas incluido.
function acrineoTotalesPartidas(array $padres, array $propios, int $decimales): array
{
    $tot = [];
    foreach ($padres as $id => $_) $tot[$id] = ['costo' => (float) ($propios[$id]['costo'] ?? 0), 'venta' => (float) ($propios[$id]['venta'] ?? 0)];
    foreach ($propios as $id => $v) {
        $p = $padres[$id] ?? null;
        $vistos = [];
        while ($p !== null && array_key_exists($p, $padres) && !isset($vistos[$p])) {   // sube hasta la raíz (y no se cicla)
            $vistos[$p] = true;
            $tot[$p]['costo'] += $v['costo'];
            $tot[$p]['venta'] += $v['venta'];
            $p = $padres[$p];
        }
    }
    foreach ($tot as &$t) { $t['costo'] = round($t['costo'], $decimales); $t['venta'] = round($t['venta'], $decimales); }
    return $tot;
}

// Código sugerido para una partida nueva: raíz A, B, C… Z, AA…; subpartida = código del padre + 1, 2, 3…
// ($usados: todos los códigos del presupuesto, para no repetir)
function acrineoSiguienteCodigoPartida(?string $padre, array $usados): string
{
    $usados = array_flip(array_map(fn($c) => mb_strtoupper(trim((string) $c)), $usados));
    if ($padre === null) {
        for ($i = 0; ; $i++) {
            $c = '';
            for ($n = $i; $n >= 0; $n = intdiv($n, 26) - 1) $c = chr(65 + $n % 26) . $c;
            if (!isset($usados[$c])) return $c;
        }
    }
    for ($n = 1; ; $n++) {
        $c = $padre . $n;
        if (!isset($usados[mb_strtoupper($c)])) return $c;
    }
}

// Orden de las partidas como árbol (padre antes que sus hijos, hermanos por orden), con su nivel
function acrineoOrdenArbol(array $partidas): array
{
    $hijos = [];
    foreach ($partidas as $p) $hijos[$p['padre_id'] ?? 0][] = $p;
    foreach ($hijos as &$h) usort($h, fn($a, $b) => [$a['orden'], $a['id']] <=> [$b['orden'], $b['id']]);
    unset($h);
    $salida = [];
    $agregar = function ($padre, int $nivel) use (&$agregar, &$salida, $hijos) {
        foreach ($hijos[$padre] ?? [] as $p) {
            $p['nivel'] = $nivel;
            $p['hijos'] = count($hijos[$p['id']] ?? []);
            $salida[] = $p;
            $agregar($p['id'], $nivel + 1);
        }
    };
    $agregar(0, 0);
    return $salida;
}
