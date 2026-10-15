<?php
// Freno a contraseñas adivinadas (includes/intentos.php). Guarda en una carpeta temporal (ACRI_CONFIG_DIR)
// para no tocar config/ del sistema.
require_once __DIR__ . '/lib.php';

echo "Freno a contraseñas adivinadas\n";

$tmp = sys_get_temp_dir() . '/acri-pruebas-' . bin2hex(random_bytes(4));
mkdir("$tmp/config", 0777, true);
putenv('DB_HOST');   // modo servidor local: se guarda en config/intentos_login.json
putenv("ACRI_CONFIG_DIR=$tmp/config");
require_once __DIR__ . '/../includes/intentos.php';

prueba('sin fallos no hay bloqueo', function () {
    $_SERVER['REMOTE_ADDR'] = '10.0.0.1';
    igual(0, intentosBloqueo('juan'));
});

prueba('con 4 fallos todavía no bloquea', function () {
    for ($i = 0; $i < 4; $i++) intentosRegistrar('juan', false);
    igual(0, intentosBloqueo('juan'));
});

prueba('el 5.º fallo bloquea ~15 min (sin importar mayúsculas ni espacios)', function () {
    intentosRegistrar('Juan ', false);
    verificar(intentosBloqueo('JUAN') > 14 * 60, 'no quedó bloqueado');
});

prueba('desde otra dirección el mismo usuario no está bloqueado', function () {
    $_SERVER['REMOTE_ADDR'] = '10.0.0.2';
    igual(0, intentosBloqueo('juan'));
});

prueba('un acierto borra los fallos de esa dirección y deja el bloqueo de la otra', function () use ($tmp) {
    intentosRegistrar('juan', false);
    intentosRegistrar('juan', true);
    $d = json_decode((string) file_get_contents("$tmp/config/intentos_login.json"), true);
    verificar(!isset($d['JUAN|10.0.0.2']), 'quedaron fallos de 10.0.0.2');
    verificar(isset($d['JUAN|10.0.0.1']), 'se perdió el bloqueo de 10.0.0.1');
});

array_map('unlink', glob("$tmp/config/*"));
rmdir("$tmp/config");
rmdir($tmp);
putenv('ACRI_CONFIG_DIR');
