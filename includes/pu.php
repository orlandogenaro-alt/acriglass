<?php
// Motor de costos de insumos (catálogo de migraciones/004_insumos.sql). Las funciones pu* son puras:
// reciben el catálogo ya cargado, sin tocar la base, para que las pruebas (pruebas/pu.php) usen
// exactamente el mismo cálculo que el sistema.
//
// Reglas:
//   MAT, EQ, HER: costo = precio vigente.
//   MO:           costo = precio vigente (salario base por jornada) × FSR del insumo.
//   BAS:          costo = Σ costo del componente × cantidad × (1 + % desperdicio / 100).
//   Moneda:       el costo se expresa en MXN. Un precio en USD necesita el tipo de cambio;
//                 sin él, el insumo queda pendiente (no se inventa).
//   Sin precio:   el insumo y los básicos que lo usan quedan pendientes, con la lista de lo que falta.
//   Redondeo:     costos unitarios a 6 decimales (como se guardan); los importes del presupuesto se
//                 redondean a 2 decimales donde se calculan.
//   Circulares:   un básico que se contiene a sí mismo es un error (la base también lo impide).

const PU_DECIMALES = 6;

// Catálogo para el motor:
//   $insumos:     [id => ['clave', 'descripcion', 'tipo', 'fsr', 'precio' (null = sin precio), 'moneda']]
//   $componentes: [id del básico => [['insumo_id', 'cantidad', 'desperdicio_pct'], …]]
//   $tiposCambio: ['USD' => 18.25, …] (pesos por unidad de moneda)
// Regresa ['costo' => float|null, 'faltan' => [claves sin precio o sin tipo de cambio]]
function puCostoInsumo(int $id, array $insumos, array $componentes, array $tiposCambio = [], array &$memo = [], array $camino = []): array
{
    if (isset($memo[$id])) return $memo[$id];
    if (!isset($insumos[$id])) throw new InvalidArgumentException("El insumo $id no existe en el catálogo.");
    if (in_array($id, $camino, true)) {
        $ruta = implode(' → ', array_map(fn($i) => $insumos[$i]['clave'], array_merge($camino, [$id])));
        throw new RuntimeException("Referencia circular en los básicos: $ruta");
    }
    $ins = $insumos[$id];

    if ($ins['tipo'] === 'BAS') {
        $costo = 0.0;
        $faltan = [];
        foreach ($componentes[$id] ?? [] as $c) {
            $r = puCostoInsumo((int) $c['insumo_id'], $insumos, $componentes, $tiposCambio, $memo, array_merge($camino, [$id]));
            if ($r['costo'] === null) { $faltan = array_merge($faltan, $r['faltan']); continue; }
            $costo += $r['costo'] * (float) $c['cantidad'] * (1 + (float) ($c['desperdicio_pct'] ?? 0) / 100);
        }
        if (empty($componentes[$id])) $faltan[] = $ins['clave'] . ' (básico sin componentes)';
        $faltan = array_values(array_unique($faltan));
        return $memo[$id] = ['costo' => $faltan ? null : round($costo, PU_DECIMALES), 'faltan' => $faltan];
    }

    if ($ins['precio'] === null) return $memo[$id] = ['costo' => null, 'faltan' => [$ins['clave']]];
    $tc = puTipoCambio($ins['moneda'] ?? 'MXN', $tiposCambio);
    if ($tc === null) return $memo[$id] = ['costo' => null, 'faltan' => [$ins['clave'] . ' (tipo de cambio ' . $ins['moneda'] . ')']];
    $costo = (float) $ins['precio'] * $tc;
    if ($ins['tipo'] === 'MO') $costo *= (float) ($ins['fsr'] ?? 1) ?: 1;
    return $memo[$id] = ['costo' => round($costo, PU_DECIMALES), 'faltan' => []];
}

// Pesos por unidad de la moneda (MXN = 1); null si falta
function puTipoCambio(string $moneda, array $tiposCambio): ?float
{
    if ($moneda === 'MXN') return 1.0;
    $tc = (float) ($tiposCambio[$moneda] ?? 0);
    return $tc > 0 ? $tc : null;
}

// Desglose de un básico para la ficha: cada componente con su costo e importe
function puDesglose(int $id, array $insumos, array $componentes, array $tiposCambio = []): array
{
    $memo = [];
    $filas = [];
    foreach ($componentes[$id] ?? [] as $c) {
        $cid = (int) $c['insumo_id'];
        $r = puCostoInsumo($cid, $insumos, $componentes, $tiposCambio, $memo, [$id]);
        $factor = (float) $c['cantidad'] * (1 + (float) ($c['desperdicio_pct'] ?? 0) / 100);
        $filas[] = [
            'insumo_id' => $cid, 'clave' => $insumos[$cid]['clave'], 'descripcion' => $insumos[$cid]['descripcion'],
            'tipo' => $insumos[$cid]['tipo'], 'unidad' => $insumos[$cid]['unidad'] ?? '',
            'cantidad' => (float) $c['cantidad'], 'desperdicio_pct' => (float) ($c['desperdicio_pct'] ?? 0),
            'costo' => $r['costo'], 'importe' => $r['costo'] === null ? null : round($r['costo'] * $factor, PU_DECIMALES),
        ];
    }
    return $filas;
}

// ---------- Carga desde la base (Supabase) ----------

// true si ya se aplicó migraciones/004_insumos.sql
function puDisponible(): bool
{
    return bd_tiene_tabla('AW', 'insumos');
}

// Catálogo completo con su precio vigente: [$insumos, $componentes] para puCostoInsumo
function puCargarCatalogo(): array
{
    $insumos = [];
    foreach (bd_filas('AW', 'select i.insumo_id, i.clave, i.descripcion, i.tipo, i.fsr, i.familia, i.estatus, u.clave as unidad,
                                    p.precio, p.moneda, p.vigente_desde
                               from insumos i
                               join unidades u on u.unidad_id = i.unidad_id
                               left join insumos_precio_vigente p on p.insumo_id = i.insumo_id') as $f) {
        $insumos[(int) $f['insumo_id']] = $f;
    }
    $componentes = [];
    foreach (bd_filas('AW', 'select insumo_id, componente_insumo_id, cantidad, desperdicio_pct from insumo_componentes order by insumo_id, orden, componente_id') as $c) {
        $componentes[(int) $c['insumo_id']][] = ['insumo_id' => (int) $c['componente_insumo_id'], 'cantidad' => $c['cantidad'], 'desperdicio_pct' => $c['desperdicio_pct']];
    }
    return [$insumos, $componentes];
}
