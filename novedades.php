<?php
// Administrador › Novedades del Sistema
require __DIR__ . '/includes/sesion.php';
exigirPermiso('ADMIN_USER');

$novedades = require __DIR__ . '/includes/novedades.php';
$etiquetas = ['nuevo' => 'NUEVO', 'mejora' => 'MEJORA', 'correccion' => 'CORRECCIÓN'];
$meses     = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaLarga(string $fecha, array $meses): string
{
    [$a, $m, $d] = array_map('intval', explode('-', $fecha));
    return "$d de {$meses[$m]} de $a";
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Novedades del Sistema · AcriGlass</title>
    <link rel="icon" href="<?= e(imagenSistema('favicon', sistemaConfig())) ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@700;800&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= recurso('css/novedades.css') ?>">
</head>
<body>

<header class="cabecera">
    <h1><span class="m-acri">ACRI</span> <span class="m-glass">GLASS</span> <span class="h-texto">Novedades del Sistema</span></h1>
    <p>
        Aquí se anota todo lo que se <b>agrega</b>, <b>modifica</b> o <b>refuerza</b> en el sistema, lo más reciente primero.
        <span class="tipo nuevo">NUEVO</span> es algo que no existía,
        <span class="tipo mejora">MEJORA</span> es algo que ya existía y se cambió o reforzó, y
        <span class="tipo correccion">CORRECCIÓN</span> es una falla que se arregló.
    </p>
</header>

<div class="linea">
<?php foreach ($novedades as $dia): ?>
    <section class="dia">
        <h2><?= e(fechaLarga($dia['fecha'], $meses)) ?></h2>
        <ul>
        <?php foreach ($dia['cambios'] as [$tipo, $titulo, $detalle]): ?>
            <li>
                <span class="tipo <?= e($tipo) ?>"><?= e($etiquetas[$tipo] ?? strtoupper($tipo)) ?></span>
                <div>
                    <b><?= e($titulo) ?></b>
                    <?php if ($detalle !== ''): ?><p><?= e($detalle) ?></p><?php endif; ?>
                </div>
            </li>
        <?php endforeach; ?>
        </ul>
    </section>
<?php endforeach; ?>
</div>

</body>
</html>
