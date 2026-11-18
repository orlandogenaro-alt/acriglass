<?php
// ACRINEO · Ventana «Importar de Neodata»: lee la carpeta de archivos de intercambio de Neodata (C:\NEODATAWinPlus\Archivos
// Intercambio) en el navegador y crea cada obra como presupuesto del usuario. js/acrineo/importar-neodata.js · includes/acrineo/neodata.php
require_once __DIR__ . '/campos.php';
?>
<dialog class="an-dialogo an-neodata-dlg" id="anNeodata" aria-labelledby="anNeodataTitulo">
    <div class="an-titulo-barra"><?= anIcono('subir') ?><h2 id="anNeodataTitulo">Importar mis presupuestos de Neodata</h2>
        <button type="button" class="an-btn-cab an-icono" data-neo-cerrar title="Cerrar" aria-label="Cerrar"><?= anIcono('cerrar') ?></button></div>
    <div class="an-pegado-cuerpo" id="anNeoZona">
        <p class="an-pegado-ayuda">Elige la carpeta de los <b>archivos de intercambio</b> de tu Neodata (normalmente
            <code>C:\NEODATAWinPlus\Archivos Intercambio</code>, o <code>C:\NEODATAWinPlus</code>). Cada obra aparece con su respaldo más reciente;
            al importarla se crea un presupuesto nuevo <b>a tu nombre</b> con sus partidas, conceptos, cantidades, matrices (con básicos y cuadrillas),
            insumos y % de sobrecosto. Nada se borra de tu Neodata.</p>
        <div class="an-neo-paso">
            <b>¿No aparecen todas tus obras?</b> Descarga el <b>exportador</b> y ábrelo (doble clic) en la computadora donde tienes Neodata: lee directo
            las bases de Neodata de esa PC (<code>C:\NeodataWinPlusObras</code>), sin cambiar nada, y deja todas tus obras en
            <code>C:\NEODATAWinPlus\Archivos Intercambio\ACRINEO</code>. Luego da <b>«Volver a leer»</b> aquí.
            <a class="an-btn an-mini" id="anNeoExportador" href="acrineo-neodata-exportador.php" download><?= anIcono('descargar') ?>Descargar exportador (.bat)</a>
        </div>
        <div class="an-pegado-botones">
            <button type="button" class="an-btn an-primario an-mini" id="anNeoCarpeta"><?= anIcono('abrir') ?>Elegir carpeta</button>
            <button type="button" class="an-btn an-mini" id="anNeoReleer" hidden><?= anIcono('refrescar') ?>Volver a leer</button>
            <label class="an-btn an-mini"><?= anIcono('subir') ?>Subir archivos<input type="file" id="anNeoArchivos" accept=".zip,.json" multiple hidden></label>
            <input type="file" id="anNeoDirInput" webkitdirectory multiple hidden>
            <span class="an-ayuda" id="anNeoRuta"></span>
            <span class="an-flex"></span>
            <input type="search" class="an-neo-filtro" id="anNeoFiltro" placeholder="Filtrar obras…" aria-label="Filtrar obras">
        </div>
        <div class="an-tabla-cont an-neo-lista">
            <table class="an-tabla" aria-label="Obras de Neodata">
                <thead><tr><th class="an-neo-sel"><input type="checkbox" id="anNeoTodas" aria-label="Marcar todas"></th><th>Obra</th><th>Versión de Neodata</th><th class="num">Respaldos</th><th>Estado</th><th></th></tr></thead>
                <tbody id="anNeoFilas"><tr class="an-vacio"><td colspan="6">Elige la carpeta de Neodata o arrastra aquí los archivos .zip de intercambio.</td></tr></tbody>
            </table>
        </div>
    </div>
    <div class="an-calculo-pie">
        <span id="anNeoEstado" class="an-estado" role="status"></span>
        <span class="an-flex"></span>
        <button type="button" class="an-btn an-primario" id="anNeoImportar" disabled>Importar marcadas</button>
        <button type="button" class="an-btn an-texto" data-neo-cerrar>Cerrar</button>
    </div>
</dialog>
