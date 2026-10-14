<?php
require __DIR__ . '/includes/sesion.php';
require __DIR__ . '/includes/servicios.php';
require __DIR__ . '/includes/conceptos.php';
require __DIR__ . '/includes/estatus.php';
require __DIR__ . '/includes/membrete.php';
require __DIR__ . '/includes/conceptos-tareas.php';

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
$fijos = ['mano_obra' => ACRI_CONCEPTOS_FIJOS['mano_obra']['descripcion'], 'comisiones' => ACRI_CONCEPTOS_FIJOS['comisiones']['descripcion']];
// Empleados (Mano de Obra × días) y tipos de empleado (comisiones) del Form46
$empleados = $tiposComision = [];
// % de Utilidad Neta por defecto: parámetro de costos 101 (Form46.carga_inicial)
$utilidadDefecto = 40;
if (!modoConfiguracion()) {
    try {
        $conceptos = conceptosPresupuesto();
        $fijos = conceptosFijosNombres($conceptos);
    } catch (Throwable $e) {
        error_log('AcriGlass presupuesto conceptos: ' . $e->getMessage());
    }
    try {
        $empleados = bd_filas('AW', "select empleado_id, numero_empleado, nombre, sueldo_diario from empleados_obra
                                      where estatus = 'A' order by nombre");
        $tiposComision = bd_filas('AW', 'select tipo_empleado_id, nombre, porcentaje from tipos_empleados_comisiones order by nombre');
    } catch (Throwable $e) {
        error_log('AcriGlass presupuesto empleados: ' . $e->getMessage());
    }
    try {
        $v = bd_valor('AW', 'select valor from parametros_costos_sug where clave = 101');
        if (is_numeric($v) && $v >= 0 && $v < 100) $utilidadDefecto = round((float) $v, 4);
    } catch (Throwable $e) {
        error_log('AcriGlass presupuesto utilidad: ' . $e->getMessage());
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

        <!-- Datos de la obra (ventana Nueva obra): se usan al «Registrar Obra» -->
        <div class="enc-obra">
            <label>Nombre: <input type="text" id="obraNombre" maxlength="200" placeholder="Nombre de la obra"></label>
            <label>Teléfono: <input type="text" id="obraTelefono" maxlength="30"></label>
            <label>Mail: <input type="email" id="obraMail" maxlength="150"></label>
            <label>Dirección: <input type="text" id="obraDireccion" maxlength="200"></label>
            <label>Colonia: <input type="text" id="obraColonia" maxlength="100"></label>
            <label>C. P.: <input type="text" id="obraCp" maxlength="10"></label>
            <label>Ciudad: <input type="text" id="obraCiudad" maxlength="100" value="Ciudad de México"></label>
            <label>Estado: <input type="text" id="obraEstado" maxlength="100" value="Ciudad de México"></label>
            <div class="obra-checks">
                <label><input type="checkbox" id="obraBloqueada"> Obra bloqueada</label>
                <label><input type="checkbox" id="obraMaestra"> Obra maestra</label>
            </div>
            <label class="ancho">Descripción: <input type="text" id="obraDescripcion" maxlength="500"></label>
            <label class="ancho">Observaciones: <input type="text" id="obraObservaciones" maxlength="500"></label>
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
            <?php ctPanel(true); ?>

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

            <!-- Mano de Obra: empleados × días y comisiones (grid_man_obra / grid_comisiones del Form46) -->
            <div class="extras" id="extrasMO" hidden>
                <section class="extra">
                    <div class="extra-barra">
                        <strong>Empleados</strong>
                        <select id="selEmpleado">
                            <?php foreach ($empleados as $em): ?>
                            <option value="<?= (int) $em['empleado_id'] ?>"><?= e($em['nombre']) ?></option>
                            <?php endforeach; ?>
                        </select>
                        <button type="button" class="ct-btn" id="addEmpleado">+ Agregar</button>
                        <span class="extra-total">Total: <output id="totEmpleados">0.00</output> → <em id="fijoMO"></em></span>
                    </div>
                    <div class="extra-caja">
                        <table class="grid mini-grid">
                            <thead><tr><th>No.</th><th>Empleado</th><th class="c-num">Sueldo diario</th><th class="c-num">Días</th><th class="c-num">Total</th><th class="c-del"></th></tr></thead>
                            <tbody id="tbEmpleados"></tbody>
                        </table>
                    </div>
                </section>
                <section class="extra">
                    <div class="extra-barra">
                        <strong>Comisiones</strong>
                        <select id="selTipoComision">
                            <?php foreach ($tiposComision as $tc): ?>
                            <option value="<?= (int) $tc['tipo_empleado_id'] ?>"><?= e($tc['nombre']) ?></option>
                            <?php endforeach; ?>
                        </select>
                        <button type="button" class="ct-btn" id="addComision">+ Agregar</button>
                        <span class="extra-total">Total: <output id="totComisiones">0.00</output> → <em id="fijoCOM"></em></span>
                    </div>
                    <div class="extra-caja">
                        <table class="grid mini-grid">
                            <thead><tr><th>Tipo de empleado</th><th class="c-num">% sobre subtotal</th><th class="c-num">Total</th><th class="c-del"></th></tr></thead>
                            <tbody id="tbComisiones"></tbody>
                        </table>
                    </div>
                </section>
            </div>

            <!-- Gastos de Operacion: anexo de seguro (grid_anexo7 del Form46) -->
            <div class="extras" id="extrasGO" hidden>
                <section class="extra">
                    <div class="extra-barra">
                        <strong>Anexo de seguro</strong>
                        <select id="selSeguro"></select>
                        <button type="button" class="ct-btn" id="addSeguro">+ Agregar</button>
                        <span class="extra-ayuda">Total = Subtotal × %1 × %2 · pasa al concepto de Gastos de Operacion</span>
                    </div>
                    <div class="extra-caja">
                        <table class="grid mini-grid">
                            <thead><tr><th>Concepto</th><th class="c-num">% 1</th><th class="c-num">% 2</th><th class="c-num">Total</th><th class="c-del"></th></tr></thead>
                            <tbody id="tbSeguros"></tbody>
                        </table>
                    </div>
                </section>
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
                <input type="number" id="pctUtilidad" value="<?= e((string) $utilidadDefecto) ?>" min="0" max="99.9999" step="0.01" class="num pct" title="% de utilidad">
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
    <div class="extra sug-panel">
        <div class="extra-barra">
            <strong>Sugeridos relacionados</strong>
            <span class="extra-ayuda">Otros presupuestos de obra ligados a este (se guardan con el presupuesto)</span>
            <button type="button" class="ct-btn" id="addRelacionado">+ Relacionar por folio</button>
        </div>
        <div class="extra-caja">
            <table class="grid mini-grid">
                <thead><tr><th>Folio</th><th>Cliente</th><th>Proyecto</th><th>Estatus</th><th class="c-num">Total</th><th class="c-del"></th></tr></thead>
                <tbody id="tbRelacionados"></tbody>
            </table>
        </div>
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

<?php ctDialogos($vendedores); ?>

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
    window.ACRI_FIJOS = <?= json_encode($fijos, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.ACRI_EMPLEADOS = <?= json_encode($empleados, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.ACRI_TIPOS_COMISION = <?= json_encode($tiposComision, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
</script>
<script src="<?= recurso('js/formato-presupuesto.js') ?>"></script>
<script src="<?= recurso('js/conceptos-tareas.js') ?>"></script>
<script src="<?= recurso('js/presupuesto.js') ?>"></script>
</body>
</html>
