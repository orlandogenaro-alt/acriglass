<?php
// ACRINEO · Ventana «Matriz de precio unitario» de un concepto (js/acrineo/hoja-matriz.js)
require_once __DIR__ . '/campos.php';
$puedeMatriz = acrineoPuede('presupuestos.editar');
?>
<dialog class="an-dialogo an-detalle" id="anMatriz" aria-labelledby="anMatrizTitulo">
    <div class="an-app">
        <div class="an-titulo-barra">
            <span class="an-sucio" title="Existen cambios sin guardar"><?= anIcono('aviso') ?></span>
            <h2 id="anMatrizTitulo">Matriz de precio unitario</h2>
            <button type="button" class="an-cerrar" id="anMatrizCerrar" aria-label="Cerrar" title="Cerrar"><?= anIcono('cerrar') ?></button>
        </div>
        <div class="an-barra an-barra-chica">
            <span class="an-ayuda" id="anMatrizConcepto"></span>
            <span class="an-flex"></span>
            <?php if ($puedeMatriz): ?>
            <button type="button" class="an-btn an-mini an-primario" id="anMatrizInsumo">+ Insumo del catálogo</button>
            <button type="button" class="an-btn an-mini" id="anMatrizLibre">+ Renglón libre</button>
            <button type="button" class="an-btn an-mini" id="anMatrizActualizar" title="Toma el costo vigente del catálogo de insumos (no se guarda hasta GUARDAR)">Actualizar costos del catálogo</button>
            <button type="button" class="an-btn an-mini an-peligro" id="anMatrizQuitar" disabled>Quitar marcados</button>
            <?php endif; ?>
        </div>
        <div class="an-cuerpo" style="padding:0">
            <div class="an-tabla-cont" style="height:100%">
                <table class="an-tabla an-renglones an-matriz">
                    <thead><tr>
                        <th class="an-col-sel" scope="col"><div class="an-th"></div></th>
                        <th scope="col"><div class="an-th"><span>Tipo</span></div></th>
                        <th scope="col"><div class="an-th"><span>Código</span></div></th>
                        <th scope="col"><div class="an-th"><span>Descripción</span></div></th>
                        <th scope="col"><div class="an-th"><span>Unidad</span></div></th>
                        <th scope="col"><div class="an-th"><span>Cálculo</span></div></th>
                        <th scope="col" class="num"><div class="an-th"><span>Cantidad</span></div></th>
                        <th scope="col" class="num"><div class="an-th"><span>% Desp.</span></div></th>
                        <th scope="col" class="num"><div class="an-th"><span>Costo</span></div></th>
                        <th scope="col" class="num"><div class="an-th"><span>Importe</span></div></th>
                    </tr></thead>
                    <tbody id="anMatrizFilas"></tbody>
                </table>
            </div>
        </div>
        <div class="an-matriz-totales" id="anMatrizTotales" aria-live="polite"></div>
        <div class="an-botonera">
            <span class="an-estado" id="anMatrizEstado" role="status"></span>
            <button type="button" class="an-btn" id="anMatrizCancelar">Cerrar</button>
            <?php if ($puedeMatriz): ?>
            <button type="button" class="an-btn an-primario" id="anMatrizGuardar" disabled>Guardar</button>
            <?php endif; ?>
        </div>
    </div>
</dialog>
