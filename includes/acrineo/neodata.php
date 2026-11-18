<?php
// ACRINEO · Importar presupuestos de Neodata (PU Win+) desde su archivo de intercambio (.zip con Xn_Presupuesto.xlsx).
// El navegador lee el .zip (js/acrineo/importar-neodata.js) y manda las hojas ya convertidas; aquí se crea un presupuesto
// nuevo a nombre del usuario con sus partidas (árbol por WBS), conceptos, cantidades y matrices (con submatrices de los
// básicos y cuadrillas). El costo de cada matriz se recalcula con el motor de ACRINEO:
//   renglón «*»: importe = cantidad × costo · renglón «/»: importe = costo ÷ cantidad (se guarda la cantidad 1/x)
//   insumo de porcentaje (% y Tipo % 1 o 2): % de materiales o de mano de obra del mismo nivel (pct_mat / pct_mo)
//   otro Tipo %: se guarda fijo (costo = suma de ese tipo en el nivel), porque ACRINEO solo tiene esas dos bases.
require_once __DIR__ . '/presupuestos.php';
require_once __DIR__ . '/hoja.php';

const ACRINEO_NEODATA_TIPOS = [1 => 'MAT', 2 => 'MO', 3 => 'EQ', 4 => 'BAS', 5 => 'OTR'];
const ACRINEO_NEODATA_LIMITES = ['catalogo' => 30000, 'partidas' => 3000, 'conceptos' => 15000, 'matrices' => 80000];
const ACRINEO_NEODATA_PROFUNDIDAD = 12;

function acrineoNeoTexto($v, int $max = 0): string
{
    $t = trim(str_replace(["\r\n", "\r"], "\n", (string) ($v ?? '')));
    return $max ? mb_substr($t, 0, $max) : $t;
}

function acrineoNeoNumero($v): float
{
    if (is_int($v) || is_float($v)) return is_finite((float) $v) ? (float) $v : 0.0;
    $t = str_replace([',', '$', ' '], '', trim((string) $v));
    return is_numeric($t) ? (float) $t : 0.0;
}

function acrineoNeoFecha($v): ?string
{
    $t = trim((string) ($v ?? ''));
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $t) && checkdate((int) substr($t, 5, 2), (int) substr($t, 8, 2), (int) substr($t, 0, 4)) ? $t : null;
}

function acrineoNeodataOrigenDisponible(): bool
{
    static $si = null;
    if ($si === null) $si = bd_tiene_columna('AW', 'acrineo_presupuestos', 'neodata_fecha');
    return $si;
}

// Fecha y hora (ISO, con o sin zona) → 'aaaa-mm-dd hh:mm:ss+00:00' en UTC, o null
function acrineoNeoFechaHora($v): ?string
{
    $t = trim((string) ($v ?? ''));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}/', $t)) return null;
    $s = strtotime($t);
    return $s === false || $s < 0 ? null : gmdate('Y-m-d H:i:s', $s) . '+00:00';
}

// Obras de Neodata que ya están en ACRINEO (de cualquier usuario), por nombre de obra en mayúsculas:
//   [OBRA => ['id', 'codigo', 'propietario', 'version' (fecha de la versión de Neodata), 'subido' (cuándo), 'archivo', 'copias']]
// Se regresa la versión más reciente que haya; 'copias' cuenta cuántas veces está.
function acrineoNeodataExistentes(array $nombres, string $usuario): array
{
    $nombres = array_values(array_unique(array_filter(array_map(fn($n) => mb_strtoupper(acrineoNeoTexto($n, 150)), $nombres), 'strlen')));
    if (!$nombres) return [];
    $nombres = array_slice($nombres, 0, 1000);
    $marcas = implode(',', array_fill(0, count($nombres), '?'));
    $origen = acrineoNeodataOrigenDisponible();
    $obra = $origen ? 'upper(coalesce(neodata_obra, nombre))' : 'upper(nombre)';
    $filas = bd_filas('AW', "select presupuesto_id, codigo, propietario, created_at, $obra as obra"
        . ($origen ? ', neodata_fecha, neodata_archivo, neodata_obra' : ', null as neodata_fecha, null as neodata_archivo, null as neodata_obra')
        . " from acrineo_presupuestos where deleted_at is null and $obra in ($marcas)"
        . ($origen ? '' : " and observaciones ilike '%Importado de Neodata%'")
        . ' order by ' . ($origen ? 'neodata_fecha desc nulls last, ' : '') . 'created_at desc', $nombres);
    $r = [];
    foreach ($filas as $f) {
        $k = $f['obra'];
        if (isset($r[$k])) { $r[$k]['copias']++; continue; }
        $r[$k] = ['id' => (int) $f['presupuesto_id'], 'codigo' => $f['codigo'], 'propietario' => $f['propietario'],
                  'version' => $f['neodata_fecha'] ? date('c', strtotime($f['neodata_fecha'])) : null,
                  'subido' => $f['created_at'] ? date('c', strtotime($f['created_at'])) : null,
                  'archivo' => $f['neodata_archivo'], 'neodata' => $f['neodata_obra'] !== null, 'copias' => 1, 'tuyo' => mb_strtoupper((string) $f['propietario']) === mb_strtoupper($usuario)];
    }
    return $r;
}

function acrineoImportarNeodata(array $in, string $usuario): array
{
    foreach (ACRINEO_NEODATA_LIMITES as $k => $max) {
        if (!is_array($in[$k] ?? [])) throw new AcrineoError("El archivo de Neodata no trae bien la hoja «$k».", 422);
        if (count($in[$k] ?? []) > $max) throw new AcrineoError("El presupuesto de Neodata es demasiado grande ($k: más de $max renglones).", 422);
    }
    if (!$in['conceptos'] && !$in['partidas']) throw new AcrineoError('El archivo de Neodata no trae partidas ni conceptos.', 422);

    $g = is_array($in['generales'] ?? null) ? $in['generales'] : [];
    $nombre = acrineoNeoTexto($in['nombre'] ?? '', 150);
    if ($nombre === '') throw new AcrineoError('El archivo de Neodata no trae el nombre de la obra.', 422);
    $descripcion = acrineoNeoTexto($in['descripcion'] ?? '', 4000) ?: $nombre;
    $archivo = acrineoNeoTexto($in['archivo'] ?? '', 200);

    // ---- 1. El presupuesto (con el detalle que trae Neodata; si algún dato opcional no pasa, solo con lo básico) ----
    $cp = acrineoNeoTexto($g['codigo_postal'] ?? '', 10);
    $dias = (int) acrineoNeoNumero($g['dias'] ?? 0);
    $dec = is_array($in['decimales'] ?? null) ? $in['decimales'] : [];
    $iva = acrineoNeoNumero($in['iva'] ?? 16);
    if ($iva > 0 && $iva < 1) $iva *= 100;   // Neodata lo guarda como fracción (0.16)
    $completo = [
        'presupuesto' => array_filter([
            'nombre' => $nombre, 'descripcion' => $descripcion,
            'direccion' => acrineoNeoTexto($g['direccion'] ?? '', 250), 'colonia' => acrineoNeoTexto($g['colonia'] ?? '', 120),
            'codigo_postal' => preg_match('/^[0-9A-Za-z -]{3,10}$/', $cp) ? $cp : '', 'estado' => acrineoNeoTexto($g['estado'] ?? '', 60),
            'observaciones' => trim(acrineoNeoTexto($g['observaciones'] ?? '', 3800) . "\n\nImportado de Neodata" . ($archivo !== '' ? " ($archivo)" : '') . ' el ' . date('d/m/Y H:i') . '.'),
        ], fn($v) => $v !== ''),
        'licitacion' => array_filter([
            'numero_licitacion' => acrineoNeoTexto($g['numero_licitacion'] ?? '', 60), 'lugar_celebracion' => acrineoNeoTexto($g['lugar_celebracion'] ?? '', 200),
            'numero_convocatoria' => acrineoNeoTexto($g['numero_convocatoria'] ?? '', 60),
            'fecha_licitacion' => acrineoNeoFecha($g['fecha_licitacion'] ?? null), 'fecha_publicacion' => acrineoNeoFecha($g['fecha_publicacion'] ?? null),
            'fecha_inicio' => acrineoNeoFecha($g['fecha_inicio'] ?? null), 'dias' => $dias >= 1 && $dias <= 36500 ? $dias : null,
        ], fn($v) => $v !== null && $v !== ''),
        'calculo' => [
            'iva' => $iva >= 0 && $iva <= 100 ? round($iva, 2) : 16,
            'decimales_costos' => max(0, min(6, (int) ($dec['costos'] ?? 2))),
            'decimales_cantidades' => max(0, min(6, (int) ($dec['cantidades'] ?? 4))),
            'decimales_explosion' => max(0, min(8, (int) ($dec['explosion'] ?? 8))),
        ],
    ];
    try {
        $p = acrineoGuardar(null, $completo, $usuario);
    } catch (AcrineoError $e) {
        if ($e->http !== 422) throw $e;
        $p = acrineoGuardar(null, ['presupuesto' => ['nombre' => $nombre, 'descripcion' => $descripcion, 'observaciones' => $completo['presupuesto']['observaciones']]], $usuario);
    }
    $id = (int) $p['meta']['id'];

    try {
        $resumen = acrineoTransaccion(fn() => acrineoNeodataContenido(acrineoHojaContexto($id), $in, $usuario, $archivo));
    } catch (Throwable $e) {
        try { acrineoEliminar([$id], $usuario); } catch (Throwable $e2) { /* ya no existe */ }
        throw $e;
    }
    if (acrineoNeodataOrigenDisponible()) {
        bd_ejecutar('AW', 'update acrineo_presupuestos set neodata_obra = ?, neodata_fecha = ?, neodata_archivo = ? where presupuesto_id = ?',
            [acrineoNeoTexto($in['obra'] ?? '', 150) ?: $nombre, acrineoNeoFechaHora($in['version_fecha'] ?? null), $archivo !== '' ? mb_substr($archivo, 0, 250) : null, $id]);
    }
    $fila = bd_fila('AW', 'select codigo, nombre, costo_directo, precio_venta, sobrecosto_pct from acrineo_presupuestos where presupuesto_id = ?', [$id]);
    return ['id' => $id, 'codigo' => $fila['codigo'], 'nombre' => $fila['nombre'], 'costo_directo' => (float) $fila['costo_directo'],
            'precio_venta' => (float) $fila['precio_venta'], 'sobrecosto_pct' => (float) $fila['sobrecosto_pct']] + $resumen;
}

// Partidas, conceptos, renglones y matrices del presupuesto recién creado (dentro de la transacción)
function acrineoNeodataContenido(array $ctx, array $in, string $usuario, string $archivo): array
{
    $dc = (int) $ctx['dec_costos'];
    $dq = (int) $ctx['dec_cantidades'];

    // Catálogo general y matrices por código (sin distinguir mayúsculas)
    $cat = [];
    foreach ($in['catalogo'] ?? [] as $c) {
        if (!is_array($c)) continue;
        $cod = acrineoNeoTexto($c['codigo'] ?? '');
        if ($cod !== '') $cat[mb_strtoupper($cod)] = $c;
    }
    $mat = [];
    foreach ($in['matrices'] ?? [] as $m) {
        if (!is_array($m)) continue;
        $cm = mb_strtoupper(acrineoNeoTexto($m['m'] ?? ''));
        if ($cm !== '' && acrineoNeoTexto($m['i'] ?? '') !== '') $mat[$cm][] = $m;
    }
    foreach ($mat as &$filas) usort($filas, fn($a, $b) => acrineoNeoNumero($a['renglon'] ?? 0) <=> acrineoNeoNumero($b['renglon'] ?? 0));
    unset($filas);

    // ---- Partidas: árbol por WBS (PadreWbs → PartidaWbs) ----
    $porWbs = [];
    $porCodigo = [];
    $usados = [];
    $ordenHijos = [];
    $pendientes = array_values(array_filter($in['partidas'] ?? [], 'is_array'));
    usort($pendientes, fn($a, $b) => acrineoNeoNumero($a['renglon'] ?? 0) <=> acrineoNeoNumero($b['renglon'] ?? 0));
    $crearPartida = function (?int $padre, string $codigo, string $desc) use ($ctx, &$usados, &$ordenHijos): int {
        $base = mb_substr($codigo !== '' ? $codigo : 'P', 0, 30);
        $cod = $base;
        for ($n = 2; isset($usados[mb_strtoupper($cod)]); $n++) $cod = mb_substr($base, 0, 30 - strlen("-$n")) . "-$n";
        $usados[mb_strtoupper($cod)] = true;
        $k = $padre ?? 0;
        $ordenHijos[$k] = ($ordenHijos[$k] ?? -1) + 1;
        return bd_insertar('AW', 'acrineo_partidas', 'partida_id', ['presupuesto_id' => $ctx['id'], 'padre_id' => $padre, 'codigo' => $cod,
            'descripcion' => $desc !== '' ? $desc : $cod, 'orden' => $ordenHijos[$k]]);
    };
    for ($vuelta = 0; $pendientes && $vuelta < 50; $vuelta++) {
        $quedan = [];
        foreach ($pendientes as $p) {
            $wbs = acrineoNeoTexto($p['wbs'] ?? '');
            $padreWbs = acrineoNeoTexto($p['padre_wbs'] ?? '');
            if ($padreWbs !== '' && !isset($porWbs[$padreWbs]) && $vuelta < 49) { $quedan[] = $p; continue; }
            $codigo = acrineoNeoTexto($p['codigo'] ?? '', 30) ?: $wbs;
            $desc = acrineoNeoTexto($p['descripcion_larga'] ?? '', 4000) ?: acrineoNeoTexto($p['descripcion'] ?? '', 4000);
            $id = $crearPartida($padreWbs !== '' ? ($porWbs[$padreWbs] ?? null) : null, $codigo, $desc);
            if ($wbs !== '') $porWbs[$wbs] = $id;
            if ($codigo !== '' && !isset($porCodigo[mb_strtoupper($codigo)])) $porCodigo[mb_strtoupper($codigo)] = $id;
        }
        $pendientes = $quedan;
    }

    // ---- Matrices: un nivel (y sus submatrices) ----
    $nMatriz = 0;
    $avisos = [];
    $insertarNivel = function (int $conceptoId, ?int $padreId, string $codigoM, array $pila) use (&$insertarNivel, $cat, $mat, $dc, &$nMatriz, &$avisos): float {
        $filas = [];
        $ids = [];
        $sumaNeo = [];   // importe por tipo de Neodata (1, 2, 3…) de los renglones normales, para los % de otra base
        $porcentajes = [];
        foreach ($mat[mb_strtoupper($codigoM)] ?? [] as $n => $m) {
            $ci = acrineoNeoTexto($m['i'] ?? '');
            $ins = $cat[mb_strtoupper($ci)] ?? [];
            $tipoNeo = (int) acrineoNeoNumero($ins['tipo'] ?? 0);
            $tipo = ACRINEO_NEODATA_TIPOS[$tipoNeo] ?? 'OTR';
            $q = acrineoNeoNumero($m['cantidad'] ?? 0);
            $divide = trim((string) ($m['op'] ?? '*')) === '/';
            $desc = acrineoNeoTexto($ins['descripcion_completa'] ?? '', 250) ?: acrineoNeoTexto($ins['descripcion'] ?? '', 250) ?: mb_substr($ci, 0, 250);
            $f = ['tipo' => $tipo, 'codigo' => mb_substr($ci, 0, 30), 'descripcion' => $desc, 'unidad' => acrineoNeoTexto($ins['unidad'] ?? '', 20) ?: null,
                  'base' => null, 'cantidad' => max(0.0, $divide ? ($q ? round(1 / $q, 6) : 0.0) : round($q, 6)), 'desperdicio_pct' => 0.0,
                  'costo' => max(0.0, round(acrineoNeoNumero($ins['costo'] ?? 0), 6)), 'insumo_id' => null];
            $tieneMatriz = isset($mat[mb_strtoupper($ci)]);
            $esPct = !$tieneMatriz && acrineoNeoNumero($ins['pct'] ?? 0) != 0;
            $id = bd_insertar('AW', 'acrineo_matriz', 'matriz_id', ['concepto_id' => $conceptoId, 'orden' => $n] + ($padreId ? ['padre_id' => $padreId] : []) + $f);
            $nMatriz++;
            if ($tieneMatriz) {
                if (count($pila) >= ACRINEO_NEODATA_PROFUNDIDAD || in_array(mb_strtoupper($ci), $pila, true)) {
                    $avisos[] = "La matriz de $ci se repite dentro de sí misma; se tomó su costo del catálogo.";
                } else {
                    $f['costo'] = $insertarNivel($conceptoId, $id, $ci, array_merge($pila, [mb_strtoupper($ci)]));
                    bd_ejecutar('AW', 'update acrineo_matriz set costo = ? where matriz_id = ?', [$f['costo'], $id]);
                }
            }
            if ($esPct) {
                $porcentajes[] = [count($filas), (int) acrineoNeoNumero($ins['tipo_pct'] ?? 0), $q];
            } else {
                $imp = round(($divide ? ($q ? $f['costo'] / $q : 0) : $f['costo'] * $q), $dc);
                $sumaNeo[$tipoNeo] = ($sumaNeo[$tipoNeo] ?? 0) + $imp;
            }
            $filas[] = $f;
            $ids[] = $id;
        }
        // Sin «Tipo %» (lo exportado directo de la base de Neodata no lo trae): se deduce con el costo que Neodata guardó
        // para esta matriz, probando sobre qué tipo (mano de obra, materiales…) da ese costo.
        $desconocidos = array_keys(array_filter($porcentajes, fn($p) => $p[1] <= 0));
        if ($desconocidos) {
            $conocido = acrineoNeoNumero($cat[mb_strtoupper($codigoM)]['costo'] ?? 0);
            $tipos = array_values(array_unique(array_merge([2, 1, 3, 4, 5], array_keys($sumaNeo))));
            $mejor = array_fill(0, count($desconocidos), 2);
            if ($conocido > 0 && count($desconocidos) <= 3) {
                $normal = array_sum($sumaNeo);
                $fijos = 0.0;
                foreach ($porcentajes as $k => $p) if ($p[1] > 0) $fijos += round($p[2] * ($sumaNeo[$p[1]] ?? 0), $dc);
                $menor = null;
                $combo = array_fill(0, count($desconocidos), 0);
                while (true) {
                    $tot = $normal + $fijos;
                    foreach ($desconocidos as $j => $k) $tot += round($porcentajes[$k][2] * ($sumaNeo[$tipos[$combo[$j]]] ?? 0), $dc);
                    $dif = abs($tot - $conocido);
                    if ($menor === null || $dif < $menor - 0.000001) { $menor = $dif; $mejor = array_map(fn($c) => $tipos[$c], $combo); }
                    $j = 0;
                    while ($j < count($combo) && ++$combo[$j] >= count($tipos)) { $combo[$j] = 0; $j++; }
                    if ($j >= count($combo)) break;
                }
            }
            foreach ($desconocidos as $j => $k) $porcentajes[$k][1] = $mejor[$j];
        }
        foreach ($porcentajes as [$i, $tipoPct, $q]) {
            if ($tipoPct === 1 || $tipoPct === 2) {
                $filas[$i]['base'] = $tipoPct === 2 ? 'pct_mo' : 'pct_mat';
                $filas[$i]['cantidad'] = round($q * 100, 6);
                $filas[$i]['costo'] = 0.0;
                bd_ejecutar('AW', 'update acrineo_matriz set base = ?, cantidad = ?, costo = 0 where matriz_id = ?', [$filas[$i]['base'], $filas[$i]['cantidad'], $ids[$i]]);
            } else {
                $filas[$i]['costo'] = round($sumaNeo[$tipoPct] ?? 0, 6);
                bd_ejecutar('AW', 'update acrineo_matriz set costo = ? where matriz_id = ?', [$filas[$i]['costo'], $ids[$i]]);
            }
        }
        return acrineoCalcularMatriz($filas, $dc)['total'];
    };

    // ---- Conceptos y renglones ----
    $conceptos = [];   // CODIGO => concepto_id
    $renglones = [];   // "partida|concepto" => renglon_id
    $ordenRen = [];
    $sinPartida = null;
    $nConceptos = $nRenglones = 0;
    $lista = array_values(array_filter($in['conceptos'] ?? [], 'is_array'));
    usort($lista, fn($a, $b) => acrineoNeoNumero($a['renglon'] ?? 0) <=> acrineoNeoNumero($b['renglon'] ?? 0));
    foreach ($lista as $c) {
        $codigo = acrineoNeoTexto($c['codigo'] ?? '', 30);
        if ($codigo === '') continue;
        $wbs = acrineoNeoTexto($c['wbs'] ?? '');
        $pid = $porWbs[$wbs] ?? $porCodigo[mb_strtoupper(acrineoNeoTexto($c['partida'] ?? ''))] ?? null;
        if (!$pid) $pid = $sinPartida ??= $crearPartida(null, 'SIN PARTIDA', 'Conceptos sin partida (Neodata)');
        $K = mb_strtoupper($codigo);
        if (!isset($conceptos[$K])) {
            $ins = $cat[$K] ?? [];
            $desc = acrineoNeoTexto($ins['descripcion_completa'] ?? '', 4000) ?: acrineoNeoTexto($ins['descripcion'] ?? '', 4000) ?: $codigo;
            $tipo = (int) acrineoNeoNumero($ins['tipo'] ?? 4);
            $cid = bd_insertar('AW', 'acrineo_conceptos', 'concepto_id', ['presupuesto_id' => $ctx['id'], 'codigo' => $codigo, 'descripcion' => $desc,
                'unidad' => acrineoNeoTexto($ins['unidad'] ?? '', 20) ?: null, 'costo' => 0, 'tipo' => $tipo > 0 && $tipo < 1000 ? $tipo : 4]);
            if (isset($mat[$K])) {
                $costo = $insertarNivel($cid, null, $codigo, [$K]);
                bd_ejecutar('AW', "update acrineo_conceptos set costo = ?, costo_origen = 'matriz' where concepto_id = ?", [$costo, $cid]);
            } else {
                $costo = acrineoNeoNumero($ins['costo'] ?? 0) ?: acrineoNeoNumero($c['costo'] ?? 0);
                bd_ejecutar('AW', 'update acrineo_conceptos set costo = ? where concepto_id = ?', [max(0.0, round($costo, 6)), $cid]);
            }
            $conceptos[$K] = $cid;
            $nConceptos++;
        }
        $cid = $conceptos[$K];
        $cant = max(0.0, round(acrineoNeoNumero($c['cantidad'] ?? 0), $dq));
        $llave = "$pid|$cid";
        if (isset($renglones[$llave])) {
            bd_ejecutar('AW', 'update acrineo_partida_conceptos set cantidad = cantidad + ? where renglon_id = ?', [$cant, $renglones[$llave]]);
            continue;
        }
        $ordenRen[$pid] = ($ordenRen[$pid] ?? -1) + 1;
        $renglones[$llave] = bd_insertar('AW', 'acrineo_partida_conceptos', 'renglon_id', ['partida_id' => $pid, 'concepto_id' => $cid, 'cantidad' => $cant, 'orden' => $ordenRen[$pid]]);
        $nRenglones++;
    }

    // ---- % de sobrecosto: el que da Neodata (precio ÷ costo del presupuesto) ----
    $sobrecosto = null;
    $s = acrineoNeoNumero($in['sobrecosto_pct'] ?? '');
    if (isset($in['sobrecosto_pct']) && $in['sobrecosto_pct'] !== '' && $in['sobrecosto_pct'] !== null && $s > -99.9999 && $s <= 1000) {
        $sobrecosto = round($s, 4);
        bd_ejecutar('AW', 'update acrineo_presupuestos set sobrecosto_pct = ? where presupuesto_id = ?', [$sobrecosto, $ctx['id']]);
    }
    acrineoActualizarTotales($ctx['id']);
    $resumen = ['partidas' => count($usados), 'conceptos' => $nConceptos, 'renglones' => $nRenglones, 'insumos_matriz' => $nMatriz, 'avisos' => array_values(array_unique($avisos))];
    acrineoRegistrar($ctx['id'], $usuario, 'HOJA', [['Importado de Neodata', null, ($archivo !== '' ? "$archivo: " : '')
        . "{$resumen['partidas']} partida(s), {$resumen['conceptos']} concepto(s), {$resumen['renglones']} renglón(es), {$resumen['insumos_matriz']} insumo(s) en matrices"
        . ($sobrecosto !== null ? ", sobrecosto $sobrecosto %" : '')]]);
    return $resumen;
}
