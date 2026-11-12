<?php
// ACRINEO · Pestaña «Matriz» de la hoja: matriz de precio unitario de un concepto (js/acrineo/hoja-matriz.js).
// Se abre con doble clic en el concepto o con su botón P.U. Arriba los insumos de la matriz (lápiz = edición) y abajo
// el catálogo de insumos del sistema, de donde se copian con su «Cantidad a copiar».
require_once __DIR__ . '/campos.php';
$puedeMatriz = acrineoPuede('presupuestos.editar');
$icoUrl = '<svg class="i" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
$icoGuardar = '<svg class="i" viewBox="0 0 24 24"><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/></svg>';
$icoCopiar = '<svg class="i" viewBox="0 0 24 24"><path d="M3 11.5 21 4l-7.5 18-2.5-8z"/></svg>';
?>
<section class="an-matriz-panel" id="anMatriz" role="tabpanel" aria-labelledby="anTabMatriz" hidden>
    <!-- Encabezado: concepto -->
    <div class="an-matriz-cab">
        <span class="an-sucio" title="Existen cambios sin guardar"><?= anIcono('aviso') ?></span>
        <h2 id="anMatrizTitulo">Matriz de precio unitario</h2>
        <span id="anMatrizUrl"></span>
        <span class="an-flex"></span>
        <button type="button" class="an-btn-cab" id="anMatrizOcultarTexto" aria-pressed="false">Ocultar texto</button>
        <?php if ($puedeMatriz): ?>
        <button type="button" class="an-btn-cab an-icono" id="anMatrizGuardarCab" title="Guardar la matriz" aria-label="Guardar la matriz" disabled><?= $icoGuardar ?></button>
        <?php endif; ?>
    </div>
    <div class="an-matriz-texto" id="anMatrizTexto">
        <p id="anMatrizDesc"></p>
        <small class="an-ayuda" id="anMatrizConcepto"></small>
    </div>

    <!-- Insumos de la matriz -->
    <section class="an-ventana an-matriz-insumos" aria-label="Insumos de la matriz">
        <div class="an-barra an-barra-chica">
            <label class="an-buscar">
                <?= anIcono('buscar') ?>
                <input type="search" id="anMatrizQ" placeholder="Filtrar por código, descripción completa, unidad" aria-label="Filtrar los insumos de la matriz">
            </label>
            <span class="an-flex"></span>
            <?php if ($puedeMatriz): ?>
            <button type="button" class="an-btn an-icono" id="anMatrizEditar" title="Editar la matriz" aria-label="Editar la matriz" aria-pressed="false"><?= anIcono('editar') ?></button>
            <button type="button" class="an-btn an-icono" id="anMatrizDeshacer" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" disabled>↶</button>
            <button type="button" class="an-btn an-icono" id="anMatrizRehacer" title="Rehacer (Ctrl+Y)" aria-label="Rehacer" disabled>↷</button>
            <button type="button" class="an-btn an-icono" id="anMatrizGuardar" title="Guardar" aria-label="Guardar" disabled><?= $icoGuardar ?></button>
            <button type="button" class="an-btn an-icono" id="anMatrizCancelar" title="Cancelar los cambios" aria-label="Cancelar los cambios" disabled><?= anIcono('cerrar') ?></button>
            <button type="button" class="an-btn an-icono an-peligro" id="anMatrizQuitar" title="Quitar los marcados" aria-label="Quitar los marcados" disabled><?= anIcono('borrar') ?></button>
            <span class="an-sep-barra" aria-hidden="true"></span>
            <button type="button" class="an-btn an-mini" id="anMatrizLibre" title="Agrega un renglón que no está en el catálogo">+ Renglón libre</button>
            <button type="button" class="an-btn an-mini" id="anMatrizActualizar" title="Toma el costo vigente del catálogo de insumos (no se guarda hasta GUARDAR)">Actualizar costos</button>
            <?php endif; ?>
        </div>
        <div class="an-tabla-cont">
            <table class="an-tabla an-renglones an-matriz">
                <thead><tr>
                    <th class="an-col-sel" scope="col"><div class="an-th"><input type="checkbox" id="anMatrizTodos" aria-label="Marcar todos" disabled></div></th>
                    <th scope="col" class="num an-col-n"><div class="an-th"><span>Renglón</span></div></th>
                    <th scope="col"><div class="an-th"><span>Código</span></div></th>
                    <th scope="col"><div class="an-th"><span>Descripción completa</span></div></th>
                    <th scope="col"><div class="an-th"><span>Tipo</span></div></th>
                    <th scope="col"><div class="an-th"><span>Unidad</span></div></th>
                    <th scope="col" class="num"><div class="an-th"><span>Costo</span></div></th>
                    <th scope="col"><div class="an-th"><span>Cálculo</span></div></th>
                    <th scope="col" class="num"><div class="an-th"><span>Cantidad</span></div></th>
                    <th scope="col" class="num"><div class="an-th"><span>% Desp.</span></div></th>
                    <th scope="col" class="num"><div class="an-th"><span>Importe</span></div></th>
                </tr></thead>
                <tbody id="anMatrizFilas"></tbody>
            </table>
        </div>
        <div class="an-pie an-matriz-pie">
            <span># <b id="anMatrizConteo">0</b></span>
            <span class="an-estado" id="anMatrizEstado" role="status"></span>
            <span class="an-matriz-totales" id="anMatrizTotales" aria-live="polite"></span>
        </div>
    </section>

    <!-- Catálogo de insumos del sistema -->
    <section class="an-ventana an-matriz-catalogo" aria-label="Catálogo de insumos">
        <div class="an-barra an-barra-chica">
            <label class="an-buscar">
                <?= anIcono('buscar') ?>
                <input type="search" id="anInsumosQ" placeholder="Filtrar por código, descripción, unidad, familia…" aria-label="Filtrar el catálogo de insumos">
            </label>
            <span class="an-ayuda" id="anInsumosConteo"></span>
            <span class="an-flex"></span>
            <?php if ($puedeMatriz): ?>
            <button type="button" class="an-btn an-mini an-primario" id="anInsumosCopiar" disabled title="Copia los marcados a la matriz con su «Cantidad a copiar»"><?= $icoCopiar ?> Copiar a la matriz</button>
            <?php endif; ?>
        </div>
        <div class="an-tabla-cont">
            <table class="an-tabla an-insumos-tabla">
                <thead><tr>
                    <th class="an-col-sel" scope="col"><div class="an-th"></div></th>
                    <th scope="col"><div class="an-th"><span>Código</span></div></th>
                    <th scope="col" class="num"><div class="an-th"><span>Cantidad a copiar</span></div></th>
                    <th scope="col"><div class="an-th"><span>Descripción completa</span></div></th>
                    <th scope="col"><div class="an-th"><span>Unidad</span></div></th>
                    <th scope="col"><div class="an-th"><span>Tipo</span></div></th>
                    <th scope="col" class="num"><div class="an-th"><span>Costo</span></div></th>
                    <th scope="col"><div class="an-th"><span>Familia</span></div></th>
                    <th scope="col"><div class="an-th"><span>Proveedor</span></div></th>
                    <th scope="col"><div class="an-th"><span>Fecha precio</span></div></th>
                    <th scope="col"><div class="an-th"><span>Clave Microsip</span></div></th>
                </tr></thead>
                <tbody id="anInsumosFilas"></tbody>
            </table>
        </div>
        <div class="an-pie" id="anInsumosPie" hidden>
            <button type="button" class="an-btn an-mini" id="anInsumosMas">Ver más</button>
        </div>
    </section>
</section>
