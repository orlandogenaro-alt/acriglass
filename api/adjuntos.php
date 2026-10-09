<?php
// Archivos adjuntos de los Conceptos/Tareas de un presupuesto de obra.
// carpeta = P<id del presupuesto>  ·  T<16 hex> mientras el presupuesto no se ha guardado
// tarea   = clave del Concepto/Tarea (MP-10-003, TA-10-001…)
// GET  ?accion=lista&carpeta=…&tarea=…
// GET  ?accion=conteo&carpeta=…                 archivos por tarea
// GET  ?accion=descargar&carpeta=…&tarea=…&archivo=…
// POST accion=subir&carpeta=…&tarea=… + archivos[]
// POST accion=quitar&carpeta=…&tarea=…&archivo=…
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/respuesta.php';

exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'CERRAR_OBRA', 'ADMIN_USER');
session_write_close();

const ADJ_MAX_MB = 25;
// Nunca se aceptan archivos que el servidor o Windows pudieran ejecutar
const ADJ_PROHIBIDAS = ['php', 'phtml', 'phar', 'php3', 'php4', 'php5', 'php7', 'php8', 'pl', 'py', 'cgi', 'sh', 'exe', 'bat',
                        'cmd', 'com', 'msi', 'js', 'vbs', 'ps1', 'jar', 'scr', 'htaccess', 'html', 'htm', 'svg'];

$p = $_SERVER['REQUEST_METHOD'] === 'POST' ? $_POST : $_GET;
$accion = $p['accion'] ?? '';

$carpeta = (string) ($p['carpeta'] ?? '');
if (!preg_match('/^(P\d{1,10}|T[a-f0-9]{16})$/', $carpeta)) error('Carpeta no válida.');
$base = ACRI_RAIZ . '/uploads/presupuestos';
asegurarBase($base);

function asegurarBase(string $base): void
{
    if (!is_dir($base)) mkdir($base, 0775, true);
    // Los archivos solo se entregan por este script (con sesión), nunca directo
    if (!is_file($base . '/.htaccess')) file_put_contents($base . '/.htaccess', "Require all denied\n");
}

function dirTarea(string $base, string $carpeta, string $tarea): string
{
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9.\-]{0,39}$/', $tarea)) error('Clave de Concepto/Tarea no válida.');
    return $base . '/' . $carpeta . '/' . $tarea;
}

function nombreArchivo(string $nombre): string
{
    $nombre = basename(str_replace('\\', '/', $nombre));
    if ($nombre === '' || $nombre[0] === '.' || !preg_match('/^[^<>:"\/\\\\|?*\x00-\x1f]{1,150}$/u', $nombre)) error('Nombre de archivo no válido.');
    return $nombre;
}

function listar(string $dir): array
{
    $archivos = [];
    foreach (is_dir($dir) ? scandir($dir) : [] as $f) {
        if ($f[0] === '.' || !is_file("$dir/$f")) continue;
        $archivos[] = ['nombre' => $f, 'tamano' => filesize("$dir/$f"), 'fecha' => date('Y-m-d H:i', filemtime("$dir/$f"))];
    }
    return $archivos;
}

switch ($accion) {
    case 'conteo':
        $conteo = [];
        foreach (is_dir("$base/$carpeta") ? scandir("$base/$carpeta") : [] as $t) {
            if ($t[0] === '.' || !is_dir("$base/$carpeta/$t")) continue;
            $n = count(listar("$base/$carpeta/$t"));
            if ($n) $conteo[$t] = $n;
        }
        responder(['ok' => true, 'conteo' => (object) $conteo]);

    case 'lista':
        responder(['ok' => true, 'archivos' => listar(dirTarea($base, $carpeta, (string) ($p['tarea'] ?? '')))]);

    case 'descargar':
        $ruta = dirTarea($base, $carpeta, (string) ($p['tarea'] ?? '')) . '/' . nombreArchivo((string) ($p['archivo'] ?? ''));
        if (!is_file($ruta)) error('El archivo ya no existe.', 404);
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($ruta) ?: 'application/octet-stream';
        // Imágenes y PDF se ven en el navegador; lo demás se descarga
        $enLinea = preg_match('#^(image/(png|jpeg|gif|webp)|application/pdf)$#', $mime);
        header_remove('Content-Type');
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($ruta));
        header('X-Content-Type-Options: nosniff');
        header('Content-Disposition: ' . ($enLinea ? 'inline' : 'attachment') . "; filename*=UTF-8''" . rawurlencode(basename($ruta)));
        readfile($ruta);
        exit;

    case 'subir':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
        $dir = dirTarea($base, $carpeta, (string) ($p['tarea'] ?? ''));
        $f = $_FILES['archivos'] ?? null;
        if (!$f || !is_array($f['name'])) error('No se recibió ningún archivo.');
        if (!is_dir($dir)) mkdir($dir, 0775, true);
        $errores = [];
        foreach ($f['name'] as $i => $nombre) {
            if ($f['error'][$i] === UPLOAD_ERR_INI_SIZE || $f['error'][$i] === UPLOAD_ERR_FORM_SIZE) { $errores[] = "$nombre: es demasiado grande para el servidor."; continue; }
            if ($f['error'][$i] !== UPLOAD_ERR_OK) { $errores[] = "$nombre: error al subir (código {$f['error'][$i]})."; continue; }
            if ($f['size'][$i] > ADJ_MAX_MB * 1024 * 1024) { $errores[] = "$nombre: pesa más de " . ADJ_MAX_MB . ' MB.'; continue; }
            $nombre = nombreArchivo($nombre);
            $ext = strtolower(pathinfo($nombre, PATHINFO_EXTENSION));
            if (in_array($ext, ADJ_PROHIBIDAS, true)) { $errores[] = "$nombre: tipo de archivo no permitido."; continue; }
            // Si ya existe uno con el mismo nombre se numera: plano (2).pdf
            $destino = $nombre;
            for ($n = 2; is_file("$dir/$destino"); $n++) {
                $destino = pathinfo($nombre, PATHINFO_FILENAME) . " ($n)" . ($ext !== '' ? ".$ext" : '');
            }
            if (!move_uploaded_file($f['tmp_name'][$i], "$dir/$destino")) $errores[] = "$nombre: no se pudo guardar en el servidor.";
        }
        responder(['ok' => true, 'errores' => $errores, 'archivos' => listar($dir)]);

    case 'quitar':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
        $dir = dirTarea($base, $carpeta, (string) ($p['tarea'] ?? ''));
        $ruta = $dir . '/' . nombreArchivo((string) ($p['archivo'] ?? ''));
        if (is_file($ruta) && !unlink($ruta)) error('No se pudo borrar el archivo.', 500);
        responder(['ok' => true, 'archivos' => listar($dir)]);
}
error('Acción no válida.');
