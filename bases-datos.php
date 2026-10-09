<?php
require __DIR__ . '/includes/sesion.php';
exigirPermiso('ADMIN_USER');

$pagina = [
    'id'     => 'bases-datos',
    'titulo' => 'Bases de datos',
    'api'    => 'api/bases-datos.php',
    'script' => 'js/bases-datos.js',
    'descripcion' =>
        'Aquí se administran las conexiones a bases de datos del sistema. Las marcadas como <span class="chip">Sistema</span> ' .
        'son las que usa la aplicación (EG = Easy-Glass, AW = AW-Management, MS = Microsip, AWB = A+W Business): ' .
        'se pueden modificar o probar, pero no eliminar. Las conexiones que agregues quedan disponibles para el código con ' .
        '<b>bd_pdo(\'CLAVE\')</b>. Las contraseñas nunca se muestran: se guardan solo en el servidor.',
    'botones' => [
        ['agregar', 'Agregar', true],
        ['activar', 'Activar /<br>Desactivar'],
        ['probar', 'Probar'],
        ['refrescar', 'Refrescar'],
    ],
];
require __DIR__ . '/includes/catalogo-pagina.php';
