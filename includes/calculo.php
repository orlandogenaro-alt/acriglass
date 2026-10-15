<?php
// Cálculos del presupuesto de obra, en un solo lugar para que el servidor y las pruebas
// (pruebas/calculo.php) usen exactamente las mismas fórmulas. Sin acceso a la base.
//
// Redondeo: round() de PHP a 2 decimales, mitad hacia arriba (lejos de cero), en los totales
// guardados (IVA, comisiones, seguros). El subtotal esperado no se redondea: se compara con tolerancia.

const CALCULO_IVA = 0.16;   // igual que js/presupuesto.js

// Subtotal (precio sin IVA) a partir del costo directo y la utilidad
//   'costo':  subtotal = costo × (1 + %)          20 % de 1,000 = 1,200
//   'margen': subtotal = costo / (1 − %)  (Form46) 20 % de 1,000 = 1,250
function calculoSubtotal(float $costo, float $utilidadPct, string $modo): float
{
    return $modo === 'margen' ? $costo / (1 - $utilidadPct / 100) : $costo * (1 + $utilidadPct / 100);
}

// Rango válido del % de utilidad: con margen no puede llegar a 100 % (dividiría entre cero)
function calculoUtilidadValida(float $utilidadPct, string $modo): bool
{
    return $utilidadPct >= 0 && $utilidadPct < ($modo === 'margen' ? 100 : 1000.0001);
}

// true si el subtotal capturado cuadra con el esperado (tolerancia de 1 peso o 0.01 %)
function calculoCuadra(float $subtotal, float $esperado): bool
{
    return abs($subtotal - $esperado) <= max(1, $esperado * 0.0001);
}

function calculoIva(float $subtotal, float $tasa = CALCULO_IVA): float
{
    return round($subtotal * $tasa, 2);
}

// Comisión: % del subtotal
function calculoComision(float $subtotal, float $porcentaje): float
{
    return round($subtotal * $porcentaje / 100, 2);
}

// Anexo de seguro: subtotal × %1 × %2
function calculoSeguro(float $subtotal, float $porcentaje1, float $porcentaje2): float
{
    return round($subtotal * $porcentaje1 * $porcentaje2 / 10000, 2);
}
