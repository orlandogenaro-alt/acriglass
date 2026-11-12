<?php
// ACRINEO · Catálogo de unidades.
//   GET  api/acrineo/unidades.php?q=                         unidades activas (Unidad, Descripción)
//   POST api/acrineo/unidades.php {accion: crear,    unidad, descripcion}
//                                 {accion: editar,   id, unidad, descripcion}
//                                 {accion: eliminar, id}
// Consultar: quien puede ver presupuestos de ACRINEO. Cambiar: quien modifica presupuestos de ACRINEO,
// el catálogo de insumos (CATALOGO_INSUMOS) o el administrador.
define('ACRI_API', true);
require __DIR__ . '/../../includes/sesion.php';
require __DIR__ . '/../../includes/respuesta.php';
require_once __DIR__ . '/../../includes/bd.php';
require __DIR__ . '/../../includes/acrineo/permisos.php';
require __DIR__ . '/../../includes/acrineo/unidades.php';

acrineoExigir('presupuestos.ver');
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($metodo !== 'GET') exigirCsrf();
$puedeCambiar = acrineoPuede('presupuestos.editar') || tienePermiso('CATALOGO_INSUMOS', 'ADMIN_USER');
session_write_close();

try {
    if (!acrineoUnidadesDisponible()) error('Falta el catálogo de unidades (migración 004).', 503);
    if ($metodo === 'GET') {
        responder(['ok' => true, 'puede_cambiar' => $puedeCambiar] + acrineoUnidadesListar((string) ($_GET['q'] ?? '')));
    }
    if ($metodo !== 'POST') error('Método no permitido.', 405);
    if (!$puedeCambiar) error('No tienes permiso para cambiar el catálogo de unidades.', 403);
    $in = entrada();
    switch ($in['accion'] ?? '') {
        case 'crear':
            responder(['ok' => true, 'unidad' => acrineoUnidadGuardar(null, $in)], 201);
        case 'editar':
            responder(['ok' => true, 'unidad' => acrineoUnidadGuardar((int) ($in['id'] ?? 0) ?: -1, $in)]);
        case 'eliminar':
            acrineoUnidadEliminar((int) ($in['id'] ?? 0));
            responder(['ok' => true]);
    }
    error('Acción no válida.', 400);
} catch (AcrineoError $e) {
    responder(['ok' => false, 'error' => $e->getMessage(), 'errores' => (object) $e->errores], $e->http);
} catch (Throwable $e) {
    error_log('ACRINEO api/unidades: ' . $e->getMessage());
    error('No se pudo completar la operación con el catálogo de unidades.', 500);
}
