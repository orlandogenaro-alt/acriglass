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
    else $ctx = acrineoHojaContexto($id);
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
        <span class="an-totales" id="anTotales" aria-live="polite"></span>
    </div>

    <!-- Pestañas de la hoja: Presupuesto y Matriz (doble clic en un concepto o su botón P.U.) -->
    <div class="an-hoja-pestanas" role="tablist" aria-label="Vistas del presupuesto">
        <button type="button" role="tab" id="anTabPresupuesto" aria-controls="anHoja" aria-selected="true">Presupuesto</button>
        <span class="an-tab-matriz" id="anTabMatrizCont" hidden>
            <button type="button" role="tab" id="anTabMatriz" aria-controls="anMatriz" aria-selected="false">Matriz</button>
            <button type="button" class="an-tab-cerrar" id="anMatrizCerrar" title="Cerrar la matriz" aria-label="Cerrar la matriz">×</button>
        </span>
    </div>

    <main class="an-hoja" id="anHoja" role="tabpanel" aria-labelledby="anTabPresupuesto">
        <!-- Partidas -->
        <section class="an-ventana an-panel-partidas" aria-label="Partidas">
            <div class="an-barra an-barra-chica">
                <?php if ($puede['presupuestos.editar']): ?>
                <button type="button" class="an-btn an-primario an-icono" id="anPartidaNueva" title="Nueva partida" aria-label="Nueva partida">+</button>
                <button type="button" class="an-btn an-primario an-icono" id="anSubpartidaNueva" title="Nueva subpartida de la seleccionada" aria-label="Nueva subpartida"><?= anIcono('nuevo') ?></button>
                <button type="button" class="an-btn an-icono" id="anPartidaEditar" title="Editar la partida seleccionada" aria-label="Editar partida"><?= anIcono('editar') ?></button>
                <button type="button" class="an-btn an-icono an-peligro" id="anPartidaEliminar" title="Eliminar la partida seleccionada" aria-label="Eliminar partida"><?= anIcono('borrar') ?></button>
                <?php endif; ?>
                <span class="an-flex"></span>
                <span class="an-ayuda" id="anPartidasConteo"></span>
            </div>
            <div class="an-tabla-cont">
                <table class="an-tabla an-arbol">
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

        <div class="an-hoja-derecha">
            <!-- Conceptos de la partida -->
            <section class="an-ventana an-panel-renglones" aria-label="Conceptos de la partida">
                <div class="an-barra an-barra-chica">
                    <b class="an-partida-actual" id="anPartidaActual">Selecciona una partida</b>
                    <span class="an-flex"></span>
                    <?php if ($puede['presupuestos.editar']): ?>
                    <button type="button" class="an-btn an-icono" id="anDeshacer" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" hidden disabled>↶</button>
                    <button type="button" class="an-btn an-icono" id="anRehacer" title="Rehacer (Ctrl+Y)" aria-label="Rehacer" hidden disabled>↷</button>
                    <button type="button" class="an-btn an-icono" id="anEditarRenglones" title="Editar los conceptos" aria-label="Editar los conceptos" aria-pressed="false" disabled><?= anIcono('editar') ?></button>
                    <button type="button" class="an-btn an-mini" id="anAgregarRenglon" hidden>+ Agregar registro</button>
                    <button type="button" class="an-btn an-mini an-peligro" id="anQuitarRenglones" hidden>Quitar marcados</button>
                    <button type="button" class="an-btn an-mini" id="anCancelarRenglones" hidden>Cancelar</button>
                    <button type="button" class="an-btn an-mini an-primario" id="anGuardarRenglones" hidden>Guardar</button>
                    <?php endif; ?>
                </div>
                <div class="an-tabla-cont">
                    <table class="an-tabla an-renglones">
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
            <section class="an-ventana an-panel-catalogo" aria-label="Catálogo de conceptos del presupuesto">
                <div class="an-barra an-barra-chica">
                    <label class="an-buscar">
                        <?= anIcono('buscar') ?>
                        <input type="search" id="anConceptosQ" placeholder="Filtrar por código, descripción, unidad…" aria-label="Filtrar conceptos">
                    </label>
                    <span class="an-ayuda" id="anConceptosConteo"></span>
                    <span class="an-flex"></span>
                    <?php if ($puede['presupuestos.editar']): ?>
                    <button type="button" class="an-btn an-mini an-primario" id="anCopiar" disabled title="Copia los marcados a la partida seleccionada">➤ Copiar a la partida</button>
                    <?php endif; ?>
                </div>
                <div class="an-tabla-cont">
                    <table class="an-tabla">
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
<script src="<?= recurso('js/acrineo/hoja.js') ?>"></script>
<script src="<?= recurso('js/acrineo/hoja-renglones.js') ?>"></script>
<script src="<?= recurso('js/acrineo/hoja-conceptos.js') ?>"></script>
<script src="<?= recurso('js/acrineo/hoja-matriz.js') ?>"></script>
<?php endif; ?>
</body>
</html>
