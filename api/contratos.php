<?php
// Contrato de obra y convenios (migraciones/009; solo Supabase)
// GET  ?accion=datos&obra=N              obra, contrato (o la propuesta de uno nuevo), convenios y cifras vigentes
// POST ?accion=guardar_contrato          {obra, numero, fechas, monto, iva_pct, moneda, tipo_cambio, %…, estatus}
// POST ?accion=guardar_convenio          {contrato, id?, tipo, numero, fecha, descripcion, monto, dias}   queda pendiente
// POST ?accion=resolver_convenio         {id, decision: autorizar|rechazar, comentario}
// POST ?accion=cancelar_convenio         {id}   solo pendientes
// El monto se captura solo en borrador; ya vigente, los cambios van como convenios. Cada cambio de monto
// queda en el libro de movimientos de la obra (ingreso «contratado»).
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/bd.php';
require __DIR__ . '/../includes/contratos.php';
require __DIR__ . '/../includes/respuesta.php';

if (modoConfiguracion()) error('Modo configuración: aún no hay conexión a la base.', 503);
exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'CERRAR_OBRA', 'AUTORIZAR_CONVENIOS', 'ADMIN_USER');
$accion = $_GET['accion'] ?? 'datos';
if ($accion !== 'datos') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
    exigirCsrf();
}
$puedeModificar = tienePermiso('MODIFICAR_OBRA', 'ADMIN_USER');
$puedeAutorizar = tienePermiso('AUTORIZAR_CONVENIOS', 'ADMIN_USER');
$esAdmin = tienePermiso('ADMIN_USER');
session_write_close();

if (!bd_tiene_tabla('AW', 'contratos_obra')) {
    error('Los contratos aún no están en la base: aplica migraciones/009_contratos_convenios.sql (php herramientas/migrar.php --aplicar).', 503);
}

function usuarioActual(): string { return mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50); }
function texto($v, int $largo): ?string { $v = trim((string) ($v ?? '')); return $v === '' ? null : mb_substr($v, 0, $largo); }
function fechaValida($v): ?string { return preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $v) ? $v : null; }
function pctValido($v, string $que): float
{
    if ($v === '' || $v === null) return 0.0;
    if (!is_numeric($v) || (float) $v < 0 || (float) $v > 100) error("$que debe ser de 0 a 100 %.");
    return round((float) $v, 4);
}

function obraDatos(int $obra): array
{
    $o = bd_fila('AW', 'select o.obra_id, o.nom_obra, o.estatus, o.sugerido_id, o.fecha_ini, o.fecha_fin, d.folio, d.cliente, d.subtotal, d.total
                          from reg_obras o left join doctos_sugerido_obra d on d.docto_sugerido_obra_id = o.sugerido_id
                         where o.obra_id = ?', [$obra]);
    if (!$o) error('La obra ya no existe.', 404);
    return $o;
}

function contratoDe(int $obra): ?array
{
    return bd_fila('AW', "select * from contratos_obra where obra_id = ? and estatus <> 'cancelado' order by contrato_id desc limit 1", [$obra]);
}

function movimientoContrato(array $c, string $origen, int $id, string $concepto): array
{
    return ['obra_id' => (int) $c['obra_id'], 'naturaleza' => 'ingreso', 'clase' => 'contratado', 'origen_tipo' => $origen, 'origen_id' => $id,
            'iva_pct' => (float) $c['iva_pct'], 'moneda' => trim($c['moneda']), 'tipo_cambio' => (float) $c['tipo_cambio'], 'concepto' => $concepto];
}

// Propuesta de un contrato nuevo: monto e IVA de la última versión aprobada del presupuesto (o del presupuesto actual)
function propuesta(array $o): array
{
    $p = ['numero' => 'CTO-' . $o['obra_id'], 'monto' => (float) ($o['subtotal'] ?? 0), 'iva_pct' => 16.0, 'version_id' => null, 'origen' => 'presupuesto actual',
          'fecha_inicio' => $o['fecha_ini'], 'fecha_termino' => $o['fecha_fin']];
    if ($o['sugerido_id'] && bd_tiene_columna('AW', 'doctos_sugerido_obra', 'iva_pct')) {
        $p['iva_pct'] = (float) bd_valor('AW', 'select iva_pct from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$o['sugerido_id']]);
    }
    if ($o['sugerido_id'] && bd_tiene_tabla('AW', 'presupuesto_versiones')) {
        $v = bd_fila('AW', "select version_id, version, snapshot->'encabezado'->>'subtotal' as subtotal, snapshot->'encabezado'->>'iva_pct' as iva_pct
                              from presupuesto_versiones where docto_sugerido_obra_id = ? order by version desc limit 1", [$o['sugerido_id']]);
        if ($v) {
            $p['version_id'] = (int) $v['version_id'];
            $p['origen'] = 'versión aprobada ' . $v['version'];
            if (is_numeric($v['subtotal'])) $p['monto'] = (float) $v['subtotal'];
            if (is_numeric($v['iva_pct'])) $p['iva_pct'] = (float) $v['iva_pct'];
        }
    }
    return $p;
}

function datos(int $obra, bool $puedeModificar, bool $puedeAutorizar): array
{
    $o = obraDatos($obra);
    $c = contratoDe($obra);
    $convenios = $c ? bd_filas('AW', 'select * from convenios_obra where contrato_id = ? order by fecha, convenio_id', [$c['contrato_id']]) : [];
    return ['obra' => $o, 'contrato' => $c, 'propuesta' => $c ? null : propuesta($o), 'convenios' => $convenios,
            'vigente' => $c ? contratoVigente($c, $convenios) : null, 'tipos' => CONTRATO_TIPOS_CONVENIO,
            'puede_modificar' => $puedeModificar, 'puede_autorizar' => $puedeAutorizar, 'usuario' => usuarioActual(),
            'libro' => bd_tiene_tabla('AW', 'obra_movimientos')];
}

function guardarContrato(array $d): array
{
    $obra = (int) ($d['obra'] ?? 0);
    $o = obraDatos($obra);
    if (in_array(trim((string) $o['estatus']), ['Cancelado'], true)) error('La obra está cancelada.');
    $c = contratoDe($obra);
    $estatus = in_array($d['estatus'] ?? '', ['borrador', 'vigente', 'terminado', 'cancelado'], true) ? $d['estatus'] : 'borrador';
    $antes = $c ? trim($c['estatus']) : 'borrador';
    $permitidas = ['borrador' => ['borrador', 'vigente', 'cancelado'], 'vigente' => ['vigente', 'terminado', 'cancelado'], 'terminado' => ['terminado', 'vigente']];
    if (!in_array($estatus, $permitidas[$antes] ?? [], true)) error("Un contrato $antes no puede pasar a $estatus.");
    if (!$c && $estatus === 'cancelado') error('Un contrato nuevo no se registra cancelado.');

    $campos = [
        'numero' => texto($d['numero'] ?? '', 40), 'fecha_firma' => fechaValida($d['fecha_firma'] ?? ''),
        'fecha_inicio' => fechaValida($d['fecha_inicio'] ?? ''), 'fecha_termino' => fechaValida($d['fecha_termino'] ?? ''),
        'anticipo_pct' => pctValido($d['anticipo_pct'] ?? 0, 'El anticipo'), 'fondo_garantia_pct' => pctValido($d['fondo_garantia_pct'] ?? 0, 'El fondo de garantía'),
        'retencion_pct' => pctValido($d['retencion_pct'] ?? 0, 'La retención'), 'retencion_concepto' => texto($d['retencion_concepto'] ?? '', 100),
        'condiciones_pago' => texto($d['condiciones_pago'] ?? '', 4000), 'notas' => texto($d['notas'] ?? '', 4000), 'estatus' => $estatus,
    ];
    if ($campos['numero'] === null) error('Captura el número del contrato.');
    if ($campos['fecha_inicio'] && $campos['fecha_termino'] && $campos['fecha_termino'] < $campos['fecha_inicio']) error('La terminación no puede ser antes del inicio.');
    // Monto, IVA y moneda solo en borrador: ya vigente, los cambios de monto van como convenios
    if ($antes === 'borrador') {
        if (!is_numeric($d['monto'] ?? '') || (float) $d['monto'] < 0) error('Captura el monto del contrato (sin IVA).');
        if (!is_numeric($d['iva_pct'] ?? '') || (float) $d['iva_pct'] < 0 || (float) $d['iva_pct'] >= 100) error('Captura la tasa de IVA.');
        $moneda = ($d['moneda'] ?? 'MXN') === 'USD' ? 'USD' : 'MXN';
        $tc = $moneda === 'USD' ? (float) ($d['tipo_cambio'] ?? 0) : 1.0;
        if ($tc <= 0) error('Captura el tipo de cambio del contrato en dólares.');
        $campos += ['monto' => round((float) $d['monto'], 2), 'iva_pct' => round((float) $d['iva_pct'], 3), 'moneda' => $moneda, 'tipo_cambio' => round($tc, 6)];
        if ($estatus === 'vigente' && $campos['monto'] <= 0) error('Un contrato vigente necesita monto.');
    }
    if ($estatus === 'cancelado' && $c && bd_valor('AW', "select count(*) from convenios_obra where contrato_id = ? and estatus = 'autorizado'", [$c['contrato_id']])) {
        error('El contrato tiene convenios autorizados: no se cancela (termínalo o regístralo como deductiva).');
    }

    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        if ($c) {
            bd_ejecutar('AW', 'update contratos_obra set ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($campos))) . ' where contrato_id = ?',
                array_merge(array_values($campos), [$c['contrato_id']]));
            $id = (int) $c['contrato_id'];
        } else {
            $v = propuesta($o);
            $id = bd_insertar('AW', 'contratos_obra', 'contrato_id', ['obra_id' => $obra, 'version_id' => $v['version_id'], 'usuario_creacion' => usuarioActual()] + $campos);
        }
        $c = bd_fila('AW', 'select * from contratos_obra where contrato_id = ?', [$id]);
        // Libro: vigente o terminado cuenta su monto; borrador o cancelado, nada
        libroAjustar(movimientoContrato($c, 'contrato', $id, 'Contrato ' . $c['numero']), in_array($estatus, ['vigente', 'terminado'], true) ? (float) $c['monto'] : 0.0);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if (strpos($e->getMessage(), 'uq_contratos_obra') !== false) error('La obra ya tiene un contrato.');
        throw $e;
    }
    return ['id' => $id];
}

function guardarConvenio(array $d): array
{
    $c = bd_fila('AW', 'select * from contratos_obra where contrato_id = ?', [(int) ($d['contrato'] ?? 0)]);
    if (!$c) error('El contrato ya no existe.', 404);
    if (trim($c['estatus']) !== 'vigente') error('Los convenios se registran en un contrato vigente.');
    $id = (int) ($d['id'] ?? 0);
    if ($id && trim((string) bd_valor('AW', 'select estatus from convenios_obra where convenio_id = ? and contrato_id = ?', [$id, $c['contrato_id']])) !== 'pendiente') {
        error('Solo se modifica un convenio pendiente.');
    }
    $tipo = $d['tipo'] ?? '';
    if (!isset(CONTRATO_TIPOS_CONVENIO[$tipo])) error('Selecciona el tipo de convenio.');
    $campos = [
        'tipo' => $tipo, 'numero' => texto($d['numero'] ?? '', 40), 'fecha' => fechaValida($d['fecha'] ?? '') ?? date('Y-m-d'),
        'descripcion' => texto($d['descripcion'] ?? '', 8000), 'monto' => contratoMontoConvenio($tipo, (float) ($d['monto'] ?? 0)),
        'dias' => (int) ($d['dias'] ?? 0),
    ];
    if ($campos['numero'] === null) error('Captura el número del convenio.');
    if ($campos['descripcion'] === null) error('Describe el convenio (qué cambia y por qué).');
    if ($tipo !== 'plazo' && $campos['monto'] == 0) error('Captura el monto del convenio (sin IVA).');
    if ($tipo === 'plazo' && !$campos['dias']) error('Captura los días que se mueve la terminación.');
    try {
        if ($id) {
            bd_ejecutar('AW', 'update convenios_obra set ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($campos))) . ' where convenio_id = ?',
                array_merge(array_values($campos), [$id]));
        } else {
            $id = bd_insertar('AW', 'convenios_obra', 'convenio_id', ['contrato_id' => $c['contrato_id'], 'solicitado_por' => usuarioActual()] + $campos);
        }
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'uq_convenio_numero') !== false) error("Ya hay un convenio con el número {$campos['numero']}.");
        throw $e;
    }
    return ['id' => $id];
}

function resolverConvenio(array $d, bool $esAdmin): array
{
    $v = bd_fila('AW', 'select v.*, c.obra_id, c.iva_pct, c.moneda, c.tipo_cambio, c.estatus as estatus_contrato
                          from convenios_obra v join contratos_obra c on c.contrato_id = v.contrato_id where v.convenio_id = ?', [(int) ($d['id'] ?? 0)]);
    if (!$v) error('El convenio ya no existe.', 404);
    if (trim($v['estatus']) !== 'pendiente') error('El convenio ya se resolvió.');
    if (trim($v['estatus_contrato']) !== 'vigente') error('El contrato ya no está vigente.');
    // Quien lo solicitó no lo autoriza (salvo un administrador)
    if (!$esAdmin && strcasecmp(trim((string) $v['solicitado_por']), usuarioActual()) === 0) error('Un convenio lo autoriza un usuario distinto al que lo registró.');
    $decision = ($d['decision'] ?? '') === 'autorizar' ? 'autorizado' : (($d['decision'] ?? '') === 'rechazar' ? 'rechazado' : null);
    if (!$decision) error('Indica si se autoriza o se rechaza.');
    $comentario = texto($d['comentario'] ?? '', 4000);
    if ($decision === 'rechazado' && $comentario === null) error('Escribe por qué se rechaza.');
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        bd_ejecutar('AW', 'update convenios_obra set estatus = ?, resuelto_por = ?, fecha_resolucion = ?, comentario = ? where convenio_id = ?',
            [$decision, usuarioActual(), date('c'), $comentario, $v['convenio_id']]);
        if ($decision === 'autorizado') {
            libroAjustar(movimientoContrato($v, 'convenio', (int) $v['convenio_id'], CONTRATO_TIPOS_CONVENIO[$v['tipo']] . ' ' . $v['numero']), (float) $v['monto']);
        }
        if (bd_tiene_tabla('AW', 'autorizaciones')) {
            bd_insertar('AW', 'autorizaciones', 'autorizacion_id', [
                'documento_tipo' => 'convenio', 'documento_id' => (int) $v['convenio_id'], 'accion' => 'AUTORIZAR_CONVENIOS',
                'estatus' => $decision === 'autorizado' ? 'aprobada' : 'rechazada', 'solicitada_por' => (string) $v['solicitado_por'],
                'fecha_solicitud' => date('c', strtotime((string) $v['fecha_solicitud'])), 'resuelta_por' => usuarioActual(), 'fecha_resolucion' => date('c'),
                'comentario' => $comentario, 'datos' => json_encode(['tipo' => $v['tipo'], 'monto' => (float) $v['monto'], 'dias' => (int) $v['dias']]),
            ]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['estatus' => $decision];
}

try {
    switch ($accion) {
        case 'datos':
            responder(['ok' => true] + datos((int) ($_GET['obra'] ?? 0), $puedeModificar, $puedeAutorizar));
        case 'guardar_contrato':
            if (!$puedeModificar) error('No tienes el permiso para «Modificar obras».', 403);
            responder(['ok' => true] + guardarContrato(entrada()));
        case 'guardar_convenio':
            if (!$puedeModificar) error('No tienes el permiso para «Modificar obras».', 403);
            responder(['ok' => true] + guardarConvenio(entrada()));
        case 'resolver_convenio':
            if (!$puedeAutorizar) error('No tienes el permiso para autorizar convenios (AUTORIZAR_CONVENIOS).', 403);
            responder(['ok' => true] + resolverConvenio(entrada(), $esAdmin));
        case 'cancelar_convenio':
            if (!$puedeModificar) error('No tienes el permiso para «Modificar obras».', 403);
            $n = bd_ejecutar('AW', "update convenios_obra set estatus = 'cancelado', resuelto_por = ?, fecha_resolucion = ? where convenio_id = ? and estatus = 'pendiente'",
                [usuarioActual(), date('c'), (int) (entrada()['id'] ?? 0)]);
            if (!$n) error('Solo se cancela un convenio pendiente.');
            responder(['ok' => true]);
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/contratos: ' . $e->getMessage());
    error('No se pudo guardar: ' . bd_mensaje_error($e), 500);
}
