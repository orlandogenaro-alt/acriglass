<?php
// Conceptos/Tareas capturados desde la obra (pestaña 13): se guardan en el mismo presupuesto (conceptos_tareas)
// POST ?accion=guardar  { presupuesto_id, tareas: [...] }  regresa { avance, avance_obra }
// El presupuesto guarda los suyos junto con el documento (api/presupuestos.php).
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/tareas.php';
require __DIR__ . '/../includes/respuesta.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') error('Método no permitido.', 405);
if (modoConfiguracion()) error('Modo configuración: aún no hay conexión a AW-Management.', 503);
exigirCsrf();
exigirPermiso('NUEVO_SUGERIDO_OBRA', 'MODIFICAR_SUGERIDO_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'ADMIN_USER');
session_write_close();

try {
    if (($_GET['accion'] ?? '') !== 'guardar') error('Acción no válida.');
    $d = entrada();
    $id = (int) ($d['presupuesto_id'] ?? 0);
    if (!$id || bd_valor('AW', 'select count(*) from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$id]) == 0) {
        error('El presupuesto de la obra ya no existe.', 404);
    }
    if (!tareasDisponibles()) error(tareasAviso(), 503);
    $obra = bd_fila('AW', 'select estatus from reg_obras where sugerido_id = ?', [$id]);
    if ($obra && in_array(trim((string) $obra['estatus']), ['Finalizacion', 'Cancelado'], true)) {
        error('La obra está ' . trim((string) $obra['estatus']) . ': ya no se pueden modificar sus conceptos/tareas.');
    }
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        $r = guardarTareas($id, (array) ($d['tareas'] ?? []));
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    responder(['ok' => true, 'avance' => $r['avance'], 'avance_obra' => $r['avance_obra']]);
} catch (Throwable $e) {
    error_log('AcriGlass api/tareas: ' . $e->getMessage());
    error('No se pudieron guardar los conceptos/tareas: ' . bd_mensaje_error($e), 500);
}
