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

// Copia congelada del presupuesto completo en presupuesto_versiones (migraciones/006): encabezado, renglones,
// artículos importados, empleados, comisiones, anexo de seguro, relacionados, Análisis P.U. y Conceptos/Tareas.
// Se llama dentro de la transacción y con el presupuesto apartado (presupuestoBloquear), así el número de
// versión no se repite. Sin la tabla no hace nada. Regresa el número de versión (0 sin tabla).
function presupuestoVersion(int $id, string $motivo, ?int $obraId = null): int
{
    if (bd_motor('AW') !== 'pgsql' || !bd_tiene_tabla('AW', 'presupuesto_versiones')) return 0;
    $enc = bd_fila('AW', 'select * from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$id]);
    if (!$enc) return 0;
    foreach (['analisis_pu', 'datos_obra'] as $k) {
        if (isset($enc[$k]) && is_string($enc[$k])) $enc[$k] = json_decode($enc[$k], true) ?? $enc[$k];
    }
    $det = bd_filas('AW', 'select * from doctos_sugerido_obra_det where docto_sugerido_obra_id = ? order by docto_sugerido_obra_det_id', [$id]);
    $snapshot = [
        'encabezado'   => $enc,
        'renglones'    => $det,
        'articulos'    => bd_filas('AW', 'select m.* from doctos_suge_obra_det_mat m join doctos_sugerido_obra_det d
                                            on d.docto_sugerido_obra_det_id = m.docto_sugerido_obra_det_id
                                          where d.docto_sugerido_obra_id = ? order by m.docto_suge_obra_det_mat_id', [$id]),
        'empleados'    => bd_filas('AW', 'select * from mano_obra_detalle where docto_sugerido_obra_id = ? order by mano_obra_det_id', [$id]),
        'comisiones'   => bd_filas('AW', 'select * from comisiones_obra_det where docto_sugerido_obra_id = ? order by comision_obra_det_id', [$id]),
        'seguros'      => bd_filas('AW', 'select * from anexos_obra_seguro where docto_sugerido_obra_id = ? order by anexo_obra_idd', [$id]),
        'relacionados' => bd_filas('AW', 'select * from sugeridos_relacionados where sugerido_id_padre = ? order by sug_relacion_id', [$id]),
        'tareas'       => bd_tiene_tabla('AW', 'conceptos_tareas')
            ? bd_filas('AW', 'select * from conceptos_tareas where docto_sugerido_obra_id = ? order by orden, tarea_id', [$id]) : [],
    ];
    $json = json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    $version = (int) bd_valor('AW', 'select coalesce(max(version), 0) + 1 from presupuesto_versiones where docto_sugerido_obra_id = ?', [$id]);
    // El hash se saca del JSON como lo guarda la base: para verificar una versión basta
    // encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex') = hash
    bd_ejecutar('AW', "insert into presupuesto_versiones (docto_sugerido_obra_id, version, motivo, obra_id, snapshot, hash, total, usuario)
                       select ?, ?, ?, ?, s.j, encode(sha256(convert_to(s.j::text, 'UTF8')), 'hex'), ?, ?
                         from (select cast(? as jsonb) as j) s",
        [$id, $version, $motivo, $obraId, $enc['total'] ?? null, mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50), $json]);
    return $version;
}

// Obra ligada al presupuesto: la de su obra_id si existe; si no, la primera obra que apunte a él
function presupuestoObra(int $id, int $obraId = 0): int
{
    if ($obraId && bd_valor('AW', 'select count(*) from reg_obras where obra_id = ?', [$obraId])) return $obraId;
    return (int) bd_valor('AW', 'select min(obra_id) from reg_obras where sugerido_id = ?', [$id]);
}
