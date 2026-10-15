<?php
// Parámetros del presupuesto (includes/parametros-presupuesto.php): reglas que no tocan la base
require_once __DIR__ . '/lib.php';
putenv('DB_HOST');
require_once __DIR__ . '/../includes/parametros-presupuesto.php';
require_once __DIR__ . '/../includes/calculo.php';

echo "Parámetros del presupuesto\n";

prueba('las tasas por omisión son 16 %, frontera 8 % y exento; 16 % es la de un presupuesto nuevo', function () {
    $p = parametrosPresupuestoDefecto();
    igual([16, 8, 0], array_map(fn($t) => $t['pct'], $p['iva_tasas']));
    igual(16, $p['iva_defecto']);
});

prueba('solo se acepta una tasa de IVA configurada', function () {
    $p = parametrosPresupuestoDefecto();
    verificar(parametrosIvaValida(8, $p));
    verificar(parametrosIvaValida(0, $p));
    verificar(!parametrosIvaValida(10, $p));
});

prueba('IVA frontera: 8 % de 1,250.00 = 100.00; exento = 0.00', function () {
    igual(100.0, calculoIva(1250, 0.08));
    igual(0.0, calculoIva(1250, 0));
});

prueba('indirectos: según el modo se activan uno o dos conceptos, con su %', function () {
    $p = parametrosPresupuestoDefecto();
    igual([], parametrosIndirectosActivos($p));
    $p['indirectos_modo'] = 'unico';
    $p['indirecto_pct'] = 12.5;
    igual(['INDIRECTOS' => 12.5], parametrosIndirectosActivos($p));
    $p['indirectos_modo'] = 'oficina_campo';
    $p['indirecto_oficina_pct'] = 8;
    $p['indirecto_campo_pct'] = 4.5;
    igual(['INDIRECTOS DE OFICINA' => 8.0, 'INDIRECTOS DE CAMPO' => 4.5], parametrosIndirectosActivos($p));
});
