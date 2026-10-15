<?php
// Corre todas las pruebas: php pruebas/correr.php   (sale con código 1 si alguna falla)
// En XAMPP sin php.ini propio: php -d extension=mbstring pruebas/correr.php
require_once __DIR__ . '/lib.php';

if (!function_exists('mb_strtoupper')) {
    fwrite(STDERR, "Falta la extensión mbstring de PHP (la usa el sistema).\n");
    exit(2);
}

foreach (glob(__DIR__ . '/*.php') as $archivo) {
    if (in_array(basename($archivo), ['lib.php', 'correr.php'], true)) continue;
    require $archivo;
    echo "\n";
}

$t = $GLOBALS['pruebas_total'];
$f = $GLOBALS['pruebas_fallas'];
echo $f ? "$f de $t pruebas FALLARON\n" : "Las $t pruebas pasaron\n";
exit($f ? 1 : 0);
