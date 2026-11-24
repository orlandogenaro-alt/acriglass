<?php
// ACRINEO · Ventanas del menú de las partidas (clic derecho en el árbol), como en Neodata PU Nube+:
// Detalle de la partida, Agregar 'n' partidas / Duplicar 'n' veces, Renumerar renglón y Aplicar expresión.
// js/acrineo/hoja-partidas.js · includes/acrineo/hoja.php
require_once __DIR__ . '/campos.php';
?>
<dialog class="an-dialogo an-chico an-partida-dlg" id="anPartidaDetalle" aria-labelledby="anPartidaDetalleTitulo">
    <div class="an-titulo-barra"><?= anIcono('editar') ?><h2 id="anPartidaDetalleTitulo">Detalle de la partida</h2>
        <button type="button" class="an-cerrar" data-pdet-cerrar aria-label="Cerrar"><?= anIcono('cerrar') ?></button></div>
    <div class="an-cuerpo an-partida-campos">
        <div class="an-campo"><label for="anPdCodigo">Partida<i>*</i></label><input id="anPdCodigo" maxlength="30"></div>
        <div class="an-campo"><label for="anPdAuxiliar">Partida auxiliar</label><input id="anPdAuxiliar" maxlength="30"></div>
        <div class="an-campo"><label for="anPdRenglon">Renglón</label><input id="anPdRenglon" inputmode="numeric" maxlength="9"></div>
        <div class="an-campo"><label for="anPdWbs">WBS</label><input id="anPdWbs" readonly title="Se calcula con «Regenerar WBS»"></div>
        <div class="an-campo an-ancho"><label for="anPdCorta">Descripción <small id="anPdCortaCuenta"></small></label><input id="anPdCorta" maxlength="40"></div>
        <div class="an-campo an-ancho"><label for="anPdDesc">Descripción completa<i>*</i></label><textarea id="anPdDesc" maxlength="4000"></textarea></div>
        <div class="an-campo"><label for="anPdM2">Metros cuadrados</label><input id="anPdM2" inputmode="decimal"></div>
        <div class="an-partida-importes an-ancho" id="anPdImportes"></div>
    </div>
    <div class="an-botonera">
        <span class="an-estado" id="anPdEstado" role="status"></span>
        <button type="button" class="an-btn an-primario" id="anPdAceptar">Aceptar</button>
        <button type="button" class="an-btn an-texto" data-pdet-cerrar>Cancelar</button>
    </div>
</dialog>

<dialog class="an-dialogo an-chico" id="anPartidaN" aria-labelledby="anPartidaNTitulo">
    <div class="an-titulo-barra"><h2 id="anPartidaNTitulo">Agregar partidas</h2>
        <button type="button" class="an-cerrar" data-pn-cerrar aria-label="Cerrar"><?= anIcono('cerrar') ?></button></div>
    <div class="an-cuerpo">
        <p id="anPartidaNTexto"></p>
        <label class="an-ajuste-fila"><span id="anPartidaNEtiqueta">¿Cuántas?</span><input type="number" id="anPartidaNValor" min="1" step="1" inputmode="numeric"></label>
    </div>
    <div class="an-botonera">
        <span class="an-estado" id="anPartidaNEstado" role="status"></span>
        <button type="button" class="an-btn an-primario" id="anPartidaNAceptar">Aceptar</button>
        <button type="button" class="an-btn an-texto" data-pn-cerrar>Cancelar</button>
    </div>
</dialog>

<dialog class="an-dialogo an-chico" id="anRenglonDlg" aria-labelledby="anRenglonTitulo">
    <div class="an-titulo-barra"><h2 id="anRenglonTitulo">Renumerar renglón</h2>
        <button type="button" class="an-cerrar" data-rr-cerrar aria-label="Cerrar"><?= anIcono('cerrar') ?></button></div>
    <div class="an-cuerpo">
        <p>Vuelve a numerar el renglón de todas las partidas del presupuesto en el orden en que se ven en el árbol.</p>
        <label class="an-ajuste-fila"><span>Renglón inicial</span><input type="number" id="anRenglonInicio" min="0" step="1" value="10" inputmode="numeric"></label>
        <label class="an-ajuste-fila"><span>Incremento</span><input type="number" id="anRenglonPaso" min="1" step="1" value="10" inputmode="numeric"></label>
    </div>
    <div class="an-botonera">
        <span class="an-estado" id="anRenglonEstado" role="status"></span>
        <button type="button" class="an-btn an-primario" id="anRenglonAceptar">Renumerar</button>
        <button type="button" class="an-btn an-texto" data-rr-cerrar>Cancelar</button>
    </div>
</dialog>

<dialog class="an-dialogo an-chico" id="anExpresionDlg" aria-labelledby="anExpresionTitulo">
    <div class="an-titulo-barra"><span class="an-expresion-ico" aria-hidden="true">Σ</span><h2 id="anExpresionTitulo">Aplicar expresión</h2>
        <button type="button" class="an-cerrar" data-ex-cerrar aria-label="Cerrar"><?= anIcono('cerrar') ?></button></div>
    <div class="an-cuerpo">
        <p>Cambia las <b>cantidades</b> de los conceptos; sus costos no cambian.</p>
        <fieldset class="an-expresion-alcance">
            <legend>¿A qué conceptos?</legend>
            <label class="an-check"><input type="radio" name="anExAlcance" value="partida" id="anExPartida" checked> <span id="anExPartidaTexto">De la partida seleccionada y sus subpartidas</span></label>
            <label class="an-check"><input type="radio" name="anExAlcance" value="todo"> De todo el presupuesto</label>
        </fieldset>
        <label class="an-ajuste-fila"><span>Cantidad</span>
            <select id="anExOperacion" aria-label="Operación">
                <option value="multiplicar">× multiplicar por</option>
                <option value="dividir">÷ dividir entre</option>
                <option value="sumar">+ sumar</option>
                <option value="restar">− restar</option>
                <option value="igualar">= igualar a</option>
            </select>
            <input type="text" id="anExValor" inputmode="decimal" value="1" aria-label="Valor"></label>
        <p class="an-ayuda" id="anExEjemplo"></p>
    </div>
    <div class="an-botonera">
        <span class="an-estado" id="anExEstado" role="status"></span>
        <button type="button" class="an-btn an-primario" id="anExAceptar">Aplicar</button>
        <button type="button" class="an-btn an-texto" data-ex-cerrar>Cancelar</button>
    </div>
</dialog>
