<?php
// ACRINEO · Ventana «Imprimir reportes» (Opciones del Presupuesto › Reporte o Ctrl+P): elige el reporte y lo abre en
// acrineo-reporte.php para imprimir (PDF) o bajar a Excel. js/acrineo/hoja-reportes.js · includes/acrineo/reportes.php
require_once __DIR__ . '/campos.php';
require_once __DIR__ . '/../reportes.php';
$ayudas = [
    'presupuesto' => 'Partidas con sus conceptos: código, concepto, unidad, cantidad, P.U. e importe; subtotal, IVA y total con letra.',
    'analisis'    => 'La matriz de cada concepto por tipo de insumo, su costo directo, el sobrecosto y el precio unitario.',
    'explosion'   => 'Todos los insumos de las matrices del presupuesto (con sus submatrices) por tipo, con su cantidad e importe.',
];
?>
<dialog class="an-dialogo an-reportes-dlg" id="anReportes" aria-labelledby="anReportesTitulo">
    <form method="dialog" id="anReportesForm" novalidate>
        <div class="an-titulo-barra"><?= anIcono('imprimir') ?><h2 id="anReportesTitulo">Imprimir reportes</h2>
            <button type="button" class="an-btn-cab an-icono" data-rp-cerrar title="Cerrar" aria-label="Cerrar"><?= anIcono('cerrar') ?></button></div>
        <div class="an-rp-cuerpo">
            <fieldset class="an-calculo-caja">
                <legend>Reporte</legend>
                <?php foreach (ACRINEO_REPORTES as $k => $t): ?>
                <label class="an-rp-opcion"><input type="radio" name="tipo" value="<?= $k ?>"<?= $k === 'presupuesto' ? ' checked' : '' ?>>
                    <span><b><?= e($t) ?></b><small class="an-ayuda"><?= e($ayudas[$k]) ?></small></span></label>
                <?php endforeach; ?>
            </fieldset>
            <label class="an-check" id="anRpMarcadosCaja"><input type="checkbox" name="marcados" id="anRpMarcados"> <span id="anRpMarcadosTexto">Sólo los conceptos marcados del catálogo</span></label>
        </div>
        <div class="an-calculo-pie">
            <span id="anRpEstado" class="an-estado" role="status"></span>
            <span class="an-flex"></span>
            <button type="button" class="an-btn" id="anRpVer" title="Abre el reporte en otra pestaña">Vista previa</button>
            <button type="button" class="an-btn" id="anRpExcel">Excel</button>
            <button type="submit" class="an-btn an-primario" id="anRpImprimir">Imprimir / PDF</button>
            <button type="button" class="an-btn an-texto" data-rp-cerrar>Cancelar</button>
        </div>
    </form>
</dialog>
