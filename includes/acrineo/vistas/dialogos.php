<?php
// ACRINEO · Ventanas auxiliares: confirmación, búsqueda en catálogos, historial, compartir y vista previa de documentos.
require_once __DIR__ . '/campos.php';
?>
<!-- Confirmación (AcriNeo.ui.confirmar) -->
<dialog class="an-dialogo an-chico" id="anConfirmar" aria-labelledby="anConfirmarTitulo">
    <div class="an-titulo-barra"><h2 id="anConfirmarTitulo">Confirmar</h2></div>
    <div class="an-cuerpo"><p id="anConfirmarTexto"></p></div>
    <div class="an-botonera">
        <span class="an-flex"></span>
        <button type="button" class="an-btn" data-respuesta="no" id="anConfirmarNo">Cancelar</button>
        <button type="button" class="an-btn an-primario" data-respuesta="si" id="anConfirmarSi">Aceptar</button>
    </div>
</dialog>

<!-- Búsqueda en catálogos (js/acrineo/buscador.js) -->
<dialog class="an-dialogo an-buscador" id="anBuscador" aria-labelledby="anBuscadorTitulo">
    <div class="an-titulo-barra">
        <h2 id="anBuscadorTitulo">Buscar</h2>
        <button type="button" class="an-cerrar" data-cerrar aria-label="Cerrar"><?= anIcono('cerrar') ?></button>
    </div>
    <div class="an-cuerpo">
        <label class="an-buscar" style="max-width:none">
            <?= anIcono('buscar') ?>
            <input type="search" id="anBuscadorQ" placeholder="Escribe para filtrar…" aria-label="Buscar en el catálogo">
        </label>
        <div class="an-tabla-cont">
            <table class="an-tabla">
                <thead><tr><th><div class="an-th"><span>Nombre</span></div></th><th id="anBuscadorExtra"><div class="an-th"><span></span></div></th></tr></thead>
                <tbody id="anBuscadorFilas"></tbody>
            </table>
        </div>
        <div class="an-pie" style="border:none;background:none;padding:0">
            <span id="anBuscadorConteo"></span><span class="an-flex"></span>
            <button type="button" class="an-btn an-mini" id="anBuscadorMas" hidden>Ver más</button>
        </div>
        <form class="an-alta" id="anBuscadorAlta" hidden novalidate>
            <div class="an-campo" data-error-de="alta.nombre"><label for="anAltaNombre">Nueva empresa · Nombre:<i>*</i></label>
                <input type="text" id="anAltaNombre" maxlength="150" required><small class="an-error" hidden></small></div>
            <div class="an-campo" data-error-de="alta.rfc"><label for="anAltaRfc">RFC:</label>
                <input type="text" id="anAltaRfc" maxlength="13"><small class="an-error" hidden></small></div>
            <button type="submit" class="an-btn">Agregar</button>
        </form>
    </div>
    <div class="an-botonera">
        <span class="an-estado" id="anBuscadorEstado" role="status"></span>
        <button type="button" class="an-btn" data-cerrar>Cancelar</button>
        <button type="button" class="an-btn an-primario" id="anBuscadorElegir" disabled>Seleccionar</button>
    </div>
</dialog>

<!-- Historial -->
<dialog class="an-dialogo an-historial" id="anHistorial" aria-labelledby="anHistorialTitulo">
    <div class="an-titulo-barra">
        <h2 id="anHistorialTitulo">Historial del presupuesto</h2>
        <button type="button" class="an-cerrar" data-cerrar aria-label="Cerrar"><?= anIcono('cerrar') ?></button>
    </div>
    <div class="an-cuerpo" style="padding:0">
        <div class="an-tabla-cont" style="height:100%">
            <table class="an-tabla">
                <thead><tr>
                    <th><div class="an-th"><span>Fecha</span></div></th><th><div class="an-th"><span>Usuario</span></div></th>
                    <th><div class="an-th"><span>Acción</span></div></th><th><div class="an-th"><span>Campo</span></div></th>
                    <th><div class="an-th"><span>Valor anterior</span></div></th><th><div class="an-th"><span>Valor nuevo</span></div></th>
                    <th><div class="an-th"><span>IP</span></div></th>
                </tr></thead>
                <tbody id="anHistorialFilas"></tbody>
            </table>
        </div>
    </div>
</dialog>

<!-- Compartir -->
<dialog class="an-dialogo an-chico an-compartir" id="anCompartirDlg" aria-labelledby="anCompartirTitulo">
    <div class="an-titulo-barra">
        <h2 id="anCompartirTitulo">Compartir presupuesto</h2>
        <button type="button" class="an-cerrar" data-cerrar aria-label="Cerrar"><?= anIcono('cerrar') ?></button>
    </div>
    <div class="an-cuerpo">
        <p style="margin-bottom:8px">Enlace directo al presupuesto <b id="anCompartirNombre"></b>. Quien lo abra necesita iniciar sesión
            y tener permiso para consultar presupuestos de ACRINEO.</p>
        <input type="text" id="anCompartirUrl" readonly aria-label="Enlace del presupuesto">
    </div>
    <div class="an-botonera">
        <span class="an-estado" id="anCompartirEstado" role="status"></span>
        <button type="button" class="an-btn" data-cerrar>Cerrar</button>
        <button type="button" class="an-btn an-primario" id="anCompartirCopiar">Copiar enlace</button>
    </div>
</dialog>

<!-- Vista previa de documentos -->
<dialog class="an-dialogo an-vista" id="anVista" aria-labelledby="anVistaTitulo">
    <div class="an-titulo-barra">
        <h2 id="anVistaTitulo">Vista previa</h2>
        <button type="button" class="an-cerrar" data-cerrar aria-label="Cerrar"><?= anIcono('cerrar') ?></button>
    </div>
    <div class="an-cuerpo" style="padding:0">
        <p class="an-ayuda" id="anVistaNota" style="padding:8px 12px"></p>
        <div class="an-tabla-cont"><table class="an-tabla"><tbody id="anVistaFilas"></tbody></table></div>
    </div>
</dialog>
