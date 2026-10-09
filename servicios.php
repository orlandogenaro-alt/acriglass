<?php
require __DIR__ . '/includes/sesion.php';
exigirPermiso('ADMIN_USER');

$pagina = [
    'id'     => 'servicios',
    'titulo' => 'APIs y servicios',
    'api'    => 'api/servicios.php',
    'script' => 'js/servicios.js',
    'descripcion' =>
        'Servicios externos que consume el sistema. Los marcados <span class="chip">Sistema</span> son los que ya se están usando ' .
        '(tipo de cambio, QuickBooks, optimización de cortes, HubSpot y notificaciones push): se pueden modificar, probar o desactivar, ' .
        'pero no eliminar. Los que agregues quedan disponibles para el código con <b>api_http(\'CLAVE\', \'GET\', \'/ruta\')</b>. ' .
        'Los tokens nunca se muestran: se guardan solo en el servidor. Las cuentas y servidores de correo (SMTP) se administrarán ' .
        'en su propio apartado, <b>Cuentas de Correo</b> y <b>Servidor de Correo</b>.',
    'botones' => [
        ['agregar', 'Agregar', true],
        ['activar', 'Activar /<br>Desactivar'],
        ['probar-todas', 'Probar todas'],
        ['refrescar', 'Refrescar'],
    ],
];
require __DIR__ . '/includes/catalogo-pagina.php';
