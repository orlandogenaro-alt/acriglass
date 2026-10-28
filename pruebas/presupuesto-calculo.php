<?php
// Motor de P.U. (includes/presupuesto-calculo.php) con los casos compartidos de pruebas/presupuesto-calculo.json,
// los mismos que corre pruebas/presupuesto-calculo.js contra el gemelo de la pantalla.
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/../includes/presupuesto-calculo.php';

echo "Motor de P.U. del presupuesto\n";

// Compara solo las llaves que trae el esperado (a 4 decimales)
function pcComparar(array $esperado, array $obtenido, string $ruta = ''): void
{
    foreach ($esperado as $k => $v) {
        if (!array_key_exists($k, $obtenido)) throw new RuntimeException("falta $ruta$k");
        if (is_array($v)) { pcComparar($v, (array) $obtenido[$k], "$ruta$k."); continue; }
        if (is_string($v)) {
            if ($v !== $obtenido[$k]) throw new RuntimeException("$ruta$k: se esperaba «{$v}» y se obtuvo «{$obtenido[$k]}»");
            continue;
        }
        if (abs((float) $v - (float) $obtenido[$k]) >= 0.00005 * max(1, abs((float) $v))) {
            throw new RuntimeException("$ruta$k: se esperaba $v y se obtuvo " . $obtenido[$k]);
        }
    }
}

$casos = json_decode(file_get_contents(__DIR__ . '/presupuesto-calculo.json'), true)['casos'];
foreach ($casos as $caso) {
    prueba($caso['nombre'], function () use ($caso) {
        if ($caso['tipo'] === 'sobrecosto') {
            $a = $caso['args'];
            pcComparar($caso['esperado'], pcSobrecosto((float) $a[0], (float) $a[1], (float) $a[2], (float) $a[3], $a[4], (float) $a[5]));
            return;
        }
        if ($caso['tipo'] === 'explosion') {
            pcComparar($caso['esperado'], pcExplosion($caso['analisis'], $caso['desglosar']));
            return;
        }
        if ($caso['tipo'] === 'gasto') {
            $imp = pcGastoOperacion($caso['gasto'], (float) $caso['mano_obra']);
            pcComparar($caso['esperado'], $imp === null ? ['fijo' => 1] : ['importe' => $imp]);
            return;
        }
        if ($caso['tipo'] === 'precio') {
            $a = $caso['args'];
            $s = pcSobrecosto((float) $a[0], (float) $a[1], (float) $a[2], (float) $a[3], $a[4], (float) $a[5]);
            pcComparar($caso['esperado'], pcPrecioConcepto((float) $caso['cd'], $s));
            return;
        }
        $r = pcConcepto($caso['concepto'], $caso['analisis']);
        $r['resumen'] = pcResumen($r['totales']);
        pcComparar($caso['esperado'], $r);
    });
}
