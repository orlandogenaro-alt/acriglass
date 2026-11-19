<?php
// ACRINEO · Facturas y folios de Easy-Glass ligados a un presupuesto (migración 034).
// Se buscan con la misma búsqueda de «Asignar Cotización» de Obras (includes/folios-easyglass.php) y al ligarlos
// se guarda una copia de sus datos. Ventana: includes/acrineo/vistas/ligados.php · js/acrineo/hoja-ligados.js
require_once __DIR__ . '/historial.php';

const ACRINEO_LIGADOS_ORIGENES = ['Factura Microsip', 'Pedido Microsip', 'Easy-Glass'];
const ACRINEO_IVA = 16.0;

function acrineoLigadosDisponible(): bool
{
    return bd_tiene_tabla('AW', 'acrineo_presupuesto_ligados');
}

function acrineoLigadosExigirTabla(): void
{
    if (!acrineoLigadosDisponible()) throw new AcrineoError('Falta aplicar la migración 034 (facturas y folios de Easy-Glass ligados).', 503);
}

// Lo ligado al presupuesto, con lo que ya tienen otros presupuestos de los mismos folios y el resumen contra el precio
function acrineoLigadosListar(int $presupuestoId): array
{
    $p = bd_fila('AW', 'select presupuesto_id, codigo, nombre, costo_directo, precio_venta from acrineo_presupuestos
                         where presupuesto_id = ? and deleted_at is null', [$presupuestoId]);
    if (!$p) throw new AcrineoError('El presupuesto no existe o fue eliminado.', 404);
    $filas = [];
    if (acrineoLigadosDisponible()) {
        $filas = bd_filas('AW',
            "select l.ligado_id as id, l.origen, l.folio, l.folio_easy, l.cliente, l.detalle, l.fecha, l.total, l.moneda, l.estatus,
                    l.created_by as ligo, l.created_at as ligado_el,
                    (select string_agg(o.codigo, ', ' order by o.codigo)
                       from acrineo_presupuesto_ligados x
                       join acrineo_presupuestos o on o.presupuesto_id = x.presupuesto_id and o.deleted_at is null
                      where x.presupuesto_id <> l.presupuesto_id and x.origen = l.origen and upper(x.folio) = upper(l.folio)) as tambien_en
               from acrineo_presupuesto_ligados l
              where l.presupuesto_id = ?
              order by case l.origen when 'Factura Microsip' then 0 when 'Pedido Microsip' then 1 else 2 end, l.fecha desc nulls last, l.folio", [$presupuestoId]);
    }
    $suma = fn(string $origen) => round(array_sum(array_map(fn($f) => $f['origen'] === $origen ? (float) $f['total'] : 0, $filas)), 2);
    $precio = (float) $p['precio_venta'];
    $conIva = round($precio * (1 + ACRINEO_IVA / 100), 2);
    $facturado = $suma('Factura Microsip');
    return [
        'disponible' => acrineoLigadosDisponible(),
        'filas' => array_map(fn($f) => ['total' => (float) $f['total']] + $f, $filas),
        'resumen' => [
            'precio_venta' => $precio, 'iva_pct' => ACRINEO_IVA, 'precio_con_iva' => $conIva,
            'facturado' => $facturado, 'pedidos' => $suma('Pedido Microsip'), 'easyglass' => $suma('Easy-Glass'),
            'por_facturar' => round($conIva - $facturado, 2),
            'avance_pct' => $conIva > 0 ? round($facturado / $conIva * 100, 2) : 0,
        ],
    ];
}

// Liga un folio que salió en la búsqueda (se guarda su copia; si ya estaba ligado no se repite)
function acrineoLigar(int $presupuestoId, array $in, string $usuario): array
{
    acrineoLigadosExigirTabla();
    $origen = (string) ($in['origen'] ?? '');
    $folio = mb_strtoupper(trim((string) ($in['folio'] ?? '')));
    if (!in_array($origen, ACRINEO_LIGADOS_ORIGENES, true)) throw new AcrineoError('Origen del folio no válido.', 422);
    if ($folio === '' || mb_strlen($folio) > 30) throw new AcrineoError('Falta el folio.', 422);
    $fecha = substr(trim((string) ($in['fecha'] ?? '')), 0, 10);
    $texto = fn($k, $n) => ($v = trim(preg_replace('/\s+/', ' ', (string) ($in[$k] ?? '')))) === '' ? null : mb_substr($v, 0, $n);
    $existe = bd_valor('AW', 'select 1 from acrineo_presupuesto_ligados where presupuesto_id = ? and origen = ? and upper(folio) = ?', [$presupuestoId, $origen, $folio]);
    if (!$existe) {
        $easy = ($in['clave'] ?? '') !== '' && ($in['clave'] ?? '') !== ($in['folio'] ?? '') ? $texto('clave', 30) : null;
        bd_ejecutar('AW',
            'insert into acrineo_presupuesto_ligados (presupuesto_id, origen, folio, folio_easy, cliente, detalle, fecha, total, moneda, estatus, created_by)
             values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$presupuestoId, $origen, $folio, $easy, $texto('cliente', 200), $texto('detalle', 250),
             preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha) ? $fecha : null, round((float) ($in['total'] ?? 0), 2),
             $texto('moneda', 10), $texto('estatus', 30), mb_substr($usuario, 0, 50)]);
        acrineoRegistrar($presupuestoId, $usuario, 'LIGAR', [["$origen $folio", null, number_format((float) ($in['total'] ?? 0), 2)]]);
    }
    return acrineoLigadosListar($presupuestoId);
}

function acrineoDesligar(int $presupuestoId, int $ligadoId, string $usuario): array
{
    acrineoLigadosExigirTabla();
    $f = bd_fila('AW', 'select origen, folio, total from acrineo_presupuesto_ligados where ligado_id = ? and presupuesto_id = ?', [$ligadoId, $presupuestoId]);
    if (!$f) throw new AcrineoError('Ese folio ya no está ligado al presupuesto.', 404);
    bd_ejecutar('AW', 'delete from acrineo_presupuesto_ligados where ligado_id = ?', [$ligadoId]);
    acrineoRegistrar($presupuestoId, $usuario, 'DESLIGAR', [["{$f['origen']} {$f['folio']}", number_format((float) $f['total'], 2), null]]);
    return acrineoLigadosListar($presupuestoId);
}

// Búsqueda para ligar: marca lo que ya está en este presupuesto y en qué otros presupuestos está cada folio
function acrineoLigadosBuscar(int $presupuestoId, string $q): array
{
    require_once __DIR__ . '/../folios-easyglass.php';
    try {
        $filas = easyglassBuscarFolios($q);
    } catch (RuntimeException $e) {
        throw new AcrineoError($e->getMessage(), 502);
    }
    if (!$filas || !acrineoLigadosDisponible()) return array_map(fn($f) => $f + ['ligado' => false, 'tambien_en' => null], $filas);
    $folios = array_values(array_unique(array_map(fn($f) => mb_strtoupper($f['folio']), $filas)));
    $hay = bd_filas('AW',
        'select l.origen, upper(l.folio) as folio, l.presupuesto_id, p.codigo
           from acrineo_presupuesto_ligados l
           join acrineo_presupuestos p on p.presupuesto_id = l.presupuesto_id and p.deleted_at is null
          where upper(l.folio) in (' . implode(',', array_fill(0, count($folios), '?')) . ')', $folios);
    return array_map(function ($f) use ($hay, $presupuestoId) {
        $ligado = false;
        $otros = [];
        foreach ($hay as $h) {
            if ($h['origen'] !== $f['origen'] || $h['folio'] !== mb_strtoupper($f['folio'])) continue;
            if ((int) $h['presupuesto_id'] === $presupuestoId) $ligado = true; else $otros[] = $h['codigo'];
        }
        return $f + ['ligado' => $ligado, 'tambien_en' => $otros ? implode(', ', $otros) : null];
    }, $filas);
}
