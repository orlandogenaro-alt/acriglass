<?php
// ACRINEO · Catálogos de los botones de búsqueda del «Detalle del presupuesto».
//   GET  api/acrineo/catalogos.php?catalogo=ciudades|usuarios|empresas|clientes|vendedores|regiones|plantillas|tipos_licitacion&q=&pagina=
//   POST api/acrineo/catalogos.php?catalogo=empresas   { nombre, rfc }   alta rápida de una empresa
define('ACRI_API', true);
require __DIR__ . '/../../includes/sesion.php';
require __DIR__ . '/../../includes/respuesta.php';
require_once __DIR__ . '/../../includes/bd.php';
require __DIR__ . '/../../includes/acrineo/permisos.php';
require __DIR__ . '/../../includes/acrineo/presupuestos.php';

acrineoExigir('presupuestos.ver');
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($metodo !== 'GET') exigirCsrf();
$usuario = (string) $usuarioSesion;
$puedeAlta = acrineoPuede('presupuestos.crear') || acrineoPuede('presupuestos.editar');
session_write_close();

$catalogo = (string) ($_GET['catalogo'] ?? '');

try {
    if ($metodo === 'GET') {
        responder(['ok' => true] + acrineoBuscarCatalogo($catalogo, (string) ($_GET['q'] ?? ''), (int) ($_GET['pagina'] ?? 1), (int) ($_GET['por_pagina'] ?? 50)));
    }
    if ($metodo === 'POST' && $catalogo === 'empresas') {
        if (!$puedeAlta) error('No tienes permiso para dar de alta empresas.', 403);
        if (!acrineoDisponible()) error('Falta aplicar la migración 024_acrineo_presupuestos.sql.', 503);
        responder(['ok' => true, 'item' => acrineoAltaEmpresa(entrada(), $usuario)], 201);
    }
    error('Método no permitido.', 405);
} catch (AcrineoError $e) {
    responder(['ok' => false, 'error' => $e->getMessage(), 'errores' => (object) $e->errores], $e->http);
} catch (Throwable $e) {
    error_log('ACRINEO api/catalogos: ' . $e->getMessage());
    error('No se pudo consultar el catálogo.', 500);
}
