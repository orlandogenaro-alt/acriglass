<?php
// Configuración general del sistema.
// BOCETO: se guarda en config/sistema.json hasta que tengamos la base de datos.

define('ACRI_RAIZ', dirname(__DIR__));
define('ACRI_CONFIG', ACRI_RAIZ . '/config/sistema.json');
define('ACRI_UPLOADS', 'uploads/sistema');

// Duración de la sesión (segundos)
const ACRI_DURACION_SESION = 12 * 3600;

// Imágenes que trae el sistema (null = fondo dibujado con CSS)
const ACRI_IMG_DEFECTO = [
    'favicon' => 'img/favicon.svg',
    'logo'    => 'img/logo-acriglass.svg',
    'fondo'   => null,
];

// Lee / guarda un JSON de config/ (carpeta protegida con .htaccess)
function configLeer(string $nombre): array
{
    $archivo = ACRI_RAIZ . '/config/' . $nombre . '.json';
    if (!is_file($archivo)) return [];
    $datos = json_decode((string) file_get_contents($archivo), true);
    return is_array($datos) ? $datos : [];
}

function configGuardar(string $nombre, array $datos): void
{
    $json = json_encode($datos, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    // Nunca sobrescribir con un archivo vacío
    if ($json === false) throw new RuntimeException("No se pudo guardar config/$nombre.json: " . json_last_error_msg());
    file_put_contents(ACRI_RAIZ . '/config/' . $nombre . '.json', $json, LOCK_EX);
}

// Resultado de la última prueba de una conexión o servicio (config/pruebas.json)
function pruebaGuardar(string $clave, array $resultado): array
{
    $todas = configLeer('pruebas');
    $todas[$clave] = $resultado + ['fecha' => date('Y-m-d H:i:s')];
    configGuardar('pruebas', $todas);
    return $todas[$clave];
}

function sistemaConfig(): array
{
    $cfg = [
        'imagenes' => ['favicon' => null, 'logo' => null, 'fondo' => null],
        'empresa'  => ['nombre' => 'ACRIGLASS VIDRIO Y ALUMINIO', 'rfc' => ''],
    ];
    if (is_file(ACRI_CONFIG)) {
        $json = json_decode((string) file_get_contents(ACRI_CONFIG), true);
        if (is_array($json)) {
            $cfg = array_replace_recursive($cfg, $json);
        }
    }
    return $cfg;
}

function sistemaGuardar(array $cfg): void
{
    if (!is_dir(dirname(ACRI_CONFIG))) {
        mkdir(dirname(ACRI_CONFIG), 0775, true);
    }
    file_put_contents(
        ACRI_CONFIG,
        json_encode($cfg, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        LOCK_EX
    );
}

// true si el administrador subió una imagen propia y el archivo existe
function imagenPropia(string $tipo, ?array $cfg = null): bool
{
    $cfg = $cfg ?? sistemaConfig();
    $ruta = $cfg['imagenes'][$tipo] ?? null;
    return $ruta !== null && is_file(ACRI_RAIZ . '/' . $ruta);
}

// Ruta relativa (desde la raíz del sitio) de la imagen vigente
function imagenSistema(string $tipo, ?array $cfg = null): ?string
{
    $cfg = $cfg ?? sistemaConfig();
    return imagenPropia($tipo, $cfg) ? $cfg['imagenes'][$tipo] : ACRI_IMG_DEFECTO[$tipo];
}

function estadoImagenes(): array
{
    $cfg = sistemaConfig();
    $estado = [];
    foreach (array_keys(ACRI_IMG_DEFECTO) as $tipo) {
        $estado[$tipo] = ['url' => imagenSistema($tipo, $cfg), 'propia' => imagenPropia($tipo, $cfg)];
    }
    return $estado;
}

// Ruta de un css/js con su fecha de modificación, para que el navegador no use una copia vieja
function recurso(string $ruta): string
{
    $archivo = ACRI_RAIZ . '/' . $ruta;
    return e($ruta . (is_file($archivo) ? '?v=' . filemtime($archivo) : ''));
}

function e($texto): string
{
    return htmlspecialchars((string) $texto, ENT_QUOTES, 'UTF-8');
}
