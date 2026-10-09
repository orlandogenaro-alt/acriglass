<?php
// Administrador › Conceptos de Materia Prima / Mano de Obra / Gastos de Operacion (?tipo=mp|mo|go)
require __DIR__ . '/includes/sesion.php';
require __DIR__ . '/includes/conceptos.php';
exigirPermiso('ADMIN_USER');

$tipo = $_GET['tipo'] ?? '';
if (!isset(ACRI_CONCEPTOS[$tipo])) {
    http_response_code(404);
    exit('Tipo de concepto no válido.');
}
$seccion = ['mp' => 'Materia Prima', 'mo' => 'Mano de Obra', 'go' => 'Gastos de Operacion'][$tipo];

$botones = [['agregar', 'Agregar', true]];
try {
    if (!modoConfiguracion() && conceptosConEstatus($tipo)) $botones[] = ['activar', 'Activar /<br>Desactivar'];
} catch (Throwable $e) {
    error_log('AcriGlass conceptos: ' . $e->getMessage());   // la lista mostrará el error de conexión
}
$botones[] = ['refrescar', 'Refrescar'];

$pagina = [
    'id'     => 'conceptos-' . $tipo,
    'titulo' => ACRI_CONCEPTOS[$tipo]['titulo'],
    'api'    => 'api/conceptos.php?tipo=' . $tipo,
    'script' => 'js/conceptos.js',
    'descripcion' =>
        'Conceptos que aparecen en la lista desplegable de la sección <b>' . e($seccion) . '</b> del Presupuesto de Obra, ' .
        'para que el presupuesto salga desglosado por concepto. Un concepto que ya se usó en algún presupuesto no se puede eliminar' .
        (count($botones) > 2 ? ': desactívalo y dejará de ofrecerse en los presupuestos nuevos (los que ya lo usan lo conservan).' : '.'),
    'botones' => $botones,
];
require __DIR__ . '/includes/catalogo-pagina.php';
