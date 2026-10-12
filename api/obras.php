<?php
// Datos de obras y presupuestos de obra (AW-Management, solo lectura)
// GET ?accion=presupuestos&ini=AAAA-MM-DD&fin=AAAA-MM-DD
// GET ?accion=obras&ini=…&fin=…
// GET ?accion=resumen&ini=…&fin=…   indicadores de Bienvenido
// GET ?accion=obra&id=N              registro de obra con responsables
// GET ?accion=presupuesto&id=N       presupuesto de obra con sus conceptos (MP / MO / GO)
// GET ?accion=presupuesto_folio&folio=N  presupuesto por folio (para relacionarlo con otro)
// GET ?accion=imagen&id=N            imagen de la obra
// GET ?accion=catalogos              responsables y conceptos de gastos de operación
// GET ?accion=relacionados&id=N      negocio de HubSpot y folios de Easy-Glass ligados a la obra
// GET ?accion=listado&id=N&tipo=T    pestañas 3 a 9 del Dialog243 (ordenes, explosion, salidas, salidas_det,
//                                    mano, consumos, gastos, adjuntos)
// GET ?accion=facturacion&id=N       2-Facturacion: documentos de cobro de AW + Microsip vía la API de Easy-Glass
// GET ?accion=conceptos&id=N         Conceptos/Tareas del presupuesto de la obra
// GET ?accion=adjunto&id=N           descarga un archivo adjunto de la obra
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/servicios.php';

if (modoConfiguracion()) {
    require __DIR__ . '/../includes/respuesta.php';
    error('Modo configuración: aún no hay conexión a AW-Management.', 503);
}
// Mismos permisos del módulo de obras en el sistema de escritorio
exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'CERRAR_OBRA', 'ADMIN_USER');
session_write_close();

$accion = $_GET['accion'] ?? '';

// La imagen se responde como archivo, no como JSON
if ($accion === 'imagen') {
    $f = bd_fila('AW', 'select imagen from reg_obras where obra_id = ?', [(int) ($_GET['id'] ?? 0)], ['imagen']);
    if (!$f || $f['imagen'] === null || $f['imagen'] === '') { http_response_code(404); exit; }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($f['imagen']);
    header('Content-Type: ' . (strpos($mime, 'image/') === 0 ? $mime : 'application/octet-stream'));
    header('Cache-Control: private, max-age=300');
    echo $f['imagen'];
    exit;
}

// Archivo adjunto de la obra (ARCHIVOS_ADJUNTOS, abre_archivo_adjunto_bd)
if ($accion === 'adjunto') {
    $f = bd_fila('AW', 'select nombre_archivo, archivo_adjunto from archivos_adjuntos where archivo_id = ?', [(int) ($_GET['id'] ?? 0)], ['archivo_adjunto']);
    if (!$f || $f['archivo_adjunto'] === null) { http_response_code(404); exit; }
    $nombre = basename(str_replace('\\', '/', (string) $f['nombre_archivo'])) ?: 'archivo';
    $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($f['archivo_adjunto']) ?: 'application/octet-stream';
    // Solo imágenes y PDF se abren en el navegador; lo demás se descarga
    $enLinea = preg_match('#^(image/(png|jpeg|gif|webp)|application/pdf)$#', $mime);
    header('Content-Type: ' . ($enLinea ? $mime : 'application/octet-stream'));
    header('Content-Disposition: ' . ($enLinea ? 'inline' : 'attachment') . "; filename*=UTF-8''" . rawurlencode($nombre));
    header('X-Content-Type-Options: nosniff');
    echo $f['archivo_adjunto'];
    exit;
}

require __DIR__ . '/../includes/respuesta.php';

function fechaParam(string $nombre, string $defecto): string
{
    $v = $_GET[$nombre] ?? '';
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : $defecto;
}

// Presupuesto de la obra y su negocio de HubSpot (null si no tiene uno válido)
function presupuestoDeObra(int $obraId): array
{
    $p = bd_fila('AW',
        'select b.docto_sugerido_obra_id, b.folio, b.cliente, b.proyecto, b.id_hs
           from reg_obras a
           join doctos_sugerido_obra b on b.docto_sugerido_obra_id = a.sugerido_id
          where a.obra_id = ?', [$obraId]);
    $deal = $p ? trim((string) $p['id_hs']) : '';
    return [$p, $deal !== '' && $deal !== '0' && ctype_digit($deal) ? $deal : null];
}

// Folios de Easy-Glass con el mismo negocio de HubSpot (EG.HS_DEALS → DOCTOS_SUERIDOS)
function foliosEasyGlass(string $deal): array
{
    return bd_filas('EG',
        'select s.suerido_id, s.folio, s.fecha, s.nom_cliente, s.proyecto, v.nombre as vendedor, s.estatus,
                s.total_proyecto, s.importe_sin_iva, s.importe_con_iva, m.nombre as moneda, t.tipo_sugerido as tipo
           from hs_deals h
           join doctos_sueridos s on s.suerido_id = h.id_docto_easy
           left join vendedores v on v.vendedor_id = s.vendedor
           left join tipos_moneda m on m.moneda_id = s.moneda_id
           left join tipos_sugeridos t on t.id_sugerido = s.tipo_sugerido
          where h.id_deal_hubspot = ?
          order by s.folio', [$deal]);
}

// Obra → presupuesto de obra (AW.DOCTOS_SUGERIDO_OBRA.ID_HS) → negocio de HubSpot
//      → folios de Easy-Glass con ese mismo negocio
function relacionados(int $obraId): array
{
    [$p, $deal] = presupuestoDeObra($obraId);
    $r = ['presupuesto' => $p, 'deal' => null, 'deal_url' => null, 'folios' => [], 'avisos' => []];
    if (!$p) {
        $r['avisos'][] = 'La obra no está ligada a un presupuesto de obra.';
        return $r;
    }
    if (!$deal) {
        $r['avisos'][] = "El presupuesto folio {$p['folio']} no está ligado a un negocio de HubSpot.";
        return $r;
    }

    // Liga directa al negocio en HubSpot
    try {
        $cuenta = api_config('HUBSPOT')['extra']['cuenta'] ?? '';
        if ($cuenta !== '') $r['deal_url'] = "https://app.hubspot.com/contacts/$cuenta/deal/$deal/";
    } catch (Throwable $e) {}

    try {
        $r['folios'] = foliosEasyGlass($deal);
        if (!$r['folios']) $r['avisos'][] = 'No hay folios de Easy-Glass ligados a este negocio.';
    } catch (Throwable $e) {
        $r['avisos'][] = 'Easy-Glass: ' . bd_mensaje_error($e);
    }

    // Datos del negocio en HubSpot
    $d = api_http('HUBSPOT_API', 'GET', "/crm/v3/objects/deals/$deal?properties=dealname,dealstage,pipeline,amount,closedate,createdate,hubspot_owner_id");
    if (!$d['ok']) {
        $r['deal'] = ['id' => $deal];
        $r['avisos'][] = 'HubSpot: ' . ($d['codigo'] === 404 ? "no existe el negocio $deal." : $d['error']);
        return $r;
    }
    $pr = $d['datos']['properties'] ?? [];
    $r['deal'] = [
        'id'       => $deal,
        'nombre'   => $pr['dealname'] ?? '',
        'etapa'    => $pr['dealstage'] ?? '',
        'monto'    => $pr['amount'] ?? null,
        'cierre'   => substr((string) ($pr['closedate'] ?? ''), 0, 10),
        'creado'   => substr((string) ($pr['createdate'] ?? ''), 0, 10),
        'propietario' => '',
    ];
    // Nombre de la etapa (el negocio solo trae su id)
    $pl = api_http('HUBSPOT_API', 'GET', '/crm/v3/pipelines/deals/' . rawurlencode($pr['pipeline'] ?? 'default') . '/stages');
    foreach ($pl['ok'] ? ($pl['datos']['results'] ?? []) : [] as $etapa) {
        if (($etapa['id'] ?? '') === $r['deal']['etapa']) $r['deal']['etapa'] = $etapa['label'];
    }
    if (!empty($pr['hubspot_owner_id'])) {
        $ow = api_http('HUBSPOT_API', 'GET', '/crm/v3/owners/' . rawurlencode($pr['hubspot_owner_id']));
        if ($ow['ok']) $r['deal']['propietario'] = trim(($ow['datos']['firstName'] ?? '') . ' ' . ($ow['datos']['lastName'] ?? ''));
    }
    return $r;
}

// Descripción extensa de cada artículo importado: las notas de su partida en la cotización
// de Microsip (DOCTOS_VE_DET.NOTAS) o, si no tiene, las notas de venta del artículo.
// Llena $a['descripcion_larga']; regresa un aviso si Microsip no respondió.
function descripcionesMicrosip(array &$articulos): ?string
{
    $doctos = array_values(array_unique(array_filter(array_map(function ($a) { return (int) $a['docto_id']; }, $articulos))));
    if (!$doctos) return null;
    try {
        $partidas = bd_filas('MS',
            'select d.docto_ve_id, d.articulo_id, d.notas, a.notas_ventas
               from doctos_ve_det d
               left join articulos a on a.articulo_id = d.articulo_id
              where d.docto_ve_id in (' . implode(',', array_fill(0, count($doctos), '?')) . ')
              order by d.docto_ve_id, d.posicion', $doctos);
    } catch (Throwable $e) {
        return 'No se pudieron leer las descripciones de Microsip: ' . bd_mensaje_error($e);
    }
    // Un mismo artículo puede venir en varias partidas: se asignan en orden
    $porArticulo = [];
    foreach ($partidas as $pt) {
        $texto = trim((string) ($pt['notas'] ?: $pt['notas_ventas']));
        $porArticulo[$pt['docto_ve_id'] . ':' . $pt['articulo_id']][] = $texto;
    }
    foreach ($articulos as &$a) {
        $k = (int) $a['docto_id'] . ':' . (int) $a['id_articulo'];
        $a['descripcion_larga'] = !empty($porArticulo[$k]) ? array_shift($porArticulo[$k]) : '';
    }
    unset($a);
    return null;
}

// Estatus de una letra (CHAR(1) de AW) en texto; los de órdenes de trabajo según cerrar_obra del Dialog243
function estatusLetra($e, bool $orden = false): string
{
    $e = trim((string) $e);
    $mapa = $orden ? ['P' => 'Produccion', 'O' => 'Por liberar', 'F' => 'Fin Produccion', 'C' => 'Cancelado'] : ['C' => 'Cancelado'];
    return $mapa[strtoupper($e)] ?? $e;
}

// Pestañas 3 a 9 del Dialog243 (ToolStripButton39, 10, 23, 1, 28, 4, 17 y 13)
function listado(string $tipo, int $id): array
{
    switch ($tipo) {
        case 'ordenes':   // retorna_ordenes_por_obra
            return array_map(function ($f) {
                $f['estatus_2'] = trim((string) $f['estatus']);
                $f['estatus'] = estatusLetra($f['estatus'], true);
                return $f;
            }, bd_filas('AW',
                'select docto_orden_obra_id as id, folio, estatus, fecha, fecha_entrega, importe_neto, descripcion
                   from doctos_orden_obra where obra_id = ? order by fecha, folio', [$id]));

        case 'explosion':   // retorna_explocion_mat_obra_id (algunas columnas solo existen en la base nueva)
            return array_map(function ($f) {
                return [
                    'id' => $f['explocion_mat_obra_id'], 'clave' => $f['clave'], 'nombre' => $f['nombre'], 'um' => $f['um'],
                    'uds' => $f['uds'], 'costo_unit' => $f['costo_unit'], 'costo_tot' => $f['costo_tot'],
                    'um_ml_m2' => $f['uni_med_ml_mq'] ?? '', 'tipo_docto' => $f['tipo_docto'] ?? '', 'folio' => $f['folio'] ?? '',
                ];
            }, bd_filas('AW', 'select * from explocion_material_de_obra where obra_id = ? order by explocion_mat_obra_id', [$id]));

        case 'salidas':   // retorna_doctos_salidas_por_obra: solicitudes de material de las órdenes de la obra
            return bd_filas('AW',
                'select s.docto_solicitud_id as id, s.folio_microsip, o.folio as ot, s.fecha, s.estatus, s.nom_concepto, s.nom_almacen,
                        (select coalesce(sum(d.costo_total), 0) from doctos_solicitudes_det d where d.docto_solicitud_id = s.docto_solicitud_id) as cos_tot
                   from dvd_solicitudes_material s
                   join doctos_orden_obra o on o.docto_orden_obra_id = s.docto_orden_obra_id
                  where o.obra_id = ?
                  order by s.fecha, s.docto_solicitud_id', [$id]);

        case 'salidas_det':   // retorna_doctos_salidas_por_obra_det
            return bd_filas('AW',
                'select s.estatus, d.clave_art, d.nom_art, d.unidades as uds, d.unid_med, s.nom_almacen, d.costo_total
                   from doctos_solicitudes_det d
                   join dvd_solicitudes_material s on s.docto_solicitud_id = d.docto_solicitud_id
                   join doctos_orden_obra o on o.docto_orden_obra_id = s.docto_orden_obra_id
                  where o.obra_id = ?
                  order by d.nom_art', [$id]);

        case 'mano':   // retorna_empleados_asignados_por_obra
            return array_map(function ($f) { $f['estatus'] = estatusLetra($f['estatus']); return $f; }, bd_filas('AW',
                'select e.empleado_asignado_obra_id as id, e.fecha, e.estatus, o.folio, e.nom_unidad, e.importe_mo,
                        coalesce(e.imp_mo_real, 0) as importe_mo_real, e.notas
                   from empleados_asignados_a_obra e
                   left join doctos_orden_obra o on o.docto_orden_obra_id = e.docto_orden_obra_id
                  where e.obra_id = ?
                  order by e.fecha, e.empleado_asignado_obra_id', [$id]));

        case 'consumos':   // retorna_salidas_consumos_obra
            return bd_filas('AW',
                'select c.consumo_material_obra_id as id, o.folio as folio_orden, c.folio, c.estatus, c.fecha,
                        (select coalesce(sum(d.uds_consumo), 0) from consumos_material_en_obra_det d
                          where d.consumo_meterial_obra_id = c.consumo_material_obra_id) as uds_salida
                   from consumos_metrial_en_obra c
                   left join doctos_orden_obra o on o.docto_orden_obra_id = c.docto_orden_obra_id
                  where c.obra_id = ?
                  order by c.fecha, c.consumo_material_obra_id', [$id]);

        case 'gastos':   // retorna_gastos_adicionales_por_obra
            return array_map(function ($f) { $f['estatus'] = estatusLetra($f['estatus']); return $f; }, bd_filas('AW',
                'select g.gasto_adicional_id as id, cg.nombre, g.estatus, o.folio, g.fecha_creacion, g.nom_unidad, g.importe,
                        (select coalesce(sum(d.imp_real), 0) from gastos_adicionales_obra_det d where d.gasto_adicional_id = g.gasto_adicional_id) as importe_real,
                        g.notas
                   from gastos_adicionales_obra g
                   left join conceptos_gastos_obra cg on cg.concepto_gasto_id = g.concepto_gasto_id
                   left join doctos_orden_obra o on o.docto_orden_obra_id = g.docto_orden_obra_id
                  where g.obra_id = ?
                  order by g.fecha_creacion, g.gasto_adicional_id', [$id]));

        case 'adjuntos':   // retorna_archivos_adjuntos(obra_id)
            return bd_filas('AW',
                'select archivo_id as id, nombre_archivo, descripcion_corta, fecha_creacion, usuario_creacion
                   from archivos_adjuntos where suerido_id = ? order by archivo_id', [$id]);
    }
    error('Listado no válido.');
}

// Cruce de un folio de Easy-Glass con Microsip (API v1 /microsip-folio): [datos, error]
function microsipFolio($folio): array
{
    $r = api_http('EASYGLASS', 'GET', '/microsip-folio/' . rawurlencode((string) $folio));
    if (!$r['ok']) return [null, $r['error'] ?: 'sin respuesta'];
    $d = $r['datos']['datos'] ?? null;
    return is_array($d) ? [$d, null] : [null, 'respuesta sin datos'];
}

// Renglón de facturación de un folio de Easy-Glass: pedido, facturas y cobranza de Microsip.
// Igual que el escritorio: Cargos = importe facturado (o el del pedido si no hay factura),
// Creditos = cobros + anticipos + notas de crédito aplicados, más los anticipos por aplicar.
function filaMicrosip(array $m, array $base): array
{
    $pedidos = $m['pedidos'] ?? [];
    $facturas = array_values(array_filter($m['facturas'] ?? [], fn($f) => empty($f['cancelada'])));
    $cob = $m['cobranza'] ?? [];
    $importe = $pedidos ? array_sum(array_map(fn($p) => (float) $p['total_docto'], $pedidos)) : (float) ($base['importe'] ?? 0);
    $impFac = (float) ($cob['total_factura'] ?? array_sum(array_map(fn($f) => (float) $f['importe'], $facturas)));
    $porAplicar = array_sum(array_map(fn($a) => (float) ($a['importe_por_aplicar'] ?? 0), $m['anticipos'] ?? []));
    $cargos = $impFac > 0 ? $impFac : $importe;
    $creditos = (float) ($cob['total_aplicado'] ?? 0) + $porAplicar;
    $p0 = $pedidos[0] ?? [];
    return array_merge($base, [
        'folio'       => $m['folio_microsip'] ?? $base['folio'],
        'estatus'     => $p0['estatus'] ?? ($base['estatus'] ?? 'Sin pedido'),
        'cliente'     => $p0['cliente'] ?? ($base['cliente'] ?? ''),
        'fecha'       => $p0['fecha'] ?? ($base['fecha'] ?? ''),
        'moneda'      => $p0['moneda'] ?? '',
        'importe'     => $importe,
        'factura'     => $facturas ? implode(', ', array_column($facturas, 'folio')) : 'NO FACTUR',
        'imp_factura' => $impFac,
        'cargos'      => $cargos,
        'creditos'    => $creditos,
        'saldo'       => round($cargos - $creditos, 2),
        'cobranza'    => $cob['estatus'] ?? '',
        'detalle'     => detalleMicrosip($m),
    ]);
}

// Documentos de Microsip de un folio para el detalle del renglón
function detalleMicrosip(array $m): array
{
    $d = [];
    foreach ($m['pedidos'] ?? [] as $x) $d[] = ['Pedido', $x['folio'], $x['fecha'], $x['estatus'] ?? '', $x['total_docto'], $x['moneda'] ?? ''];
    foreach ($m['ordenes_compra'] ?? [] as $x) $d[] = ['Orden de compra · ' . ($x['proveedor'] ?? ''), $x['folio'], $x['fecha'], $x['estatus'] ?? '', $x['total_docto'], $x['moneda'] ?? ''];
    foreach ($m['facturas'] ?? [] as $x) $d[] = ['Factura', $x['folio'], $x['fecha'], empty($x['cancelada']) ? 'Vigente' : 'Cancelada', $x['importe'], $x['moneda'] ?? ''];
    $c = $m['cobranza'] ?? [];
    foreach ($c['cobros'] ?? [] as $x) $d[] = ['Cobro', $x['folio'] ?? '', $x['fecha'] ?? '', $x['concepto'] ?? '', $x['importe'] ?? 0, ''];
    foreach ($c['anticipos'] ?? [] as $x) $d[] = ['Anticipo aplicado', $x['folio'] ?? '', $x['fecha'] ?? '', $x['concepto'] ?? '', $x['importe'] ?? 0, ''];
    foreach ($c['notas_credito'] ?? [] as $x) $d[] = ['Nota de crédito', $x['folio'] ?? '', $x['fecha'] ?? '', $x['concepto'] ?? '', $x['importe'] ?? 0, ''];
    foreach ($m['anticipos'] ?? [] as $x) $d[] = ['Anticipo por aplicar', $x['folio'] ?? '', $x['fecha'] ?? '', '', $x['importe_por_aplicar'] ?? 0, $x['moneda'] ?? ''];
    return array_map(fn($x) => array_combine(['tipo', 'folio', 'fecha', 'estatus', 'importe', 'moneda'], $x), $d);
}

// 2-Facturacion (ToolStripButton9 / retorna_cotizaciones_microsip_por_obra2):
//   tipo -1  cotizaciones de Microsip asignadas a la obra (DOCTOS_MICROSIP_OBRA)
//   tipo  0/1/2  pago en efectivo, nota de cargo y anticipo capturados en AW (DOCTOS_ADIC_COBRO_OBRA)
//   tipo  9  folios de Easy-Glass del negocio de HubSpot de la obra
// Las facturas, cobros y saldos de Microsip salen de la API de Easy-Glass.
function facturacion(int $obraId): array
{
    $filas = [];
    $avisos = [];
    $vistos = [];
    $cruzar = function (array $base, $folioEasy) use (&$filas, &$avisos, &$vistos) {
        $k = (int) $folioEasy;
        if ($k && isset($vistos[$k])) return;
        if ($k) $vistos[$k] = true;
        [$m, $err] = $k ? microsipFolio($k) : [null, null];
        if ($err) $avisos[] = "Microsip folio {$base['folio']}: $err";
        if ($m && !empty($m['encontrado'])) { $filas[] = filaMicrosip($m, $base); return; }
        // Sin documentos en Microsip: no facturado, el saldo es el importe
        $imp = (float) $base['importe'];
        $filas[] = $base + ['factura' => 'NO FACTUR', 'imp_factura' => 0, 'cargos' => $imp, 'creditos' => 0, 'saldo' => $imp, 'detalle' => []];
    };

    try {
        foreach (bd_filas('AW',
            'select docto_orden_obra_id as id, folio, estatus, nom_cliente, fecha, importe_neto
               from doctos_microsip_obra where obra_id = ? order by fecha, folio', [$obraId]) as $c) {
            // El folio EG0009256 es de un pedido de Easy-Glass: se cruza con Microsip
            $folioEasy = preg_match('/^EG0*(\d+)$/i', trim((string) $c['folio']), $mm) ? $mm[1] : 0;
            $cruzar(['id' => $c['id'], 'tipo' => -1, 'tipo_docto' => 'Cotizacion Microsip', 'folio' => $c['folio'], 'estatus' => estatusLetra($c['estatus']),
                     'cliente' => $c['nom_cliente'], 'fecha' => $c['fecha'], 'importe' => (float) $c['importe_neto']], $folioEasy);
        }
    } catch (Throwable $e) {
        $avisos[] = 'Cotizaciones asignadas: ' . bd_mensaje_error($e);
    }

    try {
        foreach (bd_filas('AW',
            'select docto_adic_cobro_obra_id as id, tipo, folio, importe, notas, fecha, estatus
               from doctos_adic_cobro_obra where obra_id = ? order by fecha, docto_adic_cobro_obra_id', [$obraId]) as $d) {
            $tipo = (int) $d['tipo'];
            $imp = (float) $d['importe'];
            $f = ['id' => $d['id'], 'tipo' => $tipo, 'tipo_docto' => [0 => 'Pago en Efectivo', 1 => 'Nota de Cargo', 2 => 'Anticipo'][$tipo] ?? "Tipo $tipo",
                  'folio' => $d['folio'], 'estatus' => $d['estatus'], 'cliente' => $d['notas'], 'fecha' => $d['fecha'], 'importe' => $imp, 'detalle' => []];
            // Nota de cargo: suma a los cargos · Efectivo y anticipo: abonan
            $filas[] = $tipo === 1
                ? $f + ['factura' => '', 'imp_factura' => 0, 'cargos' => $imp, 'creditos' => 0, 'saldo' => $imp]
                : $f + ['factura' => $tipo === 0 ? 'DEP.EFECTIVO' : 'ANTICIPO', 'imp_factura' => 0, 'cargos' => 0, 'creditos' => $imp, 'saldo' => -$imp];
        }
    } catch (Throwable $e) {
        $avisos[] = 'Documentos de cobro: ' . bd_mensaje_error($e);
    }

    [$p, $deal] = presupuestoDeObra($obraId);
    if ($deal) {
        try {
            $folios = foliosEasyGlass($deal);
            if (count($folios) > 40) {
                $avisos[] = 'El negocio tiene ' . count($folios) . ' folios de Easy-Glass; solo se cruzan los primeros 40 con Microsip.';
                $folios = array_slice($folios, 0, 40);
            }
            foreach ($folios as $f) {
                $cruzar(['id' => $f['suerido_id'], 'tipo' => 9, 'tipo_docto' => 'Easy-Glass · ' . ($f['tipo'] ?: 'Presupuesto'), 'folio' => $f['folio'],
                         'estatus' => $f['estatus'], 'cliente' => $f['nom_cliente'], 'fecha' => $f['fecha'], 'importe' => (float) $f['importe_con_iva']], $f['folio']);
            }
        } catch (Throwable $e) {
            $avisos[] = 'Easy-Glass: ' . bd_mensaje_error($e);
        }
    } elseif ($p) {
        $avisos[] = "El presupuesto folio {$p['folio']} no está ligado a un negocio de HubSpot: no se buscan sus folios de Easy-Glass.";
    }
    if (!$filas) $avisos[] = 'No existen Cotizaciones asignadas a esta obra.';
    return ['filas' => $filas, 'avisos' => $avisos];
}

// Conceptos/Tareas del presupuesto de la obra, con la misma clave que en el presupuesto
// (MP-<mes>-<consecutivo>) y una subtarea por cada partida del documento importado
function conceptosTareas(int $obraId): array
{
    $p = bd_fila('AW',
        'select b.docto_sugerido_obra_id, b.folio, b.fecha, b.proyecto
           from reg_obras a join doctos_sugerido_obra b on b.docto_sugerido_obra_id = a.sugerido_id
          where a.obra_id = ?', [$obraId]);
    if (!$p) return ['presupuesto' => null, 'conceptos' => []];
    $id = (int) $p['docto_sugerido_obra_id'];
    $renglones = bd_filas('AW',
        "select d.docto_sugerido_obra_det_id as det_id, trim(d.tipo_concepto) as tipo, d.presupuesto, d.folio, d.notas,
                coalesce(cmp.descripcion, cmo.descripcion, cgo.descripcion) as concepto
           from doctos_sugerido_obra_det d
           left join conceptos_mat_prima_obra cmp on trim(d.tipo_concepto) = 'MP' and cmp.concepto_mat_prima_id = d.concepto_id
           left join conceptos_mano_obra cmo on trim(d.tipo_concepto) = 'MO' and cmo.concepto_mano_obra_id = d.concepto_id
           left join conceptos_gas_operacion_obra cgo on trim(d.tipo_concepto) = 'GO' and cgo.concepto_gas_operacion_obra_id = d.concepto_id
          where d.docto_sugerido_obra_id = ?
          order by d.docto_sugerido_obra_det_id", [$id]);
    $articulos = [];
    foreach (bd_filas('AW',
        'select m.docto_sugerido_obra_det_id as det_id, m.folio, m.clave_articulo, m.nom_articulo, m.unidades, m.unid_medida, m.precio_total
           from doctos_suge_obra_det_mat m
           join doctos_sugerido_obra_det d on d.docto_sugerido_obra_det_id = m.docto_sugerido_obra_det_id
          where d.docto_sugerido_obra_id = ?
          order by m.docto_suge_obra_det_mat_id', [$id]) as $a) {
        $articulos[$a['det_id']][] = $a;
    }

    $agrupador = ['MP' => 'Materia Prima', 'MO' => 'Mano de Obra', 'GO' => 'Gastos de Operacion'];
    $mes = $p['fecha'] ? substr((string) $p['fecha'], 5, 2) : date('m');
    $consecutivo = 0;
    $conceptos = [];
    foreach ($renglones as $r) {
        $tipo = strtoupper((string) $r['tipo']);
        if (!isset($agrupador[$tipo])) continue;
        $n = ++$consecutivo;   // igual que js/presupuesto.js: cuenta también los renglones sin nombre
        $nombre = trim((string) $r['concepto']);
        if ($nombre === '') continue;
        $clave = $tipo . '-' . $mes . '-' . str_pad((string) $n, 3, '0', STR_PAD_LEFT);
        $arts = $articulos[$r['det_id']] ?? [];
        // Cantidad y unidad: la suma de las partidas si todas tienen la misma unidad
        $unidades = array_map(fn($a) => trim((string) $a['unid_medida']), $arts);
        $mismaUnidad = $arts && $unidades[0] !== '' && count(array_unique($unidades)) === 1;
        $conceptos[] = [
            'clave' => $clave, 'tipo' => $tipo, 'agrupador' => $agrupador[$tipo], 'concepto' => $nombre,
            'cantidad' => $mismaUnidad ? array_sum(array_map(fn($a) => (float) $a['unidades'], $arts)) : 1,
            'unidad' => $mismaUnidad ? $unidades[0] : ($tipo === 'MO' ? 'Servicio' : 'Lote'),
            'folio' => $r['folio'], 'notas' => $r['notas'], 'importe' => (float) $r['presupuesto'],
            'partidas' => array_map(fn($a, $i) => [
                'clave' => $clave . '.' . ($i + 1), 'concepto' => trim((string) $a['clave_articulo']) ?: $a['nom_articulo'],
                'descripcion' => $a['nom_articulo'], 'cantidad' => (float) $a['unidades'], 'unidad' => trim((string) $a['unid_medida']) ?: 'Pieza',
                'folio' => $a['folio'], 'importe' => (float) $a['precio_total'],
            ], $arts, array_keys($arts)),
        ];
    }
    return ['presupuesto' => ['id' => $id, 'folio' => $p['folio'], 'proyecto' => $p['proyecto']], 'conceptos' => $conceptos];
}

$ini = fechaParam('ini', date('Y-m-01'));
$fin = fechaParam('fin', date('Y-m-d'));

try {
    switch ($accion) {
        case 'presupuestos':
            responder(['ok' => true, 'filas' => bd_filas('AW',
                'select a.docto_sugerido_obra_id, a.folio, a.estatus, a.fecha, a.cliente, a.proyecto, v.nombre as vendedor,
                        a.obra_id, o.nom_obra as obra
                   from doctos_sugerido_obra a
                   left join vendedores_obras v on v.vendedor_obra_id = a.vendedor_obra_id
                   left join reg_obras o on o.obra_id = a.obra_id
                  where a.fecha between ? and ?
                  order by a.folio desc', [$ini, $fin])]);

        case 'obras':
            responder(['ok' => true, 'filas' => bd_filas('AW',
                'select a.obra_id, b.folio, a.estatus, a.fecha_ini as fecha, b.cliente, b.proyecto, b.ubicacion, a.nom_obra
                   from reg_obras a
                   left join doctos_sugerido_obra b on b.docto_sugerido_obra_id = a.sugerido_id
                  where a.fecha_ini between ? and ?
                  order by a.obra_id desc', [$ini, $fin])]);

        case 'resumen':
            $pres = [];
            foreach (bd_filas('AW', 'select estatus, count(*) as n from doctos_sugerido_obra where fecha between ? and ? group by estatus', [$ini, $fin]) as $r) {
                $pres[$r['estatus']] = (int) $r['n'];
            }
            responder(['ok' => true,
                'presupuestos_pendientes' => $pres['Pendiente'] ?? 0,
                'presupuestos_aceptados'  => $pres['Aceptado'] ?? 0,
                // Obras en proceso: todas las que siguen abiertas, sin importar la fecha
                'obras_en_proceso' => (int) bd_valor('AW', "select count(*) from reg_obras where estatus in ('Planificacion', 'Ejecucion', 'Obra Terminada')"),
            ]);

        case 'obra':
            $id = (int) ($_GET['id'] ?? 0);
            $o = bd_fila('AW',
                'select a.obra_id, a.sugerido_id, a.nom_obra, a.direccion, a.contacto, a.notas, a.fecha_ini, a.fecha_fin, a.estatus,
                        a.fecha_creacion, a.usuario_creacion, a.gasto_administrativo, a.imp_fac_obra, a.avance_obra,
                        case when a.imagen is null then 0 else 1 end as tiene_imagen,
                        b.folio, b.proyecto, b.cliente
                   from reg_obras a
                   left join doctos_sugerido_obra b on b.docto_sugerido_obra_id = a.sugerido_id
                  where a.obra_id = ?', [$id]);
            if (!$o) error('La obra no existe.', 404);
            $o['responsables'] = bd_filas('AW',
                'select r.res_obra_id, r.vendedor_obra_id, v.nombre
                   from responsables_de_obra r
                   left join vendedores_obras v on v.vendedor_obra_id = r.vendedor_obra_id
                  where r.obra_id = ?
                  order by r.fecha_hora_asig', [$id]);
            responder(['ok' => true, 'obra' => $o]);

        case 'presupuesto':
            $id = (int) ($_GET['id'] ?? 0);
            $p = bd_fila('AW',
                'select a.docto_sugerido_obra_id, a.folio, a.fecha, a.cliente, a.proyecto, a.ubicacion, a.estatus, a.id_hs,
                        a.utilidad_neta_por, a.subtotal, a.notas, a.obra_id, a.usuario_creador, v.nombre as vendedor, o.nom_obra
                   from doctos_sugerido_obra a
                   left join vendedores_obras v on v.vendedor_obra_id = a.vendedor_obra_id
                   left join reg_obras o on o.obra_id = a.obra_id
                  where a.docto_sugerido_obra_id = ?', [$id]);
            if (!$p) error('El presupuesto no existe.', 404);
            $p['correo'] = bd_tiene_columna('AW', 'doctos_sugerido_obra', 'correo_electronico')
                ? bd_valor('AW', 'select correo_electronico from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$id]) : null;
            // Renglones de Materia Prima / Mano de Obra / Gastos de Operacion con el nombre de su concepto
            $p['conceptos'] = bd_filas('AW',
                "select d.docto_sugerido_obra_det_id, d.tipo_concepto, d.concepto_id, d.presupuesto, d.docto_imp_id, d.folio, d.notas,
                        coalesce(cmp.descripcion, cmo.descripcion, cgo.descripcion) as concepto
                   from doctos_sugerido_obra_det d
                   left join conceptos_mat_prima_obra cmp on trim(d.tipo_concepto) = 'MP' and cmp.concepto_mat_prima_id = d.concepto_id
                   left join conceptos_mano_obra cmo on trim(d.tipo_concepto) = 'MO' and cmo.concepto_mano_obra_id = d.concepto_id
                   left join conceptos_gas_operacion_obra cgo on trim(d.tipo_concepto) = 'GO' and cgo.concepto_gas_operacion_obra_id = d.concepto_id
                  where d.docto_sugerido_obra_id = ?
                  order by d.docto_sugerido_obra_det_id", [$id]);
            // Artículos del documento importado en cada renglón: dan la descripción, cantidad y unidad del Concepto/Tarea
            $articulos = bd_filas('AW',
                'select m.docto_sugerido_obra_det_id, m.docto_id, m.folio, m.id_articulo, m.clave_articulo, m.nom_articulo,
                        m.unidades, m.unid_medida, m.precio_unit, m.precio_total
                   from doctos_suge_obra_det_mat m
                   join doctos_sugerido_obra_det d on d.docto_sugerido_obra_det_id = m.docto_sugerido_obra_det_id
                  where d.docto_sugerido_obra_id = ?
                  order by m.docto_suge_obra_det_mat_id', [$id]);
            $p['aviso_descripciones'] = descripcionesMicrosip($articulos);
            $porRenglon = [];
            foreach ($articulos as $a) $porRenglon[$a['docto_sugerido_obra_det_id']][] = $a;
            foreach ($p['conceptos'] as &$c) $c['articulos'] = $porRenglon[$c['docto_sugerido_obra_det_id']] ?? [];
            unset($c);
            // Detalle del Form46: empleados × días, comisiones, anexo de seguro y sugeridos relacionados
            $p['empleados'] = bd_filas('AW',
                'select empleado_id, clave_empleado as clave, nombre, sueldo_diario as sueldo, num_dias as dias, total
                   from mano_obra_detalle where docto_sugerido_obra_id = ? order by mano_obra_det_id', [$id]);
            $p['comisiones'] = bd_filas('AW',
                'select tipo_empleado_id as tipo_id, nombre, porcentaje, total_comision as total
                   from comisiones_obra_det where docto_sugerido_obra_id = ? order by comision_obra_det_id', [$id]);
            $p['seguros'] = bd_filas('AW',
                'select coalesce(c.descripcion, s.nombre) as concepto, s.porcentaje_1, s.porcentaje_2, s.total
                   from anexos_obra_seguro s
                   left join conceptos_gas_operacion_obra c on c.concepto_gas_operacion_obra_id = s.concepto_gas_operacion_obra_id
                  where s.docto_sugerido_obra_id = ? order by s.anexo_obra_idd', [$id]);
            $p['relacionados'] = bd_filas('AW',
                'select r.sugerido_id_hijo as sugerido_id, coalesce(h.folio, r.folio_sugerido_hijo) as folio,
                        coalesce(h.cliente, r.cliente_sugerido_hijo) as cliente, h.proyecto, h.estatus, h.total
                   from sugeridos_relacionados r
                   left join doctos_sugerido_obra h on h.docto_sugerido_obra_id = r.sugerido_id_hijo
                  where r.sugerido_id_padre = ? order by r.sug_relacion_id', [$id]);
            responder(['ok' => true, 'presupuesto' => $p]);

        case 'presupuesto_folio':
            // Sugeridos relacionados (Form46.Button5): busca el presupuesto por su folio
            $p = bd_fila('AW',
                'select docto_sugerido_obra_id as sugerido_id, folio, cliente, proyecto, estatus, total
                   from doctos_sugerido_obra where folio = ?', [(int) ($_GET['folio'] ?? 0)]);
            if (!$p) error('El folio del presupuesto es incorrecto o no existe.', 404);
            responder(['ok' => true, 'presupuesto' => $p]);

        case 'relacionados':
            responder(['ok' => true] + relacionados((int) ($_GET['id'] ?? 0)));

        case 'listado':
            responder(['ok' => true, 'filas' => listado((string) ($_GET['tipo'] ?? ''), (int) ($_GET['id'] ?? 0))]);

        case 'facturacion':
            responder(['ok' => true] + facturacion((int) ($_GET['id'] ?? 0)));

        case 'conceptos':
            responder(['ok' => true] + conceptosTareas((int) ($_GET['id'] ?? 0)));

        case 'catalogos':
            responder(['ok' => true,
                'responsables' => bd_filas('AW', "select vendedor_obra_id as id, nombre from vendedores_obras where estatus = 'A' order by nombre"),
                'conceptos_gas_oper' => bd_filas('AW', 'select concepto_gas_operacion_obra_id as id, clave, descripcion from conceptos_gas_operacion_obra order by descripcion'),
            ]);
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/obras: ' . $e->getMessage());
    error('No se pudo consultar AW-Management: ' . bd_mensaje_error($e), 500);
}
