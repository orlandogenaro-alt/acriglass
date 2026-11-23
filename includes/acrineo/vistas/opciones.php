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

<?php
$fNum = function (string $k, string $etiqueta, string $sufijo = '', bool $solo = false): string {
    return '<label class="an-fasar-campo"><span>' . $etiqueta . '</span><span class="an-fasar-valor"><input type="text" inputmode="decimal" '
        . ($solo ? 'readonly tabindex="-1" data-pct="' . $k . '"' : 'data-p="' . $k . '"') . ' aria-label="' . $etiqueta . '">' . ($sufijo ? '<i>' . $sufijo . '</i>' : '') . '</span></label>';
};
?>
<dialog class="an-dialogo an-fasar-dlg" id="anFasarDlg" aria-labelledby="anFasarTitulo">
    <form method="dialog" id="anFasarForm" novalidate>
        <div class="an-titulo-barra"><h2 id="anFasarTitulo">FASAR · Factor de Salario Real</h2>
            <button type="button" class="an-btn-cab an-icono" data-fasar-cerrar title="Cerrar" aria-label="Cerrar"><?= anIcono('cerrar') ?></button></div>
        <div class="an-fasar-cuerpo">
            <div class="an-fasar-generales">
                <label class="an-fasar-campo"><span>Año de los % de aplicación</span><span class="an-fasar-valor"><select data-p="anio" id="anFasarAnio" aria-label="Año de los % de aplicación"></select></span></label>
                <?= $fNum('salario_minimo', 'Salario mínimo') ?>
                <?= $fNum('uma', 'UMA') ?>
                <?= $fNum('impuesto_nomina', 'Impuesto sobre nómina', '%') ?>
                <?= $fNum('otros_cargos', 'Otros cargos', '%') ?>
            </div>
            <div class="an-fasar-lado">
                <fieldset class="an-calculo-caja"><legend>Límite superior (veces la UMA)</legend>
                    <?= $fNum('grupo1', 'Grupo 1') ?>
                    <?= $fNum('grupo2', 'Grupo 2') ?>
                    <small class="an-ayuda">Grupo 1: enfermedades y maternidad, riesgo de trabajo y guarderías. Grupo 2: invalidez y vida, cesantía y vejez, SAR e INFONAVIT.</small>
                </fieldset>
                <fieldset class="an-calculo-caja"><legend>Considerar</legend>
                    <label class="an-check"><input type="radio" name="considerar" value="patron"> Solo % patrón</label>
                    <label class="an-check"><input type="radio" name="considerar" value="ambos" checked> % patrón + % trabajador</label>
                </fieldset>
                <div class="an-fasar-dos"><?= $fNum('sar', 'SAR', '%') ?><?= $fNum('infonavit', 'INFONAVIT', '%') ?></div>
            </div>
            <fieldset class="an-calculo-caja an-fasar-ancho"><legend>Porcentajes establecidos para la determinación de las cuotas del año elegido</legend>
                <div class="an-fasar-cuotas">
                    <fieldset class="an-calculo-caja"><legend>Enfermedades y maternidad</legend>
                        <?= $fNum('cuota_fija', 'Cuota fija (sobre la UMA)', '%', true) ?>
                        <?= $fNum('excedente', 'Excedente de 3 UMA', '%', true) ?>
                        <?= $fNum('dinero', 'Prestaciones en dinero', '%', true) ?>
                        <?= $fNum('especie', 'Prestaciones en especie (pensionados)', '%', true) ?>
                    </fieldset>
                    <fieldset class="an-calculo-caja"><legend>Otros ramos</legend>
                        <?= $fNum('riesgo', 'Riesgo de trabajo (el que asignó el IMSS)', '%') ?>
                        <?= $fNum('guarderias', 'Guarderías', '%', true) ?>
                        <?= $fNum('invalidez', 'Invalidez y vida', '%', true) ?>
                        <?= $fNum('cesantia', 'Cesantía en edad avanzada y vejez', '%', true) ?>
                    </fieldset>
                </div>
            </fieldset>
            <fieldset class="an-calculo-caja"><legend>Días pagados además de los calendario (Tp)</legend>
                <label class="an-fasar-campo"><span>Días calendario</span><span class="an-fasar-valor"><input type="text" inputmode="decimal" id="anFasarDias" aria-label="Días calendario"></span></label>
                <table class="an-fasar-tabla" data-lista="dias_pagados" data-campo="dias"></table>
                <button type="button" class="an-btn an-mini an-texto" data-agregar="dias_pagados">+ Agregar</button></fieldset>
            <fieldset class="an-calculo-caja"><legend>Días no laborados (Tl = calendario − estos)</legend>
                <table class="an-fasar-tabla" data-lista="dias_no_laborados" data-campo="dias"></table>
                <button type="button" class="an-btn an-mini an-texto" data-agregar="dias_no_laborados">+ Agregar</button>
                <label class="an-fasar-campo"><span>Tomar los días de</span><span class="an-fasar-valor"><select id="anFasarSistema" aria-label="Tomar los días de un FASAR del sistema"><option value="">— FASAR del sistema —</option></select></span></label>
            </fieldset>
            <div class="an-sc-resultado an-fasar-ancho"><span>FASAR con el salario mínimo</span><b id="anFasarResultado">—</b><small id="anFasarDetalle" class="an-ayuda"></small></div>
            <fieldset class="an-calculo-caja an-fasar-ancho"><legend>Salarios de la mano de obra del presupuesto (cada categoría con su FASAR)</legend>
                <div class="an-fasar-salarios"><table class="an-tabla" id="anFasarSalarios">
                    <thead><tr><th scope="col">Código</th><th scope="col">Descripción</th><th scope="col" class="num">Salario base</th><th scope="col" class="num">SBC</th>
                        <th scope="col" class="num">Ps</th><th scope="col" class="num">FASAR</th><th scope="col" class="num">Salario real</th></tr></thead>
                    <tbody></tbody></table></div>
                <label class="an-check"><input type="checkbox" id="anFasarAplicar" checked> Aplicar a la mano de obra con salario base (costo = salario base × su FASAR + prestaciones)</label>
                <label class="an-check"><input type="checkbox" id="anFasarDesdeCosto"> A la que no tiene salario base, tomar su costo actual como salario base</label>
            </fieldset>
        </div>
        <div class="an-calculo-pie">
            <span id="anFasarEstado" class="an-estado" role="status"></span>
            <span class="an-flex"></span>
            <button type="button" class="an-btn" id="anFasarExcel" title="Libro del FASAR en Excel: datos, porcentajes, días y salarios"><?= anIcono('descargar') ?>Libro FASAR</button>
            <button type="submit" class="an-btn an-primario" id="anFasarAceptar">Aceptar</button>
            <button type="button" class="an-btn an-texto" data-fasar-cerrar>Cancelar</button>
        </div>
    </form>
</dialog>

<dialog class="an-dialogo an-recibir-dlg" id="anRecibirDlg" aria-labelledby="anRecibirTitulo">
    <div class="an-titulo-barra"><?= anIcono('subir') ?><h2 id="anRecibirTitulo">Recibir archivo de intercambio</h2>
        <button type="button" class="an-btn-cab an-icono" data-recibir-cerrar title="Cerrar" aria-label="Cerrar"><?= anIcono('cerrar') ?></button></div>
    <div class="an-recibir-cuerpo">
        <div class="an-recibir-zona" id="anRecibirZona">
            <label class="an-btn an-primario an-mini" tabindex="0" role="button" id="anRecibirBuscar"><?= anIcono('subir') ?>Buscar archivo
                <input type="file" id="anRecibirArchivo" accept=".zip,.json" multiple hidden></label>
            <b>¡O arrastre y suelte el archivo aquí!</b>
            <small class="an-ayuda">Respaldo de Neodata (OBRA_d-m-aaaa_HrHMnM.zip o .neodata.json). Cada archivo crea un presupuesto nuevo.</small>
        </div>
        <div class="an-recibir-cuenta" id="anRecibirCuenta">Archivos: 0</div>
        <ul class="an-recibir-lista" id="anRecibirLista"></ul>
    </div>
    <div class="an-calculo-pie">
        <span id="anRecibirEstado" class="an-estado" role="status"></span>
        <span class="an-flex"></span>
        <button type="button" class="an-btn an-primario" id="anRecibirAceptar" disabled>Recibir archivo</button>
        <button type="button" class="an-btn an-texto" data-recibir-cerrar>Cancelar</button>
    </div>
</dialog>
