<?php
// ACRINEO · Opciones del presupuesto que trabajan sobre todo el presupuesto (pestaña «Opciones del Presupuesto»):
//   Catálogos   Catálogo general (F9), Materiales, Mano de obra y Maquinaria: los insumos que participan en las matrices
//               del presupuesto. Cambiar el costo de uno lo cambia en TODAS las matrices donde está y recalcula.
//               Materiales: costo = costo LAB + fletes + maniobra + almacenaje + derechos + mermas.
//               Mano de obra: costo = salario base × FASAR + viáticos + alimentación y hospedaje + sepelio + otras.
//   Procesos    Actualizar costos y matrices (Ctrl+Shift+U) desde el catálogo de insumos y los Conceptos P.U. del
//               sistema (el «maestro»), Depurar presupuesto y Renumerar control.
//   Factores    FASAR (Ctrl+Shift+F): Fsr = Ps × (Tp / Tl) + Tp / Tl (includes/pu.php · puFsr) para la mano de obra.
// Los datos de cada insumo en el presupuesto van en acrineo_presupuesto_insumos y el FASAR en acrineo_presupuesto_fasar
// (migración 037).
require_once __DIR__ . '/hoja.php';
require_once __DIR__ . '/calculo.php';

// Campos de cada catálogo (los de dinero se multiplican con «Factor»)
const ACRINEO_INSUMO_DATOS = [
    'MAT' => ['costo_lab' => 'Costo LAB', 'fletes' => 'Fletes', 'maniobra' => 'Maniobra', 'almacenaje' => 'Almacenaje', 'derechos' => 'Derechos', 'mermas' => 'Mermas'],
    'MO'  => ['salario_base' => 'Salario base', 'fasar' => 'FASAR', 'viaticos' => 'Viáticos', 'alimentacion' => 'Alimentación y hospedaje', 'sepelio' => 'Gastos de sepelio', 'otras' => 'Otras prestaciones'],
    'EQ'  => ['vida_llantas' => 'Vida económica llantas', 'vida_piezas' => 'Vida económica piezas', 'potencia' => 'Potencia'],
];
const ACRINEO_INSUMO_NO_DINERO = ['fasar', 'vida_llantas', 'vida_piezas', 'potencia'];

function acrineoOpcionesDisponible(): bool
{
    static $si = null;
    return $si ??= bd_tiene_tabla('AW', 'acrineo_presupuesto_insumos') && bd_tiene_tabla('AW', 'acrineo_presupuesto_fasar');
}

function acrineoOpcionesExigir(): void
{
    if (!acrineoOpcionesDisponible()) throw new AcrineoError('Falta aplicar la migración 037 (php herramientas/migrar.php --aplicar).', 503);
}

// Datos guardados de los insumos del presupuesto: [clave => ['datos' => [], 'fecha' => ?]]
function acrineoInsumosDatos(int $id): array
{
    if (!acrineoOpcionesDisponible()) return [];
    $r = [];
    foreach (bd_filas('AW', 'select clave, datos, fecha from acrineo_presupuesto_insumos where presupuesto_id = ?', [$id]) as $f) {
        $r[$f['clave']] = ['datos' => json_decode((string) $f['datos'], true) ?: [], 'fecha' => $f['fecha']];
    }
    return $r;
}

function acrineoInsumoDatosEscribir(int $id, string $clave, ?string $tipo, ?array $datos, ?string $fecha = null): void
{
    $cols = ['presupuesto_id', 'clave', 'tipo'];
    $vals = [$id, $clave, $tipo];
    $set = ['tipo = excluded.tipo', 'updated_at = now()'];
    if ($datos !== null) { $cols[] = 'datos'; $vals[] = json_encode((object) $datos, JSON_UNESCAPED_UNICODE); $set[] = 'datos = excluded.datos'; }
    if ($fecha !== null) { $cols[] = 'fecha'; $vals[] = $fecha; $set[] = 'fecha = excluded.fecha'; }
    $marcas = array_map(fn($c) => $c === 'datos' ? 'cast(? as jsonb)' : ($c === 'fecha' ? 'cast(? as date)' : '?'), $cols);
    bd_ejecutar('AW', 'insert into acrineo_presupuesto_insumos (' . implode(', ', $cols) . ') values (' . implode(', ', $marcas) . ')
                       on conflict (presupuesto_id, clave) do update set ' . implode(', ', $set), $vals);
}

// FASAR del presupuesto (null si no se ha calculado)
function acrineoFasarPresupuesto(int $id): ?float
{
    if (!acrineoOpcionesDisponible()) return null;
    $v = bd_valor('AW', 'select fsr from acrineo_presupuesto_fasar where presupuesto_id = ?', [$id]);
    return $v === null || $v === false ? null : (float) $v;
}

// Costo que resulta de los datos del insumo (null = los datos no definen el costo)
function acrineoCostoDeDatos(string $tipo, array $d, ?float $fasarPpto): ?float
{
    $n = fn(string $k) => (float) ($d[$k] ?? 0);
    if ($tipo === 'MAT') {
        foreach (array_keys(ACRINEO_INSUMO_DATOS['MAT']) as $k) if (($d[$k] ?? null) !== null && $d[$k] !== '') return round(array_sum(array_map($n, array_keys(ACRINEO_INSUMO_DATOS['MAT']))), 6);
        return null;
    }
    if ($tipo === 'MO') {
        if ($n('salario_base') <= 0) return null;
        $fasar = $n('fasar') > 0 ? $n('fasar') : ($fasarPpto ?: 1.0);
        return round($n('salario_base') * $fasar + $n('viaticos') + $n('alimentacion') + $n('sepelio') + $n('otras'), 6);
    }
    return null;
}

// ---------- Catálogos del presupuesto ----------

// Insumos que participan en las matrices del presupuesto (y, en el general, los conceptos), con sus datos.
//   $tipo: 'general' | 'MAT' | 'MO' | 'EQ'
function acrineoCatalogoPresupuesto(array $ctx, string $tipo, string $q = ''): array
{
    $tipo = in_array($tipo, ['MAT', 'MO', 'EQ'], true) ? $tipo : 'general';
    $exp = acrineoExplosionAcoplada($ctx, $q, 'contiene', $tipo === 'general' ? 'todos' : 'insumos');
    $datos = acrineoInsumosDatos($ctx['id']);
    $fasar = acrineoFasarPresupuesto($ctx['id']);
    $insumos = [];
    foreach ($exp['insumos'] as $i) {
        if ($tipo !== 'general' && $i['tipo'] !== $tipo) continue;
        $d = $datos[$i['clave']] ?? ['datos' => [], 'fecha' => null];
        $i['datos'] = (object) $d['datos'];
        $i['fecha'] = $d['fecha'];
        $i['editable'] = !$i['pct'] && !$i['n'];
        $i['participa'] = $i['cantidad'] > 0 || $i['importe'] > 0;
        if ($i['tipo'] === 'MO') {
            $sb = (float) ($d['datos']['salario_base'] ?? 0);
            $f = (float) ($d['datos']['fasar'] ?? 0) ?: ($fasar ?: null);
            $i['salario_real'] = $sb > 0 && $f ? round($sb * $f, 6) : null;
            $i['fasar_efectivo'] = $f;
        }
        $insumos[] = $i;
    }
    $conceptos = [];
    if ($tipo === 'general') {
        foreach ($exp['conceptos'] as $c) {
            $conceptos[] = ['clase' => 'concepto', 'id' => $c['id'], 'codigo' => $c['codigo'], 'descripcion' => $c['descripcion'], 'unidad' => $c['unidad'],
                            'tipo' => 'CON', 'costo' => $c['costo'], 'precio' => $c['precio'], 'cantidad' => $c['cantidad_total'], 'usos' => $c['usos'],
                            'importe' => round($c['costo'] * $c['cantidad_total'], $ctx['dec_costos']), 'participa' => $c['usos'] > 0, 'matriz' => $c['matriz'],
                            'pendiente' => $c['pendiente_analizar'], 'n' => $c['matriz'] ? 1 : 0];
        }
    }
    return ['tipo' => $tipo, 'insumos' => $insumos, 'conceptos' => $conceptos, 'tipos' => acrineoTiposInsumo(), 'fasar' => $fasar,
            'campos' => ACRINEO_INSUMO_DATOS[$tipo] ?? [], 'disponible' => acrineoOpcionesDisponible()];
}

// Pone el costo nuevo a los insumos [clave => costo] en TODAS las matrices del presupuesto donde están (menos los
// renglones con submatriz o que son %), recalcula las matrices y los totales. Regresa [renglones, recalculados].
function acrineoAplicarCostosInsumos(array $ctx, array $nuevos): array
{
    if (!$nuevos) return [0, 0];
    $matrices = acrineoCalculoMatrices($ctx);
    $hijos = [];
    foreach ($matrices as $niveles) foreach ($niveles as $padre => $_) $hijos[$padre] = true;
    $renglones = 0;
    foreach ($matrices as &$niveles) {
        foreach ($niveles as &$filas) {
            foreach ($filas as &$f) {
                if ($f['base'] || isset($hijos[$f['matriz_id']])) continue;
                $k = acrineoClaveInsumo($f);
                if (!array_key_exists($k, $nuevos)) continue;
                $c = round((float) $nuevos[$k], 6);
                if (abs($c - $f['costo']) <= 0.0000005) continue;
                $f['costo'] = $c;
                $f['cambio'] = true;
                $renglones++;
            }
            unset($f);
        }
        unset($filas);
    }
    unset($niveles);
    $recalculados = acrineoRecalcularMatrices($ctx, $matrices);
    acrineoActualizarTotales($ctx['id']);
    return [$renglones, $recalculados];
}

// Lista de insumos del presupuesto por clave: [clave => insumo] (con tipo, costo, n, pct)
function acrineoInsumosPorClave(array $ctx): array
{
    $r = [];
    foreach (acrineoExplosionAcoplada($ctx, '', 'contiene', 'insumos')['insumos'] as $i) $r[$i['clave']] = $i;
    return $r;
}

// Número ≥ 0 de un campo (vacío = null)
function acrineoNumeroCampo($v, string $etiqueta, float $max = 999999999): ?float
{
    if ($v === null) return null;
    $v = trim(str_replace([',', '$'], '', (string) $v));
    if ($v === '') return null;
    if (!is_numeric($v) || (float) $v < 0 || (float) $v > $max) throw new AcrineoError("«{$etiqueta}» debe ser un número de 0 en adelante.", 422);
    return round((float) $v, 6);
}

// Guarda el costo o los datos de un insumo del presupuesto: {clave, costo?, datos?}
function acrineoInsumoGuardar(array $ctx, array $in, string $usuario): array
{
    acrineoOpcionesExigir();
    $clave = trim((string) ($in['clave'] ?? ''));
    $lista = acrineoInsumosPorClave($ctx);
    $i = $lista[$clave] ?? null;
    if (!$i) throw new AcrineoError('El insumo ya no está en las matrices del presupuesto.', 404);
    if ($i['pct'] || $i['n']) throw new AcrineoError('El costo de este insumo sale de su propia matriz (o es un %): cámbialo ahí.', 422);
    $tipo = $i['tipo'];
    $guardados = acrineoInsumosDatos($ctx['id'])[$clave]['datos'] ?? [];
    $datos = $guardados;
    if (is_array($in['datos'] ?? null)) {
        foreach (ACRINEO_INSUMO_DATOS[$tipo] ?? [] as $k => $etiqueta) {
            if (!array_key_exists($k, $in['datos'])) continue;
            if ($k === 'potencia') { $datos[$k] = mb_substr(trim((string) $in['datos'][$k]), 0, 40) ?: null; continue; }
            $datos[$k] = acrineoNumeroCampo($in['datos'][$k], $etiqueta, $k === 'fasar' ? 9.9999 : 999999999);
            if ($k === 'fasar' && $datos[$k] !== null && $datos[$k] <= 0) $datos[$k] = null;
        }
        $datos = array_filter($datos, fn($v) => $v !== null);
        // Primer desglose de un material: lo que costaba se vuelve su costo LAB (los cargos se suman encima)
        if ($tipo === 'MAT' && $datos && !array_key_exists('costo_lab', $datos) && acrineoCostoDeDatos('MAT', $guardados, null) === null) {
            $datos['costo_lab'] = round((float) $i['costo'], 6);
        }
    }
    $costo = acrineoCostoDeDatos($tipo, $datos, acrineoFasarPresupuesto($ctx['id']));
    if (array_key_exists('costo', $in) && $in['costo'] !== null && $in['costo'] !== '') {
        $directo = acrineoNumeroCampo($in['costo'], 'Costo');
        // El costo capturado directo manda: en materiales se vuelve el costo LAB (sin los demás cargos) y en mano de obra
        // se ajusta el salario base para que dé ese costo.
        if ($tipo === 'MAT' && $costo !== null) {
            $otros = array_sum(array_map(fn($k) => (float) ($datos[$k] ?? 0), ['fletes', 'maniobra', 'almacenaje', 'derechos', 'mermas']));
            $datos['costo_lab'] = round(max(0, $directo - $otros), 6);
            $costo = acrineoCostoDeDatos($tipo, $datos, null);
        } elseif ($tipo === 'MO' && $costo !== null) {
            $fasar = (float) ($datos['fasar'] ?? 0) ?: (acrineoFasarPresupuesto($ctx['id']) ?: 1.0);
            $extras = array_sum(array_map(fn($k) => (float) ($datos[$k] ?? 0), ['viaticos', 'alimentacion', 'sepelio', 'otras']));
            $datos['salario_base'] = round(max(0, $directo - $extras) / $fasar, 6);
            $costo = acrineoCostoDeDatos($tipo, $datos, acrineoFasarPresupuesto($ctx['id']));
        } else {
            $costo = $directo;
        }
    }
    return acrineoTransaccion(function () use ($ctx, $clave, $tipo, $datos, $guardados, $costo, $i, $usuario) {
        if ($datos !== $guardados) acrineoInsumoDatosEscribir($ctx['id'], $clave, $tipo, $datos);
        [$renglones, $recalculados] = $costo === null ? [0, 0] : acrineoAplicarCostosInsumos($ctx, [$clave => $costo]);
        if ($costo !== null && abs($costo - (float) $i['costo']) > 0.0000005) {
            acrineoRegistrar($ctx['id'], $usuario, 'HOJA', [['Costo del insumo ' . ($i['codigo'] ?: $i['descripcion']) . " ($renglones renglones de matriz)",
                acrineoTextoValor((float) $i['costo']), acrineoTextoValor($costo)]]);
        }
        return ['renglones' => $renglones, 'recalculados' => $recalculados];
    });
}

// «Factor»: multiplica o divide el costo de los insumos indicados (sus datos de dinero también)
function acrineoInsumosFactor(array $ctx, array $claves, $factor, string $operacion, string $usuario): array
{
    acrineoOpcionesExigir();
    $f = acrineoNumeroCampo($factor, 'Factor', 1000000);
    if (!$f) throw new AcrineoError('Escribe un factor mayor que cero.', 422, ['factor' => 'Mayor que cero.']);
    $mult = $operacion === 'dividir' ? 1 / $f : $f;
    $lista = acrineoInsumosPorClave($ctx);
    $datos = acrineoInsumosDatos($ctx['id']);
    $fasar = acrineoFasarPresupuesto($ctx['id']);
    $nuevos = [];
    $escribir = [];
    foreach (array_unique(array_map('strval', $claves)) as $k) {
        $i = $lista[$k] ?? null;
        if (!$i || $i['pct'] || $i['n']) continue;
        $d = $datos[$k]['datos'] ?? [];
        foreach ($d as $campo => $v) if (is_numeric($v) && !in_array($campo, ACRINEO_INSUMO_NO_DINERO, true)) $d[$campo] = round((float) $v * $mult, 6);
        if ($d) $escribir[$k] = [$i['tipo'], $d];
        $nuevos[$k] = acrineoCostoDeDatos($i['tipo'], $d, $fasar) ?? round((float) $i['costo'] * $mult, 6);
    }
    if (!$nuevos) throw new AcrineoError('No hay insumos con costo propio para aplicar el factor.', 422);
    return acrineoTransaccion(function () use ($ctx, $nuevos, $escribir, $f, $operacion, $usuario) {
        foreach ($escribir as $k => [$tipo, $d]) acrineoInsumoDatosEscribir($ctx['id'], $k, $tipo, $d);
        [$renglones, $recalculados] = acrineoAplicarCostosInsumos($ctx, $nuevos);
        acrineoRegistrar($ctx['id'], $usuario, 'HOJA', [['Factor a ' . count($nuevos) . ' insumo(s)', null, ($operacion === 'dividir' ? '÷ ' : '× ') . $f]]);
        return ['insumos' => count($nuevos), 'renglones' => $renglones, 'recalculados' => $recalculados];
    });
}

// ---------- Depurar presupuesto ----------

// Lo que se quitaría: conceptos que ninguna partida usa (con su matriz) y renglones de matriz con cantidad cero
function acrineoDepurarVista(array $ctx): array
{
    $conceptos = bd_filas('AW', 'select c.concepto_id, c.codigo, c.descripcion from acrineo_conceptos c
                                  where c.presupuesto_id = ? and not exists (select 1 from acrineo_partida_conceptos r where r.concepto_id = c.concepto_id)
                                  order by c.codigo', [$ctx['id']]);
    $hijos = acrineoSubmatrizDisponible() ? 'and not exists (select 1 from acrineo_matriz h where h.padre_id = m.matriz_id)' : '';
    $renglones = bd_filas('AW', "select m.matriz_id, m.codigo, m.descripcion, c.codigo as concepto from acrineo_matriz m
                                   join acrineo_conceptos c on c.concepto_id = m.concepto_id
                                  where c.presupuesto_id = ? and m.cantidad = 0 $hijos
                                    and exists (select 1 from acrineo_partida_conceptos r where r.concepto_id = c.concepto_id)
                                  order by c.codigo, m.orden", [$ctx['id']]);
    return ['conceptos' => array_map(fn($c) => ['id' => (int) $c['concepto_id'], 'codigo' => $c['codigo'], 'descripcion' => $c['descripcion']], $conceptos),
            'renglones' => array_map(fn($r) => ['id' => (int) $r['matriz_id'], 'concepto' => $r['concepto'], 'codigo' => $r['codigo'], 'descripcion' => $r['descripcion']], $renglones)];
}

function acrineoDepurar(array $ctx, string $usuario): array
{
    $v = acrineoDepurarVista($ctx);
    return acrineoTransaccion(function () use ($ctx, $v, $usuario) {
        foreach (array_chunk(array_column($v['renglones'], 'id'), 500) as $ids) {
            bd_ejecutar('AW', 'delete from acrineo_matriz where matriz_id in (' . implode(',', array_map('intval', $ids)) . ')');
        }
        foreach (array_chunk(array_column($v['conceptos'], 'id'), 500) as $ids) {
            bd_ejecutar('AW', 'delete from acrineo_conceptos where presupuesto_id = ? and concepto_id in (' . implode(',', array_map('intval', $ids)) . ')
                               and not exists (select 1 from acrineo_partida_conceptos r where r.concepto_id = acrineo_conceptos.concepto_id)', [$ctx['id']]);
        }
        $datos = 0;
        if (acrineoOpcionesDisponible()) {
            $vigentes = array_keys(acrineoInsumosPorClave($ctx));
            foreach (array_keys(acrineoInsumosDatos($ctx['id'])) as $k) {
                if (in_array($k, $vigentes, true)) continue;
                $datos += bd_ejecutar('AW', 'delete from acrineo_presupuesto_insumos where presupuesto_id = ? and clave = ?', [$ctx['id'], $k]);
            }
        }
        $matrices = acrineoCalculoMatrices($ctx);
        acrineoRecalcularMatrices($ctx, $matrices);
        acrineoActualizarTotales($ctx['id']);
        acrineoRegistrar($ctx['id'], $usuario, 'HOJA', [['Depuró el presupuesto', null,
            count($v['conceptos']) . ' concepto(s) sin uso y ' . count($v['renglones']) . ' insumo(s) de matriz con cantidad cero']]);
        return ['conceptos' => count($v['conceptos']), 'renglones' => count($v['renglones']), 'datos' => $datos];
    });
}

// ---------- Renumerar control ----------
// Vuelve a numerar seguido (0, 1, 2…) el orden de las partidas de cada nivel, de los conceptos de cada partida y de los
// insumos de cada matriz y submatriz, sin cambiar cómo se ven acomodados.
function acrineoRenumerar(array $ctx, string $usuario): array
{
    return acrineoTransaccion(function () use ($ctx, $usuario) {
        $p = bd_ejecutar('AW', 'update acrineo_partidas t set orden = x.n
                                  from (select partida_id, row_number() over (partition by padre_id order by orden, partida_id) - 1 as n
                                          from acrineo_partidas where presupuesto_id = ?) x
                                 where t.partida_id = x.partida_id and t.orden <> x.n', [$ctx['id']]);
        $r = bd_ejecutar('AW', 'update acrineo_partida_conceptos t set orden = x.n
                                  from (select r.renglon_id, row_number() over (partition by r.partida_id order by r.orden, r.renglon_id) - 1 as n
                                          from acrineo_partida_conceptos r join acrineo_partidas p on p.partida_id = r.partida_id where p.presupuesto_id = ?) x
                                 where t.renglon_id = x.renglon_id and t.orden <> x.n', [$ctx['id']]);
        $padre = acrineoSubmatrizDisponible() ? 'm.concepto_id, m.padre_id' : 'm.concepto_id';
        $m = bd_ejecutar('AW', "update acrineo_matriz t set orden = x.n
                                  from (select m.matriz_id, row_number() over (partition by $padre order by m.orden, m.matriz_id) - 1 as n
                                          from acrineo_matriz m join acrineo_conceptos c on c.concepto_id = m.concepto_id where c.presupuesto_id = ?) x
                                 where t.matriz_id = x.matriz_id and t.orden <> x.n", [$ctx['id']]);
        acrineoRegistrar($ctx['id'], $usuario, 'HOJA', [['Renumeró el control', null, "$p partida(s), $r concepto(s) de partida y $m insumo(s) de matriz"]]);
        return ['partidas' => $p, 'renglones' => $r, 'matriz' => $m];
    });
}

// ---------- Actualizar costos y matrices (Ctrl+Shift+U) ----------
// El «maestro» es el sistema: el catálogo de insumos (Catalogos › Insumos) y los Conceptos P.U. (con su matriz).

function acrineoMaestroDisponible(): bool
{
    require_once ACRI_RAIZ . '/includes/pu.php';
    return puDisponible() && bd_tiene_tabla('AW', 'conceptos_pu') && bd_tiene_tabla('AW', 'concepto_pu_insumos');
}

// Conceptos del presupuesto con matriz en el maestro: [concepto_id => concepto_pu_id], con $cual 'todas' | 'sin_analisis' | 'pendientes'
function acrineoConceptosEnMaestro(array $ctx, string $cual): array
{
    if (!acrineoMaestroDisponible()) return [];
    $extra = '';
    if ($cual === 'sin_analisis') $extra = ' and not exists (select 1 from acrineo_matriz m where m.concepto_id = c.concepto_id)';
    elseif ($cual === 'pendientes') $extra = acrineoPendienteDisponible() ? ' and c.pendiente_analizar' : ' and false';
    $r = [];
    foreach (bd_filas('AW', "select c.concepto_id, k.concepto_pu_id from acrineo_conceptos c
                               join conceptos_pu k on upper(trim(k.codigo)) = upper(trim(c.codigo)) and k.estatus = 'A'
                              where c.presupuesto_id = ? and exists (select 1 from concepto_pu_insumos x where x.concepto_pu_id = k.concepto_pu_id)$extra",
        [$ctx['id']]) as $f) $r[(int) $f['concepto_id']] = (int) $f['concepto_pu_id'];
    return $r;
}

function acrineoActualizarVista(array $ctx): array
{
    $maestro = acrineoMaestroDisponible();
    $catalogo = (int) bd_valor('AW', 'select count(distinct m.insumo_id) from acrineo_matriz m join acrineo_conceptos c on c.concepto_id = m.concepto_id
                                       where c.presupuesto_id = ? and m.insumo_id is not null', [$ctx['id']]);
    return ['maestro' => $maestro, 'disponible' => acrineoOpcionesDisponible(),
            'en_maestro' => count(acrineoConceptosEnMaestro($ctx, 'todas')),
            'sin_analisis' => count(acrineoConceptosEnMaestro($ctx, 'sin_analisis')),
            'pendientes' => count(acrineoConceptosEnMaestro($ctx, 'pendientes')),
            'insumos_catalogo' => $catalogo];
}

// {importar: no|todas|sin_analisis|pendientes, costos: no|todos|recientes|cero}
function acrineoActualizarEjecutar(array $ctx, array $in, string $usuario): array
{
    $importar = in_array($in['importar'] ?? '', ['todas', 'sin_analisis', 'pendientes'], true) ? $in['importar'] : 'no';
    $modo = in_array($in['costos'] ?? '', ['todos', 'recientes', 'cero'], true) ? $in['costos'] : 'no';
    if ($importar === 'no' && $modo === 'no') throw new AcrineoError('Elige qué quieres actualizar: las matrices, los costos o los dos.', 422);
    if (!acrineoMaestroDisponible()) throw new AcrineoError('El catálogo de insumos y los Conceptos P.U. del sistema no están instalados (migraciones 004 y 006).', 503);
    if ($modo === 'recientes') acrineoOpcionesExigir();
    require_once ACRI_RAIZ . '/includes/pu.php';
    [$insumos, $componentes] = puCargarCatalogo();
    $tc = puTiposCambio();
    $memo = [];
    $costoDe = function (int $id) use ($insumos, $componentes, $tc, &$memo): ?float {
        if (!isset($insumos[$id])) return null;
        try { return puCostoInsumo($id, $insumos, $componentes, $tc, $memo)['costo']; } catch (Throwable $e) { return null; }
    };
    $avisos = [];

    return acrineoTransaccion(function () use ($ctx, $importar, $modo, $insumos, $costoDe, &$avisos, $usuario) {
        // 1. Matrices desde los Conceptos P.U.
        $importadas = 0;
        if ($importar !== 'no') {
            foreach (acrineoConceptosEnMaestro($ctx, $importar) as $cid => $kid) {
                $filas = bd_filas('AW', 'select x.insumo_id, x.cantidad, x.rendimiento, x.desperdicio_pct, i.clave, i.descripcion, i.tipo, u.clave as unidad
                                           from concepto_pu_insumos x join insumos i on i.insumo_id = x.insumo_id join unidades u on u.unidad_id = i.unidad_id
                                          where x.concepto_pu_id = ? order by x.orden, x.concepto_pu_insumo_id', [$kid]);
                bd_ejecutar('AW', 'delete from acrineo_matriz where concepto_id = ?', [$cid]);
                foreach ($filas as $n => $f) {
                    $tipo = trim($f['tipo']);
                    if (!isset(acrineoTiposInsumo()[$tipo])) $tipo = 'OTR';
                    $cant = (float) $f['rendimiento'] > 0 ? 1 / (float) $f['rendimiento'] : (float) $f['cantidad'];
                    $costo = $costoDe((int) $f['insumo_id']);
                    if ($costo === null) $avisos[] = $f['clave'] . ': sin precio en el catálogo (queda en cero)';
                    bd_insertar('AW', 'acrineo_matriz', 'matriz_id', ['concepto_id' => $cid, 'insumo_id' => (int) $f['insumo_id'], 'tipo' => $tipo,
                        'codigo' => mb_substr((string) $f['clave'], 0, 30), 'descripcion' => mb_substr((string) $f['descripcion'], 0, 250), 'unidad' => mb_substr((string) $f['unidad'], 0, 20),
                        'base' => null, 'cantidad' => round($cant, 6), 'desperdicio_pct' => (float) $f['desperdicio_pct'], 'costo' => round($costo ?? 0, 6), 'orden' => $n]);
                }
                if (acrineoPendienteDisponible()) acrineoMarcarPendiente($cid, false);
                $importadas++;
            }
        }

        // 2. Costos de los insumos del catálogo
        $matrices = acrineoCalculoMatrices($ctx);
        $hijos = [];
        foreach ($matrices as $niveles) foreach ($niveles as $padre => $_) $hijos[$padre] = true;
        $datos = acrineoOpcionesDisponible() ? acrineoInsumosDatos($ctx['id']) : [];
        $fasar = acrineoFasarPresupuesto($ctx['id']);
        $actualizados = 0;
        $fechas = [];
        if ($modo !== 'no') {
            foreach ($matrices as &$niveles) {
                foreach ($niveles as &$filas) {
                    foreach ($filas as &$f) {
                        if (!$f['insumo_id'] || $f['base'] || isset($hijos[$f['matriz_id']])) continue;
                        if ($modo === 'cero' && $f['costo'] > 0) continue;
                        $k = acrineoClaveInsumo($f);
                        $cat = $insumos[$f['insumo_id']] ?? null;
                        if (!$cat) { $avisos[] = ($f['codigo'] ?: $f['descripcion']) . ': ya no está en el catálogo de insumos'; continue; }
                        $vigente = $cat['vigente_desde'] ?? null;
                        if ($modo === 'recientes' && $vigente && !empty($datos[$k]['fecha']) && $vigente <= $datos[$k]['fecha']) continue;
                        $c = $costoDe((int) $f['insumo_id']);
                        if ($c === null) { $avisos[] = ($f['codigo'] ?: $f['descripcion']) . ': sin precio en el catálogo'; continue; }
                        // Mano de obra con salario base en el presupuesto: toma el salario del catálogo y conserva su FASAR
                        if ($f['tipo'] === 'MO' && !empty($datos[$k]['datos']['salario_base'])) {
                            $fsrSistema = max(0.0001, (float) ($cat['fsr'] ?? 1));
                            $datos[$k]['datos']['salario_base'] = round($c / $fsrSistema, 6);
                            $datos[$k]['cambio'] = true;
                            $c = acrineoCostoDeDatos('MO', $datos[$k]['datos'], $fasar) ?? $c;
                        } elseif ($f['tipo'] === 'MAT' && acrineoCostoDeDatos('MAT', $datos[$k]['datos'] ?? [], null) !== null) {
                            $d = $datos[$k]['datos'];
                            $otros = array_sum(array_map(fn($x) => (float) ($d[$x] ?? 0), ['fletes', 'maniobra', 'almacenaje', 'derechos', 'mermas']));
                            $datos[$k]['datos']['costo_lab'] = round($c, 6);
                            $datos[$k]['cambio'] = true;
                            $c = round($c + $otros, 6);
                        }
                        if ($vigente) $fechas[$k] = [$f['tipo'], $vigente];
                        if (abs($c - $f['costo']) > 0.0000005) { $f['costo'] = $c; $f['cambio'] = true; $actualizados++; }
                    }
                    unset($f);
                }
                unset($filas);
            }
            unset($niveles);
        }
        $recalculados = acrineoRecalcularMatrices($ctx, $matrices);
        if (acrineoOpcionesDisponible()) {
            foreach ($datos as $k => $d) if (!empty($d['cambio'])) acrineoInsumoDatosEscribir($ctx['id'], $k, $fechas[$k][0] ?? null, $d['datos'], $fechas[$k][1] ?? null);
            foreach ($fechas as $k => [$tipo, $fecha]) if (empty($datos[$k]['cambio'])) acrineoInsumoDatosEscribir($ctx['id'], $k, $tipo, null, $fecha);
        }
        acrineoActualizarTotales($ctx['id']);
        $textos = ['todas' => 'todas las matrices', 'sin_analisis' => 'matrices sin análisis', 'pendientes' => 'matrices pendientes',
                   'todos' => 'todos los insumos', 'recientes' => 'los de fecha más reciente', 'cero' => 'los insumos con costo cero'];
        acrineoRegistrar($ctx['id'], $usuario, 'HOJA', [['Actualizó costos y matrices', null,
            ($importar !== 'no' ? "Importó $importadas matriz(ces) del maestro ({$textos[$importar]}). " : '')
            . ($modo !== 'no' ? "Actualizó $actualizados costo(s) de insumos ({$textos[$modo]}). " : '') . "$recalculados concepto(s) cambiaron de costo."]]);
        return ['importadas' => $importadas, 'actualizados' => $actualizados, 'recalculados' => $recalculados, 'avisos' => array_values(array_unique($avisos))];
    });
}

// ---------- FASAR del presupuesto (Ctrl+Shift+F) ----------

const ACRINEO_FASAR_DEFECTO = [
    'dias_calendario' => 365,
    'dias_pagados' => [['concepto' => 'Aguinaldo', 'dias' => 15], ['concepto' => 'Prima vacacional (25 % de 12 días)', 'dias' => 3]],
    'dias_no_laborados' => [['concepto' => 'Domingos', 'dias' => 52], ['concepto' => 'Vacaciones', 'dias' => 12], ['concepto' => 'Días festivos', 'dias' => 7],
                            ['concepto' => 'Mal tiempo', 'dias' => 3], ['concepto' => 'Costumbre (días no laborados por tradición)', 'dias' => 2],
                            ['concepto' => 'Permisos y enfermedad', 'dias' => 2]],
    'obligaciones' => [['concepto' => 'IMSS · Enfermedades y maternidad', 'pct' => 8.0], ['concepto' => 'IMSS · Riesgo de trabajo', 'pct' => 7.58875],
                       ['concepto' => 'IMSS · Invalidez y vida', 'pct' => 1.75], ['concepto' => 'IMSS · Guarderías y prestaciones sociales', 'pct' => 1.0],
                       ['concepto' => 'Retiro (SAR)', 'pct' => 2.0], ['concepto' => 'Cesantía en edad avanzada y vejez', 'pct' => 3.15],
                       ['concepto' => 'INFONAVIT', 'pct' => 5.0], ['concepto' => 'Impuesto sobre nómina', 'pct' => 3.0]],
];

function acrineoFasarDatos(array $ctx): array
{
    $d = ACRINEO_FASAR_DEFECTO;
    $guardado = false;
    if (acrineoOpcionesDisponible() && ($f = bd_fila('AW', 'select * from acrineo_presupuesto_fasar where presupuesto_id = ?', [$ctx['id']]))) {
        $d = ['dias_calendario' => (float) $f['dias_calendario'], 'dias_pagados' => json_decode($f['dias_pagados'], true) ?: [],
              'dias_no_laborados' => json_decode($f['dias_no_laborados'], true) ?: [], 'obligaciones' => json_decode($f['obligaciones'], true) ?: []];
        $guardado = true;
    }
    $sistema = [];
    if (bd_tiene_tabla('AW', 'fasar')) {
        foreach (bd_filas('AW', "select fasar_id, nombre, dias_calendario, dias_pagados, dias_no_laborados, obligaciones, fsr from fasar where estatus = 'A' order by nombre") as $s) {
            $sistema[] = ['id' => (int) $s['fasar_id'], 'nombre' => $s['nombre'], 'fsr' => (float) $s['fsr'], 'dias_calendario' => (float) $s['dias_calendario'],
                          'dias_pagados' => json_decode($s['dias_pagados'], true) ?: [], 'dias_no_laborados' => json_decode($s['dias_no_laborados'], true) ?: [],
                          'obligaciones' => json_decode($s['obligaciones'], true) ?: []];
        }
    }
    $mo = array_values(array_filter(acrineoCatalogoPresupuesto($ctx, 'MO')['insumos'], fn($i) => $i['editable']));
    return ['datos' => $d, 'guardado' => $guardado, 'fsr' => acrineoFasarPresupuesto($ctx['id']), 'sistema' => $sistema,
            'mano_obra' => array_map(fn($i) => ['clave' => $i['clave'], 'codigo' => $i['codigo'], 'descripcion' => $i['descripcion'], 'unidad' => $i['unidad'],
                                                 'costo' => $i['costo'], 'salario_base' => $i['datos']->salario_base ?? null, 'fasar' => $i['datos']->fasar ?? null], $mo),
            'disponible' => acrineoOpcionesDisponible()];
}

// Renglones [{concepto, dias|pct}] válidos
function acrineoFasarRenglones($lista, string $campo, string $que): array
{
    $r = [];
    foreach (is_array($lista) ? $lista : [] as $f) {
        if (!is_array($f)) continue;
        $concepto = mb_substr(trim((string) ($f['concepto'] ?? '')), 0, 100);
        $valor = trim((string) ($f[$campo] ?? ''));
        if ($concepto === '' && $valor === '') continue;
        if ($concepto === '') throw new AcrineoError("Hay un renglón de $que sin concepto.", 422);
        if (!is_numeric($valor) || (float) $valor < 0) throw new AcrineoError("«{$concepto}» ($que) debe ser un número de 0 en adelante.", 422);
        $r[] = ['concepto' => $concepto, $campo => round((float) $valor, 5)];
    }
    return $r;
}

// Calcula y guarda el FASAR; con aplicar, la mano de obra del presupuesto con salario base toma ese FASAR (y con
// base_desde_costo, la que no tiene salario base lo toma de su costo actual).
function acrineoFasarGuardar(array $ctx, array $in, string $usuario): array
{
    acrineoOpcionesExigir();
    require_once ACRI_RAIZ . '/includes/pu.php';
    $dias = $in['dias_calendario'] ?? null;
    if (!is_numeric($dias) || (float) $dias <= 0 || (float) $dias > 400) throw new AcrineoError('Los días calendario deben ser un número de 1 a 400.', 422, ['dias_calendario' => 'De 1 a 400.']);
    $pagados = acrineoFasarRenglones($in['dias_pagados'] ?? [], 'dias', 'días pagados');
    $noLab = acrineoFasarRenglones($in['dias_no_laborados'] ?? [], 'dias', 'días no laborados');
    $oblig = acrineoFasarRenglones($in['obligaciones'] ?? [], 'pct', 'obligaciones');
    try {
        $c = puFsr((float) $dias, $pagados, $noLab, $oblig);
    } catch (InvalidArgumentException $e) {
        throw new AcrineoError($e->getMessage(), 422);
    }
    if ($c['fsr'] <= 0 || $c['fsr'] >= 10) throw new AcrineoError('El FASAR que resulta (' . $c['fsr'] . ') no es válido: revisa los datos.', 422);
    $aplicar = in_array($in['aplicar'] ?? false, [true, 1, '1', 'true'], true);
    $desdeCosto = in_array($in['base_desde_costo'] ?? false, [true, 1, '1', 'true'], true);
    $antes = acrineoFasarPresupuesto($ctx['id']);

    return acrineoTransaccion(function () use ($ctx, $dias, $pagados, $noLab, $oblig, $c, $aplicar, $desdeCosto, $antes, $usuario) {
        $j = fn($v) => json_encode($v, JSON_UNESCAPED_UNICODE);
        bd_ejecutar('AW', 'insert into acrineo_presupuesto_fasar (presupuesto_id, dias_calendario, dias_pagados, dias_no_laborados, obligaciones, tp, tl, ps, fsr, updated_at, updated_by)
                           values (?, ?, cast(? as jsonb), cast(? as jsonb), cast(? as jsonb), ?, ?, ?, ?, now(), ?)
                           on conflict (presupuesto_id) do update set dias_calendario = excluded.dias_calendario, dias_pagados = excluded.dias_pagados,
                               dias_no_laborados = excluded.dias_no_laborados, obligaciones = excluded.obligaciones, tp = excluded.tp, tl = excluded.tl,
                               ps = excluded.ps, fsr = excluded.fsr, updated_at = now(), updated_by = excluded.updated_by',
            [$ctx['id'], round((float) $dias, 2), $j($pagados), $j($noLab), $j($oblig), $c['tp'], $c['tl'], $c['ps'], $c['fsr'], mb_substr($usuario, 0, 50)]);
        $aplicados = 0;
        $renglones = 0;
        $recalculados = 0;
        if ($aplicar) {
            $datos = acrineoInsumosDatos($ctx['id']);
            $nuevos = [];
            foreach (acrineoInsumosPorClave($ctx) as $k => $i) {
                if ($i['tipo'] !== 'MO' || $i['pct'] || $i['n']) continue;
                $d = $datos[$k]['datos'] ?? [];
                if (empty($d['salario_base'])) {
                    if (!$desdeCosto || $i['costo'] <= 0) continue;
                    $d['salario_base'] = round((float) $i['costo'], 6);
                }
                $d['fasar'] = $c['fsr'];
                acrineoInsumoDatosEscribir($ctx['id'], $k, 'MO', $d);
                $nuevos[$k] = acrineoCostoDeDatos('MO', $d, $c['fsr']);
                $aplicados++;
            }
            [$renglones, $recalculados] = acrineoAplicarCostosInsumos($ctx, $nuevos);
        }
        acrineoRegistrar($ctx['id'], $usuario, 'HOJA', [['FASAR del presupuesto', $antes === null ? null : (string) $antes,
            $c['fsr'] . ($aplicar ? " (aplicado a $aplicados categoría(s) de mano de obra)" : '')]]);
        return $c + ['aplicados' => $aplicados, 'renglones' => $renglones, 'recalculados' => $recalculados];
    });
}
