<?php
// ACRINEO · Hoja del presupuesto: partidas / subpartidas, conceptos de cada partida y el catálogo de conceptos
// del presupuesto (migraciones/025). Cada cambio recalcula y guarda el costo directo y el precio de venta del
// presupuesto (los que muestra el Catálogo de presupuestos) y deja constancia en su historial.
require_once __DIR__ . '/presupuestos.php';
require_once __DIR__ . '/hoja-calculo.php';

const ACRINEO_CAMPO_CODIGO   = ['tipo' => 'texto', 'max' => 30, 'requerido' => true];
const ACRINEO_CAMPO_DESC     = ['tipo' => 'largo', 'max' => 4000, 'requerido' => true];
const ACRINEO_CAMPO_UNIDAD   = ['tipo' => 'texto', 'max' => 20];
const ACRINEO_CAMPO_CANTIDAD = ['tipo' => 'decimal', 'min' => 0, 'max' => 999999999999, 'decimales' => 6, 'requerido' => true];
const ACRINEO_CAMPO_COSTO    = ['tipo' => 'decimal', 'min' => 0, 'max' => 999999999999, 'decimales' => 6, 'requerido' => true];
const ACRINEO_CAMPO_SOBRECOSTO = ['tipo' => 'decimal', 'min' => -99.9999, 'max' => 1000, 'decimales' => 4, 'requerido' => true];
const ACRINEO_CAMPO_PCT      = ['tipo' => 'decimal', 'min' => 0, 'max' => 99.9999, 'decimales' => 4, 'requerido' => true];

// Cambio de un concepto desde la cuadrícula. Si su costo sale de la matriz, el costo capturado no se toma.
// Parámetros: descripcion, unidad, costo, precio_alzado, precio_fijo (+ lo que se agregue después del set)
const ACRINEO_SQL_CONCEPTO_CAMBIO = "update acrineo_conceptos set descripcion = ?, unidad = ?,
        costo = case when costo_origen = 'matriz' then costo else ? end,
        precio_alzado = cast(? as boolean), precio_fijo = ?, updated_at = now()";

function acrineoHojaDisponible(): bool
{
    return acrineoDisponible() && bd_tiene_tabla('AW', 'acrineo_partidas');
}

// Datos del presupuesto que usa la hoja; 404 si no existe
function acrineoHojaContexto(int $id): array
{
    $f = bd_fila('AW', 'select p.presupuesto_id, p.codigo, p.nombre, p.sobrecosto_pct, p.costo_directo, p.precio_venta,
                               coalesce(k.decimales_costos, 2) as dc, coalesce(k.decimales_cantidades, 4) as dq
                          from acrineo_presupuestos p left join acrineo_presupuesto_calculo k on k.presupuesto_id = p.presupuesto_id
                         where p.presupuesto_id = ? and p.deleted_at is null', [$id]);
    if (!$f) throw new AcrineoError('El presupuesto no existe o fue eliminado.', 404);
    return ['id' => (int) $f['presupuesto_id'], 'codigo' => $f['codigo'], 'nombre' => $f['nombre'],
            'sobrecosto_pct' => (float) $f['sobrecosto_pct'], 'costo_directo' => (float) $f['costo_directo'],
            'precio_venta' => (float) $f['precio_venta'], 'dec_costos' => (int) $f['dc'], 'dec_cantidades' => (int) $f['dq']];
}

// ---------- Lectura ----------

// Partidas en orden de árbol, con nivel y totales (los suyos más los de sus subpartidas)
function acrineoPartidas(array $ctx): array
{
    $filas = bd_filas('AW', 'select partida_id as id, padre_id, codigo, descripcion, orden from acrineo_partidas where presupuesto_id = ?', [$ctx['id']]);
    $padres = [];
    foreach ($filas as &$f) {
        $f['id'] = (int) $f['id'];
        $f['padre_id'] = $f['padre_id'] === null ? null : (int) $f['padre_id'];
        $f['orden'] = (int) $f['orden'];
        $padres[$f['id']] = $f['padre_id'];
    }
    unset($f);
    $propios = [];
    foreach (acrineoRenglonesDe($ctx, 'p.presupuesto_id = ?', [$ctx['id']]) as $r) {
        $propios[$r['partida_id']]['costo'] = ($propios[$r['partida_id']]['costo'] ?? 0) + $r['importe_costo'];
        $propios[$r['partida_id']]['venta'] = ($propios[$r['partida_id']]['venta'] ?? 0) + $r['importe'];
    }
    $tot = acrineoTotalesPartidas($padres, $propios, $ctx['dec_costos']);
    foreach ($filas as &$f) { $f['costo'] = $tot[$f['id']]['costo']; $f['venta'] = $tot[$f['id']]['venta']; }
    return acrineoOrdenArbol($filas);
}

// Renglones con sus importes. $where sobre acrineo_partidas p
function acrineoRenglonesDe(array $ctx, string $where, array $params): array
{
    $filas = bd_filas('AW', "select r.renglon_id, r.partida_id, r.concepto_id, r.cantidad, r.orden, c.codigo, c.descripcion, c.unidad, c.costo,
                                    c.costo_origen, c.precio_alzado, c.precio_fijo
                               from acrineo_partida_conceptos r
                               join acrineo_partidas p on p.partida_id = r.partida_id
                               join acrineo_conceptos c on c.concepto_id = r.concepto_id
                              where $where order by r.orden, r.renglon_id", $params);
    foreach ($filas as &$r) {
        foreach (['renglon_id', 'partida_id', 'concepto_id', 'orden'] as $k) $r[$k] = (int) $r[$k];
        $r['cantidad'] = (float) $r['cantidad'];
        acrineoTiparConcepto($r, $ctx);
        $r['importe_costo'] = acrineoImporte($r['cantidad'], $r['costo'], $ctx['dec_costos']);
        $r['importe'] = acrineoImporte($r['cantidad'], $r['precio'], $ctx['dec_costos']);
    }
    return $filas;
}

// Costo, P.A. y precio unitario de un concepto tal como los muestra la hoja
function acrineoTiparConcepto(array &$c, array $ctx): void
{
    $c['costo'] = round((float) $c['costo'], $ctx['dec_costos']);
    $c['precio_alzado'] = in_array($c['precio_alzado'], [true, 't', 1, '1'], true);
    $c['precio_fijo'] = $c['precio_fijo'] === null ? null : round((float) $c['precio_fijo'], $ctx['dec_costos']);
    $c['matriz'] = $c['costo_origen'] === 'matriz';
    unset($c['costo_origen']);
    $c['precio'] = acrineoPrecioConcepto($c['costo'], $ctx['sobrecosto_pct'], $ctx['dec_costos'], $c['precio_alzado'], $c['precio_fijo']);
}

function acrineoRenglones(array $ctx, int $partidaId): array
{
    acrineoPartidaFila($ctx, $partidaId);
    return acrineoRenglonesDe($ctx, 'p.presupuesto_id = ? and r.partida_id = ?', [$ctx['id'], $partidaId]);
}

// Catálogo de conceptos del presupuesto (abajo): con cuántas partidas lo usan y la cantidad total
function acrineoConceptosCatalogo(array $ctx, string $q, int $pagina = 1, int $porPagina = 100): array
{
    $where = 'c.presupuesto_id = ?';
    $params = [$ctx['id']];
    if (trim($q) !== '') {
        $where .= ' and (c.codigo ilike ? or c.descripcion ilike ? or c.unidad ilike ?)';
        array_push($params, acrineoPatron($q), acrineoPatron($q), acrineoPatron($q));
    }
    $porPagina = max(10, min(500, $porPagina));
    $total = (int) bd_valor('AW', "select count(*) from acrineo_conceptos c where $where", $params);
    $filas = bd_filas('AW', "select c.concepto_id as id, c.codigo, c.descripcion, c.unidad, c.costo, c.costo_origen, c.precio_alzado, c.precio_fijo,
                                    count(r.renglon_id) as usos, coalesce(sum(r.cantidad), 0) as cantidad_total
                               from acrineo_conceptos c left join acrineo_partida_conceptos r on r.concepto_id = c.concepto_id
                              where $where group by c.concepto_id order by c.codigo limit ? offset ?",
        array_merge($params, [$porPagina, (max(1, $pagina) - 1) * $porPagina]));
    foreach ($filas as &$f) {
        $f['id'] = (int) $f['id'];
        $f['usos'] = (int) $f['usos'];
        $f['cantidad_total'] = (float) $f['cantidad_total'];
        acrineoTiparConcepto($f, $ctx);
    }
    return ['items' => $filas, 'total' => $total];
}

// Todo lo que la hoja vuelve a pintar después de un cambio
function acrineoHojaEstado(int $id, ?int $partidaId = null): array
{
    $ctx = acrineoHojaContexto($id);
    $r = ['presupuesto' => $ctx, 'partidas' => acrineoPartidas($ctx)];
    if ($partidaId) {
        $ids = array_column($r['partidas'], 'id');
        $r['renglones'] = in_array($partidaId, $ids, true) ? acrineoRenglones($ctx, $partidaId) : [];
    }
    return $r;
}

// ---------- Partidas ----------

function acrineoPartidaFila(array $ctx, int $partidaId): array
{
    $f = bd_fila('AW', 'select partida_id, padre_id, codigo, descripcion, orden from acrineo_partidas where partida_id = ? and presupuesto_id = ?',
        [$partidaId, $ctx['id']]);
    if (!$f) throw new AcrineoError('La partida ya no existe.', 404);
    return $f;
}

function acrineoValidarPartida(array $in, array $ctx, ?int $excluir = null): array
{
    [$codigo, $e1] = acrineoValor($in['codigo'] ?? null, ACRINEO_CAMPO_CODIGO);
    [$desc, $e2] = acrineoValor($in['descripcion'] ?? null, ACRINEO_CAMPO_DESC);
    $errores = array_filter(['codigo' => $e1, 'descripcion' => $e2]);
    if (!$e1 && bd_valor('AW', 'select 1 from acrineo_partidas where presupuesto_id = ? and upper(codigo) = ? and partida_id <> ?',
            [$ctx['id'], mb_strtoupper($codigo), $excluir ?? 0])) {
        $errores['codigo'] = 'Ya existe otra partida con ese código.';
    }
    if ($errores) throw new AcrineoError('Revisa la partida.', 422, $errores);
    return [$codigo, $desc];
}

// Código sugerido para la siguiente partida (raíz o hija de $padreId)
function acrineoCodigoSugerido(array $ctx, ?int $padreId): string
{
    $usados = array_column(bd_filas('AW', 'select codigo from acrineo_partidas where presupuesto_id = ?', [$ctx['id']]), 'codigo');
    $padre = $padreId ? acrineoPartidaFila($ctx, $padreId)['codigo'] : null;
    return acrineoSiguienteCodigoPartida($padre, $usados);
}

function acrineoPartidaCrear(array $ctx, ?int $padreId, array $in, string $usuario): int
{
    if ($padreId) acrineoPartidaFila($ctx, $padreId);
    [$codigo, $desc] = acrineoValidarPartida($in, $ctx);
    return acrineoTransaccion(function () use ($ctx, $padreId, $codigo, $desc, $usuario) {
        $orden = (int) bd_valor('AW', 'select coalesce(max(orden), -1) + 1 from acrineo_partidas where presupuesto_id = ? and '
            . ($padreId ? 'padre_id = ?' : 'padre_id is null'), $padreId ? [$ctx['id'], $padreId] : [$ctx['id']]);
        $id = bd_insertar('AW', 'acrineo_partidas', 'partida_id',
            ['presupuesto_id' => $ctx['id'], 'padre_id' => $padreId, 'codigo' => $codigo, 'descripcion' => $desc, 'orden' => $orden]);
        acrineoRegistrar($ctx['id'], $usuario, 'HOJA', [[$padreId ? 'Agregó subpartida' : 'Agregó partida', null, "$codigo · $desc"]]);
        return $id;
    });
}

function acrineoPartidaGuardar(array $ctx, int $partidaId, array $in, string $usuario): void
{
    $antes = acrineoPartidaFila($ctx, $partidaId);
    [$codigo, $desc] = acrineoValidarPartida($in, $ctx, $partidaId);
    if ($codigo === $antes['codigo'] && $desc === $antes['descripcion']) return;
    acrineoTransaccion(function () use ($ctx, $partidaId, $codigo, $desc, $antes, $usuario) {
        bd_ejecutar('AW', 'update acrineo_partidas set codigo = ?, descripcion = ?, updated_at = now() where partida_id = ?', [$codigo, $desc, $partidaId]);
        acrineoRegistrar($ctx['id'], $usuario, 'HOJA', [['Modificó partida', "{$antes['codigo']} · {$antes['descripcion']}", "$codigo · $desc"]]);
    });
}

function acrineoPartidaEliminar(array $ctx, int $partidaId, string $usuario): void
{
    $p = acrineoPartidaFila($ctx, $partidaId);
    acrineoTransaccion(function () use ($ctx, $partidaId, $p, $usuario) {
        bd_ejecutar('AW', 'delete from acrineo_partidas where partida_id = ?', [$partidaId]);   // subpartidas y renglones en cascada
        acrineoRegistrar($ctx['id'], $usuario, 'HOJA', [['Eliminó partida', "{$p['codigo']} · {$p['descripcion']}", null]]);
    });
}

// Mover: arriba / abajo entre sus hermanas; izquierda = sube de nivel (queda después de su padre);
// derecha = baja de nivel (pasa a ser la última subpartida de la hermana de arriba)
function acrineoPartidaMover(array $ctx, int $partidaId, string $direccion): void
{
    $p = acrineoPartidaFila($ctx, $partidaId);
    $padre = $p['padre_id'] === null ? null : (int) $p['padre_id'];
    acrineoTransaccion(function () use ($ctx, $partidaId, $padre, $direccion) {
        $hermanas = acrineoNormalizarOrden($ctx['id'], $padre);
        $i = array_search($partidaId, $hermanas, true);
        switch ($direccion) {
            case 'arriba':
            case 'abajo':
                $j = $direccion === 'arriba' ? $i - 1 : $i + 1;
                if (!isset($hermanas[$j])) return;
                bd_ejecutar('AW', 'update acrineo_partidas set orden = ? where partida_id = ?', [$j, $partidaId]);
                bd_ejecutar('AW', 'update acrineo_partidas set orden = ? where partida_id = ?', [$i, $hermanas[$j]]);
                return;
            case 'izquierda':
                if ($padre === null) throw new AcrineoError('La partida ya está en el primer nivel.', 422);
                $abuelo = bd_valor('AW', 'select padre_id from acrineo_partidas where partida_id = ?', [$padre]);
                $abuelo = $abuelo === null ? null : (int) $abuelo;
                $tias = acrineoNormalizarOrden($ctx['id'], $abuelo);
                $pos = array_search($padre, $tias, true) + 1;
                bd_ejecutar('AW', 'update acrineo_partidas set orden = orden + 1 where presupuesto_id = ? and '
                    . ($abuelo === null ? 'padre_id is null' : 'padre_id = ?') . ' and orden >= ?',
                    $abuelo === null ? [$ctx['id'], $pos] : [$ctx['id'], $abuelo, $pos]);
                bd_ejecutar('AW', 'update acrineo_partidas set padre_id = ?, orden = ?, updated_at = now() where partida_id = ?', [$abuelo, $pos, $partidaId]);
                acrineoNormalizarOrden($ctx['id'], $padre);
                return;
            case 'derecha':
                if ($i === 0) throw new AcrineoError('Para bajarla de nivel debe haber una partida arriba de ella, en el mismo nivel.', 422);
                $nuevoPadre = $hermanas[$i - 1];
                $orden = (int) bd_valor('AW', 'select coalesce(max(orden), -1) + 1 from acrineo_partidas where padre_id = ?', [$nuevoPadre]);
                bd_ejecutar('AW', 'update acrineo_partidas set padre_id = ?, orden = ?, updated_at = now() where partida_id = ?', [$nuevoPadre, $orden, $partidaId]);
                acrineoNormalizarOrden($ctx['id'], $padre);
                return;
        }
        throw new AcrineoError('Movimiento no válido.', 400);
    });
}

// Deja el orden de las hermanas en 0, 1, 2… y regresa sus ids en ese orden
function acrineoNormalizarOrden(int $presupuestoId, ?int $padre): array
{
    $ids = array_map('intval', array_column(bd_filas('AW', 'select partida_id from acrineo_partidas where presupuesto_id = ? and '
        . ($padre === null ? 'padre_id is null' : 'padre_id = ?') . ' order by orden, partida_id',
        $padre === null ? [$presupuestoId] : [$presupuestoId, $padre]), 'partida_id'));
    foreach ($ids as $n => $pid) bd_ejecutar('AW', 'update acrineo_partidas set orden = ? where partida_id = ? and orden <> ?', [$n, $pid, $n]);
    return $ids;
}

// ---------- Conceptos de una partida ----------

// Guarda de una vez lo capturado en la cuadrícula de conceptos (modo edición):
//   filas: [{renglon_id?, codigo, descripcion, unidad, cantidad, costo}]  ·  quitar: [renglon_id…]
// Un código que ya está en el catálogo del presupuesto usa ese concepto (y actualiza su descripción, unidad y costo,
// que son los mismos en todas las partidas); uno nuevo se agrega al catálogo. Todo o nada.
function acrineoRenglonesGuardar(array $ctx, int $partidaId, array $filas, array $quitar, string $usuario): array
{
    $partida = acrineoPartidaFila($ctx, $partidaId);
    if (count($filas) > 500) throw new AcrineoError('Se pueden guardar hasta 500 renglones a la vez.', 422);
    $errores = [];
    $limpias = [];
    $codigos = [];
    foreach (array_values($filas) as $n => $f) {
        if (!is_array($f)) { $errores["filas.$n.codigo"] = 'Renglón no válido.'; continue; }
        $l = ['renglon_id' => isset($f['renglon_id']) && (int) $f['renglon_id'] > 0 ? (int) $f['renglon_id'] : null];
        foreach (['codigo' => ACRINEO_CAMPO_CODIGO, 'descripcion' => ACRINEO_CAMPO_DESC, 'unidad' => ACRINEO_CAMPO_UNIDAD,
                  'cantidad' => ACRINEO_CAMPO_CANTIDAD, 'costo' => ACRINEO_CAMPO_COSTO] as $k => $def) {
            [$v, $e] = acrineoValor($f[$k] ?? null, $def);
            if ($e) $errores["filas.$n.$k"] = $e;
            $l[$k] = $v;
        }
        if ($l['cantidad'] !== null) $l['cantidad'] = round($l['cantidad'], $ctx['dec_cantidades']);
        // P.A. (precio alzado): el precio unitario se captura fijo
        $l['precio_alzado'] = in_array($f['precio_alzado'] ?? false, [true, 1, '1', 'true'], true);
        $l['precio_fijo'] = null;
        if ($l['precio_alzado']) {
            [$pf, $e] = acrineoValor($f['precio_fijo'] ?? null, ACRINEO_CAMPO_COSTO);
            if ($e) $errores["filas.$n.precio_fijo"] = $e;
            $l['precio_fijo'] = $pf;
        }
        if ($l['codigo'] !== null) {
            $k = mb_strtoupper($l['codigo']);
            if (isset($codigos[$k])) $errores["filas.$n.codigo"] = 'El código está repetido en la partida.';
            $codigos[$k] = true;
        }
        $limpias[$n] = $l;
    }
    if ($errores) throw new AcrineoError('Revisa los renglones marcados.', 422, $errores);
    $quitar = array_values(array_unique(array_filter(array_map('intval', $quitar), fn($x) => $x > 0)));

    acrineoTransaccion(function () use ($ctx, $partidaId, $partida, $limpias, $quitar, $usuario) {
        $actuales = [];
        foreach (bd_filas('AW', 'select renglon_id, concepto_id from acrineo_partida_conceptos where partida_id = ?', [$partidaId]) as $r) {
            $actuales[(int) $r['renglon_id']] = (int) $r['concepto_id'];
        }
        $errores = [];
        $resumen = ['agregados' => 0, 'modificados' => 0, 'quitados' => 0];
        foreach ($quitar as $rid) {
            if (!isset($actuales[$rid])) continue;
            bd_ejecutar('AW', 'delete from acrineo_partida_conceptos where renglon_id = ?', [$rid]);
            unset($actuales[$rid]);
            $resumen['quitados']++;
        }
        $orden = (int) bd_valor('AW', 'select coalesce(max(orden), -1) + 1 from acrineo_partida_conceptos where partida_id = ?', [$partidaId]);
        foreach ($limpias as $n => $l) {
            $existente = bd_fila('AW', 'select concepto_id from acrineo_conceptos where presupuesto_id = ? and upper(codigo) = ?', [$ctx['id'], mb_strtoupper($l['codigo'])]);
            if ($l['renglon_id'] !== null) {
                if (!isset($actuales[$l['renglon_id']])) { $errores["filas.$n.codigo"] = 'El renglón ya no existe; vuelve a cargar la partida.'; continue; }
                $cid = $actuales[$l['renglon_id']];
                if ($existente && (int) $existente['concepto_id'] !== $cid) { $errores["filas.$n.codigo"] = 'Ese código ya es de otro concepto del presupuesto.'; continue; }
                bd_ejecutar('AW', ACRINEO_SQL_CONCEPTO_CAMBIO . ', codigo = ? where concepto_id = ?',
                    [$l['descripcion'], $l['unidad'], $l['costo'], $l['precio_alzado'] ? 'true' : 'false', $l['precio_fijo'], $l['codigo'], $cid]);
                bd_ejecutar('AW', 'update acrineo_partida_conceptos set cantidad = ? where renglon_id = ?', [$l['cantidad'], $l['renglon_id']]);
                $resumen['modificados']++;
                continue;
            }
            if ($existente) {
                $cid = (int) $existente['concepto_id'];
                if (in_array($cid, $actuales, true)) { $errores["filas.$n.codigo"] = 'Ese concepto ya está en esta partida.'; continue; }
                bd_ejecutar('AW', ACRINEO_SQL_CONCEPTO_CAMBIO . ' where concepto_id = ?',
                    [$l['descripcion'], $l['unidad'], $l['costo'], $l['precio_alzado'] ? 'true' : 'false', $l['precio_fijo'], $cid]);
            } else {
                $cid = bd_insertar('AW', 'acrineo_conceptos', 'concepto_id', ['presupuesto_id' => $ctx['id'], 'codigo' => $l['codigo'],
                    'descripcion' => $l['descripcion'], 'unidad' => $l['unidad'], 'costo' => $l['costo'],
                    'precio_alzado' => $l['precio_alzado'] ? 'true' : 'false', 'precio_fijo' => $l['precio_fijo']]);
            }
            $rid = bd_insertar('AW', 'acrineo_partida_conceptos', 'renglon_id', ['partida_id' => $partidaId, 'concepto_id' => $cid,
                'cantidad' => $l['cantidad'], 'orden' => $orden++]);
            $actuales[$rid] = $cid;
            $resumen['agregados']++;
        }
        if ($errores) throw new AcrineoError('Revisa los renglones marcados.', 422, $errores);
        acrineoRegistrar($ctx['id'], $usuario, 'HOJA', [["Conceptos de la partida {$partida['codigo']}", null,
            "{$resumen['agregados']} agregados, {$resumen['modificados']} modificados, {$resumen['quitados']} quitados"]]);
        acrineoActualizarTotales($ctx['id']);
    });
    return acrineoRenglones($ctx, $partidaId);
}

// Copia conceptos del catálogo (abajo) a la partida: [{concepto_id, cantidad}]. Si ya estaba, se suma la cantidad.
function acrineoCopiarConceptos(array $ctx, int $partidaId, array $lista, string $usuario): int
{
    $partida = acrineoPartidaFila($ctx, $partidaId);
    $limpias = [];
    foreach ($lista as $n => $c) {
        $cid = (int) ($c['concepto_id'] ?? 0);
        [$cant, $e] = acrineoValor($c['cantidad'] ?? null, ACRINEO_CAMPO_CANTIDAD);
        if ($e || $cid <= 0) throw new AcrineoError('Revisa la cantidad a copiar.', 422, ["copiar.$cid" => $e ?: 'Concepto no válido.']);
        $limpias[$cid] = ($limpias[$cid] ?? 0) + round($cant, $ctx['dec_cantidades']);
    }
    if (!$limpias) throw new AcrineoError('Marca los conceptos que quieres copiar.', 422);
    return acrineoTransaccion(function () use ($ctx, $partidaId, $partida, $limpias, $usuario) {
        $validos = bd_filas('AW', 'select concepto_id from acrineo_conceptos where presupuesto_id = ? and concepto_id in ('
            . implode(',', array_fill(0, count($limpias), '?')) . ')', array_merge([$ctx['id']], array_keys($limpias)));
        if (count($validos) !== count($limpias)) throw new AcrineoError('Algún concepto ya no existe en el catálogo; vuelve a cargarlo.', 409);
        $orden = (int) bd_valor('AW', 'select coalesce(max(orden), -1) + 1 from acrineo_partida_conceptos where partida_id = ?', [$partidaId]);
        foreach ($limpias as $cid => $cant) {
            $n = bd_ejecutar('AW', 'update acrineo_partida_conceptos set cantidad = cantidad + ? where partida_id = ? and concepto_id = ?', [$cant, $partidaId, $cid]);
            if (!$n) bd_insertar('AW', 'acrineo_partida_conceptos', 'renglon_id', ['partida_id' => $partidaId, 'concepto_id' => $cid, 'cantidad' => $cant, 'orden' => $orden++]);
        }
        acrineoRegistrar($ctx['id'], $usuario, 'HOJA', [["Copió conceptos a la partida {$partida['codigo']}", null, count($limpias) . ' concepto(s)']]);
        acrineoActualizarTotales($ctx['id']);
        return count($limpias);
    });
}

// Quita un concepto del catálogo del presupuesto (solo si ninguna partida lo usa)
function acrineoConceptoEliminar(array $ctx, int $conceptoId, string $usuario): void
{
    $c = bd_fila('AW', 'select codigo, descripcion from acrineo_conceptos where concepto_id = ? and presupuesto_id = ?', [$conceptoId, $ctx['id']]);
    if (!$c) throw new AcrineoError('El concepto ya no existe.', 404);
    $usos = (int) bd_valor('AW', 'select count(*) from acrineo_partida_conceptos where concepto_id = ?', [$conceptoId]);
    if ($usos) throw new AcrineoError("El concepto {$c['codigo']} está en $usos partida(s); quítalo primero de ellas.", 409);
    acrineoTransaccion(function () use ($ctx, $conceptoId, $c, $usuario) {
        bd_ejecutar('AW', 'delete from acrineo_conceptos where concepto_id = ?', [$conceptoId]);
        acrineoRegistrar($ctx['id'], $usuario, 'HOJA', [['Eliminó concepto del catálogo', "{$c['codigo']} · {$c['descripcion']}", null]]);
    });
}

function acrineoSobrecostoGuardar(array $ctx, $valor, string $usuario): void
{
    [$v, $e] = acrineoValor($valor, ACRINEO_CAMPO_SOBRECOSTO);
    if ($e) throw new AcrineoError('Revisa el % de sobrecosto.', 422, ['sobrecosto_pct' => $e]);
    if (abs($v - $ctx['sobrecosto_pct']) < 0.00005) return;
    acrineoTransaccion(function () use ($ctx, $v, $usuario) {
        bd_ejecutar('AW', 'update acrineo_presupuestos set sobrecosto_pct = ?, updated_at = now(), updated_by = ?, version = version + 1 where presupuesto_id = ?',
            [$v, mb_substr($usuario, 0, 50), $ctx['id']]);
        acrineoRegistrar($ctx['id'], $usuario, 'MODIFICAR', [['% Sobrecosto', acrineoTextoValor($ctx['sobrecosto_pct']), acrineoTextoValor($v)]]);
        acrineoActualizarTotales($ctx['id']);
    });
}

// Recalcula y guarda el costo directo y el precio de venta del presupuesto (columnas del catálogo)
function acrineoActualizarTotales(int $id): void
{
    $ctx = acrineoHojaContexto($id);
    $costo = $venta = 0.0;
    foreach (acrineoRenglonesDe($ctx, 'p.presupuesto_id = ?', [$id]) as $r) { $costo += $r['importe_costo']; $venta += $r['importe']; }
    bd_ejecutar('AW', 'update acrineo_presupuestos set costo_directo = ?, precio_venta = ?, updated_at = now() where presupuesto_id = ?',
        [round($costo, 2), round($venta, 2), $id]);
}

function acrineoTransaccion(callable $fn)
{
    $pdo = bd_pdo('AW');
    if ($pdo->inTransaction()) return $fn();
    $pdo->beginTransaction();
    try {
        $r = $fn();
        $pdo->commit();
        return $r;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

// ---------- Matriz de precio unitario ----------

function acrineoConceptoFila(array $ctx, int $conceptoId): array
{
    $c = bd_fila('AW', 'select concepto_id, codigo, descripcion, unidad, costo, costo_origen, precio_alzado, precio_fijo
                          from acrineo_conceptos where concepto_id = ? and presupuesto_id = ?', [$conceptoId, $ctx['id']]);
    if (!$c) throw new AcrineoError('El concepto ya no existe.', 404);
    $c['concepto_id'] = (int) $c['concepto_id'];
    acrineoTiparConcepto($c, $ctx);
    return $c;
}

// Matriz del concepto ya calculada. Con $actualizar, el costo de los insumos del catálogo se toma del catálogo
// (precio vigente; la mano de obra con su FSR; los básicos con sus componentes) sin guardar: la ventana lo muestra
// y el usuario decide si lo guarda.
function acrineoMatriz(array $ctx, int $conceptoId, bool $actualizar = false): array
{
    $concepto = acrineoConceptoFila($ctx, $conceptoId);
    $filas = bd_filas('AW', 'select matriz_id, insumo_id, tipo, codigo, descripcion, unidad, base, cantidad, desperdicio_pct, costo
                               from acrineo_matriz where concepto_id = ? order by orden, matriz_id', [$conceptoId]);
    foreach ($filas as &$f) {
        $f['matriz_id'] = (int) $f['matriz_id'];
        $f['insumo_id'] = $f['insumo_id'] === null ? null : (int) $f['insumo_id'];
        $f['tipo'] = trim($f['tipo']);
        foreach (['cantidad', 'desperdicio_pct', 'costo'] as $k) $f[$k] = (float) $f[$k];
        $f['base'] = $f['base'] ?: null;
    }
    unset($f);
    $avisos = [];
    if ($actualizar) {
        $costos = acrineoCostosCatalogo(array_filter(array_column($filas, 'insumo_id')));
        foreach ($filas as &$f) {
            if (!$f['insumo_id'] || $f['base']) continue;
            $c = $costos[$f['insumo_id']] ?? null;
            if ($c === null || $c['costo'] === null) {
                $avisos[] = ($f['codigo'] ?: $f['descripcion']) . ': ' . ($c ? 'sin precio (' . implode(', ', $c['faltan']) . ')' : 'ya no está en el catálogo');
                continue;
            }
            $f['costo'] = $c['costo'];
        }
        unset($f);
    }
    $calc = acrineoCalcularMatriz($filas, $ctx['dec_costos']);
    return ['concepto' => $concepto, 'filas' => $calc['filas'], 'totales' => $calc['totales'], 'total' => $calc['total'],
            'avisos' => $avisos, 'tipos' => ACRINEO_TIPOS_INSUMO];
}

// Costo de catálogo de varios insumos con el motor del sistema (includes/pu.php): [insumo_id => ['costo', 'faltan']]
function acrineoCostosCatalogo(array $ids): array
{
    if (!$ids) return [];
    require_once ACRI_RAIZ . '/includes/pu.php';
    if (!puDisponible()) return [];
    [$insumos, $componentes] = puCargarCatalogo();
    $tc = puTiposCambio();
    $memo = [];
    $r = [];
    foreach (array_unique($ids) as $id) {
        if (!isset($insumos[$id])) continue;
        try {
            $r[$id] = puCostoInsumo((int) $id, $insumos, $componentes, $tc, $memo);
        } catch (Throwable $e) {
            $r[$id] = ['costo' => null, 'faltan' => [$e->getMessage()]];
        }
    }
    return $r;
}

// Búsqueda en el catálogo de insumos del sistema para la matriz (con el formato de la ventana de búsqueda)
function acrineoInsumosBuscar(string $q, int $pagina = 1, int $porPagina = 50): array
{
    require_once ACRI_RAIZ . '/includes/pu.php';
    if (!puDisponible()) throw new AcrineoError('El catálogo de insumos no está instalado (migración 004).', 503);
    $where = "i.estatus = 'A'";
    $params = [];
    if (trim($q) !== '') {
        $where .= ' and (i.clave ilike ? or i.descripcion ilike ? or i.familia ilike ?)';
        array_push($params, acrineoPatron($q), acrineoPatron($q), acrineoPatron($q));
    }
    $porPagina = max(1, min(100, $porPagina));
    $total = (int) bd_valor('AW', "select count(*) from insumos i where $where", $params);
    $filas = bd_filas('AW', "select i.insumo_id, i.clave, i.descripcion, i.tipo, u.clave as unidad from insumos i
                               join unidades u on u.unidad_id = i.unidad_id where $where order by i.descripcion, i.clave limit ? offset ?",
        array_merge($params, [$porPagina, (max(1, $pagina) - 1) * $porPagina]));
    $costos = acrineoCostosCatalogo(array_map(fn($f) => (int) $f['insumo_id'], $filas));
    $items = [];
    foreach ($filas as $f) {
        $id = (int) $f['insumo_id'];
        $tipo = trim($f['tipo']);
        $costo = $costos[$id]['costo'] ?? null;
        $items[] = ['id' => $id, 'nombre' => $f['clave'] . ' · ' . $f['descripcion'],
                    'extra' => (ACRINEO_TIPOS_INSUMO[$tipo] ?? $tipo) . ' · ' . $f['unidad'] . ' · ' . ($costo === null ? 'sin precio' : '$ ' . number_format($costo, 2)),
                    'datos' => ['insumo_id' => $id, 'tipo' => $tipo, 'codigo' => $f['clave'], 'descripcion' => $f['descripcion'],
                                'unidad' => $f['unidad'], 'costo' => $costo]];
    }
    return ['titulo' => 'Catálogo de insumos', 'extra_titulo' => 'Tipo · unidad · costo', 'items' => $items, 'total' => $total, 'alta' => false];
}

// Guarda la matriz completa del concepto (reemplaza sus renglones) y pone su costo directo = total de la matriz.
// Sin renglones, el concepto vuelve a costo capturado (conserva el último).
function acrineoMatrizGuardar(array $ctx, int $conceptoId, array $filas, string $usuario): array
{
    $antes = acrineoConceptoFila($ctx, $conceptoId);
    if (count($filas) > 300) throw new AcrineoError('Una matriz puede tener hasta 300 insumos.', 422);
    $errores = [];
    $limpias = [];
    foreach (array_values($filas) as $n => $f) {
        if (!is_array($f)) { $errores["filas.$n.descripcion"] = 'Renglón no válido.'; continue; }
        $tipo = strtoupper(trim((string) ($f['tipo'] ?? '')));
        if (!isset(ACRINEO_TIPOS_INSUMO[$tipo])) $errores["filas.$n.tipo"] = 'Tipo no válido.';
        $base = in_array($f['base'] ?? null, ['pct_mo', 'pct_mat'], true) ? $f['base'] : null;
        $l = ['tipo' => $tipo, 'base' => $base, 'insumo_id' => (int) ($f['insumo_id'] ?? 0) ?: null];
        $reglas = [
            'codigo'          => ['tipo' => 'texto', 'max' => 30],
            'descripcion'     => ['tipo' => 'texto', 'max' => 250, 'requerido' => true],
            'unidad'          => ACRINEO_CAMPO_UNIDAD,
            'cantidad'        => $base ? ACRINEO_CAMPO_PCT : ACRINEO_CAMPO_CANTIDAD,
            'desperdicio_pct' => ['tipo' => 'decimal', 'min' => 0, 'max' => 99.9999, 'decimales' => 4],
            'costo'           => ACRINEO_CAMPO_COSTO,
        ];
        foreach ($reglas as $k => $def) {
            if ($base && ($k === 'costo' || $k === 'desperdicio_pct')) { $l[$k] = 0.0; continue; }
            [$v, $e] = acrineoValor($f[$k] ?? null, $def);
            if ($e) $errores["filas.$n.$k"] = $e;
            $l[$k] = $v;
        }
        $l['desperdicio_pct'] = (float) ($l['desperdicio_pct'] ?? 0);
        $limpias[] = $l;
    }
    if ($errores) throw new AcrineoError('Revisa los insumos marcados.', 422, $errores);
    // Un insumo del catálogo que ya no existe queda como renglón libre
    $ids = array_values(array_unique(array_filter(array_column($limpias, 'insumo_id'))));
    if ($ids) {
        $existen = array_map('intval', array_column(bd_filas('AW', 'select insumo_id from insumos where insumo_id in ('
            . implode(',', array_fill(0, count($ids), '?')) . ')', $ids), 'insumo_id'));
        foreach ($limpias as &$l) if ($l['insumo_id'] && !in_array($l['insumo_id'], $existen, true)) $l['insumo_id'] = null;
        unset($l);
    }
    $calc = acrineoCalcularMatriz($limpias, $ctx['dec_costos']);

    acrineoTransaccion(function () use ($ctx, $conceptoId, $limpias, $calc, $antes, $usuario) {
        bd_ejecutar('AW', 'delete from acrineo_matriz where concepto_id = ?', [$conceptoId]);
        foreach ($limpias as $n => $l) {
            bd_insertar('AW', 'acrineo_matriz', 'matriz_id', ['concepto_id' => $conceptoId, 'orden' => $n] + $l);
        }
        if ($limpias) {
            bd_ejecutar('AW', "update acrineo_conceptos set costo = ?, costo_origen = 'matriz', updated_at = now() where concepto_id = ?", [$calc['total'], $conceptoId]);
        } else {
            bd_ejecutar('AW', "update acrineo_conceptos set costo_origen = 'directo', updated_at = now() where concepto_id = ?", [$conceptoId]);
        }
        acrineoRegistrar($ctx['id'], $usuario, 'HOJA', [["Matriz del concepto {$antes['codigo']} (" . count($limpias) . ' insumos) · costo directo',
            acrineoTextoValor($antes['costo']), acrineoTextoValor($limpias ? $calc['total'] : $antes['costo'])]]);
        acrineoActualizarTotales($ctx['id']);
    });
    return acrineoMatriz(acrineoHojaContexto($ctx['id']), $conceptoId);
}
