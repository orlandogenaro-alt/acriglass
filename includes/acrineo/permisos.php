<?php
// ACRINEO · Permisos. Se integran con los del sistema (includes/permisos.php, Administrador › Roles):
// cada acción pide ACRINEO_VER más su permiso; ADMIN_USER puede todo. Requiere includes/sesion.php.

const ACRINEO_ACCIONES = [
    'ver'                     => 'ACRINEO_VER',
    'presupuestos.ver'        => 'ACRINEO_PRESUPUESTOS_VER',
    'presupuestos.crear'      => 'ACRINEO_PRESUPUESTOS_CREAR',
    'presupuestos.editar'     => 'ACRINEO_PRESUPUESTOS_EDITAR',
    'presupuestos.eliminar'   => 'ACRINEO_PRESUPUESTOS_ELIMINAR',
    'presupuestos.documentos' => 'ACRINEO_PRESUPUESTOS_DOCUMENTOS',
    'presupuestos.compartir'  => 'ACRINEO_PRESUPUESTOS_COMPARTIR',
    'presupuestos.respaldar'  => 'ACRINEO_PRESUPUESTOS_RESPALDAR',
    'configuracion'           => 'ACRINEO_CONFIGURACION',
];

function acrineoPuede(string $accion): bool
{
    if (tienePermiso('ADMIN_USER')) return true;
    $permiso = ACRINEO_ACCIONES[$accion] ?? null;
    if ($permiso === null || !tienePermiso('ACRINEO_VER')) return false;
    // Las acciones sobre presupuestos piden además poder consultarlos
    if (strncmp($accion, 'presupuestos.', 13) === 0 && $accion !== 'presupuestos.ver' && !tienePermiso('ACRINEO_PRESUPUESTOS_VER')) return false;
    return tienePermiso($permiso);
}

// Corta la petición (403) si no tiene el permiso; responde JSON en las APIs (ACRI_API), igual que exigirPermiso
function acrineoExigir(string $accion): void
{
    if (acrineoPuede($accion)) return;
    $permisos = array_unique(['ACRINEO_VER', ACRINEO_ACCIONES[$accion] ?? 'ACRINEO_VER']);
    $msg = 'No tienes permiso para esta opción (' . implode(' + ', $permisos) . ').';
    http_response_code(403);
    if (defined('ACRI_API')) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo '<!DOCTYPE html><meta charset="utf-8"><body style="font:14px Segoe UI,sans-serif;background:#0f1623;color:#d7deea;padding:30px">'
        . htmlspecialchars($msg) . '</body>';
    exit;
}

// Permisos que necesita la pantalla para mostrar u ocultar botones
function acrineoPermisosCliente(): array
{
    $p = [];
    foreach (array_keys(ACRINEO_ACCIONES) as $accion) $p[$accion] = acrineoPuede($accion);
    return $p;
}
