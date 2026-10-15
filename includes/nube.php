<?php
// Modo nube (Vercel + Supabase).
//
// En Vercel el disco es de solo lectura y cada petición puede caer en otra instancia, así que lo que
// en el servidor local vive en archivos aquí va a Supabase:
//   config/*.json   → tabla configuracion
//   sesiones de PHP → tabla sesiones
//   uploads/        → Supabase Storage (buckets "sistema" y "adjuntos")
//   AW-Management   → las tablas de Consultas/supabase_acriglass.sql
//
// Se activa cuando existe la variable de entorno DB_HOST. Variables (Vercel › Settings › Environment Variables):
//   DB_HOST, DB_PORT (6543), DB_NAME (postgres), DB_USER, DB_PASS   Transaction pooler de Supabase
//   DB_SSLMODE                                                      require (solo se cambia para pruebas locales)
//   SUPABASE_URL, SUPABASE_SERVICE_KEY                              Storage (service_role, nunca al navegador)
//   ACRI_ZONA                                                       zona horaria (America/Mexico_City)

function acri_env(string $nombre, string $defecto = ''): string
{
    $v = getenv($nombre);
    return $v === false || $v === '' ? $defecto : $v;
}

define('ACRI_NUBE', acri_env('DB_HOST') !== '');

if (ACRI_NUBE) date_default_timezone_set(acri_env('ACRI_ZONA', 'America/Mexico_City'));

// Conexión a Supabase con los datos de las variables de entorno
function nube_config(): array
{
    return [
        'servidor'   => acri_env('DB_HOST') . ':' . acri_env('DB_PORT', '6543'),
        'base'       => acri_env('DB_NAME', 'postgres'),
        'usuario'    => acri_env('DB_USER'),
        'contrasena' => acri_env('DB_PASS'),
    ];
}

// PDO de PostgreSQL que, al abrir cada transacción, le dice a la base quién es el usuario de la sesión
// (acri.usuario, solo para esa transacción): lo lee la bitácora de auditoría (migraciones/001_auditoria.sql).
// Va con set_config(…, true) porque el pooler de Supabase comparte las conexiones entre peticiones.
class AcriPdo extends PDO
{
    #[\ReturnTypeWillChange]
    public function beginTransaction()
    {
        $ok = parent::beginTransaction();
        $usuario = mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50);
        if ($ok && $usuario !== '') $this->prepare("select set_config('acri.usuario', ?, true)")->execute([$usuario]);
        return $ok;
    }
}

function nube_pdo(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = nube_config();
    [$host, $puerto] = explode(':', $c['servidor'], 2);
    $ssl = acri_env('DB_SSLMODE', 'require');
    $pdo = new AcriPdo("pgsql:host=$host;port=$puerto;dbname={$c['base']};sslmode=$ssl", $c['usuario'], $c['contrasena'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_CASE               => PDO::CASE_LOWER,
        // El pooler en modo transacción no admite sentencias preparadas del lado del servidor
        PDO::ATTR_EMULATE_PREPARES   => true,
    ]);
    return $pdo;
}

function nube_consulta(string $sql, array $params = []): PDOStatement
{
    $st = nube_pdo()->prepare($sql);
    $st->execute($params);
    return $st;
}

// Zona para convertir los timestamptz de Supabase (vienen en UTC) a la hora local
function nube_zona(): string
{
    return date_default_timezone_get();
}


// ---------- Sesiones de PHP en la tabla sesiones ----------

class SesionBd implements SessionHandlerInterface
{
    #[\ReturnTypeWillChange]
    public function open($ruta, $nombre) { return true; }

    #[\ReturnTypeWillChange]
    public function close() { return true; }

    #[\ReturnTypeWillChange]
    public function read($id)
    {
        $datos = nube_consulta('select datos from sesiones where id = ? and expira > now()', [$id])->fetchColumn();
        return $datos === false ? '' : (string) $datos;
    }

    #[\ReturnTypeWillChange]
    public function write($id, $datos)
    {
        nube_consulta(
            'insert into sesiones (id, datos, expira) values (?, ?, to_timestamp(?))
             on conflict (id) do update set datos = excluded.datos, expira = excluded.expira',
            [$id, $datos, time() + ACRI_DURACION_SESION]);
        return true;
    }

    #[\ReturnTypeWillChange]
    public function destroy($id)
    {
        nube_consulta('delete from sesiones where id = ?', [$id]);
        return true;
    }

    #[\ReturnTypeWillChange]
    public function gc($vida)
    {
        return nube_consulta('delete from sesiones where expira < now()')->rowCount();
    }
}

// session_start() de todo el sistema: en la nube guarda la sesión en Supabase
function sesionIniciar(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    if (ACRI_NUBE) {
        session_set_save_handler(new SesionBd(), true);
        $https = ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https' || !empty($_SERVER['HTTPS']);
        session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
        ini_set('session.gc_probability', '1');
        ini_set('session.gc_divisor', '100');
    }
    session_start();
}


// ---------- Supabase Storage ----------

function sb_url(): string
{
    $url = rtrim(acri_env('SUPABASE_URL'), '/');
    if ($url === '' || acri_env('SUPABASE_SERVICE_KEY') === '') throw new RuntimeException('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en las variables de entorno.');
    return $url . '/storage/v1';
}

// Ruta dentro del bucket con cada parte codificada
function sb_ruta(string $bucket, string $clave): string
{
    return rawurlencode($bucket) . '/' . implode('/', array_map('rawurlencode', explode('/', $clave)));
}

// Petición a la API de Storage con la service_role key. $cuerpo array = JSON, string = contenido binario
function sb_storage(string $metodo, string $ruta, $cuerpo = null, string $tipo = 'application/json', array $encabezados = []): array
{
    $clave = acri_env('SUPABASE_SERVICE_KEY');
    $h = array_merge(['Authorization: Bearer ' . $clave, 'apikey: ' . $clave], $encabezados);
    $ch = curl_init(sb_url() . '/' . ltrim($ruta, '/'));
    $op = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $metodo,
        CURLOPT_TIMEOUT        => 60,
        CURLOPT_CONNECTTIMEOUT => 10,
    ];
    if ($cuerpo !== null) {
        $op[CURLOPT_POSTFIELDS] = is_array($cuerpo) ? json_encode($cuerpo, JSON_UNESCAPED_UNICODE) : $cuerpo;
        $h[] = 'Content-Type: ' . (is_array($cuerpo) ? 'application/json' : $tipo);
    }
    $op[CURLOPT_HTTPHEADER] = $h;
    curl_setopt_array($ch, $op);
    $resp = curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_errno($ch) ? curl_error($ch) : '';
    curl_close($ch);
    if ($resp === false) throw new RuntimeException('Supabase Storage no respondió: ' . $err);
    $datos = json_decode($resp, true);
    if ($codigo < 200 || $codigo >= 300) {
        $msg = is_array($datos) ? ($datos['message'] ?? $datos['error'] ?? $resp) : $resp;
        throw new RuntimeException("Supabase Storage HTTP $codigo: $msg");
    }
    return is_array($datos) ? $datos : [];
}

function sb_subir(string $bucket, string $clave, string $archivo, string $mime): void
{
    sb_storage('POST', 'object/' . sb_ruta($bucket, $clave), (string) file_get_contents($archivo), $mime, ['x-upsert: false']);
}

function sb_borrar(string $bucket, string $clave): void
{
    sb_storage('DELETE', 'object/' . sb_ruta($bucket, $clave));
}

// URL de un archivo de un bucket público
function sb_publica(string $bucket, string $clave): string
{
    return sb_url() . '/object/public/' . sb_ruta($bucket, $clave);
}

// URL temporal para descargar de un bucket privado; con $descarga el navegador lo guarda con ese nombre
function sb_firmar(string $bucket, string $clave, int $segundos = 120, ?string $descarga = null): string
{
    $d = sb_storage('POST', 'object/sign/' . sb_ruta($bucket, $clave), ['expiresIn' => $segundos]);
    $url = sb_url() . ($d['signedURL'] ?? $d['signedUrl'] ?? '');
    if ($descarga !== null) $url .= '&download=' . rawurlencode($descarga);
    return $url;
}

// URL temporal para que el navegador suba el archivo directo a Storage (Vercel no acepta cuerpos de más de 4.5 MB)
function sb_firmar_subida(string $bucket, string $clave): string
{
    $d = sb_storage('POST', 'object/upload/sign/' . sb_ruta($bucket, $clave));
    if (empty($d['url'])) throw new RuntimeException('Supabase Storage no devolvió la URL de subida.');
    return sb_url() . $d['url'];
}

// Datos de un archivo (tamaño y tipo), o null si no existe
function sb_info(string $bucket, string $clave): ?array
{
    $carpeta = dirname($clave);
    $lista = sb_storage('POST', 'object/list/' . rawurlencode($bucket), [
        'prefix' => $carpeta === '.' ? '' : $carpeta,
        'search' => basename($clave),
        'limit'  => 10,
    ]);
    foreach ($lista as $f) {
        if (($f['name'] ?? '') === basename($clave)) {
            return ['tamano' => (int) ($f['metadata']['size'] ?? 0), 'mime' => (string) ($f['metadata']['mimetype'] ?? '')];
        }
    }
    return null;
}
