<?php
// Administrador › Estatus de Presupuestos
require __DIR__ . '/includes/sesion.php';
exigirPermiso('ADMIN_USER');

$pagina = [
    'id'     => 'estatus-presupuestos',
    'titulo' => 'Estatus de Presupuestos',
    'api'    => 'api/estatus.php',
    'script' => 'js/estatus.js',
    'descripcion' =>
        'Estatus que se ofrecen en el botón <b>Actualizar Estatus</b> del Presupuesto de Obra (seguimiento, aceptado, rechazado…), ' .
        'en el orden de esta lista y con su color. Los marcados <span class="chip">Sistema</span> los usa el propio sistema ' .
        '(estatus inicial, indicadores de la pantalla General y botón Cancelar): solo se les cambia el color y la descripción. ' .
        'Al renombrar un estatus se actualizan los presupuestos que ya lo tienen; si alguno lo usa no se puede eliminar, ' .
        'desactívalo para que ya no se ofrezca.',
    'botones' => [
        ['agregar', 'Agregar', true],
        ['activar', 'Activar /<br>Desactivar'],
        ['subir', '▲ Subir'],
        ['bajar', '▼ Bajar'],
        ['refrescar', 'Refrescar'],
    ],
];
require __DIR__ . '/includes/catalogo-pagina.php';
