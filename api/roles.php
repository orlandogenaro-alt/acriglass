<?php
// Administrador › Roles (Supabase: roles, permisos_roles)
// GET  ?accion=listar
// POST ?accion=guardar   {clave, nuevo, nombre, descripcion, perm_<PERMISO>: bool…}
// POST ?accion=eliminar  {clave}   los usuarios del rol se quedan sin rol (conservan sus permisos sueltos)
// clave = rol_id. Cambiar los permisos de un rol cambia los de todos sus usuarios (al volver a iniciar sesión).
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/bd.php';
require __DIR__ . '/../includes/respuesta.php';
require __DIR__ . '/../includes/permisos.php';

exigirPermiso('ADMIN_USER');
if (modoConfiguracion()) error('Modo configuración: aún no hay conexión a AW-Management.', 503);

$accion = $_GET['accion'] ?? 'listar';
if ($accion !== 'listar') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
    exigirCsrf();
}
$yo = mb_strtoupper(trim((string) $_SESSION['usuario']));
session_write_close();

$in = entrada();

// true si el usuario en sesión tiene este rol y sin él se quedaría sin el permiso de Administrador
function meQuitaAdmin(int $rolId, string $yo): bool
{
    $u = bd_fila('AW', 'select usuario_id, rol_id from usuarios where upper(trim(login)) = ?', [$yo]);
    if (!$u || (int) $u['rol_id'] !== $rolId) return false;
    return !bd_valor('AW', "select count(*) from permisos_usuarios where usuario_id = ? and upper(permiso) = 'ADMIN_USER'", [$u['usuario_id']]);
}

function listar(): void
{
    $permisos = [];
    foreach (bd_filas('AW', 'select rol_id, permiso from permisos_roles') as $p) $permisos[$p['rol_id']][] = strtoupper($p['permiso']);
    $filas = [];
    foreach (bd_filas('AW',
        'select r.rol_id, r.nombre, r.descripcion, (select count(*) from usuarios u where u.rol_id = r.rol_id) as usuarios
           from roles r
          order by r.nombre') as $r) {
        $filas[] = [
            'clave'       => (string) $r['rol_id'],
            'nombre'      => $r['nombre'],
            'descripcion' => $r['descripcion'] ?? '',
            'usuarios'    => (int) $r['usuarios'],
            'permisos'    => permisosValidos($permisos[$r['rol_id']] ?? []),
        ];
    }
    responder(['ok' => true, 'filas' => $filas, 'permisos' => ACRI_PERMISOS]);
}

try {
    exigirSupabase();
    if (!bd_tiene_columna('AW', 'roles', 'rol_id')) {
        error('Falta correr Consultas/supabase_roles_conceptos.sql en Supabase (tablas de roles).', 503);
    }

    switch ($accion) {
        case 'listar':
            listar();

        case 'guardar':
            $nuevo  = !empty($in['nuevo']);
            $nombre = mb_strtoupper(trim((string) ($in['nombre'] ?? '')));
            $desc   = mb_substr(trim((string) ($in['descripcion'] ?? '')), 0, 200);
            if ($nombre === '' || mb_strlen($nombre) > 60) error('Escribe el nombre del rol (máximo 60 caracteres).');

            $id = 0;
            if (!$nuevo) {
                $id = (int) bd_valor('AW', 'select rol_id from roles where rol_id = ?', [(int) ($in['clave'] ?? 0)]);
                if (!$id) error('El rol ya no existe.', 404);
            }
            if (bd_valor('AW', 'select count(*) from roles where upper(trim(nombre)) = ? and rol_id <> ?', [$nombre, $id])) {
                error("Ya existe el rol $nombre.");
            }
            $permisos = permisosFormulario($in);
            if (!$permisos) error('Marca al menos un permiso para el rol.');
            if ($id && !in_array('ADMIN_USER', $permisos, true) && meQuitaAdmin($id, $yo)) {
                error('Tu usuario tiene este rol: si le quitas el permiso de Administrador te quedarías sin acceso.');
            }

            $pdo = bd_pdo('AW');
            $pdo->beginTransaction();
            try {
                if ($nuevo) {
                    $id = (int) bd_valor('AW', 'insert into roles (nombre, descripcion) values (?, ?) returning rol_id', [$nombre, $desc ?: null]);
                } else {
                    bd_ejecutar('AW', 'update roles set nombre = ?, descripcion = ? where rol_id = ?', [$nombre, $desc ?: null, $id]);
                }
                bd_ejecutar('AW', 'delete from permisos_roles where rol_id = ?', [$id]);
                foreach ($permisos as $p) bd_ejecutar('AW', 'insert into permisos_roles (rol_id, permiso) values (?, ?)', [$id, $p]);
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $e;
            }
            listar();

        case 'eliminar':
            $id = (int) ($in['clave'] ?? 0);
            if (meQuitaAdmin($id, $yo)) error('Tu usuario tiene este rol: si lo eliminas te quedarías sin acceso de Administrador.');
            if (!bd_ejecutar('AW', 'delete from roles where rol_id = ?', [$id])) error('El rol ya no existe.', 404);
            listar();
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/roles: ' . $e->getMessage());
    error('No se pudo completar en Supabase: ' . bd_mensaje_error($e), 500);
}
