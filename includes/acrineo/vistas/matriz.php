<?php
// ACRINEO · Pestaña «Matriz» de la hoja: matriz de precio unitario de un concepto (js/acrineo/hoja-matriz.js).
// Se abre con doble clic en el concepto o con su botón P.U. Arriba los insumos de la matriz (lápiz = edición) y abajo
// el catálogo de insumos del sistema, de donde se copian con su «Cantidad a copiar».
require_once __DIR__ . '/campos.php';
$puedeMatriz = acrineoPuede('presupuestos.editar');
$icoUrl = '<svg class="i" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
$icoGuardar = '<svg class="i" viewBox="0 0 24 24"><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/></svg>';
$icoBillete = '<svg class="i" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/></svg>';
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
            <button type="button" class="an-btn an-icono an-btn-menu" id="anMatrizMenu" title="Mostrar las acciones" aria-label="Mostrar las acciones" aria-expanded="false" aria-controls="anMatrizRiel">
                <svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
            </button>
        </div>
        <div class="an-matriz-cuerpo">
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
        <!-- Acciones de la matriz: solo iconos; con la hamburguesa se despliegan con su nombre -->
        <nav class="an-matriz-riel" id="anMatrizRiel" aria-label="Acciones de la matriz">
            <?php if ($puedeMatriz): ?>
            <button type="button" class="an-riel-btn an-riel-primario" id="anMatrizAjustar" title="Ajuste del precio unitario"><?= $icoBillete ?><span>Ajustar precio unitario</span></button>
            <?php endif; ?>
            <button type="button" class="an-riel-btn" id="anMatrizAnterior" title="Matriz del concepto anterior de la partida"><svg class="i" viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg><span>Anterior</span></button>
            <button type="button" class="an-riel-btn" id="anMatrizSiguiente" title="Matriz del concepto siguiente de la partida"><svg class="i" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg><span>Siguiente</span></button>
            <button type="button" class="an-riel-btn" id="anMatrizRegresar" title="Regresar al presupuesto"><svg class="i" viewBox="0 0 24 24"><path d="M20 5v7a3 3 0 0 1-3 3H5M10 10l-5 5 5 5"/></svg><span>Regresar</span></button>
        </nav>
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

<?php if ($puedeMatriz): ?>
<!-- Ajuste del precio unitario: lleva el costo directo de la matriz al deseado ajustando las cantidades de los tipos marcados -->
<dialog class="an-dialogo an-chico an-ajuste" id="anAjuste" aria-labelledby="anAjusteTitulo">
    <div class="an-titulo-barra">
        <?= $icoBillete ?>
        <h2 id="anAjusteTitulo">Ajuste del precio unitario</h2>
        <button type="button" class="an-cerrar" data-ajuste-cerrar aria-label="Cerrar"><?= anIcono('cerrar') ?></button>
    </div>
    <div class="an-cuerpo">
        <div class="an-ajuste-fila">
            <span>Costo directo actual:</span>
            <b id="anAjusteActual">$ 0.00</b>
            <select id="anAjusteMoneda" aria-label="Moneda"></select>
        </div>
        <label class="an-ajuste-fila">
            <span>Costo directo deseado:</span>
            <input type="number" id="anAjusteDeseado" min="0" step="any" inputmode="decimal">
        </label>
        <fieldset class="an-ajuste-tipos">
            <legend>Tipos de insumos</legend>
            <label class="an-ajuste-todos"><input type="checkbox" id="anAjusteTodos" checked> Marcar todos</label>
            <div id="anAjusteTipos"></div>
        </fieldset>
        <p class="an-ayuda">Se ajustan las cantidades de los insumos de los tipos marcados; sus costos no cambian. Nada se guarda hasta GUARDAR.</p>
    </div>
    <div class="an-botonera">
        <span class="an-estado" id="anAjusteEstado" role="status"></span>
        <button type="button" class="an-btn an-primario" id="anAjusteAceptar">Aceptar</button>
        <button type="button" class="an-btn an-texto" data-ajuste-cerrar>Cancelar</button>
    </div>
</dialog>
<?php endif; ?>
