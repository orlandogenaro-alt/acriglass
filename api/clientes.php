<?php
// Catalogos › Clientes: ficha de clientes en Supabase (conexión AW, tabla CLIENTES de la migración 016)
// GET  ?accion=listar                       clientes para el listado
// GET  ?accion=ficha&id=N                   cliente (id 0 = nuevo) con las listas de la ficha y su relación con HubSpot
// GET  ?accion=historial&id=N&ini=…&fin=…   presupuestos de obra del cliente (DOCTOS_SUGERIDO_OBRA)
// POST ?accion=guardar                      {id, …campos}; regresa { id, clave }
// POST ?accion=impuesto                     {id, impuesto, total_impuesto}  igual que «Modificar el impuesto» de Easy-Glass
// POST ?accion=eliminar                     {id}   solo si no tiene cotizaciones
// POST ?accion=hs_asociar                   {id, id_hubspot, nombre, correo, telefono}  liga el contacto (HS_CLIENTES)
// POST ?accion=hs_quitar                    {id, id_rel}  quita la relación (estatus 0, como Easy-Glass)
// POST ?accion=hs_registrar                 {id, nombre, correo, telefono}  crea el contacto en HubSpot y lo liga
// GET  ?accion=buscar&q=T                   clientes del catálogo para el campo Cliente del presupuesto (con su Microsip y HubSpot)
// GET  ?accion=microsip_buscar&q=T          cuentas de Microsip (API de Easy-Glass /clientes) y si ya están en el catálogo
// POST ?accion=microsip_importar            {cliente_id, clave, nombre, contacto, telefono}  cliente con cuenta en Microsip
// POST ?accion=alta_hubspot                 {id_hubspot, empresa, contacto, correo, telefono}  cliente nuevo desde su contacto de HubSpot
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/bd.php';
require __DIR__ . '/../includes/servicios.php';
require __DIR__ . '/../includes/respuesta.php';

if (modoConfiguracion()) error('Modo configuración: aún no hay conexión a las bases de datos.', 503);
if (!bd_tiene_tabla('AW', 'clientes')) error('Falta crear el catálogo de clientes en Supabase: aplica la migración 016_clientes.sql.', 503);

const PERMISOS_CLIENTES = ['NUEVO_SUGERIDO_OBRA', 'MODIFICAR_SUGERIDO_OBRA', 'ADMIN_USER'];
exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', ...PERMISOS_CLIENTES);

$accion = $_GET['accion'] ?? 'listar';
if (!in_array($accion, ['listar', 'ficha', 'historial', 'buscar', 'microsip_buscar'], true)) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
    exigirCsrf();
    exigirPermiso(...PERMISOS_CLIENTES);
}
$puedeModificar = tienePermiso(...PERMISOS_CLIENTES);
$usuario = mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50);
session_write_close();
// Cuenta de Microsip del cliente (migración 022)
$conMicrosip = bd_tiene_columna('AW', 'clientes', 'microsip_cliente_id');

function texto($v, int $largo, bool $multilinea = false): ?string
{
    $v = $multilinea ? trim(str_replace("\r\n", "\n", (string) ($v ?? ''))) : trim(preg_replace('/\s+/u', ' ', (string) ($v ?? '')));
    return $v === '' ? null : mb_substr($v, 0, $largo);
}

function fechaParam(string $nombre, string $defecto): string
{
    $v = $_GET[$nombre] ?? '';
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : $defecto;
}

function existeCliente(int $id): void
{
    if (!$id || !bd_valor('AW', 'select count(*) from clientes where cliente_id = ?', [$id])) error('El cliente ya no existe (¿lo eliminaron?).', 404);
}

// Id de un catálogo de la ficha: 0/vacío = sin asignar; si viene, debe existir
function idCatalogo($v, string $tabla, string $col, string $nombre): ?int
{
    $id = (int) ($v ?? 0);
    if (!$id) return null;
    if (!bd_valor('AW', "select count(*) from $tabla where $col = ?", [$id])) error("$nombre ya no existe en el catálogo: vuelve a abrir la ficha.");
    return $id;
}

function relacionesHs(int $id): array
{
    return $id ? bd_filas('AW', 'select id_rel_clientes, id_hubspot, hs_nombre, hs_correo, hs_telefono
                                   from hs_clientes where estatus = 1 and id_easy = ? order by id_rel_clientes', [$id]) : [];
}

function ligarHs(int $id, string $idHs, ?string $nombre, ?string $correo, ?string $tel): void
{
    if (bd_valor('AW', 'select count(*) from hs_clientes where estatus = 1 and id_easy = ? and id_hubspot = ?', [$id, $idHs])) {
        error('Ese contacto de HubSpot ya está relacionado con el cliente.');
    }
    // id_rel_clientes es identity (mismo insert que hs_guarda_rel del escritorio)
    bd_ejecutar('AW', 'insert into hs_clientes (id_easy, id_hubspot, hs_nombre, hs_correo, hs_telefono, estatus) values (?, ?, ?, ?, ?, 1)',
        [$id, $idHs, $nombre === null ? null : mb_substr($nombre, 0, 200), $correo === null ? null : mb_substr($correo, 0, 200),
         $tel === null ? null : mb_substr($tel, 0, 50)]);
}

function guardar(array $d, string $usuario, bool $conMicrosip): array
{
    $id = (int) ($d['id'] ?? 0);
    if ($id) existeCliente($id);

    $empresa  = texto($d['nombre'] ?? '', 200);
    $contacto = texto($d['contacto'] ?? '', 200);
    $telefono = texto($d['telefono'] ?? '', 35);
    $email    = texto($d['email'] ?? '', 200);
    $faltan = [];
    if ($contacto === null) $faltan[] = 'Nombre Contacto';
    if ($empresa === null)  $faltan[] = 'Empresa';
    if ($telefono === null) $faltan[] = 'Teléfono';
    if ($email === null)    $faltan[] = 'E-mail';
    if (!(int) ($d['ciudad_id'] ?? 0)) $faltan[] = 'Ciudad (pestaña Direcciones)';
    if ($faltan) error('Faltan datos obligatorios: ' . implode(', ', $faltan) . '.');
    foreach (preg_split('/[;,\s]+/', $email) as $m) {
        if ($m !== '' && !filter_var($m, FILTER_VALIDATE_EMAIL)) error("El e-mail «{$m}» no es válido.");
    }
    $empresa = mb_strtoupper($empresa);
    // Mismo nombre que otro cliente (misma validación que Easy-Glass)
    if (bd_valor('AW', 'select count(*) from clientes where upper(trim(nombre)) = ? and cliente_id <> ?', [$empresa, $id])) {
        error("Ya existe un cliente con el nombre «{$empresa}».");
    }
    $rfc = texto(mb_strtoupper((string) ($d['rfc'] ?? '')), 18);
    if ($rfc !== null && !preg_match('/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/u', $rfc) && !preg_match('/^[A-Z0-9-]{5,18}$/', $rfc)) {
        error('El RFC no tiene un formato válido.');
    }

    $campos = [
        'nombre'          => $empresa,
        'contacto'        => mb_strtoupper($contacto),
        'telefono'        => $telefono,
        'email'           => $email,
        'rfc'             => $rfc,
        'cond_pago_id'    => idCatalogo($d['cond_pago_id'] ?? 0, 'condiciones_pago', 'cond_pago_id', 'La condición de pago'),
        'tipo_cliente_id' => idCatalogo($d['tipo_cliente_id'] ?? 0, 'tipos_clientes', 'tipo_cliente_id', 'El tipo de cliente'),
        'moneda_id'       => idCatalogo($d['moneda_id'] ?? 0, 'tipos_moneda', 'moneda_id', 'El tipo de moneda'),
        'zona_cliente_id' => idCatalogo($d['zona_cliente_id'] ?? 0, 'zonas_clientes', 'zona_cliente_id', 'La zona de cliente'),
        'sistema_dim_id'  => idCatalogo($d['sistema_dim_id'] ?? 0, 'sistema_dimenciones', 'sistema_dim_id', 'El sistema de dimensiones'),
        'vendedor_id'     => idCatalogo($d['vendedor_id'] ?? 0, 'vendedores_obras', 'vendedor_obra_id', 'El vendedor'),
        'vendedor_campo_id' => idCatalogo($d['vendedor_campo_id'] ?? 0, 'vendedores_obras', 'vendedor_obra_id', 'El vendedor en campo'),
        'direccion'       => texto($d['direccion'] ?? '', 32000, true),
        'referencia'      => texto($d['referencia'] ?? '', 100),
        'ciudad_id'       => idCatalogo($d['ciudad_id'] ?? 0, 'ciudades', 'ciudad_id', 'La ciudad'),
        'codigo_postal'   => texto($d['codigo_postal'] ?? '', 10),
        'condiciones_com' => texto($d['condiciones_com'] ?? '', 32000, true),
    ];
    // Cuenta de Microsip: solo si la ficha la manda (sin la clave, la cuenta se quita)
    if ($conMicrosip && array_key_exists('microsip_clave', $d)) {
        $campos['microsip_clave'] = texto($d['microsip_clave'], 30);
        // Si cambian la clave a mano, el Id de Microsip anterior ya no corresponde
        $antes = $id ? bd_valor('AW', 'select microsip_clave from clientes where cliente_id = ?', [$id]) : null;
        $campos['microsip_cliente_id'] = $campos['microsip_clave'] === null || $campos['microsip_clave'] !== $antes
            ? null : ((int) ($d['microsip_cliente_id'] ?? 0) ?: null);
        if ($campos['microsip_cliente_id'] &&($otro = bd_valor('AW', 'select nombre from clientes where microsip_cliente_id = ? and cliente_id <> ?',
                [$campos['microsip_cliente_id'], $id]))) {
            error("Esa cuenta de Microsip ya es del cliente «{$otro}».");
        }
    }

    if ($id) {
        bd_ejecutar('AW', 'update clientes set ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($campos)))
            . ' where cliente_id = ?', array_merge(array_values($campos), [$id]));
    } else {
        $pdo = bd_pdo('AW');
        $pdo->beginTransaction();
        try {
            // La clave visible sale del consecutivo clave_clientes_consec
            $campos['clave_cliente']   = (string) bd_folio('AW', 'clave_clientes_consec');
            $campos['fecha_creacion']  = date('Y-m-d H:i:s');
            $campos['usuario_creador'] = $usuario;
            $campos['estatus']         = 'A';
            $id = bd_insertar('AW', 'clientes', 'cliente_id', $campos);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }
    return ['id' => $id, 'clave' => (string) bd_valor('AW', 'select clave_cliente from clientes where cliente_id = ?', [$id])];
}

// Alta desde el presupuesto: solo con lo que trae Microsip o HubSpot (la ficha se completa después en Catalogos › Clientes)
function altaRapida(array $campos, string $usuario): int
{
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        $campos['clave_cliente']   = (string) bd_folio('AW', 'clave_clientes_consec');
        $campos['fecha_creacion']  = date('Y-m-d H:i:s');
        $campos['usuario_creador'] = $usuario;
        $campos['estatus']         = 'A';
        $id = bd_insertar('AW', 'clientes', 'cliente_id', $campos);
        $pdo->commit();
        return $id;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

// Columnas del buscador del presupuesto: el cliente con su cuenta de Microsip y cuántos contactos de HubSpot tiene
function selectBuscador(bool $conMicrosip): string
{
    return 'select a.cliente_id, a.clave_cliente, a.nombre, a.contacto, a.telefono, a.email'
        . ($conMicrosip ? ', a.microsip_clave, a.microsip_cliente_id' : ', null as microsip_clave, null as microsip_cliente_id') . ',
               (select count(*) from hs_clientes h where h.estatus = 1 and h.id_easy = a.cliente_id) as hubspot
          from clientes a ';
}

function filaBuscador(array $f): array
{
    return ['id' => (int) $f['cliente_id'], 'hubspot' => (int) $f['hubspot']] + $f;
}

try {
    switch ($accion) {
        case 'listar':
            responder(['ok' => true, 'puede_modificar' => $puedeModificar, 'filas' => array_map(fn($f) => ['id' => (int) $f['cliente_id']] + $f,
                bd_filas('AW', 'select a.cliente_id, a.clave_cliente, a.nombre, a.contacto, a.telefono, a.email, c.nombre as ciudad, v.nombre as vendedor'
                                . ($conMicrosip ? ', a.microsip_clave' : '') . '
                                  from clientes a
                                  left join ciudades c on c.ciudad_id = a.ciudad_id
                                  left join vendedores_obras v on v.vendedor_obra_id = a.vendedor_id
                                 order by a.nombre'))]);

        case 'ficha':
            $id = (int) ($_GET['id'] ?? 0);
            $r = [
                'ok' => true,
                'puede_modificar' => $puedeModificar,
                'vendedor_campo'  => true,
                'microsip'        => $conMicrosip,
                'registro' => null,
                'relaciones_hs' => relacionesHs($id),
                'condiciones_pago' => bd_filas('AW', 'select cond_pago_id as id, nombre from condiciones_pago order by nombre'),
                'tipos_cliente'    => bd_filas('AW', 'select tipo_cliente_id as id, nombre from tipos_clientes order by nombre'),
                'monedas'          => bd_filas('AW', 'select moneda_id as id, nombre from tipos_moneda order by moneda_id'),
                'zonas'            => bd_filas('AW', 'select zona_cliente_id as id, nombre from zonas_clientes order by nombre'),
                'sistemas_dim'     => bd_filas('AW', 'select sistema_dim_id as id, nombre, udm from sistema_dimenciones order by sistema_dim_id'),
                'vendedores'       => bd_filas('AW', "select vendedor_obra_id as id, nombre from vendedores_obras where coalesce(estatus, 'A') = 'A' order by nombre"),
                'ciudades'         => bd_filas('AW', 'select ciudad_id as id, nombre from ciudades order by nombre'),
            ];
            if ($id) {
                $r['registro'] = bd_fila('AW', 'select cliente_id, clave_cliente, nombre, contacto, telefono, email, rfc, cond_pago_id, tipo_cliente_id,
                                                       moneda_id, zona_cliente_id, sistema_dim_id, vendedor_id, direccion, referencia, ciudad_id,
                                                       codigo_postal, condiciones_com, coalesce(impuesto, 0) as impuesto,
                                                       coalesce(total_impuesto, 0) as total_impuesto, fecha_creacion, usuario_creador,
                                                       vendedor_campo_id' . ($conMicrosip ? ', microsip_clave, microsip_cliente_id' : '') . '
                                                  from clientes where cliente_id = ?', [$id]);
                if (!$r['registro']) error('El cliente ya no existe (¿lo eliminaron?).', 404);
            } else {
                // Siguiente clave sin consumirla (se confirma al guardar)
                $r['clave_siguiente'] = (string) bd_valor('AW', 'select last_value + case when is_called then 1 else 0 end from clave_clientes_consec');
            }
            responder($r);

        case 'historial':
            // Presupuestos de obra del cliente: por su id o, en los capturados a mano, por el nombre de la empresa
            $id = (int) ($_GET['id'] ?? 0);
            existeCliente($id);
            $empresa = (string) bd_valor('AW', 'select nombre from clientes where cliente_id = ?', [$id]);
            responder(['ok' => true, 'filas' => bd_filas('AW',
                "select s.docto_sugerido_obra_id, s.folio, s.fecha, s.estatus, v.nombre as vendedor, s.total as importe_con_iva,
                        s.subtotal as importe_sin_iva, '$' as moneda
                   from doctos_sugerido_obra s
                   left join vendedores_obras v on v.vendedor_obra_id = s.vendedor_obra_id
                  where (s.cliente_id = ? or upper(trim(s.cliente)) = ?) and s.fecha between ? and ?
                  order by s.fecha desc, s.folio desc",
                [$id, $empresa, fechaParam('ini', date('Y-m-d', strtotime('-1 year'))), fechaParam('fin', date('Y-m-d'))])]);

        case 'guardar':
            responder(['ok' => true] + guardar(entrada(), $usuario, $conMicrosip));

        case 'impuesto':
            $d = entrada();
            $id = (int) ($d['id'] ?? 0);
            existeCliente($id);
            $tipo = (int) ($d['impuesto'] ?? 0);
            $total = $d['total_impuesto'] ?? 0;
            if ($total !== '' && !is_numeric($total)) error('El impuesto debe ser un número.');
            $total = round((float) $total, 2);
            if ($total < 0 || $total > 100) error('El impuesto debe estar entre 0 y 100 %.');
            bd_ejecutar('AW', 'update clientes set impuesto = ?, total_impuesto = ? where cliente_id = ?', [$tipo, $total, $id]);
            responder(['ok' => true]);

        case 'eliminar':
            $id = (int) (entrada()['id'] ?? 0);
            existeCliente($id);
            $n = (int) bd_valor('AW', 'select count(*) from doctos_sugerido_obra where cliente_id = ?', [$id]);
            if ($n) error("El cliente tiene $n presupuesto(s) de obra y no se puede eliminar.");
            bd_ejecutar('AW', 'update hs_clientes set estatus = 0 where id_easy = ?', [$id]);
            bd_ejecutar('AW', 'delete from clientes where cliente_id = ?', [$id]);
            responder(['ok' => true]);

        case 'hs_asociar':
            $d = entrada();
            $id = (int) ($d['id'] ?? 0);
            existeCliente($id);
            $idHs = preg_replace('/\D/', '', (string) ($d['id_hubspot'] ?? ''));
            if ($idHs === '') error('Selecciona el contacto de HubSpot a relacionar.');
            ligarHs($id, $idHs, texto($d['nombre'] ?? '', 200), texto($d['correo'] ?? '', 200), texto($d['telefono'] ?? '', 50));
            responder(['ok' => true, 'relaciones_hs' => relacionesHs($id)]);

        case 'hs_quitar':
            $d = entrada();
            $id = (int) ($d['id'] ?? 0);
            bd_ejecutar('AW', 'update hs_clientes set estatus = 0 where id_rel_clientes = ? and id_easy = ?', [(int) ($d['id_rel'] ?? 0), $id]);
            responder(['ok' => true, 'relaciones_hs' => relacionesHs($id)]);

        case 'hs_registrar':
            $d = entrada();
            $id = (int) ($d['id'] ?? 0);
            existeCliente($id);
            $nombre = texto($d['nombre'] ?? '', 200);
            $correo = texto($d['correo'] ?? '', 200);
            $tel    = texto($d['telefono'] ?? '', 50);
            if ($nombre === null || $correo === null) error('Captura al menos el nombre y el correo del contacto.');
            if (!filter_var($correo, FILTER_VALIDATE_EMAIL)) error('El correo no es válido.');
            $partes = explode(' ', $nombre, 2);
            $empresa = (string) bd_valor('AW', 'select nombre from clientes where cliente_id = ?', [$id]);
            $hs = api_http('HUBSPOT_API', 'POST', '/crm/v3/objects/contacts', ['properties' => array_filter([
                'firstname' => $partes[0], 'lastname' => $partes[1] ?? '', 'email' => $correo, 'phone' => $tel, 'company' => $empresa,
            ], fn($v) => $v !== null && $v !== '')]);
            if (!$hs['ok']) {
                $msg = is_array($hs['datos']) && isset($hs['datos']['message']) ? $hs['datos']['message'] : $hs['error'];
                if ($hs['codigo'] === 409) $msg = 'ya existe un contacto con ese correo; búscalo y usa «Asociar Contacto».';
                error('HubSpot: ' . $msg, 502);
            }
            ligarHs($id, (string) $hs['datos']['id'], $nombre, $correo, $tel);
            responder(['ok' => true, 'relaciones_hs' => relacionesHs($id)]);
        case 'buscar':
            $q = mb_strtoupper(trim((string) ($_GET['q'] ?? '')));
            $filtro = '';
            $params = [];
            if ($q !== '') {
                $like = '%' . addcslashes($q, '\\%_') . '%';
                $cols = ['a.nombre', 'a.contacto', 'a.email', 'a.clave_cliente'];
                if ($conMicrosip) $cols[] = 'a.microsip_clave';
                $filtro = 'where ' . implode(' or ', array_map(fn($c) => "upper(coalesce($c, '')) like ?", $cols));
                $params = array_fill(0, count($cols), $like);
            }
            responder(['ok' => true, 'microsip' => $conMicrosip, 'puede_modificar' => $puedeModificar,
                'filas' => array_map('filaBuscador', bd_filas('AW', selectBuscador($conMicrosip) . $filtro . ' order by a.nombre limit 20', $params))]);

        case 'microsip_buscar':   // la clave de Easy-Glass es la cuenta del cliente en Microsip
            if (!$conMicrosip) error('Falta ligar el catálogo con Microsip: aplica la migración 022_clientes_microsip.sql.', 503);
            $q = trim((string) ($_GET['q'] ?? ''));
            if (mb_strlen($q) < 2) error('Escribe al menos 2 letras de la clave o el nombre.');
            $r = api_http('EASYGLASS', 'GET', '/clientes?activos=1&q=' . rawurlencode($q));
            if (!$r['ok']) error('No se pudo consultar Microsip en la API de Easy-Glass: ' . ($r['error'] ?: 'sin respuesta'), 502);
            $filas = array_slice((array) ($r['datos']['datos'] ?? []), 0, 30);
            $ids = array_values(array_filter(array_map(fn($c) => (int) ($c['cliente_id'] ?? 0), $filas)));
            $ligados = $ids ? array_column(bd_filas('AW', 'select microsip_cliente_id, nombre from clientes where microsip_cliente_id in ('
                . implode(',', array_fill(0, count($ids), '?')) . ')', $ids), 'nombre', 'microsip_cliente_id') : [];
            responder(['ok' => true, 'filas' => array_map(fn($c) => [
                'cliente_id' => (int) ($c['cliente_id'] ?? 0), 'clave' => (string) ($c['clave_cliente'] ?? ''), 'nombre' => $c['nombre'] ?? '',
                'contacto' => $c['contacto'] ?? '', 'telefono' => $c['telefono'] ?? '', 'vendedor' => $c['vendedor'] ?? '',
                'en_catalogo' => $ligados[(int) ($c['cliente_id'] ?? 0)] ?? null,
            ], $filas)]);

        case 'microsip_importar':
            if (!$conMicrosip) error('Falta ligar el catálogo con Microsip: aplica la migración 022_clientes_microsip.sql.', 503);
            $d = entrada();
            $msId = (int) ($d['cliente_id'] ?? 0);
            $nombre = texto($d['nombre'] ?? '', 200);
            if (!$msId || $nombre === null) error('Selecciona la cuenta de Microsip.');
            $nombre = mb_strtoupper($nombre);
            $clave = texto($d['clave'] ?? '', 30);
            // Ya en el catálogo por su cuenta de Microsip, o con el mismo nombre y sin cuenta todavía: se liga
            $id = (int) bd_valor('AW', 'select cliente_id from clientes where microsip_cliente_id = ?', [$msId]);
            if (!$id && ($f = bd_fila('AW', 'select cliente_id, microsip_cliente_id from clientes where upper(trim(nombre)) = ?', [$nombre]))) {
                if ($f['microsip_cliente_id']) error("El cliente «{$nombre}» ya está ligado a otra cuenta de Microsip.");
                $id = (int) $f['cliente_id'];
                bd_ejecutar('AW', 'update clientes set microsip_cliente_id = ?, microsip_clave = ? where cliente_id = ?', [$msId, $clave, $id]);
            }
            if (!$id) {
                $contacto = texto($d['contacto'] ?? '', 200);
                $id = altaRapida(['nombre' => $nombre, 'contacto' => $contacto === null ? null : mb_strtoupper($contacto),
                    'telefono' => texto($d['telefono'] ?? '', 35), 'microsip_cliente_id' => $msId, 'microsip_clave' => $clave], $usuario);
            }
            responder(['ok' => true, 'cliente' => filaBuscador(bd_fila('AW', selectBuscador($conMicrosip) . 'where a.cliente_id = ?', [$id]))]);

        case 'alta_hubspot':   // cliente nuevo: se da de alta con su contacto de HubSpot y queda relacionado
            $d = entrada();
            $idHs = preg_replace('/\D/', '', (string) ($d['id_hubspot'] ?? ''));
            $contacto = texto($d['contacto'] ?? '', 200);
            $nombre = texto($d['empresa'] ?? '', 200) ?? $contacto;
            if ($idHs === '' || $nombre === null) error('Selecciona el contacto de HubSpot.');
            $nombre = mb_strtoupper($nombre);
            $correo = texto($d['correo'] ?? '', 200);
            $tel = texto($d['telefono'] ?? '', 35);
            // Si el contacto ya está relacionado, o hay un cliente con ese nombre, se usa ese
            $id = (int) bd_valor('AW', 'select id_easy from hs_clientes where estatus = 1 and id_hubspot = ? order by id_rel_clientes limit 1', [$idHs])
               ?: (int) bd_valor('AW', 'select cliente_id from clientes where upper(trim(nombre)) = ?', [$nombre]);
            if (!$id) {
                $id = altaRapida(['nombre' => $nombre, 'contacto' => $contacto === null ? null : mb_strtoupper($contacto),
                    'telefono' => $tel, 'email' => $correo], $usuario);
            }
            if (!bd_valor('AW', 'select count(*) from hs_clientes where estatus = 1 and id_easy = ? and id_hubspot = ?', [$id, $idHs])) {
                ligarHs($id, $idHs, $contacto, $correo, $tel);
            }
            responder(['ok' => true, 'cliente' => filaBuscador(bd_fila('AW', selectBuscador($conMicrosip) . 'where a.cliente_id = ?', [$id]))]);
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/clientes: ' . $e->getMessage());
    error('No se pudo completar: ' . bd_mensaje_error($e), 500);
}
