<?php
// Archivos adjuntos de los Conceptos/Tareas de un presupuesto de obra.
// carpeta = P<id del presupuesto>  ·  T<16 hex> mientras el presupuesto no se ha guardado
// tarea   = clave del Concepto/Tarea (MP-10-003, TA-10-001…)
// GET  ?accion=lista&carpeta=…&tarea=…
// GET  ?accion=conteo&carpeta=…                 archivos por tarea
// GET  ?accion=descargar&carpeta=…&tarea=…&archivo=…
// POST accion=subir&carpeta=…&tarea=… + archivos[]                 (servidor local)
// POST accion=preparar&carpeta=…&tarea=…&archivos=[{nombre,tamano}]   URLs para subir directo a Supabase (nube)
// POST accion=confirmar&carpeta=…&tarea=…&archivos=[{ruta,nombre}]    registra lo que ya se subió (nube)
// POST accion=quitar&carpeta=…&tarea=…&archivo=…
//
// En el servidor local se guardan en uploads/presupuestos/<carpeta>/<tarea>/. En la nube van al bucket
// privado "adjuntos" de Supabase Storage con un nombre aleatorio, y el nombre real queda en la tabla
// adjuntos_presupuesto. El navegador los sube directo a Storage porque Vercel no acepta peticiones de más de 4.5 MB.
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/respuesta.php';

exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'CERRAR_OBRA', 'ADMIN_USER');
// Subir, preparar, confirmar y quitar cambian datos: token de la página y permiso de captura (no basta con consultar)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    exigirCsrf();
    exigirPermiso('NUEVO_SUGERIDO_OBRA', 'MODIFICAR_SUGERIDO_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'ADMIN_USER');
}
session_write_close();

const ADJ_MAX_MB = 25;
const ADJ_BUCKET = 'adjuntos';
// Nunca se aceptan archivos que el servidor o Windows pudieran ejecutar
const ADJ_PROHIBIDAS = ['php', 'phtml', 'phar', 'php3', 'php4', 'php5', 'php7', 'php8', 'pl', 'py', 'cgi', 'sh', 'exe', 'bat',
                        'cmd', 'com', 'msi', 'js', 'vbs', 'ps1', 'jar', 'scr', 'htaccess', 'html', 'htm', 'svg'];

$p = $_SERVER['REQUEST_METHOD'] === 'POST' ? $_POST : $_GET;
$accion = $p['accion'] ?? '';

$carpeta = (string) ($p['carpeta'] ?? '');
if (!preg_match('/^(P\d{1,10}|T[a-f0-9]{16})$/', $carpeta)) error('Carpeta no válida.');
$base = ACRI_RAIZ . '/uploads/presupuestos';
if (!ACRI_NUBE) asegurarBase($base);

function asegurarBase(string $base): void
{
    if (!is_dir($base)) mkdir($base, 0775, true);
    // Los archivos solo se entregan por este script (con sesión), nunca directo
    if (!is_file($base . '/.htaccess')) file_put_contents($base . '/.htaccess', "Require all denied\n");
}

function tareaValida(string $tarea): string
{
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9.\-]{0,39}$/', $tarea)) error('Clave de Concepto/Tarea no válida.');
    return $tarea;
}

function dirTarea(string $base, string $carpeta, string $tarea): string
{
    return $base . '/' . $carpeta . '/' . tareaValida($tarea);
}

function nombreArchivo(string $nombre): string
{
    $nombre = basename(str_replace('\\', '/', $nombre));
    if ($nombre === '' || $nombre[0] === '.' || !preg_match('/^[^<>:"\/\\\\|?*\x00-\x1f]{1,150}$/u', $nombre)) error('Nombre de archivo no válido.');
    return $nombre;
}

// Mensaje de error si el archivo no se puede adjuntar (tamaño o tipo), null si está bien
function rechazo(string $nombre, int $tamano): ?string
{
    if ($tamano > ADJ_MAX_MB * 1024 * 1024) return "$nombre: pesa más de " . ADJ_MAX_MB . ' MB.';
    if (in_array(strtolower(pathinfo($nombre, PATHINFO_EXTENSION)), ADJ_PROHIBIDAS, true)) return "$nombre: tipo de archivo no permitido.";
    return null;
}

// Si ya existe uno con el mismo nombre se numera: plano (2).pdf
function nombreLibre(string $nombre, callable $existe): string
{
    $ext = strtolower(pathinfo($nombre, PATHINFO_EXTENSION));
    $destino = $nombre;
    for ($n = 2; $existe($destino); $n++) {
        $destino = pathinfo($nombre, PATHINFO_FILENAME) . " ($n)" . ($ext !== '' ? ".$ext" : '');
    }
    return $destino;
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

function listarNube(string $carpeta, string $tarea): array
{
    $filas = nube_consulta(
        "select nombre, tamano, to_char(fecha at time zone ?, 'YYYY-MM-DD HH24:MI') as fecha
           from adjuntos_presupuesto where carpeta = ? and tarea = ? order by nombre",
        [nube_zona(), $carpeta, $tarea])->fetchAll();
    foreach ($filas as &$f) $f['tamano'] = (int) $f['tamano'];
    return $filas;
}

function adjuntoNube(string $carpeta, string $tarea, string $nombre): ?array
{
    $f = nube_consulta('select adjunto_id, ruta_storage, mime from adjuntos_presupuesto where carpeta = ? and tarea = ? and nombre = ?',
        [$carpeta, $tarea, $nombre])->fetch();
    return $f ?: null;
}

// Lista JSON de archivos que manda el navegador en preparar / confirmar
function listaEntrada(array $p): array
{
    $lista = json_decode((string) ($p['archivos'] ?? ''), true);
    if (!is_array($lista) || !$lista) error('No se recibió ningún archivo.');
    return array_values($lista);
}

try {
    switch ($accion) {
        case 'conteo':
            $conteo = [];
            if (ACRI_NUBE) {
                foreach (nube_consulta('select tarea, count(*) as n from adjuntos_presupuesto where carpeta = ? group by tarea', [$carpeta]) as $f) {
                    $conteo[$f['tarea']] = (int) $f['n'];
                }
            } else {
                foreach (is_dir("$base/$carpeta") ? scandir("$base/$carpeta") : [] as $t) {
                    if ($t[0] === '.' || !is_dir("$base/$carpeta/$t")) continue;
                    $n = count(listar("$base/$carpeta/$t"));
                    if ($n) $conteo[$t] = $n;
                }
            }
            responder(['ok' => true, 'conteo' => (object) $conteo]);

        case 'lista':
            $tarea = tareaValida((string) ($p['tarea'] ?? ''));
            responder(['ok' => true, 'archivos' => ACRI_NUBE ? listarNube($carpeta, $tarea) : listar("$base/$carpeta/$tarea")]);

        case 'descargar':
            $tarea = tareaValida((string) ($p['tarea'] ?? ''));
            $nombre = nombreArchivo((string) ($p['archivo'] ?? ''));
            if (ACRI_NUBE) {
                $a = adjuntoNube($carpeta, $tarea, $nombre);
                if (!$a) error('El archivo ya no existe.', 404);
                // Imágenes y PDF se ven en el navegador; lo demás se descarga con su nombre real
                $enLinea = preg_match('#^(image/(png|jpeg|gif|webp)|application/pdf)$#', (string) $a['mime']);
                header('Location: ' . sb_firmar(ADJ_BUCKET, $a['ruta_storage'], 120, $enLinea ? null : $nombre), true, 302);
                exit;
            }
            $ruta = "$base/$carpeta/$tarea/$nombre";
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
            if (ACRI_NUBE) error('En la nube los archivos se suben directo a Supabase (accion=preparar).');
            $dir = dirTarea($base, $carpeta, (string) ($p['tarea'] ?? ''));
            $f = $_FILES['archivos'] ?? null;
            if (!$f || !is_array($f['name'])) error('No se recibió ningún archivo.');
            if (!is_dir($dir)) mkdir($dir, 0775, true);
            $errores = [];
            foreach ($f['name'] as $i => $nombre) {
                if ($f['error'][$i] === UPLOAD_ERR_INI_SIZE || $f['error'][$i] === UPLOAD_ERR_FORM_SIZE) { $errores[] = "$nombre: es demasiado grande para el servidor."; continue; }
                if ($f['error'][$i] !== UPLOAD_ERR_OK) { $errores[] = "$nombre: error al subir (código {$f['error'][$i]})."; continue; }
                $nombre = nombreArchivo($nombre);
                if ($msg = rechazo($nombre, (int) $f['size'][$i])) { $errores[] = $msg; continue; }
                $destino = nombreLibre($nombre, fn($n) => is_file("$dir/$n"));
                if (!move_uploaded_file($f['tmp_name'][$i], "$dir/$destino")) $errores[] = "$nombre: no se pudo guardar en el servidor.";
            }
            responder(['ok' => true, 'errores' => $errores, 'archivos' => listar($dir)]);

        case 'preparar':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
            // En el servidor local el navegador manda los archivos con accion=subir
            if (!ACRI_NUBE) responder(['ok' => true, 'directo' => false]);
            $tarea = tareaValida((string) ($p['tarea'] ?? ''));
            $subidas = [];
            $errores = [];
            foreach (listaEntrada($p) as $i => $a) {
                $nombre = nombreArchivo((string) ($a['nombre'] ?? ''));
                if ($msg = rechazo($nombre, (int) ($a['tamano'] ?? 0))) { $errores[] = $msg; continue; }
                $ext = strtolower(pathinfo($nombre, PATHINFO_EXTENSION));
                $ruta = "$carpeta/$tarea/" . bin2hex(random_bytes(8)) . (preg_match('/^[a-z0-9]{1,10}$/', $ext) ? ".$ext" : '');
                $subidas[] = ['indice' => $i, 'ruta' => $ruta, 'url' => sb_firmar_subida(ADJ_BUCKET, $ruta)];
            }
            responder(['ok' => true, 'directo' => true, 'subidas' => $subidas, 'errores' => $errores]);

        case 'confirmar':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
            if (!ACRI_NUBE) error('Acción no válida.');
            $tarea = tareaValida((string) ($p['tarea'] ?? ''));
            $errores = [];
            foreach (listaEntrada($p) as $a) {
                $ruta = (string) ($a['ruta'] ?? '');
                if (!preg_match('#^' . preg_quote("$carpeta/$tarea/", '#') . '[a-f0-9]{16}(\.[a-z0-9]{1,10})?$#', $ruta)) error('Ruta de archivo no válida.');
                $nombre = nombreArchivo((string) ($a['nombre'] ?? ''));
                $info = sb_info(ADJ_BUCKET, $ruta);
                if (!$info) { $errores[] = "$nombre: no llegó a Supabase Storage."; continue; }
                if ($msg = rechazo($nombre, $info['tamano'])) {
                    sb_borrar(ADJ_BUCKET, $ruta);
                    $errores[] = $msg;
                    continue;
                }
                $destino = nombreLibre($nombre, fn($n) => adjuntoNube($carpeta, $tarea, $n) !== null);
                nube_consulta('insert into adjuntos_presupuesto (carpeta, tarea, nombre, ruta_storage, tamano, mime, usuario) values (?, ?, ?, ?, ?, ?, ?)',
                    [$carpeta, $tarea, $destino, $ruta, $info['tamano'], $info['mime'], $usuarioSesion]);
            }
            responder(['ok' => true, 'errores' => $errores, 'archivos' => listarNube($carpeta, $tarea)]);

        case 'quitar':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
            $tarea = tareaValida((string) ($p['tarea'] ?? ''));
            $nombre = nombreArchivo((string) ($p['archivo'] ?? ''));
            if (ACRI_NUBE) {
                $a = adjuntoNube($carpeta, $tarea, $nombre);
                if ($a) {
                    sb_borrar(ADJ_BUCKET, $a['ruta_storage']);
                    nube_consulta('delete from adjuntos_presupuesto where adjunto_id = ?', [$a['adjunto_id']]);
                }
                responder(['ok' => true, 'archivos' => listarNube($carpeta, $tarea)]);
            }
            $ruta = "$base/$carpeta/$tarea/$nombre";
            if (is_file($ruta) && !unlink($ruta)) error('No se pudo borrar el archivo.', 500);
            responder(['ok' => true, 'archivos' => listar("$base/$carpeta/$tarea")]);
    }
} catch (Throwable $e) {
    error_log('AcriGlass api/adjuntos: ' . $e->getMessage());
    error('No se pudo completar la operación con los archivos: ' . $e->getMessage(), 500);
}
error('Acción no válida.');
