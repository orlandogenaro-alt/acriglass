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
if (!in_array($accion, ['listar', 'ficha', 'historial'], true)) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
    exigirCsrf();
    exigirPermiso(...PERMISOS_CLIENTES);
}
$puedeModificar = tienePermiso(...PERMISOS_CLIENTES);
$usuario = mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50);
session_write_close();

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

function guardar(array $d, string $usuario): array
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

try {
    switch ($accion) {
        case 'listar':
            responder(['ok' => true, 'puede_modificar' => $puedeModificar, 'filas' => array_map(fn($f) => ['id' => (int) $f['cliente_id']] + $f,
                bd_filas('AW', 'select a.cliente_id, a.clave_cliente, a.nombre, a.contacto, a.telefono, a.email, c.nombre as ciudad, v.nombre as vendedor
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
                                                       vendedor_campo_id
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
            responder(['ok' => true] + guardar(entrada(), $usuario));

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
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/clientes: ' . $e->getMessage());
    error('No se pudo completar: ' . bd_mensaje_error($e), 500);
}
