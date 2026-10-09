<?php
require __DIR__ . '/includes/sesion.php';
exigirPermiso('ADMIN_USER');

$pagina = [
    'id'     => 'roles',
    'titulo' => 'Roles',
    'api'    => 'api/roles.php',
    'script' => 'js/roles.js',
    'descripcion' =>
        'Un rol es un juego de permisos que se asigna a los usuarios (Administrador › Usuarios). Al cambiar los permisos de un rol ' .
        'cambian los de todos sus usuarios la próxima vez que inicien sesión. Si eliminas un rol, sus usuarios se quedan sin rol ' .
        'y solo conservan sus permisos sueltos.',
    'botones' => [
        ['agregar', 'Agregar', true],
        ['refrescar', 'Refrescar'],
    ],
];
require __DIR__ . '/includes/catalogo-pagina.php';
