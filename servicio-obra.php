<?php
// Una pantalla del menú Servicios (?m=apartado). La arma js/servicios-obra.js con api/servicios-obra.php
require __DIR__ . '/includes/sesion.php';
require __DIR__ . '/includes/servicios-obra.php';
exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'CERRAR_OBRA', 'ADMIN_USER');

try {
    $m = soModulo((string) ($_GET['m'] ?? ''));
} catch (InvalidArgumentException $e) {
    http_response_code(404);
    exit('Apartado de Servicios no válido.');
}
$registro = $m['tipo'] === 'registro';
$config = [
    'id' => $m['id'], 'titulo' => $m['titulo'], 'tipo' => $m['tipo'], 'filtro' => $m['filtro'], 'cobranza' => $m['cobranza'],
    'columnas' => $m['columnas'], 'totales' => $m['totales'], 'agrupar' => $m['agrupar'], 'agrupar_inicial' => $m['agrupar_inicial'] ?? '',
    'campos' => $m['campos'], 'sin_obra' => $m['sin_obra'], 'max_mb' => SO_ARCHIVO_MAX_MB,
];
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="acri-token" content="<?= e($_SESSION['csrf']) ?>">
    <title><?= e($m['titulo']) ?> · AcriGlass</title>
    <link rel="icon" href="<?= e(imagenSistema('favicon')) ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@700;800&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= recurso('css/catalogo.css') ?>">
    <link rel="stylesheet" href="<?= recurso('css/servicios-obra.css') ?>">
</head>
<body class="so-<?= e($m['tipo']) ?>">

<header class="c-cabecera so-cabecera">
    <h1><span class="m-acri">ACRI</span> <span class="m-glass">GLASS</span> <span class="h-texto"><?= e($m['titulo']) ?></span></h1>
    <p><?= e($m['descripcion']) ?></p>
    <p class="so-impreso" id="impreso"></p>
</header>

<div class="so-barra">
    <label>Año <select id="anio"></select></label>
    <?php if ($m['filtro'] !== 'presupuesto'): ?>
    <label class="so-obra">Obra <select id="obra"><option value="0">Todas</option></select></label>
    <?php endif; ?>
    <?php if ($m['agrupar']): ?>
    <label>Agrupar por <select id="agrupar"><option value="">(ninguno)</option>
        <?php foreach ($m['agrupar'] as [$campo, $texto]): ?><option value="<?= e($campo) ?>"><?= e($texto) ?></option><?php endforeach; ?>
    </select></label>
    <?php endif; ?>
    <input type="search" id="buscar" placeholder="Filtrar…" autocomplete="off">
    <span class="c-espacio"></span>
    <button class="c-btn" id="btnConsultar">🔎 Consultar</button>
    <button class="c-btn" id="btnExcel">📗 Exportar a Excel</button>
    <button class="c-btn" id="btnImprimir">🖨 Imprimir</button>
    <?php if ($registro): ?>
    <button class="c-accion principal" id="btnNuevo">＋ Nuevo</button>
    <?php endif; ?>
</div>

<p class="so-estado" id="estado" role="status"></p>
<div class="so-kpis" id="kpis"></div>
<div class="so-vista" id="vista"></div>
<p class="so-pie" id="pie"></p>

<?php if ($registro): ?>
<dialog class="c-dialogo so-dialogo" id="dialogo">
    <form method="dialog" id="formulario">
        <h2 id="dlgTitulo"></h2>
        <div class="c-campos" id="campos"></div>
        <p class="c-resultado" id="dlgResultado"></p>
        <div class="c-dlg-botones">
            <button type="button" class="c-btn peligro" id="dlgEliminar">Eliminar</button>
            <span class="c-espacio"></span>
            <button type="button" class="c-btn" id="dlgCancelar">Cancelar</button>
            <button type="submit" class="c-accion principal" id="dlgGuardar">Guardar</button>
        </div>
    </form>
</dialog>
<?php endif; ?>

<script>
    window.SO = <?= json_encode($config, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.SO.usuario = <?= json_encode($usuarioSesion, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
</script>
<script src="<?= recurso('js/servicios-obra.js') ?>"></script>
</body>
</html>
