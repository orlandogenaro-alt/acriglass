<?php
// HubSpot al guardar un presupuesto de obra, como el Form46 del escritorio (ToolStripButton1/2):
//   antes de guardar   actualiza_relacion_contacto_hubspot: el contacto del correo debe existir en HubSpot;
//                      si no existe, no se guarda ("No existe un contacto con los datos seleccionados").
//   después de guardar guarda_o_actualiza_sugerido_hs: crea el negocio (o lo actualiza si ya tiene Id) con
//                      nombre «folio proyecto», monto total, nota «PRESUPUESTO DE OBRA  Ubicado en: …», el
//                      propietario del vendedor, los contactos y la empresa; sube el formato impreso y lo deja
//                      en una nota del negocio. Las propiedades son las de Consultas_HB (GuardaDeal / hs_Actualiza_deal).
// Servicio HUBSPOT_API (Administrador › APIs y servicios). Si no está activo, el presupuesto se guarda sin HubSpot.
require_once __DIR__ . '/servicios.php';

const HS_PIPELINE = 'default';               // Consultas_HB: pipeline
const HS_ETAPA = 'appointmentscheduled';     // Consultas_HB: etapa
const HS_CARPETA = '/AcriGlass/Presupuestos de obra';

// ¿Está configurado HubSpot? (servicio activo con credencial)
function hsActivo(): bool
{
    try {
        $s = api_config('HUBSPOT_API');
        return !empty($s['activa']) && ($s['credencial'] ?? '') !== '';
    } catch (Throwable $e) {
        return false;
    }
}

// Llamada a HubSpot: datos o excepción con el mensaje de HubSpot
function hsLlamar(string $metodo, string $ruta, $datos = null): array
{
    $r = api_http('HUBSPOT_API', $metodo, $ruta, $datos);
    if (!$r['ok']) {
        $msg = is_array($r['datos']) && isset($r['datos']['message']) ? $r['datos']['message'] : $r['error'];
        if ($r['codigo'] === 401 || $r['codigo'] === 403) $msg = 'HubSpot rechazó el token o le faltan permisos (revisa HUBSPOT_API en Administrador › APIs y servicios): ' . $msg;
        throw new RuntimeException((string) $msg);
    }
    return is_array($r['datos']) ? $r['datos'] : [];
}

// retorna_contactos_v2: contactos con el correo del presupuesto → [['id', 'empresa_id']]
function hsContactos(string $correo): array
{
    $d = hsLlamar('POST', '/crm/v3/objects/contacts/search', [
        'filterGroups' => [['filters' => [['propertyName' => 'email', 'operator' => 'EQ', 'value' => $correo]]]],
        'properties' => ['email', 'associatedcompanyid'], 'limit' => 10,
    ]);
    return array_map(fn($c) => ['id' => (string) $c['id'], 'empresa_id' => (string) ($c['properties']['associatedcompanyid'] ?? '')], $d['results'] ?? []);
}

// retorna_id_hubspot_vendedores_obra: el propietario de HubSpot del vendedor (su Id en la ficha del vendedor,
// o el del usuario del sistema con el mismo nombre); '' si no tiene
function hsPropietario(int $vendedorId): string
{
    if (!$vendedorId) return '';
    $v = bd_fila('AW', 'select * from vendedores_obras where vendedor_obra_id = ?', [$vendedorId]);
    if (!$v || strtoupper(trim((string) $v['estatus'])) === 'B') return '';
    $id = trim((string) ($v['id_hubspot'] ?? ''));
    if ($id === '' || $id === '0') {
        $id = trim((string) bd_valor('AW', "select max(id_hubspot) from usuarios where upper(trim(nombre)) = upper(trim(?)) and estatus = 'A'", [$v['nombre']]));
    }
    return $id === '0' ? '' : $id;
}

// carga_archivo: sube el formato impreso a la biblioteca de archivos de HubSpot → id del archivo
function hsSubirArchivo(string $nombre, string $contenido, string $tipo): string
{
    $tmp = tempnam(sys_get_temp_dir(), 'acrihs');
    file_put_contents($tmp, $contenido);
    try {
        $inicio = microtime(true);
        $ch = api_preparar('HUBSPOT_API', 'POST', '/files/v3/files', null, []);
        curl_setopt($ch, CURLOPT_POSTFIELDS, [
            'file'       => new CURLFile($tmp, $tipo, $nombre),
            'folderPath' => HS_CARPETA,
            'options'    => json_encode(['access' => 'PRIVATE', 'overwrite' => false]),
        ]);
        $cuerpo = curl_exec($ch);
        $r = api_resultado($cuerpo, (int) curl_getinfo($ch, CURLINFO_HTTP_CODE), curl_errno($ch) ? curl_error($ch) : null, $inicio);
        curl_close($ch);
    } finally {
        @unlink($tmp);
    }
    if (!$r['ok'] || empty($r['datos']['id'])) {
        throw new RuntimeException(is_array($r['datos']) && isset($r['datos']['message']) ? $r['datos']['message'] : (string) $r['error']);
    }
    return (string) $r['datos']['id'];
}

// Crea o actualiza un negocio; si HubSpot no conoce una propiedad propia del escritorio (folio_easy_glass,
// cotizador, usuario_creador_easy_glass), se reintenta solo con las estándar
function hsNegocio(string $metodo, string $ruta, array $props, array $extra, array $asociaciones = []): array
{
    $cuerpo = ['properties' => $props + $extra] + ($asociaciones ? ['associations' => $asociaciones] : []);
    try {
        return hsLlamar($metodo, $ruta, $cuerpo);
    } catch (RuntimeException $e) {
        if (!$extra || stripos($e->getMessage(), 'propert') === false) throw $e;
        return hsLlamar($metodo, $ruta, ['properties' => $props] + ($asociaciones ? ['associations' => $asociaciones] : []));
    }
}

// guarda_o_actualiza_sugerido_hs. $p: folio, proyecto, ubicacion, total, id_hs, vendedor_obra_id, usuario;
// $contactos de hsContactos; $formato: HTML del formato impreso (opcional). → ['id_hs' => ?string, 'avisos' => []]
function hsGuardarPresupuesto(array $p, array $contactos, ?string $formato): array
{
    $avisos = [];
    $owner = hsPropietario((int) $p['vendedor_obra_id']);
    if ($owner === '') {
        return ['id_hs' => null, 'avisos' => ['HubSpot: El Vendedor ya se encuentra dado de baja, o no existe relacion con HubSpot (captura su Id de HubSpot en Catalogos › Vendedores de Obra). El presupuesto se guardó, pero no se actualizó el negocio.']];
    }
    $idsContacto = array_values(array_unique(array_column($contactos, 'id')));
    $empresas = array_values(array_unique(array_filter(array_column($contactos, 'empresa_id'))));
    $empresas = array_slice($empresas, 0, 1);   // compa(0): la empresa del contacto
    $nombre = trim($p['folio'] . ' ' . $p['proyecto']);
    $nota = 'PRESUPUESTO DE OBRA  Ubicado en: ' . $p['ubicacion'];
    $monto = number_format((float) $p['total'], 2, '.', '');
    $idHs = preg_match('/^\d{3,}$/', (string) $p['id_hs']) ? (string) $p['id_hs'] : '';

    if ($idHs !== '') {
        // hs_Actualiza_deal
        hsNegocio('PATCH', "/crm/v3/objects/deals/$idHs",
            ['dealname' => $nombre, 'description' => $nota, 'amount' => $monto, 'hubspot_owner_id' => $owner, 'dealtype' => 'existingbusiness'],
            ['cotizador' => 'PRESUPUESTO OBRA']);
        foreach ($idsContacto as $c) hsLlamar('PUT', "/crm/v4/objects/deal/$idHs/associations/default/contact/$c");
        foreach ($empresas as $c) hsLlamar('PUT', "/crm/v4/objects/deal/$idHs/associations/default/company/$c");
    } else {
        // GuardaDeal
        $asoc = array_merge(
            array_map(fn($c) => ['to' => ['id' => $c], 'types' => [['associationCategory' => 'HUBSPOT_DEFINED', 'associationTypeId' => 3]]], $idsContacto),
            array_map(fn($c) => ['to' => ['id' => $c], 'types' => [['associationCategory' => 'HUBSPOT_DEFINED', 'associationTypeId' => 5]]], $empresas));
        $d = hsNegocio('POST', '/crm/v3/objects/deals', [
            'dealname' => $nombre, 'pipeline' => HS_PIPELINE, 'dealstage' => HS_ETAPA, 'description' => $nota,
            'hubspot_owner_id' => $owner, 'closedate' => gmdate('Y-m-d\TH:i:s\Z', time() + 30 * 86400),
            'amount' => $monto, 'deal_currency_code' => 'MXN', 'dealtype' => 'newbusiness',
        ], ['folio_easy_glass' => (string) $p['folio'], 'cotizador' => 'PRESUPUESTO OBRA', 'usuario_creador_easy_glass' => (string) $p['usuario']], $asoc);
        $idHs = (string) ($d['id'] ?? '');
        if ($idHs === '') throw new RuntimeException('HubSpot no regresó el Id del negocio.');
    }

    // agregar_una_nota_con_archivo: el formato impreso adjunto en una nota del negocio, sus contactos y la empresa
    if ($formato !== null && $formato !== '') {
        try {
            $archivo = hsSubirArchivo('Presupuesto_de_Obra_' . preg_replace('/\D/', '', (string) $p['folio']) . '.html', $formato, 'text/html');
            $asoc = array_merge(
                [['to' => ['id' => $idHs], 'types' => [['associationCategory' => 'HUBSPOT_DEFINED', 'associationTypeId' => 214]]]],
                array_map(fn($c) => ['to' => ['id' => $c], 'types' => [['associationCategory' => 'HUBSPOT_DEFINED', 'associationTypeId' => 202]]], $idsContacto),
                array_map(fn($c) => ['to' => ['id' => $c], 'types' => [['associationCategory' => 'HUBSPOT_DEFINED', 'associationTypeId' => 190]]], $empresas));
            hsLlamar('POST', '/crm/v3/objects/notes', [
                'properties' => ['hs_timestamp' => gmdate('Y-m-d\TH:i:s\Z'), 'hs_note_body' => $nota, 'hubspot_owner_id' => $owner, 'hs_attachment_ids' => $archivo],
                'associations' => $asoc,
            ]);
        } catch (Throwable $e) {
            $avisos[] = 'HubSpot: el negocio se actualizó, pero no se pudo adjuntar el formato del presupuesto: ' . $e->getMessage();
        }
    }
    return ['id_hs' => $idHs, 'avisos' => $avisos];
}
