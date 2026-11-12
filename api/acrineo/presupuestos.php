<?php
// ACRINEO · API de presupuestos (JSON). También responde en rutas limpias (api/index.php):
//   GET    api/acrineo/presupuestos                      catálogo: q, f_<columna>, estatus, ciudad_id, orden, dir, agrupar, pagina, por_pagina
//   POST   api/acrineo/presupuestos                      crear (cuerpo: el detalle de todas las pestañas)
//   GET    api/acrineo/presupuestos/{id}                 detalle
//   PUT    api/acrineo/presupuestos/{id}                 guardar cambios (cuerpo con "version")
//   DELETE api/acrineo/presupuestos/{id}                 eliminar  ·  DELETE api/acrineo/presupuestos?ids=1,2,3
//   GET    api/acrineo/presupuestos/{id}/historial
//   GET    api/acrineo/presupuestos/{id}/documentos      lista  ·  &doc={n}&modo=ver|descargar  el archivo
//   POST   api/acrineo/presupuestos/{id}/documentos      subir (multipart: tipo, moneda, archivo)
//   DELETE api/acrineo/presupuestos/{id}/documentos?doc={n}
//   GET    api/acrineo/presupuestos/respaldo?ids=1,2     descarga el respaldo JSON
// Equivalente sin rutas limpias: api/acrineo/presupuestos.php?id={id}&recurso=historial|documentos|respaldo
define('ACRI_API', true);
require __DIR__ . '/../../includes/sesion.php';
require __DIR__ . '/../../includes/respuesta.php';
require_once __DIR__ . '/../../includes/bd.php';
require __DIR__ . '/../../includes/acrineo/permisos.php';
require __DIR__ . '/../../includes/acrineo/presupuestos.php';

acrineoExigir('presupuestos.ver');
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($metodo !== 'GET') exigirCsrf();
// Lo que se usa de la sesión se lee aquí; se libera para no frenar otras peticiones del mismo usuario
$usuario = (string) $usuarioSesion;
$puede = acrineoPermisosCliente();
session_write_close();

$id = max(0, (int) ($_GET['id'] ?? 0));
$recurso = (string) ($_GET['recurso'] ?? '');

function idsParametro(): array
{
    return array_map('intval', array_filter(explode(',', (string) ($_GET['ids'] ?? '')), 'strlen'));
}

function necesita(array $puede, string $accion): void
{
    if (empty($puede[$accion])) error('No tienes permiso para esta acción (' . ACRINEO_ACCIONES[$accion] . ').', 403);
}

try {
    if (!acrineoDisponible()) error('ACRINEO todavía no está instalado en la base: falta aplicar la migración 024_acrineo_presupuestos.sql.', 503);

    // ----- Respaldo (descarga) -----
    if ($recurso === 'respaldo' && $metodo === 'GET') {
        necesita($puede, 'presupuestos.respaldar');
        $ids = $id ? [$id] : idsParametro();
        $json = json_encode(acrineoRespaldo($ids, $usuario), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('Content-Disposition: attachment; filename="acrineo-respaldo-' . date('Ymd-His') . '.json"');
        echo $json;
        exit;
    }

    // ----- Catálogo / alta / eliminar varios -----
    if (!$id) {
        if ($recurso !== '') error('Falta el presupuesto.', 400);
        switch ($metodo) {
            case 'GET':
                responder(['ok' => true] + acrineoListar($_GET));
            case 'POST':
                necesita($puede, 'presupuestos.crear');
                $p = acrineoGuardar(null, entrada(), $usuario);
                responder(['ok' => true, 'presupuesto' => $p + ['documentos' => []], 'mensaje' => 'Presupuesto creado.'], 201);
            case 'DELETE':
                necesita($puede, 'presupuestos.eliminar');
                $n = acrineoEliminar(idsParametro(), $usuario);
                responder(['ok' => true, 'eliminados' => $n]);
        }
        error('Método no permitido.', 405);
    }

    switch ($recurso) {
        case '':
            switch ($metodo) {
                case 'GET':
                    $p = acrineoObtener($id);
                    if (!$p) error('El presupuesto no existe o fue eliminado.', 404);
                    responder(['ok' => true, 'presupuesto' => $p + ['documentos' => acrineoDocListar($id)]]);
                case 'PUT':
                    necesita($puede, 'presupuestos.editar');
                    $in = entrada();
                    $version = isset($in['version']) && is_numeric($in['version']) ? (int) $in['version'] : null;
                    $p = acrineoGuardar($id, $in, $usuario, $version);
                    responder(['ok' => true, 'presupuesto' => $p + ['documentos' => acrineoDocListar($id)], 'mensaje' => 'Guardado correctamente.']);
                case 'DELETE':
                    necesita($puede, 'presupuestos.eliminar');
                    acrineoEliminar([$id], $usuario);
                    responder(['ok' => true, 'eliminados' => 1]);
            }
            break;

        case 'historial':
            if ($metodo !== 'GET') break;
            if (!acrineoObtener($id)) error('El presupuesto no existe o fue eliminado.', 404);
            responder(['ok' => true, 'historial' => acrineoHistorial($id)]);

        case 'documentos':
            if (!acrineoObtener($id)) error('El presupuesto no existe o fue eliminado.', 404);
            $doc = max(0, (int) ($_GET['doc'] ?? 0));
            if ($metodo === 'GET') {
                if (!$doc) responder(['ok' => true, 'documentos' => acrineoDocListar($id)]);
                [$fila, $contenido] = acrineoDocContenido($id, $doc);
                acrineoDocEntregar($fila, $contenido, ($_GET['modo'] ?? '') === 'ver');
            }
            necesita($puede, 'presupuestos.documentos');
            if ($metodo === 'POST') {
                $docs = acrineoDocSubir($id, (string) ($_POST['tipo'] ?? ''), $_POST['moneda'] ?? null, $_FILES['archivo'] ?? [], $usuario);
                responder(['ok' => true, 'documentos' => $docs, 'mensaje' => 'Documento guardado.']);
            }
            if ($metodo === 'DELETE') {
                if (!$doc) error('Falta el documento.', 400);
                responder(['ok' => true, 'documentos' => acrineoDocEliminar($id, $doc, $usuario), 'mensaje' => 'Documento eliminado.']);
            }
            break;

        default:
            error('Recurso no válido.', 404);
    }
    error('Método no permitido.', 405);
} catch (AcrineoError $e) {
    responder(['ok' => false, 'error' => $e->getMessage(), 'errores' => (object) $e->errores], $e->http);
} catch (Throwable $e) {
    error_log('ACRINEO api/presupuestos: ' . $e->getMessage());
    error('No se pudo completar la operación. Intenta de nuevo; si sigue fallando avisa al administrador.', 500);
}
