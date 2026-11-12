<?php
// ACRINEO · Ventana «Catálogo Unidades» (js/acrineo/unidades.js)
require_once __DIR__ . '/campos.php';
?>
<dialog class="an-dialogo an-buscador an-unidades" id="anUnidades" aria-labelledby="anUnidadesTitulo">
    <div class="an-titulo-barra">
        <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>
        <h2 id="anUnidadesTitulo">Catálogo Unidades</h2>
        <button type="button" class="an-cerrar" data-unidades-cerrar aria-label="Cerrar"><?= anIcono('cerrar') ?></button>
    </div>
    <div class="an-cuerpo">
        <label class="an-buscar" style="max-width:none">
            <?= anIcono('buscar') ?>
            <input type="search" id="anUnidadesQ" placeholder="Filtrar por cualquier columna" aria-label="Filtrar unidades">
        </label>
        <div class="an-tabla-cont">
            <table class="an-tabla">
                <thead><tr>
                    <th scope="col"><div class="an-th"><span>Unidad*</span></div></th>
                    <th scope="col"><div class="an-th"><span>Descripción</span></div></th>
                    <th scope="col" class="an-col-acc"><div class="an-th"></div></th>
                </tr></thead>
                <tbody id="anUnidadesFilas"></tbody>
            </table>
        </div>
        <div class="an-pie" style="border:none;background:none;padding:0">
            <span># <b id="anUnidadesTotal">0</b></span>
            <span class="an-flex"></span>
            <button type="button" class="an-btn an-mini" id="anUnidadNueva" hidden>+ Nueva unidad</button>
        </div>
    </div>
    <div class="an-botonera">
        <span class="an-estado" id="anUnidadesEstado" role="status"></span>
        <button type="button" class="an-btn an-primario" id="anUnidadesAceptar" disabled>Aceptar</button>
        <button type="button" class="an-btn an-texto" data-unidades-cerrar>Cancelar</button>
    </div>
</dialog>
