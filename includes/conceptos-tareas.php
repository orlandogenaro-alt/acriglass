<?php
// Marcado de Conceptos/Tareas que comparten el presupuesto y la obra (lo maneja js/conceptos-tareas.js):
//   ctPanel()                lista / Gantt con sus botones
//   ctDialogos($usuarios)    ventana Agregar / Ver / Modificar Concepto-Tarea y la de adjuntos

function ctPanel(bool $oculto = false): void
{ ?>
<div class="ct-panel" id="ctPanel"<?= $oculto ? ' hidden' : '' ?>>
    <div class="ct-barra">
        <nav class="ct-tabs">
            <button type="button" class="ct-tab activo" data-ct="lista">☰ Conceptos/Tareas</button>
            <button type="button" class="ct-tab" data-ct="gantt">▤ Previsualización De Gantt</button>
        </nav>
        <span class="ct-resumen" id="ctResumen"></span>
        <button type="button" class="ct-btn" id="ctImportar" title="Vuelve a traer todos los conceptos de Materia Prima, Mano de Obra y Gastos de Operacion (incluso los que se quitaron de esta lista)">⤒ Importar Conceptos</button>
        <button type="button" class="ct-btn" id="ctAgregar">+ Agregar Concepto/Tarea</button>
    </div>
    <div class="ct-cuerpo">
        <div class="ct-lista" id="ctLista"></div>
        <div class="ct-gantt" id="ctGantt" hidden></div>
    </div>
</div>
<?php }

function ctDialogos(array $usuarios): void
{ ?>
<!-- ============ AGREGAR / VER / MODIFICAR CONCEPTO-TAREA ============ -->
<dialog class="ct-dialogo" id="ctDialogo">
    <form id="ctForm">
        <div class="hs-cabecera">
            <strong id="ctDlgTitulo">Agregar Concepto/Tarea</strong>
            <button type="button" class="hs-cerrar" data-ct-cerrar title="Cerrar">✕</button>
        </div>
        <div class="ct-barra">
            <button type="button" class="hs-btn" id="ctModificar" hidden>Modificar</button>
            <button type="submit" class="hs-btn principal" id="ctGuardar">Guardar Concepto/Tarea</button>
        </div>
        <fieldset class="ct-campos" id="ctCampos">
            <section class="ct-grupo">
                <h3>Datos del Concepto/Tarea</h3>
                <div class="ct-rejilla">
                    <label><span class="req">Se Agregará:</span>
                        <select id="ctTipo" required>
                            <option value="">Elije una opción</option>
                            <option>Concepto</option>
                            <option>Tarea</option>
                            <option>Hito</option>
                        </select>
                    </label>
                    <label>Agrupador: <input id="ctAgrupador" list="ctAgrupadores" placeholder="Elije un agrupador" autocomplete="off"></label>
                    <label>Responsable: <input id="ctResponsable" list="ctUsuarios" placeholder="Buscar Usuarios" autocomplete="off"></label>
                    <label class="ancho"><span class="req">Nombre:</span> <input id="ctNombre" list="ctCatalogo" placeholder="Concepto o tarea" required autocomplete="off"></label>
                    <label>Cantidad: <input type="number" id="ctCantidad" min="0" step="any" class="num"></label>
                    <label>Unidad: <input id="ctUnidad" list="ctUnidades" placeholder="Pieza, Lote, m²…" autocomplete="off"></label>
                    <label>Clave: <input id="ctClave" readonly tabindex="-1"></label>
                    <label class="ancho ct-desc">Descripción:
                        <textarea id="ctDescripcion" rows="4" placeholder="Se genera en automático con el concepto y los artículos del documento importado"></textarea>
                    </label>
                </div>
            </section>

            <section class="ct-grupo">
                <h3>Fechas de Inicio/Fin, Empleados y Costo</h3>
                <div class="ct-rejilla">
                    <label><span class="req">Inicio (Real):</span> <input type="datetime-local" id="ctIniReal" required></label>
                    <label><span class="req">Fin (Real):</span> <input type="datetime-local" id="ctFinReal" required></label>
                    <label>Duración (Real): <input id="ctDurReal" readonly tabindex="-1"></label>
                    <label><span class="req">Inicio (Cliente):</span> <input type="datetime-local" id="ctIniCli" required></label>
                    <label><span class="req">Fin (Cliente):</span> <input type="datetime-local" id="ctFinCli" required></label>
                    <label>Duración (Cliente): <input id="ctDurCli" readonly tabindex="-1"></label>
                    <label class="ancho2">Jornada/Turno propio (opcional):
                        <select id="ctJornada">
                            <option value="">Heredar jornada del elemento padre</option>
                            <option>L-V 08:00 a 18:00</option>
                            <option>L-S 08:00 a 14:00</option>
                            <option>L-S 07:00 a 17:00</option>
                        </select>
                    </label>
                    <label>Costo: <input id="ctMonto" class="num" inputmode="decimal" autocomplete="off"></label>
                    <label class="ancho">Predecesoras (claves que deben terminar antes, separadas por coma):
                        <input id="ctPredecesoras" placeholder="p. ej. MP-10-001, TA-10-002" autocomplete="off"></label>
                    <label class="ancho">Empleados: <input id="ctEmpleados" placeholder="Elije uno o más empleados (separados por coma)" autocomplete="off"></label>
                </div>
                <p class="ct-nota">ⓘ La duración laboral, horas laborables, horas-hombre y días-hombre se calcularán al guardar el proyecto (dependen de la jornada resuelta, las fechas y los empleados asignados).</p>
            </section>

            <section class="ct-grupo">
                <h3>Avance</h3>
                <div class="ct-rejilla">
                    <label>Avance (%): <input type="number" id="ctAvance" min="0" max="100" step="5" class="num"></label>
                    <label>Estatus: <input id="ctEstatus" readonly tabindex="-1" title="Se calcula con el avance y la fecha de Fin (Real)"></label>
                </div>
                <p class="ct-nota">ⓘ El avance de la obra se calcula con el avance de sus conceptos/tareas, ponderado por su costo. Una tarea con Fin (Real) vencido y sin terminar queda Atrasada.</p>
            </section>

            <section class="ct-grupo">
                <h3>Diagrama de Gantt</h3>
                <div class="ct-color-fila">
                    <label>Color Para Diagrama De Gantt: <input type="color" id="ctColor" value="#a7d7c5"></label>
                    <div class="ct-muestra" id="ctMuestra"></div>
                </div>
            </section>
        </fieldset>
        <div class="hs-pie">
            <span></span>
            <button type="button" class="hs-btn" data-ct-cerrar>Cancelar</button>
        </div>
    </form>
    <datalist id="ctAgrupadores"></datalist>
    <datalist id="ctCatalogo"></datalist>
    <datalist id="ctUnidades">
        <option value="Pieza"><option value="Lote"><option value="Servicio"><option value="Jornada">
        <option value="m²"><option value="ml"><option value="kg">
    </datalist>
    <datalist id="ctUsuarios">
        <?php foreach ($usuarios as $u): ?>
        <option value="<?= htmlspecialchars($u) ?>">
        <?php endforeach; ?>
    </datalist>
</dialog>

<!-- ============ ADJUNTAR ARCHIVOS A UN CONCEPTO-TAREA ============ -->
<dialog class="ct-dialogo adj-dialogo" id="adjDialogo">
    <div class="hs-cabecera">
        <strong>Adjuntar Archivos · <span id="adjTitulo"></span></strong>
        <button type="button" class="hs-cerrar" data-adj-cerrar title="Cerrar">✕</button>
    </div>
    <div class="ct-campos">
        <section class="ct-grupo">
            <h3>Agregar archivos</h3>
            <label class="adj-zona" id="adjZona">
                <input type="file" id="adjArchivos" multiple hidden>
                <span>📂 Arrastra aquí los archivos o <u>haz clic para elegirlos</u></span>
                <small>Planos, fotos, PDF, Excel, Word… hasta 25 MB por archivo.</small>
            </label>
            <p class="adj-estado" id="adjEstado"></p>
        </section>
        <section class="ct-grupo">
            <h3>Archivos del Concepto/Tarea</h3>
            <ul class="adj-lista" id="adjLista"></ul>
        </section>
    </div>
    <div class="hs-pie">
        <span></span>
        <button type="button" class="hs-btn" data-adj-cerrar>Cerrar</button>
    </div>
</dialog>
<?php }
