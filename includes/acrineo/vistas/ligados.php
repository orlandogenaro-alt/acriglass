<?php
// ACRINEO · Ventana «Facturas y Easy-Glass» del presupuesto: busca facturas y pedidos de Microsip y presupuestos de
// Easy-Glass (la misma búsqueda de Asignar Cotización de Obras) y los liga al presupuesto para comparar contra su precio.
// js/acrineo/hoja-ligados.js · includes/acrineo/ligados.php
require_once __DIR__ . '/campos.php';
?>
<dialog class="an-dialogo an-ligados-dlg" id="anLigados" aria-labelledby="anLigadosTitulo">
    <div class="an-titulo-barra"><?= anIcono('ligar') ?><h2 id="anLigadosTitulo">Facturas y Easy-Glass del presupuesto</h2>
        <button type="button" class="an-btn-cab an-icono" data-lg-cerrar title="Cerrar" aria-label="Cerrar"><?= anIcono('cerrar') ?></button></div>
    <div class="an-lg-cuerpo">
        <div class="an-lg-resumen" id="anLgResumen"></div>

        <section class="an-lg-seccion">
            <h3>Ligados a este presupuesto</h3>
            <div class="an-tabla-cont an-lg-lista">
                <table class="an-tabla" aria-label="Folios ligados">
                    <thead><tr><th>Origen</th><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Detalle</th><th class="num">Total</th><th>Estatus</th><th>Ligó</th><th></th></tr></thead>
                    <tbody id="anLgFilas"><tr class="an-vacio"><td colspan="9">Cargando…</td></tr></tbody>
                </table>
            </div>
        </section>

        <section class="an-lg-seccion" id="anLgBuscarSec">
            <h3>Ligar una factura o folio</h3>
            <label class="an-buscar an-lg-buscar">
                <span class="an-buscar-ico"><?= anIcono('buscar') ?></span>
                <input type="search" id="anLgQ" placeholder="Folio de factura, pedido o Easy-Glass (A2080, EG9815, 9815), cliente o descripción…" aria-label="Buscar folio" autocomplete="off">
            </label>
            <div class="an-tabla-cont an-lg-lista">
                <table class="an-tabla" aria-label="Resultados de la búsqueda">
                    <thead><tr><th>Origen</th><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Detalle</th><th class="num">Total</th><th>Estatus</th><th></th></tr></thead>
                    <tbody id="anLgResultados"><tr class="an-vacio"><td colspan="8">Escribe al menos 2 letras o números para buscar en Microsip y Easy-Glass (últimos 24 meses).</td></tr></tbody>
                </table>
            </div>
        </section>
    </div>
    <div class="an-calculo-pie">
        <span id="anLgEstado" class="an-estado" role="status"></span>
        <span class="an-flex"></span>
        <button type="button" class="an-btn an-texto" data-lg-cerrar>Cerrar</button>
    </div>
</dialog>
