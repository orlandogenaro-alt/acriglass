<?php
// ACRINEO · Tablero de Bienvenido (tarjetas de General y Proyectos) con los presupuestos de ACRINEO:
// estatus, costo directo y precio de venta (los guarda la hoja) y las facturas / pedidos de Microsip ligados (migración 034).
// API: api/acrineo/presupuestos.php?recurso=tablero&anio=AAAA&estatus=ACTIVOS|<estatus>&ini=AAAA-MM-DD&fin=AAAA-MM-DD
require_once __DIR__ . '/ligados.php';

const ACRINEO_PENDIENTES = ['BORRADOR', 'EN_PROCESO', 'ENVIADO'];

function acrineoTablero(int $anio, string $estatus, string $ini, string $fin): array
{
    $ligados = acrineoLigadosDisponible();
    // Presupuestos vivos con su % de IVA y lo ligado de Microsip (facturas y pedidos, con IVA)
    $desde = ' from acrineo_presupuestos p
               left join acrineo_presupuesto_calculo k on k.presupuesto_id = p.presupuesto_id'
           . ($ligados
               ? " left join lateral (select sum(l.total) filter (where l.origen = 'Factura Microsip') as facturado,
                                             sum(l.total) filter (where l.origen = 'Pedido Microsip') as pedidos
                                        from acrineo_presupuesto_ligados l where l.presupuesto_id = p.presupuesto_id) x on true"
               : ' left join lateral (select null::numeric as facturado, null::numeric as pedidos) x on true')
           . ' where p.deleted_at is null';
    $iva = 'coalesce(k.iva, ' . ACRINEO_IVA . ')';

    // ----- General: todos los presupuestos -----
    $pend = "'" . implode("','", ACRINEO_PENDIENTES) . "'";
    $g = bd_fila('AW',
        "select count(*) filter (where p.estatus in ($pend)) as pendientes,
                count(*) filter (where p.estatus = 'APROBADO') as aprobados,
                count(*) filter (where p.created_at >= cast(? as date) and p.created_at < cast(? as date) + 1) as nuevos_mes,
                coalesce(sum(p.precio_venta) filter (where p.estatus = 'APROBADO'), 0) as importe_aprobado,
                coalesce(sum(p.precio_venta * (1 + $iva / 100)) filter (where p.estatus = 'APROBADO'), 0) as aprobado_con_iva,
                coalesce(sum(x.facturado) filter (where p.estatus = 'APROBADO'), 0) as facturado
         $desde", [$ini, $fin]);
    $general = [
        'pendientes' => (int) $g['pendientes'], 'aprobados' => (int) $g['aprobados'], 'nuevos_mes' => (int) $g['nuevos_mes'],
        'importe_aprobado' => round((float) $g['importe_aprobado'], 2), 'facturado' => round((float) $g['facturado'], 2),
        'por_facturar' => round(max(0, (float) $g['aprobado_con_iva'] - (float) $g['facturado']), 2),
    ];

    // ----- Proyectos: los presupuestos del año (por fecha de alta) con el estatus elegido -----
    $where = ' and extract(year from p.created_at) = cast(? as integer)';
    $params = [$anio];
    if ($estatus === 'ACTIVOS') {
        $where .= " and p.estatus not in ('RECHAZADO', 'CANCELADO')";
    } elseif (isset(ACRINEO_ESTATUS[$estatus])) {
        $where .= ' and p.estatus = ?';
        $params[] = $estatus;
    }
    $filas = bd_filas('AW',
        "select p.presupuesto_id as id, p.codigo, p.nombre, p.estatus, p.costo_directo, p.precio_venta, $iva as iva,
                coalesce(x.facturado, 0) as facturado, coalesce(x.pedidos, 0) as pedidos
         $desde $where
          order by p.precio_venta desc, p.codigo", $params);
    $presupuestos = array_map(fn($f) => [
        'id' => (int) $f['id'], 'codigo' => $f['codigo'], 'nombre' => $f['nombre'],
        'estatus' => $f['estatus'], 'estatus_texto' => ACRINEO_ESTATUS[$f['estatus']] ?? $f['estatus'],
        'costo_directo' => (float) $f['costo_directo'], 'precio_venta' => (float) $f['precio_venta'], 'iva' => (float) $f['iva'],
        'facturado' => (float) $f['facturado'], 'pedidos' => (float) $f['pedidos'],
    ], $filas);

    $anios = array_map(fn($f) => (int) $f['a'], bd_filas('AW',
        'select distinct cast(extract(year from created_at) as integer) as a from acrineo_presupuestos where deleted_at is null order by 1 desc'));

    return [
        'general' => $general, 'presupuestos' => $presupuestos, 'anios' => $anios,
        'avisos' => $ligados ? [] : ['Falta la migración 034: lo facturado sale en cero.'],
    ];
}
