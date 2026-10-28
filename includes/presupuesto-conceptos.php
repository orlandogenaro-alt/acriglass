<?php
// Conceptos del Análisis P.U. de un presupuesto en tablas (migraciones/017): presupuesto_conceptos y sus
// presupuesto_concepto_insumos. Cada concepto conserva su id entre guardados (el doble clic lo abre por ese id).
// El JSON doctos_sugerido_obra.analisis_pu se sigue guardando como respaldo y con los factores del análisis
// (FSR, herramienta menor, financiamiento). Sin la migración todo sigue funcionando solo con el JSON.
require_once __DIR__ . '/bd.php';
require_once __DIR__ . '/presupuesto-calculo.php';

// Campos opcionales del insumo: columna => número (true) o texto (false); null en la tabla = no se capturó
const PRESUPUESTO_INSUMO_OPCIONALES = ['tipo_calculo' => false, 'base' => false, 'factor' => true, 'merma_pct' => true, 'fsr' => true,
                                       'viaticos' => true, 'alimentacion' => true, 'hospedaje' => true, 'proveedor' => false, 'fecha_costo' => false];

function presupuestoConceptosDisponible(): bool
{
    return bd_tiene_tabla('AW', 'presupuesto_conceptos');
}

// Campos opcionales con los que tiene la tabla (fasar_id llega con migraciones/018)
function presupuestoInsumoOpcionales(): array
{
    static $r = null;
    if ($r === null) {
        $r = PRESUPUESTO_INSUMO_OPCIONALES;
        if (bd_tiene_columna('AW', 'presupuesto_concepto_insumos', 'fasar_id')) $r['fasar_id'] = true;
    }
    return $r;
}

// Conceptos con sus insumos, con la forma del JSON del análisis más el id de cada concepto;
// null si el presupuesto no tiene renglones (uno guardado antes de la migración: se usa su JSON)
function presupuestoConceptosLeer(int $id): ?array
{
    $conceptos = bd_filas('AW', 'select presupuesto_concepto_id, clave, partida, descripcion, unidad, cantidad, venta, especificacion
                                   from presupuesto_conceptos where docto_sugerido_obra_id = ?
                                  order by orden, presupuesto_concepto_id', [$id]);
    if (!$conceptos) return null;
    $insumos = [];
    // Solo los insumos de primer nivel: los componentes de una matriz dentro de matriz (padre_id) van dentro de su insumo
    foreach (bd_filas('AW', 'select i.* from presupuesto_concepto_insumos i
                               join presupuesto_conceptos c on c.presupuesto_concepto_id = i.presupuesto_concepto_id
                              where c.docto_sugerido_obra_id = ? and i.padre_id is null
                              order by i.presupuesto_concepto_id, i.orden, i.presupuesto_concepto_insumo_id', [$id]) as $i) {
        $r = ['tipo' => trim((string) $i['tipo']), 'codigo' => (string) ($i['codigo'] ?? ''), 'descripcion' => (string) ($i['descripcion'] ?? ''),
              'unidad' => (string) ($i['unidad'] ?? ''), 'cantidad' => (float) $i['cantidad'], 'rinde' => (float) $i['rinde'], 'costo' => (float) $i['costo']];
        foreach (presupuestoInsumoOpcionales() as $k => $esNumero) {
            if ($i[$k] === null || $i[$k] === '') continue;
            $r[$k] = $k === 'fasar_id' ? (int) $i[$k] : ($esNumero ? (float) $i[$k] : trim((string) $i[$k]));
        }
        $insumos[(int) $i['presupuesto_concepto_id']][] = $r;
    }
    return array_map(function ($c) use ($insumos) {
        $r = ['id' => (int) $c['presupuesto_concepto_id'], 'clave' => (string) ($c['clave'] ?? ''), 'partida' => (string) ($c['partida'] ?? ''),
              'descripcion' => (string) ($c['descripcion'] ?? ''), 'unidad' => (string) ($c['unidad'] ?? ''), 'cantidad' => (float) $c['cantidad'],
              'especificacion' => (string) ($c['especificacion'] ?? ''), 'insumos' => $insumos[(int) $c['presupuesto_concepto_id']] ?? []];
        if ((float) $c['venta'] > 0) $r['venta'] = (float) $c['venta'];
        return $r;
    }, $conceptos);
}

// Guarda los conceptos del análisis (ya validados por api/presupuestos.php) dentro de la transacción abierta.
// Un concepto con el id de un renglón de ESTE presupuesto se actualiza; los demás se dan de alta (también los copiados
// de otro presupuesto o de la biblioteca, que traen un id ajeno) y los que ya no vienen se borran con sus insumos.
// Los insumos de cada concepto se reemplazan, con la cantidad resultante y el importe por unidad que da el motor.
// Regresa [uid de la pantalla => id] para que la pantalla conozca los ids de los conceptos nuevos.
function presupuestoConceptosGuardar(int $id, array $analisis): array
{
    $existentes = array_flip(array_map('intval', array_column(
        bd_filas('AW', 'select presupuesto_concepto_id from presupuesto_conceptos where docto_sugerido_obra_id = ?', [$id]), 'presupuesto_concepto_id')));
    $vistos = $ids = [];
    foreach (array_values($analisis['conceptos'] ?? []) as $n => $c) {
        $campos = ['clave' => $c['clave'], 'partida' => $c['partida'], 'descripcion' => $c['descripcion'], 'unidad' => $c['unidad'],
                   'cantidad' => $c['cantidad'], 'venta' => ($c['venta'] ?? 0) > 0 ? $c['venta'] : null,
                   'especificacion' => $c['especificacion'], 'orden' => $n + 1];
        $cid = (int) ($c['id'] ?? 0);
        if ($cid && isset($existentes[$cid]) && !isset($vistos[$cid])) {
            bd_ejecutar('AW', 'update presupuesto_conceptos set ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($campos)))
                . ' where presupuesto_concepto_id = ?', array_merge(array_values($campos), [$cid]));
            bd_ejecutar('AW', 'delete from presupuesto_concepto_insumos where presupuesto_concepto_id = ?', [$cid]);
        } else {
            $cid = bd_insertar('AW', 'presupuesto_conceptos', 'presupuesto_concepto_id', ['docto_sugerido_obra_id' => $id] + $campos);
        }
        $vistos[$cid] = 1;
        $calc = pcConcepto($c, $analisis)['insumos'];
        foreach (array_values($c['insumos'] ?? []) as $k => $i) {
            $fila = ['presupuesto_concepto_id' => $cid, 'tipo' => $i['tipo'], 'codigo' => $i['codigo'], 'descripcion' => $i['descripcion'],
                     'unidad' => $i['unidad'], 'cantidad' => $i['cantidad'], 'rinde' => $i['rinde'], 'costo' => $i['costo'],
                     'cantidad_resultante' => round($calc[$k]['cantidad'], 6), 'importe' => round($calc[$k]['importe'], 6), 'orden' => $k + 1];
            foreach (array_keys(presupuestoInsumoOpcionales()) as $o) $fila[$o] = $i[$o] ?? null;
            bd_insertar('AW', 'presupuesto_concepto_insumos', 'presupuesto_concepto_insumo_id', $fila);
        }
        if (isset($c['_uid'])) $ids[(string) $c['_uid']] = $cid;
    }
    foreach (array_keys($existentes) as $eid) {
        if (!isset($vistos[$eid])) bd_ejecutar('AW', 'delete from presupuesto_conceptos where presupuesto_concepto_id = ?', [$eid]);
    }
    return $ids;
}
