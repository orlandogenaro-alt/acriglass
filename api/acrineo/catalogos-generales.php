<?php
// ACRINEO · Catálogos generales (includes/acrineo/catalogos-generales.php).
//   GET  ?c=clave                                   { catalogo, items, refs, puede_cambiar }
//   POST ?c=clave {accion: guardar, id?, datos}      alta (sin id) o cambio; regresa { id }
//                 {accion: eliminar, id}
//                 {accion: pegar, filas: [{columna: valor}]}   pegar de Excel: { altas, cambios, errores }
// Consultar: quien ve presupuestos de ACRINEO. Cambiar: quien modifica presupuestos de ACRINEO, la configuración
// de ACRINEO, el catálogo de insumos (CATALOGO_INSUMOS) o el administrador.
define('ACRI_API', true);
require __DIR__ . '/../../includes/sesion.php';
require __DIR__ . '/../../includes/respuesta.php';
require_once __DIR__ . '/../../includes/bd.php';
require __DIR__ . '/../../includes/acrineo/permisos.php';
require __DIR__ . '/../../includes/acrineo/catalogos-generales.php';

acrineoExigir('presupuestos.ver');
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($metodo !== 'GET') exigirCsrf();
$usuario = (string) $usuarioSesion;
$puedeCambiar = acrineoPuede('presupuestos.editar') || acrineoPuede('configuracion') || tienePermiso('CATALOGO_INSUMOS', 'ADMIN_USER');
session_write_close();

try {
    $d = acrineoCatDef((string) ($_GET['c'] ?? ''));
    if (!acrineoCatDisponible($d)) error("Falta aplicar la migración {$d['migracion']} para el catálogo {$d['titulo']}.", 503);
    if ($metodo === 'GET') {
        responder(['ok' => true, 'catalogo' => acrineoCatCliente($d), 'items' => acrineoCatListar($d),
                   'refs' => acrineoCatRefs($d), 'puede_cambiar' => $puedeCambiar]);
    }
    if ($metodo !== 'POST') error('Método no permitido.', 405);
    if (!$puedeCambiar) error("No tienes permiso para cambiar el catálogo {$d['titulo']}.", 403);
    $in = entrada();
    switch ($in['accion'] ?? '') {
        case 'guardar':
            $id = (int) ($in['id'] ?? 0);
            $datos = is_array($in['datos'] ?? null) ? $in['datos'] : [];
            responder(['ok' => true, 'id' => acrineoCatGuardar($d, $id > 0 ? $id : null, $datos, $usuario)], $id > 0 ? 200 : 201);
        case 'eliminar':
            acrineoCatEliminar($d, (int) ($in['id'] ?? 0));
            responder(['ok' => true]);
        case 'pegar':
            responder(['ok' => true] + acrineoCatPegar($d, is_array($in['filas'] ?? null) ? $in['filas'] : [], $usuario));
    }
    error('Acción no válida.', 400);
} catch (AcrineoError $e) {
    responder(['ok' => false, 'error' => $e->getMessage(), 'errores' => (object) $e->errores], $e->http);
} catch (Throwable $e) {
    error_log('ACRINEO api/catalogos-generales: ' . $e->getMessage());
    error('No se pudo completar la operación con el catálogo.', 500);
}
