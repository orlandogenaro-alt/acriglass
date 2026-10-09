<?php
require __DIR__ . '/includes/sesion.php';
exigirPermiso('ADMIN_USER');

$pagina = [
    'id'     => 'usuarios',
    'titulo' => 'Usuarios',
    'api'    => 'api/usuarios.php',
    'script' => 'js/usuarios.js',
    'descripcion' =>
        'Usuarios que entran al sistema. Cada usuario tiene un <b>rol</b> (Administrador › Roles) que le da sus permisos; ' .
        'además se le pueden marcar <b>permisos sueltos</b> que su rol no trae. Los usuarios dados de baja no pueden iniciar sesión. ' .
        'Las contraseñas se guardan cifradas y nunca se muestran. Los cambios de permisos se aplican la próxima vez que el usuario inicie sesión.',
    'botones' => [
        ['agregar', 'Agregar', true],
        ['activar', 'Alta /<br>Baja'],
        ['refrescar', 'Refrescar'],
    ],
];
require __DIR__ . '/includes/catalogo-pagina.php';
