<?php
// Administrador › Usuarios (Supabase: usuarios, permisos_usuarios, roles)
// GET  ?accion=listar
// POST ?accion=guardar   {clave, nuevo, login, nombre, correo, rol_id, contrasena, perm_<PERMISO>: bool…}
// POST ?accion=activar   {clave}   alta / baja (estatus A / B)
// POST ?accion=eliminar  {clave}
// clave = usuario_id. Los permisos del usuario son los de su rol más los que se le marquen sueltos.
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

function listar(): void
{
    $roles = bd_filas('AW', 'select rol_id, nombre from roles order by nombre');
    $permisosRol = [];
    foreach (bd_filas('AW', 'select rol_id, permiso from permisos_roles') as $p) $permisosRol[$p['rol_id']][] = strtoupper($p['permiso']);
    $propios = [];
    foreach (bd_filas('AW', 'select usuario_id, permiso from permisos_usuarios') as $p) $propios[$p['usuario_id']][] = strtoupper($p['permiso']);

    $filas = [];
    foreach (bd_filas('AW',
        "select u.usuario_id, u.login, u.nombre, u.correo, u.estatus, u.rol_id, r.nombre as rol,
                to_char(u.ultimo_acceso at time zone ?, 'YYYY-MM-DD HH24:MI') as ultimo_acceso,
                to_char(u.fecha_creacion at time zone ?, 'YYYY-MM-DD') as fecha_creacion
           from usuarios u
           left join roles r on r.rol_id = u.rol_id
          order by u.login", [nube_zona(), nube_zona()]) as $u) {
        $id = (int) $u['usuario_id'];
        $deRol = $permisosRol[$u['rol_id']] ?? [];
        $suyos = $propios[$id] ?? [];
        $filas[] = [
            'clave'          => (string) $id,
            'login'          => $u['login'],
            'nombre'         => $u['nombre'] ?? '',
            'correo'         => $u['correo'] ?? '',
            'rol_id'         => $u['rol_id'] === null ? '' : (string) $u['rol_id'],
            'rol'            => $u['rol'] ?? '',
            'permisos'       => $suyos,
            'efectivos'      => permisosValidos(array_merge($deRol, $suyos)),
            'activa'         => strtoupper((string) $u['estatus']) !== 'B',
            'ultimo_acceso'  => $u['ultimo_acceso'] ?? '',
            'fecha_creacion' => $u['fecha_creacion'] ?? '',
        ];
    }
    responder(['ok' => true, 'filas' => $filas, 'roles' => $roles, 'permisos_roles' => $permisosRol, 'permisos' => ACRI_PERMISOS]);
}

function usuario(string $clave): array
{
    $u = bd_fila('AW', 'select usuario_id, login from usuarios where usuario_id = ?', [(int) $clave]);
    if (!$u) error('El usuario ya no existe.', 404);
    return $u;
}

try {
    exigirSupabase();
    if (!bd_tiene_columna('AW', 'usuarios', 'rol_id')) {
        error('Falta correr Consultas/supabase_roles_conceptos.sql en Supabase (tablas de roles).', 503);
    }

    switch ($accion) {
        case 'listar':
            listar();

        case 'guardar':
            $nuevo  = !empty($in['nuevo']);
            $login  = mb_strtoupper(trim((string) ($in['login'] ?? '')));
            $clave  = (string) ($in['contrasena'] ?? '');
            $rolId  = (int) ($in['rol_id'] ?? 0) ?: null;
            $campos = [
                'login'  => $login,
                'nombre' => mb_substr(trim((string) ($in['nombre'] ?? '')), 0, 150) ?: null,
                'correo' => mb_substr(trim((string) ($in['correo'] ?? '')), 0, 150) ?: null,
                'rol_id' => $rolId,
            ];
            if (!preg_match('/^[A-Z0-9._@-]{3,50}$/u', $login)) error('El usuario debe tener de 3 a 50 letras, números o . _ - @ (sin espacios).');
            if ($login === 'SYSDBA') error('SYSDBA es el administrador maestro del sistema; usa otro nombre.');
            if ($campos['correo'] !== null && !filter_var($campos['correo'], FILTER_VALIDATE_EMAIL)) error('El correo no es válido.');
            if ($rolId && !bd_valor('AW', 'select count(*) from roles where rol_id = ?', [$rolId])) error('El rol ya no existe.');
            if (($nuevo || $clave !== '') && mb_strlen($clave) < 6) error('La contraseña debe tener al menos 6 caracteres.');

            $id = $nuevo ? 0 : (int) usuario((string) ($in['clave'] ?? ''))['usuario_id'];
            if (bd_valor('AW', 'select count(*) from usuarios where upper(trim(login)) = ? and usuario_id <> ?', [$login, $id])) {
                error("Ya existe el usuario $login.");
            }
            if ($clave !== '') $campos['contrasena_hash'] = password_hash($clave, PASSWORD_BCRYPT);
            $permisos = permisosFormulario($in);
            // Que el administrador no se quite a sí mismo el acceso al menú Administrador
            if (!$nuevo && mb_strtoupper(trim((string) bd_valor('AW', 'select login from usuarios where usuario_id = ?', [$id]))) === $yo) {
                $deRol = $rolId ? array_column(bd_filas('AW', 'select permiso from permisos_roles where rol_id = ?', [$rolId]), 'permiso') : [];
                if (!in_array('ADMIN_USER', permisosValidos(array_merge($deRol, $permisos)), true)) {
                    error('No puedes quitarte a ti mismo el permiso de Administrador.');
                }
            }

            $pdo = bd_pdo('AW');
            $pdo->beginTransaction();
            try {
                if ($nuevo) {
                    $id = (int) bd_valor('AW', 'insert into usuarios (' . implode(', ', array_keys($campos)) . ') values ('
                        . implode(', ', array_fill(0, count($campos), '?')) . ') returning usuario_id', array_values($campos));
                } else {
                    bd_ejecutar('AW', 'update usuarios set ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($campos)))
                        . ' where usuario_id = ?', array_merge(array_values($campos), [$id]));
                }
                bd_ejecutar('AW', 'delete from permisos_usuarios where usuario_id = ?', [$id]);
                foreach ($permisos as $p) bd_ejecutar('AW', 'insert into permisos_usuarios (usuario_id, permiso) values (?, ?)', [$id, $p]);
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $e;
            }
            listar();

        case 'activar':
            $u = usuario((string) ($in['clave'] ?? ''));
            if (mb_strtoupper(trim($u['login'])) === $yo) error('No puedes dar de baja tu propio usuario.');
            bd_ejecutar('AW', "update usuarios set estatus = case when estatus = 'B' then 'A' else 'B' end where usuario_id = ?", [$u['usuario_id']]);
            listar();

        case 'eliminar':
            $u = usuario((string) ($in['clave'] ?? ''));
            if (mb_strtoupper(trim($u['login'])) === $yo) error('No puedes eliminar tu propio usuario.');
            bd_ejecutar('AW', 'delete from usuarios where usuario_id = ?', [$u['usuario_id']]);   // sus permisos se borran en cascada
            listar();
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/usuarios: ' . $e->getMessage());
    error('No se pudo completar en Supabase: ' . bd_mensaje_error($e), 500);
}
