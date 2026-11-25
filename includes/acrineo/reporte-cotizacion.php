<?php
// ACRINEO › formato de COTIZACIÓN (acrineo-reporte.php?tipo=presupuesto&formato=cotizacion[&partida=N]), como el PDF
// de Acristala: logo y empresa, «Datos del presupuesto» y «Datos del cliente», obra, y por concepto GRÁFICO (la imagen
// del URL del concepto) · DESCRIPCIÓN · UDS · IMPORTE (P.U.) · TOTAL; al final Suma total, Descuento, Total presupuesto
// y los términos y condiciones de la Hoja Membretada. El encabezado se repite en cada hoja y el pie lleva «Página n / m».
// Lo incluye acrineo-reporte.php con $r (reporte), $m (membrete), $lineasCond, $tipo y los formateadores ya definidos.

$partidaId = max(0, (int) ($_GET['partida'] ?? 0));
$subtitulo = $enc['descripcion'] !== '' ? $enc['descripcion'] : $enc['nombre'];
// Con ?partida=N: solo esa partida y sus subpartidas (las que siguen en el árbol con nivel mayor)
if ($partidaId) {
    $sel = [];
    $nivel = null;
    foreach ($r['partidas'] as $p) {
        if ($nivel === null) {
            if ((int) $p['id'] !== $partidaId) continue;
            $nivel = $p['nivel'];
            $subtitulo = $p['descripcion'];
        } elseif ($p['nivel'] <= $nivel) break;
        $sel[] = $p;
    }
    $r['partidas'] = $sel;
}
$conceptos = array_merge(...array_map(fn($p) => $p['conceptos'], $r['partidas'] ?: [['conceptos' => []]]));
$suma = round(array_sum(array_map(fn($c) => (float) $c['importe'], $conceptos)), 2);
$empresa = $m['empresa'] !== '' ? $m['empresa'] : (string) (sistemaConfig()['empresa']['nombre'] ?? '');
$lineasEmpresa = array_values(array_filter(array_map('trim', preg_split('/\r?\n/', (string) $m['datos']))));
$obra = $enc['lugar'] !== '' ? $enc['lugar'] : $enc['nombre'];
$esImagen = fn($u) => $u && preg_match('~^https?://\S+\.(png|jpe?g|gif|webp|svg|bmp)([?#]\S*)?$~i', $u);
// Descripción: si trae varios renglones el primero es el título; «1.- 3.40 mts de base…» va en negritas
$descripcion = function (string $t): string {
    $lineas = array_values(array_filter(array_map('trim', preg_split('/\r?\n/', trim($t))), fn($l) => $l !== ''));
    $html = '';
    foreach ($lineas as $i => $l) {
        if ($i === 0 && count($lineas) > 1) $html .= '<div class="ct-titulo">' . e($l) . '</div>';
        elseif (preg_match('/^\d+\s*\.?-/', $l)) $html .= '<p class="ct-medida">' . e($l) . '</p>';
        else $html .= '<p>' . e($l) . '</p>';
    }
    return $html;
};
$nombreArchivo = trim(preg_replace('/[\\\\\/:*?"<>|]+/', ' ', 'Cotización ' . $enc['codigo'] . ' ' . $subtitulo));
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= e(mb_substr($nombreArchivo, 0, 120)) ?></title>
    <link rel="icon" href="<?= e(imagenSistema('favicon')) ?>">
    <link rel="stylesheet" href="<?= recurso('css/acrineo-reporte.css') ?>">
    <link rel="stylesheet" href="<?= recurso('css/acrineo-cotizacion.css') ?>">
</head>
<body>
<div class="rp-barra" role="toolbar" aria-label="Acciones de la cotización">
    <b>Cotización · <?= e($enc['codigo']) ?></b>
    <span class="rp-flex"></span>
    <label class="ct-desc-campo">Descuento $ <input type="number" id="ctDescuento" min="0" step="0.01" value="0" inputmode="decimal"></label>
    <button type="button" id="ctRedondear" title="Descuento para que el total quede en miles cerrados">Redondear total</button>
    <button type="button" id="rpImprimir" class="rp-primario">Imprimir / PDF</button>
    <button type="button" onclick="window.close()">Cerrar</button>
</div>
<main class="rp ct">
    <table class="rp-hoja">
        <thead><tr><td>
            <header class="ct-enc">
                <div class="ct-logo"><?php if ($m['logo']): ?><img src="<?= e($m['logo']) ?>" alt=""><?php endif; ?></div>
                <div class="ct-empresa">
                    <?php if ($empresa !== ''): ?><div class="ct-empresa-nombre"><?= e($empresa) ?></div><?php endif; ?>
                    <?php foreach ($lineasEmpresa as $l): ?><div><?= e($l) ?></div><?php endforeach; ?>
                </div>
            </header>
            <div class="ct-cajas">
                <section class="ct-caja">
                    <h2>DATOS DEL PRESUPUESTO</h2>
                    <div>PRESUPUESTO Nº: <b><?= e($enc['codigo']) ?></b></div>
                    <div>FECHA: <b><?= e($fecha($enc['fecha'])) ?></b></div>
                    <div class="ct-subtitulo"><?= nl2br(e($subtitulo)) ?></div>
                </section>
                <section class="ct-caja ct-cliente">
                    <h2>DATOS DEL CLIENTE</h2>
                    <div class="ct-cliente-nombre"><?= e($enc['cliente']) ?></div>
                    <?php if ($enc['cliente_direccion'] !== ''): ?><div><?= e($enc['cliente_direccion']) ?></div><?php endif; ?>
                    <?php if ($enc['contacto'] !== ''): ?><div>At'n: <?= e($enc['contacto']) ?></div><?php endif; ?>
                    <?php if ($enc['cliente_telefono'] !== '' || $enc['cliente_email'] !== ''): ?>
                    <div class="ct-cliente-tel"><?= e(implode(' · ', array_filter(['Tlf. ' . $enc['cliente_telefono'], $enc['cliente_email']], fn($x) => trim($x) !== '' && trim($x) !== 'Tlf.'))) ?></div>
                    <?php endif; ?>
                </section>
            </div>
            <div class="ct-obra"><b>OBRA:</b> <?= e($obra) ?></div>
            <table class="ct-cols"><colgroup><col class="ct-c1"><col class="ct-c2"><col class="ct-c3"><col class="ct-c4"><col class="ct-c5"></colgroup>
                <tr><th>GRÁFICO</th><th>DESCRIPCIÓN</th><th>UDS</th><th>IMPORTE</th><th>TOTAL</th></tr></table>
        </td></tr></thead>
        <tbody><tr><td>
            <table class="ct-tabla"><colgroup><col class="ct-c1"><col class="ct-c2"><col class="ct-c3"><col class="ct-c4"><col class="ct-c5"></colgroup>
            <?php foreach ($conceptos as $c): ?>
                <tr class="ct-concepto">
                    <td class="ct-grafico"><?php if ($esImagen($c['url'] ?? null)): ?><img src="<?= e($c['url']) ?>" alt=""><?php endif; ?></td>
                    <td class="ct-desc"><div class="ct-codigo"><?= e($c['codigo']) ?></div><?= $descripcion((string) $c['descripcion']) ?></td>
                    <td class="ct-num ct-uds"><?= e(rtrim(rtrim(number_format((float) $c['cantidad'], 4), '0'), '.')) ?></td>
                    <td class="ct-num"><?= $din($c['precio']) ?></td>
                    <td class="ct-num"><b><?= $din($c['importe']) ?></b></td>
                </tr>
            <?php endforeach; ?>
            <?php if (!$conceptos): ?><tr><td colspan="5" class="rp-vacio">Sin conceptos</td></tr><?php endif; ?>
            </table>

            <?php if ($lineasCond): ?>
            <section class="ct-terminos">
                <h3>Términos y condiciones:</h3>
                <?php foreach ($lineasCond as $i => $l): ?><div><?= $i + 1 ?>. <?= preg_replace('/\*([^*]+)\*/', '<b>$1</b>', e($l)) ?></div><?php endforeach; ?>
            </section>
            <?php endif; ?>

            <table class="ct-totales">
                <tr><th>Suma Total</th><th>Descuento</th><th class="ct-fuerte">Total presupuesto</th></tr>
                <tr><td><?= $din($suma) ?></td><td id="ctDescuentoTxt"><?= $din(0) ?></td><td id="ctTotalTxt" class="ct-fuerte"><?= $din($suma) ?></td></tr>
            </table>
            <?php if ($m['cc_pie']): ?><div class="rp-pie"><?= e($m['cc_pie']) ?></div><?php endif; ?>
        </td></tr></tbody>
    </table>
</main>
<script>
(function () {
    'use strict';
    var suma = <?= json_encode($suma) ?>;
    var inp = document.getElementById('ctDescuento');
    var fmt = function (v) { return '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    function pintar() {
        var d = Math.min(Math.max(Number(inp.value) || 0, 0), suma);
        document.getElementById('ctDescuentoTxt').textContent = fmt(d);
        document.getElementById('ctTotalTxt').textContent = fmt(Math.round((suma - d) * 100) / 100);
    }
    inp.addEventListener('input', pintar);
    document.getElementById('ctRedondear').addEventListener('click', function () {
        inp.value = (Math.round((suma - Math.floor(suma / 1000) * 1000) * 100) / 100).toFixed(2);
        pintar();
    });
    document.getElementById('rpImprimir').addEventListener('click', function () { window.print(); });
    if (new URLSearchParams(location.search).get('imprimir') === '1') {
        window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 300); });
    }
})();
</script>
</body>
</html>
