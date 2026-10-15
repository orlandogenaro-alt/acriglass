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

// ---------- FASAR (Factor de Salario Real) ----------
// Reglamento de la LOPSRM:  Fsr = Ps × (Tp / Tl) + Tp / Tl
//   Tp = días calendario + días pagados adicionales (aguinaldo, prima vacacional…)
//   Tl = días calendario − días no laborados (domingos, festivos, vacaciones…)
//   Ps = suma de las obligaciones obrero-patronales en fracción (30 % → 0.30)
// $pagados / $noLaborados: [['concepto', 'dias']] · $obligaciones: [['concepto', 'pct']]. Los valores los captura Acristala.
function puFsr(float $diasCalendario, array $pagados, array $noLaborados, array $obligaciones): array
{
    $suma = fn(array $l, string $k) => array_sum(array_map(fn($r) => (float) ($r[$k] ?? 0), $l));
    $tp = $diasCalendario + $suma($pagados, 'dias');
    $tl = $diasCalendario - $suma($noLaborados, 'dias');
    if ($diasCalendario <= 0) throw new InvalidArgumentException('Los días calendario deben ser mayores que cero.');
    if ($tl <= 0) throw new InvalidArgumentException('Los días no laborados no pueden ser todos los días calendario.');
    $ps = $suma($obligaciones, 'pct') / 100;
    $fsr = $ps * ($tp / $tl) + $tp / $tl;
    return ['tp' => round($tp, 4), 'tl' => round($tl, 4), 'ps' => round($ps, 6), 'fsr' => round($fsr, 4)];
}

// ---------- Costo horario de maquinaria ----------
// Reglamento de la LOPSRM (costo horario directo por hora efectiva de trabajo):
//   Depreciación      D  = (Vm − Vr) / Ve
//   Inversión         Im = (Vm + Vr) × i / (2 × Hea)
//   Seguros           Sm = (Vm + Vr) × s / (2 × Hea)
//   Mantenimiento     Mn = Ko × D
//   Combustible       Co = Gh × Pc
//   Lubricantes       Lb = (Ah + Ga) × Pa
//   Llantas           N  = Pn / Vn
//   Piezas especiales Ae = Pe / Va
//   Operación         Po = Sr / Ht
// Vm valor de la máquina, Vr valor de rescate, Ve vida económica (horas), Hea horas efectivas por año,
// i tasa de interés anual (%), s prima anual de seguros (%), Ko factor de mantenimiento, Gh litros de combustible
// por hora, Pc precio del combustible, Ah aceite por hora, Ga aceite entre cambios por hora, Pa precio del aceite,
// Pn valor de las llantas, Vn su vida (horas), Pe valor de piezas especiales, Va su vida (horas),
// Sr salario real del operador por turno, Ht horas efectivas por turno. Lo que no aplique va en 0.
const PU_COSTO_HORARIO_CAMPOS = ['vm', 'vr', 've', 'hea', 'i', 's', 'ko', 'gh', 'pc', 'ah', 'ga', 'pa', 'pn', 'vn', 'pe', 'va', 'sr', 'ht'];

function puCostoHorario(array $p): array
{
    $v = [];
    foreach (PU_COSTO_HORARIO_CAMPOS as $k) {
        $x = $p[$k] ?? 0;
        if ($x === '' || $x === null) $x = 0;
        if (!is_numeric($x) || (float) $x < 0) throw new InvalidArgumentException("El dato «$k» del costo horario debe ser un número de 0 en adelante.");
        $v[$k] = (float) $x;
    }
    if ($v['vm'] <= 0) throw new InvalidArgumentException('Captura el valor de la máquina (Vm).');
    if ($v['ve'] <= 0) throw new InvalidArgumentException('Captura la vida económica en horas (Ve).');
    if ($v['hea'] <= 0) throw new InvalidArgumentException('Captura las horas efectivas por año (Hea).');
    if ($v['vr'] > $v['vm']) throw new InvalidArgumentException('El valor de rescate no puede ser mayor que el valor de la máquina.');
    if ($v['pn'] > 0 && $v['vn'] <= 0) throw new InvalidArgumentException('Captura la vida de las llantas en horas (Vn).');
    if ($v['pe'] > 0 && $v['va'] <= 0) throw new InvalidArgumentException('Captura la vida de las piezas especiales en horas (Va).');
    if ($v['sr'] > 0 && $v['ht'] <= 0) throw new InvalidArgumentException('Captura las horas efectivas por turno del operador (Ht).');

    $d = ($v['vm'] - $v['vr']) / $v['ve'];
    $partes = [
        'depreciacion'  => $d,
        'inversion'     => ($v['vm'] + $v['vr']) * $v['i'] / 100 / (2 * $v['hea']),
        'seguros'       => ($v['vm'] + $v['vr']) * $v['s'] / 100 / (2 * $v['hea']),
        'mantenimiento' => $v['ko'] * $d,
        'combustible'   => $v['gh'] * $v['pc'],
        'lubricantes'   => ($v['ah'] + $v['ga']) * $v['pa'],
        'llantas'       => $v['pn'] > 0 ? $v['pn'] / $v['vn'] : 0.0,
        'piezas'        => $v['pe'] > 0 ? $v['pe'] / $v['va'] : 0.0,
        'operacion'     => $v['sr'] > 0 ? $v['sr'] / $v['ht'] : 0.0,
    ];
    $partes = array_map(fn($x) => round($x, PU_DECIMALES), $partes);
    return ['partes' => $partes, 'costo' => round(array_sum($partes), PU_DECIMALES), 'datos' => $v];
}

// ---------- Carga desde la base (Supabase) ----------

// Tipo de cambio vigente de cada moneda: ['USD' => 18.25] (vacío sin la tabla o sin capturas)
function puTiposCambio(): array
{
    if (!bd_tiene_tabla('AW', 'tipos_cambio')) return [];
    $r = [];
    foreach (bd_filas('AW', 'select distinct on (moneda) moneda, tipo_cambio from tipos_cambio
                              where fecha <= current_date order by moneda, fecha desc, tipo_cambio_id desc') as $f) {
        $r[trim($f['moneda'])] = (float) $f['tipo_cambio'];
    }
    return $r;
}

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
