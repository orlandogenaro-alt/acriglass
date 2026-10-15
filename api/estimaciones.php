<?php
// Catálogo del contrato y estimaciones de la obra (migraciones/011; solo Supabase)
// GET  ?accion=datos&obra=N          contrato, catálogo con lo estimado por concepto, estimaciones y anticipo
// POST ?accion=generar_catalogo      {contrato}   una sola vez: conceptos con P.U. de la versión aprobada
// POST ?accion=guardar               {contrato, id?, tipo, fecha, periodo_ini, periodo_fin, notas, importe (anticipo),
//                                     conceptos: [{contrato_concepto_id, cantidad}]}    solo en borrador
// POST ?accion=estatus               {id, accion: autorizar|facturar|cobrar|cancelar, folio_factura?, fecha?}
// Las cifras las calcula el servidor (includes/estimaciones.php). Cada operación aparta el contrato
// (update … where contrato_id) para que dos usuarios a la vez no se pasen de lo contratado.
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/bd.php';
require __DIR__ . '/../includes/conceptos.php';
require __DIR__ . '/../includes/contratos.php';
require __DIR__ . '/../includes/estimaciones.php';
require __DIR__ . '/../includes/respuesta.php';

if (modoConfiguracion()) error('Modo configuración: aún no hay conexión a la base.', 503);
exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'CERRAR_OBRA', 'AUTORIZAR_ESTIMACIONES', 'ADMIN_USER');
$accion = $_GET['accion'] ?? 'datos';
if ($accion !== 'datos') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
    exigirCsrf();
}
$puedeModificar = tienePermiso('MODIFICAR_OBRA', 'ADMIN_USER');
$puedeAutorizar = tienePermiso('AUTORIZAR_ESTIMACIONES', 'ADMIN_USER');
$esAdmin = tienePermiso('ADMIN_USER');
session_write_close();

if (!bd_tiene_tabla('AW', 'estimaciones_obra')) {
    error('Las estimaciones aún no están en la base: aplica migraciones/011_estimaciones.sql (php herramientas/migrar.php --aplicar).', 503);
}

function usuarioActual(): string { return mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50); }
function fechaValida($v): ?string { return preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $v) ? $v : null; }

function contratoBloqueado(int $contratoId): array
{
    bd_ejecutar('AW', 'update contratos_obra set contrato_id = contrato_id where contrato_id = ?', [$contratoId]);
    $c = bd_fila('AW', 'select * from contratos_obra where contrato_id = ?', [$contratoId]);
    if (!$c) error('El contrato ya no existe.', 404);
    return $c;
}

// Cifras del contrato que usan las estimaciones: vigente (con convenios), anticipo y lo amortizado
function situacion(array $c, int $excluir = 0): array
{
    $conv = bd_filas('AW', 'select tipo, monto, dias, estatus from convenios_obra where contrato_id = ?', [$c['contrato_id']]);
    $v = contratoVigente($c, $conv);
    $sum = fn(string $sql) => (float) bd_valor('AW', $sql, [$c['contrato_id'], $excluir]);
    $anticipos = $sum("select coalesce(sum(importe), 0) from estimaciones_obra where contrato_id = ? and tipo = 'anticipo' and estatus not in ('borrador', 'cancelada') and estimacion_id <> ?");
    $anticiposTodos = $sum("select coalesce(sum(importe), 0) from estimaciones_obra where contrato_id = ? and tipo = 'anticipo' and estatus <> 'cancelada' and estimacion_id <> ?");
    $amortizado = $sum("select coalesce(sum(amortizacion), 0) from estimaciones_obra where contrato_id = ? and tipo = 'estimacion' and estatus <> 'cancelada' and estimacion_id <> ?");
    return ['vigente' => $v, 'anticipo_otorgado' => round($anticipos, 2), 'anticipo_registrado' => round($anticiposTodos, 2),
            'amortizado' => round($amortizado, 2), 'por_amortizar' => round(max(0, $anticipos - $amortizado), 2)];
}

// Cantidad estimada de cada concepto en las estimaciones no canceladas (menos la que se edita)
function acumulados(int $contratoId, int $excluir = 0): array
{
    $r = [];
    foreach (bd_filas('AW', "select ec.contrato_concepto_id, sum(ec.cantidad) as cantidad, sum(ec.importe) as importe,
                                    sum(case when e.estatus = 'borrador' then 0 else ec.cantidad end) as cantidad_aut
                               from estimacion_conceptos ec join estimaciones_obra e on e.estimacion_id = ec.estimacion_id
                              where e.contrato_id = ? and e.estatus <> 'cancelada' and e.estimacion_id <> ?
                              group by ec.contrato_concepto_id", [$contratoId, $excluir]) as $f) {
        $r[(int) $f['contrato_concepto_id']] = $f;
    }
    return $r;
}

function datos(int $obra, bool $puedeModificar, bool $puedeAutorizar): array
{
    $o = bd_fila('AW', 'select o.obra_id, o.nom_obra, d.cliente, d.folio from reg_obras o
                          left join doctos_sugerido_obra d on d.docto_sugerido_obra_id = o.sugerido_id where o.obra_id = ?', [$obra]);
    if (!$o) error('La obra ya no existe.', 404);
    $c = bd_fila('AW', "select * from contratos_obra where obra_id = ? and estatus <> 'cancelado' order by contrato_id desc limit 1", [$obra]);
    $r = ['obra' => $o, 'contrato' => $c, 'puede_modificar' => $puedeModificar, 'puede_autorizar' => $puedeAutorizar, 'usuario' => usuarioActual()];
    if (!$c) return $r;
    $acum = acumulados((int) $c['contrato_id']);
    $r['catalogo'] = array_map(function ($x) use ($acum) {
        $a = $acum[(int) $x['contrato_concepto_id']] ?? null;
        $x['estimado'] = $a ? (float) $a['cantidad'] : 0.0;
        $x['estimado_autorizado'] = $a ? (float) $a['cantidad_aut'] : 0.0;
        $x['importe_estimado'] = $a ? (float) $a['importe'] : 0.0;
        $x['avance'] = (float) $x['cantidad'] > 0 ? round($x['estimado_autorizado'] / (float) $x['cantidad'] * 100, 2) : 0;
        return $x;
    }, bd_filas('AW', 'select * from contrato_conceptos where contrato_id = ? order by orden, contrato_concepto_id', [$c['contrato_id']]));
    $r['estimaciones'] = bd_filas('AW', 'select * from estimaciones_obra where contrato_id = ? order by tipo, numero', [$c['contrato_id']]);
    foreach ($r['estimaciones'] as &$e) {
        $e['conceptos'] = bd_filas('AW', 'select contrato_concepto_id, cantidad, importe from estimacion_conceptos where estimacion_id = ?', [$e['estimacion_id']]);
    }
    unset($e);
    $r['situacion'] = situacion($c);
    $estimado = array_sum(array_map(fn($e) => trim($e['tipo']) === 'estimacion' && !in_array(trim($e['estatus']), ['borrador', 'cancelada'], true) ? (float) $e['importe'] : 0, $r['estimaciones']));
    $r['situacion']['estimado'] = round($estimado, 2);
    $r['situacion']['avance_financiero'] = $r['situacion']['vigente']['monto'] > 0 ? round($estimado / $r['situacion']['vigente']['monto'] * 100, 2) : 0;
    return $r;
}

// Conceptos con P.U. desde la versión aprobada del presupuesto del contrato (o del presupuesto actual)
function generarCatalogo(int $contratoId): array
{
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        $c = contratoBloqueado($contratoId);
        if (!in_array(trim($c['estatus']), ['borrador', 'vigente'], true)) error('El contrato no está en borrador ni vigente.');
        if (bd_valor('AW', 'select count(*) from contrato_conceptos where contrato_id = ?', [$contratoId])) error('El contrato ya tiene su catálogo de conceptos.');
        $sugerido = (int) bd_valor('AW', 'select sugerido_id from reg_obras where obra_id = ?', [$c['obra_id']]);
        $snap = null;
        if ($c['version_id']) $snap = json_decode((string) bd_valor('AW', 'select snapshot from presupuesto_versiones where version_id = ?', [$c['version_id']]), true);
        if ($snap) {
            $analisis = $snap['encabezado']['analisis_pu'] ?? [];
            if (is_string($analisis)) $analisis = json_decode($analisis, true) ?: [];
            $renglones = $snap['renglones'] ?? [];
            $conEmpleados = !empty($snap['empleados']);
        } else {
            $analisis = json_decode((string) bd_valor('AW', 'select analisis_pu from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$sugerido]), true) ?: [];
            $renglones = bd_filas('AW', 'select tipo_concepto, concepto_id, presupuesto from doctos_sugerido_obra_det where docto_sugerido_obra_id = ?', [$sugerido]);
            $conEmpleados = (bool) bd_valor('AW', 'select count(*) from mano_obra_detalle where docto_sugerido_obra_id = ?', [$sugerido]);
        }
        // Nombre de cada renglón por su concepto del catálogo MP / MO / GO
        $nombres = [];
        foreach (ACRI_CONCEPTOS as $t => $cat) {
            foreach (bd_filas('AW', "select {$cat['id']} as id, descripcion from {$cat['tabla']}") as $f) $nombres[$cat['sigla'] . '|' . $f['id']] = $f['descripcion'];
        }
        $filas = array_map(fn($r) => ['tipo' => trim((string) $r['tipo_concepto']), 'presupuesto' => (float) $r['presupuesto'],
                                      'concepto' => $nombres[trim((string) $r['tipo_concepto']) . '|' . (int) $r['concepto_id']] ?? ''], $renglones);
        $fijos = ['comisiones' => ACRI_CONCEPTOS_FIJOS['comisiones']['descripcion'], 'mano_obra' => ACRI_CONCEPTOS_FIJOS['mano_obra']['descripcion']];
        $cat = estimacionCatalogo(is_array($analisis) ? $analisis : [], $filas, $fijos, $conEmpleados, (float) $c['monto']);
        if (!$cat['conceptos']) error('El presupuesto no tiene conceptos para el catálogo del contrato (captúralos en su Análisis P.U.).');
        foreach ($cat['conceptos'] as $i => $x) {
            bd_insertar('AW', 'contrato_conceptos', 'contrato_concepto_id', [
                'contrato_id' => $contratoId, 'orden' => $i, 'clave' => mb_substr($x['clave'], 0, 30), 'partida' => mb_substr($x['partida'], 0, 100) ?: null,
                'descripcion' => mb_substr($x['descripcion'] ?: '(sin descripción)', 0, 300), 'unidad' => mb_substr($x['unidad'], 0, 20),
                'cantidad' => round($x['cantidad'], 4), 'pu' => $x['pu'], 'importe' => $x['importe'], 'cd_unitario' => $x['cd_unitario'], 'origen' => $x['origen'],
            ]);
        }
        bd_ejecutar('AW', 'update contratos_obra set factor_catalogo = ? where contrato_id = ?', [$cat['factor'], $contratoId]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['conceptos' => count($cat['conceptos']), 'factor' => $cat['factor'], 'diferencia' => $cat['diferencia']];
}

function guardar(array $d): array
{
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        $c = contratoBloqueado((int) ($d['contrato'] ?? 0));
        if (trim($c['estatus']) !== 'vigente') error('Las estimaciones se registran en un contrato vigente.');
        $id = (int) ($d['id'] ?? 0);
        $tipo = ($d['tipo'] ?? '') === 'anticipo' ? 'anticipo' : 'estimacion';
        if ($id) {
            $e = bd_fila('AW', 'select * from estimaciones_obra where estimacion_id = ? and contrato_id = ?', [$id, $c['contrato_id']]);
            if (!$e) error('La estimación ya no existe.', 404);
            if (trim($e['estatus']) !== 'borrador') error('Solo se modifica una estimación en borrador.');
            $tipo = trim($e['tipo']);
        }
        $s = situacion($c, $id);
        $conceptos = [];
        if ($tipo === 'anticipo') {
            $importe = round((float) ($d['importe'] ?? 0), 2);
            $falta = round($s['vigente']['anticipo'] - $s['anticipo_registrado'], 2);
            if ($importe <= 0) error('Captura el importe del anticipo (sin IVA).');
            if ($importe > $falta + 0.005) error('El anticipo pasa del pactado: quedan ' . number_format($falta, 2) . ' por registrar.');
        } else {
            $cat = [];
            foreach (bd_filas('AW', 'select * from contrato_conceptos where contrato_id = ?', [$c['contrato_id']]) as $x) $cat[(int) $x['contrato_concepto_id']] = $x;
            if (!$cat) error('Primero genera el catálogo de conceptos del contrato.');
            $acum = acumulados((int) $c['contrato_id'], $id);
            $importe = 0.0;
            foreach ((array) ($d['conceptos'] ?? []) as $x) {
                $ccid = (int) ($x['contrato_concepto_id'] ?? 0);
                $cant = round((float) ($x['cantidad'] ?? 0), 4);
                if ($cant == 0) continue;
                if (!isset($cat[$ccid])) error('Un concepto ya no está en el catálogo del contrato.');
                if ($cant < 0) error('Las cantidades no pueden ser negativas (una devolución va como deductiva).');
                $previo = (float) ($acum[$ccid]['cantidad'] ?? 0);
                if ($previo + $cant > (float) $cat[$ccid]['cantidad'] + 0.0001) {
                    error("«{$cat[$ccid]['descripcion']}»: se estimaría " . ($previo + $cant) . ' de ' . (float) $cat[$ccid]['cantidad']
                        . ' contratados. Lo que pase de lo contratado se registra como convenio (aditiva u orden de cambio).');
                }
                $imp = round($cant * (float) $cat[$ccid]['pu'], 2);
                $conceptos[$ccid] = ['cantidad' => $cant, 'importe' => $imp];
                $importe += $imp;
            }
            if (!$conceptos) error('Captura la cantidad ejecutada de al menos un concepto.');
        }
        $t = estimacionTotales($importe, $c, $s['por_amortizar'], $tipo === 'anticipo');
        $campos = [
            'fecha' => fechaValida($d['fecha'] ?? '') ?? date('Y-m-d'), 'periodo_ini' => fechaValida($d['periodo_ini'] ?? ''),
            'periodo_fin' => fechaValida($d['periodo_fin'] ?? ''), 'notas' => mb_substr(trim((string) ($d['notas'] ?? '')), 0, 4000) ?: null,
        ] + array_intersect_key($t, array_flip(['importe', 'amortizacion', 'subtotal', 'iva', 'fondo_garantia', 'retencion', 'neto']));
        if ($id) {
            bd_ejecutar('AW', 'update estimaciones_obra set ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($campos))) . ' where estimacion_id = ?',
                array_merge(array_values($campos), [$id]));
            bd_ejecutar('AW', 'delete from estimacion_conceptos where estimacion_id = ?', [$id]);
        } else {
            $numero = (int) bd_valor('AW', 'select coalesce(max(numero), 0) + 1 from estimaciones_obra where contrato_id = ? and tipo = ?', [$c['contrato_id'], $tipo]);
            $id = bd_insertar('AW', 'estimaciones_obra', 'estimacion_id',
                ['contrato_id' => $c['contrato_id'], 'tipo' => $tipo, 'numero' => $numero, 'usuario_creacion' => usuarioActual()] + $campos);
        }
        foreach ($conceptos as $ccid => $x) {
            bd_insertar('AW', 'estimacion_conceptos', 'estimacion_concepto_id', ['estimacion_id' => $id, 'contrato_concepto_id' => $ccid] + $x);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['id' => $id] + $t;
}

function movimiento(array $c, array $e, string $clase): array
{
    return ['obra_id' => (int) $c['obra_id'], 'naturaleza' => 'ingreso', 'clase' => $clase, 'origen_tipo' => trim($e['tipo']), 'origen_id' => (int) $e['estimacion_id'],
            'iva_pct' => (float) $c['iva_pct'], 'moneda' => trim($c['moneda']), 'tipo_cambio' => (float) $c['tipo_cambio'],
            'concepto' => (trim($e['tipo']) === 'anticipo' ? 'Anticipo ' : 'Estimación ') . $e['numero']];
}

function cambiarEstatus(array $d, bool $puedeModificar, bool $puedeAutorizar, bool $esAdmin): array
{
    $e = bd_fila('AW', 'select * from estimaciones_obra where estimacion_id = ?', [(int) ($d['id'] ?? 0)]);
    if (!$e) error('La estimación ya no existe.', 404);
    $accion = (string) ($d['accion'] ?? '');
    $antes = trim($e['estatus']);
    $pasos = ['autorizar' => ['borrador', 'autorizada'], 'facturar' => ['autorizada', 'facturada'], 'cobrar' => ['facturada', 'cobrada']];
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        $c = contratoBloqueado((int) $e['contrato_id']);
        $e = bd_fila('AW', 'select * from estimaciones_obra where estimacion_id = ?', [$e['estimacion_id']]);
        $antes = trim($e['estatus']);
        if ($accion === 'cancelar') {
            if (!$puedeModificar) error('No tienes el permiso para «Modificar obras».', 403);
            if (!in_array($antes, ['borrador', 'autorizada'], true)) error('Una estimación facturada o cobrada no se cancela (se hace una nota de crédito en Microsip).');
            if (trim($e['tipo']) === 'anticipo' && $antes === 'autorizada'
                && bd_valor('AW', "select count(*) from estimaciones_obra where contrato_id = ? and tipo = 'estimacion' and amortizacion > 0 and estatus <> 'cancelada'", [$c['contrato_id']])) {
                error('Ya hay estimaciones que amortizan este anticipo: cancélalas primero.');
            }
            bd_ejecutar('AW', "update estimaciones_obra set estatus = 'cancelada' where estimacion_id = ?", [$e['estimacion_id']]);
            foreach (['estimado', 'facturado', 'cobrado'] as $clase) libroAjustar(movimiento($c, $e, $clase), 0.0);
        } elseif (isset($pasos[$accion])) {
            [$desde, $hacia] = $pasos[$accion];
            if ($antes !== $desde) error("La estimación está $antes: no se puede " . $accion . '.');
            $campos = ['estatus' => $hacia];
            if ($accion === 'autorizar') {
                if (!$puedeAutorizar) error('No tienes el permiso para autorizar estimaciones (AUTORIZAR_ESTIMACIONES).', 403);
                if (!$esAdmin && strcasecmp(trim((string) $e['usuario_creacion']), usuarioActual()) === 0) error('La estimación la autoriza un usuario distinto al que la capturó.');
                // Las deducciones se recalculan con lo que haya en este momento (otro anticipo u otra estimación)
                $s = situacion($c, (int) $e['estimacion_id']);
                $t = estimacionTotales((float) $e['importe'], $c, $s['por_amortizar'], trim($e['tipo']) === 'anticipo');
                $campos += array_intersect_key($t, array_flip(['amortizacion', 'subtotal', 'iva', 'fondo_garantia', 'retencion', 'neto']))
                         + ['autorizada_por' => usuarioActual(), 'fecha_autorizacion' => date('c')];
                $e = array_merge($e, $t);
            } else {
                if (!$puedeModificar) error('No tienes el permiso para «Modificar obras».', 403);
            }
            if ($accion === 'facturar') {
                $folio = mb_substr(trim((string) ($d['folio_factura'] ?? '')), 0, 40);
                if ($folio === '') error('Captura el folio de la factura (Microsip).');
                $campos += ['folio_factura' => $folio, 'fecha_factura' => fechaValida($d['fecha'] ?? '') ?? date('Y-m-d')];
            }
            if ($accion === 'cobrar') $campos['fecha_cobro'] = fechaValida($d['fecha'] ?? '') ?? date('Y-m-d');
            bd_ejecutar('AW', 'update estimaciones_obra set ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($campos))) . ' where estimacion_id = ?',
                array_merge(array_values($campos), [$e['estimacion_id']]));
            // Libro: estimado (obra ejecutada, solo estimaciones), facturado (subtotal) y cobrado (lo que entra sin IVA)
            $m = movimiento($c, $e, 'estimado');
            if ($accion === 'autorizar' && trim($e['tipo']) === 'estimacion') libroAjustar($m, (float) $e['importe']);
            if ($accion === 'facturar') libroAjustar(['clase' => 'facturado', 'fecha' => $campos['fecha_factura']] + $m, (float) $e['subtotal']);
            if ($accion === 'cobrar') libroAjustar(['clase' => 'cobrado', 'fecha' => $campos['fecha_cobro']] + $m,
                (float) $e['subtotal'] - (float) $e['fondo_garantia'] - (float) $e['retencion']);
            if ($accion === 'autorizar' && bd_tiene_tabla('AW', 'autorizaciones')) {
                bd_insertar('AW', 'autorizaciones', 'autorizacion_id', [
                    'documento_tipo' => 'estimacion', 'documento_id' => (int) $e['estimacion_id'], 'accion' => 'AUTORIZAR_ESTIMACIONES', 'estatus' => 'aprobada',
                    'solicitada_por' => (string) $e['usuario_creacion'], 'resuelta_por' => usuarioActual(), 'fecha_resolucion' => date('c'),
                    'datos' => json_encode(['importe' => (float) $e['importe'], 'neto' => (float) $e['neto']]),
                ]);
            }
        } else {
            error('Acción no válida.');
        }
        $pdo->commit();
    } catch (Throwable $ex) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $ex;
    }
    return ['estatus' => $accion === 'cancelar' ? 'cancelada' : $pasos[$accion][1]];
}

try {
    switch ($accion) {
        case 'datos':
            responder(['ok' => true] + datos((int) ($_GET['obra'] ?? 0), $puedeModificar, $puedeAutorizar));
        case 'generar_catalogo':
            if (!$puedeModificar) error('No tienes el permiso para «Modificar obras».', 403);
            responder(['ok' => true] + generarCatalogo((int) (entrada()['contrato'] ?? 0)));
        case 'guardar':
            if (!$puedeModificar) error('No tienes el permiso para «Modificar obras».', 403);
            responder(['ok' => true] + guardar(entrada()));
        case 'estatus':
            responder(['ok' => true] + cambiarEstatus(entrada(), $puedeModificar, $puedeAutorizar, $esAdmin));
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/estimaciones: ' . $e->getMessage());
    error('No se pudo guardar: ' . bd_mensaje_error($e), 500);
}
