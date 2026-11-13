<?php
// ACRINEO · Ventana «Cálculo» del presupuesto (botón de cuadrícula de la hoja), como en Neodata.
// ACEPTAR guarda las opciones con el presupuesto y:
//   1. Con «Asignar fecha a insumos», los insumos de las matrices que vienen del catálogo toman el precio vigente en
//      esa fecha. Con «Calcular costos horarios con la misma tasa», el equipo con costo horario se recalcula con esa tasa
//      de interés (aunque no se asigne fecha).
//   2. Recalcula todas las matrices de abajo hacia arriba (submatrices → renglón → concepto) y los totales.
//   3. Explosión de insumos (de todo el presupuesto o de los conceptos marcados en el catálogo): cuánto de cada insumo
//      lleva el presupuesto. Los insumos con su propia matriz (integrados) se explotan en sus componentes, salvo con
//      «No explotar insumos integrados»; el equipo (EQ) con matriz solo se explota con «Explotar insumos de costos
//      horarios». Opcional: la explosión por concepto.
//   4. Con «Mostrar errores potenciales», la lista de lo que puede estar mal (costos en cero, cantidades en cero…).
// Los importes se expresan en la moneda elegida (moneda 2 = pesos / tipo de cambio del presupuesto).
require_once __DIR__ . '/hoja.php';

const ACRINEO_CALCULO_DEFECTO = [
    'tipo_explosion' => 'todo', 'errores_potenciales' => false, 'ch_misma_tasa' => false, 'ch_tasa' => 12.0,
    'asignar_fecha' => false, 'fecha_insumos' => null, 'respaldo_correo' => false, 'moneda' => 1, 'decimales_costos' => 2,
    'explosion_x_concepto' => false, 'explotar_ch' => false, 'no_explotar_integrados' => false, 'decimales_explosion' => 8,
];
const ACRINEO_CALCULO_BOOL = ['errores_potenciales', 'ch_misma_tasa', 'asignar_fecha', 'respaldo_correo', 'explosion_x_concepto', 'explotar_ch', 'no_explotar_integrados'];

function acrineoCalculoDisponible(): bool
{
    return bd_tiene_columna('AW', 'acrineo_presupuesto_calculo', 'tipo_explosion');
}

function acrineoCalculoOpciones(array $ctx): array
{
    $o = ACRINEO_CALCULO_DEFECTO;
    $o['fecha_insumos'] = date('Y-m-d');
    $cols = acrineoCalculoDisponible() ? '*' : 'decimales_costos, decimales_explosion';
    $f = bd_fila('AW', "select $cols from acrineo_presupuesto_calculo where presupuesto_id = ?", [$ctx['id']]);
    foreach ($f ?: [] as $k => $v) {
        if (!array_key_exists($k, $o) || $v === null) continue;
        if (in_array($k, ACRINEO_CALCULO_BOOL, true)) $o[$k] = in_array($v, [true, 't', 1, '1'], true);
        elseif (in_array($k, ['moneda', 'decimales_costos', 'decimales_explosion'], true)) $o[$k] = (int) $v;
        elseif ($k === 'ch_tasa') $o[$k] = (float) $v;
        else $o[$k] = (string) $v;
    }
    $o['disponible'] = acrineoCalculoDisponible();
    return $o;
}

function acrineoCalculoValidar(array $in): array
{
    $o = [];
    $err = [];
    $o['tipo_explosion'] = in_array($in['tipo_explosion'] ?? '', ['todo', 'marcados', 'no'], true) ? $in['tipo_explosion'] : 'todo';
    foreach (ACRINEO_CALCULO_BOOL as $k) $o[$k] = in_array($in[$k] ?? false, [true, 1, '1', 'true', 'on'], true);
    $o['moneda'] = (int) ($in['moneda'] ?? 1) === 2 ? 2 : 1;
    foreach (['decimales_costos' => [0, 6], 'decimales_explosion' => [0, 8]] as $k => [$min, $max]) {
        $v = $in[$k] ?? null;
        if (!is_numeric($v) || (int) $v != $v || $v < $min || $v > $max) $err[$k] = "Debe ser un número entero de $min a $max.";
        else $o[$k] = (int) $v;
    }
    $tasa = $in['ch_tasa'] ?? null;
    if (!is_numeric($tasa) || $tasa < 0 || $tasa > 100) $err['ch_tasa'] = 'La tasa debe ser de 0 a 100 %.';
    else $o['ch_tasa'] = round((float) $tasa, 4);
    $fecha = trim((string) ($in['fecha_insumos'] ?? ''));
    if ($fecha === '' && !$o['asignar_fecha']) $o['fecha_insumos'] = null;
    elseif (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha) || !checkdate((int) substr($fecha, 5, 2), (int) substr($fecha, 8, 2), (int) substr($fecha, 0, 4))) $err['fecha_insumos'] = 'Escribe una fecha válida.';
    else $o['fecha_insumos'] = $fecha;
    if ($err) throw new AcrineoError('Revisa las opciones del cálculo.', 422, $err);
    return $o;
}

// Renglones de todas las matrices del presupuesto, agrupados: [concepto_id => [padre (0 = raíz) => [filas]]]
function acrineoCalculoMatrices(array $ctx): array
{
    $padre = acrineoSubmatrizDisponible() ? 'm.padre_id' : 'null';
    $m = [];
    foreach (bd_filas('AW', "select m.matriz_id, m.concepto_id, $padre as padre_id, m.insumo_id, m.tipo, m.codigo, m.descripcion, m.unidad, m.base,
                                    m.cantidad, m.desperdicio_pct, m.costo
                               from acrineo_matriz m join acrineo_conceptos c on c.concepto_id = m.concepto_id
                              where c.presupuesto_id = ? order by m.orden, m.matriz_id", [$ctx['id']]) as $f) {
        $f['matriz_id'] = (int) $f['matriz_id'];
        $f['insumo_id'] = $f['insumo_id'] === null ? null : (int) $f['insumo_id'];
        $f['tipo'] = trim($f['tipo']);
        foreach (['cantidad', 'desperdicio_pct', 'costo'] as $k) $f[$k] = (float) $f[$k];
        $f['base'] = $f['base'] ?: null;
        $m[(int) $f['concepto_id']][(int) ($f['padre_id'] ?? 0)][] = $f;
    }
    return $m;
}

// Costo del catálogo para los insumos de las matrices (precio a la fecha; equipo con costo horario a la tasa dada)
function acrineoCalculoCostosCatalogo(array $ids, ?string $fecha, ?float $tasaCh): array
{
    if (!$ids) return [];
    require_once ACRI_RAIZ . '/includes/pu.php';
    if (!puDisponible()) return [];
    [$insumos, $componentes] = puCargarCatalogo($fecha);
    if ($tasaCh !== null && bd_tiene_tabla('AW', 'costos_horarios')) {
        foreach (bd_filas('AW', 'select insumo_id, parametros from costos_horarios') as $c) {
            $id = (int) $c['insumo_id'];
            $p = json_decode((string) $c['parametros'], true);
            if (!isset($insumos[$id]) || !is_array($p)) continue;
            try {
                $insumos[$id]['precio'] = puCostoHorario(['i' => $tasaCh] + $p)['costo'];
                $insumos[$id]['moneda'] = 'MXN';
                $insumos[$id]['costo_horario'] = true;
            } catch (Throwable $e) { /* se queda su precio */ }
        }
    }
    $tc = puTiposCambio($fecha);
    $memo = [];
    $r = [];
    foreach (array_unique($ids) as $id) {
        if (!isset($insumos[$id])) continue;
        try {
            $r[$id] = puCostoInsumo((int) $id, $insumos, $componentes, $tc, $memo) + ['costo_horario' => !empty($insumos[$id]['costo_horario'])];
        } catch (Throwable $e) {
            $r[$id] = ['costo' => null, 'faltan' => [$e->getMessage()], 'costo_horario' => false];
        }
    }
    return $r;
}

function acrineoCalculoEjecutar(array $ctx, array $in, string $usuario): array
{
    if (!acrineoCalculoDisponible()) throw new AcrineoError('Falta aplicar la migración 030 (opciones del cálculo) para calcular el presupuesto.', 503);
    $o = acrineoCalculoValidar($in);
    $marcados = array_values(array_unique(array_filter(array_map('intval', is_array($in['marcados'] ?? null) ? $in['marcados'] : []))));
    if ($o['tipo_explosion'] === 'marcados' && !$marcados) {
        throw new AcrineoError('Marca en el catálogo de conceptos (abajo) los conceptos que quieres explotar.', 422, ['tipo_explosion' => 'No hay conceptos marcados.']);
    }

    $avisos = [];
    $res = acrineoTransaccion(function () use ($ctx, $o, $usuario, &$avisos) {
        // 1. Opciones (con los decimales del presupuesto)
        $cols = array_keys(array_diff_key(ACRINEO_CALCULO_DEFECTO, ['decimales_costos' => 1, 'decimales_explosion' => 1]));
        $cols = array_merge($cols, ['decimales_costos', 'decimales_explosion']);
        $vals = array_map(fn($k) => is_bool($o[$k]) ? ($o[$k] ? 'true' : 'false') : $o[$k], $cols);
        bd_ejecutar('AW', 'insert into acrineo_presupuesto_calculo (presupuesto_id, ' . implode(', ', $cols) . ') values (?' . str_repeat(', ?', count($cols)) . ')
                           on conflict (presupuesto_id) do update set ' . implode(', ', array_map(fn($k) => "$k = excluded.$k", $cols)),
            array_merge([$ctx['id']], $vals));
        $ctx = acrineoHojaContexto($ctx['id']);
        $dec = $ctx['dec_costos'];

        // 2. Costos del catálogo
        $matrices = acrineoCalculoMatrices($ctx);
        $actualizados = 0;
        if ($o['asignar_fecha'] || $o['ch_misma_tasa']) {
            $ids = [];
            foreach ($matrices as $niveles) foreach ($niveles as $filas) foreach ($filas as $f) if ($f['insumo_id']) $ids[] = $f['insumo_id'];
            $costos = acrineoCalculoCostosCatalogo($ids, $o['asignar_fecha'] ? $o['fecha_insumos'] : null, $o['ch_misma_tasa'] ? $o['ch_tasa'] : null);
            $hijos = [];
            foreach ($matrices as $niveles) foreach ($niveles as $padre => $_) $hijos[$padre] = true;
            foreach ($matrices as $cid => &$niveles) {
                foreach ($niveles as &$filas) {
                    foreach ($filas as &$f) {
                        if (!$f['insumo_id'] || $f['base'] || isset($hijos[$f['matriz_id']])) continue;
                        $c = $costos[$f['insumo_id']] ?? null;
                        if (!$o['asignar_fecha'] && !($c['costo_horario'] ?? false)) continue;   // solo la tasa: solo el equipo con costo horario
                        if ($c === null || $c['costo'] === null) {
                            $avisos[] = ($f['codigo'] ?: $f['descripcion']) . ': ' . ($c ? 'sin precio (' . implode(', ', $c['faltan']) . ')' : 'ya no está en el catálogo de insumos');
                            continue;
                        }
                        if (abs($c['costo'] - $f['costo']) > 0.0000005) { $f['costo'] = $c['costo']; $f['cambio'] = true; $actualizados++; }
                    }
                    unset($f);
                }
                unset($filas);
            }
            unset($niveles);
        }

        // 3. Matrices de abajo hacia arriba
        $recalculados = 0;
        foreach ($matrices as $cid => &$niveles) {
            $total = function (int $padre) use (&$total, &$niveles, $dec): float {
                foreach ($niveles[$padre] as &$f) {
                    if (isset($niveles[$f['matriz_id']])) {
                        $c = $total($f['matriz_id']);
                        if (abs($c - $f['costo']) > 0.0000005) { $f['costo'] = $c; $f['cambio'] = true; }
                    }
                }
                unset($f);
                return acrineoCalcularMatriz($niveles[$padre], $dec)['total'];
            };
            if (!isset($niveles[0])) continue;
            $costo = $total(0);
            foreach ($niveles as $filas) foreach ($filas as $f) {
                if (!empty($f['cambio'])) bd_ejecutar('AW', 'update acrineo_matriz set costo = ? where matriz_id = ?', [$f['costo'], $f['matriz_id']]);
            }
            $n = bd_ejecutar('AW', "update acrineo_conceptos set costo = ?, costo_origen = 'matriz', updated_at = now()
                                     where concepto_id = ? and (costo <> ? or costo_origen <> 'matriz')", [$costo, $cid, $costo]);
            $recalculados += $n ? 1 : 0;
        }
        unset($niveles);
        acrineoActualizarTotales($ctx['id']);
        acrineoRegistrar($ctx['id'], $usuario, 'HOJA', [['Calculó el presupuesto', null,
            "$recalculados concepto(s) cambiaron de costo; $actualizados insumo(s) tomaron costo del catálogo"
            . ($o['asignar_fecha'] ? ' al ' . $o['fecha_insumos'] : '') . ($o['ch_misma_tasa'] ? "; costos horarios al {$o['ch_tasa']} %" : '')]]);
        return ['recalculados' => $recalculados, 'actualizados' => $actualizados, 'matrices' => $matrices, 'ctx' => $ctx];
    });

    $ctx = $res['ctx'];
    $monedas = acrineoHojaMonedas($ctx['id']);
    $moneda = $monedas[$o['moneda'] - 1] ?? $monedas[0];
    $tc = $o['moneda'] === 2 ? max(0.000001, (float) $moneda['tipo_cambio']) : 1.0;
    $r = ['opciones' => acrineoCalculoOpciones($ctx), 'recalculados' => $res['recalculados'], 'actualizados' => $res['actualizados'],
          'avisos' => $avisos, 'moneda' => $moneda + ['factor' => $tc]];
    if ($o['tipo_explosion'] !== 'no') $r['explosion'] = acrineoExplosion($ctx, $res['matrices'], $o, $marcados, $tc);
    if ($o['errores_potenciales']) $r['errores'] = acrineoErroresPotenciales($ctx, $res['matrices'], $avisos);
    return $r;
}

// Explosión de insumos: [items: [{codigo, descripcion, tipo, unidad, cantidad, costo, importe}], totales por tipo, total, por_concepto?]
function acrineoExplosion(array $ctx, array $matrices, array $o, array $marcados, float $tc): array
{
    $dq = $o['decimales_explosion'];
    $dc = $ctx['dec_costos'];
    $conceptos = bd_filas('AW', 'select c.concepto_id, c.codigo, c.descripcion, c.unidad, c.costo, coalesce(sum(r.cantidad), 0) as cantidad
                                   from acrineo_conceptos c join acrineo_partida_conceptos r on r.concepto_id = c.concepto_id
                                  where c.presupuesto_id = ?' . ($o['tipo_explosion'] === 'marcados' ? ' and c.concepto_id in (' . implode(',', array_fill(0, count($marcados), '?')) . ')' : '') . '
                                  group by c.concepto_id order by c.codigo', array_merge([$ctx['id']], $o['tipo_explosion'] === 'marcados' ? $marcados : []));

    $agregar = function (array &$lista, array $f, float $cantidad, ?float $importe) {
        $clave = $f['insumo_id'] ? 'i' . $f['insumo_id'] : 'l' . mb_strtoupper(trim((string) $f['codigo']) . '|' . trim($f['descripcion']) . '|' . trim((string) $f['unidad']) . '|' . $f['tipo']);
        if (!isset($lista[$clave])) $lista[$clave] = ['codigo' => $f['codigo'], 'descripcion' => $f['descripcion'], 'tipo' => $f['tipo'], 'unidad' => $f['base'] ? '%' : $f['unidad'],
                                                    'cantidad' => 0.0, 'importe' => 0.0, 'pct' => (bool) $f['base']];
        $lista[$clave]['cantidad'] += $cantidad;
        $lista[$clave]['importe'] += $importe ?? $cantidad * $f['costo'];
    };
    // Recorre la matriz de un concepto: $factor = unidades del renglón de arriba
    $explotar = function (array $niveles, int $padre, float $factor, array &$lista) use (&$explotar, $o, $agregar, $ctx) {
        $calc = acrineoCalcularMatriz($niveles[$padre] ?? [], $ctx['dec_costos'])['filas'];
        foreach ($calc as $f) {
            if ($f['base']) { $agregar($lista, $f, 0.0, $f['importe'] * $factor); continue; }   // % de MO / materiales: solo importe
            $cant = (float) $f['cantidad_efectiva'] * $factor;
            $integrado = isset($niveles[$f['matriz_id']]);
            $abrir = $integrado && !$o['no_explotar_integrados'] && ($f['tipo'] !== 'EQ' || $o['explotar_ch']);
            if ($abrir) $explotar($niveles, $f['matriz_id'], $cant, $lista);
            else $agregar($lista, $f, $cant, null);
        }
    };
    $redondear = function (array $lista) use ($dq, $dc, $tc) {
        $items = array_values(array_map(function ($i) use ($dq, $dc, $tc) {
            $i['cantidad'] = round($i['cantidad'], $dq);
            $i['importe'] = round($i['importe'] / $tc, $dc);
            $i['costo'] = $i['pct'] || !$i['cantidad'] ? null : round($i['importe'] / $i['cantidad'], $dc);
            return $i;
        }, $lista));
        usort($items, fn($a, $b) => [array_search($a['tipo'], ['MAT', 'MO', 'EQ', 'HER', 'BAS', 'OTR']) === false ? 9 : array_search($a['tipo'], ['MAT', 'MO', 'EQ', 'HER', 'BAS', 'OTR']), (string) $a['codigo'], $a['descripcion']]
                                  <=> [array_search($b['tipo'], ['MAT', 'MO', 'EQ', 'HER', 'BAS', 'OTR']) === false ? 9 : array_search($b['tipo'], ['MAT', 'MO', 'EQ', 'HER', 'BAS', 'OTR']), (string) $b['codigo'], $b['descripcion']]);
        return $items;
    };

    $todos = [];
    $porConcepto = [];
    $sinMatriz = [];
    foreach ($conceptos as $c) {
        $cid = (int) $c['concepto_id'];
        $cant = (float) $c['cantidad'];
        if (!isset($matrices[$cid][0])) { $sinMatriz[] = $c['codigo']; continue; }
        $explotar($matrices[$cid], 0, $cant, $todos);
        if ($o['explosion_x_concepto']) {
            $propia = [];
            $explotar($matrices[$cid], 0, $cant, $propia);
            $items = $redondear($propia);
            $porConcepto[] = ['codigo' => $c['codigo'], 'descripcion' => $c['descripcion'], 'unidad' => $c['unidad'], 'cantidad' => round($cant, $dq),
                              'items' => $items, 'total' => round(array_sum(array_column($items, 'importe')), $dc)];
        }
    }
    $items = $redondear($todos);
    $totales = [];
    foreach ($items as $i) $totales[$i['tipo']] = round(($totales[$i['tipo']] ?? 0) + $i['importe'], $dc);
    $r = ['items' => $items, 'totales' => $totales, 'total' => round(array_sum($totales), $dc), 'conceptos' => count($conceptos), 'sin_matriz' => $sinMatriz,
          'tipos' => acrineoTiposInsumo()];
    if ($o['explosion_x_concepto']) $r['por_concepto'] = $porConcepto;
    return $r;
}

// Lo que puede estar mal en el presupuesto
function acrineoErroresPotenciales(array $ctx, array $matrices, array $avisos): array
{
    $e = [];
    $partidas = array_column(bd_filas('AW', 'select partida_id, codigo from acrineo_partidas where presupuesto_id = ?', [$ctx['id']]), 'codigo', 'partida_id');
    foreach (acrineoRenglonesDe($ctx, 'p.presupuesto_id = ?', [$ctx['id']]) as $r) {
        $donde = 'Partida ' . ($partidas[$r['partida_id']] ?? '') . " · {$r['codigo']}";
        if ($r['cantidad'] <= 0) $e[] = ['tipo' => 'cantidad', 'texto' => "$donde: cantidad en cero."];
        if ($r['precio'] <= 0) $e[] = ['tipo' => 'costo', 'texto' => "$donde: el concepto no tiene costo ni precio."];
    }
    $conceptos = [];
    foreach (bd_filas('AW', 'select concepto_id, codigo from acrineo_conceptos where presupuesto_id = ?', [$ctx['id']]) as $c) $conceptos[(int) $c['concepto_id']] = $c['codigo'];
    foreach ($matrices as $cid => $niveles) {
        foreach ($niveles as $filas) foreach ($filas as $f) {
            $quien = ($conceptos[$cid] ?? $cid) . ' → ' . ($f['codigo'] ?: $f['descripcion']);
            if ($f['base']) continue;
            if ($f['cantidad'] <= 0) $e[] = ['tipo' => 'matriz', 'texto' => "Matriz de $quien: cantidad en cero."];
            if ($f['costo'] <= 0 && !isset($niveles[$f['matriz_id']])) $e[] = ['tipo' => 'matriz', 'texto' => "Matriz de $quien: costo en cero."];
        }
    }
    foreach ($avisos as $a) $e[] = ['tipo' => 'catalogo', 'texto' => "Catálogo de insumos · $a"];
    return $e;
}
