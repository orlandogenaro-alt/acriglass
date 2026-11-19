<?php
// Búsqueda de folios por la API de Easy-Glass (Asignar Cotización de Obras y «Facturas y Easy-Glass» de ACRINEO):
// facturas de Microsip (índice de 24 meses), pedidos de Microsip y presupuestos de Easy-Glass.
require_once __DIR__ . '/servicios.php';
require_once __DIR__ . '/sistema.php';

// Facturas de Microsip de los últimos 24 meses para sugerirlas en Asignar Cotización. /microsip-facturas de
// Easy-Glass no filtra por folio y traerlas tarda unos segundos: se guarda un índice compacto 10 minutos en la
// carpeta temporal del servidor y en configuracion (en Vercel cada petición puede caer en otro servidor).
// La ventana lo precarga al abrirse. Si Easy-Glass no responde se usa el último índice guardado.
function facturasMicrosipIndice(): array
{
    $archivo = sys_get_temp_dir() . '/acri-facturas-' . md5(__DIR__) . '.json';
    if (is_file($archivo) && filemtime($archivo) > time() - 600) {
        $d = json_decode((string) @file_get_contents($archivo), true);
        if (is_array($d)) return $d;
    }
    $guardado = [];
    try { $guardado = configLeer('cache-facturas-microsip'); } catch (Throwable $e) {}
    if (is_array($guardado['facturas'] ?? null) && (int) ($guardado['generado'] ?? 0) > time() - 600) {
        @file_put_contents($archivo, json_encode($guardado['facturas'], JSON_UNESCAPED_UNICODE), LOCK_EX);
        return $guardado['facturas'];
    }
    try {
        $indice = facturasMicrosipDescargar();
    } catch (Throwable $e) {
        if (is_array($guardado['facturas'] ?? null)) return $guardado['facturas'];
        throw $e;
    }
    @file_put_contents($archivo, json_encode($indice, JSON_UNESCAPED_UNICODE), LOCK_EX);
    try { configGuardar('cache-facturas-microsip', ['generado' => time(), 'facturas' => $indice]); } catch (Throwable $e) {}
    return $indice;
}

function facturasMicrosipDescargar(): array
{
    $ruta = '/microsip-facturas?desde=' . date('Y-m-d', strtotime('-24 months')) . '&limite=500';
    $r = api_http('EASYGLASS', 'GET', $ruta);
    if (!$r['ok']) throw new RuntimeException('No se pudo consultar las facturas de Microsip: ' . ($r['error'] ?: 'sin respuesta'));
    $rutas = [];
    for ($p = 2; $p <= (int) ($r['datos']['paginas'] ?? 1); $p++) $rutas[$p] = "$ruta&pagina=$p";
    $indice = [];
    foreach (array_merge([$r], array_values($rutas ? api_http_varios('EASYGLASS', $rutas) : [])) as $pg) {
        foreach ((array) ($pg['datos']['datos'] ?? []) as $f) {
            $indice[] = [
                'folio' => (string) ($f['folio'] ?? ''), 'fecha' => (string) ($f['fecha'] ?? ''), 'folio_easy' => (int) ($f['folio_easy'] ?? 0),
                'cliente' => (string) ($f['nombre_cliente'] ?? ''), 'estatus' => (string) ($f['estatus'] ?? ''),
                'detalle' => mb_substr(trim(preg_replace('/\s+/', ' ', (string) ($f['descripcion'] ?? ''))), 0, 160),
                'total' => (float) ($f['importe_total'] ?? 0), 'moneda' => (string) ($f['moneda'] ?? ''),
            ];
        }
    }
    return $indice;
}

// Folios que coinciden con lo escrito (folio con o sin ceros, cliente o descripción), hasta 20, el exacto primero.
// Cada fila: folio, valor, origen (Factura Microsip | Pedido Microsip | Easy-Glass), clave?, cliente, detalle, fecha,
// total, moneda, estatus, exacto. Lanza RuntimeException si Easy-Glass no responde.
function easyglassBuscarFolios(string $q): array
{
    $q = mb_strtoupper(trim($q));
    if (mb_strlen($q) < 2) return [];
    // A00002080 = A2080: se comparan los folios sin los ceros después de la serie
    $norm = fn($f) => preg_replace('/^([A-Z]*)0*/', '$1', mb_strtoupper(trim((string) $f)));
    $qNorm = $norm($q) ?: $q;
    // «EG0009815», «000009815», «A00009815» o «9815»: a Easy-Glass se le pregunta por el número, por texto y
    // por folio exacto (la búsqueda por texto trae otros folios que contienen esos dígitos, como 9820 para 820).
    // Microsip responde error con ceros a la izquierda en «q»: se manda sin ellos.
    $num = preg_match('/^[A-Z]*0*(\d+)$/', $q, $mm) ? $mm[1] : '';
    $desde = date('Y-m-d', strtotime('-24 months'));
    $rutas = [
        'pedidos'      => '/microsip-pedidos?limite=10&desde=' . $desde . '&q=' . rawurlencode(ctype_digit($q) ? $num : $q),
        'presupuestos' => '/presupuestos?limite=10&desde=' . $desde . '&q=' . rawurlencode($num !== '' ? $num : $q),
    ];
    if ($num !== '') {
        $rutas['pedido_folio']      = '/microsip-pedidos?folio=' . $num;
        $rutas['presupuesto_folio'] = '/presupuestos?folio=' . $num;
    }
    $r = api_http_varios('EASYGLASS', $rutas);
    // Los de folio exacto van primero en cada lista
    $exacto = $r['presupuesto_folio']['datos']['datos'] ?? null;
    if (is_array($exacto) && !empty($exacto['folio'])) {
        $r['presupuestos']['datos']['datos'] = array_merge([[
            'folio' => $exacto['folio'], 'cliente' => $exacto['nom_cliente'] ?? '', 'proyecto' => $exacto['proyecto'] ?? '',
            'total' => $exacto['total_proyecto'] ?? $exacto['importe_con_iva'] ?? 0, 'moneda' => $exacto['moneda'] ?? '',
            'fecha' => $exacto['fecha'] ?? '', 'estatus' => $exacto['estatus'] ?? '',
        ]], (array) ($r['presupuestos']['datos']['datos'] ?? []));
        $r['presupuestos']['ok'] = true;
    }
    if (!empty($r['pedido_folio']['datos']['datos'])) {
        $r['pedidos']['datos']['datos'] = array_merge($r['pedido_folio']['datos']['datos'], (array) ($r['pedidos']['datos']['datos'] ?? []));
        $r['pedidos']['ok'] = true;
    }
    try {
        $facturas = facturasMicrosipIndice();
    } catch (Throwable $e) {
        $facturas = null;
    }
    if (!$r['pedidos']['ok'] && !$r['presupuestos']['ok'] && $facturas === null) {
        throw new RuntimeException('No se pudo consultar la API de Easy-Glass: ' . ($r['pedidos']['error'] ?: 'sin respuesta'));
    }
    $filas = [];
    // Facturas: por folio (con o sin ceros), cliente o descripción
    $deFacturas = [];
    foreach ($facturas ?? [] as $f) {
        if (strpos($norm($f['folio']), $qNorm) === false && strpos($f['folio'], $q) === false
            && mb_strpos(mb_strtoupper($f['cliente'] . ' ' . $f['detalle']), $q) === false) continue;
        $deFacturas[] = [
            'folio' => $f['folio'], 'valor' => $f['folio'], 'origen' => 'Factura Microsip',
            // Una factura de un presupuesto de Easy-Glass se guarda en la obra con su folio EG
            'clave' => $f['folio_easy'] ? 'EG' . str_pad((string) $f['folio_easy'], 7, '0', STR_PAD_LEFT) : $f['folio'],
            'cliente' => $f['cliente'], 'detalle' => $f['detalle'], 'fecha' => $f['fecha'],
            'total' => $f['total'], 'moneda' => $f['moneda'], 'estatus' => $f['estatus'],
        ];
    }
    usort($deFacturas, fn($a, $b) => [strpos($norm($a['folio']), $qNorm) === 0 ? 0 : 1, $b['fecha']] <=> [strpos($norm($b['folio']), $qNorm) === 0 ? 0 : 1, $a['fecha']]);
    foreach (array_slice($deFacturas, 0, 10) as $f) $filas[$f['folio']] = $f;
    foreach ((array) ($r['pedidos']['datos']['datos'] ?? []) as $p) {
        $filas[$p['folio']] = [
            'folio' => (string) $p['folio'], 'valor' => (string) $p['folio'], 'origen' => 'Pedido Microsip',
            'cliente' => $p['cliente'] ?? '', 'detalle' => trim(preg_replace('/\s+/', ' ', (string) ($p['descripcion'] ?? ''))),
            'fecha' => $p['fecha'] ?? '', 'total' => (float) ($p['total_docto'] ?? 0), 'moneda' => $p['moneda'] ?? '', 'estatus' => $p['estatus'] ?? '',
        ];
    }
    foreach ((array) ($r['presupuestos']['datos']['datos'] ?? []) as $p) {
        $folio = 'EG' . str_pad((string) $p['folio'], 7, '0', STR_PAD_LEFT);
        if (isset($filas[$folio])) continue;   // ya pasó a pedido de Microsip
        $filas[$folio] = [
            'folio' => $folio, 'valor' => (string) $p['folio'], 'origen' => 'Easy-Glass',
            'cliente' => $p['cliente'] ?? '', 'detalle' => (string) ($p['proyecto'] ?? ''),
            'fecha' => $p['fecha'] ?? '', 'total' => (float) ($p['total'] ?? 0), 'moneda' => $p['moneda'] ?? '', 'estatus' => $p['estatus'] ?? '',
        ];
    }
    // Primero el folio exacto (A2080 = A00002080, 820 = EG0000820), luego los que empiezan con lo escrito
    // y al final los demás; en cada grupo, los más recientes
    $empieza = function ($f) use ($q, $qNorm, $num, $norm) {
        $sinSerie = preg_replace('/^[A-Z]*0*/', '', $f['folio']);
        if ($f['folio'] === $q || $norm($f['folio']) === $qNorm || ($num !== '' && $sinSerie === $num)) return 0;
        if (strpos($f['folio'], $q) === 0 || strpos($norm($f['folio']), $qNorm) === 0 || ($num !== '' && strpos($sinSerie, $num) === 0)) return 1;
        return 2;
    };
    usort($filas, fn($a, $b) => [$empieza($a), $b['fecha']] <=> [$empieza($b), $a['fecha']]);
    $filas = array_map(fn($f) => $f + ['exacto' => $empieza($f) === 0], array_slice($filas, 0, 20));
    return $filas;
}
