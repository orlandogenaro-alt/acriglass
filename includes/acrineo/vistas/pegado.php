<?php
// ACRINEO · Ventana «Pegado especial» (botón de portapapeles de las partidas): partidas y conceptos desde Excel.
// js/acrineo/hoja-pegado.js · includes/acrineo/pegado.php
require_once __DIR__ . '/campos.php';
?>
<dialog class="an-dialogo an-pegado-dlg" id="anPegado" aria-labelledby="anPegadoTitulo">
    <div class="an-titulo-barra"><?= anIcono('portapapeles') ?><h2 id="anPegadoTitulo">Pegado especial</h2>
        <button type="button" class="an-btn-cab an-icono" data-pegado-cerrar title="Cerrar" aria-label="Cerrar"><?= anIcono('cerrar') ?></button></div>
    <div class="an-pegado-cuerpo">
        <p class="an-pegado-ayuda">Copia en Excel las celdas con su encabezado (<b>Partida</b>, <b>Código</b>, <b>Descripción completa</b>, <b>Unidad</b>, <b>Cantidad</b> y, si quieres, <b>Costo</b>) y pégalas aquí con <kbd>Ctrl</kbd>+<kbd>V</kbd>, o abre el archivo.
            Un renglón con <b>Partida</b> y sin código es una partida (su descripción es la de la partida); los renglones con <b>Código</b> son conceptos de la última partida.
            Las subpartidas se reconocen por el código (<i>A.01</i> queda dentro de <i>A</i>). Sin columna Partida, los conceptos van a la partida seleccionada.</p>
        <div class="an-pegado-botones">
            <label class="an-btn an-mini"><?= anIcono('subir') ?>Abrir Excel (.xlsx)<input type="file" id="anPegadoArchivo" accept=".xlsx,.csv,.txt" hidden></label>
            <button type="button" class="an-btn an-mini" id="anPegadoPlantilla"><?= anIcono('descargar') ?>Plantilla</button>
            <span class="an-flex"></span>
            <span class="an-ayuda" id="anPegadoResumen"></span>
        </div>
        <textarea id="anPegadoTexto" spellcheck="false" placeholder="Pega aquí las celdas copiadas de Excel (Ctrl+V)…" aria-label="Celdas copiadas de Excel"></textarea>
        <div class="an-pegado-vista" id="anPegadoVista" hidden></div>
    </div>
    <div class="an-calculo-pie">
        <span id="anPegadoEstado" class="an-estado" role="status"></span>
        <span class="an-flex"></span>
        <button type="button" class="an-btn an-primario" id="anPegadoAceptar" disabled>Pegar en el presupuesto</button>
        <button type="button" class="an-btn an-texto" data-pegado-cerrar>Cancelar</button>
    </div>
</dialog>
