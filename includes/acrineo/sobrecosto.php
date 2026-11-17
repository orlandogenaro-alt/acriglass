<?php
// ACRINEO · Ventana «Factor de sobrecosto (indirectos, financiamiento y utilidad)» (Ctrl+Shift+S), como en Neodata:
// con los % de indirecto de campo, de oficina, financiamiento, utilidad y cargos adicionales se calcula el % de
// sobrecosto en cascada (acrineoSobrecostoDesglose) y se guarda como el de siempre (los precios se recalculan).
require_once __DIR__ . '/hoja.php';

const ACRINEO_SOBRECOSTO_FACTORES = ['indirecto_campo', 'indirecto_oficina', 'financiamiento', 'utilidad', 'cargos_adicionales'];
const ACRINEO_CAMPO_FACTOR_SC = ['tipo' => 'decimal', 'min' => 0, 'max' => 1000, 'decimales' => 6, 'requerido' => true];

function acrineoSobrecostoDisponible(): bool
{
    return bd_tiene_columna('AW', 'acrineo_presupuesto_calculo', 'indirecto_campo');
}

function acrineoSobrecostoFactores(array $ctx): array
{
    $f = array_fill_keys(ACRINEO_SOBRECOSTO_FACTORES, 0.0);
    if (acrineoSobrecostoDisponible()) {
        $r = bd_fila('AW', 'select ' . implode(', ', ACRINEO_SOBRECOSTO_FACTORES) . ' from acrineo_presupuesto_calculo where presupuesto_id = ?', [$ctx['id']]);
        foreach ($r ?: [] as $k => $v) $f[$k] = (float) $v;
    }
    return ['factores' => $f, 'desglose' => acrineoSobrecostoDesglose($f), 'sobrecosto_pct' => $ctx['sobrecosto_pct'], 'disponible' => acrineoSobrecostoDisponible()];
}

function acrineoSobrecostoAplicar(array $ctx, array $in, string $usuario): array
{
    if (!acrineoSobrecostoDisponible()) throw new AcrineoError('Falta aplicar la migración 032 (factores del sobrecosto).', 503);
    $f = [];
    $err = [];
    foreach (ACRINEO_SOBRECOSTO_FACTORES as $k) {
        [$v, $e] = acrineoValor($in[$k] ?? 0, ACRINEO_CAMPO_FACTOR_SC);
        if ($e) $err[$k] = $e; else $f[$k] = $v;
    }
    if ($err) throw new AcrineoError('Revisa los factores del sobrecosto.', 422, $err);
    $d = acrineoSobrecostoDesglose($f);
    if ($d['sobrecosto_pct'] > 1000) throw new AcrineoError('El sobrecosto que resulta es mayor a 1000 %.', 422, ['utilidad' => 'Revisa los porcentajes.']);
    acrineoTransaccion(function () use ($ctx, $f, $d, $usuario) {
        $cols = ACRINEO_SOBRECOSTO_FACTORES;
        bd_ejecutar('AW', 'insert into acrineo_presupuesto_calculo (presupuesto_id, ' . implode(', ', $cols) . ') values (?' . str_repeat(', ?', count($cols)) . ')
                           on conflict (presupuesto_id) do update set ' . implode(', ', array_map(fn($k) => "$k = excluded.$k", $cols)),
            array_merge([$ctx['id']], array_map(fn($k) => $f[$k], $cols)));
        acrineoRegistrar($ctx['id'], $usuario, 'MODIFICAR', [['Factores del sobrecosto', null,
            "Campo {$f['indirecto_campo']} %, oficina {$f['indirecto_oficina']} %, financiamiento {$f['financiamiento']} %, utilidad {$f['utilidad']} %, cargos {$f['cargos_adicionales']} % → {$d['sobrecosto_pct']} %"]]);
        acrineoSobrecostoGuardar($ctx, $d['sobrecosto_pct'], $usuario);
    });
    return $d;
}
