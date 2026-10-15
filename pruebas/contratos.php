<?php
// Contrato de obra y convenios (includes/contratos.php): cifras vigentes. Esperados calculados a mano.
require_once __DIR__ . '/lib.php';
putenv('DB_HOST');
require_once __DIR__ . '/../includes/contratos.php';

echo "Contrato y convenios\n";

prueba('el signo lo pone el tipo: aditiva suma, deductiva resta, plazo no mueve dinero', function () {
    igual(500.0, contratoMontoConvenio('aditiva', -500));
    igual(-300.0, contratoMontoConvenio('deductiva', 300));
    igual(0.0, contratoMontoConvenio('plazo', 999));
    igual(-120.5, contratoMontoConvenio('orden_cambio', -120.5));
});

prueba('vigente: 1,000,000 + aditiva 150,000 − deductiva 50,000 + orden −20,000 = 1,080,000 (pendientes y rechazados no cuentan)', function () {
    $contrato = ['monto' => 1000000, 'iva_pct' => 16, 'anticipo_pct' => 30, 'fondo_garantia_pct' => 5, 'retencion_pct' => 0.5, 'fecha_termino' => '2026-12-31'];
    $conv = [
        ['tipo' => 'aditiva', 'monto' => 150000, 'dias' => 10, 'estatus' => 'autorizado'],
        ['tipo' => 'deductiva', 'monto' => 50000, 'dias' => 0, 'estatus' => 'autorizado'],
        ['tipo' => 'orden_cambio', 'monto' => -20000, 'dias' => 0, 'estatus' => 'autorizado'],
        ['tipo' => 'plazo', 'monto' => 0, 'dias' => 15, 'estatus' => 'autorizado'],
        ['tipo' => 'aditiva', 'monto' => 70000, 'dias' => 5, 'estatus' => 'pendiente'],
        ['tipo' => 'aditiva', 'monto' => 999999, 'dias' => 99, 'estatus' => 'rechazado'],
    ];
    $r = contratoVigente($contrato, $conv);
    igual(1080000.0, $r['monto']);
    igual(172800.0, $r['iva']);
    igual(1252800.0, $r['total']);
    igual(324000.0, $r['anticipo']);            // 30 % del monto vigente sin IVA
    igual(25, $r['dias']);
    igual('2027-01-25', $r['fecha_termino']);    // 31-dic + 25 días
    igual(1, $r['pendientes']);
    igual(70000.0, $r['pendiente_monto']);
});

prueba('sin convenios y sin fecha de término', function () {
    $r = contratoVigente(['monto' => 250000.555, 'iva_pct' => 8, 'anticipo_pct' => 0, 'fondo_garantia_pct' => 0, 'retencion_pct' => 0, 'fecha_termino' => null], []);
    igual(250000.56, $r['monto']);
    igual(20000.04, $r['iva']);
    verificar($r['fecha_termino'] === null);
});
