<?php
// Fórmulas del presupuesto (includes/calculo.php). Los esperados están calculados a mano.
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/../includes/calculo.php';

echo "Cálculo del presupuesto\n";

prueba('utilidad sobre el costo: 20 % de 1,000 = 1,200', function () {
    igual(1200.0, calculoSubtotal(1000, 20, 'costo'));
});

prueba('utilidad de margen (Form46): 20 % de 1,000 = 1,250', function () {
    igual(1250.0, calculoSubtotal(1000, 20, 'margen'));
});

prueba('40 %: sobre el costo ×1.40 contra margen ×1.6667', function () {
    igual(140000.0, calculoSubtotal(100000, 40, 'costo'));
    igual(166666.67, calculoSubtotal(100000, 40, 'margen'));
});

prueba('utilidad 0 % deja el costo', function () {
    igual(5321.17, calculoSubtotal(5321.17, 0, 'costo'));
    igual(5321.17, calculoSubtotal(5321.17, 0, 'margen'));
});

prueba('margen de 100 % o más no es válido; sobre el costo admite hasta 1000 %', function () {
    verificar(calculoUtilidadValida(99.99, 'margen'));
    verificar(!calculoUtilidadValida(100, 'margen'));
    verificar(calculoUtilidadValida(1000, 'costo'));
    verificar(!calculoUtilidadValida(1000.01, 'costo'));
    verificar(!calculoUtilidadValida(-1, 'costo'));
});

prueba('IVA 16 % de 1,250.00 = 200.00 y total 1,450.00', function () {
    $iva = calculoIva(1250);
    igual(200.0, $iva);
    igual(1450.0, round(1250 + $iva, 2));
});

prueba('IVA redondea a centavos: 16 % de 10.03 = 1.6048 → 1.60; de 0.0313 = 0.005008 → 0.01', function () {
    igual(1.60, calculoIva(10.03));
    igual(0.08, calculoIva(0.5));          // 0.08 exacto
    igual(0.01, calculoIva(0.0313));       // 0.005008 → 0.01
});

prueba('comisión: 3.5 % de 166,666.67 = 5,833.33', function () {
    igual(5833.33, calculoComision(166666.67, 3.5));
});

prueba('anexo de seguro: 1,250,000 × 10 % × 5 % = 6,250.00', function () {
    igual(6250.0, calculoSeguro(1250000, 10, 5));
});

prueba('el subtotal capturado cuadra dentro de 1 peso o 0.01 %', function () {
    verificar(calculoCuadra(1250.99, 1250));
    verificar(!calculoCuadra(1251.01, 1250));
    verificar(calculoCuadra(10000099, 10000000));    // 0.01 % de 10 millones = 1,000
    verificar(!calculoCuadra(10001001, 10000000));
});
