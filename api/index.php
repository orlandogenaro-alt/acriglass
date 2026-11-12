<?php
// Punto de entrada en Vercel (vercel.json manda aquí toda petición que no sea css/, js/ o img/).
// Vercel solo ejecuta PHP dentro de api/, así que este script corre la página pedida.
// Solo se ejecutan los scripts de esta lista: includes/, config/, Consultas/ y uploads/ nunca se exponen.
const ACRI_RUTAS = [
    'index.php', 'login.php', 'logout.php', 'principal.php', 'obra.php', 'presupuesto.php',
    'imagen-sistema.php', 'bases-datos.php', 'servicios.php', 'usuarios.php', 'roles.php', 'conceptos.php', 'estatus.php', 'hoja-membretada.php', 'novedades.php', 'servicio-obra.php', 'parametros-costos.php', 'parametros-presupuesto.php', 'importar-insumos.php', 'contrato-obra.php', 'estimaciones-obra.php',
    'api/obras.php', 'api/presupuestos.php', 'api/adjuntos.php', 'api/imagenes.php', 'api/bases-datos.php', 'api/servicios.php', 'api/hubspot.php',
    'api/usuarios.php', 'api/roles.php', 'api/conceptos.php', 'api/estatus.php', 'api/membrete.php',
    'api/catalogos.php', 'api/clientes.php', 'api/registro-obra.php', 'api/tareas.php', 'api/servicios-obra.php', 'api/insumos.php', 'api/costos.php', 'api/conceptos-pu.php', 'api/parametros-presupuesto.php', 'api/importar-insumos.php', 'api/plantillas.php', 'api/contratos.php', 'api/estimaciones.php',
    // ACRINEO
    'acrineo-presupuestos.php', 'api/acrineo/presupuestos.php', 'api/acrineo/catalogos.php',
    'acrineo-hoja.php', 'api/acrineo/hoja.php', 'api/acrineo/unidades.php', 'api/acrineo/tipos-insumo.php',
];

$ruta = ltrim(rawurldecode((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH)), '/');
if ($ruta === '') $ruta = 'index.php';

// ACRINEO: rutas limpias de su API (api/acrineo/presupuestos/15/historial → presupuestos.php?id=15&recurso=historial)
if (preg_match('#^api/acrineo/presupuestos(?:/(\d+))?(?:/(historial|documentos))?/?$#', $ruta, $m)) {
    if (!empty($m[1])) $_GET['id'] = $m[1];
    if (!empty($m[2])) $_GET['recurso'] = $m[2];
    $ruta = 'api/acrineo/presupuestos.php';
} elseif ($ruta === 'api/acrineo/presupuestos/respaldo') {
    $_GET['recurso'] = 'respaldo';
    $ruta = 'api/acrineo/presupuestos.php';
} elseif (preg_match('#^api/acrineo/catalogos/([a-z_]+)$#', $ruta, $m)) {
    $_GET['catalogo'] = $m[1];
    $ruta = 'api/acrineo/catalogos.php';
}

if (!in_array($ruta, ACRI_RUTAS, true)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'No encontrado.';
    exit;
}

$archivo = dirname(__DIR__) . '/' . $ruta;
$_SERVER['SCRIPT_NAME'] = $_SERVER['PHP_SELF'] = '/' . $ruta;
$_SERVER['SCRIPT_FILENAME'] = $archivo;
chdir(dirname($archivo));
require $archivo;
