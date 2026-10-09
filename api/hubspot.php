<?php
// Búsquedas en HubSpot (solo lectura, servicio HUBSPOT_API)
// GET ?accion=contactos&q=texto        contactos por correo, nombre o teléfono (con su empresa)
// GET ?accion=negocios&contacto=ID    negocios (deals) asociados al contacto
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/servicios.php';
require __DIR__ . '/../includes/respuesta.php';

exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_SUGERIDO_OBRA', 'MODIFICAR_SUGERIDO_OBRA', 'ADMIN_USER');
session_write_close();

function hs(string $metodo, string $ruta, $datos = null): array
{
    $r = api_http('HUBSPOT_API', $metodo, $ruta, $datos);
    if (!$r['ok']) {
        $msg = is_array($r['datos']) && isset($r['datos']['message']) ? $r['datos']['message'] : $r['error'];
        if ($r['codigo'] === 401 || $r['codigo'] === 403) $msg = 'HubSpot rechazó el token (revisa HUBSPOT_API en Administrador › APIs y servicios).';
        error('HubSpot: ' . $msg, 502);
    }
    return is_array($r['datos']) ? $r['datos'] : [];
}

// Liga a un objeto en la interfaz de HubSpot
function ligaHs(string $tipo, string $id): ?string
{
    try {
        $cuenta = api_config('HUBSPOT')['extra']['cuenta'] ?? '';
    } catch (Throwable $e) {
        return null;
    }
    return $cuenta === '' ? null : "https://app.hubspot.com/contacts/$cuenta/$tipo/$id/";
}

// Lee varios objetos en una sola llamada
function leerLote(string $objeto, array $ids, array $propiedades): array
{
    $ids = array_values(array_unique(array_filter($ids)));
    if (!$ids) return [];
    $d = hs('POST', "/crm/v3/objects/$objeto/batch/read", [
        'properties' => $propiedades,
        'inputs' => array_map(fn($id) => ['id' => (string) $id], $ids),
    ]);
    $porId = [];
    foreach ($d['results'] ?? [] as $o) $porId[$o['id']] = $o['properties'] ?? [];
    return $porId;
}

switch ($_GET['accion'] ?? '') {
    case 'contactos':
        $q = trim($_GET['q'] ?? '');
        if (mb_strlen($q) < 3) error('Escribe al menos 3 letras del correo, nombre o teléfono.');
        $props = ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'company', 'associatedcompanyid', 'hubspot_owner_id'];
        // Correo completo: búsqueda exacta; si no, búsqueda libre (nombre, correo, teléfono, empresa)
        $cuerpo = filter_var($q, FILTER_VALIDATE_EMAIL)
            ? ['filterGroups' => [['filters' => [['propertyName' => 'email', 'operator' => 'EQ', 'value' => $q]]]]]
            : ['query' => $q];
        $d = hs('POST', '/crm/v3/objects/contacts/search', $cuerpo + ['properties' => $props, 'limit' => 20]);

        $empresas = leerLote('companies', array_map(fn($c) => $c['properties']['associatedcompanyid'] ?? null, $d['results'] ?? []), ['name']);
        $contactos = [];
        foreach ($d['results'] ?? [] as $c) {
            $p = $c['properties'] ?? [];
            $idEmp = $p['associatedcompanyid'] ?? '';
            $contactos[] = [
                'id'       => $c['id'],
                'nombre'   => trim(($p['firstname'] ?? '') . ' ' . ($p['lastname'] ?? '')),
                'correo'   => $p['email'] ?? '',
                'telefono' => ($p['phone'] ?? '') ?: ($p['mobilephone'] ?? ''),
                'empresa'  => $empresas[$idEmp]['name'] ?? ($p['company'] ?? ''),
                'empresa_id' => $idEmp,
                'url'      => ligaHs('contact', $c['id']),
            ];
        }
        responder(['ok' => true, 'contactos' => $contactos, 'total' => $d['total'] ?? count($contactos)]);

    case 'negocios':
        $contacto = $_GET['contacto'] ?? '';
        if (!ctype_digit($contacto)) error('Contacto no válido.');
        $a = hs('GET', "/crm/v4/objects/contacts/$contacto/associations/deals?limit=100");
        $ids = array_map(fn($x) => $x['toObjectId'], $a['results'] ?? []);
        $deals = leerLote('deals', $ids, ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate', 'createdate']);

        // Nombres de las etapas de todos los pipelines de negocios
        $etapas = [];
        foreach (hs('GET', '/crm/v3/pipelines/deals')['results'] ?? [] as $pl) {
            foreach ($pl['stages'] ?? [] as $st) $etapas[$st['id']] = $st['label'];
        }
        $negocios = [];
        foreach ($deals as $id => $p) {
            $negocios[] = [
                'id'     => (string) $id,
                'nombre' => $p['dealname'] ?? '',
                'monto'  => $p['amount'] ?? null,
                'etapa'  => $etapas[$p['dealstage'] ?? ''] ?? ($p['dealstage'] ?? ''),
                'cierre' => substr((string) ($p['closedate'] ?? ''), 0, 10),
                'creado' => substr((string) ($p['createdate'] ?? ''), 0, 10),
                'url'    => ligaHs('deal', (string) $id),
            ];
        }
        usort($negocios, fn($x, $y) => strcmp($y['creado'], $x['creado']));   // más recientes primero
        responder(['ok' => true, 'negocios' => $negocios]);

    case 'liga':
        // Liga a un negocio ya capturado (para el "Id de Negocio")
        $id = $_GET['deal'] ?? '';
        if (!ctype_digit($id)) error('Negocio no válido.');
        responder(['ok' => true, 'url' => ligaHs('deal', $id)]);
}
error('Acción no válida.');
