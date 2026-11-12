<?php
// ACRINEO · Ventana «Detalle del presupuesto» (la maneja js/acrineo/detalle-presupuesto.js).
// Cada control lleva data-campo="seccion.campo": con eso la ventana llena, recoge y marca errores sin repetir nombres.
require_once __DIR__ . '/campos.php';
$pestanas = ['presupuesto' => 'Presupuesto', 'generales' => 'Generales', 'documentos' => 'Documentos', 'licitacion' => 'Licitación',
             'ch' => 'C.H', 'calculo' => 'Cálculo', 'otros' => 'Otros'];
?>
<dialog class="an-dialogo an-detalle" id="anDetalle" aria-labelledby="anDetalleTitulo">
    <form id="anDetalleForm" novalidate autocomplete="off" class="an-app">
        <div class="an-titulo-barra">
            <span class="an-sucio" title="Existen cambios sin guardar"><?= anIcono('aviso') ?></span>
            <h2 id="anDetalleTitulo">Detalle del presupuesto:</h2>
            <button type="button" class="an-cerrar" id="anDetalleCerrar" aria-label="Cerrar" title="Cerrar"><?= anIcono('cerrar') ?></button>
        </div>

        <div class="an-pestanas" role="tablist" aria-label="Secciones del presupuesto">
            <?php foreach ($pestanas as $k => $t): ?>
            <button type="button" role="tab" id="an-tab-<?= $k ?>" aria-controls="an-panel-<?= $k ?>" data-pestana="<?= $k ?>"
                    aria-selected="<?= $k === 'presupuesto' ? 'true' : 'false' ?>" tabindex="<?= $k === 'presupuesto' ? '0' : '-1' ?>"><?= e($t) ?></button>
            <?php endforeach; ?>
        </div>

        <div class="an-cuerpo">
            <!-- PRESUPUESTO -->
            <section class="an-panel" role="tabpanel" id="an-panel-presupuesto" aria-labelledby="an-tab-presupuesto" data-panel="presupuesto">
                <div class="an-rejilla">
                    <?= anCampo('presupuesto.nombre') ?>
                    <div class="an-campo"><span class="an-etiqueta">Código:</span><input type="text" id="anCodigo" readonly tabindex="-1" placeholder="Se asigna al guardar"></div>
                    <?= anCampo('presupuesto.descripcion', ['clase' => 'an-completo']) ?>
                    <?= anCampo('presupuesto.direccion', ['clase' => 'an-completo']) ?>
                    <?= anCampo('presupuesto.colonia') ?>
                    <?= anCampo('presupuesto.codigo_postal') ?>
                    <?= anCampo('presupuesto.ciudad_id', ['rellena' => 'presupuesto.estado']) ?>
                    <?= anCampo('presupuesto.estado') ?>
                    <?= anCampo('presupuesto.telefono') ?>
                    <?= anCampo('presupuesto.correo') ?>
                    <?= anCampo('presupuesto.observaciones', ['clase' => 'an-completo']) ?>
                </div>
                <div class="an-separador">Clasificación en el catálogo</div>
                <div class="an-rejilla an-rejilla-3">
                    <?= anCampo('presupuesto.tipo', ['ayuda' => 'Agrupa el catálogo, p. ej. 01_Propios']) ?>
                    <?= anCampo('presupuesto.agrupador') ?>
                    <?= anCampo('presupuesto.estatus') ?>
                </div>
            </section>

            <!-- GENERALES -->
            <section class="an-panel" role="tabpanel" id="an-panel-generales" aria-labelledby="an-tab-generales" data-panel="generales" hidden>
                <div class="an-rejilla">
                    <?= anCampo('generales.responsable_id') ?>
                    <?= anCampo('generales.cargo_responsable') ?>
                    <?= anCampo('generales.empresa_id') ?>
                    <?= anCampo('generales.cliente_id', ['rellenaVacio' => 'generales.contacto_cliente']) ?>
                    <?= anCampo('generales.area_cliente') ?>
                    <?= anCampo('generales.departamento_cliente') ?>
                    <?= anCampo('generales.contacto_cliente') ?>
                    <?= anCampo('generales.vendedor_id') ?>
                    <?= anCampo('generales.region_id') ?>
                </div>
            </section>

            <!-- DOCUMENTOS (js/acrineo/documentos.js) -->
            <section class="an-panel" role="tabpanel" id="an-panel-documentos" aria-labelledby="an-tab-documentos" data-panel="documentos" hidden>
                <p class="an-ayuda" id="anDocAyuda" style="margin-bottom:10px">Hojas de cálculo (.xlsx, .xls, .ods), .csv o .pdf de hasta 4 MB.
                    Si el presupuesto es nuevo, al subir el primer documento se guarda primero.</p>
                <fieldset class="an-grupo-campos">
                    <legend>Documentos por presupuesto:</legend>
                    <?php $docTipos = [['libro_ch', null]]; include __DIR__ . '/documento-lugar.php'; ?>
                </fieldset>
                <fieldset class="an-grupo-campos">
                    <legend>Documentos por moneda:</legend>
                    <div class="an-subpestanas" role="tablist" aria-label="Moneda">
                        <button type="button" role="tab" data-doc-moneda-tab="1" aria-selected="true">MONEDA 1</button>
                        <button type="button" role="tab" data-doc-moneda-tab="2" aria-selected="false">MONEDA 2</button>
                    </div>
                    <?php foreach ([1, 2] as $moneda): ?>
                    <div data-doc-moneda="<?= $moneda ?>"<?= $moneda === 2 ? ' hidden' : '' ?>>
                        <?php $docTipos = [['libro_fasar', $moneda], ['libro_indirectos', $moneda]]; include __DIR__ . '/documento-lugar.php'; ?>
                    </div>
                    <?php endforeach; ?>
                </fieldset>
            </section>

            <!-- LICITACIÓN -->
            <section class="an-panel" role="tabpanel" id="an-panel-licitacion" aria-labelledby="an-tab-licitacion" data-panel="licitacion" hidden>
                <div class="an-rejilla">
                    <?= anCampo('licitacion.fecha_licitacion') ?>
                    <div></div>
                    <?= anCampo('licitacion.numero_licitacion', ['clase' => 'an-completo']) ?>
                    <?= anCampo('licitacion.lugar_celebracion', ['clase' => 'an-completo']) ?>
                </div>
                <fieldset class="an-grupo-campos" style="margin-top:14px">
                    <legend>Datos de convocatoria:</legend>
                    <div class="an-rejilla">
                        <?= anCampo('licitacion.numero_convocatoria', ['clase' => 'an-completo']) ?>
                        <?= anCampo('licitacion.tipo_licitacion', ['buscar' => 'tipos_licitacion']) ?>
                        <?= anCampo('licitacion.fecha_publicacion') ?>
                    </div>
                </fieldset>
                <fieldset class="an-grupo-campos">
                    <legend>Duración de la obra:</legend>
                    <div class="an-rejilla an-rejilla-3">
                        <?= anCampo('licitacion.fecha_inicio') ?>
                        <?= anCampo('licitacion.dias') ?>
                        <?= anCampo('licitacion.fecha_terminacion', ['ayuda' => 'Se calcula: el día de inicio cuenta como el primero.']) ?>
                    </div>
                </fieldset>
            </section>

            <!-- C.H. -->
            <section class="an-panel" role="tabpanel" id="an-panel-ch" aria-labelledby="an-tab-ch" data-panel="ch" hidden>
                <div class="an-ch">
                    <fieldset class="an-grupo-campos">
                        <legend>Porcentajes para C.H.:</legend>
                        <table class="an-ch-tabla">
                            <thead><tr><th scope="col">Elemento</th><th scope="col">Espera</th><th scope="col">Reserva</th></tr></thead>
                            <tbody>
                            <?php foreach (ACRINEO_CH_ELEMENTOS as $k => [$etiqueta]): ?>
                                <tr>
                                    <td><?= e($etiqueta) ?>:</td>
                                    <td><?= anCelda("ch.parametros.$k.espera", ACRINEO_CAMPO_PCT_CH, "$etiqueta · Espera %") ?></td>
                                    <td><?= anCelda("ch.parametros.$k.reserva", ACRINEO_CAMPO_PCT_CH, "$etiqueta · Reserva %") ?></td>
                                </tr>
                            <?php endforeach; ?>
                            </tbody>
                        </table>
                    </fieldset>
                    <div>
                        <?php foreach (ACRINEO_CH_GRUPOS as $grupo => $titulo): ?>
                        <fieldset class="an-grupo-campos">
                            <legend><?= e($titulo) ?>:</legend>
                            <?php foreach (ACRINEO_CH_FACTORES as $k => [$g, $etiqueta, $tipo]): if ($g !== $grupo) continue;
                                $def = $tipo === 'num' ? ACRINEO_CAMPO_FACTOR : ACRINEO_CAMPO_INDICADOR; $id = 'an-ch-' . str_replace('_', '-', $k); ?>
                            <div class="an-campo" data-error-de="ch.factores.<?= e($k) ?>">
                                <label for="<?= $id ?>"><?= e($etiqueta) ?>:</label>
                                <input type="<?= $tipo === 'num' ? 'number' : 'text' ?>" id="<?= $id ?>" data-campo="ch.factores.<?= e($k) ?>"<?= anAtributos($def) ?>>
                                <small class="an-error" hidden></small>
                            </div>
                            <?php endforeach; ?>
                        </fieldset>
                        <?php endforeach; ?>
                    </div>
                </div>
            </section>

            <!-- CÁLCULO -->
            <section class="an-panel" role="tabpanel" id="an-panel-calculo" aria-labelledby="an-tab-calculo" data-panel="calculo" hidden>
                <div class="an-rejilla" style="margin-bottom:14px"><?= anCampo('calculo.iva', ['etiqueta' => '% IVA']) ?></div>
                <fieldset class="an-grupo-campos">
                    <legend>Número de decimales para el redondeo de costos unitarios e importes:</legend>
                    <div class="an-rejilla"><?= anCampo('calculo.decimales_costos', ['etiqueta' => 'Debe ser entre 0 y 6']) ?></div>
                </fieldset>
                <fieldset class="an-grupo-campos">
                    <legend>Número de decimales para redondear cantidad en presupuesto:</legend>
                    <div class="an-rejilla"><?= anCampo('calculo.decimales_cantidades', ['etiqueta' => 'Debe ser entre 0 y 6']) ?></div>
                </fieldset>
                <fieldset class="an-grupo-campos">
                    <legend>Número de decimales para la explosión de insumos:</legend>
                    <div class="an-rejilla"><?= anCampo('calculo.decimales_explosion', ['etiqueta' => 'Debe ser entre 0 y 8']) ?></div>
                </fieldset>
            </section>

            <!-- OTROS -->
            <section class="an-panel" role="tabpanel" id="an-panel-otros" aria-labelledby="an-tab-otros" data-panel="otros" hidden>
                <fieldset class="an-grupo-campos">
                    <legend>Monedas:</legend>
                    <?php foreach ([1 => 'Primera', 2 => 'Segunda'] as $n => $titulo): ?>
                    <div class="an-rejilla an-rejilla-3" style="margin-bottom:10px">
                        <?php foreach (ACRINEO_CAMPOS_MONEDA as $campo => $def): $id = "an-moneda-$n-" . str_replace('_', '-', $campo); ?>
                        <div class="an-campo" data-error-de="monedas.<?= $n ?>.<?= $campo ?>">
                            <label for="<?= $id ?>"><?= e($titulo) ?> · <?= e($def['etiqueta']) ?>:<i aria-hidden="true">*</i></label>
                            <input type="<?= $def['tipo'] === 'decimal' ? 'number' : 'text' ?>" id="<?= $id ?>" data-campo="monedas.<?= $n ?>.<?= $campo ?>"<?= anAtributos($def) ?>>
                            <small class="an-error" hidden></small>
                        </div>
                        <?php endforeach; ?>
                    </div>
                    <?php endforeach; ?>
                </fieldset>
                <fieldset class="an-grupo-campos">
                    <legend>Partidas:</legend>
                    <div class="an-rejilla"><?= anCampo('configuracion.separador_partidas') ?></div>
                </fieldset>
                <fieldset class="an-grupo-campos">
                    <legend>Contenido:</legend>
                    <div class="an-rejilla"><?= anCampo('configuracion.contenido_plantilla_id', ['clase' => 'an-completo', 'ayuda' => 'Plantilla de presupuesto (Catalogos › Plantillas de presupuesto) con la que se armará la hoja del presupuesto.']) ?></div>
                </fieldset>
            </section>
        </div>

        <div class="an-botonera">
            <span class="an-estado" id="anDetalleEstado" role="status" aria-live="polite"></span>
            <button type="button" class="an-btn an-primario" id="anAceptar">Aceptar</button>
            <button type="button" class="an-btn an-texto" id="anAplicar">Aplicar</button>
        </div>
    </form>
</dialog>
