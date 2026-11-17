<?php
// ACRINEO › reporte impreso de un presupuesto (?id=N&tipo=presupuesto|analisis|explosion[&marcados=1,2][&imprimir=1|&excel=1]).
// Hoja carta con la Hoja Membretada del sistema; «Imprimir» la manda a la impresora o a PDF y «Excel» la baja como .xlsx.
require __DIR__ . '/includes/sesion.php';
require_once __DIR__ . '/includes/bd.php';
require __DIR__ . '/includes/acrineo/permisos.php';
acrineoExigir('presupuestos.ver');
require __DIR__ . '/includes/acrineo/reportes.php';
require __DIR__ . '/includes/membrete.php';

$id = max(0, (int) ($_GET['id'] ?? 0));
$tipo = (string) ($_GET['tipo'] ?? 'presupuesto');
$marcados = array_values(array_filter(array_map('intval', explode(',', (string) ($_GET['marcados'] ?? ''))), fn($x) => $x > 0));
$r = null;
$aviso = '';
try {
    $r = acrineoReporte(acrineoHojaContexto($id), $tipo, $marcados);
} catch (AcrineoError $e) {
    $aviso = $e->getMessage();
} catch (Throwable $e) {
    error_log('ACRINEO reporte: ' . $e->getMessage());
    $aviso = 'No hay conexión con la base de datos. Intenta de nuevo en un momento.';
}
$m = membreteImpresion();
$din = fn($v) => $v === null ? '' : '$' . number_format((float) $v, 2);
$cant = fn($v, $d = 4) => $v === null ? '' : number_format((float) $v, $d);
$pct = fn($v) => rtrim(rtrim(number_format((float) $v, 4), '0'), '.') . ' %';
$fecha = fn($f) => preg_match('/^(\d{4})-(\d{2})-(\d{2})/', (string) $f, $x) ? "$x[3]/$x[2]/$x[1]" : '';
$enc = $r['encabezado'] ?? [];
$titulo = $r ? $r['titulo'] . ' · ' . $enc['codigo'] : 'Reporte';
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= e($titulo) ?> · ACRINEO</title>
    <link rel="icon" href="<?= e(imagenSistema('favicon')) ?>">
    <link rel="stylesheet" href="<?= recurso('css/acrineo-reporte.css') ?>">
</head>
<body>
<div class="rp-barra" role="toolbar" aria-label="Acciones del reporte">
    <b><?= e($titulo) ?></b>
    <span class="rp-flex"></span>
    <?php if ($r): ?>
    <button type="button" id="rpImprimir" class="rp-primario">Imprimir / PDF</button>
    <button type="button" id="rpExcel">Exportar a Excel</button>
    <?php endif; ?>
    <button type="button" onclick="window.close()">Cerrar</button>
</div>
<?php if (!$r): ?>
<p class="rp-aviso"><?= e($aviso) ?></p>
<?php else: ?>
<main class="rp" style="--rp-color:<?= e($m['cc_color'] ?: '#000000') ?>">
    <table class="rp-hoja">
        <thead><tr><td>
            <header class="rp-enc">
                <div class="rp-enc-izq">
                    <?php if ($m['cc_empresa']): ?><div class="rp-empresa"><?= e($m['cc_empresa']) ?></div><?php endif; ?>
                    <?php if ($m['cc_subtitulo']): ?><div class="rp-sub"><?= e($m['cc_subtitulo']) ?></div><?php endif; ?>
                    <table class="rp-mini">
                        <tr><td>Fecha:</td><td><?= e($fecha($enc['fecha'])) ?></td></tr>
                        <tr><td>Presupuesto:</td><td><?= e($enc['codigo']) ?></td></tr>
                    </table>
                </div>
                <div class="rp-logo"><?php if ($m['logo']): ?><img src="<?= e($m['logo']) ?>" alt=""><?php endif; ?></div>
            </header>
            <table class="rp-datos">
                <tr><th>Obra:</th><td><?= e($enc['nombre']) ?></td><th>Cliente:</th><td><?= e($enc['cliente']) ?></td></tr>
                <tr><th>Lugar:</th><td><?= e($enc['lugar']) ?></td><th>En atención a:</th><td><?= e($enc['contacto']) ?></td></tr>
            </table>
            <h1 class="rp-titulo"><?= e(mb_strtoupper($r['titulo'])) ?><?= $r['marcados'] ? ' <small>(' . $r['marcados'] . ' concepto(s) marcados)</small>' : '' ?></h1>
        </td></tr></thead>
        <tbody><tr><td>
<?php if ($tipo === 'presupuesto'): ?>
            <table class="rp-tabla rp-presupuesto">
                <colgroup><col style="width:12%"><col style="width:46%"><col style="width:7%"><col style="width:10%"><col style="width:12%"><col style="width:13%"></colgroup>
                <thead><tr class="rp-cols"><th>Código</th><th>Concepto</th><th>Unidad</th><th>Cantidad</th><th>P. Unitario</th><th>Importe</th></tr></thead>
                <tbody>
                <?php foreach ($r['partidas'] as $p): ?>
                    <tr class="rp-partida rp-nivel-<?= min(3, $p['nivel']) ?>"><td><?= e($p['codigo']) ?></td><td colspan="4" style="padding-left:<?= 4 + $p['nivel'] * 12 ?>px"><?= e($p['descripcion']) ?></td><td class="num"><?= $din($p['importe']) ?></td></tr>
                    <?php foreach ($p['conceptos'] as $c): ?>
                    <tr class="rp-concepto"><td><?= e($c['codigo']) ?></td><td class="rp-texto"><?= nl2br(e($c['descripcion'])) ?></td><td><?= e($c['unidad']) ?></td>
                        <td class="num"><?= $cant($c['cantidad']) ?></td><td class="num"><?= $din($c['precio']) ?></td><td class="num"><?= $din($c['importe']) ?></td></tr>
                    <?php endforeach; ?>
                    <?php if ($p['conceptos']): ?><tr class="rp-subtotal"><td></td><td colspan="4">Total <?= e($p['codigo']) ?> · <?= e($p['descripcion']) ?></td><td class="num"><?= $din($p['importe']) ?></td></tr><?php endif; ?>
                <?php endforeach; ?>
                <?php if (!$r['partidas']): ?><tr><td colspan="6" class="rp-vacio">Sin conceptos</td></tr><?php endif; ?>
                </tbody>
            </table>
            <table class="rp-totales">
                <tr><td>TOTAL DEL PRESUPUESTO SIN IVA:</td><td class="num"><?= $din($r['subtotal']) ?></td></tr>
                <tr><td>IVA <?= number_format($r['iva_pct'], 2) ?> %</td><td class="num"><?= $din($r['iva']) ?></td></tr>
                <tr><td>TOTAL DEL PRESUPUESTO:</td><td class="num"><?= $din($r['total']) ?></td></tr>
                <tr><td colspan="2" class="rp-letra">(* <?= e(trim($r['letra'], '()')) ?> *)</td></tr>
            </table>
            <?php
            $lineas = array_values(array_filter(array_map(fn($l) => trim(preg_replace('/^\s*[•\-]\s*/u', '', $l)), preg_split('/\r?\n/', (string) $m['cc_condiciones']))));
            if ($lineas): ?>
            <div class="rp-cond"><b><?= e($m['cc_condiciones_titulo'] ?: 'CONDICIONES COMERCIALES') ?></b>
                <?php foreach ($lineas as $l): ?><div>• <?= preg_replace('/\*([^*]+)\*/', '<b>$1</b>', e($l)) ?></div><?php endforeach; ?>
            </div>
            <?php endif; ?>
<?php elseif ($tipo === 'analisis'): ?>
            <?php foreach ($r['conceptos'] as $c): ?>
            <section class="rp-analisis">
                <table class="rp-tabla">
                    <colgroup><col style="width:11%"><col style="width:39%"><col style="width:7%"><col style="width:12%"><col style="width:11%"><col style="width:7%"><col style="width:13%"></colgroup>
                    <thead>
                        <tr class="rp-ap-concepto"><td colspan="7"><b>Análisis:</b> <?= e($c['codigo']) ?> <span class="rp-ap-unidad">Unidad: <?= e($c['unidad']) ?></span>
                            <div class="rp-texto"><?= nl2br(e($c['descripcion'])) ?></div></td></tr>
                        <tr class="rp-cols"><th>Código</th><th>Concepto</th><th>Unidad</th><th>Costo</th><th>Cantidad</th><th>% Desp.</th><th>Importe</th></tr>
                    </thead>
                    <tbody>
                    <?php foreach ($c['grupos'] as $g): ?>
                        <tr class="rp-grupo"><td colspan="7"><?= e($g['nombre']) ?></td></tr>
                        <?php foreach ($g['filas'] as $f): ?>
                        <tr><td><?= e($f['codigo']) ?><?= $f['analisis'] ? ' <small title="Tiene su propio análisis">(M)</small>' : '' ?></td><td class="rp-texto"><?= e($f['descripcion']) ?></td><td><?= e($f['unidad']) ?></td>
                            <td class="num"><?= $f['costo'] === null ? '' : $din($f['costo']) ?></td><td class="num"><?= $cant($f['cantidad'], 6) ?></td>
                            <td class="num"><?= $f['desperdicio'] ? $cant($f['desperdicio'], 2) : '' ?></td><td class="num"><?= $din($f['importe']) ?></td></tr>
                        <?php endforeach; ?>
                        <tr class="rp-subtotal"><td></td><td colspan="5">Total <?= e(mb_strtolower($g['nombre'])) ?></td><td class="num"><?= $din($g['total']) ?></td></tr>
                    <?php endforeach; ?>
                    <?php if (!$c['grupos']): ?><tr><td colspan="7" class="rp-vacio">Sin matriz: el costo directo es el que se capturó en el presupuesto.</td></tr><?php endif; ?>
                    </tbody>
                </table>
                <table class="rp-resumen">
                    <tr class="rp-fuerte"><td>Costo directo</td><td></td><td class="num"><?= $din($c['costo_directo']) ?></td></tr>
                    <?php foreach ($c['sobrecosto'] as [$t, $pc, $v]): ?>
                    <tr<?= $pc === null ? ' class="rp-fuerte"' : '' ?>><td><?= e($t) ?></td><td class="num"><?= $pc === null ? '' : $pct($pc) ?></td><td class="num"><?= $din($v) ?></td></tr>
                    <?php endforeach; ?>
                    <tr class="rp-pu"><td>Precio unitario<?= $c['precio_alzado'] ? ' (precio fijo)' : '' ?></td><td></td><td class="num"><?= $din($c['precio']) ?></td></tr>
                    <tr><td colspan="3" class="rp-letra">(* <?= e(trim($c['letra'], '()')) ?> *)</td></tr>
                </table>
            </section>
            <?php endforeach; ?>
            <?php if (!$r['conceptos']): ?><p class="rp-vacio">Sin conceptos</p><?php endif; ?>
<?php else: ?>
            <table class="rp-tabla">
                <colgroup><col style="width:12%"><col style="width:42%"><col style="width:8%"><col style="width:12%"><col style="width:12%"><col style="width:14%"></colgroup>
                <thead><tr class="rp-cols"><th>Código</th><th>Descripción</th><th>Unidad</th><th>Costo</th><th>Cantidad</th><th>Importe</th></tr></thead>
                <tbody>
                <?php foreach ($r['grupos'] as $g): ?>
                    <tr class="rp-grupo"><td colspan="6"><?= e($g['nombre']) ?></td></tr>
                    <?php foreach ($g['insumos'] as $i): ?>
                    <tr><td><?= e($i['codigo']) ?></td><td class="rp-texto"><?= e($i['descripcion']) ?></td><td><?= e($i['unidad']) ?></td>
                        <td class="num"><?= $din($i['costo']) ?></td><td class="num"><?= $cant($i['cantidad']) ?></td><td class="num"><?= $din($i['importe']) ?></td></tr>
                    <?php endforeach; ?>
                    <tr class="rp-subtotal"><td></td><td colspan="4">Total <?= e(mb_strtolower($g['nombre'])) ?></td><td class="num"><?= $din($g['total']) ?></td></tr>
                <?php endforeach; ?>
                <?php if (!$r['grupos']): ?><tr><td colspan="6" class="rp-vacio">Las matrices del presupuesto todavía no tienen insumos.</td></tr><?php endif; ?>
                </tbody>
            </table>
            <table class="rp-totales"><tr><td>TOTAL DE LA EXPLOSIÓN DE INSUMOS:</td><td class="num"><?= $din($r['total']) ?></td></tr></table>
<?php endif; ?>
        </td></tr></tbody>
    </table>
    <?php if ($m['cc_pie']): ?><div class="rp-pie"><?= e($m['cc_pie']) ?></div><?php endif; ?>
</main>
<script>window.ACRINEO_REPORTE = <?= json_encode($r, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?>;</script>
<script src="<?= recurso('js/xlsx-simple.js') ?>"></script>
<script src="<?= recurso('js/acrineo/reporte.js') ?>"></script>
<?php endif; ?>
</body>
</html>
