<?php
// Liga entre el presupuesto de obra (doctos_sugerido_obra) y su obra (reg_obras).
// Se usa dentro de una transacción ya abierta: presupuestoBloquear() aparta el renglón del presupuesto
// para que dos peticiones a la vez (doble clic, dos usuarios) no registren dos obras del mismo presupuesto.
require_once __DIR__ . '/bd.php';

// Aparta el presupuesto hasta el commit / rollback y regresa { estatus, obra_id } con la obra ligada
// (0 si no tiene), o null si ya no existe. Una segunda petición espera aquí (Supabase) o falla por
// conflicto de actualización (Firebird) y no llega a crear otra obra.
function presupuestoBloquear(int $id): ?array
{
    if (!bd_ejecutar('AW', 'update doctos_sugerido_obra set obra_id = obra_id where docto_sugerido_obra_id = ?', [$id])) return null;
    $p = bd_fila('AW', 'select estatus, obra_id from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$id]);
    if (!$p) return null;
    return ['estatus' => trim((string) $p['estatus']), 'obra_id' => presupuestoObra($id, (int) $p['obra_id'])];
}

// Obra ligada al presupuesto: la de su obra_id si existe; si no, la primera obra que apunte a él
function presupuestoObra(int $id, int $obraId = 0): int
{
    if ($obraId && bd_valor('AW', 'select count(*) from reg_obras where obra_id = ?', [$obraId])) return $obraId;
    return (int) bd_valor('AW', 'select min(obra_id) from reg_obras where sugerido_id = ?', [$id]);
}
