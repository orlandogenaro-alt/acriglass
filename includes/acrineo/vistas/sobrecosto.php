<?php
// ACRINEO · Ventana «Factor de sobrecosto (indirectos, financiamiento y utilidad)» (Ctrl+Shift+S)
// js/acrineo/hoja-sobrecosto.js · includes/acrineo/sobrecosto.php
require_once __DIR__ . '/campos.php';
$campo = function (string $k, string $etiqueta, bool $solo = false): string {
    return '<label class="an-sc-campo"><span>' . $etiqueta . '</span><span class="an-calculo-num"><input type="number" ' . ($solo ? 'readonly tabindex="-1"' : 'name="' . $k . '" min="0" max="1000" step="0.000001" inputmode="decimal"')
        . ' id="anSc_' . $k . '" aria-label="' . $etiqueta . '"> %</span></label>';
};
?>
<dialog class="an-dialogo an-sobrecosto-dlg" id="anSobrecostoDlg" aria-labelledby="anSobrecostoTitulo">
    <form method="dialog" id="anSobrecostoForm" novalidate>
        <div class="an-titulo-barra"><span class="an-sc-signo">$</span><h2 id="anSobrecostoTitulo">Factor de sobrecosto (indirectos, financiamiento y utilidad)</h2>
            <button type="button" class="an-btn-cab an-icono" data-sc-cerrar title="Cerrar" aria-label="Cerrar"><?= anIcono('cerrar') ?></button></div>
        <div class="an-sc-cuerpo">
            <fieldset class="an-calculo-caja an-sc-libro">
                <legend>Opciones libro</legend>
                <div class="an-sc-libro-fila">
                    <button type="button" class="an-btn an-primario an-icono an-redondo" id="anScPlantilla" title="Descargar el libro para trabajarlo en Excel (con los importes de ahora)" aria-label="Descargar el libro para trabajarlo en Excel"><?= anIcono('editar') ?></button>
                    <label class="an-btn an-primario an-icono an-redondo" id="anScSubirBtn" title="Subir el libro trabajado: llena los factores con sus resultados" aria-label="Subir el libro trabajado" tabindex="0" role="button"><?= anIcono('subir') ?>
                        <input type="file" id="anScSubir" accept=".xlsx" hidden></label>
                    <div class="an-sc-libro-nombre"><small>Libro pie indirectos:</small><b id="anScLibroNombre" class="vacio">Ningún archivo elegido</b></div>
                    <button type="button" class="an-btn an-primario an-icono an-redondo" id="anScDescargar" title="Descargar el libro guardado con el presupuesto" aria-label="Descargar el libro guardado" disabled><?= anIcono('descargar') ?></button>
                </div>
                <small class="an-ayuda">Para darle estilo, descárgalo, trabájalo en Excel y súbelo: los % de indirectos salen de sus importes entre el costo directo de la obra. Al subirlo se guarda en Documentos del presupuesto (moneda 1).</small>
            </fieldset>
            <fieldset class="an-calculo-caja">
                <legend>Factores</legend>
                <div class="an-sc-rejilla">
                    <?= $campo('indirecto_total', 'Indirecto total', true) ?>
                    <?= $campo('indirecto_campo', 'Indirecto de campo') ?>
                    <?= $campo('indirecto_oficina', 'Indirecto de oficina') ?>
                    <?= $campo('financiamiento', 'Financiamiento') ?>
                    <?= $campo('utilidad', 'Utilidad') ?>
                    <?= $campo('cargos_adicionales', 'Cargos adicionales') ?>
                </div>
            </fieldset>
            <fieldset class="an-calculo-caja">
                <legend>Cálculo (sobre un costo directo de $100)</legend>
                <table class="an-sc-tabla">
                    <tbody>
                        <tr><th>(CD) Costo directo</th><td></td><td data-sc="costo_directo"></td></tr>
                        <tr><th>(CI) Indirectos</th><td data-scf="indirecto_total"></td><td data-sc="indirectos"></td></tr>
                        <tr class="sub"><th>Subtotal 1</th><td></td><td data-sc="subtotal1"></td></tr>
                        <tr><th>(CF) Financiamiento</th><td data-scf="financiamiento"></td><td data-sc="financiamiento"></td></tr>
                        <tr class="sub"><th>Subtotal 2</th><td></td><td data-sc="subtotal2"></td></tr>
                        <tr><th>(CU) Utilidad</th><td data-scf="utilidad"></td><td data-sc="utilidad"></td></tr>
                        <tr class="sub"><th>Subtotal 3</th><td></td><td data-sc="subtotal3"></td></tr>
                        <tr><th>(CA) Cargos adicionales × subtotal 3</th><td data-scf="cargos_adicionales"></td><td data-sc="cargos"></td></tr>
                        <tr class="total"><th>Precio unitario (CD + CI + CF + CU + CA)</th><td></td><td data-sc="precio_unitario"></td></tr>
                    </tbody>
                </table>
            </fieldset>
            <div class="an-sc-resultado"><span>% Sobrecosto</span><b id="anScResultado">0.0000 %</b><small id="anScActual" class="an-ayuda"></small></div>
        </div>
        <div class="an-calculo-pie">
            <span id="anScEstado" class="an-estado" role="status"></span>
            <span class="an-flex"></span>
            <button type="submit" class="an-btn an-primario" id="anScAceptar">Aceptar</button>
            <button type="button" class="an-btn an-texto" data-sc-cerrar>Cancelar</button>
        </div>
    </form>
</dialog>
