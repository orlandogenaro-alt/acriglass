<?php
// Foto del usuario (Panel de usuario y Administrador › Usuarios).
// POST accion=subir + archivo  ·  POST accion=quitar
// usuario=LOGIN (opcional): de otro usuario; solo con ADMIN_USER. Sin él, la del usuario de la sesión.
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';

header('Content-Type: application/json; charset=utf-8');

function responder(array $datos, int $codigo = 200): void
{
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function error(string $mensaje, int $codigo = 400): void
{
    responder(['ok' => false, 'error' => $mensaje], $codigo);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
exigirCsrf();

$mb    = 1024 * 1024;
$max   = 3 * $mb;   // Vercel no acepta peticiones de más de 4.5 MB
$tipos = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'];
$clave = mb_strtolower(trim((string) ($_POST['usuario'] ?? '')));
if ($clave === '' || $clave === mb_strtolower($usuarioSesion)) {
    $clave = mb_strtolower($usuarioSesion);
} else {
    exigirPermiso('ADMIN_USER');
    if (!preg_match('/^[\p{L}\p{N}._@-]{1,60}$/u', $clave)) error('Usuario no válido.');
}
$fotos = configLeer('fotos_usuarios');

// Borra el archivo anterior (solo si está en uploads/sistema o en el bucket "sistema")
function borrarFoto(?string $ruta): void
{
    if (!$ruta) return;
    if (ACRI_NUBE) {
        $prefijo = sb_publica('sistema', '');
        if (strpos($ruta, $prefijo) === 0) {
            try {
                sb_borrar('sistema', rawurldecode(substr($ruta, strlen($prefijo))));
            } catch (Throwable $e) {
                error_log('AcriGlass foto-usuario: ' . $e->getMessage());
            }
        }
    } elseif (strpos($ruta, ACRI_UPLOADS . '/') === 0 && is_file(ACRI_RAIZ . '/' . $ruta)) {
        unlink(ACRI_RAIZ . '/' . $ruta);
    }
}

switch ($_POST['accion'] ?? '') {
    case 'subir':
        $archivo = $_FILES['archivo'] ?? null;
        if (!$archivo || $archivo['error'] === UPLOAD_ERR_NO_FILE) error('No se recibió ningún archivo.');
        if ($archivo['error'] === UPLOAD_ERR_INI_SIZE || $archivo['error'] === UPLOAD_ERR_FORM_SIZE) {
            error('La foto es demasiado grande para el servidor.');
        }
        if ($archivo['error'] !== UPLOAD_ERR_OK) error('Error al subir la foto (código ' . $archivo['error'] . ').');
        if ($archivo['size'] > $max) error('La foto pesa más de 3 MB.');

        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($archivo['tmp_name']);
        if (!isset($tipos[$mime])) error('Formato no permitido. Usa JPG, PNG o WEBP.');
        if (!getimagesize($archivo['tmp_name'])) error('El archivo no es una imagen válida.');

        $base   = preg_replace('/[^a-z0-9]+/', '-', iconv('UTF-8', 'ASCII//TRANSLIT', $clave)) ?: 'usuario';
        $nombre = 'usuario-' . trim($base, '-') . '-' . date('YmdHis') . '-' . bin2hex(random_bytes(3)) . '.' . $tipos[$mime];

        if (ACRI_NUBE) {
            try {
                sb_subir('sistema', $nombre, $archivo['tmp_name'], $mime);
            } catch (Throwable $e) {
                error_log('AcriGlass foto-usuario: ' . $e->getMessage());
                error('No se pudo guardar la foto en Supabase Storage.', 500);
            }
            $nueva = sb_publica('sistema', $nombre);
        } else {
            $carpeta = ACRI_RAIZ . '/' . ACRI_UPLOADS;
            if (!is_dir($carpeta)) mkdir($carpeta, 0775, true);
            if (!move_uploaded_file($archivo['tmp_name'], $carpeta . '/' . $nombre)) {
                error('No se pudo guardar la foto en el servidor.', 500);
            }
            $nueva = ACRI_UPLOADS . '/' . $nombre;
        }

        borrarFoto($fotos[$clave] ?? null);
        $fotos[$clave] = $nueva;
        configGuardar('fotos_usuarios', $fotos);
        responder(['ok' => true, 'foto' => $nueva]);

    case 'quitar':
        borrarFoto($fotos[$clave] ?? null);
        unset($fotos[$clave]);
        configGuardar('fotos_usuarios', $fotos);
        responder(['ok' => true, 'foto' => null]);

    default:
        error('Acción no válida.');
}
