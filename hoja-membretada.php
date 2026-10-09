<?php
// Administrador › Hoja Membretada: encabezado, logo y firmas de los formatos impresos
require __DIR__ . '/includes/sesion.php';
require __DIR__ . '/includes/membrete.php';
exigirPermiso('ADMIN_USER');

$m = membreteImpresion();
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="acri-token" content="<?= e($_SESSION['csrf']) ?>">
    <title>Hoja Membretada · AcriGlass</title>
    <link rel="icon" href="<?= e(imagenSistema('favicon')) ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@700;800&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= recurso('css/catalogo.css') ?>">
    <link rel="stylesheet" href="<?= recurso('css/formato-presupuesto.css') ?>">
    <link rel="stylesheet" href="<?= recurso('css/hoja-membretada.css') ?>">
</head>
<body>

<header class="c-cabecera">
    <h1><span class="m-acri">ACRI</span> <span class="m-glass">GLASS</span> <span class="h-texto">Hoja Membretada</span></h1>
    <p>Encabezado, logo y firmas de los formatos impresos (<b>Imprimir</b> e <b>Imprimir Detalle</b> del Presupuesto de Obra).
        La vista previa de la derecha usa datos de ejemplo y muestra cómo sale la hoja. Los cambios aplican a todos los usuarios
        la próxima vez que abran un presupuesto.</p>
</header>

<div class="hm">
    <form class="hm-form" id="form" autocomplete="off">
        <div class="c-seccion">Logo</div>
        <div class="hm-logo">
            <div class="hm-logo-vista"><img id="logo" src="<?= e($m['logo']) ?>" alt=""></div>
            <div>
                <p id="logoEstado"><?= $m['logo_propio'] ? 'Logo propio de la hoja.' : 'Se usa el logo del sistema (Imagen del Sistema).' ?></p>
                <label class="c-btn hm-subir">Subir logo<input type="file" id="logoArchivo" accept="image/png,image/jpeg,image/webp" hidden></label>
                <button type="button" class="c-btn" id="logoQuitar"<?= $m['logo_propio'] ? '' : ' disabled' ?>>Quitar</button>
                <small>PNG, JPG o WEBP horizontal (unos 600×200 px), hasta 2 MB.</small>
            </div>
        </div>

        <div class="c-seccion">Encabezado</div>
        <div class="c-campos">
            <label class="c-campo completo"><span>Empresa bajo el logo (opcional)</span>
                <input name="empresa" maxlength="120" placeholder="<?= e(sistemaConfig()['empresa']['nombre']) ?>">
                <small>Vacío = no se imprime (útil si el logo ya trae el nombre).</small></label>
            <label class="c-campo completo"><span>Datos bajo el logo (opcional)</span>
                <textarea name="datos" maxlength="300" placeholder="Dirección, teléfonos, RFC…"></textarea></label>
            <label class="c-campo"><span>Título</span><input name="titulo" maxlength="60"></label>
            <label class="c-campo"><span>Título del detalle</span><input name="titulo_detalle" maxlength="60"></label>
            <label class="c-campo"><span>Código del formato</span><input name="codigo" maxlength="20"></label>
            <label class="c-campo"><span>Revisión</span><input name="revision" maxlength="10"></label>
            <label class="c-campo"><span>Color de líneas y títulos</span><input type="color" name="color"></label>
            <label class="c-campo check"><input type="checkbox" name="mostrar_notas"> Mostrar las notas del presupuesto</label>
        </div>

        <div class="c-seccion">Firmas <small>Deja vacío un recuadro para quitarlo.</small></div>
        <div class="c-campos hm-firmas">
            <?php for ($i = 0; $i < 4; $i++): ?>
            <label class="c-campo"><span>Recuadro <?= $i + 1 ?></span><input name="firma<?= $i ?>" maxlength="30"></label>
            <?php endfor; ?>
            <label class="c-campo completo"><span>Leyenda de las firmas</span><input name="leyenda_firma" maxlength="40"></label>
        </div>

        <div class="c-seccion">Pie de página (opcional)</div>
        <div class="c-campos">
            <label class="c-campo completo"><textarea name="pie" maxlength="300" placeholder="Ej. Precios sujetos a cambio sin previo aviso."></textarea></label>
        </div>

        <div class="hm-botones">
            <button type="button" class="c-btn" id="restablecer">Restablecer textos</button>
            <span class="c-espacio"></span>
            <button type="submit" class="c-accion principal" id="guardar">Guardar</button>
        </div>
        <p class="c-mensaje" id="mensaje" role="status"></p>
    </form>

    <section class="hm-previa">
        <div class="hm-previa-barra">
            <span>Vista previa</span>
            <label><input type="radio" name="tipoPrevia" value="normal" checked> Imprimir</label>
            <label><input type="radio" name="tipoPrevia" value="detalle"> Imprimir Detalle</label>
        </div>
        <div class="hm-papel" id="previa"></div>
    </section>
</div>

<script>
    window.ACRI_MEMBRETE = <?= json_encode($m, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.ACRI_USUARIO = <?= json_encode($usuarioSesion, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
</script>
<script src="<?= recurso('js/formato-presupuesto.js') ?>"></script>
<script src="<?= recurso('js/hoja-membretada.js') ?>"></script>
</body>
</html>
