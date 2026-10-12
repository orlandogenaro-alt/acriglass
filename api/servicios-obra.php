<?php
// Menú Servicios (includes/servicios-obra.php)
// GET  ?accion=datos&m=ID&anio=AAAA|0&obra=N   renglones del apartado (anio 0 = obras en proceso)
// GET  ?accion=obras_captura                    obras no canceladas para elegir al capturar
// GET  ?accion=tareas&obra=N                    Conceptos/Tareas de la obra (Gantt Obras)
// GET  ?accion=archivo&id=N                     archivo de un registro
// POST ?accion=guardar   multipart: m, id (0 = nuevo), campos del apartado, archivo, quitar_archivo
// POST ?accion=eliminar  {id}
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/servicios-obra.php';

if (modoConfiguracion()) {
    require __DIR__ . '/../includes/respuesta.php';
    error('Modo configuración: aún no hay conexión a AW-Management.', 503);
}
exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'CERRAR_OBRA', 'ADMIN_USER');
$puedeCapturar = tienePermiso('NUEVO_OBRA', 'MODIFICAR_OBRA', 'ADMIN_USER');

$accion = $_GET['accion'] ?? '';
if ($accion !== 'datos' && $accion !== 'obras_captura' && $accion !== 'tareas' && $accion !== 'archivo') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        require __DIR__ . '/../includes/respuesta.php';
        error('Método no permitido.', 405);
    }
    exigirCsrf();
}
session_write_close();

// El archivo se responde tal cual, no como JSON
if ($accion === 'archivo') {
    $f = soDisponible() ? bd_fila('AW', 'select nombre_archivo, archivo from servicios_obra where servicio_obra_id = ?', [(int) ($_GET['id'] ?? 0)], ['archivo']) : null;
    if (!$f || $f['archivo'] === null || $f['archivo'] === '') { http_response_code(404); exit; }
    $nombre = basename(str_replace('\\', '/', (string) $f['nombre_archivo'])) ?: 'archivo';
    $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($f['archivo']) ?: 'application/octet-stream';
    $enLinea = preg_match('#^(image/(png|jpeg|gif|webp)|application/pdf)$#', $mime);
    header('Content-Type: ' . ($enLinea ? $mime : 'application/octet-stream'));
    header('Content-Disposition: ' . ($enLinea ? 'inline' : 'attachment') . "; filename*=UTF-8''" . rawurlencode($nombre));
    header('X-Content-Type-Options: nosniff');
    echo $f['archivo'];
    exit;
}

require __DIR__ . '/../includes/respuesta.php';

function valorCampo(array $c, string $v)
{
    [$campo, $etiqueta, $tipo, $opciones] = $c + [null, null, null, null];
    switch ($tipo) {
        case 'obra':
            $id = (int) $v;
            if ($id && !bd_valor('AW', "select count(*) from reg_obras where obra_id = ? and estatus <> 'Cancelado'", [$id])) error('La obra ya no existe o está cancelada.');
            return $id ?: null;
        case 'fecha':
            if ($v === '') return null;
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) error("$etiqueta: fecha no válida.");
            return $v;
        case 'num':
        case 'dinero':
        case 'pct':
            $n = $v === '' ? 0.0 : (float) str_replace([',', '$', ' ', '%'], '', $v);
            if ($n < 0) error("$etiqueta no puede ser negativo.");
            if ($tipo === 'pct') return round(min(100, $n), 2);
            return round($n, $tipo === 'num' ? 3 : 2);
        case 'lista':
            if ($v !== '' && !in_array($v, (array) $opciones, true)) error("$etiqueta: opción no válida.");
            return $v === '' ? (((array) $opciones)[0] ?? null) : $v;
    }
    $largo = SO_COLUMNAS[$campo];
    return $v === '' ? null : mb_substr($v, 0, is_int($largo) ? $largo : 200);
}

// Archivo subido: [nombre, contenido] · null si no se mandó
function archivoSubido(): ?array
{
    $a = $_FILES['archivo'] ?? null;
    if (!$a || ($a['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return null;
    if ($a['error'] === UPLOAD_ERR_INI_SIZE || $a['error'] === UPLOAD_ERR_FORM_SIZE || $a['size'] > SO_ARCHIVO_MAX_MB * 1024 * 1024) {
        error('El archivo pesa más de ' . SO_ARCHIVO_MAX_MB . ' MB. Redúcelo o guárdalo como PDF.');
    }
    if ($a['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($a['tmp_name'])) error('No se recibió el archivo completo.');
    $nombre = basename(str_replace('\\', '/', (string) $a['name']));
    if ($nombre === '' || $nombre[0] === '.' || in_array(strtolower(pathinfo($nombre, PATHINFO_EXTENSION)), SO_PROHIBIDAS, true)) {
        error('Tipo de archivo no permitido.');
    }
    return [mb_substr($nombre, 0, 150), (string) file_get_contents($a['tmp_name'])];
}

try {
    switch ($accion) {
        case 'datos':
            $m = soModulo((string) ($_GET['m'] ?? ''));
            $anio = (int) ($_GET['anio'] ?? date('Y'));
            if ($anio !== 0 && ($anio < 2000 || $anio > 2100)) $anio = (int) date('Y');
            $obraSel = (int) ($_GET['obra'] ?? 0);
            $lista = soObras($anio);
            $obras = $obraSel ? soObras(0, $obraSel) : $lista;
            if ($obraSel && !$obras) error('La obra ya no existe.', 404);
            if ($m['filtro'] === 'presupuesto') $obras = [];
            $r = soReporte($m, $anio, $obras, $obraSel);
            responder(['ok' => true,
                'obras'      => array_values(array_map(fn($o) => ['id' => (int) $o['obra_id'], 'nombre' => $o['obra'], 'estatus' => $o['estatus']], $lista)),
                'ids'        => array_keys($obras),
                'avisos'     => $GLOBALS['so_avisos'],
                'disponible' => $m['tipo'] !== 'registro' || soDisponible(),
                'puede'      => $puedeCapturar,
            ] + $r);

        case 'obras_captura':
            responder(['ok' => true, 'obras' => soObrasCaptura()]);

        case 'tareas':
            $sug = (int) bd_valor('AW', 'select sugerido_id from reg_obras where obra_id = ?', [(int) ($_GET['obra'] ?? 0)]);
            if (!$sug) responder(['ok' => true, 'tareas' => [], 'aviso' => 'La obra no tiene presupuesto ligado.']);
            if (!tareasDisponibles()) responder(['ok' => true, 'tareas' => [], 'aviso' => tareasAviso()]);
            $t = array_values(array_filter(leerTareas($sug), fn($x) => ($x['tipo'] ?? '') !== 'Excluido'));
            responder(['ok' => true, 'tareas' => $t, 'aviso' => $t ? null : 'La obra aún no tiene Conceptos/Tareas guardados.']);

        case 'guardar':
            if (!$puedeCapturar) error('No tienes permiso para capturar (NUEVO_OBRA / MODIFICAR_OBRA).', 403);
            $m = soModulo((string) ($_POST['m'] ?? ''));
            if ($m['tipo'] !== 'registro') error('Este apartado no se captura.');
            if (!soDisponible()) error(soAvisoTabla(), 503);
            $id = (int) ($_POST['id'] ?? 0);
            $actual = null;
            if ($id) {
                $actual = bd_fila('AW', 'select modulo, obra_id, folio from servicios_obra where servicio_obra_id = ?', [$id]);
                if (!$actual || trim($actual['modulo']) !== $m['id']) error('El registro ya no existe.', 404);
            }

            $r = [];
            foreach ($m['campos'] as $c) {
                if ($c[2] === 'archivo') continue;
                $v = trim((string) ($_POST[$c[0]] ?? ''));
                if (!empty($c[4]) && $v === '') error('Captura ' . mb_strtolower($c[1]) . '.');
                $r[$c[0]] = valorCampo($c, $v);
            }
            if ($m['id'] === 'renta' && empty($r['importe'])) $r['importe'] = round($r['cantidad'] * $r['precio'], 2);
            if (isset($r['pagado'], $r['importe']) && $r['pagado'] > $r['importe'] + 0.005) error('Lo pagado no puede ser mayor que el importe.');
            if (!empty($r['fecha_fin']) && !empty($r['fecha']) && $r['fecha_fin'] < $r['fecha']) error('La fecha final no puede ser anterior a la inicial.');
            if ($m['id'] === 'bitacora') {
                $r['folio'] = $actual && (int) $actual['obra_id'] === (int) $r['obra_id'] ? $actual['folio'] : soSiguienteNota((int) $r['obra_id']);
            }
            $r['fecha_mod'] = date('Y-m-d H:i:s');
            $r['usuario_mod'] = mb_substr($usuarioSesion, 0, 50);

            $archivo = archivoSubido();
            if ($archivo) {
                $r['nombre_archivo'] = $archivo[0];
                $r['archivo'] = $archivo[1];
            } elseif (!empty($_POST['quitar_archivo'])) {
                $r['nombre_archivo'] = null;
                $r['archivo'] = null;
            }

            if ($id) {
                $sql = 'update servicios_obra set ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($r))) . ' where servicio_obra_id = ?';
                $p = array_merge(array_values($r), [$id]);
                if ($archivo) bd_ejecutar_binario('AW', $sql, $p, [array_search('archivo', array_keys($r), true)]);
                else bd_ejecutar('AW', $sql, $p);
            } else {
                $r = ['modulo' => $m['id'], 'fecha_creacion' => $r['fecha_mod'], 'usuario_creacion' => $r['usuario_mod']] + $r;
                $id = $archivo
                    ? bd_insertar_binario('AW', 'servicios_obra', 'servicio_obra_id', $r, ['archivo'])
                    : bd_insertar('AW', 'servicios_obra', 'servicio_obra_id', $r);
            }
            responder(['ok' => true, 'id' => $id]);

        case 'eliminar':
            if (!$puedeCapturar) error('No tienes permiso para eliminar (NUEVO_OBRA / MODIFICAR_OBRA).', 403);
            if (!soDisponible()) error(soAvisoTabla(), 503);
            $d = entrada();
            $m = soModulo((string) ($d['m'] ?? ''));
            $n = bd_ejecutar('AW', 'delete from servicios_obra where servicio_obra_id = ? and modulo = ?', [(int) ($d['id'] ?? 0), $m['id']]);
            if (!$n) error('El registro ya no existe.', 404);
            responder(['ok' => true]);
    }
    error('Acción no válida.');
} catch (InvalidArgumentException $e) {
    error($e->getMessage());
} catch (Throwable $e) {
    error_log('AcriGlass api/servicios-obra: ' . $e->getMessage());
    error('No se pudo consultar AW-Management: ' . bd_mensaje_error($e), 500);
}
