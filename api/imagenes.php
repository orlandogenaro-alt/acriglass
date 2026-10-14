<?php
// Subir / quitar / restablecer las imágenes del sistema (favicon, logo, fondo del login, logo de la hoja membretada).
// POST accion=subir&tipo=favicon|logo|fondo|membrete + archivo
// POST accion=quitar&tipo=...
// POST accion=restablecer
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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    error('Método no permitido.', 405);
}

exigirPermiso('ADMIN_USER');
exigirCsrf();

$mb = 1024 * 1024;
$reglas = [
    'favicon' => ['max' => 1 * $mb, 'tipos' => ['image/png' => 'png', 'image/x-icon' => 'ico', 'image/vnd.microsoft.icon' => 'ico']],
    'logo'    => ['max' => 2 * $mb, 'tipos' => ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp']],
    'fondo'   => ['max' => 8 * $mb, 'tipos' => ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp']],
    'membrete' => ['max' => 2 * $mb, 'tipos' => ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp']],
];

$accion = $_POST['accion'] ?? '';
$tipo   = $_POST['tipo'] ?? '';
$cfg    = sistemaConfig();

// En la nube Vercel no acepta peticiones de más de 4.5 MB
if (ACRI_NUBE) {
    foreach ($reglas as &$r) $r['max'] = min($r['max'], 4 * $mb);
    unset($r);
}

// Borra el archivo propio (solo si está dentro de uploads/sistema o del bucket "sistema") y vuelve a la imagen del sistema
function quitarPropia(array &$cfg, string $tipo): void
{
    $ruta = $cfg['imagenes'][$tipo] ?? null;
    if ($ruta && ACRI_NUBE) {
        $prefijo = sb_publica('sistema', '');
        if (strpos($ruta, $prefijo) === 0) {
            try {
                sb_borrar('sistema', rawurldecode(substr($ruta, strlen($prefijo))));
            } catch (Throwable $e) {
                error_log('AcriGlass quitarPropia: ' . $e->getMessage());
            }
        }
    } elseif ($ruta && strpos($ruta, ACRI_UPLOADS . '/') === 0 && is_file(ACRI_RAIZ . '/' . $ruta)) {
        unlink(ACRI_RAIZ . '/' . $ruta);
    }
    $cfg['imagenes'][$tipo] = null;
}

$aviso = null;

switch ($accion) {
    case 'subir':
        if (!isset($reglas[$tipo])) error('Tipo de imagen no válido.');
        $regla = $reglas[$tipo];
        $archivo = $_FILES['archivo'] ?? null;

        if (!$archivo || $archivo['error'] === UPLOAD_ERR_NO_FILE) error('No se recibió ningún archivo.');
        if ($archivo['error'] === UPLOAD_ERR_INI_SIZE || $archivo['error'] === UPLOAD_ERR_FORM_SIZE) {
            error('El archivo es demasiado grande para el servidor (revisa upload_max_filesize en php.ini).');
        }
        if ($archivo['error'] !== UPLOAD_ERR_OK) error('Error al subir el archivo (código ' . $archivo['error'] . ').');
        if ($archivo['size'] > $regla['max']) error('El archivo pesa más de ' . ($regla['max'] / $mb) . ' MB.');

        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($archivo['tmp_name']);
        if (!isset($regla['tipos'][$mime])) {
            error('Formato no permitido. Usa: ' . strtoupper(implode(', ', array_unique($regla['tipos']))) . '.');
        }
        $ext = $regla['tipos'][$mime];

        if ($ext !== 'ico') {
            $medidas = getimagesize($archivo['tmp_name']);
            if (!$medidas) error('El archivo no es una imagen válida.');
            [$ancho, $alto] = $medidas;

            if ($tipo === 'favicon') {
                if ($ancho !== $alto) error("El favicon debe ser cuadrado (la imagen mide {$ancho}×{$alto} px).");
                if ($ancho < 32) error('El favicon debe medir al menos 32×32 px.');
            }
            if ($tipo === 'fondo' && ($ancho < 1600 || $alto < 900)) {
                $aviso = "La foto mide {$ancho}×{$alto} px; en pantallas grandes puede verse borrosa (recomendado mínimo 1600×900).";
            }
            if ($tipo === 'logo' && $ancho < 300) {
                $aviso = "El logo mide {$ancho} px de ancho; puede verse borroso (recomendado unos 500×170).";
            }
        }

        // Nombre nuevo en cada subida para que el navegador no use la imagen vieja en caché
        $nombre = $tipo . '-' . date('YmdHis') . '-' . bin2hex(random_bytes(3)) . '.' . $ext;

        if (ACRI_NUBE) {
            try {
                sb_subir('sistema', $nombre, $archivo['tmp_name'], $mime);
            } catch (Throwable $e) {
                error_log('AcriGlass api/imagenes: ' . $e->getMessage());
                error('No se pudo guardar el archivo en Supabase Storage.', 500);
            }
            $nueva = sb_publica('sistema', $nombre);
        } else {
            $carpeta = ACRI_RAIZ . '/' . ACRI_UPLOADS;
            if (!is_dir($carpeta)) mkdir($carpeta, 0775, true);
            if (!move_uploaded_file($archivo['tmp_name'], $carpeta . '/' . $nombre)) {
                error('No se pudo guardar el archivo en el servidor.', 500);
            }
            $nueva = ACRI_UPLOADS . '/' . $nombre;
        }

        quitarPropia($cfg, $tipo);
        $cfg['imagenes'][$tipo] = $nueva;
        sistemaGuardar($cfg);
        break;

    case 'quitar':
        if (!isset($reglas[$tipo])) error('Tipo de imagen no válido.');
        quitarPropia($cfg, $tipo);
        sistemaGuardar($cfg);
        break;

    case 'restablecer':
        // Solo las tres de Imagen del Sistema; el logo del membrete se quita desde Hoja Membretada
        foreach (['favicon', 'logo', 'fondo'] as $t) quitarPropia($cfg, $t);
        sistemaGuardar($cfg);
        break;

    default:
        error('Acción no válida.');
}

responder(['ok' => true, 'aviso' => $aviso, 'imagenes' => estadoImagenes()]);
