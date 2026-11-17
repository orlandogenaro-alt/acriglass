<?php
// ACRINEO · «Pegado especial» (botón de portapapeles de las partidas), como en Neodata: partidas y conceptos copiados de
// Excel. js/acrineo/hoja-pegado.js lee las celdas y manda:
//   partidas:  [{codigo, descripcion}]                       (renglones con Partida y sin Código)
//   conceptos: [{partida, codigo, descripcion, unidad, cantidad, costo?}]
// Reglas:
//   - Una partida que ya existe (mismo código) se usa tal cual; una nueva cuelga de la partida cuyo código es el suyo
//     hasta el último separador del presupuesto («A.01.02» → «A.01»; Detalle › Otros, «.» si no hay); si no, va a la raíz.
//   - Un concepto que ya está en el catálogo del presupuesto (mismo código) se reutiliza y se actualizan su descripción y
//     unidad (y su costo, si viene y no sale de su matriz); si ya está en esa partida se reemplaza su cantidad.
//   - Todo o nada: si algún renglón no es válido no se guarda nada y se dice cuál.
require_once __DIR__ . '/hoja.php';

const ACRINEO_PEGADO_MAX = 3000;

function acrineoSeparadorPartidas(int $presupuestoId): string
{
    if (!bd_tiene_tabla('AW', 'acrineo_presupuesto_configuracion')) return '.';
    $s = (string) bd_valor('AW', 'select separador_partidas from acrineo_presupuesto_configuracion where presupuesto_id = ?', [$presupuestoId]);
    return trim($s) === '' ? '.' : trim($s);
}

function acrineoPegadoEspecial(array $ctx, array $partidas, array $conceptos, ?int $partidaDefecto, string $usuario): array
{
    if (count($partidas) + count($conceptos) > ACRINEO_PEGADO_MAX) throw new AcrineoError('Se pueden pegar hasta ' . ACRINEO_PEGADO_MAX . ' renglones a la vez.', 422);
    if (!$partidas && !$conceptos) throw new AcrineoError('No hay renglones que pegar.', 422);
    $errores = [];

    // Partidas del archivo (en su orden)
    $pp = [];
    foreach (array_values($partidas) as $n => $p) {
        [$cod, $e] = acrineoValor(is_array($p) ? ($p['codigo'] ?? null) : null, ACRINEO_CAMPO_CODIGO);
        if ($e) { $errores["partidas.$n.codigo"] = "Partida del renglón " . ($n + 1) . ": $e"; continue; }
        $desc = trim((string) ($p['descripcion'] ?? ''));
        [$desc, $e] = acrineoValor($desc === '' ? $cod : $desc, ACRINEO_CAMPO_DESC);
        if ($e) { $errores["partidas.$n.descripcion"] = "Partida $cod: $e"; continue; }
        $pp[mb_strtoupper($cod)] = ['codigo' => $cod, 'descripcion' => $desc];
    }
    // Conceptos
    $cc = [];
    foreach (array_values($conceptos) as $n => $c) {
        if (!is_array($c)) { $errores["conceptos.$n"] = 'Renglón no válido.'; continue; }
        $l = ['partida' => trim((string) ($c['partida'] ?? ''))];
        foreach (['codigo' => ACRINEO_CAMPO_CODIGO, 'unidad' => ACRINEO_CAMPO_UNIDAD, 'cantidad' => ACRINEO_CAMPO_CANTIDAD] as $k => $def) {
            [$v, $e] = acrineoValor($c[$k] ?? null, $def);
            if ($e) $errores["conceptos.$n.$k"] = 'Concepto ' . ($c['codigo'] ?? ('del renglón ' . ($n + 1))) . " · $k: $e";
            $l[$k] = $v;
        }
        $l['descripcion'] = trim((string) ($c['descripcion'] ?? ''));
        if (mb_strlen($l['descripcion']) > 4000) $errores["conceptos.$n.descripcion"] = "Concepto {$l['codigo']}: descripción de más de 4000 caracteres.";
        $l['costo'] = null;
        if (trim((string) ($c['costo'] ?? '')) !== '') {
            [$l['costo'], $e] = acrineoValor($c['costo'], ACRINEO_CAMPO_COSTO);
            if ($e) $errores["conceptos.$n.costo"] = "Concepto {$l['codigo']} · costo: $e";
        }
        if ($l['cantidad'] !== null) $l['cantidad'] = round($l['cantidad'], $ctx['dec_cantidades']);
        $cc[$n] = $l;
    }
    if ($errores) throw new AcrineoError('Revisa los renglones pegados: ' . reset($errores), 422, $errores);

    return acrineoTransaccion(function () use ($ctx, $pp, $cc, $partidaDefecto, $usuario) {
        $sep = acrineoSeparadorPartidas($ctx['id']);
        $existentes = [];
        foreach (bd_filas('AW', 'select partida_id, codigo from acrineo_partidas where presupuesto_id = ?', [$ctx['id']]) as $r) $existentes[mb_strtoupper($r['codigo'])] = (int) $r['partida_id'];
        $resumen = ['partidas' => 0, 'conceptos_nuevos' => 0, 'agregados' => 0, 'actualizados' => 0];

        // Crea una partida (y la busca/crea por código); padre = código hasta el último separador que exista
        $crear = function (string $codigo, string $desc) use (&$existentes, $ctx, $sep, &$resumen): int {
            $k = mb_strtoupper($codigo);
            if (isset($existentes[$k])) return $existentes[$k];
            $padre = null;
            for ($pref = $codigo; ($pos = mb_strrpos($pref, $sep)) !== false;) {
                $pref = mb_substr($pref, 0, $pos);
                if (isset($existentes[mb_strtoupper($pref)])) { $padre = $existentes[mb_strtoupper($pref)]; break; }
            }
            $orden = (int) bd_valor('AW', 'select coalesce(max(orden), -1) + 1 from acrineo_partidas where presupuesto_id = ? and '
                . ($padre ? 'padre_id = ?' : 'padre_id is null'), $padre ? [$ctx['id'], $padre] : [$ctx['id']]);
            $id = bd_insertar('AW', 'acrineo_partidas', 'partida_id', ['presupuesto_id' => $ctx['id'], 'padre_id' => $padre, 'codigo' => $codigo, 'descripcion' => $desc, 'orden' => $orden]);
            $existentes[$k] = $id;
            $resumen['partidas']++;
            return $id;
        };
        foreach ($pp as $p) $crear($p['codigo'], $p['descripcion']);

        $errores = [];
        foreach ($cc as $n => $l) {
            if ($l['partida'] !== '') {
                $pid = $existentes[mb_strtoupper($l['partida'])] ?? $crear($l['partida'], $l['partida']);
            } elseif ($partidaDefecto) {
                $pid = $partidaDefecto;
                acrineoPartidaFila($ctx, $pid);
            } else { $errores["conceptos.$n.partida"] = "Concepto {$l['codigo']}: no trae partida y no hay partida seleccionada."; continue; }

            $c = bd_fila('AW', 'select concepto_id, costo_origen from acrineo_conceptos where presupuesto_id = ? and upper(codigo) = ?', [$ctx['id'], mb_strtoupper($l['codigo'])]);
            if ($c) {
                $cid = (int) $c['concepto_id'];
                $sets = ['updated_at = now()'];
                $vals = [];
                if ($l['descripcion'] !== '') { $sets[] = 'descripcion = ?'; $vals[] = $l['descripcion']; }
                if ($l['unidad'] !== null) { $sets[] = 'unidad = ?'; $vals[] = $l['unidad']; }
                if ($l['costo'] !== null && $c['costo_origen'] !== 'matriz') { $sets[] = 'costo = ?'; $vals[] = $l['costo']; }
                bd_ejecutar('AW', 'update acrineo_conceptos set ' . implode(', ', $sets) . ' where concepto_id = ?', array_merge($vals, [$cid]));
            } else {
                if ($l['descripcion'] === '') { $errores["conceptos.$n.descripcion"] = "Concepto {$l['codigo']}: falta la descripción."; continue; }
                $cid = bd_insertar('AW', 'acrineo_conceptos', 'concepto_id', ['presupuesto_id' => $ctx['id'], 'codigo' => $l['codigo'],
                    'descripcion' => $l['descripcion'], 'unidad' => $l['unidad'], 'costo' => $l['costo'] ?? 0]);
                $resumen['conceptos_nuevos']++;
            }
            $n2 = bd_ejecutar('AW', 'update acrineo_partida_conceptos set cantidad = ? where partida_id = ? and concepto_id = ?', [$l['cantidad'] ?? 0, $pid, $cid]);
            if ($n2) { $resumen['actualizados']++; continue; }
            $orden = (int) bd_valor('AW', 'select coalesce(max(orden), -1) + 1 from acrineo_partida_conceptos where partida_id = ?', [$pid]);
            bd_insertar('AW', 'acrineo_partida_conceptos', 'renglon_id', ['partida_id' => $pid, 'concepto_id' => $cid, 'cantidad' => $l['cantidad'] ?? 0, 'orden' => $orden]);
            $resumen['agregados']++;
        }
        if ($errores) throw new AcrineoError('Revisa los renglones pegados: ' . reset($errores), 422, $errores);
        acrineoRegistrar($ctx['id'], $usuario, 'HOJA', [['Pegado especial', null,
            "{$resumen['partidas']} partida(s) nuevas, {$resumen['conceptos_nuevos']} concepto(s) nuevos, {$resumen['agregados']} renglón(es) agregados, {$resumen['actualizados']} actualizados"]]);
        acrineoActualizarTotales($ctx['id']);
        $resumen['primera'] = $pp ? $existentes[array_key_first($pp)] : null;
        return $resumen;
    });
}
