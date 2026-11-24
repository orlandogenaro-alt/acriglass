<?php
// ACRINEO · Consulta «Presupuesto completo» (F4), como en Neodata: todos los conceptos del presupuesto en orden (el de las
// partidas y dentro de cada una el de sus renglones), sin el árbol. Ahí se cambian rápido la cantidad y el costo
// (el costo solo si no sale de su matriz); la marca (M) es la del catálogo de conceptos, del lado del navegador.
require_once __DIR__ . '/calculo.php';

function acrineoPresupuestoCompleto(array $ctx): array
{
    $partidas = acrineoPartidas($ctx);
    $porPartida = [];
    foreach (acrineoRenglonesDe($ctx, 'p.presupuesto_id = ?', [$ctx['id']]) as $r) $porPartida[$r['partida_id']][] = $r;
    // N: niveles de análisis de la matriz de cada concepto (0 = sin matriz)
    $matrices = acrineoCalculoMatrices($ctx);
    $prof = function (array $niveles, int $padre) use (&$prof): int {
        if (!isset($niveles[$padre])) return 0;
        $max = 0;
        foreach ($niveles[$padre] as $f) $max = max($max, $prof($niveles, $f['matriz_id']));
        return 1 + $max;
    };
    $filas = [];
    foreach ($partidas as $p) {
        foreach ($porPartida[$p['id']] ?? [] as $n => $r) {
            $r['partida_codigo'] = $p['codigo'];
            $r['partida_wbs'] = $p['wbs'] ?? null;
            $r['partida_descripcion'] = $p['descripcion'];
            $r['renglon'] = $n + 1;
            $r['n'] = isset($matrices[$r['concepto_id']]) ? $prof($matrices[$r['concepto_id']], 0) : 0;
            $filas[] = $r;
        }
    }
    return ['renglones' => $filas];
}

// Cambio rápido desde el Presupuesto completo: la cantidad del renglón y/o el costo del concepto
function acrineoRenglonCambiar(array $ctx, int $renglonId, array $in, string $usuario): void
{
    $r = bd_fila('AW', 'select r.renglon_id, r.partida_id, r.cantidad, c.concepto_id, c.codigo, c.costo, c.costo_origen
                          from acrineo_partida_conceptos r join acrineo_partidas p on p.partida_id = r.partida_id
                          join acrineo_conceptos c on c.concepto_id = r.concepto_id
                         where r.renglon_id = ? and p.presupuesto_id = ?', [$renglonId, $ctx['id']]);
    if (!$r) throw new AcrineoError('El renglón ya no existe; vuelve a cargar.', 404);
    $cambios = [];
    acrineoTransaccion(function () use ($ctx, $r, $in, &$cambios, $usuario) {
        if (array_key_exists('cantidad', $in)) {
            [$v, $e] = acrineoValor($in['cantidad'], ACRINEO_CAMPO_CANTIDAD);
            if ($e) throw new AcrineoError("Cantidad: $e", 422, ['cantidad' => $e]);
            $v = round($v, $ctx['dec_cantidades']);
            bd_ejecutar('AW', 'update acrineo_partida_conceptos set cantidad = ? where renglon_id = ?', [$v, $r['renglon_id']]);
            $cambios[] = ["{$r['codigo']} · cantidad", (string) (float) $r['cantidad'], (string) $v];
        }
        if (array_key_exists('costo', $in)) {
            if ($r['costo_origen'] === 'matriz') throw new AcrineoError("El costo de {$r['codigo']} sale de su matriz; cámbialo en la matriz.", 422, ['costo' => 'Sale de su matriz.']);
            [$v, $e] = acrineoValor($in['costo'], ACRINEO_CAMPO_COSTO);
            if ($e) throw new AcrineoError("Costo: $e", 422, ['costo' => $e]);
            bd_ejecutar('AW', 'update acrineo_conceptos set costo = ?, updated_at = now() where concepto_id = ?', [$v, $r['concepto_id']]);
            $cambios[] = ["{$r['codigo']} · costo", (string) (float) $r['costo'], (string) $v];
        }
        if ($cambios) {
            acrineoRegistrar($ctx['id'], $usuario, 'HOJA', array_map(fn($c) => ['Presupuesto completo · ' . $c[0], $c[1], $c[2]], $cambios));
            acrineoActualizarTotales($ctx['id']);
        }
    });
}
