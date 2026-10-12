<?php
require __DIR__ . '/includes/sesion.php';
require __DIR__ . '/includes/servicios.php';
require __DIR__ . '/includes/conceptos.php';
require __DIR__ . '/includes/estatus.php';
require __DIR__ . '/includes/membrete.php';

// Presupuesto existente a abrir (sin id = nuevo)
$presupuestoId = max(0, (int) ($_GET['id'] ?? 0));

// Vendedores de obra de AW; si no hay, los vendedores activos de Easy-Glass (API v1)
$vendedores = [];
if (!modoConfiguracion()) {
    try {
        $vendedores = array_column(bd_filas('AW', "select nombre from vendedores_obras where estatus = 'A' order by nombre"), 'nombre');
    } catch (Throwable $e) {
        error_log('AcriGlass presupuesto vendedores: ' . $e->getMessage());
    }
}
if (!$vendedores) {
    $r = api_http('EASYGLASS', 'GET', '/vendedores');
    if ($r['ok']) $vendedores = array_column($r['datos']['datos'] ?? [], 'nombre');
}
$vendedores = array_values(array_unique(array_filter(array_map('trim', $vendedores))));
if (!$vendedores) $vendedores = ['ALFREDO MARTINEZ'];

// Conceptos de Materia Prima / Mano de Obra / Gastos de Operacion (Administrador › Conceptos de …)
$conceptos = ['mp' => [], 'mo' => [], 'go' => []];
if (!modoConfiguracion()) {
    try {
        $conceptos = conceptosPresupuesto();
    } catch (Throwable $e) {
        error_log('AcriGlass presupuesto conceptos: ' . $e->getMessage());
    }
}

// Estatus del menú «Actualizar Estatus» (Administrador › Estatus de Presupuestos)
try {
    $estatus = estatusPresupuesto();
} catch (Throwable $e) {
    error_log('AcriGlass presupuesto estatus: ' . $e->getMessage());
    $estatus = array_map(fn($d) => $d + ['sistema' => false], ACRI_ESTATUS_DEFECTO);
}

// Hoja membretada de Imprimir / Imprimir Detalle (Administrador › Hoja Membretada)
try {
    $membrete = membreteImpresion();
} catch (Throwable $e) {
    error_log('AcriGlass presupuesto membrete: ' . $e->getMessage());
    $membrete = ACRI_MEMBRETE_DEFECTO + ['logo' => imagenSistema('logo'), 'logo_propio' => false];
}

// Un presupuesto guardado se abre en solo lectura; «Modificar» lo habilita con este permiso
$puedeModificar = tienePermiso('MODIFICAR_SUGERIDO_OBRA', 'ADMIN_USER');
$puedeRegistrarObra = tienePermiso('NUEVO_OBRA', 'ADMIN_USER');

// Secciones del presupuesto (pestañas verticales)
$secciones = [
    'mp' => 'Materia Prima',
    'mo' => 'Mano de Obra',
    'go' => 'Gastos de Operacion',
    'ct' => 'Conceptos/Tareas',
];
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Presupuesto de Obra · AcriGlass</title>
    <meta name="acri-token" content="<?= e($_SESSION['csrf']) ?>">
    <link rel="icon" href="<?= e(imagenSistema('favicon')) ?>">
    <link rel="stylesheet" href="<?= recurso('css/presupuesto.css') ?>">
    <link rel="stylesheet" href="<?= recurso('css/formato-presupuesto.css') ?>">
    <script src="<?= recurso('js/tema.js') ?>"></script>
</head>
<body data-presupuesto="<?= $presupuestoId ?>">

<!-- Barra de herramientas -->
<header class="toolbar">
    <button class="tb" data-accion="guardar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h8V3"/><path d="M8 21v-7h8v7"/></svg>
        <span>Guardar</span>
    </button>
    <button class="tb" data-accion="guardar-cerrar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M12 21H5V3h11l3 3v6"/><path d="M8 3v5h8V3"/><path d="M14 18l2.5 2.5L21 16"/></svg>
        <span>Guardar y Cerrar</span>
    </button>
    <span class="sep"></span>
    <div class="tb-drop">
        <button class="tb" data-accion="imprimir">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>
            <span>Imprimir <small>▾</small></span>
        </button>
        <div class="menu">
            <button data-imprimir="normal">Imprimir</button>
            <button data-imprimir="detalle">Imprimir Detalle</button>
        </div>
    </div>
    <button class="tb" data-accion="modificar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/></svg>
        <span>Modificar</span>
    </button>
    <button class="tb" data-accion="duplicar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>
        <span>Duplicar</span>
    </button>
    <span class="sep"></span>
    <div class="tb-drop">
        <button class="tb" data-accion="estatus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9"/><path d="M18.5 3v4h-4M5.5 21v-4h4"/></svg>
            <span>Actualizar Estatus <small>▾</small></span>
        </button>
        <div class="menu menu-estatus">
            <?php foreach ($estatus as $e): if (!$e['activo']) continue; ?>
            <button data-estatus="<?= e($e['nombre']) ?>" class="c-<?= e($e['color']) ?>"<?= $e['descripcion'] !== '' ? ' title="' . e($e['descripcion']) . '"' : '' ?>>
                <i></i><?= e($e['descripcion'] !== '' ? $e['descripcion'] : $e['nombre']) ?>
            </button>
            <?php endforeach; ?>
        </div>
    </div>
    <button class="tb" data-accion="registrar-obra">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9.5 21v-6h5v6M9 10.5h.01M15 10.5h.01"/></svg>
        <span>Registrar Obra</span>
    </button>
    <span class="sep"></span>
    <button class="tb peligro" data-accion="cancelar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>
        <span>Cancelar</span>
    </button>
    <button class="tb peligro" data-accion="eliminar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
        <span>Eliminar</span>
    </button>
    <span class="sep"></span>
    <button class="tb" data-accion="cerrar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        <span>Cerrar</span>
    </button>

    <span class="modo" id="modo" hidden title="Presiona «Modificar» para cambiar el presupuesto">🔒 Solo lectura</span>
    <div class="estatus c-<?= e(array_column($estatus, 'color', 'nombre')['Pendiente'] ?? 'ambar') ?>" id="estatus">Pendiente</div>
    <span class="sep"></span>
    <button type="button" class="tb" data-tema="auto">
        <svg class="i-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>
        <svg class="i-sol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        <svg class="i-luna" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>
        <span>Automático</span>
    </button>
</header>

<!-- Pestañas del documento -->
<nav class="doc-tabs">
    <button class="doc-tab activo" data-vista="documento">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="1.5" width="10" height="13" rx="1"/><path d="M5.5 5h5M5.5 8h5M5.5 11h3"/></svg>
        Documento
    </button>
    <button class="doc-tab" data-vista="sugeridos">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="2.5" width="13" height="10" rx="1"/><path d="M4 6h8M4 9h4"/><circle cx="12.5" cy="12.5" r="2.5" fill="#22c55e" stroke="none"/></svg>
        Sugeridos relacionados
    </button>
</nav>

<!-- ============ VISTA: DOCUMENTO ============ -->
<section class="vista visible" data-vista="documento">

    <!-- Encabezado -->
    <div class="encabezado">
        <div class="enc-izq">
            <label>Cliente:   <input type="text" id="cliente"></label>
            <label>Email:
                <span class="con-boton">
                    <input type="email" id="email">
                    <button type="button" class="mini" id="buscarHubspot" title="Buscar el contacto en HubSpot">
                        <svg viewBox="0 0 16 16"><circle cx="10" cy="9" r="3" fill="none" stroke="#f26b3a" stroke-width="2"/><path d="M3 3l5 4M3 14l5-3M10 3v3" stroke="#f26b3a" stroke-width="2"/></svg>
                    </button>
                </span>
            </label>
            <label>Proyecto:  <input type="text" id="proyecto"></label>
            <label>Ubicacion: <input type="text" id="ubicacion"></label>
        </div>

        <div class="enc-der">
            <div class="negocio">Id de Negocio: <a href="#" id="idNegocio" title="Abrir el negocio en HubSpot">0</a></div>
            <div class="fila">
                <label class="corto">Folio <input type="text" id="folio" value="0" readonly class="num"></label>
                <label class="corto">Fecha: <input type="date" id="fecha" value="<?= date('Y-m-d') ?>"></label>
            </div>
            <label class="vendedor">Vendedor:
                <select id="vendedor">
                    <?php foreach ($vendedores as $v): ?>
                    <option><?= htmlspecialchars($v) ?></option>
                    <?php endforeach; ?>
                </select>
            </label>
            <div class="obra"><strong>OBRA:</strong> <span id="obra"></span></div>
        </div>
    </div>

    <!-- Conceptos -->
    <div class="conceptos">
        <nav class="sec-tabs">
            <?php $primero = true; foreach ($secciones as $clave => $nombre): ?>
            <button class="sec-tab<?= $primero ? ' activo' : '' ?>" data-sec="<?= $clave ?>"><span><?= $nombre ?></span></button>
            <?php $primero = false; endforeach; ?>
        </nav>

        <div class="sec-cuerpo">
            <div class="sec-titulo">
                <strong id="secNombre">Materia Prima:</strong>
                <span id="secAyuda">Ctrl + I para agregar un nuevo Concepto</span>
            </div>

            <!-- Conceptos/Tareas: se generan solos con lo capturado en MP / MO / GO -->
            <div class="ct-panel" id="ctPanel" hidden>
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

            <div class="grid-caja">
                <table class="grid" id="grid">
                    <thead>
                        <tr>
                            <th class="sel-col"></th>
                            <th class="c-id">ID</th>
                            <th class="c-concepto">Concepto</th>
                            <th class="c-num">Presupuesto</th>
                            <th class="c-num">Subtotal</th>
                            <th class="c-num">Total</th>
                            <th class="c-pct">%</th>
                            <th class="c-imp">Importar</th>
                            <th class="c-folio">Folio.Doc.</th>
                            <th class="c-del"></th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Totales -->
    <div class="pie">
        <div class="t-fila t-primo">
            <span>Materia Prima:</span> <output id="tMP">0</output>
            <b>+</b>
            <span>Mano de Obra:</span> <output id="tMO">0</output>
            <b>=</b>
            <span>Costo Primo:</span> <output id="tCP">0</output>
        </div>

        <div class="pie-izq">
            <label class="desc">Descripcion:
                <textarea id="descripcion"></textarea>
            </label>
        </div>

        <div class="totales">
            <div class="t-fila"><b>+</b><span>Gastos de Operacion:</span> <output id="tGO">0</output></div>
            <div class="t-fila">
                <b>+</b><span>Utilidad Neta:</span>
                <input type="number" id="pctUtilidad" value="40" min="0" step="0.01" class="num pct" title="% de utilidad">
                <output id="tUT">0</output>
            </div>
            <div class="t-fila">
                <b>=</b><span>Subtotal:</span>
                <input type="text" id="tSUB" class="num" value="0" readonly>
                <button type="button" class="mini" id="editarSubtotal" title="Capturar subtotal manualmente">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/></svg>
                </button>
            </div>
            <div class="t-fila"><b>+</b><span>IVA (<span id="pctIvaTxt">16</span>%):</span> <output id="tIVA">0</output></div>
            <div class="t-fila"><b>=</b><span>Total:</span> <output id="tTOT" class="fuerte">0</output></div>
        </div>
    </div>
</section>

<!-- ============ VISTA: SUGERIDOS ============ -->
<section class="vista" data-vista="sugeridos">
    <div class="vacio">
        <p>Sugeridos relacionados</p>
        <small>Aquí aparecerán presupuestos y obras similares cuando esté conectada la base de datos.</small>
    </div>
</section>

<!-- ============ BUSCAR EN HUBSPOT ============ -->
<dialog class="hs-dialogo" id="hsDialogo">
    <div class="hs-cabecera">
        <svg viewBox="0 0 16 16"><circle cx="10" cy="9" r="3" fill="none" stroke="#f26b3a" stroke-width="2"/><path d="M3 3l5 4M3 14l5-3M10 3v3" stroke="#f26b3a" stroke-width="2"/></svg>
        <strong>Buscar en HubSpot</strong>
        <button type="button" class="hs-cerrar" id="hsCerrar" title="Cerrar">✕</button>
    </div>
    <form class="hs-buscar" id="hsForm">
        <input type="search" id="hsTexto" placeholder="Correo, nombre, teléfono o empresa" autocomplete="off">
        <button type="submit" class="hs-btn">🔎 Buscar</button>
    </form>
    <p class="hs-estado" id="hsEstado"></p>

    <div class="hs-seccion">1. Contacto</div>
    <div class="hs-tabla">
        <table class="hs-grid">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Empresa</th><th></th></tr></thead>
            <tbody id="hsContactos"><tr><td colspan="5" class="hs-vacio">Escribe el correo y presiona Buscar.</td></tr></tbody>
        </table>
    </div>

    <div class="hs-seccion">2. Negocio (deal) del contacto</div>
    <div class="hs-tabla">
        <table class="hs-grid">
            <thead><tr><th>Id</th><th>Negocio</th><th>Etapa</th><th class="num">Monto</th><th>Creado</th><th>Cierre</th><th></th></tr></thead>
            <tbody id="hsNegocios"><tr><td colspan="7" class="hs-vacio">Selecciona un contacto.</td></tr></tbody>
        </table>
    </div>

    <div class="hs-pie">
        <span id="hsSeleccion"></span>
        <button type="button" class="hs-btn" id="hsCancelar">Cancelar</button>
        <button type="button" class="hs-btn principal" id="hsUsar" disabled>Usar</button>
    </div>
</dialog>

<!-- ============ AGREGAR / MODIFICAR CONCEPTO-TAREA ============ -->
<dialog class="ct-dialogo" id="ctDialogo">
    <form id="ctForm">
        <div class="hs-cabecera">
            <strong id="ctDlgTitulo">Agregar Concepto/Tarea</strong>
            <button type="button" class="hs-cerrar" data-ct-cerrar title="Cerrar">✕</button>
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
                    <label>Costo: <input id="ctMonto" readonly tabindex="-1" class="num"></label>
                    <label class="ancho">Empleados: <input id="ctEmpleados" placeholder="Elije uno o más empleados (separados por coma)" autocomplete="off"></label>
                </div>
                <p class="ct-nota">ⓘ La duración laboral, horas laborables, horas-hombre y días-hombre se calcularán al guardar el proyecto (dependen de la jornada resuelta, las fechas y los empleados asignados).</p>
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
            <button type="submit" class="hs-btn principal" id="ctGuardar">Guardar Concepto/Tarea</button>
        </div>
    </form>
    <datalist id="ctAgrupadores"></datalist>
    <datalist id="ctCatalogo"></datalist>
    <datalist id="ctUnidades">
        <option value="Pieza"><option value="Lote"><option value="Servicio"><option value="Jornada">
        <option value="m²"><option value="ml"><option value="kg">
    </datalist>
    <datalist id="ctUsuarios">
        <?php foreach ($vendedores as $v): ?>
        <option value="<?= htmlspecialchars($v) ?>">
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

<!-- ============ AUTORIZACIÓN DE OTRO USUARIO (Dialog225) ============ -->
<dialog class="hs-dialogo au-dialogo" id="auDialogo">
    <form id="auForm">
        <div class="hs-cabecera">
            <strong>Autorización</strong>
            <button type="button" class="hs-cerrar" data-au-cerrar title="Cerrar">✕</button>
        </div>
        <div class="au-campos">
            <p id="auMensaje"></p>
            <label>Usuario que autoriza: <input id="auUsuario" autocomplete="off" required></label>
            <label>Contraseña: <input type="password" id="auContrasena" autocomplete="off" required></label>
        </div>
        <div class="hs-pie">
            <span></span>
            <button type="button" class="hs-btn" data-au-cerrar>Cancelar</button>
            <button type="submit" class="hs-btn principal">Autorizar</button>
        </div>
    </form>
</dialog>

<!-- Formato impreso (Imprimir / Imprimir Detalle): solo se ve al imprimir -->
<div id="formatoImpresion"></div>

<script>
    window.ACRI_MEMBRETE = <?= json_encode($membrete, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.ACRI_USUARIO = <?= json_encode($usuarioSesion, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.ACRI_PUEDE_MODIFICAR = <?= $puedeModificar ? 'true' : 'false' ?>;
    window.ACRI_PUEDE_REGISTRAR_OBRA = <?= $puedeRegistrarObra ? 'true' : 'false' ?>;
    window.ACRI_ESTATUS = <?= json_encode(array_column($estatus, 'color', 'nombre'), JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.ACRI_CONCEPTOS = <?= json_encode($conceptos, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
</script>
<script src="<?= recurso('js/formato-presupuesto.js') ?>"></script>
<script src="<?= recurso('js/presupuesto.js') ?>"></script>
</body>
</html>
