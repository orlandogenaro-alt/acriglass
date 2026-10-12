<?php
// Altas y cambios del Registro de Obras (Dialog243 del sistema de escritorio) en AW-Management.
// POST ?accion=guardar          { id, sugerido_id, nom_obra, direccion, contacto, notas, fecha_ini, fecha_fin,
//                                 responsables: [vendedor_obra_id], gasto_administrativo, avance, autoriza? }  (REGISTRA_OBRAS)
// POST ?accion=estatus          { id, estatus, libre?, autoriza? }   Ejecucion / Obra Terminada / Cancelado / Finalizacion
// POST ?accion=avance           { id, avance }                       actualiza_avance_de_obra
// POST ?accion=autorizar        { permiso, autoriza }                «Modificar» sin el permiso (Dialog225)
// POST ?accion=imagen           multipart: id + archivo              imagen de la obra (sin archivo = quitarla)
// POST ?accion=adjuntar         multipart: id + descripcion + archivo
// POST ?accion=eliminar_adjunto { id, archivo, autoriza? }
// POST ?accion=eliminar_explosion { id, partidas: [explocion_mat_obra_id], autoriza? }
// POST ?accion=asignar_cot      { id, folio }   cotización / pedido de Microsip (por la API de Easy-Glass) a la obra
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/servicios.php';
require __DIR__ . '/../includes/autenticacion.php';
require __DIR__ . '/../includes/permisos.php';
require __DIR__ . '/../includes/respuesta.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') error('Método no permitido.', 405);
if (modoConfiguracion()) error('Modo configuración: aún no hay conexión a AW-Management.', 503);
exigirCsrf();
exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'CERRAR_OBRA', 'ADMIN_USER');
session_write_close();

// Estatus en los que la obra todavía admite documentos (valida_estatus_obra)
const OBRA_ABIERTA = ['Planificacion', 'Ejecucion', 'Obra Terminada'];
const IMAGEN_MAX_MB = 4;
const ADJUNTO_MAX_MB = 25;
const ADJ_PROHIBIDAS = ['php', 'phtml', 'phar', 'php3', 'php4', 'php5', 'php7', 'php8', 'pl', 'py', 'cgi', 'sh', 'exe', 'bat',
                        'cmd', 'com', 'msi', 'js', 'vbs', 'ps1', 'jar', 'scr', 'htaccess', 'html', 'htm', 'svg'];

function texto($v, int $largo): ?string
{
    $v = trim((string) ($v ?? ''));
    return $v === '' ? null : mb_substr($v, 0, $largo);
}

function fecha($v): ?string
{
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $v) ? $v : null;
}

function usuario(): string
{
    return mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50);
}

// Estatus guardado de la obra (error si ya no existe)
function estatusObra(int $id): string
{
    if (!$id) error('Es necesario guardar la obra para continuar.');
    $e = bd_valor('AW', 'select estatus from reg_obras where obra_id = ?', [$id]);
    if ($e === null || $e === false) error('La obra ya no existe.', 404);
    return trim((string) $e) ?: 'Planificacion';
}

function validaEstatusObra(int $id): void
{
    if (!in_array(estatusObra($id), OBRA_ABIERTA, true)) {
        error('El estatus actual de la obra no permite agregar más elementos. Actualice el estatus para poder incorporar documentos adicionales a la obra.');
    }
}

// El permiso, o la autorización de otro usuario que lo tenga
function exigirOAutorizar(array $d, string $permiso): ?string
{
    return tienePermiso($permiso, 'ADMIN_USER') ? null : autorizacion($d['autoriza'] ?? null, $permiso);
}

// Archivo subido válido o error
function archivoSubido(int $maxMb): array
{
    $a = $_FILES['archivo'] ?? null;
    if (!$a || $a['error'] === UPLOAD_ERR_NO_FILE) error('No se recibió ningún archivo.');
    if ($a['error'] === UPLOAD_ERR_INI_SIZE || $a['error'] === UPLOAD_ERR_FORM_SIZE) error('El archivo es demasiado grande para el servidor (revisa upload_max_filesize en php.ini).');
    if ($a['error'] !== UPLOAD_ERR_OK) error('Error al subir el archivo (código ' . $a['error'] . ').');
    if (ACRI_NUBE) $maxMb = min($maxMb, 4);   // Vercel no acepta peticiones de más de 4.5 MB
    if ($a['size'] > $maxMb * 1024 * 1024) error("El archivo pesa más de $maxMb MB.");
    return $a;
}

// guarda_obra / REGISTRA_OBRAS: encabezado, responsables y parámetros; el presupuesto queda Aceptado
function guardar(array $d): array
{
    $id = (int) ($d['id'] ?? 0);
    if ($id) {
        $estatus = estatusObra($id);
        if (in_array($estatus, ['Finalizacion', 'Cancelado'], true)) error("No es posible modificar una obra que su estatus es: $estatus");
        exigirOAutorizar($d, 'MODIFICAR_OBRA');
    } else {
        exigirOAutorizar($d, 'NUEVO_OBRA');
    }

    $faltan = [];
    $obra = [
        'nom_obra'  => texto($d['nom_obra'] ?? '', 200),
        'direccion' => texto($d['direccion'] ?? '', 200),
        'contacto'  => texto($d['contacto'] ?? '', 150),
        'notas'     => texto($d['notas'] ?? '', 32000),
        'fecha_ini' => fecha($d['fecha_ini'] ?? '') ?? date('Y-m-d'),
        'fecha_fin' => fecha($d['fecha_fin'] ?? ''),
    ];
    if ($obra['nom_obra'] === null) $faltan[] = 'No se ha indicado el nombre de la Obra.';
    if ($obra['direccion'] === null) $faltan[] = 'No se ha indicado la dirección de la Obra.';
    if ($obra['contacto'] === null) $faltan[] = 'El nombre del contacto no fue indicado.';
    $responsables = array_values(array_unique(array_filter(array_map('intval', (array) ($d['responsables'] ?? [])))));
    if (!$responsables) $faltan[] = 'No se ha seleccionado un responsable de Obra.';
    if ($faltan) error(implode("\n", $faltan));
    if ($obra['fecha_fin'] && $obra['fecha_fin'] < $obra['fecha_ini']) error('La fecha de término no puede ser anterior a la fecha de inicio.');

    if (bd_tiene_columna('AW', 'reg_obras', 'gasto_administrativo')) $obra['gasto_administrativo'] = round(max(0, (float) ($d['gasto_administrativo'] ?? 0)), 2);
    if (bd_tiene_columna('AW', 'reg_obras', 'avance_obra')) $obra['avance_obra'] = max(0, min(100, (int) ($d['avance'] ?? 0)));

    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        if ($id) {
            bd_ejecutar('AW', 'update reg_obras set ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($obra))) . ' where obra_id = ?',
                array_merge(array_values($obra), [$id]));
            $sugerido = (int) bd_valor('AW', 'select sugerido_id from reg_obras where obra_id = ?', [$id]);
        } else {
            $sugerido = (int) ($d['sugerido_id'] ?? 0);
            $obra += ['sugerido_id' => $sugerido, 'estatus' => 'Planificacion', 'fecha_creacion' => date('Y-m-d H:i:s'), 'usuario_creacion' => usuario()];
            $id = bd_insertar('AW', 'reg_obras', 'obra_id', $obra);
        }
        // Responsables: se reemplazan con los de la lista
        bd_ejecutar('AW', 'delete from responsables_de_obra where obra_id = ?', [$id]);
        foreach ($responsables as $r) {
            bd_insertar('AW', 'responsables_de_obra', 'res_obra_id',
                ['obra_id' => $id, 'vendedor_obra_id' => $r, 'fecha_hora_asig' => date('Y-m-d H:i:s')], 'id_elementos');
        }
        // actualiza_estatus_sugerido_obra(sugerido_id_rel, "Aceptado")
        if ($sugerido) {
            bd_ejecutar('AW', "update doctos_sugerido_obra set estatus = 'Aceptado', obra_id = ? where docto_sugerido_obra_id = ?", [$id, $sugerido]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['id' => $id, 'estatus' => estatusObra($id)];
}

// Cambios de estatus del Dialog243:
//   Ejecucion       (1) solo desde Planificacion              ToolStripButton40
//   Obra Terminada  (2) solo desde Ejecucion; avance al 99 %   ToolStripButton7
//   Finalizacion    (3) solo desde Obra Terminada; CERRAR_OBRA  cerrar_obra
//   Cancelado       CERRAR_OBRA                                ToolStripButton22
//   libre           Modificar Estatus: lo autoriza un administrador (ToolStripButton41)
function cambiarEstatus(array $d): array
{
    $id = (int) ($d['id'] ?? 0);
    $antes = estatusObra($id);
    $nuevo = (string) ($d['estatus'] ?? '');
    $avisos = [];
    $autorizo = null;

    if ($antes === 'Finalizacion') error('No es posible modificar una obra que su estatus es: Finalizacion');

    if (!empty($d['libre'])) {
        if (!in_array($nuevo, OBRA_ABIERTA, true)) error('Estatus no válido.');
        $autorizo = exigirOAutorizar($d, 'ADMIN_USER');
        bd_ejecutar('AW', 'update reg_obras set estatus = ? where obra_id = ?', [$nuevo, $id]);
        return ['estatus' => $nuevo, 'autorizo' => $autorizo, 'avisos' => $avisos];
    }
    if ($antes === 'Cancelado') error('No es posible modificar una obra que su estatus es: Cancelado');

    switch ($nuevo) {
        case 'Ejecucion':
            if ($antes !== 'Planificacion') error('Para actualizar el estatus de la obra, es necesario que su estatus sea Planificacion. Actualice el estatus para poder continuar.');
            bd_ejecutar('AW', "update reg_obras set estatus = 'Ejecucion' where obra_id = ?", [$id]);
            break;

        case 'Obra Terminada':
            if ($antes !== 'Ejecucion') error('Para actualizar el estatus de la obra, es necesario que su estatus sea Ejecucion. Actualice el estatus para poder continuar.');
            $avance = bd_tiene_columna('AW', 'reg_obras', 'avance_obra') ? ', avance_obra = 99' : '';
            bd_ejecutar('AW', "update reg_obras set estatus = 'Obra Terminada'$avance where obra_id = ?", [$id]);
            break;

        case 'Cancelado':
            $autorizo = exigirOAutorizar($d, 'CERRAR_OBRA');
            bd_ejecutar('AW', "update reg_obras set estatus = 'Cancelado' where obra_id = ?", [$id]);
            break;

        case 'Finalizacion':
            if ($antes !== 'Obra Terminada') error('Para finalizar la obra, es necesario que su estatus sea Obra Terminada. Actualice el estatus para poder continuar.');
            $autorizo = exigirOAutorizar($d, 'CERRAR_OBRA');
            $avisos = cerrarObra($id);
            break;

        default:
            error('Estatus no válido.');
    }
    return ['estatus' => $nuevo, 'autorizo' => $autorizo, 'avisos' => $avisos];
}

// cerrar_obra: las órdenes en producción pasan a Fin de Producción, las no liberadas se cancelan
// y las salidas de material pendientes se cancelan
function cerrarObra(int $id): array
{
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        $fin = bd_ejecutar('AW', "update doctos_orden_obra set estatus = 'F', fecha_mod = ?, usuario_modificacion = ? where obra_id = ? and estatus = 'P'",
            [date('Y-m-d H:i:s'), usuario(), $id]);
        $canc = bd_ejecutar('AW', "update doctos_orden_obra set estatus = 'C', fecha_mod = ?, usuario_modificacion = ? where obra_id = ? and estatus = 'O'",
            [date('Y-m-d H:i:s'), usuario(), $id]);
        $sal = bd_ejecutar('AW', "update dvd_solicitudes_material set estatus = 'Cancelado', usuario_modificacion = ?
                                    where estatus = 'Pendiente'
                                      and docto_orden_obra_id in (select docto_orden_obra_id from doctos_orden_obra where obra_id = ?)", [usuario(), $id]);
        bd_ejecutar('AW', "update reg_obras set estatus = 'Finalizacion' where obra_id = ?", [$id]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return [
        "Órdenes enviadas a Fin de Producción: $fin · canceladas: $canc · salidas de material canceladas: $sal.",
        'Los movimientos de producto en proceso / producto terminado en Microsip se siguen generando desde el sistema de escritorio.',
    ];
}

// Imagen de la obra (Button2 / pic_img): se guarda en REG_OBRAS.IMAGEN
function imagen(): array
{
    $id = (int) ($_POST['id'] ?? 0);
    $estatus = estatusObra($id);
    if (in_array($estatus, ['Finalizacion', 'Cancelado'], true)) error("No es posible modificar una obra que su estatus es: $estatus");
    if (!tienePermiso('NUEVO_OBRA', 'MODIFICAR_OBRA', 'ADMIN_USER')) error('No tienes el permiso para «Modificar obras».', 403);

    if (($_FILES['archivo']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        bd_ejecutar('AW', 'update reg_obras set imagen = null where obra_id = ?', [$id]);
        return ['tiene_imagen' => false];
    }
    $a = archivoSubido(IMAGEN_MAX_MB);
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($a['tmp_name']);
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true) || !getimagesize($a['tmp_name'])) {
        error('El archivo no es una imagen válida (usa JPG o PNG).');
    }
    bd_ejecutar_binario('AW', 'update reg_obras set imagen = ? where obra_id = ?', [file_get_contents($a['tmp_name']), $id], [0]);
    return ['tiene_imagen' => true];
}

// Button6 / guarda_archivo_adjunto: el archivo se guarda en ARCHIVOS_ADJUNTOS con el id de la obra
function adjuntar(): array
{
    if (bd_motor('AW') !== 'firebird') error('Los archivos adjuntos de obra solo están disponibles con AW-Management (servidor local).');
    $id = (int) ($_POST['id'] ?? 0);
    estatusObra($id);
    $desc = texto($_POST['descripcion'] ?? '', 49);
    if ($desc === null) error('Ingresar una descripcion corta maximo 50 caracteres.');
    $a = archivoSubido(ADJUNTO_MAX_MB);
    $nombre = mb_substr(basename(str_replace('\\', '/', (string) $a['name'])), 0, 150);
    $ext = strtolower(pathinfo($nombre, PATHINFO_EXTENSION));
    if ($nombre === '' || in_array($ext, ADJ_PROHIBIDAS, true)) error('Ese tipo de archivo no se permite adjuntar.');

    $campos = ['nombre_archivo' => $nombre, 'tamano' => (int) $a['size'], 'fecha_creacion' => date('Y-m-d H:i:s'),
               'usuario_creacion' => usuario(), 'suerido_id' => $id, 'descripcion_corta' => $desc];
    $archivoId = (int) bd_valor('AW', 'select gen_id(id_catalogos, 1) from rdb$database');
    $campos = ['archivo_id' => $archivoId] + $campos + ['archivo_adjunto' => file_get_contents($a['tmp_name'])];
    bd_ejecutar_binario('AW', 'insert into archivos_adjuntos (' . implode(', ', array_keys($campos)) . ') values ('
        . implode(', ', array_fill(0, count($campos), '?')) . ')', array_values($campos), [count($campos) - 1]);
    return ['archivo_id' => $archivoId];
}

// EliminarArchivoToolStripMenuItem
function eliminarAdjunto(array $d): void
{
    $id = (int) ($d['id'] ?? 0);
    estatusObra($id);
    exigirOAutorizar($d, 'MODIFICAR_OBRA');
    if (!bd_ejecutar('AW', 'delete from archivos_adjuntos where archivo_id = ? and suerido_id = ?', [(int) ($d['archivo'] ?? 0), $id])) {
        error('El archivo ya no existe.', 404);
    }
}

// ToolStripButton16: eliminar partidas de la explosión de materiales
function eliminarExplosion(array $d): array
{
    $id = (int) ($d['id'] ?? 0);
    validaEstatusObra($id);
    exigirOAutorizar($d, 'MODIFICAR_OBRA');
    $partidas = array_values(array_filter(array_map('intval', (array) ($d['partidas'] ?? []))));
    if (!$partidas) error('Selecciona las partidas a eliminar.');
    $n = bd_ejecutar('AW', 'delete from explocion_material_de_obra where obra_id = ? and explocion_mat_obra_id in ('
        . implode(', ', array_fill(0, count($partidas), '?')) . ')', array_merge([$id], $partidas));
    return ['eliminadas' => $n];
}

// asigna_cot_de_obra: busca el folio en Microsip (API de Easy-Glass) y lo liga a la obra
function asignarCotizacion(array $d): array
{
    $id = (int) ($d['id'] ?? 0);
    validaEstatusObra($id);
    exigirOAutorizar($d, 'MODIFICAR_OBRA');
    $folio = strtoupper(trim((string) ($d['folio'] ?? '')));
    if (!preg_match('/^[A-Z0-9-]{1,12}$/', $folio)) error('Ingresa el Folio de la Cotizacion.');

    $r = api_http('EASYGLASS', 'GET', '/microsip-pedidos?folio=' . rawurlencode($folio));
    if (!$r['ok']) error('No se pudo consultar Microsip en la API de Easy-Glass: ' . ($r['error'] ?: 'sin respuesta'), 502);
    $docs = $r['datos']['datos'] ?? [];
    if (!$docs) error("No existe en Microsip un documento con el folio $folio.", 404);
    $p = $docs[0];
    if (bd_valor('AW', 'select count(*) from doctos_microsip_obra where obra_id = ? and folio = ?', [$id, $p['folio']])) {
        error("El folio {$p['folio']} ya está asignado a esta obra.");
    }
    $docId = bd_insertar('AW', 'doctos_microsip_obra', 'docto_orden_obra_id', [
        'obra_id'          => $id,
        'cliente_id'       => (int) ($p['cliente_no'] ?? 0) ?: null,
        'nom_cliente'      => texto($p['cliente'] ?? '', 200),
        'folio'            => mb_substr((string) $p['folio'], 0, 9),
        'fecha'            => fecha(substr((string) ($p['fecha'] ?? ''), 0, 10)),
        'estatus'          => texto($p['estatus_clave'] ?? '', 1),
        'descripcion'      => texto($p['descripcion'] ?? '', 200),
        'importe_neto'     => round((float) ($p['importe_neto'] ?? 0), 2),
        'fecha_creacion'   => date('Y-m-d H:i:s'),
        'usuario_creacion' => usuario(),
    ]);
    return ['docto_id' => $docId, 'folio' => $p['folio'], 'cliente' => $p['cliente'] ?? ''];
}

try {
    switch ($_GET['accion'] ?? '') {
        case 'guardar':
            responder(['ok' => true] + guardar(entrada()));
        case 'estatus':
            responder(['ok' => true] + cambiarEstatus(entrada()));
        case 'avance':
            $d = entrada();
            $id = (int) ($d['id'] ?? 0);
            estatusObra($id);
            $avance = max(0, min(100, (int) ($d['avance'] ?? 0)));
            if (!bd_tiene_columna('AW', 'reg_obras', 'avance_obra')) error('La base de AW no tiene la columna AVANCE_OBRA.');
            bd_ejecutar('AW', 'update reg_obras set avance_obra = ? where obra_id = ?', [$avance, $id]);
            responder(['ok' => true, 'avance' => $avance]);
        case 'autorizar':
            $d = entrada();
            $permiso = (string) ($d['permiso'] ?? '');
            if (!in_array($permiso, ['MODIFICAR_OBRA', 'CERRAR_OBRA', 'ADMIN_USER'], true)) error('Permiso no válido.');
            responder(['ok' => true, 'autorizo' => autorizacion($d['autoriza'] ?? null, $permiso)]);
        case 'imagen':
            responder(['ok' => true] + imagen());
        case 'adjuntar':
            responder(['ok' => true] + adjuntar());
        case 'eliminar_adjunto':
            eliminarAdjunto(entrada());
            responder(['ok' => true]);
        case 'eliminar_explosion':
            responder(['ok' => true] + eliminarExplosion(entrada()));
        case 'asignar_cot':
            responder(['ok' => true] + asignarCotizacion(entrada()));
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/registro-obra: ' . $e->getMessage());
    error('No se pudo guardar en AW-Management: ' . bd_mensaje_error($e), 500);
}
