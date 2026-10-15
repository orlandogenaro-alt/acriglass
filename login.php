<?php
// Valida al usuario contra AW-Management (USUARIOS / PERMISOS_USUARIOS), igual que el sistema de escritorio.
//
// Modo configuración: si la conexión AW aún no tiene contraseña capturada, solo desde el propio
// servidor se puede entrar para capturarla en Administrador › Bases de datos.
require_once __DIR__ . '/includes/bd.php';
require_once __DIR__ . '/includes/intentos.php';
sesionIniciar();

$usuario    = trim($_POST['usuario'] ?? '');
$contrasena = $_POST['contrasena'] ?? '';

function volver(string $error): void
{
    header('Location: index.php?e=' . urlencode($error));
    exit;
}

// Usuario o contraseña incorrectos: cuenta el fallo para el bloqueo por intentos
function fallo(string $usuario): void
{
    intentosRegistrar($usuario, false);
    volver('datos');
}

function iniciarSesion(string $usuario, array $permisos, bool $modoConfig = false): void
{
    intentosRegistrar($usuario, true);
    session_regenerate_id(true);
    $_SESSION['usuario']     = $usuario;
    $_SESSION['permisos']    = $permisos;
    $_SESSION['modo_config'] = $modoConfig;
    $_SESSION['inicio']      = time();
    $_SESSION['expira']      = time() + ACRI_DURACION_SESION;
    header('Location: principal.php');
    exit;
}

if ($usuario === '' || $contrasena === '') volver('vacio');
if (intentosBloqueo($usuario) > 0) volver('bloqueado');

// Administrador maestro: entra aunque no exista en AW. El hash de su contraseña no va en el código:
// variable de entorno ACRI_ADMIN_HASH (Vercel) o config/admin.json { "hash": … } (servidor local, fuera de git).
// Sin hash configurado el usuario maestro queda desactivado.
const ACRI_ADMIN_USUARIO = 'SYSDBA';
if (strcasecmp($usuario, ACRI_ADMIN_USUARIO) === 0) {
    $hashAdmin = (string) (getenv('ACRI_ADMIN_HASH') ?: (configLeer('admin')['hash'] ?? ''));
    if ($hashAdmin === '' || !password_verify($contrasena, $hashAdmin)) fallo($usuario);
    iniciarSesion(ACRI_ADMIN_USUARIO, ['ADMIN_USER' => true]);
}

try {
    $aw = bd_config('AW');
} catch (Throwable $e) {
    $aw = null;
}

if (!$aw || ($aw['contrasena'] ?? '') === '') {
    $local = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
    if (!$local) volver('config');
    iniciarSesion($usuario, ['ADMIN_USER' => true], true);
}

// Supabase (nube): contraseña como hash bcrypt y un renglón por permiso.
// Permisos = los de su rol (permisos_roles) más los sueltos del usuario (permisos_usuarios).
if (ACRI_NUBE) {
    try {
        $u = bd_fila('AW', 'select usuario_id, login, contrasena_hash, estatus from usuarios where upper(trim(login)) = ?', [mb_strtoupper($usuario)]);
        if (!$u || !password_verify($contrasena, (string) $u['contrasena_hash'])) fallo($usuario);
        if (strtoupper((string) $u['estatus']) === 'B') volver('baja');
        $sql = 'select permiso from permisos_usuarios where usuario_id = ?';
        if (bd_tiene_columna('AW', 'usuarios', 'rol_id')) {
            $sql .= ' union select pr.permiso from permisos_roles pr join usuarios x on x.rol_id = pr.rol_id where x.usuario_id = ?';
        }
        $permisos = [];
        foreach (bd_filas('AW', $sql, array_fill(0, substr_count($sql, '?'), $u['usuario_id'])) as $p) {
            $permisos[strtoupper($p['permiso'])] = true;
        }
        bd_pdo('AW')->prepare('update usuarios set ultimo_acceso = now() where usuario_id = ?')->execute([$u['usuario_id']]);
    } catch (Throwable $e) {
        error_log('AcriGlass login: ' . $e->getMessage());
        volver('bd');
    }
    iniciarSesion($u['login'], $permisos);
}

try {
    // upper() se aplica en PHP: Firebird no acepta funciones sobre un parámetro sin tipo
    $u = bd_fila('AW', 'select a.usuario_id, a.login, a.contrasena, a.estatus from usuarios a where upper(trim(a.login)) = ?', [mb_strtoupper($usuario)]);
} catch (Throwable $e) {
    error_log('AcriGlass login: ' . $e->getMessage());
    volver('bd');
}

if (!$u || !hash_equals((string) $u['contrasena'], $contrasena)) fallo($usuario);
if (strtoupper((string) $u['estatus']) === 'B') volver('baja');

// Permisos: cada columna de PERMISOS_USUARIOS con 'T'
$permisos = [];
$fila = bd_fila('AW', 'select * from permisos_usuarios where usuario_id = ?', [$u['usuario_id']]) ?? [];
foreach ($fila as $col => $valor) {
    if ($col !== 'usuario_id' && strtoupper(trim((string) $valor)) === 'T') $permisos[strtoupper($col)] = true;
}

iniciarSesion($u['login'], $permisos);
