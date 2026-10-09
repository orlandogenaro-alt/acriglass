<?php
// Valida al usuario contra AW-Management (USUARIOS / PERMISOS_USUARIOS), igual que el sistema de escritorio.
//
// Modo configuración: si la conexión AW aún no tiene contraseña capturada, solo desde el propio
// servidor se puede entrar para capturarla en Administrador › Bases de datos.
require_once __DIR__ . '/includes/bd.php';
session_start();

$usuario    = trim($_POST['usuario'] ?? '');
$contrasena = $_POST['contrasena'] ?? '';

function volver(string $error): void
{
    header('Location: index.php?e=' . urlencode($error));
    exit;
}

function iniciarSesion(string $usuario, array $permisos, bool $modoConfig = false): void
{
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

// Administrador maestro: entra aunque no exista en AW (solo se guarda el hash de la contraseña)
const ACRI_ADMIN_USUARIO = 'SYSDBA';
const ACRI_ADMIN_HASH    = '$2y$10$ATW5kTJTkOxn6GiR00wMG.aso/Y.n4nFpIWmMyr.Typ2LBx1BsO1q';
if (strcasecmp($usuario, ACRI_ADMIN_USUARIO) === 0) {
    if (!password_verify($contrasena, ACRI_ADMIN_HASH)) volver('datos');
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

try {
    // upper() se aplica en PHP: Firebird no acepta funciones sobre un parámetro sin tipo
    $u = bd_fila('AW', 'select a.usuario_id, a.login, a.contrasena, a.estatus from usuarios a where upper(trim(a.login)) = ?', [mb_strtoupper($usuario)]);
} catch (Throwable $e) {
    error_log('AcriGlass login: ' . $e->getMessage());
    volver('bd');
}

if (!$u || !hash_equals((string) $u['contrasena'], $contrasena)) volver('datos');
if (strtoupper((string) $u['estatus']) === 'B') volver('baja');

// Permisos: cada columna de PERMISOS_USUARIOS con 'T'
$permisos = [];
$fila = bd_fila('AW', 'select * from permisos_usuarios where usuario_id = ?', [$u['usuario_id']]) ?? [];
foreach ($fila as $col => $valor) {
    if ($col !== 'usuario_id' && strtoupper(trim((string) $valor)) === 'T') $permisos[strtoupper($col)] = true;
}

iniciarSesion($u['login'], $permisos);
