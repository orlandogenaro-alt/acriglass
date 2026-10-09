<?php
require __DIR__ . '/includes/sesion.php';
exigirPermiso('ADMIN_USER');

$cfg      = sistemaConfig();
$imagenes = estadoImagenes();
$inicial  = mb_strtoupper(mb_substr($usuarioSesion, 0, 1));
$urlSitio = ($_SERVER['HTTP_HOST'] ?? 'localhost') . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\') . '/principal.php';

function insignia(bool $propia): string
{
    return $propia
        ? '<span class="insignia propia">IMAGEN PROPIA</span>'
        : '<span class="insignia">LA QUE TRAE EL SISTEMA</span>';
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Imagen del Sistema · AcriGlass</title>
    <link rel="icon" href="<?= e($imagenes['favicon']['url']) ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@700;800&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= recurso('css/imagen-sistema.css') ?>">
</head>
<body>

<header class="cabecera">
    <h1><span class="m-acri">ACRI</span> <span class="m-glass">GLASS</span> <span class="h-texto">Imagen del Sistema</span></h1>
    <p>
        Aquí se cambian las imágenes de la marca: el <b>favicon</b> (el icono chiquito de la pestaña del navegador),
        el <b>logo</b> de la cabecera del menú lateral y la <b>fotografía de fondo</b> de la pantalla de ingreso.
        Cada recuadro muestra cómo se va a ver. Mientras no subas nada se usan las imágenes que trae el sistema,
        y el botón <b>Quitar</b> siempre las devuelve. Los cambios se aplican para <b>todos los usuarios</b>;
        el favicon puede tardar unos segundos porque el navegador guarda el icono en su memoria.
    </p>
</header>

<div class="tarjetas">

    <!-- ============ FAVICON ============ -->
    <section class="tarjeta" data-tipo="favicon">
        <h2>FAVICON (ICONO DE LA PESTAÑA) <span class="ins"><?= insignia($imagenes['favicon']['propia']) ?></span></h2>
        <p class="ayuda">Imagen <b>cuadrada</b>, de 32×32 a 512×512 px. PNG con fondo transparente es lo ideal (también acepta ICO). Se ve en la pestaña del navegador y en los marcadores.</p>

        <div class="vista vista-favicon">
            <div class="navegador">
                <div class="nav-pestana"><img class="img-favicon" src="<?= e($imagenes['favicon']['url']) ?>" alt=""> AcriGlass · Vidrio y Aluminio</div>
                <div class="nav-url"><?= e($urlSitio) ?></div>
            </div>
            <div class="tamanos">
                <figure><img class="img-favicon" src="<?= e($imagenes['favicon']['url']) ?>" alt="" width="16" height="16"><figcaption>16 px</figcaption></figure>
                <figure><img class="img-favicon" src="<?= e($imagenes['favicon']['url']) ?>" alt="" width="32" height="32"><figcaption>32 px</figcaption></figure>
                <figure><img class="img-favicon" src="<?= e($imagenes['favicon']['url']) ?>" alt="" width="64" height="64"><figcaption>64 px</figcaption></figure>
            </div>
        </div>

        <div class="acciones">
            <label class="btn-subir">Subir favicon<input type="file" accept="image/png,image/x-icon,.ico" hidden></label>
            <button class="btn-quitar" <?= $imagenes['favicon']['propia'] ? '' : 'disabled' ?>>Quitar</button>
        </div>
        <p class="mensaje" role="status"></p>
    </section>

    <!-- ============ LOGO ============ -->
    <section class="tarjeta" data-tipo="logo">
        <h2>LOGO DEL MENÚ LATERAL <span class="ins"><?= insignia($imagenes['logo']['propia']) ?></span></h2>
        <p class="ayuda">Logo horizontal de la cabecera del menú (se dibuja sobre un recuadro blanco, máximo 170 px de ancho). PNG, JPG o WEBP; una imagen de unos 500×170 px va sobrada.</p>

        <div class="vista vista-logo">
            <div class="sb-mock">
                <div class="sb-logo"><img class="img-logo" src="<?= e($imagenes['logo']['url']) ?>" alt=""></div>
                <div class="avatar"><?= e($inicial) ?></div>
                <div class="sb-usuario"><?= e($usuarioSesion) ?></div>
                <div class="sb-empresa"><?= e($cfg['empresa']['nombre']) ?></div>
            </div>
        </div>

        <div class="acciones">
            <label class="btn-subir">Subir logo<input type="file" accept="image/png,image/jpeg,image/webp" hidden></label>
            <button class="btn-quitar" <?= $imagenes['logo']['propia'] ? '' : 'disabled' ?>>Quitar</button>
        </div>
        <p class="mensaje" role="status"></p>
        <p class="nota">El recuadro blanco de atrás lo pone el menú: un PNG con fondo transparente se ve mejor.</p>
    </section>

    <!-- ============ FONDO DEL LOGIN ============ -->
    <section class="tarjeta" data-tipo="fondo">
        <h2>FONDO DE LA PANTALLA DE INGRESO <span class="ins"><?= insignia($imagenes['fondo']['propia']) ?></span></h2>
        <p class="ayuda">Fotografía apaisada que cubre toda la pantalla del login (se recorta al centro). Mínimo 1600×900 px; entre más grande, mejor se ve en pantallas amplias. PNG, JPG o WEBP, hasta <?= ACRI_NUBE ? 4 : 8 ?> MB.</p>

        <div class="vista vista-fondo">
            <div class="login-mock<?= $imagenes['fondo']['url'] ? '' : ' sin-foto' ?>"
                 <?= $imagenes['fondo']['url'] ? 'style="--foto: url(\'' . e($imagenes['fondo']['url']) . '\')"' : '' ?>>
                <div class="lm-form">
                    <div class="lm-marca"><span class="m-acri">ACRI</span><span class="m-glass">GLASS</span></div>
                    <div class="lm-sub">BIENVENIDO A ACRIGLASS</div>
                    <div class="lm-campo"></div>
                    <div class="lm-campo"></div>
                    <div class="lm-boton"></div>
                </div>
            </div>
        </div>

        <div class="acciones">
            <label class="btn-subir">Subir fondo<input type="file" accept="image/png,image/jpeg,image/webp" hidden></label>
            <button class="btn-quitar" <?= $imagenes['fondo']['propia'] ? '' : 'disabled' ?>>Quitar</button>
        </div>
        <p class="mensaje" role="status"></p>
        <p class="nota">El velo azul y el degradado del login son del diseño y no se tocan: solo cambia la fotografía de atrás. Sin foto se ve la fachada de vidrio dibujada.</p>
    </section>
</div>

<div class="pie">
    <button class="btn-borde" id="btnRestablecer">Restablecer las tres imágenes</button>
    <a class="btn-borde" href="index.php" target="_blank" rel="noopener">Ver pantalla de ingreso ↗</a>
</div>

<script src="<?= recurso('js/imagen-sistema.js') ?>"></script>
</body>
</html>
