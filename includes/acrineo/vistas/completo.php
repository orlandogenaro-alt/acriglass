<?php
// ACRINEO · Pestaña «Presupuesto completo» (F4) y panel «Opciones del presupuesto» (pestaña vertical de la izquierda).
// js/acrineo/hoja-completo.js · js/acrineo/hoja-opciones.js · includes/acrineo/completo.php
require_once __DIR__ . '/campos.php';
?>
<section class="an-completo-panel" id="anCompleto" role="tabpanel" aria-labelledby="anTabCompleto" hidden>
    <section class="an-ventana" aria-label="Todos los conceptos del presupuesto">
        <div class="an-barra an-barra-chica">
            <label class="an-buscar an-buscar-azul">
                <button type="button" class="an-buscar-ico an-buscar-modo" data-modo="contiene"></button>
                <input type="search" id="anCompletoQ" placeholder="Filtrar por partida, descripción de la partida, código, descripción…" aria-label="Filtrar el presupuesto completo">
            </label>
            <span class="an-ayuda" id="anCompletoConteo"></span>
            <span class="an-flex"></span>
            <span class="an-ayuda" id="anCompletoEstado" role="status"></span>
            <span class="an-rejilla-btns" data-rejilla="completo" data-tabla="anTablaCompleto">
                <button type="button" class="an-btn an-mini an-btn-cuenta" data-cols title="Columnas ocultas" aria-label="Columnas ocultas" aria-haspopup="true"><?= anIcono('ojo_no') ?><span>0</span></button>
                <button type="button" class="an-btn an-mini an-btn-cuenta" data-fijas title="Columnas fijas" aria-label="Columnas fijas" aria-haspopup="true"><?= anIcono('fijar') ?><span>0</span></button>
                <span class="an-menu-cont"><button type="button" class="an-btn an-primario an-icono an-redondo" data-menu title="Más opciones" aria-label="Más opciones" aria-haspopup="true" aria-expanded="false"><?= anIcono('mas') ?></button><div class="an-menu" role="menu" hidden></div></span>
            </span>
        </div>
        <div class="an-tabla-cont">
            <table class="an-tabla an-renglones an-completo" id="anTablaCompleto">
                <thead><tr>
                    <th class="an-col-sel" scope="col" title="Marca (M): los marcados sirven para el Cálculo «Sólo conceptos marcados»"><div class="an-th"><span>M</span></div></th>
                    <th scope="col" class="an-col-pa" title="Pendiente de analizar"><div class="an-th"><span>P.A.</span></div></th>
                    <th scope="col" class="num" title="Niveles de análisis de su matriz"><div class="an-th"><span>N</span></div></th>
                    <th scope="col"><div class="an-th"><span>Partida</span></div></th>
                    <th scope="col"><div class="an-th"><span>Descripción de la partida</span></div></th>
                    <th scope="col" class="num"><div class="an-th"><span>Renglón</span></div></th>
                    <th scope="col"><div class="an-th"><span>Código</span></div></th>
                    <th scope="col"><div class="an-th"><span>Descripción completa</span></div></th>
                    <th scope="col"><div class="an-th"><span>Unidad</span></div></th>
                    <th scope="col" class="num"><div class="an-th"><span>Tipo</span></div></th>
                    <th scope="col" class="num"><div class="an-th"><span>Cantidad</span></div></th>
                    <th scope="col" class="num"><div class="an-th"><span>Costo</span></div></th>
                    <th scope="col" class="num"><div class="an-th"><span>Precio</span></div></th>
                    <th scope="col" class="num"><div class="an-th"><span>Importe</span></div></th>
                    <th scope="col" class="num" title="Porcentaje del importe del presupuesto"><div class="an-th"><span>% Participación</span></div></th>
                    <th scope="col" class="num" title="Porcentaje acumulado"><div class="an-th"><span>Acumulado %</span></div></th>
                </tr></thead>
                <tbody id="anCompletoFilas"></tbody>
            </table>
        </div>
        <div class="an-pie"><span class="an-ayuda">Doble clic en un concepto abre su matriz · cantidad y costo se cambian aquí mismo (Enter o al salir del campo)</span><span class="an-flex"></span>Σ <b id="anCompletoTotal">$ 0.00</b></div>
    </section>
</section>

<!-- Opciones del presupuesto: pestaña vertical a la izquierda (como Neodata) -->
<button type="button" class="an-opciones-tab" id="anOpcionesBoton" aria-controls="anOpciones" aria-expanded="false">Opciones del Presupuesto</button>
<div class="an-opciones-velo" id="anOpcionesVelo" hidden></div>
<aside class="an-opciones" id="anOpciones" aria-label="Opciones del presupuesto" hidden>
    <div class="an-opciones-cab"><b>Opciones del Presupuesto</b><span class="an-flex"></span>
        <button type="button" class="an-btn an-icono an-texto" id="anOpcionesCerrar" title="Cerrar" aria-label="Cerrar"><?= anIcono('cerrar') ?></button></div>
    <label class="an-opciones-buscar"><?= anIcono('buscar') ?><input type="search" id="anOpcionesQ" placeholder="Buscar opción" aria-label="Buscar opción"></label>
    <nav class="an-opciones-lista" id="anOpcionesLista">
        <h3><span class="an-op-ico"><?= anIcono('buscar') ?></span>Consultas</h3>
        <button type="button" data-opcion="completo"><span class="an-op-ico"><?= anIcono('cuadricula') ?></span><span>Presupuesto completo (F4)<small>Consultas</small></span></button>
        <h3><span class="an-op-ico"><?= anIcono('refrescar') ?></span>Procesos</h3>
        <button type="button" data-opcion="calculo"><span class="an-op-ico"><?= anIcono('calc') ?></span><span>Cálculo (F10)<small>Procesos</small></span></button>
        <button type="button" data-opcion="detalle"><span class="an-op-ico"><?= anIcono('aviso') ?></span><span>Detalle del presupuesto (F12)<small>Otros</small></span></button>
        <button type="button" data-opcion="pegado"><span class="an-op-ico"><?= anIcono('portapapeles') ?></span><span>Pegado especial (Excel)<small>Otros</small></span></button>
        <h3><span class="an-op-ico">1×</span>Factores</h3>
        <button type="button" data-opcion="sobrecosto"><span class="an-op-ico">$</span><span>Sobrecosto (Ctrl + Shift + S)<small>Factores</small></span></button>
        <h3><span class="an-op-ico"><?= anIcono('grafica') ?></span>Reporte</h3>
        <button type="button" data-opcion="reportes"><span class="an-op-ico"><?= anIcono('imprimir') ?></span><span>Imprimir reportes (Ctrl + P)<small>Presupuesto, análisis de P.U., explosión de insumos</small></span></button>
        <button type="button" data-opcion="grafica"><span class="an-op-ico"><?= anIcono('grafica') ?></span><span>Gráfica de la explosión de insumos<small>Reporte</small></span></button>
    </nav>
</aside>
