<?php
// Servicios externos (Administrador › APIs y servicios, config/servicios.json).
//
//   $r = api_http('BANXICO', 'GET', 'SF43718/datos/oportuno');
//   if ($r['ok']) $datos = $r['datos'];          // JSON ya decodificado (o texto si no es JSON)
//
// La credencial nunca sale del servidor: se agrega aquí según el tipo de autenticación.
require_once __DIR__ . '/bd.php';

const ACRI_AUTENTICACION = [
    'ninguna' => 'Sin autenticación',
    'header'  => 'Encabezado propio (p. ej. Bmx-Token)',
    'bearer'  => 'Bearer token',
    'query'   => 'Parámetro en la URL',
    'basic'   => 'Básica (usuario:contraseña)',
    'oauth2'  => 'OAuth 2 (tokens en base de datos)',
];

// API v1 de Easy-Glass Boss (solo lectura): catálogos, clientes, presupuestos y Microsip.
// La llave se genera en Easy-Glass Boss › API; aquí se captura en Administrador › APIs y servicios
// o en la variable de entorno API_EASYGLASS_TOKEN (Vercel).
const ACRI_SERVICIO_EASYGLASS = [
    'nombre'      => 'Easy-Glass · API v1 (presupuestos)',
    'proveedor'   => 'Easy-Glass · Cotizador MegaGlass',
    'url'         => 'http://cotizador.megaglass.us:8010/api/v1.php',
    'auth'        => 'bearer',
    'auth_campo'  => '',
    'credencial'  => '',
    'extra'       => [],
    'espera'      => 30,
    'ruta_prueba' => '/presupuestos?limite=1',
    'sistema'     => true,
    'activa'      => true,
    'notas'       => "Uso: api_http('EASYGLASS', 'GET', '/presupuestos?limite=5')",
];

function api_servicios(): array
{
    $todos = configLeer('servicios');
    if (!isset($todos['EASYGLASS'])) $todos['EASYGLASS'] = ACRI_SERVICIO_EASYGLASS;
    return $todos;
}

function api_config(string $clave): array
{
    $todos = api_servicios();
    if (!isset($todos[$clave])) throw new RuntimeException("No existe el servicio '$clave' (Administrador › APIs y servicios).");
    $s = $todos[$clave];
    // Sin credencial capturada: la de la variable de entorno API_<CLAVE>_TOKEN
    if (($s['credencial'] ?? '') === '') $s['credencial'] = acri_env('API_' . $clave . '_TOKEN');
    return $s;
}

// Une la URL base con la ruta sin duplicar ni perder diagonales
function api_url(string $base, string $ruta): string
{
    if ($ruta === '') return $base;
    if (preg_match('#^https?://#i', $ruta)) return $ruta;
    return rtrim($base, '/') . '/' . ltrim($ruta, '/');
}

// OAuth 2: lee el token vigente de la tabla que mantiene el otro sistema (solo lectura)
function api_token_oauth(array $s): array
{
    $bd = $s['extra']['tokens_bd'] ?? '';
    $tabla = $s['extra']['tokens_tabla'] ?? '';
    if ($bd === '' || !preg_match('/^\w+$/', $tabla)) throw new RuntimeException('Falta indicar la base y tabla de tokens.');
    $t = bd_fila($bd, "select first 1 access_token, relam_id, fecha from $tabla order by fecha desc");
    if (!$t || $t['access_token'] === '') throw new RuntimeException("No hay tokens en $bd.$tabla.");
    return $t;
}

// Petición cURL lista para mandar (credencial, URL base, encabezados y cuerpo del servicio); error si no se puede armar
function api_preparar(string $clave, string $metodo, string $ruta, $datos, array $encabezados)
{
    $s = api_config($clave);
    if (empty($s['activa'])) throw new RuntimeException("El servicio '$clave' está desactivado.");
    if (($s['url'] ?? '') === '' && !preg_match('#^https?://#i', $ruta)) throw new RuntimeException('El servicio no tiene URL base.');

    $cred = $s['credencial'] ?? '';
    $auth = $s['auth'] ?? 'ninguna';
    if (in_array($auth, ['header', 'bearer', 'query', 'basic'], true) && $cred === '') {
        throw new RuntimeException('Falta capturar la credencial del servicio.');
    }

    $h = ['Accept: application/json'];
    switch ($auth) {
        case 'header': $h[] = $s['auth_campo'] . ': ' . $cred; break;
        case 'bearer': $h[] = 'Authorization: Bearer ' . $cred; break;
        case 'basic':  $h[] = 'Authorization: Basic ' . base64_encode($cred); break;
        case 'oauth2':
            $tok = api_token_oauth($s);
            $h[] = 'Authorization: Bearer ' . $tok['access_token'];
            $ruta = str_replace('{realm}', rawurlencode((string) $tok['relam_id']), $ruta);
            break;
    }

    $url = api_url($s['url'] ?? '', $ruta);
    if ($auth === 'query') {
        $url .= (strpos($url, '?') === false ? '?' : '&') . rawurlencode($s['auth_campo']) . '=' . rawurlencode($cred);
    }

    $ch = curl_init($url);
    $op = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => strtoupper($metodo),
        CURLOPT_TIMEOUT        => max(1, (int) ($s['espera'] ?? 30)),
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT      => 'AcriGlass/1.0',
    ];
    if ($datos !== null) {
        if (is_array($datos)) {
            $op[CURLOPT_POSTFIELDS] = json_encode($datos, JSON_UNESCAPED_UNICODE);
            $h[] = 'Content-Type: application/json';
        } else {
            $op[CURLOPT_POSTFIELDS] = (string) $datos;
        }
    }
    $op[CURLOPT_HTTPHEADER] = array_merge($h, $encabezados);
    curl_setopt_array($ch, $op);
    return $ch;
}

// Respuesta en la forma de api_http
function api_resultado($cuerpo, int $codigo, ?string $errCurl, float $inicio): array
{
    $ms = (int) round((microtime(true) - $inicio) * 1000);
    if ($cuerpo === false || $cuerpo === null) return ['ok' => false, 'codigo' => 0, 'datos' => null, 'cuerpo' => '', 'error' => 'Sin respuesta: ' . $errCurl, 'ms' => $ms];
    $json = json_decode($cuerpo, true);
    $ok = $codigo >= 200 && $codigo < 300;
    return ['ok' => $ok, 'codigo' => $codigo, 'datos' => $json ?? $cuerpo, 'cuerpo' => $cuerpo, 'error' => $ok ? null : "El servicio respondió HTTP $codigo", 'ms' => $ms];
}

function api_http(string $clave, string $metodo = 'GET', string $ruta = '', $datos = null, array $encabezados = []): array
{
    $inicio = microtime(true);
    try {
        $ch = api_preparar($clave, $metodo, $ruta, $datos, $encabezados);
        $cuerpo = curl_exec($ch);
        $codigo = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $errCurl = curl_errno($ch) ? curl_error($ch) : null;
        curl_close($ch);
        return api_resultado($cuerpo, $codigo, $errCurl, $inicio);
    } catch (Throwable $e) {
        return ['ok' => false, 'codigo' => 0, 'datos' => null, 'cuerpo' => '', 'error' => $e->getMessage(), 'ms' => (int) round((microtime(true) - $inicio) * 1000)];
    }
}

function api_id($ch): int { return is_object($ch) ? spl_object_id($ch) : (int) $ch; }

// Varios GET al mismo servicio al mismo tiempo (hasta $simultaneas a la vez): [llave => ruta] → [llave => respuesta de api_http].
// Evita esperar una llamada tras otra (p. ej. un folio de Microsip tras otro en Facturación).
function api_http_varios(string $clave, array $rutas, int $simultaneas = 8): array
{
    $res = [];
    $inicio = microtime(true);
    $pendientes = $rutas;
    $mh = curl_multi_init();
    $activos = [];
    $agregar = function () use (&$pendientes, &$activos, &$res, $mh, $clave, $inicio) {
        $k = array_key_first($pendientes);
        $ruta = $pendientes[$k];
        unset($pendientes[$k]);
        try {
            $ch = api_preparar($clave, 'GET', $ruta, null, []);
            curl_multi_add_handle($mh, $ch);
            $activos[api_id($ch)] = [$k, $ch];
        } catch (Throwable $e) {
            $res[$k] = ['ok' => false, 'codigo' => 0, 'datos' => null, 'cuerpo' => '', 'error' => $e->getMessage(), 'ms' => 0];
        }
    };
    while ($pendientes && count($activos) < $simultaneas) $agregar();
    while ($activos) {
        curl_multi_exec($mh, $corriendo);
        if (curl_multi_select($mh, 1.0) === -1) usleep(10000);
        while ($info = curl_multi_info_read($mh)) {
            $ch = $info['handle'];
            [$k] = $activos[api_id($ch)];
            unset($activos[api_id($ch)]);
            $errCurl = $info['result'] !== CURLE_OK ? curl_error($ch) : null;
            $cuerpo = $info['result'] === CURLE_OK ? curl_multi_getcontent($ch) : false;
            $res[$k] = api_resultado($cuerpo, (int) curl_getinfo($ch, CURLINFO_HTTP_CODE), $errCurl, $inicio);
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
            if ($pendientes) $agregar();
        }
    }
    curl_multi_close($mh);
    return $res;
}

// Factura de Microsip (DOCTOS_VE tipo F) por su folio (A00002080 o A2080). /microsip-facturas de Easy-Glass no
// filtra por folio: se pide el periodo (500 por página, las demás páginas en paralelo) y se busca ahí. Con $fecha
// solo se pide ese día. Devuelve el renglón del listado con total_docto y total_impuestos del detalle, o null.
function microsip_factura(string $folio, ?string $fecha = null, int $meses = 24): ?array
{
    $norm = fn($f) => preg_replace('/^([A-Z]*)0*/', '$1', strtoupper(trim((string) $f)));
    $buscado = $norm($folio);
    $q = $fecha ? "desde=$fecha&hasta=$fecha" : 'desde=' . date('Y-m-d', strtotime("-$meses months")) . '&hasta=' . date('Y-m-d');
    $ruta = "/microsip-facturas?$q&limite=500";
    $r = api_http('EASYGLASS', 'GET', $ruta);
    if (!$r['ok']) throw new RuntimeException('No se pudo consultar las facturas de Microsip en la API de Easy-Glass: ' . ($r['error'] ?: 'sin respuesta'));
    $paginas = [$r];
    $rutas = [];
    for ($p = 2; $p <= (int) ($r['datos']['paginas'] ?? 1); $p++) $rutas[$p] = "$ruta&pagina=$p";
    if ($rutas) $paginas = array_merge($paginas, array_values(api_http_varios('EASYGLASS', $rutas)));
    foreach ($paginas as $pg) {
        foreach ($pg['datos']['datos'] ?? [] as $f) {
            if ($norm($f['folio'] ?? '') !== $buscado) continue;
            // El listado trae el importe sin impuestos; el total con IVA viene en el detalle
            $d = api_http('EASYGLASS', 'GET', '/microsip-facturas/' . (int) $f['docto_ve_id']);
            $det = $d['ok'] ? ($d['datos']['datos'] ?? []) : [];
            return $f + [
                'total_impuestos' => (float) ($det['total_impuestos'] ?? 0),
                'total_docto'     => (float) ($det['total_docto'] ?? $f['importe_total'] ?? 0),
            ];
        }
    }
    return null;
}

// Estado de la credencial para mostrar en la lista (nunca devuelve el valor)
function api_estado_credencial(array $s): array
{
    $auth = $s['auth'] ?? 'ninguna';
    if (!empty($s['extra']['archivo'])) {
        $ok = is_file(ACRI_RAIZ . '/config/' . basename($s['extra']['archivo']));
        return ['texto' => $s['extra']['archivo'], 'estado' => $ok ? 'archivo' : 'falta'];
    }
    if ($auth === 'ninguna') return ['texto' => '—', 'estado' => 'na'];
    if ($auth === 'oauth2') {
        $ok = ($s['credencial'] ?? '') !== '' && ($s['extra']['client_id'] ?? '') !== '';
        return ['texto' => 'Client secret', 'estado' => $ok ? 'ok' : 'falta'];
    }
    $texto = $auth === 'basic' ? 'Usuario' : 'Token';
    return ['texto' => $texto, 'estado' => ($s['credencial'] ?? '') !== '' ? 'ok' : 'falta'];
}

function api_probar(string $clave): array
{
    $s = api_config($clave);
    if (!empty($s['extra']['archivo'])) {
        $ok = api_estado_credencial($s)['estado'] === 'archivo';
        return ['ok' => $ok, 'ms' => 0, 'mensaje' => $ok ? 'Archivo de llaves encontrado.' : 'No existe config/' . basename($s['extra']['archivo']) . '.'];
    }
    if (($s['url'] ?? '') === '') return ['ok' => false, 'ms' => 0, 'mensaje' => 'El servicio no tiene URL base.'];

    $r = api_http($clave, 'GET', $s['ruta_prueba'] ?? '');
    // Sin ruta de prueba basta con que el servidor conteste (aunque sea 404 o 405)
    $ok = $r['ok'] || (($s['ruta_prueba'] ?? '') === '' && $r['codigo'] > 0 && $r['codigo'] < 500 && $r['codigo'] !== 401 && $r['codigo'] !== 403);
    $mensaje = $r['codigo'] ? "HTTP {$r['codigo']}" : '';
    if (!$ok) $mensaje = trim($r['error'] . ($r['codigo'] === 401 || $r['codigo'] === 403 ? ' · credencial rechazada' : ''));
    return ['ok' => $ok, 'ms' => $r['ms'], 'mensaje' => $mensaje ?: 'Responde correctamente'];
}
