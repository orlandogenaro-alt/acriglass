<?php
// ACRINEO · Ventana «Cálculo: <presupuesto>» (botón de cuadrícula de la hoja) y su resultado: explosión de insumos y
// errores potenciales (js/acrineo/hoja-calculo.js · includes/acrineo/calculo.php).
require_once __DIR__ . '/campos.php';
$icoCalc = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/></svg>';
?>
<dialog class="an-dialogo an-calculo-dlg" id="anCalculo" aria-labelledby="anCalculoTitulo">
    <form method="dialog" id="anCalculoForm" novalidate>
        <div class="an-titulo-barra"><?= $icoCalc ?><h2 id="anCalculoTitulo">Cálculo</h2>
            <button type="button" class="an-btn-cab an-icono" data-calculo-cerrar title="Cerrar" aria-label="Cerrar"><?= anIcono('cerrar') ?></button></div>
        <div class="an-calculo-cuerpo">
            <div class="an-calculo-col">
                <fieldset class="an-calculo-caja">
                    <legend>Tipo de explosión de insumos</legend>
                    <label class="an-check"><input type="radio" name="tipo_explosion" value="todo"> De todo el presupuesto</label>
                    <label class="an-check" title="Los conceptos marcados en el catálogo de conceptos (abajo)"><input type="radio" name="tipo_explosion" value="marcados"> Sólo conceptos marcados del presupuesto</label>
                    <label class="an-check"><input type="radio" name="tipo_explosion" value="no"> No explotar insumos</label>
                </fieldset>
                <fieldset class="an-calculo-caja">
                    <legend>Opciones de cálculo adicionales</legend>
                    <label class="an-check"><input type="checkbox" name="errores_potenciales"> Mostrar errores potenciales</label>
                    <div class="an-calculo-fila">
                        <label class="an-check" title="Recalcula el costo horario del equipo con esta tasa de interés anual"><input type="checkbox" name="ch_misma_tasa"> Calcular costos horarios con la misma tasa</label>
                        <span class="an-calculo-num"><input type="number" name="ch_tasa" min="0" max="100" step="0.01" inputmode="decimal" aria-label="Tasa de interés de los costos horarios"> %</span>
                    </div>
                    <div class="an-calculo-fila">
                        <label class="an-check" title="Los insumos del catálogo toman el precio vigente en esa fecha"><input type="checkbox" name="asignar_fecha"> Asignar fecha a insumos</label>
                        <span class="an-calculo-num an-calculo-fecha"><input type="date" name="fecha_insumos" aria-label="Fecha de los insumos"></span>
                    </div>
                </fieldset>
                <label class="an-check an-calculo-suelto" title="Todavía no está disponible el envío por correo"><input type="checkbox" name="respaldo_correo" disabled> Enviar respaldo por correo <small class="an-ayuda">(próximamente)</small></label>
            </div>
            <div class="an-calculo-col">
                <fieldset class="an-calculo-caja">
                    <legend>Parámetros monedas</legend>
                    <label class="an-check"><input type="radio" name="moneda" value="1"> <span data-moneda="1">Moneda 1</span></label>
                    <label class="an-check"><input type="radio" name="moneda" value="2"> <span data-moneda="2">Moneda 2</span></label>
                    <div class="an-calculo-fila"><b>Decimales para costos unitarios e importes</b>
                        <span class="an-calculo-num"><input type="number" name="decimales_costos" min="0" max="6" step="1" inputmode="numeric" aria-label="Decimales para costos unitarios e importes"></span></div>
                </fieldset>
                <fieldset class="an-calculo-caja">
                    <legend>Opciones de explosión</legend>
                    <label class="an-check"><input type="checkbox" name="explosion_x_concepto"> Calcular explosión de insumos x concepto</label>
                </fieldset>
                <fieldset class="an-calculo-caja">
                    <legend>Parámetros de explosión</legend>
                    <label class="an-check" title="El equipo (EQ) que tiene su propia matriz se explota en sus componentes"><input type="checkbox" name="explotar_ch"> Explotar insumos de costos horarios</label>
                    <label class="an-check" title="Los insumos con su propia matriz se quedan como un solo insumo"><input type="checkbox" name="no_explotar_integrados"> No explotar insumos integrados</label>
                    <div class="an-calculo-fila"><b>Decimales para explosión de insumos</b>
                        <span class="an-calculo-num"><input type="number" name="decimales_explosion" min="0" max="8" step="1" inputmode="numeric" aria-label="Decimales para explosión de insumos"></span></div>
                </fieldset>
            </div>
        </div>
        <div class="an-calculo-pie">
            <span id="anCalculoEstado" class="an-estado" role="status"></span>
            <span class="an-flex"></span>
            <button type="submit" class="an-btn an-primario" id="anCalculoAceptar">Aceptar</button>
            <button type="button" class="an-btn an-texto" data-calculo-cerrar>Cancelar</button>
        </div>
    </form>
</dialog>

<dialog class="an-dialogo an-explosion-dlg" id="anExplosion" aria-labelledby="anExplosionTitulo">
    <div class="an-titulo-barra"><h2 id="anExplosionTitulo">Resultado del cálculo</h2>
        <button type="button" class="an-btn-cab" id="anExplosionExcel" title="Exportar la explosión a Excel"><?= anIcono('descargar') ?>Excel</button>
        <button type="button" class="an-btn-cab an-icono" data-explosion-cerrar title="Cerrar" aria-label="Cerrar"><?= anIcono('cerrar') ?></button></div>
    <div class="an-explosion-cuerpo" id="anExplosionCuerpo"></div>
</dialog>
