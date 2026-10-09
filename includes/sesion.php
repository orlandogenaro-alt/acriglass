<?php
// Incluir al inicio de toda página que requiera sesión iniciada.
// Si se define ACRI_API antes de incluirlo, responde JSON 401 en lugar de redirigir.
require_once __DIR__ . '/sistema.php';

session_start();

if (empty($_SESSION['usuario']) || ($_SESSION['expira'] ?? 0) <= time()) {
    session_unset();
    session_destroy();
    if (defined('ACRI_API')) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'La sesión expiró. Vuelve a iniciar sesión.']);
        exit;
    }
    // Dentro de una pestaña (iframe) se manda al login la ventana completa
    echo '<script>(window.top || window).location.href = "index.php";</script>';
    exit;
}

$usuarioSesion = $_SESSION['usuario'];

if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));

// Permisos de AW-Management (PERMISOS_USUARIOS): columnas con 'T'
function tienePermiso(string ...$permisos): bool
{
    foreach ($permisos as $p) {
        if (!empty($_SESSION['permisos'][$p])) return true;
    }
    return false;
}

// Modo configuración: aún no hay contraseña para AW y se entró desde el propio servidor
function modoConfiguracion(): bool
{
    return !empty($_SESSION['modo_config']);
}

function exigirPermiso(string ...$permisos): void
{
    if (tienePermiso(...$permisos)) return;
    $msg = 'No tienes permiso para esta opción (' . implode(' / ', $permisos) . ').';
    if (defined('ACRI_API')) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
        exit;
    }
    http_response_code(403);
    echo '<!DOCTYPE html><meta charset="utf-8"><body style="font:14px Segoe UI,sans-serif;background:#0f1623;color:#d7deea;padding:30px">'
        . htmlspecialchars($msg) . '</body>';
    exit;
}

// Para peticiones POST de las APIs: el token viaja en el encabezado X-Acri-Token
function exigirCsrf(): void
{
    $t = $_SERVER['HTTP_X_ACRI_TOKEN'] ?? '';
    if (!hash_equals($_SESSION['csrf'], $t)) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'Solicitud no válida. Recarga la página.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}
