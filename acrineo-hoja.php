<?php
// ACRINEO › Presupuestos › hoja de trabajo de un presupuesto (?id=N): partidas y subpartidas a la izquierda,
// conceptos de la partida arriba a la derecha y el catálogo de conceptos del presupuesto abajo.
require __DIR__ . '/includes/sesion.php';
require_once __DIR__ . '/includes/bd.php';
require __DIR__ . '/includes/acrineo/permisos.php';
acrineoExigir('presupuestos.ver');
require __DIR__ . '/includes/acrineo/hoja.php';
require __DIR__ . '/includes/acrineo/vistas/campos.php';

$id = max(0, (int) ($_GET['id'] ?? 0));
$aviso = '';
$ctx = null;
try {
    if (!acrineoHojaDisponible()) $aviso = 'Faltan las migraciones de la hoja (025, 026 y 027) (php herramientas/migrar.php --aplicar).';
    else {
        $ctx = acrineoHojaContexto($id);
        $ctx['monedas'] = acrineoHojaMonedas($id);
    }
} catch (AcrineoError $e) {
    $aviso = $e->getMessage();
} catch (Throwable $e) {
    error_log('ACRINEO hoja: ' . $e->getMessage());
    $aviso = 'No hay conexión con la base de datos. Intenta de nuevo en un momento.';
}
$puede = acrineoPermisosCliente();
$cfgCliente = [
    'permisos' => $puede,
    'esquema'  => acrineoEsquemaCliente(),
    'docMaxMb' => ACRINEO_DOC_MAX / 1024 / 1024,
    'docExt'   => array_keys(ACRINEO_DOC_EXTENSIONES),
    'hoja'     => $ctx,
];
$titulo = $ctx ? $ctx['codigo'] . ' · ' . $ctx['nombre'] : 'Presupuesto';
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="acri-token" content="<?= e($_SESSION['csrf']) ?>">
    <title><?= e($titulo) ?> · ACRINEO</title>
    <link rel="icon" href="<?= e(imagenSistema('favicon')) ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@700;800&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= recurso('css/acrineo.css') ?>">
    <script src="<?= recurso('js/tema.js') ?>"></script>
</head>
<body>
<div class="an-app">
    <header class="an-cabecera">
        <div class="an-marca">
            <span class="an-marca-icono"><?= anIcono('calc') ?></span>
            <div><b>ACRINEO</b><small>Sistema de presupuestos y control de costos</small></div>
        </div>
        <nav class="an-modulos" aria-label="Módulos de ACRINEO">
            <a href="acrineo-presupuestos.php" class="activo">Presupuestos</a>
        </nav>
    </header>

    <?php if ($aviso !== ''): ?>
    <main class="an-ventana">
        <div class="an-titulo-barra"><h1>Presupuesto</h1></div>
        <div class="an-aviso" role="alert"><?= e($aviso) ?></div>
        <p style="padding:0 16px 16px"><a href="acrineo-presupuestos.php">← Volver al catálogo de presupuestos</a></p>
    </main>
    <?php else: ?>
    <div class="an-hoja-barra">
        <a class="an-doc-pestana" href="acrineo-presupuestos.php" title="Volver al catálogo de presupuestos">
            <span id="anHojaTitulo"><?= e($titulo) ?></span><span aria-hidden="true">×</span>
        </a>
        <button type="button" class="an-btn an-mini" id="anHojaDetalle"><?= anIcono('editar') ?>Detalle</button>
        <span class="an-flex"></span>
        <label class="an-sobrecosto">% Sobrecosto
            <input type="number" id="anSobrecosto" step="0.0001" min="-99.9999" max="1000" inputmode="decimal"<?= $puede['presupuestos.editar'] ? '' : ' disabled' ?>>
        </label>
    </div>

    <!-- Pestañas de la hoja: Presupuesto y Matriz (doble clic en un concepto o su botón P.U.) -->
    <div class="an-hoja-pestanas" role="tablist" aria-label="Vistas del presupuesto">
        <button type="button" role="tab" id="anTabPresupuesto" aria-controls="anHoja" aria-selected="true">Presupuesto</button>
        <span class="an-tab-matriz" id="anTabMatrizCont" hidden>
            <button type="button" role="tab" id="anTabMatriz" aria-controls="anMatriz" aria-selected="false">Matriz</button>
            <button type="button" class="an-tab-cerrar" id="anMatrizCerrar" title="Cerrar la matriz" aria-label="Cerrar la matriz">×</button>
        </span>
    </div>

    <?php
    // Ojo (columnas ocultas), chincheta (columnas fijas) y ⋮ (más opciones) de una cuadrícula (js/acrineo/rejilla.js)
    $rejilla = function (string $nombre, string $tabla): string {
        return '<span class="an-rejilla-btns" data-rejilla="' . $nombre . '" data-tabla="' . $tabla . '">'
            . '<button type="button" class="an-btn an-mini an-btn-cuenta" data-cols title="Columnas ocultas" aria-label="Columnas ocultas" aria-haspopup="true">' . anIcono('ojo_no') . '<span>0</span></button>'
            . '<button type="button" class="an-btn an-mini an-btn-cuenta" data-fijas title="Columnas fijas" aria-label="Columnas fijas" aria-haspopup="true">' . anIcono('fijar') . '<span>0</span></button>'
            . '<span class="an-menu-cont"><button type="button" class="an-btn an-primario an-icono an-redondo" data-menu title="Más opciones" aria-label="Más opciones" aria-haspopup="true" aria-expanded="false">' . anIcono('mas') . '</button>'
            . '<div class="an-menu" role="menu" hidden></div></span></span>';
    };
    ?>
    <main class="an-hoja" id="anHoja" role="tabpanel" aria-labelledby="anTabPresupuesto">
        <!-- Filtro de conceptos en todo el presupuesto, totales y vista -->
        <div class="an-hoja-filtro">
            <label class="an-buscar an-buscar-azul">
                <span class="an-buscar-ico"><?= anIcono('buscar') ?></span>
                <input type="search" id="anFiltroQ" placeholder="Conceptos a filtrar en todo el presupuesto" aria-label="Conceptos a filtrar en todo el presupuesto">
            </label>
            <span class="an-flex"></span>
            <button type="button" class="an-btn an-icono an-redondo" id="anFiltroAplicar" title="Aplicar el filtro (Enter)" aria-label="Aplicar el filtro" aria-pressed="false"><?= anIcono('filtro') ?></button>
            <label class="an-check"><input type="checkbox" id="anFiltroTodo" checked> Todo el presupuesto</label>
            <span class="an-totales" id="anTotales" aria-live="polite"></span>
            <span class="an-flex"></span>
            <button type="button" class="an-btn an-primario an-icono an-redondo" id="anVistaCatalogo" title="Ocultar el catálogo de conceptos" aria-label="Mostrar u ocultar el catálogo de conceptos" aria-pressed="true"><?= anIcono('cuadricula') ?></button>
        </div>

        <!-- Partidas -->
        <section class="an-ventana an-panel-partidas" aria-label="Partidas">
            <div class="an-barra an-barra-chica">
                <?php if ($puede['presupuestos.editar']): ?>
                <button type="button" class="an-btn an-primario an-icono an-redondo" id="anPartidaNueva" title="Nueva partida" aria-label="Nueva partida">+</button>
                <button type="button" class="an-btn an-primario an-icono an-redondo" id="anSubpartidaNueva" title="Nueva subpartida de la seleccionada" aria-label="Nueva subpartida"><?= anIcono('subpartida') ?></button>
                <button type="button" class="an-btn an-primario an-icono an-redondo" id="anPartidaEliminar" title="Eliminar la partida seleccionada" aria-label="Eliminar partida"><?= anIcono('borrar') ?></button>
                <button type="button" class="an-btn an-primario an-icono an-redondo" id="anPartidaCopiar" title="Copiar la partida seleccionada (con sus subpartidas y conceptos)" aria-label="Copiar partida"><?= anIcono('portapapeles') ?></button>
                <button type="button" class="an-btn an-icono an-redondo" id="anPartidaEditar" title="Editar la partida seleccionada (F2 o doble clic)" aria-label="Editar partida"><?= anIcono('editar') ?></button>
                <?php endif; ?>
                <span class="an-flex"></span>
                <span class="an-ayuda" id="anPartidasConteo"></span>
                <?= $rejilla('partidas', 'anTablaPartidas') ?>
            </div>
            <div class="an-tabla-cont">
                <table class="an-tabla an-arbol" id="anTablaPartidas">
                    <thead><tr>
                        <th scope="col"><div class="an-th"><span>Partida</span></div></th>
                        <th scope="col"><div class="an-th"><span>Descripción completa</span></div></th>
                        <th scope="col" class="num"><div class="an-th"><span>Costo</span></div></th>
                        <th scope="col" class="num"><div class="an-th"><span>Precio</span></div></th>
                    </tr></thead>
                    <tbody id="anPartidas"></tbody>
                </table>
            </div>
            <?php if ($puede['presupuestos.editar']): ?>
            <div class="an-pie an-mover">
                <button type="button" data-mover="izquierda" title="Subir de nivel" aria-label="Subir de nivel">◀</button>
                <button type="button" data-mover="derecha" title="Bajar de nivel (subpartida de la de arriba)" aria-label="Bajar de nivel">▶</button>
                <button type="button" data-mover="arriba" title="Mover arriba" aria-label="Mover arriba">▲</button>
                <button type="button" data-mover="abajo" title="Mover abajo" aria-label="Mover abajo">▼</button>
            </div>
            <?php endif; ?>
        </section>

        <div class="an-hoja-derecha" id="anHojaDerecha">
            <!-- Conceptos de la partida -->
            <section class="an-ventana an-panel-renglones" aria-label="Conceptos de la partida">
                <div class="an-barra an-barra-chica">
                    <span class="an-menu-cont">
                        <button type="button" class="an-btn an-primario an-icono an-redondo" id="anRenglonesMenu" title="Opciones de la partida" aria-label="Opciones de la partida" aria-haspopup="true" aria-expanded="false"><?= anIcono('mas') ?></button>
                        <div class="an-menu an-menu-izq" id="anRenglonesMenuLista" role="menu" hidden></div>
                    </span>
                    <b class="an-partida-actual" id="anPartidaActual">Selecciona una partida</b>
                    <span class="an-flex"></span>
                    <?php if ($puede['presupuestos.editar']): ?>
                    <button type="button" class="an-btn an-mini" id="anAgregarRenglon" hidden>+ Agregar registro</button>
                    <button type="button" class="an-btn an-icono" id="anEditarRenglones" title="Editar los conceptos" aria-label="Editar los conceptos" aria-pressed="false" disabled><?= anIcono('editar') ?></button>
                    <button type="button" class="an-btn an-icono" id="anDeshacer" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" disabled>↶</button>
                    <button type="button" class="an-btn an-icono" id="anRehacer" title="Rehacer (Ctrl+Y)" aria-label="Rehacer" disabled>↷</button>
                    <button type="button" class="an-btn an-icono" id="anGuardarRenglones" title="Guardar" aria-label="Guardar" disabled><?= anIcono('guardar') ?></button>
                    <button type="button" class="an-btn an-icono" id="anCancelarRenglones" title="Cancelar los cambios" aria-label="Cancelar los cambios" disabled><?= anIcono('cerrar') ?></button>
                    <button type="button" class="an-btn an-icono an-peligro" id="anQuitarRenglones" title="Quitar los marcados de la partida" aria-label="Quitar los marcados" disabled><?= anIcono('borrar') ?></button>
                    <?php endif; ?>
                    <?= $rejilla('renglones', 'anTablaRenglones') ?>
                </div>
                <div class="an-tabla-cont">
                    <table class="an-tabla an-renglones" id="anTablaRenglones">
                        <thead><tr>
                            <th class="an-col-sel" scope="col"><div class="an-th"><input type="checkbox" id="anRenglonesTodos" aria-label="Marcar todos"></div></th>
                            <th scope="col" class="an-col-url" title="Enlace del concepto (ficha técnica, plano…)"><div class="an-th"><span>URL</span></div></th>
                            <th scope="col" class="an-col-pa" title="Precio alzado: el precio unitario se captura fijo"><div class="an-th"><span>P.A.</span></div></th>
                            <th scope="col"><div class="an-th"><span>Código</span></div></th>
                            <th scope="col"><div class="an-th"><span>Descripción completa</span></div></th>
                            <th scope="col"><div class="an-th"><span>Unidad</span></div></th>
                            <th scope="col" class="num"><div class="an-th"><span>Cantidad</span></div></th>
                            <th scope="col" class="num"><div class="an-th"><span>Costo</span></div></th>
                            <th scope="col" class="num"><div class="an-th"><span>Precio</span></div></th>
                            <th scope="col" class="num"><div class="an-th"><span>Importe</span></div></th>
                            <th scope="col" class="num an-col-tipo" title="Tipo de concepto"><div class="an-th"><span>Tipo</span></div></th>
                            <th scope="col" title="Matriz de precio unitario"><div class="an-th"><span>P.U.</span></div></th>
                        </tr></thead>
                        <tbody id="anRenglones"></tbody>
                    </table>
                </div>
                <div class="an-pie"><span id="anRenglonesEstado" class="an-estado" role="status"></span><span class="an-flex"></span>Σ <b id="anRenglonesTotal">$ 0.00</b></div>
            </section>

            <!-- Catálogo de conceptos del presupuesto -->
            <section class="an-ventana an-panel-catalogo" id="anPanelCatalogo" aria-label="Catálogo de conceptos del presupuesto">
                <div class="an-barra an-barra-chica">
                    <label class="an-buscar an-buscar-azul">
                        <span class="an-buscar-ico"><?= anIcono('buscar') ?></span>
                        <input type="search" id="anConceptosQ" placeholder="Filtrar por código, descripción, unidad…" aria-label="Filtrar conceptos">
                    </label>
                    <span class="an-ayuda" id="anConceptosConteo"></span>
                    <span class="an-flex"></span>
                    <button type="button" class="an-btn an-primario an-icono an-redondo" id="anConceptosGrafica" title="Gráfica: importe de los conceptos en el presupuesto" aria-label="Gráfica de los conceptos"><?= anIcono('grafica') ?></button>
                    <?php if ($puede['presupuestos.editar']): ?>
                    <button type="button" class="an-btn an-primario an-icono an-redondo" id="anCopiar" disabled title="Copia los marcados a la partida seleccionada" aria-label="Copiar a la partida"><?= anIcono('enviar') ?></button>
                    <?php endif; ?>
                    <?= $rejilla('conceptos', 'anTablaConceptos') ?>
                </div>
                <div class="an-tabla-cont">
                    <table class="an-tabla" id="anTablaConceptos">
                        <thead><tr>
                            <th class="an-col-sel" scope="col"><div class="an-th"></div></th>
                            <th scope="col"><div class="an-th"><span>Código</span></div></th>
                            <th scope="col" class="num"><div class="an-th"><span>Cantidad a copiar</span></div></th>
                            <th scope="col"><div class="an-th"><span>Descripción completa</span></div></th>
                            <th scope="col"><div class="an-th"><span>Unidad</span></div></th>
                            <th scope="col" class="num"><div class="an-th"><span>Costo</span></div></th>
                            <th scope="col" class="num"><div class="an-th"><span>Precio</span></div></th>
                            <th scope="col" class="num"><div class="an-th"><span>En partidas</span></div></th>
                            <th scope="col" class="num"><div class="an-th"><span>Tipo</span></div></th>
                            <th scope="col"><div class="an-th"><span>URL</span></div></th>
                            <th scope="col"><div class="an-th"><span>P.U.</span></div></th>
                        </tr></thead>
                        <tbody id="anConceptos"></tbody>
                    </table>
                </div>
            </section>
        </div>
    </main>

    <!-- Gráfica del catálogo de conceptos -->
    <dialog class="an-dialogo an-grafica-dlg" id="anGrafica" aria-labelledby="anGraficaTitulo">
        <div class="an-titulo-barra"><h2 id="anGraficaTitulo">Importe de los conceptos en el presupuesto</h2><span class="an-flex"></span>
            <button type="button" class="an-btn-cab an-icono" data-grafica-cerrar aria-label="Cerrar"><?= anIcono('cerrar') ?></button></div>
        <div class="an-grafica" id="anGraficaCuerpo"></div>
    </dialog>
    <?php require __DIR__ . '/includes/acrineo/vistas/matriz.php'; ?>
    <?php endif; ?>
</div>
<div class="an-toasts" id="anToasts" aria-live="polite"></div>

<?php if ($aviso === ''): ?>
<?php require __DIR__ . '/includes/acrineo/vistas/detalle.php'; ?>
<?php require __DIR__ . '/includes/acrineo/vistas/dialogos.php'; ?>
<?php require __DIR__ . '/includes/acrineo/vistas/catalogos-chicos.php'; ?>
<script>
    window.ACRINEO = <?= json_encode($cfgCliente, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_PRESERVE_ZERO_FRACTION) ?>;
</script>
<script src="<?= recurso('js/xlsx-simple.js') ?>"></script>
<script src="<?= recurso('js/acrineo/api.js') ?>"></script>
<script src="<?= recurso('js/acrineo/ui.js') ?>"></script>
<script src="<?= recurso('js/acrineo/buscador.js') ?>"></script>
<script src="<?= recurso('js/acrineo/documentos.js') ?>"></script>
<script src="<?= recurso('js/acrineo/detalle-presupuesto.js') ?>"></script>
<script src="<?= recurso('js/acrineo/catalogo-chico.js') ?>"></script>
<script src="<?= recurso('js/acrineo/rejilla.js') ?>"></script>
<script src="<?= recurso('js/acrineo/hoja.js') ?>"></script>
<script src="<?= recurso('js/acrineo/hoja-renglones.js') ?>"></script>
<script src="<?= recurso('js/acrineo/hoja-conceptos.js') ?>"></script>
<script src="<?= recurso('js/acrineo/hoja-matriz.js') ?>"></script>
<?php endif; ?>
</body>
</html>
