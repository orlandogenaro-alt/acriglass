<?php
// Administrador › Bases de datos
// GET  ?accion=listar
// POST ?accion=guardar   {clave, nuevo, nombre, motor, servidor, base, usuario, contrasena, charset, notas, activa}
// POST ?accion=activar   {clave}
// POST ?accion=probar    {clave}            prueba la conexión guardada
// POST ?accion=probar    {datos del formulario} prueba sin guardar
// POST ?accion=eliminar  {clave}            solo las que no son del sistema
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/bd.php';
require __DIR__ . '/../includes/respuesta.php';

exigirPermiso('ADMIN_USER');

$accion = $_GET['accion'] ?? 'listar';
if ($accion !== 'listar') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
    exigirCsrf();
}
// Las pruebas pueden tardar: se libera la sesión para no bloquear otras pestañas
session_write_close();

$todas = bd_conexiones();
$in = entrada();

// Lo que ve el navegador: nunca la contraseña
function publica(string $clave, array $c, array $pruebas): array
{
    $efectiva = bd_completar($clave, $c);
    return [
        'clave'      => $clave,
        'nombre'     => $c['nombre'] ?? '',
        'motor'      => $c['motor'] ?? '',
        'motor_txt'  => ACRI_MOTORES[$c['motor'] ?? ''] ?? ($c['motor'] ?? ''),
        'servidor'   => $c['servidor'] ?? '',
        'base'       => $c['base'] ?? '',
        'usuario'    => $c['usuario'] ?? '',
        'tiene_contrasena' => ($c['contrasena'] ?? '') !== '',
        'de_easyglass'     => !empty($efectiva['de_easyglass']),
        'charset'    => $c['charset'] ?? '',
        'notas'      => $c['notas'] ?? '',
        'sistema'    => !empty($c['sistema']),
        'activa'     => !empty($c['activa']),
        'prueba'     => $pruebas['bd:' . $clave] ?? null,
    ];
}

function listar(array $todas): void
{
    $pruebas = configLeer('pruebas');
    $filas = [];
    foreach ($todas as $clave => $c) $filas[] = publica($clave, $c, $pruebas);
    responder(['ok' => true, 'filas' => $filas, 'motores' => ACRI_MOTORES]);
}

// Configuración a partir del formulario; la contraseña vacía conserva la guardada
function desdeFormulario(array $in, ?array $actual): array
{
    $motor = $in['motor'] ?? '';
    if (!isset(ACRI_MOTORES[$motor])) error('Selecciona un motor válido.');
    $c = [
        'nombre'   => trim($in['nombre'] ?? ''),
        'motor'    => $motor,
        'servidor' => trim($in['servidor'] ?? ''),
        'base'     => trim($in['base'] ?? ''),
        'usuario'  => trim($in['usuario'] ?? ''),
        'contrasena' => ($in['contrasena'] ?? '') !== '' ? $in['contrasena'] : ($actual['contrasena'] ?? ''),
        'charset'  => strtoupper(trim($in['charset'] ?? '')),
        'notas'    => trim($in['notas'] ?? ''),
    ];
    if (!empty($in['borrar_contrasena'])) $c['contrasena'] = '';
    if ($c['nombre'] === '') error('Escribe el nombre de la conexión.');
    if ($c['base'] === '') error($motor === 'odbc' ? 'Escribe el DSN o la cadena de conexión.' : 'Escribe la base de datos.');
    if ($motor !== 'odbc' && $c['servidor'] === '') error('Escribe el servidor.');
    return $c;
}

switch ($accion) {
    case 'listar':
        listar($todas);

    case 'guardar':
        $clave = claveValida($in['clave'] ?? '');
        $nuevo = !empty($in['nuevo']);
        if ($nuevo && isset($todas[$clave])) error("Ya existe una conexión con la clave $clave.");
        if (!$nuevo && !isset($todas[$clave])) error('La conexión ya no existe.', 404);
        $actual = $todas[$clave] ?? null;
        $todas[$clave] = desdeFormulario($in, $actual) + [
            'sistema' => !empty($actual['sistema']),
            'activa'  => $actual ? !empty($actual['activa']) : true,
        ];
        configGuardar('bases-datos', $todas);
        listar($todas);

    case 'activar':
        $clave = $in['clave'] ?? '';
        if (!isset($todas[$clave])) error('La conexión no existe.', 404);
        $todas[$clave]['activa'] = empty($todas[$clave]['activa']);
        configGuardar('bases-datos', $todas);
        listar($todas);

    case 'probar':
        if (isset($in['motor'])) {
            // Prueba con lo capturado en el formulario, sin guardar
            $clave = strtoupper(trim($in['clave'] ?? ''));
            $r = bd_probar(bd_completar($clave, desdeFormulario($in, $todas[$clave] ?? null)));
            responder(['ok' => true, 'prueba' => $r + ['fecha' => date('Y-m-d H:i:s')]]);
        }
        $claves = ($in['clave'] ?? '') === '*' ? array_keys($todas) : [$in['clave'] ?? ''];
        foreach ($claves as $clave) {
            if (!isset($todas[$clave])) error('La conexión no existe.', 404);
            pruebaGuardar('bd:' . $clave, bd_probar(bd_completar($clave, $todas[$clave])));
        }
        listar($todas);

    case 'eliminar':
        $clave = $in['clave'] ?? '';
        if (!isset($todas[$clave])) error('La conexión no existe.', 404);
        if (!empty($todas[$clave]['sistema'])) error('Las conexiones del sistema no se pueden eliminar.');
        unset($todas[$clave]);
        configGuardar('bases-datos', $todas);
        listar($todas);
}
error('Acción no válida.');
