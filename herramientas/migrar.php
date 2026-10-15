<?php
// Migraciones de Supabase (carpeta migraciones/, archivos NNN_nombre.sql en orden).
// Solo desde la línea de comandos; nunca se publica en Vercel (.vercelignore).
//
//   php herramientas/migrar.php                         lista aplicadas y pendientes (no cambia nada)
//   php herramientas/migrar.php --aplicar               aplica las pendientes, cada una en su transacción
//   php herramientas/migrar.php --env .env.pruebas …    toma la conexión de ese archivo (KEY=valor)
//
// Conexión: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS (y DB_SSLMODE), las mismas variables de Vercel.
// Para producción usa el puerto directo o el pooler de sesión (5432): el de transacción (6543) también sirve,
// pero es mejor no correr DDL a través de él. Pruébalas primero en la base de pruebas.
//
// Lo aplicado queda en la tabla migraciones_aplicadas con el checksum del archivo; si un archivo ya aplicado
// cambia, se avisa y no se vuelve a correr (los cambios van en una migración nueva).
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$args = array_slice($argv, 1);
$aplicar = in_array('--aplicar', $args, true);
$i = array_search('--env', $args, true);
if ($i !== false) {
    $archivo = $args[$i + 1] ?? '';
    if (!is_file($archivo)) { fwrite(STDERR, "No existe el archivo $archivo\n"); exit(2); }
    foreach (file($archivo, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $l) {
        if ($l[0] === '#' || strpos($l, '=') === false) continue;
        [$k, $v] = array_map('trim', explode('=', $l, 2));
        putenv("$k=" . trim($v, "\"'"));
    }
}

require __DIR__ . '/../includes/nube.php';
if (!ACRI_NUBE) { fwrite(STDERR, "Falta DB_HOST (variables de entorno o --env archivo).\n"); exit(2); }

try {
    $pdo = nube_pdo();
} catch (Throwable $e) {
    fwrite(STDERR, 'No se pudo conectar: ' . $e->getMessage() . "\n");
    exit(2);
}
$destino = acri_env('DB_USER') . '@' . acri_env('DB_HOST') . ':' . acri_env('DB_PORT', '6543') . '/' . acri_env('DB_NAME', 'postgres');
echo "Base: $destino\n\n";

$pdo->exec('CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
    nombre    VARCHAR(100) PRIMARY KEY,
    checksum  CHAR(64) NOT NULL,
    fecha     TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario   VARCHAR(100)
)');
$pdo->exec('ALTER TABLE migraciones_aplicadas ENABLE ROW LEVEL SECURITY');

// Checksum del archivo sin importar los fines de línea (Windows / Git pueden cambiarlos de LF a CRLF)
function checksum(string $archivo): string
{
    return hash('sha256', str_replace("
", "
", (string) file_get_contents($archivo)));
}

$aplicadas = [];
foreach ($pdo->query('select nombre, checksum from migraciones_aplicadas') as $f) $aplicadas[$f['nombre']] = $f['checksum'];

$archivos = glob(__DIR__ . '/../migraciones/[0-9][0-9][0-9]_*.sql');
sort($archivos, SORT_STRING);
$pendientes = [];
foreach ($archivos as $a) {
    $nombre = basename($a);
    $suma = checksum($a);
    if (!isset($aplicadas[$nombre])) {
        $pendientes[$nombre] = $a;
        echo "  pendiente  $nombre\n";
    } elseif ($aplicadas[$nombre] !== $suma) {
        echo "  CAMBIÓ     $nombre  (ya estaba aplicada; el cambio no se corre: hazlo en una migración nueva)\n";
    } else {
        echo "  aplicada   $nombre\n";
    }
}
foreach (array_diff_key($aplicadas, array_flip(array_map('basename', $archivos))) as $nombre => $_) {
    echo "  ¿?         $nombre  (aplicada en la base, pero el archivo ya no existe)\n";
}

if (!$pendientes) { echo "\nNo hay migraciones pendientes.\n"; exit(0); }
if (!$aplicar) { echo "\n" . count($pendientes) . " pendiente(s). Para aplicarlas: php herramientas/migrar.php --aplicar\n"; exit(0); }

$quien = trim((string) (getenv('USERNAME') ?: getenv('USER') ?: '')) ?: null;
foreach ($pendientes as $nombre => $a) {
    echo "\nAplicando $nombre … ";
    $pdo->beginTransaction();
    try {
        $pdo->exec((string) file_get_contents($a));
        $pdo->prepare('insert into migraciones_aplicadas (nombre, checksum, usuario) values (?, ?, ?)')
            ->execute([$nombre, checksum($a), $quien]);
        $pdo->commit();
        echo "listo";
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        echo "FALLÓ\n  " . $e->getMessage() . "\nNo se aplicó nada de $nombre; las siguientes tampoco.\n";
        exit(1);
    }
}
echo "\n\nListo.\n";
