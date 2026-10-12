<?php
// Valida usuario y contraseña contra AW-Management (USUARIOS / PERMISOS_USUARIOS), igual que el
// sistema de escritorio. La usa la autorización de otro usuario (Dialog225); misma lógica que login.php.
// Solo usuarios de AW: el administrador maestro (SYSDBA) no autoriza.
//
//   autenticarUsuario($usuario, $contrasena)
//     → ['estado' => 'ok', 'login' => …, 'permisos' => ['NUEVO_OBRA' => true, …]]
//     → ['estado' => 'datos']   usuario o contraseña incorrectos
//     → ['estado' => 'baja']    usuario dado de baja
//   Los errores de base de datos se lanzan como excepción.
require_once __DIR__ . '/bd.php';

function autenticarUsuario(string $usuario, string $contrasena): array
{
    if ($usuario === '' || $contrasena === '') return ['estado' => 'datos'];

    // Supabase (nube): contraseña como hash bcrypt y un renglón por permiso.
    // Permisos = los de su rol (permisos_roles) más los sueltos del usuario (permisos_usuarios).
    if (ACRI_NUBE) {
        $u = bd_fila('AW', 'select usuario_id, login, contrasena_hash, estatus from usuarios where upper(trim(login)) = ?', [mb_strtoupper($usuario)]);
        if (!$u || !password_verify($contrasena, (string) $u['contrasena_hash'])) return ['estado' => 'datos'];
        if (strtoupper((string) $u['estatus']) === 'B') return ['estado' => 'baja'];
        $sql = 'select permiso from permisos_usuarios where usuario_id = ?';
        if (bd_tiene_columna('AW', 'usuarios', 'rol_id')) {
            $sql .= ' union select pr.permiso from permisos_roles pr join usuarios x on x.rol_id = pr.rol_id where x.usuario_id = ?';
        }
        $permisos = [];
        foreach (bd_filas('AW', $sql, array_fill(0, substr_count($sql, '?'), $u['usuario_id'])) as $p) {
            $permisos[strtoupper($p['permiso'])] = true;
        }
        return ['estado' => 'ok', 'login' => $u['login'], 'permisos' => $permisos, 'usuario_id' => $u['usuario_id']];
    }

    // upper() se aplica en PHP: Firebird no acepta funciones sobre un parámetro sin tipo
    $u = bd_fila('AW', 'select a.usuario_id, a.login, a.contrasena, a.estatus from usuarios a where upper(trim(a.login)) = ?', [mb_strtoupper($usuario)]);
    if (!$u || !hash_equals((string) $u['contrasena'], $contrasena)) return ['estado' => 'datos'];
    if (strtoupper((string) $u['estatus']) === 'B') return ['estado' => 'baja'];

    // Permisos: cada columna de PERMISOS_USUARIOS con 'T'
    $permisos = [];
    $fila = bd_fila('AW', 'select * from permisos_usuarios where usuario_id = ?', [$u['usuario_id']]) ?? [];
    foreach ($fila as $col => $valor) {
        if ($col !== 'usuario_id' && strtoupper(trim((string) $valor)) === 'T') $permisos[strtoupper($col)] = true;
    }
    return ['estado' => 'ok', 'login' => $u['login'], 'permisos' => $permisos, 'usuario_id' => $u['usuario_id']];
}
