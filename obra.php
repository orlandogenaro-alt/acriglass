<?php
require __DIR__ . '/includes/sesion.php';
exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'CERRAR_OBRA', 'ADMIN_USER');
require_once __DIR__ . '/includes/bd.php';
require __DIR__ . '/includes/conceptos-tareas.php';
require __DIR__ . '/includes/membrete.php';

// Obra existente (AW.REG_OBRAS); 0 = nueva. Los catálogos y los datos se cargan desde js/obra.js
$obraId = max(0, (int) ($_GET['id'] ?? 0));

// Pestañas con listado (basadas en Dialog243 de VB). Las llena js/obra.js con api/obras.php
// botones: [accion, texto, icono, modo?]  ·  columnas: [encabezado, campo, formato (txt|fecha|dinero|num)]
// totales: [id, texto, campo que se suma, modo?]; no suman los renglones Cancelados
// modos: subpestañas de la pestaña (las columnas de cada una están en js/obra.js); un botón o total con modo solo se ve en ella
// aparte: la pestaña va en su lugar de la barra de pestañas (no junto a las demás de listado)
$listados = [
    'facturacion' => [
        'titulo'   => '2-Facturacion',
        'botones'  => [['nueva-cot', 'Nueva Cotizacion', '＋'], ['asignar-cot', 'Asignar Cotizacion Microsip', '🔗'], ['nuevo-cobro', 'Nuevo Documento de Cobro', '💵'], ['consultar', 'Consultar', '🔎']],
        'columnas' => [['Folio', 'folio', 'txt'], ['Tipo Docto', 'tipo_docto', 'txt'], ['Estatus', 'estatus', 'txt'], ['Cliente', 'cliente', 'txt'],
                       ['Fecha', 'fecha', 'fecha'], ['Importe', 'importe', 'dinero'], ['Factura', 'factura', 'txt'], ['Imp.Factura', 'imp_factura', 'dinero'],
                       ['Cargos', 'cargos', 'dinero'], ['Creditos', 'creditos', 'dinero'], ['Saldo', 'saldo', 'dinero']],
        'totales'  => [['totImpCot', 'Importe', 'importe'], ['totCargos', 'Total Cargos', 'cargos'], ['totCred', 'Total Creditos', 'creditos'], ['totSaldo', 'Saldo', 'saldo']],
    ],
    'ordenes' => [
        'titulo'   => '3-Orden Trabajo',
        'modos'    => ['ordenes' => 'Ordenes de Trabajo', 'produccion' => 'Produccion'],
        'botones'  => [['nueva-ot', 'Nueva Orden de Trabajo', '＋', 'ordenes'], ['consultar', 'Consultar', '🔎']],
        'columnas' => [['Folio', 'folio', 'txt'], ['Estatus', 'estatus', 'txt'], ['Fecha', 'fecha', 'fecha'], ['Fecha Entrega', 'fecha_entrega', 'fecha'],
                       ['Importe', 'importe_neto', 'dinero'], ['Descripcion', 'descripcion', 'txt']],
        'totales'  => [['totOrdenes', 'Importe', 'importe_neto', 'ordenes']],
    ],
    'explosion' => [
        'titulo'   => '4-Explosion Material',
        'botones'  => [['nueva-explosion', 'Nuevo', '＋'], ['explosion-presupuesto', 'Desde el presupuesto', '🧮'], ['importar-explosion', 'Importar', '📥'],
                       ['consultar', 'Consultar', '🔎'], ['eliminar-explosion', 'Eliminar seleccionados', '✕']],
        'columnas' => [['Clave', 'clave', 'txt'], ['Nombre', 'nombre', 'txt'], ['U.M.', 'um', 'txt'], ['Uds', 'uds', 'num'], ['Costo Unit.', 'costo_unit', 'dinero'],
                       ['Costo Total', 'costo_tot', 'dinero'], ['U.M. ML/M2', 'um_ml_m2', 'txt'], ['Tipo Docto', 'tipo_docto', 'txt'], ['Folio', 'folio', 'txt']],
        'totales'  => [['totExplosion', 'Importe', 'costo_tot']],
    ],
    'salidas' => [
        'titulo'   => '5-Salidas Material',
        'botones'  => [['salidas-doctos', 'Documentos', '📄'], ['salidas-detalle', 'Detalle de articulos', '📦'], ['imprimir-salidas', 'Imprimir', '🖨'],
                       ['exportar', 'Exportar a Excel', '📗']],
        'columnas' => [['Folio', 'folio_microsip', 'txt'], ['OT', 'ot', 'txt'], ['Fecha', 'fecha', 'fecha'], ['Estatus', 'estatus', 'txt'],
                       ['Concepto', 'nom_concepto', 'txt'], ['Almacen', 'nom_almacen', 'txt'], ['Costo Total', 'cos_tot', 'dinero']],
        'totales'  => [['totSalidas', 'Total salidas', 'cos_tot']],
    ],
    'mano' => [
        'titulo'   => '6-Mano de Obra',
        'modos'    => ['mano' => 'Mano de Obra', 'comisiones' => 'Comisiones'],
        'botones'  => [['nueva-mo', 'Asignar Mano de Obra', '＋', 'mano'], ['nueva-comis-admin', 'Comisión Administrativos', '＋', 'comisiones'],
                       ['nueva-comis-oper', 'Comisión Operativos', '＋', 'comisiones'], ['consultar', 'Consultar', '🔎']],
        'columnas' => [['Fecha', 'fecha', 'fecha'], ['Estatus', 'estatus', 'txt'], ['Folio OT', 'folio', 'txt'], ['Unidad', 'nom_unidad', 'txt'],
                       ['Importe MO', 'importe_mo', 'dinero'], ['Importe MO Real', 'importe_mo_real', 'dinero'], ['Notas', 'notas', 'txt']],
        'totales'  => [['totMoPres', 'MO presupuestada', 'importe_mo', 'mano'], ['totMoReal', 'MO real', 'importe_mo_real', 'mano'],
                       ['totComis', 'Total comisiones', 'importe_neto', 'comisiones']],
    ],
    'consumos' => [
        'titulo'   => '7-Consumos',
        'botones'  => [['consultar', 'Consultar', '🔎']],
        'columnas' => [['Folio Orden', 'folio_orden', 'txt'], ['Folio', 'folio', 'txt'], ['Estatus', 'estatus', 'txt'], ['Fecha', 'fecha', 'fecha'], ['Uds Salida', 'uds_salida', 'num']],
    ],
    'gastos' => [
        'titulo'   => '8-Gastos Adicion.',
        'botones'  => [['nuevo-gasto', 'Nuevo Gasto', '＋'], ['consultar', 'Consultar', '🔎']],
        'columnas' => [['Nombre', 'nombre', 'txt'], ['Estatus', 'estatus', 'txt'], ['Folio OT', 'folio', 'txt'], ['Fecha', 'fecha_creacion', 'fecha'],
                       ['Unidad', 'nom_unidad', 'txt'], ['Importe', 'importe', 'dinero'], ['Importe Real', 'importe_real', 'dinero'], ['Notas', 'notas', 'txt']],
        'totales'  => [['totGastos', 'Total gastos', 'importe'], ['totGastosReal', 'Total real', 'importe_real']],
    ],
    'microsip' => [
        'titulo'   => '10-Mov.Microsip',
        'aparte'   => true,
        'botones'  => [['consultar', 'Mostrar', '🔎'], ['exportar', 'Exportar a Excel', '📗']],
        'columnas' => [['Docto_In_Id', 'docto_in_id', 'txt'], ['Folio', 'folio', 'txt'], ['Concepto', 'concepto', 'txt'], ['Fecha', 'fecha', 'fecha'],
                       ['Almacen', 'almacen', 'txt'], ['Naturaleza', 'naturaleza', 'txt'], ['OT', 'ot', 'txt'], ['Estatus', 'estatus', 'txt']],
    ],
];
// Pista bajo los botones de cada pestaña para quien apenas usa el sistema
$pistas = [
    'facturacion' => 'Clic en un renglón para ver sus documentos de Microsip · doble clic para abrirlo · clic derecho para más opciones (eliminar, cancelar o enviar a Microsip).',
    'ordenes'     => 'Doble clic en una orden de trabajo para verla, liberarla a producción o cancelarla.',
    'explosion'   => 'Doble clic en una partida para corregir sus unidades o su costo · selecciona renglones para eliminarlos.',
    'mano'        => 'Doble clic en una asignación o comisión para verla, modificarla, imprimirla o cancelarla.',
    'microsip'    => 'Documentos de inventario de Microsip (salidas y traspasos) de las órdenes de trabajo de la obra. Naturaleza: E = entrada · S = salida.',
    'gastos'      => 'Doble clic en un gasto para verlo, modificarlo, imprimirlo o cancelarlo.',
];
$hoy = date('Y-m-d');
// Responsables para los Conceptos/Tareas: vendedores de obra activos
$ctUsuarios = [];
if (!modoConfiguracion()) {
    try {
        $ctUsuarios = array_column(bd_filas('AW', "select nombre from vendedores_obras where estatus = 'A' order by nombre"), 'nombre');
    } catch (Throwable $e) {
        error_log('AcriGlass obra responsables: ' . $e->getMessage());
    }
}
// Logo y empresa para los formatos impresos (Salida de personal a obra)
try {
    $membrete = membreteImpresion();
} catch (Throwable $e) {
    error_log('AcriGlass obra membrete: ' . $e->getMessage());
    $membrete = ACRI_MEMBRETE_DEFECTO + ['logo' => imagenSistema('logo'), 'logo_propio' => false];
}
// Permisos que la pantalla revisa antes de pedir la autorización de otro usuario
$permisos = array_values(array_filter(['NUEVO_OBRA', 'MODIFICAR_OBRA', 'CERRAR_OBRA', 'ADMIN_USER'], fn($p) => tienePermiso($p)));

// Barra de los documentos de la obra (Dialog274 / Dialog275): los botones se atienden por data-mo en js/obra.js
function barraDocumento() {
    return <<<'HTML'
<div class="toolbar mo-toolbar">
    <button type="button" class="tb" data-mo="guardar">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="#3b7dc4"/><rect x="7" y="3" width="10" height="7" fill="#dfeefc"/><rect x="7" y="14" width="10" height="7" fill="#fff"/></svg>
        <span>Guardar</span>
    </button>
    <button type="button" class="tb" data-mo="guardar-salir">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="#333"/><rect x="7" y="3" width="10" height="7" fill="#dfeefc"/></svg>
        <span>Guardar y Salir</span>
    </button>
    <span class="sep"></span>
    <button type="button" class="tb" data-mo="imprimir">
        <svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="7" fill="#fff" stroke="#666"/><rect x="2" y="9" width="20" height="9" rx="2" fill="#8a8a8a"/><rect x="6" y="14" width="12" height="8" fill="#fff" stroke="#666"/></svg>
        <span>Imprimir</span>
    </button>
    <button type="button" class="tb" data-mo="modificar">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="16" height="18" fill="#dfeefc" stroke="#3b7dc4"/><path d="M8 20l1-4 9-9 3 3-9 9z" fill="#f5c542" stroke="#8a6d1e"/></svg>
        <span>Modificar</span>
    </button>
    <button type="button" class="tb" data-mo="cancelar">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#fff" stroke="#d32f2f" stroke-width="2"/><path d="M6 6l12 12" stroke="#d32f2f" stroke-width="2"/></svg>
        <span>Cancelar</span>
    </button>
    <span class="sep"></span>
    <button type="button" class="tb" data-mo="bitacora">
        <svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="1" fill="#6d9e3a" stroke="#4a6e26"/><rect x="8" y="5" width="8" height="4" fill="#f5c542"/><path d="M8 13h8M8 16h8" stroke="#fff"/></svg>
        <span>Bitacora</span>
    </button>
    <button type="button" class="tb" data-mo="cerrar">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="#e53935" stroke-width="2.5" stroke-linecap="round"/></svg>
        <span>Cerrar</span>
    </button>
</div>
HTML;
}

function iconoPestana() {
    return '<svg viewBox="0 0 16 16"><rect x="3" y="1" width="10" height="14" fill="#fff" stroke="#3b7dc4"/><path d="M5 5h6M5 8h6M5 11h4" stroke="#3b7dc4"/></svg>';
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="acri-token" content="<?= e($_SESSION['csrf']) ?>">
    <title>Registro de Obras · AcriGlass</title>
    <link rel="icon" href="<?= e(imagenSistema('favicon')) ?>">
    <link rel="stylesheet" href="<?= recurso('css/presupuesto.css') ?>">
    <link rel="stylesheet" href="<?= recurso('css/obra.css') ?>">
    <script src="<?= recurso('js/tema.js') ?>"></script>
</head>
<body data-obra="<?= $obraId ?>" data-permisos="<?= e(implode(',', $permisos)) ?>">

<!-- Barra de herramientas -->
<header class="toolbar">
    <button class="tb editable" data-accion="guardar">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="#3b7dc4"/><rect x="7" y="3" width="10" height="7" fill="#dfeefc"/><rect x="7" y="14" width="10" height="7" fill="#fff"/></svg>
        <span>Guardar</span>
    </button>
    <button class="tb editable" data-accion="guardar-cerrar">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="#333"/><rect x="7" y="3" width="10" height="7" fill="#dfeefc"/></svg>
        <span>Guardar y Cerrar</span>
    </button>
    <span class="sep"></span>
    <button class="tb" data-accion="contrato" title="Contrato con el cliente, convenios, aditivas y órdenes de cambio">
        <svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z" fill="#fff" stroke="#666"/><path d="M15 2v5h5" fill="none" stroke="#666"/><path d="M9 12h8M9 15h8M9 18h5" stroke="#3b82f6" stroke-width="1.5"/></svg>
        <span>Contrato</span>
    </button>
    <button class="tb" data-accion="estimaciones" title="Catálogo del contrato, anticipo y estimaciones de avance">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="#fff" stroke="#666"/><path d="M7 16l3-4 3 2 4-6" fill="none" stroke="#22c55e" stroke-width="1.8"/></svg>
        <span>Estimaciones</span>
    </button>
    <button class="tb" data-accion="imprimir" title="Analítica de ejecución por obra: presupuestado contra real, utilidad y facturación">
        <svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="7" fill="#fff" stroke="#666"/><rect x="2" y="9" width="20" height="9" rx="2" fill="#8a8a8a"/><rect x="6" y="14" width="12" height="8" fill="#fff" stroke="#666"/></svg>
        <span>Imprimir</span>
    </button>
    <button class="tb" data-accion="imprimir-detalle" title="Analítica con el detalle: artículos, mano de obra, comisiones y gastos de la obra">
        <svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="7" fill="#fff" stroke="#666"/><rect x="2" y="9" width="20" height="9" rx="2" fill="#8a8a8a"/><rect x="6" y="14" width="12" height="8" fill="#fff" stroke="#666"/><path d="M8 17h8M8 19.5h6" stroke="#3b7dc4"/></svg>
        <span>Imprimir Detalle</span>
    </button>
    <span class="sep"></span>
    <button class="tb paso paso-1" data-accion="ejecucion">
        <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="#fff" stroke="#7a9cc6"/><path d="M8 12l3 3 5-6" stroke="#7a9cc6" stroke-width="2" fill="none"/></svg>
        <span>(1) Obra en Ejecucion</span>
    </button>
    <button class="tb paso paso-2" data-accion="terminada">
        <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="#fff" stroke="#7a9cc6"/><path d="M8 12l3 3 5-6" stroke="#7a9cc6" stroke-width="2" fill="none"/></svg>
        <span>(2) Obra Terminada</span>
    </button>
    <button class="tb paso paso-3" data-accion="finalizar">
        <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="#fff" stroke="#d32f2f"/><path d="M8 12l3 3 5-6" stroke="#d32f2f" stroke-width="2" fill="none"/></svg>
        <span>(3) Finalizar Obra</span>
    </button>
    <span class="sep"></span>
    <button class="tb" data-accion="modificar">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="16" height="18" fill="#dfeefc" stroke="#3b7dc4"/><path d="M8 20l1-4 9-9 3 3-9 9z" fill="#f5c542" stroke="#8a6d1e"/></svg>
        <span>Modificar</span>
    </button>
    <div class="tb-drop">
        <button class="tb" data-accion="estatus">
            <svg viewBox="0 0 24 24"><path d="M4 20l2-6L16 4l4 4-10 10z" fill="#f5c542" stroke="#8a6d1e"/></svg>
            <span>Modificar Estatus <small>▾</small></span>
        </button>
        <div class="menu">
            <?php foreach (['Planificacion', 'Ejecucion', 'Obra Terminada'] as $e): ?>
            <button data-estatus="<?= $e ?>"><?= $e ?></button>
            <?php endforeach; ?>
        </div>
    </div>
    <span class="sep"></span>
    <button class="tb" data-accion="cancelar">
        <svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19" stroke="#d32f2f" stroke-width="4" stroke-linecap="round"/></svg>
        <span>Cancelar</span>
    </button>
    <span class="sep"></span>
    <button class="tb" data-accion="cerrar">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="#e53935" stroke-width="2.5" stroke-linecap="round"/></svg>
        <span>Cerrar</span>
    </button>
</header>

<!-- Pestañas del documento -->
<nav class="doc-tabs ob-tabs">
    <button class="doc-tab activo" data-vista="datos"><?= iconoPestana() ?> 1-Datos</button>
    <?php foreach ($listados as $clave => $l): if (!empty($l['aparte'])) continue; ?>
    <button class="doc-tab" data-vista="<?= $clave ?>"><?= iconoPestana() ?> <?= e($l['titulo']) ?></button>
    <?php endforeach; ?>
    <button class="doc-tab" data-vista="adjuntos"><?= iconoPestana() ?> 9-Adjuntos</button>
    <button class="doc-tab" data-vista="microsip"><?= iconoPestana() ?> <?= e($listados['microsip']['titulo']) ?></button>
    <button class="doc-tab" data-vista="parametros"><?= iconoPestana() ?> 11-Parametros</button>
    <button class="doc-tab" data-vista="relacionados"><?= iconoPestana() ?> 12-HubSpot / Easy-Glass</button>
    <button class="doc-tab" data-vista="conceptos"><?= iconoPestana() ?> 13-Conceptos/Tareas</button>
</nav>

<!-- ============ 1-DATOS ============ -->
<section class="vista visible" data-vista="datos">
    <div class="ob-datos">
        <div class="ob-izq">
            <fieldset class="ob-presupuesto">
                <legend>Presupuesto de Obra</legend>
                <div class="ob-fila"><span>Id:</span> <a href="#" id="presId" title="Doble clic para abrir el presupuesto">0</a></div>
                <label class="ob-fila">Folio: <input type="text" id="presFolio" readonly></label>
                <label class="ob-fila">Proyecto: <input type="text" id="presProyecto" readonly class="ancho"></label>
            </fieldset>

            <label class="ob-campo">Nombre<br>de la Obra: <textarea id="nombreObra" rows="3" class="editable" data-req="el nombre de la Obra"></textarea></label>
            <label class="ob-campo">Direccion: <textarea id="direccion" rows="5" class="editable" data-req="la dirección de la Obra"></textarea></label>
            <label class="ob-campo">Contacto: <input type="text" id="contacto" class="editable" data-req="el nombre del contacto"></label>

            <div class="ob-campo">
                <span>Responsable de Obra:</span>
                <span class="ob-resp">
                    <select id="responsable" class="editable"><option value="">Cargando…</option></select>
                    <button type="button" class="ob-btn editable" id="agregarResp">Agregar</button>
                </span>
            </div>
            <div class="grid-caja ob-grid-resp">
                <table class="grid ob-grid">
                    <thead><tr><th class="sel-col"></th><th class="c-id">Nombre</th><th class="c-del"></th></tr></thead>
                    <tbody id="listaResp"></tbody>
                </table>
            </div>

            <label class="ob-campo">Notas: <textarea id="notas" rows="4" class="editable"></textarea></label>
        </div>

        <div class="ob-der">
            <div class="ob-imagen">
                <span>Imagen de Obra:</span>
                <div class="ob-marco" id="marcoImagen" title="Clic o arrastra una imagen para cargarla · doble clic para verla completa">
                    <img id="imgObra" alt="" hidden>
                    <span class="ob-marco-vacio" id="imgVacio">📷 Clic aquí o arrastra una imagen (JPG o PNG)</span>
                </div>
            </div>

            <div class="ob-fechas">
                <label>Fecha de Inicio: <input type="date" id="fechaInicio" value="<?= $hoy ?>" class="editable"></label>
                <label>Fecha Termino: <input type="date" id="fechaTermino" value="<?= $hoy ?>" class="editable"></label>
                <span class="ob-img-btns">
                    <button type="button" class="ob-btn" id="quitarImagen" hidden>Quitar imagen</button>
                    <button type="button" class="ob-btn" id="examinar">Examinar</button>
                </span>
                <input type="file" id="archivoImagen" accept=".jpg,.jpeg,.png,.webp,image/*" hidden>
            </div>

            <div class="ob-estatus">Estatus: <span id="estatus">Planificacion</span></div>

            <div class="ob-avance">
                <div class="ob-avance-titulo">Avance de Obra:</div>
                <div class="ob-avance-cuerpo">
                    <button type="button" class="ob-btn ob-actualizar" id="actualizarAvance">Actualizar Avance<br>de Obra</button>
                    <div class="ob-avance-barras">
                        <input type="range" id="sliderAvance" min="0" max="100" step="10" value="0">
                        <div class="ob-progreso"><div id="barraAvance"></div></div>
                    </div>
                    <div class="ob-pct"><span id="pctAvance">0</span> %</div>
                </div>
            </div>
        </div>
    </div>
</section>

<!-- ============ PESTAÑAS CON LISTADO (2 a 8) ============ -->
<?php foreach ($listados as $clave => $l): ?>
<?php $modo0 = isset($l['modos']) ? array_key_first($l['modos']) : null; ?>
<section class="vista ob-listado" data-vista="<?= $clave ?>"<?= $modo0 ? ' data-modo="' . e($modo0) . '"' : '' ?>>
    <?php if ($modo0): ?>
    <nav class="cot-tabs ob-modos">
        <?php foreach ($l['modos'] as $m => $t): ?>
        <button type="button" data-modo-tab="<?= e($m) ?>"<?= $m === $modo0 ? ' class="activo"' : '' ?>><?= e($t) ?></button>
        <?php endforeach; ?>
    </nav>
    <?php endif; ?>
    <div class="ob-subbarra">
        <?php foreach ($l['botones'] as $b): ?>
        <button type="button" class="ob-btn" data-sub="<?= $b[0] ?>"<?= isset($b[3]) ? ' data-solo-modo="' . e($b[3]) . '"' : '' ?>><?= $b[2] ?> <?= e($b[1]) ?></button>
        <?php endforeach; ?>
        <span class="ob-estado" data-estado></span>
    </div>
    <?php if (isset($pistas[$clave])): ?>
    <p class="ob-pista">💡 <?= e($pistas[$clave]) ?></p>
    <?php endif; ?>
    <?php if ($clave === 'facturacion'): ?>
    <ul class="ob-rel-avisos" id="facAvisos"></ul>
    <?php endif; ?>
    <div class="grid-caja">
        <table class="grid ob-grid" data-columnas="<?= e(json_encode($l['columnas'], JSON_UNESCAPED_UNICODE)) ?>"
               data-totales="<?= e(json_encode($l['totales'] ?? [], JSON_UNESCAPED_UNICODE)) ?>">
            <thead><tr><th class="sel-col"></th><?php foreach ($l['columnas'] as $c): ?><th><?= e($c[0]) ?></th><?php endforeach; ?></tr></thead>
            <tbody><tr class="vacio-fila"><td colspan="<?= count($l['columnas']) + 1 ?>">Sin registros.</td></tr></tbody>
        </table>
    </div>
    <?php if ($clave === 'facturacion'): ?>
    <fieldset class="ob-detalle" id="facDetalle" hidden>
        <legend id="facDetalleTitulo">Documentos en Microsip</legend>
        <table class="grid ob-grid">
            <thead><tr><th>Documento</th><th>Folio</th><th>Fecha</th><th>Estatus / Concepto</th><th>Importe</th><th>Moneda</th></tr></thead>
            <tbody id="facDetalleFilas"></tbody>
        </table>
    </fieldset>
    <?php endif; ?>
    <?php if (!empty($l['totales'])): ?>
    <div class="ob-totales">
        <?php foreach ($l['totales'] as $t): ?>
        <label<?= isset($t[3]) ? ' data-solo-modo="' . e($t[3]) . '"' : '' ?>><?= e($t[1]) ?>: <output id="<?= $t[0] ?>">$0.00</output></label>
        <?php endforeach; ?>
    </div>
    <?php endif; ?>
</section>
<?php endforeach; ?>

<!-- ============ 9-ADJUNTOS ============ -->
<section class="vista ob-listado" data-vista="adjuntos">
    <div class="ob-adjuntar">
        <button type="button" class="ob-btn" id="examinarAdjunto">📂 Examinar</button>
        <input type="file" id="archivoAdjunto" hidden>
        <label>Archivo: <input type="text" id="adjNombre" readonly></label>
        <label>Descripcion corta: <input type="text" id="adjDesc" maxlength="49" placeholder="Máximo 50 caracteres"></label>
        <button type="button" class="ob-btn" id="adjuntar">📎 Adjuntar</button>
        <button type="button" class="ob-btn" data-sub="consultar">🔎 Consultar</button>
        <span class="ob-estado" data-estado></span>
    </div>
    <div class="grid-caja">
        <table class="grid ob-grid">
            <thead><tr><th class="sel-col"></th><th>Nombre Archivo</th><th>Descripcion</th><th>Fecha</th><th>Usuario</th><th></th><th></th></tr></thead>
            <tbody id="listaAdjuntos"><tr class="vacio-fila"><td colspan="7">No existen documentos adjuntos para mostrar.</td></tr></tbody>
        </table>
    </div>
</section>

<!-- ============ 11-PARAMETROS (pedidos relacionados y costos adicionales) ============ -->
<section class="vista ob-listado" data-vista="parametros">
    <div class="ob-rel-cajas">
        <fieldset class="ob-rel-caja">
            <legend>Pedidos Relacionados</legend>
            <div class="ob-subbarra">
                <button type="button" class="ob-btn" id="pedMostrar">🔎 Mostrar</button>
                <button type="button" class="ob-btn ped-edit" id="pedAgregar" disabled>＋ Agregar Pedido</button>
                <button type="button" class="ob-btn" id="pedModificar">✎ Modificar</button>
                <button type="button" class="ob-btn ped-edit" id="pedEliminar" disabled>✕ Eliminar</button>
                <span class="ob-estado" id="pedEstado"></span>
            </div>
            <div class="grid-caja">
                <table class="grid ob-grid">
                    <thead><tr><th class="sel-col"></th><th>Tipo</th><th>Folio</th><th>Uds.</th><th>Importe</th></tr></thead>
                    <tbody id="pedFilas"><tr class="vacio-fila"><td colspan="5">Presiona Mostrar.</td></tr></tbody>
                </table>
            </div>
            <div class="ob-totales"><label>Total: <output id="pedTotal">$0.00</output></label></div>
            <div class="ob-parametros">
                <label>% Gastos de Operacion:
                    <input type="number" id="gasAdminObra" class="num editable" min="0" step="0.01" value="0"
                           title="% de administración de la obra sobre la materia prima (sin cristal) y la mano de obra reales. Se guarda con Guardar de la obra.">
                </label>
            </div>
        </fieldset>
        <fieldset class="ob-rel-caja">
            <legend>Costos Adicionales</legend>
            <div class="ob-subbarra">
                <button type="button" class="ob-btn cad-edit" id="cadGuardar" disabled>💾 Guardar</button>
                <button type="button" class="ob-btn" id="cadMostrar">🔎 Mostrar</button>
                <button type="button" class="ob-btn" id="cadModificar">✎ Modificar</button>
                <button type="button" class="ob-btn cad-edit" id="cadEliminar" disabled>✕ Eliminar</button>
                <span class="ob-estado" id="cadEstado"></span>
            </div>
            <div class="ob-subbarra">
                <label>Gastos Adicionales: <select id="conGasOper" class="cad-edit" disabled><option value="">Cargando…</option></select></label>
                <button type="button" class="ob-btn cad-edit" id="cadAgregar" disabled>Agregar</button>
            </div>
            <div class="grid-caja">
                <table class="grid ob-grid">
                    <thead><tr><th class="sel-col"></th><th>Id_con</th><th>Concepto</th><th>% Porce.</th></tr></thead>
                    <tbody id="cadFilas"><tr class="vacio-fila"><td colspan="4">Presiona Mostrar.</td></tr></tbody>
                </table>
            </div>
            <p class="ob-pista">💡 Cada costo adicional es su % sobre lo facturado sin IVA y entra en los Gastos de Operación reales de la analítica (Imprimir).</p>
        </fieldset>
    </div>
</section>

<!-- ============ 12-HUBSPOT / EASY-GLASS ============ -->
<section class="vista ob-listado" data-vista="relacionados">
    <div class="ob-subbarra">
        <button type="button" class="ob-btn" id="actualizarRel">🔄 Actualizar</button>
        <span class="ob-rel-ruta">Obra → Presupuesto de obra → Negocio de HubSpot → Folios de Easy-Glass</span>
    </div>

    <div class="ob-rel-cajas">
        <fieldset class="ob-rel-caja">
            <legend>Presupuesto de obra (AW)</legend>
            <dl id="relPresupuesto"><dt>—</dt></dl>
        </fieldset>
        <fieldset class="ob-rel-caja">
            <legend>Negocio en HubSpot</legend>
            <dl id="relDeal"><dt>—</dt></dl>
            <a id="relDealLink" class="ob-btn" target="_blank" rel="noopener" hidden>Abrir en HubSpot ↗</a>
        </fieldset>
    </div>

    <ul class="ob-rel-avisos" id="relAvisos"></ul>

    <div class="grid-caja">
        <table class="grid ob-grid">
            <thead><tr><th class="sel-col"></th><th>Folio</th><th>Tipo</th><th>Fecha</th><th>Cliente</th><th>Proyecto</th><th>Vendedor</th><th>Estatus</th><th>Moneda</th><th>Importe s/IVA</th><th>Importe c/IVA</th></tr></thead>
            <tbody id="relFolios"><tr class="vacio-fila"><td colspan="11">Abre una obra guardada para ver sus folios.</td></tr></tbody>
        </table>
    </div>
    <div class="ob-totales"><label>Folios: <output id="relCuenta">0</output></label><label>Total c/IVA: <output id="relTotal">$0.00</output></label></div>
</section>

<!-- ============ 13-CONCEPTOS/TAREAS (los mismos del presupuesto: js/conceptos-tareas.js) ============ -->
<section class="vista ob-listado ob-ct-vista" data-vista="conceptos">
    <div class="ob-subbarra">
        <button type="button" class="ob-btn" id="actualizarCt">🔄 Actualizar</button>
        <button type="button" class="ob-btn" id="abrirPresupuesto">📄 Abrir presupuesto</button>
        <span class="ob-estado" id="ctEstado">Doble clic en un concepto/tarea para verlo; Modificar para capturar fechas, responsable y avance.</span>
    </div>
    <?php ctPanel(); ?>
</section>

<?php ctDialogos($ctUsuarios); ?>

<!-- ============ DIÁLOGO DE CAPTURA (orden de trabajo, cotización, cobro, explosión, mano de obra, gasto) ============ -->
<dialog class="hs-dialogo frm-dialogo" id="frmDialogo">
    <form id="frmForm" novalidate>
        <div class="hs-cabecera">
            <strong id="frmTitulo"></strong>
            <button type="button" class="hs-cerrar" data-frm-cerrar title="Cerrar">✕</button>
        </div>
        <div class="frm-cuerpo" id="frmCuerpo"></div>
        <div class="hs-pie frm-pie">
            <span id="frmAcciones"></span>
            <button type="button" class="hs-btn" data-frm-cerrar>Cerrar</button>
            <button type="submit" class="hs-btn principal" id="frmGuardar">Guardar</button>
        </div>
    </form>
</dialog>

<!-- ============ COSTO DE MANO DE OBRA (Dialog275) ============ -->
<dialog class="hs-dialogo mo-dialogo" id="moDialogo">
    <div class="hs-cabecera">
        <strong>Costo de Mano de Obra</strong>
        <button type="button" class="hs-cerrar" data-mo="cerrar" title="Cerrar">✕</button>
    </div>
    <?= barraDocumento() ?>
    <div class="mo-cuerpo">
        <p class="doc-ayuda" role="status"></p>
        <div class="mo-fila">
            <label>Folio de la OT <select id="moOrden" class="mo-edit"></select></label>
            <label class="mo-der">Fecha de Trabajo: <input type="date" id="moFecha" class="mo-edit"></label>
        </div>
        <div class="mo-fila">
            <label class="mo-largo">Unidad: <select id="moUnidad" class="mo-edit"></select></label>
            <div class="mo-der mo-estatus"><span>Estatus:</span><b id="moEstatus">Normal</b></div>
        </div>
        <div class="mo-fila">
            <label class="mo-largo">Personal de Obra: <select id="moPersonal" class="mo-edit"></select></label>
            <button type="button" class="hs-btn mo-mas mo-edit" id="moAgregar" title="Agregar al personal">+</button>
        </div>
        <div class="mo-grid">
            <table>
                <thead><tr><th>Nombre</th><th>Costo_x_Hrs</th><th>Hrs.de_Trab.</th><th>Hrs.Trab.Real</th><th>Costo.Total</th><th></th></tr></thead>
                <tbody id="moFilas"></tbody>
            </table>
        </div>
        <div class="mo-importe">Importe: <input id="moImporte" readonly> <input id="moImpReal" readonly></div>
        <label class="mo-notas">Notas: <textarea id="moNotas" rows="5" maxlength="300" class="mo-edit"></textarea></label>
    </div>
</dialog>

<!-- ============ COTIZACION MICROSIP (2-Facturacion) Y ORDEN DE TRABAJO (3-Orden Trabajo) · Dialog242 ============ -->
<!-- solo-cot / solo-ot: lo que solo se ve en un modo (js/obra.js pone la clase es-ot en la Orden de Trabajo) -->
<dialog class="hs-dialogo cot-dialogo" id="cotDialogo">
    <div class="hs-cabecera">
        <strong id="cotCaption">Cotizacion Microsip</strong>
        <button type="button" class="hs-cerrar" data-cot="cerrar" title="Cerrar">✕</button>
    </div>
    <div class="toolbar mo-toolbar">
        <button type="button" class="tb" data-cot="guardar">
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="#3b7dc4"/><rect x="7" y="3" width="10" height="7" fill="#dfeefc"/><rect x="7" y="14" width="10" height="7" fill="#fff"/></svg>
            <span>Guardar</span>
        </button>
        <button type="button" class="tb" data-cot="guardar-cerrar">
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="#333"/><rect x="7" y="3" width="10" height="7" fill="#dfeefc"/></svg>
            <span>Guardar y Cerrar</span>
        </button>
        <button type="button" class="tb" data-cot="imprimir">
            <svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="7" fill="#fff" stroke="#666"/><rect x="2" y="9" width="20" height="9" rx="2" fill="#8a8a8a"/><rect x="6" y="14" width="12" height="8" fill="#fff" stroke="#666"/></svg>
            <span>Imprimir</span>
        </button>
        <button type="button" class="tb solo-cot" data-cot="entrada-pt">
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="16" height="18" fill="#dfeefc" stroke="#3b7dc4"/><path d="M7 8h8M7 12h8M7 16h5" stroke="#3b7dc4"/><path d="M15 15l3 3 4-6" stroke="#2e7d32" stroke-width="2" fill="none"/></svg>
            <span>Entrada PT</span>
        </button>
        <button type="button" class="tb solo-ot" data-cot="produccion">
            <svg viewBox="0 0 24 24"><rect x="2" y="4" width="14" height="16" fill="#dfeefc" stroke="#3b7dc4"/><path d="M7 9h5M7 13h5" stroke="#3b7dc4"/><path d="M12 16h9M18 13l3 3-3 3" stroke="#2e7d32" stroke-width="2" fill="none"/></svg>
            <span>Enviar a Produccion</span>
        </button>
        <button type="button" class="tb solo-cot" data-cot="enviar">
            <svg viewBox="0 0 24 24"><rect x="2" y="4" width="14" height="16" fill="#dfeefc" stroke="#3b7dc4"/><path d="M10 12h11M17 8l4 4-4 4" stroke="#2e7d32" stroke-width="2" fill="none"/></svg>
            <span>Enviar a Microsip</span>
        </button>
        <button type="button" class="tb" data-cot="modificar">
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="16" height="18" fill="#dfeefc" stroke="#3b7dc4"/><path d="M8 20l1-4 9-9 3 3-9 9z" fill="#f5c542" stroke="#8a6d1e"/></svg>
            <span>Modificar</span>
        </button>
        <button type="button" class="tb" data-cot="estatus">
            <svg viewBox="0 0 24 24"><path d="M4 20l2-6L16 4l4 4-10 10z" fill="#f5c542" stroke="#8a6d1e"/></svg>
            <span>Modificar Estatus</span>
        </button>
        <button type="button" class="tb" data-cot="bitacora">
            <svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="1" fill="#6d9e3a" stroke="#4a6e26"/><rect x="8" y="5" width="8" height="4" fill="#f5c542"/><path d="M8 13h8M8 16h8" stroke="#fff"/></svg>
            <span>Bitacora</span>
        </button>
        <button type="button" class="tb" data-cot="cancelar">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#fff" stroke="#d32f2f" stroke-width="2"/><path d="M6 6l12 12" stroke="#d32f2f" stroke-width="2"/></svg>
            <span>Cancelar</span>
        </button>
        <span class="sep"></span>
        <button type="button" class="tb" data-cot="cerrar">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="#e53935" stroke-width="2.5" stroke-linecap="round"/></svg>
            <span>Cerrar</span>
        </button>
    </div>
    <div class="cot-cuerpo">
        <p class="doc-ayuda" role="status"></p>
        <div class="cot-enc">
            <div>
                <h2 class="cot-titulo" id="cotTituloDoc">Cotizacion</h2>
                <div class="cot-obra"><span>OBRA:</span> <b id="cotObra"></b></div>
            </div>
            <div class="cot-fecfol">
                <span class="cot-cab">Fecha</span><span class="cot-cab">Folio</span>
                <input type="date" id="cotFecha" class="cot-edit">
                <div class="cot-folio"><select disabled><option>RS</option></select><input id="cotFolio" class="cot-edit" maxlength="9" placeholder="0"></div>
            </div>
        </div>
        <div class="cot-fila">
            <div class="cot-cliente">
                <label>Cliente (No) : <input id="cotClave" class="cot-edit" autocomplete="off"></label>
                <button type="button" class="cot-buscar cot-edit" data-buscar="clave" title="Buscar cliente por clave"><svg viewBox="0 0 24 24"><path d="M3 4h18l-7 8v6l-4 2v-8z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 22h18" stroke="currentColor" stroke-width="2" stroke-dasharray="2 2"/></svg></button>
                <label>Nombre: <input id="cotNombre" class="cot-edit" autocomplete="off"></label>
                <button type="button" class="cot-buscar cot-edit" data-buscar="nombre" title="Buscar cliente por nombre"><svg viewBox="0 0 24 24"><path d="M3 4h18l-7 8v6l-4 2v-8z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 22h18" stroke="currentColor" stroke-width="2" stroke-dasharray="2 2"/></svg></button>
            </div>
            <div class="cot-estatus" id="cotEstatus">Documento Creado</div>
            <div class="cot-der">
                <label>Fecha Entrega: <input type="date" id="cotEntrega" class="cot-edit"></label>
                <label>Urgencia: <select id="cotUrgencia" class="cot-edit">
                    <option>Urgente</option><option selected>Nesesaria (Normal)</option><option>Programada</option>
                </select></label>
            </div>
        </div>

        <nav class="cot-tabs">
            <button type="button" class="activo" data-cot-tab="general">General</button>
            <button type="button" class="solo-ot" data-cot-tab="salidas">Salidas de Material</button>
            <button type="button" class="solo-ot" data-cot-tab="consumos">Consumos de Material en Obra</button>
            <button type="button" data-cot-tab="quejas">Quejas de Cliente</button>
            <button type="button" data-cot-tab="otros">Otros Datos</button>
        </nav>

        <section class="cot-panel visible" data-cot-panel="general">
            <div class="cot-acciones">
                <button type="button" class="ob-btn cot-edit" id="cotAgregar">＋ Agregar renglón</button>
                <button type="button" class="ob-btn cot-edit" id="cotImportar">⇩ <span id="cotImportarTxt">Materia prima del presupuesto</span></button>
            </div>
            <div class="mo-grid cot-grid">
                <table>
                    <thead><tr><th style="width:110px">Clave</th><th>Descripcion</th><th style="width:70px">Uds.</th><th style="width:70px">U.Med.</th>
                        <th style="width:95px">Precio.Unit.</th><th style="width:100px">Total</th><th style="width:95px" class="solo-cot">Costo.Unita</th><th style="width:26px"></th></tr></thead>
                    <tbody id="cotPartidas"></tbody>
                </table>
            </div>
            <div class="cot-totales">
                <label>Sub Total: <input id="cotSubtotal" readonly></label><input id="cotCosto" class="solo-cot" readonly title="Costo total">
                <label>IVA: <input id="cotIva" readonly></label><span></span>
                <label>Total: <input id="cotTotal" readonly></label><span></span>
            </div>
        </section>

        <!-- Solo en la Orden de Trabajo: salidas y consumos de material registrados con esta OT -->
        <section class="cot-panel" data-cot-panel="salidas">
            <div class="mo-grid cot-grid">
                <table>
                    <thead><tr><th style="width:90px">Folio</th><th style="width:95px">Fecha</th><th style="width:100px">Estatus</th><th>Concepto</th><th>Almacen</th><th style="width:110px">Costo Total</th></tr></thead>
                    <tbody id="cotSalidas"></tbody>
                </table>
            </div>
        </section>

        <section class="cot-panel" data-cot-panel="consumos">
            <div class="mo-grid cot-grid">
                <table>
                    <thead><tr><th style="width:90px">Folio</th><th style="width:95px">Fecha</th><th style="width:100px">Estatus</th><th style="width:110px">Uds Salida</th></tr></thead>
                    <tbody id="cotConsumos"></tbody>
                </table>
            </div>
        </section>

        <section class="cot-panel" data-cot-panel="quejas">
            <fieldset class="cot-quejas">
                <legend>Quejas de Clientes</legend>
                <div class="cot-barra-verde">
                    <button type="button" data-queja="nueva"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" fill="#3b7dc4"/><rect x="7" y="3" width="10" height="7" fill="#dfeefc"/></svg><span>Nueva</span></button>
                    <button type="button" data-queja="mostrar"><svg viewBox="0 0 24 24"><path d="M3 7h7l2 2h9v11H3z" fill="#f5c542" stroke="#8a6d1e"/></svg><span>Mostrar</span></button>
                </div>
                <p class="cot-aviso" id="cotQuejasAviso" hidden></p>
                <div class="mo-grid cot-grid">
                    <table>
                        <thead><tr><th style="width:70px">Folio</th><th>Cliente</th><th style="width:95px">Fecha</th><th style="width:120px">Vendedor</th><th style="width:120px">Proceso</th><th style="width:100px">Estatus</th></tr></thead>
                        <tbody id="cotQuejas"></tbody>
                    </table>
                </div>
            </fieldset>
        </section>

        <section class="cot-panel" data-cot-panel="otros">
            <div class="cot-otros">
                <label class="ancho">Descripción: <textarea id="cotDescripcion" rows="4" maxlength="200" class="cot-edit"></textarea></label>
                <label>Docto. Id: <input id="cotDocId" readonly></label>
                <label>Importe neto (sin IVA): <input id="cotImporteNeto" readonly></label>
                <label>Creado por: <input id="cotCreo" readonly></label>
                <label>Fecha de creación: <input id="cotCreoFecha" readonly></label>
                <label>Modificado por: <input id="cotModifico" readonly></label>
                <label>Fecha de modificación: <input id="cotModificoFecha" readonly></label>
            </div>
        </section>
    </div>
</dialog>

<!-- Busca Cliente (clientes de Easy-Glass por la API) -->
<dialog class="hs-dialogo bc-dialogo" id="bcDialogo">
    <form id="bcForm">
        <div class="hs-cabecera">
            <strong>Busca Cliente</strong>
            <button type="button" class="hs-cerrar" data-bc-cerrar title="Cerrar">✕</button>
        </div>
        <div class="bc-campos">
            <label class="bc-op"><input type="radio" name="bcModo" value="nombre"> Nombre:</label>
            <input id="bcNombre" autocomplete="off">
            <span></span>
            <label class="bc-op"><input type="radio" name="bcModo" value="clave" checked> Clave:</label>
            <input id="bcClave" autocomplete="off">
            <button type="submit" class="hs-btn">Buscar</button>
        </div>
        <div class="mo-grid bc-grid">
            <table>
                <thead><tr><th style="width:90px">Clave</th><th>Nombre</th></tr></thead>
                <tbody id="bcFilas"></tbody>
            </table>
        </div>
        <div class="hs-pie"><span class="bc-estado" id="bcEstado"></span><button type="button" class="hs-btn" data-bc-cerrar>Cancelar</button></div>
    </form>
</dialog>

<!-- ============ GASTOS DE OBRA (Dialog274) ============ -->
<dialog class="hs-dialogo mo-dialogo" id="gaDialogo">
    <div class="hs-cabecera">
        <strong>Gastos de Obra</strong>
        <button type="button" class="hs-cerrar" data-mo="cerrar" title="Cerrar">✕</button>
    </div>
    <?= barraDocumento() ?>
    <div class="mo-cuerpo">
        <p class="doc-ayuda" role="status"></p>
        <div class="mo-fila">
            <label>Folio de la OT <select id="gaOrden" class="mo-edit"></select></label>
            <div class="mo-der ga-der">
                <div class="ga-estatus"><span>Estatus:</span> <b id="gaEstatus">Normal</b></div>
                <label>Fecha: <input type="datetime-local" id="gaFecha" class="mo-edit"></label>
            </div>
        </div>
        <div class="mo-fila">
            <label class="mo-largo">Unidad: <select id="gaUnidad" class="mo-edit"></select></label>
        </div>
        <div class="mo-fila">
            <label class="mo-largo">Personal de Obra: <select id="gaPersonal" class="mo-edit"></select></label>
            <button type="button" class="hs-btn mo-mas mo-edit" id="gaAgregar" title="Agregar al personal">+</button>
        </div>
        <div class="mo-grid mo-grid-chico">
            <table>
                <thead><tr><th>Nombre</th><th></th></tr></thead>
                <tbody id="gaPersonalFilas"></tbody>
            </table>
        </div>
        <div class="mo-fila"><span class="mo-etq">Concepto:</span>
            <button type="button" class="hs-btn mo-mas mo-edit" id="gaAgregarConcepto" title="Agregar concepto">+</button></div>
        <div class="mo-grid">
            <table>
                <thead><tr><th>Concepto</th><th>Imp.Presupuestado</th><th>Imp.Real</th><th></th></tr></thead>
                <tbody id="gaConceptos"></tbody>
            </table>
            <datalist id="gaListaConceptos"></datalist>
        </div>
        <div class="mo-importe">Importe: <input id="gaImporte" readonly> <input id="gaImpReal" readonly></div>
        <label class="mo-notas">Notas: <textarea id="gaNotas" rows="5" maxlength="300" class="mo-edit"></textarea></label>
    </div>
</dialog>

<!-- Bitácora del documento (Dialog58) -->
<dialog class="hs-dialogo mo-bitacora" id="moBitacora">
    <div class="hs-cabecera">
        <strong>Bitacora</strong>
        <button type="button" class="hs-cerrar" data-mo-bit-cerrar title="Cerrar">✕</button>
    </div>
    <textarea id="moBitTexto" readonly></textarea>
    <div class="hs-pie"><span></span><button type="button" class="hs-btn" data-mo-bit-cerrar>Cerrar</button></div>
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

<script>window.ACRI_MEMBRETE = <?= json_encode($membrete, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;</script>
<script src="<?= recurso('js/ruta-critica.js') ?>"></script>
<script src="<?= recurso('js/conceptos-tareas.js') ?>"></script>
<script src="<?= recurso('js/obra.js') ?>"></script>
</body>
</html>
