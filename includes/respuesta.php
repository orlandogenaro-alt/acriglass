<?php
// Utilidades para los endpoints JSON de api/
header('Content-Type: application/json; charset=utf-8');

function responder(array $datos, int $codigo = 200): void
{
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function error(string $mensaje, int $codigo = 400): void
{
    responder(['ok' => false, 'error' => $mensaje], $codigo);
}

// Cuerpo JSON de la petición
function entrada(): array
{
    $datos = json_decode((string) file_get_contents('php://input'), true);
    return is_array($datos) ? $datos : [];
}

// Clave de conexión / servicio: mayúsculas, números y guion bajo
function claveValida(string $clave): string
{
    $clave = strtoupper(trim($clave));
    if (!preg_match('/^[A-Z][A-Z0-9_]{1,29}$/', $clave)) {
        error('La clave debe empezar con letra y llevar solo letras, números o guion bajo (2 a 30).');
    }
    return $clave;
}
