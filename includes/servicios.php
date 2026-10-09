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

function api_http(string $clave, string $metodo = 'GET', string $ruta = '', $datos = null, array $encabezados = []): array
{
    $inicio = microtime(true);
    $resp = function (bool $ok, int $codigo, $datosResp, string $cuerpo, ?string $error) use ($inicio) {
        return ['ok' => $ok, 'codigo' => $codigo, 'datos' => $datosResp, 'cuerpo' => $cuerpo, 'error' => $error,
                'ms' => (int) round((microtime(true) - $inicio) * 1000)];
    };

    try {
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

        $cuerpo = curl_exec($ch);
        $codigo = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $errCurl = curl_errno($ch) ? curl_error($ch) : null;
        curl_close($ch);

        if ($cuerpo === false) return $resp(false, 0, null, '', 'Sin respuesta: ' . $errCurl);
        $json = json_decode($cuerpo, true);
        $ok = $codigo >= 200 && $codigo < 300;
        return $resp($ok, $codigo, $json ?? $cuerpo, $cuerpo, $ok ? null : "El servicio respondió HTTP $codigo");
    } catch (Throwable $e) {
        return $resp(false, 0, null, '', $e->getMessage());
    }
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
