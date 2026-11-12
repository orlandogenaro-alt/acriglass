<?php
// ACRINEO · Catálogo Tipos de insumos (lupa de Tipo en la matriz de precio unitario).
//   GET  api/acrineo/tipos-insumo.php?q=                       tipos (Tipo, Descripción)
//   POST api/acrineo/tipos-insumo.php {accion: crear,    tipo, descripcion}
//                                     {accion: editar,   id, tipo, descripcion}
//                                     {accion: eliminar, id}
// Consultar: quien puede ver presupuestos de ACRINEO. Cambiar: quien modifica presupuestos de ACRINEO,
// el catálogo de insumos (CATALOGO_INSUMOS) o el administrador.
define('ACRI_API', true);
require __DIR__ . '/../../includes/sesion.php';
require __DIR__ . '/../../includes/respuesta.php';
require_once __DIR__ . '/../../includes/bd.php';
require __DIR__ . '/../../includes/acrineo/permisos.php';
require __DIR__ . '/../../includes/acrineo/tipos-insumo.php';

acrineoExigir('presupuestos.ver');
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($metodo !== 'GET') exigirCsrf();
$puedeCambiar = acrineoPuede('presupuestos.editar') || tienePermiso('CATALOGO_INSUMOS', 'ADMIN_USER');
session_write_close();

try {
    $disponible = acrineoTiposInsumoDisponible();
    if ($metodo === 'GET') {
        responder(['ok' => true, 'puede_cambiar' => $puedeCambiar && $disponible] + acrineoTiposInsumoListar((string) ($_GET['q'] ?? '')));
    }
    if ($metodo !== 'POST') error('Método no permitido.', 405);
    if (!$disponible) error('Falta el catálogo de tipos de insumos (migración 028).', 503);
    if (!$puedeCambiar) error('No tienes permiso para cambiar el catálogo de tipos de insumos.', 403);
    $in = entrada();
    switch ($in['accion'] ?? '') {
        case 'crear':
            responder(['ok' => true, 'tipo' => acrineoTipoInsumoGuardar(null, $in)], 201);
        case 'editar':
            responder(['ok' => true, 'tipo' => acrineoTipoInsumoGuardar((int) ($in['id'] ?? 0) ?: -1, $in)]);
        case 'eliminar':
            acrineoTipoInsumoEliminar((int) ($in['id'] ?? 0));
            responder(['ok' => true]);
    }
    error('Acción no válida.', 400);
} catch (AcrineoError $e) {
    responder(['ok' => false, 'error' => $e->getMessage(), 'errores' => (object) $e->errores], $e->http);
} catch (Throwable $e) {
    error_log('ACRINEO api/tipos-insumo: ' . $e->getMessage());
    error('No se pudo completar la operación con el catálogo de tipos de insumos.', 500);
}
