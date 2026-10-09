<?php
// Plantilla de las pantallas tipo catálogo (Bases de datos, APIs y servicios).
// Antes de incluirla, definir $pagina = [id, titulo, api, script, descripcion (HTML), botones => [[accion, texto, principal?]]]
$imgFavicon = imagenSistema('favicon');
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="acri-token" content="<?= e($_SESSION['csrf']) ?>">
    <title><?= e($pagina['titulo']) ?> · AcriGlass</title>
    <link rel="icon" href="<?= e($imgFavicon) ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@700;800&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= recurso('css/catalogo.css') ?>">
</head>
<body data-catalogo="<?= e($pagina['id']) ?>" data-api="<?= e($pagina['api']) ?>" data-usuario="<?= e($usuarioSesion) ?>">

<!-- Vistas y herramientas de la lista -->
<div class="c-superior">
    <nav class="c-vistas" id="vistas"></nav>
    <div class="c-herramientas">
        <span class="c-registros" id="registros">0 registros</span>
        <input type="search" id="localizar" placeholder="Localizar en la lista…" autocomplete="off">
        <div class="c-drop">
            <button class="c-btn" id="btnColumnas">⚙ Editar columnas</button>
            <div class="c-menu" id="menuColumnas"></div>
        </div>
        <div class="c-drop">
            <button class="c-btn" id="btnVistas">▾ Todas las vistas</button>
            <div class="c-menu derecha" id="menuVistas"></div>
        </div>
    </div>
</div>

<header class="c-cabecera">
    <h1><span class="m-acri">ACRI</span> <span class="m-glass">GLASS</span> <span class="h-texto"><?= e($pagina['titulo']) ?></span></h1>
    <p><?= $pagina['descripcion'] ?></p>
    <?php if (modoConfiguracion()): ?>
    <p class="c-aviso">⚠ <b>Modo configuración:</b> captura la contraseña de la conexión <b>AW</b> y pruébala.
        Después cierra sesión y entra con tu usuario de AW-Management.</p>
    <?php endif; ?>
</header>

<div class="c-cuerpo">
    <div class="c-tabla">
        <table class="c-grid">
            <thead><tr id="encabezado"></tr></thead>
            <tbody id="filas"><tr class="c-vacio"><td>Cargando…</td></tr></tbody>
        </table>
    </div>
    <aside class="c-acciones">
        <?php foreach ($pagina['botones'] as $b): ?>
        <button class="c-accion<?= !empty($b[2]) ? ' principal' : '' ?>" data-accion="<?= e($b[0]) ?>"><?= $b[1] ?></button>
        <?php endforeach; ?>
    </aside>
</div>
<p class="c-mensaje" id="mensaje" role="status"></p>

<!-- Formulario de alta / edición -->
<dialog class="c-dialogo" id="dialogo">
    <form method="dialog" id="formulario">
        <h2 id="dlgTitulo"></h2>
        <div class="c-campos" id="campos"></div>
        <p class="c-resultado" id="dlgResultado"></p>
        <div class="c-dlg-botones">
            <button type="button" class="c-btn peligro" id="dlgEliminar">Eliminar</button>
            <button type="button" class="c-btn" id="dlgProbar">Probar</button>
            <span class="c-espacio"></span>
            <button type="button" class="c-btn" id="dlgCancelar">Cancelar</button>
            <button type="submit" class="c-accion principal" id="dlgGuardar">Guardar</button>
        </div>
    </form>
</dialog>

<script src="<?= recurso('js/catalogo.js') ?>"></script>
<script src="<?= recurso($pagina['script']) ?>"></script>
</body>
</html>
