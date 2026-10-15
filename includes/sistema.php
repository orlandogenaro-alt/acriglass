<?php
// Configuración general del sistema.
// En el servidor local se guarda en config/*.json; en la nube (Vercel), en la tabla configuracion de Supabase.
require_once __DIR__ . '/nube.php';

define('ACRI_RAIZ', dirname(__DIR__));
define('ACRI_UPLOADS', 'uploads/sistema');

// Duración de la sesión (segundos)
const ACRI_DURACION_SESION = 12 * 3600;

// Imágenes que trae el sistema (null = fondo dibujado con CSS)
const ACRI_IMG_DEFECTO = [
    'favicon' => 'img/favicon.svg',
    'logo'    => 'img/logo-acriglass.svg',
    'fondo'   => null,
    'membrete' => null,   // logo de la hoja membretada; sin imagen propia se usa el logo
];

// Carpeta de los JSON de configuración en el servidor local. ACRI_CONFIG_DIR solo la usan las pruebas
// (pruebas/), para no tocar la configuración real.
function configCarpeta(): string
{
    return acri_env('ACRI_CONFIG_DIR', ACRI_RAIZ . '/config');
}

// Lee / guarda un JSON de config/ (carpeta protegida con .htaccess) o de la tabla configuracion
function configLeer(string $nombre): array
{
    if (ACRI_NUBE) {
        $datos = nube_consulta('select datos from configuracion where clave = ?', [$nombre])->fetchColumn();
        $datos = $datos === false ? null : json_decode((string) $datos, true);
        return is_array($datos) ? $datos : [];
    }
    $archivo = configCarpeta() . '/' . $nombre . '.json';
    if (!is_file($archivo)) return [];
    $datos = json_decode((string) file_get_contents($archivo), true);
    return is_array($datos) ? $datos : [];
}

function configGuardar(string $nombre, array $datos): void
{
    $json = json_encode($datos, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    // Nunca sobrescribir con un archivo vacío
    if ($json === false) throw new RuntimeException("No se pudo guardar config/$nombre.json: " . json_last_error_msg());
    if (ACRI_NUBE) {
        nube_consulta(
            'insert into configuracion (clave, datos, actualizado_por) values (?, cast(? as jsonb), ?)
             on conflict (clave) do update set datos = excluded.datos, actualizado_por = excluded.actualizado_por',
            [$nombre, $json, $_SESSION['usuario'] ?? null]);
        return;
    }
    if (!is_dir(configCarpeta())) mkdir(configCarpeta(), 0775, true);
    file_put_contents(configCarpeta() . '/' . $nombre . '.json', $json, LOCK_EX);
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
        'imagenes' => ['favicon' => null, 'logo' => null, 'fondo' => null, 'membrete' => null],
        'empresa'  => ['nombre' => 'ACRIGLASS VIDRIO Y ALUMINIO', 'rfc' => ''],
    ];
    try {
        $cfg = array_replace_recursive($cfg, configLeer('sistema'));
    } catch (Throwable $e) {
        // Sin base de datos la pantalla de ingreso se muestra con las imágenes del sistema
        error_log('AcriGlass sistemaConfig: ' . $e->getMessage());
    }
    return $cfg;
}

function sistemaGuardar(array $cfg): void
{
    configGuardar('sistema', $cfg);
}

// true si el administrador subió una imagen propia y el archivo existe
function imagenPropia(string $tipo, ?array $cfg = null): bool
{
    $cfg = $cfg ?? sistemaConfig();
    $ruta = $cfg['imagenes'][$tipo] ?? null;
    if ($ruta === null) return false;
    // En la nube es la URL pública de Supabase Storage
    return preg_match('#^https?://#', $ruta) || is_file(ACRI_RAIZ . '/' . $ruta);
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
