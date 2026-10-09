<?php
// Administrador › APIs y servicios
// GET  ?accion=listar
// POST ?accion=guardar   {clave, nuevo, nombre, proveedor, url, auth, auth_campo, credencial, client_id, tokens_bd, tokens_tabla, archivo, espera, ruta_prueba, notas}
// POST ?accion=activar   {clave}
// POST ?accion=probar    {clave}   ('*' = todas las activas)
// POST ?accion=eliminar  {clave}   solo los que no son del sistema
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/servicios.php';
require __DIR__ . '/../includes/respuesta.php';

exigirPermiso('ADMIN_USER');

$accion = $_GET['accion'] ?? 'listar';
if ($accion !== 'listar') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
    exigirCsrf();
}
session_write_close();
set_time_limit(0);   // "Probar todas" puede sumar varias esperas

$todos = api_servicios();
$in = entrada();

// Lo que ve el navegador: nunca la credencial
function publico(string $clave, array $s, array $pruebas): array
{
    $extra = $s['extra'] ?? [];
    return [
        'clave'       => $clave,
        'nombre'      => $s['nombre'] ?? '',
        'proveedor'   => $s['proveedor'] ?? '',
        'url'         => $s['url'] ?? '',
        'auth'        => $s['auth'] ?? 'ninguna',
        'auth_campo'  => $s['auth_campo'] ?? '',
        'credencial'  => api_estado_credencial($s),
        'client_id'   => isset($extra['client_id']) && $extra['client_id'] !== '',
        'tokens_bd'   => $extra['tokens_bd'] ?? '',
        'tokens_tabla'=> $extra['tokens_tabla'] ?? '',
        'archivo'     => $extra['archivo'] ?? '',
        'espera'      => (int) ($s['espera'] ?? 30),
        'ruta_prueba' => $s['ruta_prueba'] ?? '',
        'notas'       => $s['notas'] ?? '',
        'sistema'     => !empty($s['sistema']),
        'activa'      => !empty($s['activa']),
        'prueba'      => $pruebas['api:' . $clave] ?? null,
    ];
}

function listar(array $todos): void
{
    $pruebas = configLeer('pruebas');
    $filas = [];
    foreach ($todos as $clave => $s) $filas[] = publico($clave, $s, $pruebas);
    responder(['ok' => true, 'filas' => $filas, 'autenticacion' => ACRI_AUTENTICACION]);
}

switch ($accion) {
    case 'listar':
        listar($todos);

    case 'guardar':
        $clave = claveValida($in['clave'] ?? '');
        $nuevo = !empty($in['nuevo']);
        if ($nuevo && isset($todos[$clave])) error("Ya existe un servicio con la clave $clave.");
        if (!$nuevo && !isset($todos[$clave])) error('El servicio ya no existe.', 404);
        $actual = $todos[$clave] ?? [];

        $auth = $in['auth'] ?? 'ninguna';
        if (!isset(ACRI_AUTENTICACION[$auth])) error('Tipo de autenticación no válido.');
        $s = [
            'nombre'      => trim($in['nombre'] ?? ''),
            'proveedor'   => trim($in['proveedor'] ?? ''),
            'url'         => trim($in['url'] ?? ''),
            'auth'        => $auth,
            'auth_campo'  => trim($in['auth_campo'] ?? ''),
            // Vacía = conservar la guardada
            'credencial'  => ($in['credencial'] ?? '') !== '' ? $in['credencial'] : ($actual['credencial'] ?? ''),
            'extra'       => $actual['extra'] ?? [],
            'espera'      => max(1, min(600, (int) ($in['espera'] ?? 30))),
            'ruta_prueba' => trim($in['ruta_prueba'] ?? ''),
            'notas'       => trim($in['notas'] ?? ''),
            'sistema'     => !empty($actual['sistema']),
            'activa'      => $actual ? !empty($actual['activa']) : true,
        ];
        if (!empty($in['borrar_credencial'])) $s['credencial'] = '';
        if ($s['nombre'] === '') error('Escribe el nombre del servicio.');
        if ($s['url'] !== '' && !preg_match('#^https?://#i', $s['url'])) error('La URL base debe empezar con http:// o https://');
        if (in_array($auth, ['header', 'query'], true) && $s['auth_campo'] === '') {
            error($auth === 'header' ? 'Escribe el nombre del encabezado (p. ej. Bmx-Token).' : 'Escribe el nombre del parámetro (p. ej. token).');
        }
        if ($auth === 'oauth2') {
            if (($in['client_id'] ?? '') !== '') $s['extra']['client_id'] = trim($in['client_id']);
            $s['extra']['tokens_bd'] = strtoupper(trim($in['tokens_bd'] ?? ''));
            $s['extra']['tokens_tabla'] = strtoupper(trim($in['tokens_tabla'] ?? ''));
            if ($s['extra']['tokens_tabla'] !== '' && !preg_match('/^\w+$/', $s['extra']['tokens_tabla'])) error('Nombre de tabla de tokens no válido.');
        }
        if (array_key_exists('archivo', $in)) {
            $archivo = basename(trim((string) $in['archivo']));
            if ($archivo === '') unset($s['extra']['archivo']); else $s['extra']['archivo'] = $archivo;
        }
        $todos[$clave] = $s;
        configGuardar('servicios', $todos);
        listar($todos);

    case 'activar':
        $clave = $in['clave'] ?? '';
        if (!isset($todos[$clave])) error('El servicio no existe.', 404);
        $todos[$clave]['activa'] = empty($todos[$clave]['activa']);
        configGuardar('servicios', $todos);
        listar($todos);

    case 'probar':
        $claves = ($in['clave'] ?? '') === '*'
            ? array_keys(array_filter($todos, fn($s) => !empty($s['activa'])))
            : [$in['clave'] ?? ''];
        foreach ($claves as $clave) {
            if (!isset($todos[$clave])) error('El servicio no existe.', 404);
            pruebaGuardar('api:' . $clave, api_probar($clave));
        }
        listar($todos);

    case 'eliminar':
        $clave = $in['clave'] ?? '';
        if (!isset($todos[$clave])) error('El servicio no existe.', 404);
        if (!empty($todos[$clave]['sistema'])) error('Los servicios del sistema no se pueden eliminar.');
        unset($todos[$clave]);
        configGuardar('servicios', $todos);
        listar($todos);
}
error('Acción no válida.');
