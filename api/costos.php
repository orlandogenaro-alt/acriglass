<?php
// Parámetros de costos (migraciones/005_tipo_cambio_fasar_costo_horario.sql; solo Supabase)
// GET  ?accion=datos               tipo de cambio vigente e historial, FASAR (lista con sus datos)
// POST ?accion=tc_guardar          {fecha, tipo_cambio}                 captura del tipo de cambio USD
// POST ?accion=tc_banxico                                               trae el dólar FIX de Banxico (servicio BANXICO)
// POST ?accion=fasar_guardar       {id, nombre, dias_calendario, dias_pagados[], dias_no_laborados[], obligaciones[], notas, activo}
// POST ?accion=fasar_eliminar      {id}   solo si ninguna mano de obra lo usa
// Al guardar un FASAR, la mano de obra ligada a él toma su FSR nuevo.
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/bd.php';
require __DIR__ . '/../includes/servicios.php';
require __DIR__ . '/../includes/pu.php';
require __DIR__ . '/../includes/respuesta.php';

if (modoConfiguracion()) error('Modo configuración: aún no hay conexión a la base.', 503);
exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_SUGERIDO_OBRA', 'MODIFICAR_SUGERIDO_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA',
    'CATALOGO_INSUMOS', 'PRECIOS_INSUMOS', 'ADMIN_USER');
$accion = $_GET['accion'] ?? 'datos';
if ($accion !== 'datos') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
    exigirCsrf();
}
$puedeTc = tienePermiso('PRECIOS_INSUMOS', 'ADMIN_USER');
$puedeFasar = tienePermiso('CATALOGO_INSUMOS', 'ADMIN_USER');
session_write_close();

if (!bd_tiene_tabla('AW', 'fasar')) {
    error('Los parámetros de costos aún no están en la base: aplica migraciones/005_tipo_cambio_fasar_costo_horario.sql (php herramientas/migrar.php --aplicar).', 503);
}

function usuarioActual(): string
{
    return mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50);
}

function texto($v, int $largo): ?string
{
    $v = trim(preg_replace('/\s+/u', ' ', (string) ($v ?? '')));
    return $v === '' ? null : mb_substr($v, 0, $largo);
}

function guardarTc(string $fecha, float $tc, string $fuente): array
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) error('Captura la fecha del tipo de cambio.');
    if ($fecha > date('Y-m-d')) error('La fecha del tipo de cambio no puede ser futura.');
    if ($tc <= 0 || $tc > 1000) error('El tipo de cambio debe ser mayor que cero.');
    bd_insertar('AW', 'tipos_cambio', 'tipo_cambio_id', [
        'moneda' => 'USD', 'fecha' => $fecha, 'tipo_cambio' => round($tc, 6), 'fuente' => $fuente, 'usuario' => usuarioActual(),
    ]);
    return ['fecha' => $fecha, 'tipo_cambio' => $tc];
}

// Dólar FIX (serie SF43718) del último día publicado. Respuesta: {bmx: {series: [{datos: [{fecha: 'dd/mm/aaaa', dato: '18.2500'}]}]}}
function banxico(): array
{
    $r = api_http('BANXICO', 'GET', 'SF43718/datos/oportuno');
    if (!$r['ok']) error('Banxico no respondió: ' . ($r['error'] ?: 'HTTP ' . $r['codigo']) . '. Revisa el token en Administrador › APIs y servicios.', 502);
    $dato = $r['datos']['bmx']['series'][0]['datos'][0] ?? null;
    if (!$dato || !preg_match('#^(\d{2})/(\d{2})/(\d{4})$#', (string) ($dato['fecha'] ?? ''), $m) || !is_numeric(str_replace(',', '', (string) ($dato['dato'] ?? '')))) {
        error('Banxico respondió sin un tipo de cambio válido.', 502);
    }
    $fecha = "{$m[3]}-{$m[2]}-{$m[1]}";
    $tc = (float) str_replace(',', '', (string) $dato['dato']);
    // Ya registrado ese día por Banxico: no se repite
    if (bd_valor('AW', "select count(*) from tipos_cambio where moneda = 'USD' and fecha = ? and fuente = 'banxico' and tipo_cambio = ?", [$fecha, $tc])) {
        return ['fecha' => $fecha, 'tipo_cambio' => $tc, 'repetido' => true];
    }
    return guardarTc($fecha, $tc, 'banxico');
}

// true si el servicio BANXICO existe, está activo y tiene token (capturado o API_BANXICO_TOKEN)
function banxicoListo(): bool
{
    try {
        $s = api_config('BANXICO');
        return !empty($s['activa']) && ($s['credencial'] ?? '') !== '';
    } catch (Throwable $e) {
        return false;
    }
}

// Renglones [{concepto, valor}] válidos de una lista del FASAR
function renglones($lista, string $campo, string $que): array
{
    $r = [];
    foreach (is_array($lista) ? $lista : [] as $f) {
        $concepto = texto($f['concepto'] ?? '', 100);
        $valor = $f[$campo] ?? '';
        if ($concepto === null && ($valor === '' || $valor === null)) continue;
        if ($concepto === null) error("Hay un renglón de $que sin concepto.");
        if (!is_numeric($valor) || (float) $valor < 0) error("«{$concepto}» ($que) debe ser un número de 0 en adelante.");
        $r[] = ['concepto' => $concepto, $campo => round((float) $valor, 4)];
    }
    return $r;
}

function guardarFasar(array $d): array
{
    $id = (int) ($d['id'] ?? 0);
    if ($id && !bd_valor('AW', 'select count(*) from fasar where fasar_id = ?', [$id])) error('El FASAR ya no existe.', 404);
    $nombre = texto($d['nombre'] ?? '', 100);
    if ($nombre === null) error('Captura el nombre del FASAR (p. ej. «Instaladores 2026»).');
    if (bd_valor('AW', 'select count(*) from fasar where upper(trim(nombre)) = ? and fasar_id <> ?', [mb_strtoupper($nombre), $id])) {
        error("Ya existe un FASAR con el nombre «{$nombre}».");
    }
    if (!is_numeric($d['dias_calendario'] ?? '')) error('Captura los días calendario.');
    $pagados = renglones($d['dias_pagados'] ?? [], 'dias', 'días pagados');
    $noLab = renglones($d['dias_no_laborados'] ?? [], 'dias', 'días no laborados');
    $oblig = renglones($d['obligaciones'] ?? [], 'pct', 'obligaciones');
    try {
        $c = puFsr((float) $d['dias_calendario'], $pagados, $noLab, $oblig);
    } catch (InvalidArgumentException $e) {
        error($e->getMessage());
    }
    if ($c['fsr'] >= 10) error('El FSR que resulta es de 10 o más: revisa los datos.');
    $campos = [
        'nombre' => $nombre, 'dias_calendario' => round((float) $d['dias_calendario'], 2),
        'dias_pagados' => json_encode($pagados, JSON_UNESCAPED_UNICODE), 'dias_no_laborados' => json_encode($noLab, JSON_UNESCAPED_UNICODE),
        'obligaciones' => json_encode($oblig, JSON_UNESCAPED_UNICODE),
        'tp' => $c['tp'], 'tl' => $c['tl'], 'ps' => $c['ps'], 'fsr' => $c['fsr'],
        'notas' => texto($d['notas'] ?? '', 4000), 'estatus' => !empty($d['activo']) ? 'A' : 'B',
        'fecha_mod' => date('c'), 'usuario_mod' => usuarioActual(),
    ];
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        if ($id) {
            bd_ejecutar('AW', 'update fasar set ' . implode(', ', array_map(fn($k) => in_array($k, ['dias_pagados', 'dias_no_laborados', 'obligaciones'], true)
                ? "$k = cast(? as jsonb)" : "$k = ?", array_keys($campos))) . ' where fasar_id = ?', array_merge(array_values($campos), [$id]));
        } else {
            $id = (int) bd_valor('AW', 'insert into fasar (' . implode(', ', array_keys($campos)) . ') values ('
                . implode(', ', array_map(fn($k) => in_array($k, ['dias_pagados', 'dias_no_laborados', 'obligaciones'], true) ? 'cast(? as jsonb)' : '?', array_keys($campos)))
                . ') returning fasar_id', array_values($campos));
        }
        // La mano de obra ligada toma el FSR nuevo
        $n = bd_ejecutar('AW', "update insumos set fsr = ? where fasar_id = ? and tipo = 'MO' and fsr <> ?", [$c['fsr'], $id, $c['fsr']]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['id' => $id, 'fsr' => $c['fsr'], 'insumos_actualizados' => $n];
}

try {
    switch ($accion) {
        case 'datos':
            $fasar = bd_filas('AW', 'select f.*, (select count(*) from insumos i where i.fasar_id = f.fasar_id) as insumos from fasar f order by f.nombre');
            foreach ($fasar as &$f) {
                foreach (['dias_pagados', 'dias_no_laborados', 'obligaciones'] as $k) $f[$k] = json_decode((string) $f[$k], true) ?: [];
            }
            unset($f);
            responder(['ok' => true, 'puede_tc' => $puedeTc, 'puede_fasar' => $puedeFasar,
                'banxico' => banxicoListo(),
                'tc_vigente' => puTiposCambio()['USD'] ?? null,
                'tc_historial' => bd_filas('AW', "select fecha, tipo_cambio, fuente, usuario from tipos_cambio where moneda = 'USD'
                                                   order by fecha desc, tipo_cambio_id desc limit 30"),
                'fasar' => $fasar]);
        case 'tc_guardar':
            if (!$puedeTc) error('No tienes el permiso para capturar precios ni tipo de cambio (PRECIOS_INSUMOS).', 403);
            $d = entrada();
            if (!is_numeric($d['tipo_cambio'] ?? '')) error('Captura el tipo de cambio.');
            responder(['ok' => true] + guardarTc((string) ($d['fecha'] ?? ''), (float) $d['tipo_cambio'], 'captura'));
        case 'tc_banxico':
            if (!$puedeTc) error('No tienes el permiso para capturar precios ni tipo de cambio (PRECIOS_INSUMOS).', 403);
            responder(['ok' => true] + banxico());
        case 'fasar_guardar':
            if (!$puedeFasar) error('No tienes el permiso para cambiar el catálogo de insumos (CATALOGO_INSUMOS).', 403);
            responder(['ok' => true] + guardarFasar(entrada()));
        case 'fasar_eliminar':
            if (!$puedeFasar) error('No tienes el permiso para cambiar el catálogo de insumos (CATALOGO_INSUMOS).', 403);
            $id = (int) (entrada()['id'] ?? 0);
            if (bd_valor('AW', 'select count(*) from insumos where fasar_id = ?', [$id])) {
                error('Hay mano de obra ligada a este FASAR: cámbiala de FASAR o desactívalo.');
            }
            bd_ejecutar('AW', 'delete from fasar where fasar_id = ?', [$id]);
            responder(['ok' => true]);
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/costos: ' . $e->getMessage());
    error('No se pudo completar: ' . bd_mensaje_error($e), 500);
}
