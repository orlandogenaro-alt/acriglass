<?php
// Catálogo del contrato y estimaciones (includes/estimaciones.php). Esperados calculados a mano.
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/../includes/estimaciones.php';

echo "Catálogo del contrato y estimaciones\n";

// Cancel (10 m2): vidrio 1,000/m2 + MO 200/m2 (FSR 1.5, herramienta 10 %) → CD 1,330/m2 = 13,300
// Puerta (2 pza): material 2,000 → CD 4,000. Instalación por importe (MO) 1,000 × 1.10 = 1,100. Total CD 18,400
function analisisPrueba(): array
{
    return ['fsr' => 1.5, 'hm' => 10, 'conceptos' => [
        ['clave' => '001', 'partida' => 'Cancelería', 'descripcion' => 'Cancel', 'unidad' => 'M2', 'cantidad' => 10, 'insumos' => [
            ['tipo' => 'MAT', 'cantidad' => 1, 'costo' => 1000], ['tipo' => 'MO', 'rinde' => 5, 'cantidad' => 0, 'costo' => 1000]]],
        ['clave' => '002', 'partida' => 'Puertas', 'descripcion' => 'Puerta', 'unidad' => 'PZA', 'cantidad' => 2, 'insumos' => [
            ['tipo' => 'MAT', 'cantidad' => 1, 'costo' => 2000]]],
    ]];
}
function renglonesPrueba(): array
{
    return [
        ['tipo' => 'MP', 'concepto' => 'MATERIALES SEGUN ANALISIS P.U.', 'presupuesto' => 14000],
        ['tipo' => 'MO', 'concepto' => 'MANO DE OBRA SEGUN ANALISIS P.U.', 'presupuesto' => 3000],
        ['tipo' => 'MO', 'concepto' => 'INSTALACION', 'presupuesto' => 1000],
        ['tipo' => 'MO', 'concepto' => 'COMISIONES', 'presupuesto' => 500],
        ['tipo' => 'GO', 'concepto' => 'INDIRECTOS', 'presupuesto' => 900],
    ];
}

prueba('catálogo: CD 18,400 y contrato de 27,600 → factor 1.5; la suma de importes da el contrato', function () {
    $r = estimacionCatalogo(analisisPrueba(), renglonesPrueba(), [], false, 27600);
    igual(18400.0, $r['cd_total']);
    igual(1.5, $r['factor'], 6);
    igual(3, count($r['conceptos']));                        // los renglones del análisis, comisiones e indirectos no entran
    igual(1995.0, $r['conceptos'][0]['pu']);                  // 1,330 × 1.5
    igual(19950.0, $r['conceptos'][0]['importe']);
    igual(3000.0, $r['conceptos'][1]['pu']);
    igual('Lote', $r['conceptos'][2]['unidad']);
    igual(1650.0, $r['conceptos'][2]['pu']);                  // 1,000 × 1.10 (herramienta) × 1.5
    igual(27600.0, $r['suma']);
    igual(0.0, $r['diferencia']);
});

prueba('catálogo: con empleados, la MO interna lleva el FSR del análisis', function () {
    $r = estimacionCatalogo(['fsr' => 2, 'hm' => 0, 'conceptos' => []],
        [['tipo' => 'MO', 'concepto' => 'MANO DE OBRA INTERNA', 'presupuesto' => 500]], [], true, 2000);
    igual(1000.0, $r['cd_total']);                            // 500 × FSR 2
    igual(2000.0, $r['conceptos'][0]['pu']);
});

prueba('estimación: 100,000 con anticipo 30 %, IVA 16 %, fondo 5 %, retención 0.5 %', function () {
    $c = ['iva_pct' => 16, 'anticipo_pct' => 30, 'fondo_garantia_pct' => 5, 'retencion_pct' => 0.5];
    $t = estimacionTotales(100000, $c, 300000);
    igual(30000.0, $t['amortizacion']);
    igual(70000.0, $t['subtotal']);
    igual(11200.0, $t['iva']);
    igual(81200.0, $t['total']);
    igual(5000.0, $t['fondo_garantia']);
    igual(500.0, $t['retencion']);
    igual(75700.0, $t['neto']);
});

prueba('la amortización no pasa de lo que falta por amortizar', function () {
    $t = estimacionTotales(100000, ['iva_pct' => 16, 'anticipo_pct' => 30, 'fondo_garantia_pct' => 0, 'retencion_pct' => 0], 12000);
    igual(12000.0, $t['amortizacion']);
    igual(88000.0, $t['subtotal']);
});

prueba('un anticipo no lleva amortización, fondo ni retención', function () {
    $t = estimacionTotales(300000, ['iva_pct' => 16, 'anticipo_pct' => 30, 'fondo_garantia_pct' => 5, 'retencion_pct' => 0.5], 0, true);
    igual(300000.0, $t['subtotal']);
    igual(348000.0, $t['neto']);
});
