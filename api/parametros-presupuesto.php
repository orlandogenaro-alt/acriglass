<?php
// Administrador › Parámetros de presupuesto (includes/parametros-presupuesto.php)
// GET  ?accion=datos      parámetros vigentes
// POST ?accion=guardar    {utilidad_modo, utilidad_pct, indirectos_modo, indirecto_pct, indirecto_oficina_pct,
//                          indirecto_campo_pct, financiamiento_pct, iva_tasas: [{nombre, pct}], iva_defecto}
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/respuesta.php';
require __DIR__ . '/../includes/parametros-presupuesto.php';

exigirPermiso('ADMIN_USER');
if (modoConfiguracion()) error('Modo configuración: aún no hay conexión a la base.', 503);
$accion = $_GET['accion'] ?? 'datos';
if ($accion === 'guardar') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
    exigirCsrf();
}
session_write_close();

try {
    switch ($accion) {
        case 'datos':
            $p = parametrosPresupuesto();
            // % de utilidad que se usa hoy si no se captura uno propio (parámetro de costos 101)
            $p101 = bd_valor('AW', 'select valor from parametros_costos_sug where clave = 101');
            responder(['ok' => true, 'parametros' => $p, 'utilidad_101' => is_numeric($p101) ? (float) $p101 : null]);
        case 'guardar':
            responder(['ok' => true, 'parametros' => parametrosPresupuestoGuardar(entrada())]);
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/parametros-presupuesto: ' . $e->getMessage());
    error('No se pudo guardar: ' . bd_mensaje_error($e), 500);
}
