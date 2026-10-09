<?php
// Datos de obras y presupuestos de obra (AW-Management, solo lectura)
// GET ?accion=presupuestos&ini=AAAA-MM-DD&fin=AAAA-MM-DD
// GET ?accion=obras&ini=…&fin=…
// GET ?accion=resumen&ini=…&fin=…   indicadores de Bienvenido
// GET ?accion=obra&id=N              registro de obra con responsables
// GET ?accion=presupuesto&id=N       presupuesto de obra con sus conceptos (MP / MO / GO)
// GET ?accion=imagen&id=N            imagen de la obra
// GET ?accion=catalogos              responsables y conceptos de gastos de operación
// GET ?accion=relacionados&id=N      negocio de HubSpot y folios de Easy-Glass ligados a la obra
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

require __DIR__ . '/../includes/respuesta.php';

function fechaParam(string $nombre, string $defecto): string
{
    $v = $_GET[$nombre] ?? '';
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : $defecto;
}

// Obra → presupuesto de obra (AW.DOCTOS_SUGERIDO_OBRA.ID_HS) → negocio de HubSpot
//      → folios de Easy-Glass con ese mismo negocio (EG.HS_DEALS → DOCTOS_SUERIDOS)
function relacionados(int $obraId): array
{
    $p = bd_fila('AW',
        'select b.docto_sugerido_obra_id, b.folio, b.cliente, b.proyecto, b.id_hs
           from reg_obras a
           join doctos_sugerido_obra b on b.docto_sugerido_obra_id = a.sugerido_id
          where a.obra_id = ?', [$obraId]);
    $r = ['presupuesto' => $p, 'deal' => null, 'deal_url' => null, 'folios' => [], 'avisos' => []];
    if (!$p) {
        $r['avisos'][] = 'La obra no está ligada a un presupuesto de obra.';
        return $r;
    }
    $deal = trim((string) $p['id_hs']);
    if ($deal === '' || $deal === '0' || !ctype_digit($deal)) {
        $r['avisos'][] = "El presupuesto folio {$p['folio']} no está ligado a un negocio de HubSpot.";
        return $r;
    }

    // Liga directa al negocio en HubSpot
    try {
        $cuenta = api_config('HUBSPOT')['extra']['cuenta'] ?? '';
        if ($cuenta !== '') $r['deal_url'] = "https://app.hubspot.com/contacts/$cuenta/deal/$deal/";
    } catch (Throwable $e) {}

    // Folios de Easy-Glass
    try {
        $r['folios'] = bd_filas('EG',
            'select s.suerido_id, s.folio, s.fecha, s.nom_cliente, s.proyecto, v.nombre as vendedor, s.estatus,
                    s.total_proyecto, s.importe_sin_iva, s.importe_con_iva, m.nombre as moneda, t.tipo_sugerido as tipo
               from hs_deals h
               join doctos_sueridos s on s.suerido_id = h.id_docto_easy
               left join vendedores v on v.vendedor_id = s.vendedor
               left join tipos_moneda m on m.moneda_id = s.moneda_id
               left join tipos_sugeridos t on t.id_sugerido = s.tipo_sugerido
              where h.id_deal_hubspot = ?
              order by s.folio', [$deal]);
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
            responder(['ok' => true, 'presupuesto' => $p]);

        case 'relacionados':
            responder(['ok' => true] + relacionados((int) ($_GET['id'] ?? 0)));

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
