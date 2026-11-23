<?php
// ACRINEO · Ventanas de las Opciones del presupuesto: catálogos del presupuesto (general F9, materiales, mano de obra y
// maquinaria), Actualizar costos y matrices (Ctrl+Shift+U) y FASAR (Ctrl+Shift+F).
// js/acrineo/hoja-catalogo-ppto.js · js/acrineo/hoja-procesos.js · includes/acrineo/opciones.php
require_once __DIR__ . '/campos.php';
?>
<dialog class="an-dialogo an-catppto-dlg" id="anCatPptoDlg" aria-labelledby="anCatPptoTitulo">
    <div class="an-titulo-barra"><h2 id="anCatPptoTitulo">Catálogo general</h2>
        <button type="button" class="an-btn-cab an-icono" data-catppto-cerrar title="Cerrar (Esc)" aria-label="Cerrar"><?= anIcono('cerrar') ?></button></div>
    <div class="an-catppto-barra">
        <label class="an-catppto-buscar"><?= anIcono('buscar') ?><input type="search" id="anCatPptoQ" placeholder="Buscar código, descripción o unidad" aria-label="Buscar"></label>
        <span class="an-catppto-ver" id="anCatPptoVer" role="group" aria-label="Qué mostrar">
            <button type="button" class="an-btn an-mini" data-ver="todos" aria-pressed="true">Todos</button>
            <button type="button" class="an-btn an-mini" data-ver="insumos" aria-pressed="false">Solo explosión</button>
            <button type="button" class="an-btn an-mini" data-ver="conceptos" aria-pressed="false">Conceptos del presupuesto</button>
            <button type="button" class="an-btn an-mini" data-ver="basicos" aria-pressed="false">Básicos</button>
            <button type="button" class="an-btn an-mini" data-ver="marcados" aria-pressed="false">Solo los marcados</button>
        </span>
        <span class="an-flex"></span>
        <span class="an-catppto-factor" id="anCatPptoFactorCaja" title="Multiplica o divide el costo de los insumos marcados (o de todos los que se ven si no hay marcados)">
            Factor <input type="text" inputmode="decimal" id="anCatPptoFactor" value="1" aria-label="Factor">
            <select id="anCatPptoOperacion" aria-label="Operación"><option value="multiplicar">×</option><option value="dividir">÷</option></select>
            <button type="button" class="an-btn an-mini an-primario" id="anCatPptoAplicar">Aplicar</button>
        </span>
        <button type="button" class="an-btn an-mini" id="anCatPptoDepurar" title="Quita los conceptos sin uso y los insumos sin participación">Depurar</button>
        <button type="button" class="an-btn an-mini" id="anCatPptoExcel"><?= anIcono('descargar') ?>Excel</button>
    </div>
    <div class="an-tabla-cont an-catppto-cont">
        <table class="an-tabla an-catppto-tabla" id="anCatPptoTabla">
            <thead id="anCatPptoCab"></thead>
            <tbody id="anCatPptoFilas"></tbody>
        </table>
    </div>
    <div class="an-calculo-pie">
        <span id="anCatPptoEstado" class="an-estado" role="status"></span>
        <span class="an-flex"></span>
        <span class="an-ayuda" id="anCatPptoTotal"></span>
        <button type="button" class="an-btn an-texto" data-catppto-cerrar>Cerrar</button>
    </div>
</dialog>

<dialog class="an-dialogo an-actualizar-dlg" id="anActualizarDlg" aria-labelledby="anActualizarTitulo">
    <form method="dialog" id="anActualizarForm" novalidate>
        <div class="an-titulo-barra"><h2 id="anActualizarTitulo">Actualizar costos y matrices</h2>
            <button type="button" class="an-btn-cab an-icono" data-act-cerrar title="Cerrar" aria-label="Cerrar"><?= anIcono('cerrar') ?></button></div>
        <div class="an-actualizar-cuerpo">
            <p class="an-ayuda">El maestro es el sistema: los <b>Conceptos P.U.</b> (con su matriz) y el <b>catálogo de insumos</b> con su precio vigente.</p>
            <fieldset class="an-calculo-caja">
                <legend>Importar matrices</legend>
                <label class="an-check"><input type="radio" name="importar" value="no" checked> No importar matrices</label>
                <label class="an-check"><input type="radio" name="importar" value="todas"> Importar todas las matrices de la obra <small class="an-ayuda" data-act="en_maestro"></small></label>
                <label class="an-check"><input type="radio" name="importar" value="sin_analisis"> Importar solo las matrices sin análisis de precio <small class="an-ayuda" data-act="sin_analisis"></small></label>
                <label class="an-check"><input type="radio" name="importar" value="pendientes"> Importar solo las matrices pendientes de analizar <small class="an-ayuda" data-act="pendientes"></small></label>
                <small class="an-ayuda">Se reemplaza la matriz de los conceptos cuyo código está en los Conceptos P.U. del sistema.</small>
            </fieldset>
            <fieldset class="an-calculo-caja">
                <legend>Actualizar costos de los insumos <small class="an-ayuda" data-act="insumos_catalogo"></small></legend>
                <label class="an-check"><input type="radio" name="costos" value="no"> No actualizar costos</label>
                <label class="an-check"><input type="radio" name="costos" value="todos" checked> Actualizar todos los insumos</label>
                <label class="an-check"><input type="radio" name="costos" value="recientes"> Actualizar los de fecha más reciente <small class="an-ayuda">(precio del catálogo más nuevo que el que tiene el presupuesto)</small></label>
                <label class="an-check"><input type="radio" name="costos" value="cero"> Actualizar los insumos con costo cero</label>
            </fieldset>
        </div>
        <div class="an-calculo-pie">
            <span id="anActualizarEstado" class="an-estado" role="status"></span>
            <span class="an-flex"></span>
            <button type="submit" class="an-btn an-primario" id="anActualizarAceptar">Aceptar</button>
            <button type="button" class="an-btn an-texto" data-act-cerrar>Cancelar</button>
        </div>
    </form>
</dialog>

<dialog class="an-dialogo an-fasar-dlg" id="anFasarDlg" aria-labelledby="anFasarTitulo">
    <form method="dialog" id="anFasarForm" novalidate>
        <div class="an-titulo-barra"><h2 id="anFasarTitulo">FASAR · Factor de Salario Real</h2>
            <button type="button" class="an-btn-cab an-icono" data-fasar-cerrar title="Cerrar" aria-label="Cerrar"><?= anIcono('cerrar') ?></button></div>
        <div class="an-fasar-cuerpo">
            <div class="an-fasar-arriba">
                <label class="an-sc-campo"><span>Días calendario</span><input type="text" inputmode="decimal" id="anFasarDias" aria-label="Días calendario"></label>
                <label class="an-sc-campo"><span>Tomar los datos de</span><select id="anFasarSistema" aria-label="Tomar los datos de un FASAR del sistema"><option value="">— FASAR del sistema —</option></select></label>
            </div>
            <fieldset class="an-calculo-caja"><legend>Días pagados además de los calendario (Tp)</legend><table class="an-fasar-tabla" data-lista="dias_pagados" data-campo="dias"></table>
                <button type="button" class="an-btn an-mini an-texto" data-agregar="dias_pagados">+ Agregar</button></fieldset>
            <fieldset class="an-calculo-caja"><legend>Días no laborados (Tl = calendario − estos)</legend><table class="an-fasar-tabla" data-lista="dias_no_laborados" data-campo="dias"></table>
                <button type="button" class="an-btn an-mini an-texto" data-agregar="dias_no_laborados">+ Agregar</button></fieldset>
            <fieldset class="an-calculo-caja an-fasar-ancho"><legend>Obligaciones obrero-patronales en % del salario (Ps): IMSS, INFONAVIT, SAR, impuesto sobre nómina…</legend>
                <table class="an-fasar-tabla" data-lista="obligaciones" data-campo="pct"></table>
                <button type="button" class="an-btn an-mini an-texto" data-agregar="obligaciones">+ Agregar</button></fieldset>
            <div class="an-sc-resultado an-fasar-ancho"><span>Fsr = Ps × (Tp / Tl) + Tp / Tl</span><b id="anFasarResultado">—</b><small id="anFasarDetalle" class="an-ayuda"></small></div>
            <fieldset class="an-calculo-caja an-fasar-ancho"><legend>Mano de obra del presupuesto</legend>
                <label class="an-check"><input type="checkbox" id="anFasarAplicar" checked> Aplicar el FASAR a la mano de obra con salario base (costo = salario base × FASAR + prestaciones)</label>
                <label class="an-check"><input type="checkbox" id="anFasarDesdeCosto"> A la que no tiene salario base, tomar su costo actual como salario base</label>
                <small class="an-ayuda" id="anFasarMo"></small>
            </fieldset>
        </div>
        <div class="an-calculo-pie">
            <span id="anFasarEstado" class="an-estado" role="status"></span>
            <span class="an-flex"></span>
            <button type="submit" class="an-btn an-primario" id="anFasarAceptar">Aceptar</button>
            <button type="button" class="an-btn an-texto" data-fasar-cerrar>Cancelar</button>
        </div>
    </form>
</dialog>
