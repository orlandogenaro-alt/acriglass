<?php
// ACRINEO › Catálogos generales (menú Catalogos): ?c=unidades|tipos_insumo|familias|estados|ciudades|proveedores|
// responsables|empresas|tipos_licitacion|regiones. La cuadrícula la arma js/acrineo/catalogos-generales.js.
require __DIR__ . '/includes/sesion.php';
require_once __DIR__ . '/includes/bd.php';
require __DIR__ . '/includes/acrineo/permisos.php';
acrineoExigir('presupuestos.ver');
require __DIR__ . '/includes/acrineo/catalogos-generales.php';
require __DIR__ . '/includes/acrineo/vistas/campos.php';

$clave = (string) ($_GET['c'] ?? '');
$defs = acrineoCatGenerales();
if (!isset($defs[$clave])) $clave = array_key_first($defs);
$titulo = $defs[$clave]['titulo'];
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="acri-token" content="<?= e($_SESSION['csrf']) ?>">
    <title>ACRINEO · Catálogo <?= e($titulo) ?></title>
    <link rel="icon" href="<?= e(imagenSistema('favicon')) ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@700;800&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= recurso('css/acrineo.css') ?>">
    <script src="<?= recurso('js/tema.js') ?>"></script>
</head>
<body>
<div class="an-app">
    <main class="an-ventana an-catgen" data-catalogo="<?= e($clave) ?>">
        <div class="an-titulo-barra">
            <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>
            <h1>Catálogo <?= e($titulo) ?></h1>
            <span class="an-flex"></span>
            <small class="an-catgen-sub">Generales</small>
        </div>
        <div class="an-barra">
            <label class="an-buscar an-buscar-azul">
                <button type="button" class="an-buscar-ico an-buscar-modo" data-modo="contiene"></button>
                <input type="search" id="cgFiltro" placeholder="Filtrar por cualquier columna" aria-label="Filtrar el catálogo">
            </label>
            <span class="an-flex"></span>
            <span class="an-estado" id="cgEstado" role="status"></span>
            <button type="button" class="an-btn an-primario" id="cgNuevo" hidden title="Nuevo registro (Insert)"><?= anIcono('nuevo') ?>Nuevo</button>
            <button type="button" class="an-btn an-icono" id="cgEditar" hidden disabled title="Editar el renglón seleccionado (F2 o doble clic)" aria-label="Editar"><?= anIcono('editar') ?></button>
            <button type="button" class="an-btn an-icono an-peligro" id="cgBorrar" hidden disabled title="Borrar el renglón seleccionado (Supr)" aria-label="Borrar"><?= anIcono('borrar') ?></button>
            <button type="button" class="an-btn an-icono" id="cgPegar" hidden title="Pegar de Excel (Ctrl+V): copia en Excel los renglones con las columnas en el mismo orden" aria-label="Pegar de Excel"><?= anIcono('portapapeles') ?></button>
            <button type="button" class="an-btn an-icono" id="cgExcel" title="Exportar a Excel" aria-label="Exportar a Excel"><?= anIcono('descargar') ?></button>
            <button type="button" class="an-btn an-icono" id="cgRefrescar" title="Refrescar" aria-label="Refrescar"><?= anIcono('refrescar') ?></button>
        </div>
        <div class="an-aviso an-catgen-nota" id="cgNota" hidden></div>
        <div class="an-tabla-cont" id="cgCont" tabindex="0">
            <table class="an-tabla an-catgen-tabla" id="cgTabla" aria-label="Catálogo <?= e($titulo) ?>">
                <thead><tr id="cgEncabezado"></tr></thead>
                <tbody id="cgFilas"><tr class="an-vacio"><td>Cargando…</td></tr></tbody>
            </table>
        </div>
        <footer class="an-pie">
            <span># <b id="cgTotal">0</b></span>
            <span id="cgMostrando"></span>
            <span class="an-flex"></span>
            <span class="an-ayuda">Doble clic o F2 edita · Enter guarda · Esc cancela</span>
        </footer>
    </main>
</div>
<div class="an-toasts" id="anToasts" aria-live="polite"></div>
<?php require __DIR__ . '/includes/acrineo/vistas/dialogos.php'; ?>
<script src="<?= recurso('js/xlsx-simple.js') ?>"></script>
<script src="<?= recurso('js/acrineo/api.js') ?>"></script>
<script src="<?= recurso('js/acrineo/ui.js') ?>"></script>
<script src="<?= recurso('js/acrineo/catalogos-generales.js') ?>"></script>
</body>
</html>
