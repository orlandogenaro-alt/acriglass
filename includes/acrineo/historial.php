<?php
// ACRINEO · Historial (auditoría) de cada presupuesto: quién, cuándo, desde qué IP y qué cambió.
require_once __DIR__ . '/esquema.php';

const ACRINEO_ACCIONES_HISTORIAL = [
    'CREAR'     => 'Creó el presupuesto',
    'MODIFICAR' => 'Modificó',
    'ELIMINAR'  => 'Eliminó el presupuesto',
    'DOCUMENTO' => 'Documento',
    'HOJA'      => 'Hoja del presupuesto',
];

// IP de quien hace la petición (en Vercel llega en X-Forwarded-For)
function acrineoIp(): ?string
{
    $candidatos = [];
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) $candidatos[] = trim(explode(',', (string) $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
    $candidatos[] = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    foreach ($candidatos as $ip) {
        if (filter_var($ip, FILTER_VALIDATE_IP)) return $ip;
    }
    return null;
}

// Registra uno o varios renglones: [[campo, valor_anterior, valor_nuevo], …] (una sola consulta)
function acrineoRegistrar(int $presupuestoId, string $usuario, string $accion, array $renglones): void
{
    if (!$renglones) return;
    $ip = acrineoIp();
    $valores = [];
    $params = [];
    foreach ($renglones as [$campo, $antes, $despues]) {
        $valores[] = '(?, ?, ?, ?, ?, ?, ?)';
        array_push($params, $presupuestoId, mb_substr($usuario, 0, 50), $accion,
            $campo === null ? null : mb_substr((string) $campo, 0, 120),
            $antes === null ? null : mb_substr((string) $antes, 0, 4000),
            $despues === null ? null : mb_substr((string) $despues, 0, 4000), $ip);
    }
    bd_ejecutar('AW', 'insert into acrineo_presupuesto_historial (presupuesto_id, usuario, accion, campo, valor_anterior, valor_nuevo, ip) values '
        . implode(', ', $valores), $params);
}

function acrineoHistorial(int $presupuestoId, int $limite = 300): array
{
    $filas = bd_filas('AW', "select historial_id as id, to_char(fecha at time zone ?, 'YYYY-MM-DD HH24:MI:SS') as fecha, usuario, accion,
                                    campo, valor_anterior, valor_nuevo, ip
                               from acrineo_presupuesto_historial where presupuesto_id = ?
                              order by fecha desc, historial_id desc limit ?", [nube_zona(), $presupuestoId, max(1, min(1000, $limite))]);
    foreach ($filas as &$f) {
        $f['id'] = (int) $f['id'];
        $f['accion_texto'] = ACRINEO_ACCIONES_HISTORIAL[$f['accion']] ?? $f['accion'];
    }
    return $filas;
}
