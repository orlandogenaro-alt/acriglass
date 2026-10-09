<?php
require __DIR__ . '/includes/sesion.php';

// Obra existente (AW.REG_OBRAS); 0 = nueva. Los catálogos y los datos se cargan desde js/obra.js
$obraId = max(0, (int) ($_GET['id'] ?? 0));

// Pestañas con listado (basadas en Dialog243 de VB)
// botones: [accion, texto, icono]  ·  totales: [id, texto]
$listados = [
    'facturacion' => [
        'titulo'   => '2-Facturacion',
        'botones'  => [['nueva-cot', 'Nueva Cotizacion', '＋'], ['asignar-cot', 'Asignar Cotizacion Microsip', '🔗'], ['consultar', 'Consultar', '🔎']],
        'columnas' => ['Folio', 'Tipo Docto', 'Estatus', 'Cliente', 'Fecha', 'Importe', 'Factura', 'Imp.Factura', 'Cargos', 'Creditos', 'Saldo'],
        'totales'  => [['totImpCot', 'Importe'], ['totCargos', 'Total Cargos'], ['totCred', 'Total Creditos'], ['totSaldo', 'Saldo']],
    ],
    'orden' => [
        'titulo'   => '3-Orden Trabajo',
        'botones'  => [['nueva-ot', 'Nueva Orden de Trabajo', '＋'], ['consultar', 'Consultar', '🔎']],
        'columnas' => ['Folio', 'Fecha', 'Estatus', 'Descripcion'],
    ],
    'explosion' => [
        'titulo'   => '4-Explosion Material',
        'botones'  => [['nueva-explosion', 'Nuevo', '＋'], ['guardar-explosion', 'Guardar', '💾'], ['consultar', 'Consultar', '🔎'], ['eliminar-explosion', 'Eliminar seleccionados', '✕']],
        'columnas' => ['Clave', 'Nombre', 'U.M.', 'Uds', 'Costo Unit.', 'Costo Total', 'U.M. ML/M2', 'Tipo Docto', 'Folio'],
        'totales'  => [['totExplosion', 'Importe']],
    ],
    'salidas' => [
        'titulo'   => '5-Salidas Material',
        'botones'  => [['salidas-doctos', 'Documentos', '📄'], ['salidas-detalle', 'Detalle de articulos', '📦'], ['exportar', 'Exportar a Excel', '📗']],
        'columnas' => ['Folio', 'OT', 'Fecha', 'Estatus', 'Concepto', 'Almacen', 'Costo Total'],
        'totales'  => [['totSalidas', 'Total salidas']],
    ],
    'mano' => [
        'titulo'   => '6-Mano de Obra',
        'botones'  => [['consultar', 'Consultar', '🔎']],
        'columnas' => ['Fecha', 'Estatus', 'Razon Social', 'Unidad', 'Importe', 'Notas'],
    ],
    'consumos' => [
        'titulo'   => '7-Consumos',
        'botones'  => [['consultar', 'Consultar', '🔎']],
        'columnas' => ['Folio Orden', 'Folio', 'Estatus', 'Fecha', 'Uds Salida'],
    ],
    'gastos' => [
        'titulo'   => '8-Gastos Adicion.',
        'botones'  => [['nuevo-gasto', 'Nuevo Gasto', '＋'], ['consultar', 'Consultar', '🔎']],
        'columnas' => ['Nombre', 'Estatus', 'Folio', 'Fecha', 'Unidad', 'Importe', 'Importe Real', 'Notas'],
        'totales'  => [['totGastos', 'Total gastos'], ['totGastosReal', 'Total real']],
    ],
];
$hoy = date('Y-m-d');

function iconoPestana() {
    return '<svg viewBox="0 0 16 16"><rect x="3" y="1" width="10" height="14" fill="#fff" stroke="#3b7dc4"/><path d="M5 5h6M5 8h6M5 11h4" stroke="#3b7dc4"/></svg>';
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Registro de Obras · AcriGlass</title>
    <link rel="icon" href="<?= e(imagenSistema('favicon')) ?>">
    <link rel="stylesheet" href="<?= recurso('css/presupuesto.css') ?>">
    <link rel="stylesheet" href="<?= recurso('css/obra.css') ?>">
    <script src="<?= recurso('js/tema.js') ?>"></script>
</head>
<body data-obra="<?= $obraId ?>">

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
    <button class="tb" data-accion="imprimir">
        <svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="7" fill="#fff" stroke="#666"/><rect x="2" y="9" width="20" height="9" rx="2" fill="#8a8a8a"/><rect x="6" y="14" width="12" height="8" fill="#fff" stroke="#666"/></svg>
        <span>Imprimir</span>
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
    <?php foreach ($listados as $clave => $l): ?>
    <button class="doc-tab" data-vista="<?= $clave ?>"><?= iconoPestana() ?> <?= e($l['titulo']) ?></button>
    <?php endforeach; ?>
    <button class="doc-tab" data-vista="adjuntos"><?= iconoPestana() ?> 9-Adjuntos</button>
    <button class="doc-tab" data-vista="microsip"><?= iconoPestana() ?> 10-Mov.Microsip</button>
    <button class="doc-tab" data-vista="parametros"><?= iconoPestana() ?> 11-Parametros</button>
    <button class="doc-tab" data-vista="relacionados"><?= iconoPestana() ?> 12-HubSpot / Easy-Glass</button>
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
                <div class="ob-marco" id="marcoImagen" title="Doble clic para ver la imagen completa"><img id="imgObra" alt="" hidden></div>
            </div>

            <div class="ob-fechas">
                <label>Fecha de Inicio: <input type="date" id="fechaInicio" value="<?= $hoy ?>" class="editable"></label>
                <label>Fecha Termino: <input type="date" id="fechaTermino" value="<?= $hoy ?>" class="editable"></label>
                <button type="button" class="ob-btn editable" id="examinar">Examinar</button>
                <input type="file" id="archivoImagen" accept=".jpg,.jpeg,.png,image/*" hidden>
            </div>

            <div class="ob-estatus">Estatus: <span id="estatus">Planificacion</span></div>

            <div class="ob-avance">
                <div class="ob-avance-titulo">Avance de Obra:</div>
                <div class="ob-avance-cuerpo">
                    <button type="button" class="ob-btn ob-actualizar" id="actualizarAvance">Actualizar Avance<br>de Obra</button>
                    <div class="ob-avance-barras">
                        <input type="range" id="sliderAvance" min="0" max="100" step="1" value="0">
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
<section class="vista ob-listado" data-vista="<?= $clave ?>">
    <div class="ob-subbarra">
        <?php foreach ($l['botones'] as $b): ?>
        <button type="button" class="ob-btn" data-sub="<?= $b[0] ?>"><?= $b[2] ?> <?= e($b[1]) ?></button>
        <?php endforeach; ?>
    </div>
    <div class="grid-caja">
        <table class="grid ob-grid">
            <thead><tr><th class="sel-col"></th><?php foreach ($l['columnas'] as $c): ?><th><?= e($c) ?></th><?php endforeach; ?></tr></thead>
            <tbody><tr class="vacio-fila"><td colspan="<?= count($l['columnas']) + 1 ?>">Sin registros.</td></tr></tbody>
        </table>
    </div>
    <?php if (!empty($l['totales'])): ?>
    <div class="ob-totales">
        <?php foreach ($l['totales'] as $t): ?>
        <label><?= e($t[1]) ?>: <output id="<?= $t[0] ?>">$0.00</output></label>
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
    </div>
    <div class="grid-caja">
        <table class="grid ob-grid">
            <thead><tr><th class="sel-col"></th><th>Nombre Archivo</th><th>Descripcion</th><th>Fecha</th><th>Usuario</th><th></th></tr></thead>
            <tbody><tr class="vacio-fila"><td colspan="6">No existen documentos adjuntos para mostrar.</td></tr></tbody>
        </table>
    </div>
</section>

<!-- ============ 10-MOV.MICROSIP ============ -->
<section class="vista" data-vista="microsip">
    <div class="vacio">
        <p>Movimientos de Microsip</p>
        <small>Aquí se verán los movimientos generados en Microsip al finalizar la obra.</small>
    </div>
</section>

<!-- ============ 11-PARAMETROS ============ -->
<section class="vista" data-vista="parametros">
    <div class="ob-parametros">
        <label>% Gastos de Administracion de Obra:
            <input type="number" id="gasAdminObra" class="num editable" min="0" step="0.01" value="0">
        </label>
        <label>Concepto de Gastos de Operacion:
            <select id="conGasOper" class="editable"><option value="">Cargando…</option></select>
        </label>
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

<script src="<?= recurso('js/obra.js') ?>"></script>
</body>
</html>
