<?php
// Motor de costos de insumos (includes/pu.php). Precios de ejemplo (no son precios reales de Acristala);
// los esperados están calculados a mano.
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/../includes/pu.php';

echo "Motor de costos de insumos\n";

function catalogoPrueba(): array
{
    $i = function ($clave, $tipo, $precio, $fsr = 1, $moneda = 'MXN') {
        return ['clave' => $clave, 'descripcion' => $clave, 'tipo' => $tipo, 'fsr' => $fsr, 'precio' => $precio, 'moneda' => $moneda, 'unidad' => ''];
    };
    $insumos = [
        1 => $i('VT9', 'MAT', '1250.00'),            // vidrio templado 9 mm, m2
        2 => $i('OFI', 'MO', '600', 1.6),            // oficial vidriero, jornada
        3 => $i('AYU', 'MO', '400', 1.6),            // ayudante, jornada
        4 => $i('CUAD', 'BAS', null),                // cuadrilla: 1 oficial + 1 ayudante
        5 => $i('SIL', 'MAT', '120'),                // silicón, cartucho
        6 => $i('SELLADO', 'BAS', null),             // sellado por metro: silicón + cuadrilla
        7 => $i('SINPRECIO', 'MAT', null),
        8 => $i('CONFALTA', 'BAS', null),
        9 => $i('HERRAJE', 'MAT', '10', 1, 'USD'),
        10 => $i('INST', 'BAS', null),               // básico que usa otro básico
    ];
    $componentes = [
        4 => [['insumo_id' => 2, 'cantidad' => 1], ['insumo_id' => 3, 'cantidad' => 1]],
        6 => [['insumo_id' => 5, 'cantidad' => 0.1, 'desperdicio_pct' => 10], ['insumo_id' => 4, 'cantidad' => 0.02]],
        8 => [['insumo_id' => 1, 'cantidad' => 1], ['insumo_id' => 7, 'cantidad' => 2]],
        10 => [['insumo_id' => 6, 'cantidad' => 2.5], ['insumo_id' => 9, 'cantidad' => 4]],
    ];
    return [$insumos, $componentes];
}

prueba('material: el costo es su precio vigente (1,250.00)', function () {
    [$ins, $comp] = catalogoPrueba();
    igual(1250.0, puCostoInsumo(1, $ins, $comp)['costo']);
});

prueba('mano de obra: salario 600 × FSR 1.6 = 960.00', function () {
    [$ins, $comp] = catalogoPrueba();
    igual(960.0, puCostoInsumo(2, $ins, $comp)['costo']);
});

prueba('cuadrilla (básico): 960 + 640 = 1,600.00 por jornada', function () {
    [$ins, $comp] = catalogoPrueba();
    igual(1600.0, puCostoInsumo(4, $ins, $comp)['costo']);
});

prueba('desperdicio: silicón 120 × 0.1 × 1.10 = 13.20 + cuadrilla 1,600 × 0.02 = 32.00 → 45.20', function () {
    [$ins, $comp] = catalogoPrueba();
    igual(45.2, puCostoInsumo(6, $ins, $comp)['costo']);
});

prueba('sin precio: el material y el básico que lo usa quedan pendientes, con lo que falta', function () {
    [$ins, $comp] = catalogoPrueba();
    $r = puCostoInsumo(7, $ins, $comp);
    verificar($r['costo'] === null && $r['faltan'] === ['SINPRECIO'], json_encode($r));
    $r = puCostoInsumo(8, $ins, $comp);
    verificar($r['costo'] === null && $r['faltan'] === ['SINPRECIO'], json_encode($r));
});

prueba('dólares sin tipo de cambio: pendiente; con 18.25: 10 USD = 182.50', function () {
    [$ins, $comp] = catalogoPrueba();
    $r = puCostoInsumo(9, $ins, $comp);
    verificar($r['costo'] === null && strpos($r['faltan'][0], 'tipo de cambio USD') !== false, json_encode($r));
    igual(182.5, puCostoInsumo(9, $ins, $comp, ['USD' => 18.25])['costo']);
});

prueba('básico dentro de básico: 45.20 × 2.5 + 182.50 × 4 = 843.00', function () {
    [$ins, $comp] = catalogoPrueba();
    igual(843.0, puCostoInsumo(10, $ins, $comp, ['USD' => 18.25])['costo']);
});

prueba('básico sin componentes queda pendiente', function () {
    [$ins, $comp] = catalogoPrueba();
    unset($comp[4]);
    $r = puCostoInsumo(4, $ins, $comp);
    verificar($r['costo'] === null && $r['faltan'] === ['CUAD (básico sin componentes)'], json_encode($r));
});

prueba('referencia circular: error que dice el camino', function () {
    [$ins, $comp] = catalogoPrueba();
    $comp[4][] = ['insumo_id' => 6, 'cantidad' => 1];   // la cuadrilla lleva sellado, y el sellado lleva cuadrilla
    try {
        puCostoInsumo(6, $ins, $comp);
        throw new LogicException('no detectó la referencia circular');
    } catch (RuntimeException $e) {
        verificar(strpos($e->getMessage(), 'SELLADO → CUAD → SELLADO') !== false, $e->getMessage());
    }
});

prueba('desglose del básico: importe de cada componente', function () {
    [$ins, $comp] = catalogoPrueba();
    $d = puDesglose(6, $ins, $comp);
    igual(2, count($d));
    igual(13.2, $d[0]['importe']);
    igual(32.0, $d[1]['importe']);
});
