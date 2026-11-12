<?php
// ACRINEO › Presupuestos: «Catálogo de presupuestos» y la ventana «Detalle del presupuesto».
// ?id=N abre directo ese presupuesto (enlace de COMPARTIR).
require __DIR__ . '/includes/sesion.php';
require_once __DIR__ . '/includes/bd.php';
require __DIR__ . '/includes/acrineo/permisos.php';
acrineoExigir('presupuestos.ver');
require __DIR__ . '/includes/acrineo/presupuestos.php';
require __DIR__ . '/includes/acrineo/vistas/campos.php';

$aviso = '';
try {
    if (!acrineoDisponible()) $aviso = 'ACRINEO todavía no está instalado en la base de datos: falta aplicar la migración 024_acrineo_presupuestos.sql (php herramientas/migrar.php --aplicar).';
} catch (Throwable $e) {
    error_log('ACRINEO presupuestos: ' . $e->getMessage());
    $aviso = 'No hay conexión con la base de datos. Intenta de nuevo en un momento.';
}
$puede = acrineoPermisosCliente();

// Menú del módulo: se activan conforme se construyen
$modulos = ['Dashboard', 'Presupuestos', 'Catálogo de conceptos', 'Insumos', 'Matrices', 'Precios unitarios', 'Explosión de insumos',
            'Proveedores', 'Estimaciones', 'Control de obra', 'Reportes', 'Configuración'];
$cfgCliente = [
    'permisos' => $puede,
    'esquema'  => acrineoEsquemaCliente(),
    'abrir'    => max(0, (int) ($_GET['id'] ?? 0)),
    'docMaxMb' => ACRINEO_DOC_MAX / 1024 / 1024,
    'docExt'   => array_keys(ACRINEO_DOC_EXTENSIONES),
];
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="acri-token" content="<?= e($_SESSION['csrf']) ?>">
    <title>ACRINEO · Presupuestos</title>
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
            <?php foreach ($modulos as $m): ?>
                <?php if ($m === 'Presupuestos'): ?>
                <a href="acrineo-presupuestos.php" class="activo" aria-current="page"><?= e($m) ?></a>
                <?php else: ?>
                <span aria-disabled="true" title="Se activará en una siguiente etapa"><?= e($m) ?><em>Próximamente</em></span>
                <?php endif; ?>
            <?php endforeach; ?>
        </nav>
    </header>

    <main class="an-ventana">
        <div class="an-titulo-barra"><h1>Catálogo de presupuestos</h1></div>
        <?php if ($aviso !== ''): ?>
        <div class="an-aviso" role="alert"><?= e($aviso) ?></div>
        <?php else: ?>
        <div class="an-barra">
            <label class="an-buscar">
                <?= anIcono('buscar') ?>
                <input type="search" id="anBuscar" placeholder="Filtrar por organización, propietario, presupuesto, descripción, ciudad…" aria-label="Buscar presupuestos">
            </label>
            <select id="anCiudad" class="an-select" aria-label="Filtrar por ciudad"><option value="">Ciudad: todas</option></select>
            <select id="anEstatus" class="an-select" aria-label="Filtrar por estatus">
                <option value="">Estatus: todos</option>
                <?php foreach (ACRINEO_ESTATUS as $k => $t): ?><option value="<?= e($k) ?>"><?= e($t) ?></option><?php endforeach; ?>
            </select>
            <span class="an-flex"></span>
            <?php if ($puede['presupuestos.crear']): ?>
            <button type="button" class="an-btn an-primario" id="anNuevo"><?= anIcono('nuevo') ?>Nuevo</button>
            <?php endif; ?>
            <?php if ($puede['presupuestos.compartir']): ?>
            <button type="button" class="an-btn" id="anCompartir" disabled title="Selecciona un presupuesto"><?= anIcono('compartir') ?>Compartir</button>
            <?php endif; ?>
            <?php if ($puede['presupuestos.respaldar']): ?>
            <button type="button" class="an-btn" id="anRespaldar" disabled title="Selecciona uno o varios presupuestos"><?= anIcono('respaldar') ?>Respaldar</button>
            <?php endif; ?>
            <div class="an-menu-cont">
                <button type="button" class="an-btn an-icono" id="anMas" aria-haspopup="menu" aria-expanded="false" title="Más opciones"><?= anIcono('mas') ?></button>
                <div class="an-menu" id="anMenuMas" role="menu" hidden>
                    <button type="button" role="menuitem" data-menu="abrir"><?= anIcono('editar') ?>Abrir detalle</button>
                    <button type="button" role="menuitem" data-menu="historial"><?= anIcono('historial') ?>Ver historial</button>
                    <?php if ($puede['presupuestos.eliminar']): ?>
                    <button type="button" role="menuitem" data-menu="eliminar"><?= anIcono('borrar') ?>Eliminar seleccionados</button>
                    <?php endif; ?>
                    <div class="an-sep"></div>
                    <button type="button" role="menuitem" data-menu="limpiar"><?= anIcono('limpiar') ?>Quitar filtros</button>
                    <button type="button" role="menuitem" data-menu="refrescar"><?= anIcono('refrescar') ?>Refrescar</button>
                </div>
            </div>
        </div>
        <div class="an-chips" id="anChips" aria-label="Agrupación y filtros activos"></div>
        <div class="an-tabla-cont" id="anTablaCont">
            <table class="an-tabla" id="anTabla" aria-label="Catálogo de presupuestos">
                <thead><tr id="anEncabezado"></tr></thead>
                <tbody id="anFilas"><tr class="an-vacio"><td colspan="20">Cargando…</td></tr></tbody>
            </table>
        </div>
        <footer class="an-pie">
            <span id="anConteo"></span>
            <span id="anSeleccion"></span>
            <span class="an-flex"></span>
            <label>Por página
                <select id="anPorPagina"><?php foreach ([25, 50, 100, 200] as $n): ?><option<?= $n === 50 ? ' selected' : '' ?>><?= $n ?></option><?php endforeach; ?></select>
            </label>
            <nav class="an-paginas" id="anPaginas" aria-label="Páginas"></nav>
        </footer>
        <?php endif; ?>
    </main>
</div>
<div class="an-toasts" id="anToasts" aria-live="polite"></div>

<?php if ($aviso === ''): ?>
<?php require __DIR__ . '/includes/acrineo/vistas/detalle.php'; ?>
<?php require __DIR__ . '/includes/acrineo/vistas/dialogos.php'; ?>
<script>
    window.ACRINEO = <?= json_encode($cfgCliente, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_PRESERVE_ZERO_FRACTION) ?>;
</script>
<script src="<?= recurso('js/xlsx-simple.js') ?>"></script>
<script src="<?= recurso('js/acrineo/api.js') ?>"></script>
<script src="<?= recurso('js/acrineo/ui.js') ?>"></script>
<script src="<?= recurso('js/acrineo/buscador.js') ?>"></script>
<script src="<?= recurso('js/acrineo/documentos.js') ?>"></script>
<script src="<?= recurso('js/acrineo/detalle-presupuesto.js') ?>"></script>
<script src="<?= recurso('js/acrineo/catalogo-presupuestos.js') ?>"></script>
<?php endif; ?>
</body>
</html>
