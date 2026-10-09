<?php
// Conexiones a bases de datos (Administrador › Bases de datos, config/bases-datos.json).
//
//   $pdo  = bd_pdo('AW');                                         PDO listo para usar
//   $rows = bd_filas('AW', 'select ... where obra_id = ?', [$id]); filas en UTF-8, llaves en minúsculas
//   $row  = bd_fila(...)  ·  $valor = bd_valor(...)
//
// Las bases de Firebird de Easy-Glass / AW / Microsip tienen juego de caracteres NONE:
// el texto se guarda en Windows-1252, así que aquí se convierte de ida y vuelta a UTF-8.
//
// Si una conexión no tiene contraseña capturada aquí, se usa la de Easy-Glass Boss
// (misma clave en su config/bases_datos.config.php). No se copia a config/bases-datos.json.
//
// En la nube (Vercel) AW es Supabase: sus datos salen de las variables de entorno (nube_config())
// y nunca se guardan en la tabla configuracion.
require_once __DIR__ . '/sistema.php';

const ACRI_MOTORES = [
    'firebird' => 'Firebird / InterBase',
    'odbc'     => 'ODBC (DSN del sistema)',
    'mysql'    => 'MySQL / MariaDB',
    'pgsql'    => 'PostgreSQL / Supabase',
];

define('ACRI_EASYGLASS_BD', dirname(ACRI_RAIZ) . '/Easy-glass php/config/bases_datos.config.php');

function bd_conexiones(): array
{
    $todas = configLeer('bases-datos');
    if (ACRI_NUBE) {
        $todas['AW'] = nube_config() + [
            'nombre'  => 'AW-Management (Supabase)',
            'motor'   => 'pgsql',
            'charset' => '',
            'sistema' => true,
            'activa'  => true,
            'notas'   => 'Variables de entorno DB_HOST, DB_PORT, DB_NAME, DB_USER y DB_PASS de Vercel.',
            'de_entorno' => true,
        ];
    }
    return $todas;
}

// Guarda las conexiones sin las que vienen de variables de entorno
function bd_guardar(array $todas): void
{
    configGuardar('bases-datos', array_filter($todas, fn($c) => empty($c['de_entorno'])));
}

// Conexiones de Easy-Glass Boss por clave (vacío si no está instalado en este servidor)
function bd_easyglass(): array
{
    static $porClave = null;
    if ($porClave !== null) return $porClave;
    $porClave = [];
    if (!is_file(ACRI_EASYGLASS_BD)) return $porClave;
    try {
        $raw = include ACRI_EASYGLASS_BD;
    } catch (Throwable $e) {
        error_log('AcriGlass bd_easyglass: ' . $e->getMessage());
        return $porClave;
    }
    foreach ($raw['conexiones'] ?? [] as $c) {
        $porClave[strtoupper(trim((string) ($c['clave'] ?? '')))] = $c;
    }
    return $porClave;
}

// Sin contraseña propia: toma la de Easy-Glass Boss si es el mismo usuario (o no hay usuario)
function bd_completar(string $clave, array $c): array
{
    if (($c['contrasena'] ?? '') !== '') return $c;
    $eg = bd_easyglass()[strtoupper($clave)] ?? null;
    if (!$eg || (string) ($eg['password'] ?? '') === '') return $c;
    $usuario = trim((string) ($c['usuario'] ?? ''));
    if ($usuario !== '' && strcasecmp($usuario, trim((string) ($eg['usuario'] ?? ''))) !== 0) return $c;
    $c['usuario']      = $usuario !== '' ? $usuario : (string) $eg['usuario'];
    $c['contrasena']   = (string) $eg['password'];
    $c['de_easyglass'] = true;
    return $c;
}

function bd_config(string $clave): array
{
    $todas = bd_conexiones();
    if (!isset($todas[$clave])) throw new RuntimeException("No existe la conexión '$clave' (Administrador › Bases de datos).");
    return bd_completar($clave, $todas[$clave]);
}

// true cuando el texto viaja en Windows-1252 y hay que convertirlo
function bd_convierte(array $c): bool
{
    return in_array(strtoupper($c['charset'] ?? ''), ['NONE', 'WIN1252', 'ISO8859_1'], true);
}

function bd_dsn(array $c): string
{
    switch ($c['motor'] ?? '') {
        case 'firebird':
            [$host, $puerto] = array_pad(explode(':', $c['servidor'], 2), 2, '3050');
            $dsn = "firebird:dbname={$host}/{$puerto}:{$c['base']}";
            $cs = strtoupper($c['charset'] ?? '');
            return $cs !== '' && $cs !== 'NONE' ? "$dsn;charset=$cs" : $dsn;
        case 'odbc':
            return 'odbc:' . $c['base'];
        case 'mysql':
            [$host, $puerto] = array_pad(explode(':', $c['servidor'], 2), 2, '3306');
            return "mysql:host=$host;port=$puerto;dbname={$c['base']};charset=utf8mb4";
        case 'pgsql':
            [$host, $puerto] = array_pad(explode(':', $c['servidor'], 2), 2, '5432');
            return "pgsql:host=$host;port=$puerto;dbname={$c['base']};sslmode=require";
    }
    throw new RuntimeException('Motor de base de datos no soportado: ' . ($c['motor'] ?? '(vacío)'));
}

// Abre una conexión nueva con la configuración dada (sin caché)
function bd_abrir(array $c): PDO
{
    if (!empty($c['de_entorno'])) return nube_pdo();
    $opciones = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_CASE               => PDO::CASE_LOWER,
    ];
    // El pooler de Supabase (modo transacción) no admite sentencias preparadas del lado del servidor
    if (($c['motor'] ?? '') === 'pgsql') $opciones[PDO::ATTR_EMULATE_PREPARES] = true;
    return new PDO(bd_dsn($c), $c['usuario'] ?? '', $c['contrasena'] ?? '', $opciones);
}

function bd_pdo(string $clave): PDO
{
    static $abiertas = [];
    if (!isset($abiertas[$clave])) {
        $c = bd_config($clave);
        if (empty($c['activa'])) throw new RuntimeException("La conexión '$clave' está desactivada.");
        $abiertas[$clave] = bd_abrir($c);
    }
    return $abiertas[$clave];
}

function bd_texto_entrada(array $c, array $params): array
{
    if (!bd_convierte($c)) return $params;
    return array_map(fn($v) => is_string($v) ? mb_convert_encoding($v, 'Windows-1252', 'UTF-8') : $v, $params);
}

// $binarias: columnas (en minúsculas) que no se convierten, p. ej. imágenes
function bd_filas(string $clave, string $sql, array $params = [], array $binarias = []): array
{
    $c = bd_config($clave);
    $st = bd_pdo($clave)->prepare($sql);
    $st->execute(bd_texto_entrada($c, $params));
    $convierte = bd_convierte($c);
    $filas = [];
    while ($f = $st->fetch()) {
        foreach ($f as $k => $v) {
            // PostgreSQL entrega los bytea como stream
            if (is_resource($v)) $v = $f[$k] = stream_get_contents($v);
            if (!is_string($v) || in_array($k, $binarias, true)) continue;
            if ($convierte) $v = mb_convert_encoding($v, 'UTF-8', 'Windows-1252');
            $f[$k] = rtrim($v);   // los CHAR de Firebird vienen rellenos de espacios
        }
        $filas[] = $f;
    }
    return $filas;
}

function bd_fila(string $clave, string $sql, array $params = [], array $binarias = []): ?array
{
    return bd_filas($clave, $sql, $params, $binarias)[0] ?? null;
}

function bd_valor(string $clave, string $sql, array $params = [])
{
    $f = bd_fila($clave, $sql, $params);
    return $f ? reset($f) : null;
}

// insert / update / delete; regresa los renglones afectados
function bd_ejecutar(string $clave, string $sql, array $params = []): int
{
    $st = bd_pdo($clave)->prepare($sql);
    $st->execute(bd_texto_entrada(bd_config($clave), $params));
    return $st->rowCount();
}

// Inserta un renglón y regresa su id. En Firebird el id sale de GEN_ID($generador) (ID_CATALOGOS por omisión,
// igual que los triggers de AW); en Supabase, de la columna identity.
function bd_insertar(string $clave, string $tabla, string $colId, array $campos, string $generador = 'id_catalogos'): int
{
    if (bd_motor($clave) === 'firebird') {
        if (!preg_match('/^[a-z_][a-z0-9_$]*$/i', $generador)) throw new InvalidArgumentException('Generador no válido.');
        $id = (int) bd_valor($clave, "select gen_id($generador, 1) from rdb\$database");
        $campos = [$colId => $id] + $campos;
        bd_ejecutar($clave, "insert into $tabla (" . implode(', ', array_keys($campos)) . ') values ('
            . implode(', ', array_fill(0, count($campos), '?')) . ')', array_values($campos));
        return $id;
    }
    return (int) bd_valor($clave, "insert into $tabla (" . implode(', ', array_keys($campos)) . ') values ('
        . implode(', ', array_fill(0, count($campos), '?')) . ") returning $colId", array_values($campos));
}

// Motor de la conexión ('firebird', 'pgsql', …); en la nube AW es Supabase
function bd_motor(string $clave): string
{
    $c = bd_config($clave);
    return !empty($c['de_entorno']) ? 'pgsql' : (string) ($c['motor'] ?? '');
}

// true si la tabla tiene la columna (las bases de AW y Supabase no son idénticas)
function bd_tiene_columna(string $clave, string $tabla, string $columna): bool
{
    static $cache = [];
    $k = "$clave.$tabla.$columna";
    if (isset($cache[$k])) return $cache[$k];
    switch (bd_motor($clave)) {
        case 'firebird':
            $sql = 'select count(*) from rdb$relation_fields where rdb$relation_name = ? and rdb$field_name = ?';
            $p = [strtoupper($tabla), strtoupper($columna)];
            break;
        case 'pgsql':
            $sql = 'select count(*) from information_schema.columns where table_name = ? and column_name = ?';
            $p = [strtolower($tabla), strtolower($columna)];
            break;
        default:
            $sql = 'select count(*) from information_schema.columns where table_name = ? and column_name = ?';
            $p = [$tabla, $columna];
    }
    return $cache[$k] = (int) bd_valor($clave, $sql, $p) > 0;
}

// Prueba una configuración: abre la conexión y pide la versión del servidor
function bd_probar(array $c): array
{
    $inicio = microtime(true);
    try {
        $pdo = bd_abrir($c);
        $sql = [
            'firebird' => "select rdb\$get_context('SYSTEM', 'ENGINE_VERSION') from rdb\$database",
            'odbc'     => 'select @@version',
            'mysql'    => 'select version()',
            'pgsql'    => 'select version()',
        ][$c['motor']];
        $version = trim(strtok((string) $pdo->query($sql)->fetchColumn(), "\n"));
        return ['ok' => true, 'mensaje' => 'Conectado · ' . $version, 'ms' => (int) round((microtime(true) - $inicio) * 1000)];
    } catch (Throwable $e) {
        return ['ok' => false, 'mensaje' => bd_mensaje_error($e), 'ms' => (int) round((microtime(true) - $inicio) * 1000)];
    }
}

// Mensaje de error legible (sin la ruta de la contraseña ni basura del driver)
function bd_mensaje_error(Throwable $e): string
{
    $m = $e->getMessage();
    // Los drivers de Windows (ODBC, Firebird) responden en Windows-1252
    if (!mb_check_encoding($m, 'UTF-8')) $m = mb_convert_encoding($m, 'UTF-8', 'Windows-1252');
    $m = preg_replace('/\s+/u', ' ', $m);
    $m = preg_replace('/^SQLSTATE\[[^\]]*\]:?\s*/', '', $m);
    if (stripos($m, 'password') !== false || stripos($m, 'login') !== false) return 'Usuario o contraseña incorrectos. ' . $m;
    return $m;
}
