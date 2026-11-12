<?php
// ACRINEO · Documentos del presupuesto (pestaña DOCUMENTOS): Libro C.H. (uno por presupuesto) y Libro FASAR /
// Libro pie de indirectos (uno por moneda). Subir otro al mismo lugar reemplaza al anterior.
//
// Seguridad: solo hojas de cálculo, CSV y PDF; se revisa extensión, tipo real del contenido (finfo), tamaño y
// nombre. El archivo se guarda con un nombre aleatorio terminado en .dat (nunca ejecutable) y solo se entrega a
// través de la API, con sesión y permiso, como descarga o con X-Content-Type-Options: nosniff.
//   Con SUPABASE_URL (Vercel): bucket privado «adjuntos» de Supabase Storage, carpeta acrineo/P<id>/.
//   Sin ella (servidor local): uploads/acrineo/P<id>/ con .htaccess «Require all denied».
require_once __DIR__ . '/esquema.php';
require_once __DIR__ . '/historial.php';

// Vercel no acepta peticiones de más de 4.5 MB
const ACRINEO_DOC_MAX = 4 * 1024 * 1024;
const ACRINEO_DOC_BUCKET = 'adjuntos';

// tipo => [etiqueta, va por moneda]
const ACRINEO_DOC_TIPOS = [
    'libro_ch'         => ['Libro C.H.', false],
    'libro_fasar'      => ['Libro FASAR', true],
    'libro_indirectos' => ['Libro pie indirectos', true],
];

// Extensión => tipos de contenido que acepta (lo que detecta finfo del archivo, no lo que dice el navegador)
const ACRINEO_DOC_EXTENSIONES = [
    'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/octet-stream'],
    'xls'  => ['application/vnd.ms-excel', 'application/cdfv2', 'application/x-ole-storage', 'application/octet-stream'],
    'ods'  => ['application/vnd.oasis.opendocument.spreadsheet', 'application/zip'],
    'csv'  => ['text/csv', 'text/plain', 'application/csv'],
    'pdf'  => ['application/pdf'],
];
// Tipo con el que se entrega cada extensión (no se usa el que detectó finfo para no entregar text/html por error)
const ACRINEO_DOC_ENTREGA = [
    'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'xls'  => 'application/vnd.ms-excel',
    'ods'  => 'application/vnd.oasis.opendocument.spreadsheet',
    'csv'  => 'text/csv; charset=utf-8',
    'pdf'  => 'application/pdf',
];

// Nombre original limpio (sin rutas ni caracteres de control); lanza error si no sirve
function acrineoDocNombre(string $nombre): string
{
    $nombre = trim(basename(str_replace('\\', '/', $nombre)));
    if ($nombre === '' || $nombre[0] === '.' || !mb_check_encoding($nombre, 'UTF-8')
        || !preg_match('/^[^<>:"\/\\\\|?*\x00-\x1f\x7f]{1,150}$/u', $nombre)) {
        throw new AcrineoError('Nombre de archivo no válido (sin rutas, máximo 150 caracteres).', 422);
    }
    return $nombre;
}

// Revisa un archivo ya recibido; regresa el mensaje de error o null si se acepta (función pura: pruebas/acrineo.php)
function acrineoDocRechazo(string $nombre, int $tamano, string $mimeDetectado): ?string
{
    $ext = strtolower(pathinfo($nombre, PATHINFO_EXTENSION));
    if (!isset(ACRINEO_DOC_EXTENSIONES[$ext])) {
        return 'Tipo de archivo no permitido. Se aceptan: ' . implode(', ', array_keys(ACRINEO_DOC_EXTENSIONES)) . '.';
    }
    // Doble extensión engañosa (libro.php.xlsx)
    if (preg_match('/\.(php\d?|phtml|phar|html?|svg|js|exe|bat|cmd|sh|ps1|vbs)\./i', $nombre)) return 'Nombre de archivo no permitido.';
    if ($tamano <= 0) return 'El archivo está vacío.';
    if ($tamano > ACRINEO_DOC_MAX) return 'El archivo pesa más de ' . (ACRINEO_DOC_MAX / 1024 / 1024) . ' MB.';
    if (!in_array(strtolower($mimeDetectado), ACRINEO_DOC_EXTENSIONES[$ext], true)) {
        return "El contenido del archivo ($mimeDetectado) no corresponde a un .$ext.";
    }
    return null;
}

function acrineoDocLugar(string $tipo, $moneda): array
{
    if (!isset(ACRINEO_DOC_TIPOS[$tipo])) throw new AcrineoError('Tipo de documento no válido.', 422);
    if (ACRINEO_DOC_TIPOS[$tipo][1]) {
        $moneda = (int) $moneda;
        if (!in_array($moneda, [1, 2], true)) throw new AcrineoError('Moneda no válida (1 o 2).', 422);
    } else {
        $moneda = null;
    }
    $etiqueta = ACRINEO_DOC_TIPOS[$tipo][0] . ($moneda ? " (Moneda $moneda)" : '');
    return [$tipo, $moneda, $etiqueta];
}

function acrineoDocEnNube(): bool
{
    return acri_env('SUPABASE_URL') !== '' && acri_env('SUPABASE_SERVICE_KEY') !== '';
}

function acrineoDocCarpetaLocal(): string
{
    $base = acri_env('ACRINEO_UPLOADS', ACRI_RAIZ . '/uploads/acrineo');
    if (!is_dir($base) && !mkdir($base, 0775, true) && !is_dir($base)) throw new RuntimeException('No se pudo crear la carpeta de documentos.');
    if (!is_file("$base/.htaccess")) file_put_contents("$base/.htaccess", "Require all denied\n");
    return $base;
}

function acrineoDocListar(int $presupuestoId): array
{
    $filas = bd_filas('AW', "select documento_id as id, tipo_documento, moneda, nombre_original, mime_type, tamano, uploaded_by,
                                    to_char(created_at at time zone ?, 'YYYY-MM-DD HH24:MI') as created_at
                               from acrineo_presupuesto_documentos where presupuesto_id = ? order by tipo_documento, moneda",
        [nube_zona(), $presupuestoId]);
    foreach ($filas as &$f) {
        $f['id'] = (int) $f['id'];
        $f['moneda'] = $f['moneda'] === null ? null : (int) $f['moneda'];
        $f['tamano'] = (int) $f['tamano'];
    }
    return $filas;
}

function acrineoDocFila(int $presupuestoId, int $docId): array
{
    $f = bd_fila('AW', 'select * from acrineo_presupuesto_documentos where presupuesto_id = ? and documento_id = ?', [$presupuestoId, $docId]);
    if (!$f) throw new AcrineoError('El documento ya no existe.', 404);
    return $f;
}

// Guarda el archivo recibido en $_FILES[...] para el lugar indicado. Regresa la lista actualizada.
function acrineoDocSubir(int $presupuestoId, string $tipo, $moneda, array $archivo, string $usuario): array
{
    [$tipo, $moneda, $etiqueta] = acrineoDocLugar($tipo, $moneda);
    $err = (int) ($archivo['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) throw new AcrineoError('El archivo es demasiado grande para el servidor.', 413);
    if ($err !== UPLOAD_ERR_OK) throw new AcrineoError("No se recibió el archivo (código $err).", 422);
    $tmp = (string) $archivo['tmp_name'];
    if (!is_uploaded_file($tmp) && !(PHP_SAPI === 'cli' && is_file($tmp))) throw new AcrineoError('Archivo no válido.', 422);

    $nombre = acrineoDocNombre((string) ($archivo['name'] ?? ''));
    $tamano = (int) filesize($tmp);
    $mime = (string) ((new finfo(FILEINFO_MIME_TYPE))->file($tmp) ?: 'application/octet-stream');
    if ($msg = acrineoDocRechazo($nombre, $tamano, $mime)) throw new AcrineoError($msg, 422);

    $ext = strtolower(pathinfo($nombre, PATHINFO_EXTENSION));
    $sha = hash_file('sha256', $tmp);
    $ruta = "acrineo/P$presupuestoId/" . bin2hex(random_bytes(16)) . '.dat';
    $nube = acrineoDocEnNube();
    if ($nube) {
        sb_subir(ACRINEO_DOC_BUCKET, $ruta, $tmp, ACRINEO_DOC_ENTREGA[$ext]);
    } else {
        $destino = acrineoDocCarpetaLocal() . '/' . substr($ruta, strlen('acrineo/'));
        if (!is_dir(dirname($destino))) mkdir(dirname($destino), 0775, true);
        if (!(is_uploaded_file($tmp) ? move_uploaded_file($tmp, $destino) : copy($tmp, $destino))) throw new RuntimeException('No se pudo guardar el archivo.');
    }

    $anterior = bd_fila('AW', 'select documento_id, ruta_archivo, almacen, nombre_original from acrineo_presupuesto_documentos
                                where presupuesto_id = ? and tipo_documento = ? and coalesce(moneda, 0) = ?', [$presupuestoId, $tipo, (int) $moneda]);
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        if ($anterior) bd_ejecutar('AW', 'delete from acrineo_presupuesto_documentos where documento_id = ?', [$anterior['documento_id']]);
        bd_insertar('AW', 'acrineo_presupuesto_documentos', 'documento_id', [
            'presupuesto_id' => $presupuestoId, 'tipo_documento' => $tipo, 'moneda' => $moneda, 'nombre_original' => $nombre,
            'ruta_archivo' => $ruta, 'almacen' => $nube ? 'storage' : 'local', 'mime_type' => mb_substr($mime, 0, 120),
            'tamano' => $tamano, 'sha256' => $sha,
            'uploaded_by' => mb_substr($usuario, 0, 50),
        ]);
        acrineoRegistrar($presupuestoId, $usuario, 'DOCUMENTO', [[$etiqueta, $anterior['nombre_original'] ?? null, $nombre]]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        acrineoDocBorrarArchivo($ruta, $nube ? 'storage' : 'local');   // no dejar archivos huérfanos
        throw $e;
    }
    if ($anterior) acrineoDocBorrarArchivo($anterior['ruta_archivo'], $anterior['almacen']);
    return acrineoDocListar($presupuestoId);
}

function acrineoDocEliminar(int $presupuestoId, int $docId, string $usuario): array
{
    $f = acrineoDocFila($presupuestoId, $docId);
    [, , $etiqueta] = acrineoDocLugar($f['tipo_documento'], $f['moneda']);
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        bd_ejecutar('AW', 'delete from acrineo_presupuesto_documentos where documento_id = ?', [$docId]);
        acrineoRegistrar($presupuestoId, $usuario, 'DOCUMENTO', [[$etiqueta, $f['nombre_original'], null]]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    acrineoDocBorrarArchivo($f['ruta_archivo'], $f['almacen']);
    return acrineoDocListar($presupuestoId);
}

// Contenido del documento: [fila, bytes]
function acrineoDocContenido(int $presupuestoId, int $docId): array
{
    $f = acrineoDocFila($presupuestoId, $docId);
    if ($f['almacen'] === 'storage') return [$f, acrineoSbDescargar(ACRINEO_DOC_BUCKET, $f['ruta_archivo'])];
    $archivo = acrineoDocCarpetaLocal() . '/' . substr($f['ruta_archivo'], strlen('acrineo/'));
    if (!is_file($archivo)) throw new AcrineoError('El archivo ya no está en el servidor.', 404);
    return [$f, (string) file_get_contents($archivo)];
}

// Entrega el documento al navegador. $enLinea: el PDF se abre en el navegador; lo demás se descarga
// (la ventana muestra las hojas de cálculo y CSV en su propia vista previa).
function acrineoDocEntregar(array $f, string $contenido, bool $enLinea): void
{
    $ext = strtolower(pathinfo($f['nombre_original'], PATHINFO_EXTENSION));
    $tipo = ACRINEO_DOC_ENTREGA[$ext] ?? 'application/octet-stream';
    $enLinea = $enLinea && $ext === 'pdf';
    header_remove('Content-Type');
    header('Content-Type: ' . $tipo);
    header('Content-Length: ' . strlen($contenido));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, no-store');
    header('Content-Disposition: ' . ($enLinea ? 'inline' : 'attachment') . "; filename*=UTF-8''" . rawurlencode($f['nombre_original']));
    echo $contenido;
    exit;
}

function acrineoDocBorrarArchivo(string $ruta, string $almacen): void
{
    try {
        if ($almacen === 'storage') {
            sb_borrar(ACRINEO_DOC_BUCKET, $ruta);
        } else {
            $archivo = acrineoDocCarpetaLocal() . '/' . substr($ruta, strlen('acrineo/'));
            if (is_file($archivo)) unlink($archivo);
        }
    } catch (Throwable $e) {
        error_log('ACRINEO documentos (borrar archivo): ' . $e->getMessage());
    }
}

// Descarga un objeto del bucket privado con la service_role key (sb_storage solo regresa JSON)
function acrineoSbDescargar(string $bucket, string $clave): string
{
    $llave = acri_env('SUPABASE_SERVICE_KEY');
    $ch = curl_init(sb_url() . '/object/' . sb_ruta($bucket, $clave));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60, CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $llave, 'apikey: ' . $llave],
    ]);
    $datos = curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($datos === false || $codigo < 200 || $codigo >= 300) throw new AcrineoError('No se pudo leer el documento de Supabase Storage.', 502);
    return (string) $datos;
}
