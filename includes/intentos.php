<?php
// Freno a contraseñas adivinadas: tras ACRI_INTENTOS_MAX fallos seguidos de un usuario desde la misma
// dirección, ese usuario queda bloqueado ACRI_INTENTOS_BLOQUEO segundos desde ahí (login y autorización de
// otro usuario). Se guarda como la configuración: config/intentos_login.json o la tabla configuracion.
require_once __DIR__ . '/sistema.php';

const ACRI_INTENTOS_MAX = 5;
const ACRI_INTENTOS_BLOQUEO = 15 * 60;

// IP del cliente: en Vercel la primera de X-Forwarded-For (la pone Vercel); en el servidor local REMOTE_ADDR
function intentosIp(): string
{
    $xff = ACRI_NUBE ? trim(explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''))[0]) : '';
    return $xff !== '' ? $xff : (string) ($_SERVER['REMOTE_ADDR'] ?? '');
}

function intentosClave(string $usuario): string
{
    return mb_strtoupper(trim($usuario)) . '|' . intentosIp();
}

// Segundos que le faltan al bloqueo (0 = puede intentar)
function intentosBloqueo(string $usuario): int
{
    try {
        $r = configLeer('intentos_login')[intentosClave($usuario)] ?? null;
    } catch (Throwable $e) {
        error_log('AcriGlass intentos: ' . $e->getMessage());
        return 0;
    }
    return $r ? max(0, (int) ($r['hasta'] ?? 0) - time()) : 0;
}

// $ok: el intento fue correcto (borra los fallos) o no (suma uno y bloquea al llegar al máximo)
function intentosRegistrar(string $usuario, bool $ok): void
{
    try {
        $todos = configLeer('intentos_login');
        $ahora = time();
        // Fuera los vencidos para que no crezca
        $todos = array_filter($todos, fn($r) => max((int) ($r['hasta'] ?? 0), (int) ($r['ultimo'] ?? 0) + ACRI_INTENTOS_BLOQUEO) > $ahora);
        $k = intentosClave($usuario);
        if ($ok) {
            if (!isset($todos[$k])) return;
            unset($todos[$k]);
        } else {
            $r = $todos[$k] ?? ['fallos' => 0, 'hasta' => 0];
            $r['fallos'] = (int) $r['fallos'] + 1;
            $r['ultimo'] = $ahora;
            if ($r['fallos'] >= ACRI_INTENTOS_MAX) {
                $r['hasta'] = $ahora + ACRI_INTENTOS_BLOQUEO;
                $r['fallos'] = 0;
            }
            $todos[$k] = $r;
        }
        configGuardar('intentos_login', $todos);
    } catch (Throwable $e) {
        error_log('AcriGlass intentos: ' . $e->getMessage());
    }
}

function intentosMensaje(int $segundos): string
{
    return 'Demasiados intentos fallidos. Espera ' . max(1, (int) ceil($segundos / 60)) . ' min e intenta de nuevo.';
}
