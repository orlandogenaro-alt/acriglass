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
// POST ?accion=enviar_microsip { id, folio, simular? }  folio de Easy-Glass → Pedido y OC en Microsip (ENVIAR_MICROSIP_OBRA)
// POST ?accion=guardar_cot / quitar_cot           cotización de facturación capturada / quitar una asignada
// POST ?accion=guardar_cobro / cancelar_cobro     pago en efectivo, nota de cargo o anticipo (Dialog279)
// POST ?accion=guardar_orden / estatus_orden      orden de trabajo y sus partidas (Dialog242)
// POST ?accion=agregar_explosion / actualizar_explosion   explosión de material (Dialog230)
// POST ?accion=guardar_mo / cancelar_mo           mano de obra asignada (Dialog275)
// POST ?accion=guardar_gasto / cancelar_gasto     gasto adicional (Dialog274)
// Todas: { id: obra_id, …, autoriza? }; requieren MODIFICAR_OBRA o la autorización de otro usuario
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
        'Microsip solo se consulta desde la web (API de Easy-Glass): los movimientos de inventario de producto en proceso / producto terminado no se generan aquí.',
    ];
}

function numero($v, int $dec = 2): float
{
    return round(is_numeric($v) ? (float) $v : 0.0, $dec);
}

// Valida que el documento pertenezca a la obra; regresa su renglón
function documentoDeObra(string $tabla, string $colId, int $docId, int $obraId, string $que): array
{
    $f = bd_fila('AW', "select * from $tabla where $colId = ? and obra_id = ?", [$docId, $obraId]);
    if (!$f) error("$que ya no existe.", 404);
    return $f;
}

// Reemplaza el detalle de un documento: borra los renglones y da de alta los nuevos
function reemplazarDetalle(string $tabla, string $colId, string $colPadre, int $padre, array $filas): void
{
    bd_ejecutar('AW', "delete from $tabla where $colPadre = ?", [$padre]);
    foreach ($filas as $f) bd_insertar('AW', $tabla, $colId, [$colPadre => $padre] + $f);
}

// ---------- 3-Orden de trabajo (Dialog242) ----------
// estatus: O = por liberar, P = en produccion, F = fin de produccion, C = cancelada
function guardarOrden(array $d): array
{
    $obra = (int) ($d['id'] ?? 0);
    validaEstatusObra($obra);
    exigirOAutorizar($d, 'MODIFICAR_OBRA');
    $ordenId = (int) ($d['orden_id'] ?? 0);
    if ($ordenId) {
        $o = documentoDeObra('doctos_orden_obra', 'docto_orden_obra_id', $ordenId, $obra, 'La orden de trabajo');
        if (trim((string) $o['estatus']) !== 'O') error('Solo se puede modificar una orden que no se ha liberado a producción.');
    }
    $partidas = [];
    foreach ((array) ($d['partidas'] ?? []) as $i => $p) {
        $desc = texto($p['descripcion'] ?? '', 200);
        $uds = numero($p['unidades'] ?? 0);
        if ($desc === null && !$uds) continue;
        if ($desc === null) error('Hay una partida sin descripción.');
        $pu = numero($p['precio_unitario'] ?? 0);
        $partidas[] = [
            'articulo_id' => (int) ($p['articulo_id'] ?? 0) ?: null, 'clave_articulo' => texto($p['clave_articulo'] ?? '', 30),
            'descripcion' => $desc, 'unidades' => $uds, 'um' => texto($p['um'] ?? '', 30), 'precio_unitario' => $pu,
            'precio_total' => numero($uds * $pu), 'notas_adic' => texto($p['notas_adic'] ?? '', 4000), 'pos' => count($partidas) + 1,
        ];
    }
    if (!$partidas) error('Agrega al menos una partida a la orden de trabajo.');
    $enc = [
        'nom_cliente'   => texto($d['nom_cliente'] ?? '', 200),
        'fecha'         => fecha($d['fecha'] ?? '') ?? date('Y-m-d'),
        'fecha_entrega' => fecha($d['fecha_entrega'] ?? ''),
        'descripcion'   => texto($d['descripcion'] ?? '', 200),
        'importe_neto'  => numero(array_sum(array_column($partidas, 'precio_total'))),
    ];
    if ($enc['descripcion'] === null) error('Captura la descripción de la orden de trabajo.');

    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        if ($ordenId) {
            $enc += ['fecha_mod' => date('Y-m-d H:i:s'), 'usuario_modificacion' => usuario()];
            bd_ejecutar('AW', 'update doctos_orden_obra set ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($enc))) . ' where docto_orden_obra_id = ?',
                array_merge(array_values($enc), [$ordenId]));
        } else {
            $ordenId = bd_insertar('AW', 'doctos_orden_obra', 'docto_orden_obra_id', $enc + [
                'obra_id' => $obra, 'folio' => (string) bd_folio('AW', 'folios_cot_obra'), 'estatus' => 'O',
                'fecha_creacion' => date('Y-m-d H:i:s'), 'usuario_creacion' => usuario(),
            ]);
        }
        reemplazarDetalle('doctos_orden_obra_det', 'docto_orden_obra_det_id', 'docto_orden_obra_id', $ordenId, $partidas);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['orden_id' => $ordenId, 'folio' => bd_valor('AW', 'select folio from doctos_orden_obra where docto_orden_obra_id = ?', [$ordenId])];
}

// Liberar a produccion (O→P), Fin de produccion (P→F) o Cancelar (O/P→C)
function estatusOrden(array $d): array
{
    $obra = (int) ($d['id'] ?? 0);
    validaEstatusObra($obra);
    exigirOAutorizar($d, 'MODIFICAR_OBRA');
    $o = documentoDeObra('doctos_orden_obra', 'docto_orden_obra_id', (int) ($d['orden_id'] ?? 0), $obra, 'La orden de trabajo');
    $antes = trim((string) $o['estatus']);
    $nuevo = (string) ($d['estatus'] ?? '');
    $validas = ['P' => ['O'], 'F' => ['P'], 'C' => ['O', 'P']];
    if (!isset($validas[$nuevo])) error('Estatus no válido.');
    if (!in_array($antes, $validas[$nuevo], true)) {
        error(['P' => 'Solo se libera a producción una orden por liberar.', 'F' => 'Solo se termina una orden que está en producción.',
               'C' => 'La orden ya está terminada o cancelada.'][$nuevo]);
    }
    bd_ejecutar('AW', 'update doctos_orden_obra set estatus = ?, fecha_mod = ?, usuario_modificacion = ? where docto_orden_obra_id = ?',
        [$nuevo, date('Y-m-d H:i:s'), usuario(), (int) $o['docto_orden_obra_id']]);
    return ['estatus' => $nuevo];
}

// ---------- 2-Facturacion: cotizacion capturada (Dialog242.carga_ini_cot) y documentos de cobro (Dialog279) ----------
function guardarCotizacion(array $d): array
{
    $obra = (int) ($d['id'] ?? 0);
    validaEstatusObra($obra);
    exigirOAutorizar($d, 'MODIFICAR_OBRA');
    $folio = texto($d['folio'] ?? '', 9);
    if ($folio === null) error('Captura el folio de la cotización.');
    if (bd_valor('AW', 'select count(*) from doctos_microsip_obra where obra_id = ? and folio = ?', [$obra, $folio])) error("El folio $folio ya está asignado a esta obra.");
    $importe = numero($d['importe'] ?? 0);
    if ($importe <= 0) error('Captura el importe de la cotización.');
    $id = bd_insertar('AW', 'doctos_microsip_obra', 'docto_orden_obra_id', [
        'obra_id' => $obra, 'nom_cliente' => texto($d['nom_cliente'] ?? '', 200), 'folio' => $folio,
        'fecha' => fecha($d['fecha'] ?? '') ?? date('Y-m-d'), 'fecha_entrega' => fecha($d['fecha_entrega'] ?? ''),
        'estatus' => 'P', 'descripcion' => texto($d['descripcion'] ?? '', 200), 'importe_neto' => $importe,
        'fecha_creacion' => date('Y-m-d H:i:s'), 'usuario_creacion' => usuario(),
    ]);
    return ['docto_id' => $id];
}

function quitarCotizacion(array $d): void
{
    $obra = (int) ($d['id'] ?? 0);
    validaEstatusObra($obra);
    exigirOAutorizar($d, 'MODIFICAR_OBRA');
    if (!bd_ejecutar('AW', 'delete from doctos_microsip_obra where docto_orden_obra_id = ? and obra_id = ?', [(int) ($d['docto_id'] ?? 0), $obra])) {
        error('La cotización ya no está asignada a la obra.', 404);
    }
}

// tipo: 0 = pago en efectivo, 1 = nota de cargo, 2 = anticipo
function guardarCobro(array $d): array
{
    $obra = (int) ($d['id'] ?? 0);
    validaEstatusObra($obra);
    exigirOAutorizar($d, 'MODIFICAR_OBRA');
    $tipo = (int) ($d['tipo'] ?? -1);
    if (!in_array($tipo, [0, 1, 2], true)) error('Selecciona el tipo de documento.');
    $importe = numero($d['importe'] ?? 0);
    if ($importe <= 0) error('Captura el importe del documento.');
    $folio = texto($d['folio'] ?? '', 10) ?? (string) bd_folio('AW', bd_motor('AW') === 'firebird' ? 'folio_tiempos_paro' : 'folio_mov_adic_obra');
    $id = bd_insertar('AW', 'doctos_adic_cobro_obra', 'docto_adic_cobro_obra_id', [
        'obra_id' => $obra, 'tipo' => $tipo, 'es_microsip' => !empty($d['es_microsip']) ? 'True' : 'False',
        'folio' => $folio, 'importe' => $importe, 'notas' => texto($d['notas'] ?? '', 200),
        'fecha' => fecha($d['fecha'] ?? '') ?? date('Y-m-d'), 'fecha_creacion' => date('Y-m-d H:i:s'),
        'usuario_creacion' => usuario(), 'estatus' => 'Aplicado',
    ]);
    return ['docto_id' => $id, 'folio' => $folio];
}

function cancelarCobro(array $d): void
{
    $obra = (int) ($d['id'] ?? 0);
    validaEstatusObra($obra);
    exigirOAutorizar($d, 'MODIFICAR_OBRA');
    if (!bd_ejecutar('AW', "update doctos_adic_cobro_obra set estatus = 'Cancelado' where docto_adic_cobro_obra_id = ? and obra_id = ?",
        [(int) ($d['docto_id'] ?? 0), $obra])) error('El documento ya no existe.', 404);
}

// ---------- 4-Explosion de material (Dialog230 y ToolStripButton14) ----------
function agregarExplosion(array $d): array
{
    $obra = (int) ($d['id'] ?? 0);
    validaEstatusObra($obra);
    exigirOAutorizar($d, 'MODIFICAR_OBRA');
    $extra = array_filter(['uni_med_ml_mq', 'tipo_docto', 'folio'], fn($c) => bd_tiene_columna('AW', 'explocion_material_de_obra', $c));
    $n = 0;
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        foreach ((array) ($d['partidas'] ?? []) as $p) {
            $nombre = texto($p['nombre'] ?? '', 200);
            if ($nombre === null) continue;
            $uds = numero($p['uds'] ?? 0, 3);
            $cu = numero($p['costo_unit'] ?? 0);
            $campos = ['obra_id' => $obra, 'articulo_id' => (int) ($p['articulo_id'] ?? 0) ?: null, 'clave' => texto($p['clave'] ?? '', 30),
                       'nombre' => $nombre, 'um' => texto($p['um'] ?? '', 15), 'uds' => $uds, 'costo_unit' => $cu, 'costo_tot' => numero($uds * $cu)];
            foreach ($extra as $c) $campos[$c] = texto($p[$c === 'uni_med_ml_mq' ? 'um_ml_m2' : $c] ?? '', $c === 'folio' ? 20 : 15);
            bd_insertar('AW', 'explocion_material_de_obra', 'explocion_mat_obra_id', $campos);
            $n++;
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    if (!$n) error('Agrega al menos un artículo con nombre.');
    return ['agregadas' => $n];
}

// guarda_explocion_materiales_obra: unidades y costo capturados en la tabla
function actualizarExplosion(array $d): array
{
    $obra = (int) ($d['id'] ?? 0);
    validaEstatusObra($obra);
    exigirOAutorizar($d, 'MODIFICAR_OBRA');
    $n = 0;
    foreach ((array) ($d['partidas'] ?? []) as $p) {
        $uds = numero($p['uds'] ?? 0, 3);
        $cu = numero($p['costo_unit'] ?? 0);
        $n += bd_ejecutar('AW', 'update explocion_material_de_obra set uds = ?, costo_unit = ?, costo_tot = ? where explocion_mat_obra_id = ? and obra_id = ?',
            [$uds, $cu, numero($uds * $cu), (int) ($p['id'] ?? 0), $obra]);
    }
    return ['actualizadas' => $n];
}

// ---------- 6-Mano de obra (Dialog275) ----------
function guardarManoObra(array $d): array
{
    $obra = (int) ($d['id'] ?? 0);
    validaEstatusObra($obra);
    $moId = (int) ($d['mo_id'] ?? 0);
    // Nueva: como las demás capturas de la obra · Modificar: MODIFICAR_ASIGNAR_MO (tool_modificar)
    exigirOAutorizar($d, $moId ? 'MODIFICAR_ASIGNAR_MO' : 'MODIFICAR_OBRA');
    if ($moId && estatusLetraDoc(documentoDeObra('empleados_asignados_a_obra', 'empleado_asignado_obra_id', $moId, $obra, 'La asignación de mano de obra')) === 'C') {
        error('No es posible modificar un documento cancelado');
    }
    $det = [];
    $vistos = [];
    foreach ((array) ($d['empleados'] ?? []) as $e) {
        $nombre = texto($e['nombre'] ?? '', 150);
        if ($nombre === null) continue;
        $emp = (int) ($e['id_empleado'] ?? 0);
        if ($emp && isset($vistos[$emp])) error("El empleado $nombre está dos veces.");
        $vistos[$emp] = 1;
        $costo = numero($e['costo_x_hrs'] ?? 0);
        $hrs = numero($e['hrs_trabajo'] ?? 0);
        $real = numero($e['hrs_trabajo_real'] ?? 0);
        $det[] = ['id_empleado' => $emp ?: null, 'nombre' => $nombre, 'costo_x_hrs' => $costo, 'hrs_trabajo' => $hrs, 'hrs_trabajo_real' => $real,
                  'costo_tot_pres' => numero($costo * $hrs), 'cost_tot_real' => numero($costo * $real)];
    }
    if (!$det) error('Aún no se ha asignado personal a la obra. Agregue personal para poder guardar los cambios.');
    $enc = [
        'fecha' => fecha($d['fecha'] ?? '') ?? date('Y-m-d'),
        'docto_orden_obra_id' => (int) ($d['docto_orden_obra_id'] ?? 0) ?: null,
        'unidad_transporte_id' => (int) ($d['unidad_transporte_id'] ?? 0),
        'nom_unidad' => texto($d['nom_unidad'] ?? '', 100),
        'notas' => texto($d['notas'] ?? '', 300),
        'importe_mo' => numero(array_sum(array_column($det, 'costo_tot_pres'))),
        'imp_mo_real' => numero(array_sum(array_column($det, 'cost_tot_real'))),
    ];
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        if ($moId) {
            bd_ejecutar('AW', 'update empleados_asignados_a_obra set ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($enc))) . ' where empleado_asignado_obra_id = ?',
                array_merge(array_values($enc), [$moId]));
        } else {
            $moId = bd_insertar('AW', 'empleados_asignados_a_obra', 'empleado_asignado_obra_id', $enc + ['obra_id' => $obra, 'estatus' => 'A']);
        }
        reemplazarDetalle('empleados_asignados_a_obra_det', 'empleado_asignado_a_obra_det_id', 'empleado_asignado_obra_id', $moId, $det);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    bitacora($moId, 'Estatus:Normal Importe: $' . number_format($enc['importe_mo'], 2));
    return ['mo_id' => $moId];
}

// ToolStripButton1 (Dialog275): CANCELAR_ASIGNAR_MO y el motivo queda en la bitácora
function cancelarManoObra(array $d): void
{
    $obra = (int) ($d['id'] ?? 0);
    validaEstatusObra($obra);
    exigirOAutorizar($d, 'CANCELAR_ASIGNAR_MO');
    $moId = (int) ($d['doc_id'] ?? 0);
    if (estatusLetraDoc(documentoDeObra('empleados_asignados_a_obra', 'empleado_asignado_obra_id', $moId, $obra, 'La asignación de mano de obra')) === 'C') {
        error('El documento ya está cancelado.');
    }
    bd_ejecutar('AW', "update empleados_asignados_a_obra set estatus = 'C' where empleado_asignado_obra_id = ? and obra_id = ?", [$moId, $obra]);
    bitacora($moId, 'Estatus: Cancelado Motivo: ' . trim((string) ($d['motivo'] ?? '')));
}

// guarda_bitacora_costos_prod: si falla no detiene la captura (igual que en VB)
function bitacora(int $id, string $notas): void
{
    try {
        bd_ejecutar('AW', 'insert into bitacora_movimientos_sis_costos (id_optimizacion, num_optimizacion, usuario, fecha_hora, notas) values (?, ?, ?, ?, ?)',
            [$id, $id, usuario(), date('Y-m-d H:i:s'), mb_substr($notas, 0, 100)]);
    } catch (Throwable $e) {
        error_log('AcriGlass bitácora: ' . $e->getMessage());
    }
}

function estatusLetraDoc(array $f): string
{
    return strtoupper(substr(trim((string) $f['estatus']), 0, 1));
}

// ---------- 8-Gastos adicionales (Dialog274) ----------
// Concepto de gasto por nombre; si no está en el catálogo se da de alta
function conceptoGastoId(string $nombre): int
{
    $id = (int) bd_valor('AW', 'select min(concepto_gasto_id) from conceptos_gastos_obra where upper(trim(nombre)) = ?', [mb_strtoupper($nombre)]);
    return $id ?: bd_insertar('AW', 'conceptos_gastos_obra', 'concepto_gasto_id', ['nombre' => mb_substr(mb_strtoupper($nombre), 0, 60), 'tipo' => 0]);
}

function guardarGasto(array $d): array
{
    $obra = (int) ($d['id'] ?? 0);
    validaEstatusObra($obra);
    exigirOAutorizar($d, 'MODIFICAR_OBRA');
    $gastoId = (int) ($d['gasto_id'] ?? 0);
    if ($gastoId && estatusLetraDoc(documentoDeObra('gastos_adicionales_obra', 'gasto_adicional_id', $gastoId, $obra, 'El gasto')) === 'C') {
        error('El gasto está cancelado.');
    }
    $concepto = texto($d['concepto'] ?? '', 60);
    if ($concepto === null) error('Selecciona el concepto del gasto.');

    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        $det = [];
        foreach ((array) ($d['detalle'] ?? []) as $r) {
            $c = texto($r['concepto'] ?? '', 60);
            if ($c === null) continue;
            $det[] = ['concepto_gasto_id' => conceptoGastoId($c), 'imp_presupuestado' => numero($r['imp_presupuestado'] ?? 0), 'imp_real' => numero($r['imp_real'] ?? 0)];
        }
        if (!$det) error('Agrega al menos un renglón de importe al gasto.');
        $enc = [
            'concepto_gasto_id' => conceptoGastoId($concepto),
            'docto_orden_obra_id' => (int) ($d['docto_orden_obra_id'] ?? 0) ?: null,
            'nom_unidad' => texto($d['nom_unidad'] ?? '', 100),
            'importe' => numero(array_sum(array_column($det, 'imp_presupuestado'))),
            'notas' => texto($d['notas'] ?? '', 300),
            'fecha_creacion' => (fecha($d['fecha'] ?? '') ?? date('Y-m-d')) . ' ' . date('H:i:s'),
        ];
        if ($gastoId) {
            bd_ejecutar('AW', 'update gastos_adicionales_obra set ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($enc))) . ' where gasto_adicional_id = ?',
                array_merge(array_values($enc), [$gastoId]));
        } else {
            $gastoId = bd_insertar('AW', 'gastos_adicionales_obra', 'gasto_adicional_id', $enc + ['obra_id' => $obra, 'estatus' => 'A']);
        }
        reemplazarDetalle('gastos_adicionales_obra_det', 'gasto_adicional_obra_det_id', 'gasto_adicional_id', $gastoId, $det);
        // Personal del gasto (retorna_personal_consumos_obra)
        $personal = [];
        foreach ((array) ($d['personal'] ?? []) as $p) {
            $n = texto($p['nombre'] ?? '', 150);
            if ($n !== null) $personal[] = ['id_empleado' => (int) ($p['id_empleado'] ?? 0) ?: null, 'nombre_empleado' => $n];
        }
        reemplazarDetalle('personal_consumo_en_obra', 'personal_consumo_obra_id', 'consumo_material_obra_id', $gastoId, $personal);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['gasto_id' => $gastoId];
}

// Cancelar un gasto adicional (no suma en los totales)
function cancelarDocumento(array $d, string $tabla, string $colId): void
{
    $obra = (int) ($d['id'] ?? 0);
    validaEstatusObra($obra);
    exigirOAutorizar($d, 'MODIFICAR_OBRA');
    if (!bd_ejecutar('AW', "update $tabla set estatus = 'C' where $colId = ? and obra_id = ?", [(int) ($d['doc_id'] ?? 0), $obra])) {
        error('El documento ya no existe.', 404);
    }
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
    $id = (int) ($_POST['id'] ?? 0);
    estatusObra($id);
    $desc = texto($_POST['descripcion'] ?? '', 49);
    if ($desc === null) error('Ingresar una descripcion corta maximo 50 caracteres.');
    $a = archivoSubido(ADJUNTO_MAX_MB);
    $nombre = mb_substr(basename(str_replace('\\', '/', (string) $a['name'])), 0, 150);
    $ext = strtolower(pathinfo($nombre, PATHINFO_EXTENSION));
    if ($nombre === '' || in_array($ext, ADJ_PROHIBIDAS, true)) error('Ese tipo de archivo no se permite adjuntar.');

    $archivoId = bd_insertar_binario('AW', 'archivos_adjuntos', 'archivo_id', [
        'nombre_archivo' => $nombre, 'tamano' => (int) $a['size'], 'fecha_creacion' => date('Y-m-d H:i:s'),
        'usuario_creacion' => usuario(), 'suerido_id' => $id, 'descripcion_corta' => $desc,
        'archivo_adjunto' => file_get_contents($a['tmp_name']),
    ], ['archivo_adjunto']);
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
    if ($docs) {
        $p = $docs[0];
    } else {
        // Presupuesto de Easy-Glass que aún no pasa a Microsip: se liga como EG0009783 y la
        // pestaña de facturación lo cruza con Microsip cuando ya exista el pedido
        $num = preg_match('/^(EG)?0*(\d{1,7})$/', $folio, $mm) ? $mm[2] : '';
        $e = $num !== '' ? api_http('EASYGLASS', 'GET', '/presupuestos?folio=' . $num) : null;
        $pre = $e && $e['ok'] ? ($e['datos']['datos'] ?? null) : null;
        if (!is_array($pre) || empty($pre['folio'])) error("No existe en Microsip ni en Easy-Glass un documento con el folio $folio.", 404);
        $p = [
            'folio'         => 'EG' . str_pad($num, 7, '0', STR_PAD_LEFT),
            'cliente_no'    => null,
            'cliente'       => $pre['nom_cliente'] ?? '',
            'fecha'         => $pre['fecha'] ?? '',
            'estatus_clave' => substr((string) ($pre['estatus'] ?? ''), 0, 1),
            'descripcion'   => 'Easy-Glass ' . $num . (!empty($pre['proyecto']) ? ' · ' . $pre['proyecto'] : ''),
            'importe_neto'  => $pre['total_proyecto'] ?? 0,
        ];
    }
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

// «Enviar a Facturacion» de Easy-Glass por la API (POST /microsip-enviar/{folio}): Pedido de venta y Orden de
// compra en Microsip. Solo folios de la obra (asignados en 2-Facturación o del mismo negocio de HubSpot).
// simular = 1 solo valida; Easy-Glass revisa estatus, tareas y documentos y no duplica folios.
function enviarMicrosip(array $d): array
{
    $obra = (int) ($d['id'] ?? 0);
    validaEstatusObra($obra);
    $num = preg_match('/^(EG)?0*(\d{1,7})$/i', trim((string) ($d['folio'] ?? '')), $mm) ? (int) $mm[2] : 0;
    if (!$num) error('Folio de Easy-Glass no válido.');
    $simular = !empty($d['simular']);
    if (!$simular) exigirOAutorizar($d, 'ENVIAR_MICROSIP_OBRA');

    $folioEg = 'EG' . str_pad((string) $num, 7, '0', STR_PAD_LEFT);
    $deObra = (int) bd_valor('AW', 'select count(*) from doctos_microsip_obra where obra_id = ? and folio = ?', [$obra, $folioEg]) > 0;
    if (!$deObra) {
        $deal = trim((string) bd_valor('AW', 'select b.id_hs from reg_obras a join doctos_sugerido_obra b on b.docto_sugerido_obra_id = a.sugerido_id where a.obra_id = ?', [$obra]));
        $deObra = ctype_digit($deal) && $deal !== '0' && (int) bd_valor('EG',
            'select count(*) from hs_deals h join doctos_sueridos s on s.suerido_id = h.id_docto_easy where h.id_deal_hubspot = ? and s.folio = ?', [$deal, $num]) > 0;
    }
    if (!$deObra) error("El folio $folioEg no pertenece a esta obra.");

    $r = api_http('EASYGLASS', 'POST', '/microsip-enviar/' . $num . ($simular ? '?simular=1' : ''), ['simular' => $simular ? 1 : 0]);
    $datos = is_array($r['datos']) ? $r['datos'] : [];
    if (!$r['ok'] || (isset($datos['ok']) && !$datos['ok'])) {
        $msg = $datos['error'] ?? $datos['mensaje'] ?? $datos['datos']['error'] ?? null;
        error($msg ? (string) (is_array($msg) ? implode(' · ', $msg) : $msg) : 'Easy-Glass no pudo enviar a Microsip: ' . ($r['error'] ?: 'sin respuesta'), 502);
    }
    if (!$simular) error_log("AcriGlass enviar a Microsip: obra $obra folio $folioEg por " . usuario());
    return ['folio' => $folioEg, 'simular' => $simular, 'resultado' => $datos['datos'] ?? $datos];
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
        case 'enviar_microsip':
            responder(['ok' => true] + enviarMicrosip(entrada()));
        case 'guardar_cot':
            responder(['ok' => true] + guardarCotizacion(entrada()));
        case 'quitar_cot':
            quitarCotizacion(entrada());
            responder(['ok' => true]);
        case 'guardar_cobro':
            responder(['ok' => true] + guardarCobro(entrada()));
        case 'cancelar_cobro':
            cancelarCobro(entrada());
            responder(['ok' => true]);
        case 'guardar_orden':
            responder(['ok' => true] + guardarOrden(entrada()));
        case 'estatus_orden':
            responder(['ok' => true] + estatusOrden(entrada()));
        case 'agregar_explosion':
            responder(['ok' => true] + agregarExplosion(entrada()));
        case 'actualizar_explosion':
            responder(['ok' => true] + actualizarExplosion(entrada()));
        case 'guardar_mo':
            responder(['ok' => true] + guardarManoObra(entrada()));
        case 'cancelar_mo':
            cancelarManoObra(entrada());
            responder(['ok' => true]);
        case 'guardar_gasto':
            responder(['ok' => true] + guardarGasto(entrada()));
        case 'cancelar_gasto':
            cancelarDocumento(entrada(), 'gastos_adicionales_obra', 'gasto_adicional_id');
            responder(['ok' => true]);
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/registro-obra: ' . $e->getMessage());
    error('No se pudo guardar en AW-Management: ' . bd_mensaje_error($e), 500);
}
