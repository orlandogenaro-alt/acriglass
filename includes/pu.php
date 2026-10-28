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

require_once __DIR__ . '/presupuesto-calculo.php';

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

// ---------- Conceptos (matriz de insumos por unidad del concepto) ----------
// Renglón de la matriz: ['insumo_id', 'cantidad', 'rendimiento' (opcional), 'desperdicio_pct']
// Con rendimiento (unidades del concepto por jornada), la cantidad es 1 / rendimiento.

function puCantidadMatriz(array $r): float
{
    $base = (float) ($r['rendimiento'] ?? 0) > 0 ? 1 / (float) $r['rendimiento'] : (float) $r['cantidad'];
    return $base * (1 + (float) ($r['desperdicio_pct'] ?? 0) / 100);
}

// Costo directo por unidad del concepto con el costo de catálogo de cada insumo (la mano de obra con su FSR)
function puCostoConcepto(array $matriz, array $insumos, array $componentes, array $tiposCambio = []): array
{
    $memo = [];
    $cd = 0.0;
    $faltan = [];
    $filas = [];
    foreach ($matriz as $r) {
        $id = (int) $r['insumo_id'];
        $c = puCostoInsumo($id, $insumos, $componentes, $tiposCambio, $memo);
        $cant = puCantidadMatriz($r);
        $imp = $c['costo'] === null ? null : round($c['costo'] * $cant, PU_DECIMALES);
        if ($imp === null) $faltan = array_merge($faltan, $c['faltan']); else $cd += $imp;
        $filas[] = ['insumo_id' => $id, 'clave' => $insumos[$id]['clave'], 'descripcion' => $insumos[$id]['descripcion'], 'tipo' => $insumos[$id]['tipo'],
                    'unidad' => $insumos[$id]['unidad'] ?? '', 'cantidad' => (float) $r['cantidad'], 'rendimiento' => (float) ($r['rendimiento'] ?? 0) ?: null,
                    'desperdicio_pct' => (float) ($r['desperdicio_pct'] ?? 0), 'cantidad_efectiva' => round($cant, PU_DECIMALES),
                    'costo' => $c['costo'], 'importe' => $imp];
    }
    $faltan = array_values(array_unique($faltan));
    return ['cd' => $faltan ? null : round($cd, PU_DECIMALES), 'faltan' => $faltan, 'filas' => $filas];
}

// Matriz del concepto como la usa el Análisis P.U. del presupuesto: solo insumos simples (los básicos se
// desarman en sus componentes), tipos MAT / MO / EQ (la herramienta va como EQ), la cantidad ya con
// desperdicio, y la mano de obra con su SALARIO BASE (el análisis le aplica su FSR; así no se aplica dos veces).
// El mismo insumo que aparece por varios caminos se junta en un renglón.
function puAplanarMatriz(array $matriz, array $insumos, array $componentes, array $tiposCambio = []): array
{
    $hojas = [];
    $faltan = [];
    $memo = [];
    $agregar = function (int $id, float $cant, array $camino) use (&$agregar, &$hojas, &$faltan, &$memo, $insumos, $componentes, $tiposCambio) {
        if (!isset($insumos[$id])) throw new InvalidArgumentException("El insumo $id no existe en el catálogo.");
        if (in_array($id, $camino, true)) throw new RuntimeException('Referencia circular en los básicos: ' . $insumos[$id]['clave']);
        $ins = $insumos[$id];
        if ($ins['tipo'] === 'BAS') {
            if (empty($componentes[$id])) { $faltan[] = $ins['clave'] . ' (básico sin componentes)'; return; }
            foreach ($componentes[$id] as $c) {
                $agregar((int) $c['insumo_id'], $cant * (float) $c['cantidad'] * (1 + (float) ($c['desperdicio_pct'] ?? 0) / 100), array_merge($camino, [$id]));
            }
            return;
        }
        if ($ins['tipo'] === 'MO') {
            $tc = $ins['precio'] === null ? null : puTipoCambio($ins['moneda'] ?? 'MXN', $tiposCambio);
            $costo = $tc === null ? null : round((float) $ins['precio'] * $tc, PU_DECIMALES);
            if ($costo === null) $faltan[] = $ins['clave'];
        } else {
            $r = puCostoInsumo($id, $insumos, $componentes, $tiposCambio, $memo);
            $costo = $r['costo'];
            $faltan = array_merge($faltan, $r['faltan']);
        }
        if (!isset($hojas[$id])) {
            $hojas[$id] = ['insumo_id' => $id, 'clave' => $ins['clave'], 'tipo' => $ins['tipo'] === 'MO' ? 'MO' : ($ins['tipo'] === 'MAT' ? 'MAT' : 'EQ'),
                           'descripcion' => $ins['descripcion'], 'unidad' => $ins['unidad'] ?? '', 'cantidad' => 0.0, 'costo' => $costo];
        }
        $hojas[$id]['cantidad'] += $cant;
    };
    foreach ($matriz as $r) $agregar((int) $r['insumo_id'], puCantidadMatriz($r), []);
    foreach ($hojas as &$h) $h['cantidad'] = round($h['cantidad'], PU_DECIMALES);
    return ['insumos' => array_values($hojas), 'faltan' => array_values(array_unique($faltan))];
}

// ---------- Explosión de insumos de un presupuesto ----------
// A partir del Análisis P.U. guardado (JSON de doctos_sugerido_obra.analisis_pu): cantidad total de cada insumo =
// Σ cantidad del concepto × cantidad del insumo por unidad (mano de obra con rendimiento: 1 / rendimiento).
// Se agrupa por tipo + descripción + unidad. Importe = cantidad × costo, y en mano de obra × FSR del análisis
// (el mismo costo real con el que se calculó el precio). La herramienta menor (% de la mano de obra) va aparte.
// Regresa ['insumos' => [{tipo, descripcion, unidad, cantidad, costo, importe}], 'totales' => [MAT, MO, EQ, hm, total]]
function puExplosion(array $analisis): array
{
    // El motor del presupuesto (includes/presupuesto-calculo.php) desarma también las matrices dentro de matrices
    $e = pcExplosion($analisis, true);
    $lista = array_map(function ($g) {
        $g['cantidad'] = round($g['cantidad'], 4);
        $g['importe'] = round($g['importe'], 2);
        // Costo unitario promedio (el mismo insumo puede venir con costos distintos en varios conceptos)
        $g['costo'] = $g['cantidad'] > 0 ? round($g['importe'] / $g['cantidad'], 6) : 0.0;
        return $g;
    }, $e['insumos']);
    $tot = array_map(fn($v) => round($v, 2), $e['totales']);
    return ['insumos' => $lista, 'totales' => $tot];
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

// ---------- Importación (Catalogos › Importar insumos) ----------

// Tipo de insumo a partir de lo que trae un archivo (código o palabra); null si no se reconoce
function puTipoTexto(string $v): ?string
{
    $v = mb_strtoupper(trim($v));
    $v = strtr($v, ['Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U']);
    if (in_array($v, ['MAT', 'MO', 'EQ', 'HER', 'BAS'], true)) return $v;
    if (preg_match('/^MATERIAL/', $v)) return 'MAT';
    if (preg_match('/^MANO|^M\.?O\.?$|^PERSONAL/', $v)) return 'MO';
    if (preg_match('/^EQUIPO|^MAQUINARIA/', $v)) return 'EQ';
    if (preg_match('/^HERRAMIENTA/', $v)) return 'HER';
    if (preg_match('/^BASICO|^AUXILIAR|^CUADRILLA/', $v)) return 'BAS';
    return null;
}

// Número de un archivo ("$1,250.50" → 1250.5); null si viene vacío, NAN si no es número
function puNumeroTexto($v): ?float
{
    $v = trim(str_replace(['$', ',', ' '], '', (string) $v));
    return $v === '' ? null : (is_numeric($v) ? (float) $v : NAN);
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
