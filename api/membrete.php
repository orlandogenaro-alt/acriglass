<?php
// Administrador › Hoja Membretada
// GET  ?accion=leer
// POST ?accion=guardar     {empresa, datos, titulo, titulo_detalle, codigo, revision, firma0..3, leyenda_firma, pie, color, mostrar_notas,
//                           an_titulo, an_subtitulo, an_codigo, an_revision, an_fecha_emision, an_etiqueta_cliente,
//                           an_nota, an_autorizo, an_puesto, an_nombre, an_color, an_dolares}  (Análisis de Cancelería)
// POST ?accion=restablecer vuelve a los textos que trae el sistema (el logo se quita con api/imagenes.php)
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/membrete.php';
require __DIR__ . '/../includes/respuesta.php';

exigirPermiso('ADMIN_USER');

$accion = $_GET['accion'] ?? 'leer';
if ($accion !== 'leer') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
    exigirCsrf();
}
session_write_close();

try {
    switch ($accion) {
        case 'leer':
            break;
        case 'guardar':
            membreteGuardar(entrada());
            break;
        case 'restablecer':
            configGuardar('hoja_membretada', ACRI_MEMBRETE_DEFECTO);
            break;
        default:
            error('Acción no válida.');
    }
    responder(['ok' => true, 'membrete' => membreteImpresion()]);
} catch (Throwable $e) {
    error_log('AcriGlass api/membrete: ' . $e->getMessage());
    error('No se pudo guardar la hoja membretada.', 500);
}
