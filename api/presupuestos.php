<?php
// Altas y cambios de presupuestos de obra (AW-Management en el servidor local, Supabase en la nube)
// POST ?accion=guardar     cuerpo JSON con encabezado, conceptos, empleados, comisiones, seguros y relacionados; regresa { id, folio }
// POST ?accion=estatus     { id, estatus, autoriza? }  cambia el estatus con las reglas del Form46
// POST ?accion=registrar_obra { id, nom_obra }  crea la obra del presupuesto; regresa { obra_id, nom_obra, nueva }
// POST ?accion=eliminar    { id, autoriza? }  solo un presupuesto Cancelado
// POST ?accion=hubspot     { id, email, formato_html? }  crea o actualiza su negocio en HubSpot (después de guardar)
// POST ?accion=calcular    { analisis, sobrecosto? }  Análisis P.U. con el motor central; no guarda nada
// Los ids nuevos salen de GEN_ID(ID_CATALOGOS) en Firebird (igual que los triggers de AW)
// y de las columnas identity en Supabase. El folio lo asigna la base (trigger / secuencia).
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/bd.php';
require __DIR__ . '/../includes/autenticacion.php';
require __DIR__ . '/../includes/permisos.php';
require __DIR__ . '/../includes/estatus.php';
require __DIR__ . '/../includes/tareas.php';
require __DIR__ . '/../includes/presupuesto-obra.php';
require __DIR__ . '/../includes/calculo.php';
require_once __DIR__ . '/../includes/pu.php';
require __DIR__ . '/../includes/presupuesto-conceptos.php';   // y el motor de P.U. (includes/presupuesto-calculo.php)
require __DIR__ . '/../includes/parametros-presupuesto.php';
require __DIR__ . '/../includes/hubspot-presupuesto.php';
require __DIR__ . '/../includes/respuesta.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') error('Método no permitido.', 405);
if (modoConfiguracion()) error('Modo configuración: aún no hay conexión a AW-Management.', 503);
exigirCsrf();
// El cálculo no toca la base: lo puede pedir quien puede ver el presupuesto
if (($_GET['accion'] ?? '') === 'calcular') {
    exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_SUGERIDO_OBRA', 'MODIFICAR_SUGERIDO_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'CERRAR_OBRA', 'ADMIN_USER');
    session_write_close();
    responder(['ok' => true] + calcularAnalisis(entrada()));
}
exigirPermiso('NUEVO_SUGERIDO_OBRA', 'MODIFICAR_SUGERIDO_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'ADMIN_USER');
session_write_close();


// Catálogo de conceptos de cada sección: tabla, columna id
const CATALOGOS = [
    'MP' => ['conceptos_mat_prima_obra', 'concepto_mat_prima_id'],
    'MO' => ['conceptos_mano_obra', 'concepto_mano_obra_id'],
    'GO' => ['conceptos_gas_operacion_obra', 'concepto_gas_operacion_obra_id'],
];

function texto($v, int $largo): ?string
{
    $v = trim((string) ($v ?? ''));
    return $v === '' ? null : mb_substr($v, 0, $largo);
}

function numero($v, int $decimales = 2): float
{
    return round(is_numeric($v) ? (float) $v : 0.0, $decimales);
}

// Renglones que el presupuesto llena solo (empleados, comisiones y Análisis P.U.): se dan de alta si faltan
const CONCEPTOS_DEL_SISTEMA = ['MANO DE OBRA INTERNA', 'COMISIONES', 'MATERIALES SEGUN ANALISIS P.U.', 'MANO DE OBRA SEGUN ANALISIS P.U.'];

// Id del concepto por su descripción. Uno que no está en el catálogo solo se da de alta si es del sistema,
// si el catálogo de la sección está vacío (se captura como texto libre) o si lo guarda un administrador;
// los demás se dan de alta en Administrador › Conceptos.
function conceptoId(string $tipo, string $descripcion, array &$cache): int
{
    $k = $tipo . '|' . mb_strtoupper($descripcion);
    if (isset($cache[$k])) return $cache[$k];
    [$tabla, $col] = CATALOGOS[$tipo];
    $id = (int) bd_valor('AW', "select min($col) from $tabla where upper(trim(descripcion)) = ?", [mb_strtoupper($descripcion)]);
    if (!$id) {
        $libre = in_array(mb_strtoupper($descripcion), CONCEPTOS_DEL_SISTEMA, true) || tienePermiso('ADMIN_USER')
            || !(int) bd_valor('AW', "select count(*) from $tabla");
        if (!$libre) error("El concepto «{$descripcion}» no está en el catálogo de " . ['MP' => 'Materia Prima', 'MO' => 'Mano de Obra', 'GO' => 'Gastos de Operacion'][$tipo]
            . '. Pide a un administrador que lo dé de alta en Administrador › Conceptos.');
        $id = bd_insertar('AW', $tabla, $col, ['descripcion' => mb_substr($descripcion, 0, 80)]);
    }
    return $cache[$k] = $id;
}

// Id del vendedor de obra por su nombre; como en Form46 solo se elige del catálogo (no se da de alta aquí)
function vendedorId(?string $nombre): ?int
{
    if ($nombre === null) return null;
    $id = (int) bd_valor('AW', 'select min(vendedor_obra_id) from vendedores_obras where upper(trim(nombre)) = ?', [mb_strtoupper($nombre)]);
    if (!$id) error("El vendedor «{$nombre}» no está en el catálogo de vendedores de obra. Pide a un administrador que lo dé de alta.");
    return $id;
}

// Datos de la obra del encabezado (ventana Nueva obra) como JSON; null si no se capturó nada
const CAMPOS_OBRA = ['nombre' => 200, 'descripcion' => 500, 'direccion' => 200, 'colonia' => 100, 'codigo_postal' => 10,
                     'ciudad' => 100, 'estado' => 100, 'telefono' => 30, 'mail' => 150, 'observaciones' => 500];

function datosObra($d): ?string
{
    $d = is_array($d) ? $d : [];
    $r = [];
    foreach (CAMPOS_OBRA as $k => $largo) $r[$k] = texto($d[$k] ?? '', $largo);
    $r['bloqueada'] = !empty($d['bloqueada']);
    $r['maestra'] = !empty($d['maestra']);
    return array_filter($r) ? json_encode($r, JSON_UNESCAPED_UNICODE) : null;
}

// Análisis de Precios Unitarios (como Neodata) como JSON; null si no hay conceptos y los factores son los de por omisión.
// fsr: factor de salario real · hm: % herramienta menor · fin: % financiamiento · util: % utilidad (null = equivalente al Form46)
// conceptos: [{ clave, partida, descripcion, unidad, cantidad, insumos: [{ tipo MAT|MO|EQ…, descripcion, unidad, cantidad, rinde, costo }] }]
// Cada concepto trae además su id (renglón de presupuesto_conceptos) y _uid (el de la pantalla), que no van al JSON.
function analisisPUDatos($d): ?array
{
    $d = is_array($d) ? $d : [];
    $fsr = numero($d['fsr'] ?? 1, 4);
    $r = [
        'fsr'  => $fsr > 0 && $fsr < 10 ? $fsr : 1.0,
        'hm'   => max(0, min(100, numero($d['hm'] ?? 0, 4))),
        'fin'  => max(0, min(100, numero($d['fin'] ?? 0, 4))),
        'util' => isset($d['util']) && is_numeric($d['util']) ? max(0, min(1000, numero($d['util'], 4))) : null,
        'conceptos' => [],
    ];
    // La matriz de los conceptos de precio fijo es el costo (presupuestos traídos de Neodata)
    if (!empty($d['matriz_costo'])) $r['matriz_costo'] = true;
    // FASAR del catálogo del que salió el FSR del presupuesto (botón FASAR); el FSR queda guardado aunque el FASAR cambie
    if ((int) ($d['fasar_id'] ?? 0) > 0) $r['fasar_id'] = (int) $d['fasar_id'];
    foreach (array_slice((array) ($d['conceptos'] ?? []), 0, 1000) as $c) {
        if (!is_array($c)) continue;
        $insumos = [];
        foreach (array_slice((array) ($c['insumos'] ?? []), 0, 200) as $i) {
            if (!is_array($i)) continue;
            $ins = [
                'tipo'        => in_array($i['tipo'] ?? '', PC_TIPOS, true) ? $i['tipo'] : 'MAT',
                'codigo'      => texto($i['codigo'] ?? '', 30) ?? '',
                'descripcion' => texto($i['descripcion'] ?? '', 200) ?? '',
                'unidad'      => texto($i['unidad'] ?? '', 20) ?? '',
                'cantidad'    => max(0, numero($i['cantidad'] ?? 0, 6)),
                'rinde'       => max(0, numero($i['rinde'] ?? 0, 4)),
                'costo'       => max(0, numero($i['costo'] ?? 0, 4)),
            ];
            // Campos opcionales del motor (includes/presupuesto-calculo.php): solo si se capturaron
            if (in_array($i['tipo_calculo'] ?? '', ['cantidad', 'rendimiento'], true)) $ins['tipo_calculo'] = $i['tipo_calculo'];
            if (in_array($i['base'] ?? '', ['fijo', 'pct_mo'], true)) $ins['base'] = $i['base'];
            foreach (['factor' => 6, 'merma_pct' => 4, 'fsr' => 4, 'viaticos' => 4, 'alimentacion' => 4, 'hospedaje' => 4] as $k => $dec) {
                if (isset($i[$k]) && is_numeric($i[$k])) $ins[$k] = max(0, numero($i[$k], $dec));
            }
            if ((int) ($i['fasar_id'] ?? 0) > 0) $ins['fasar_id'] = (int) $i['fasar_id'];   // FASAR del que salió su FSR
            if (($v = texto($i['proveedor'] ?? '', 150)) !== null) $ins['proveedor'] = $v;
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($i['fecha_costo'] ?? ''))) $ins['fecha_costo'] = $i['fecha_costo'];
            $insumos[] = $ins;
        }
        $concepto = [
            'clave'       => texto($c['clave'] ?? '', 20) ?? '',
            'partida'     => texto($c['partida'] ?? '', 100) ?? '',
            'descripcion' => texto($c['descripcion'] ?? '', 300) ?? '',
            'unidad'      => texto($c['unidad'] ?? '', 20) ?? '',
            'cantidad'    => max(0, numero($c['cantidad'] ?? 0, 4)),
            'especificacion' => texto($c['especificacion'] ?? '', 4000) ?? '',
            'insumos'     => $insumos,
        ];
        if ((int) ($c['id'] ?? 0) > 0) $concepto['id'] = (int) $c['id'];
        if (isset($c['uid']) && is_numeric($c['uid'])) $concepto['_uid'] = (int) $c['uid'];
        // Precio fijo para el cliente (importado del Catálogo): no suma al costo, el costo viene de MP / MO / GO
        $venta = max(0, numero($c['venta'] ?? 0, 4));
        if ($venta > 0) $concepto['venta'] = $venta;
        // Renglón totalmente vacío: no se guarda
        if ($concepto['descripcion'] === '' && !$concepto['cantidad'] && !$insumos) continue;
        $r['conceptos'][] = $concepto;
    }
    if ($r['fsr'] == 1 && !$r['hm'] && !$r['fin'] && $r['util'] === null && !$r['conceptos']) return null;
    return $r;
}

// El análisis validado como JSON (respaldo en doctos_sugerido_obra.analisis_pu), sin los ids
function analisisPU(?array $a): ?string
{
    if ($a === null) return null;
    $a['conceptos'] = array_map(fn($c) => array_diff_key($c, ['id' => 1, '_uid' => 1]), $a['conceptos']);
    return json_encode($a, JSON_UNESCAPED_UNICODE);
}

// Análisis P.U. con el motor central (includes/presupuesto-calculo.php): por concepto el desglose de UNA unidad (cada
// insumo con su cantidad resultante, costo real e importe) y el resumen como Neodata; con el sobrecosto, su P.U. e
// importe. También la explosión de insumos de toda la obra.
// sobrecosto: { cd, ind (pesos), fin_pct, util_pct (Utilidad Neta del presupuesto), modo 'costo'|'margen', ca (fracción) }
function calcularAnalisis(array $d): array
{
    $a = analisisPUDatos($d['analisis'] ?? []) ?? ['fsr' => 1, 'hm' => 0, 'fin' => 0, 'conceptos' => []];
    $s = null;
    if (is_array($d['sobrecosto'] ?? null)) {
        $x = $d['sobrecosto'];
        $s = pcSobrecosto(numero($x['cd'] ?? 0, 6), numero($x['ind'] ?? 0, 6), numero($x['fin_pct'] ?? $a['fin'], 4),
                          numero($x['util_pct'] ?? 0, 4), ($x['modo'] ?? '') === 'margen' ? 'margen' : 'costo', numero($x['ca'] ?? 0, 6));
    }
    $conceptos = [];
    foreach ($a['conceptos'] as $c) {
        $r = pcConcepto($c, $a);
        // Precio fijo para el cliente: su P.U. es el del Catálogo
        $precio = $s ? pcPrecioConcepto($r['totales']['cd'], $s) : null;
        $pu = !empty($c['venta']) ? (float) $c['venta'] : ($precio['pu'] ?? null);
        $conceptos[] = ['id' => $c['id'] ?? null, 'clave' => $c['clave'], 'descripcion' => $c['descripcion'], 'unidad' => $c['unidad'], 'cantidad' => $c['cantidad'],
                        'insumos' => $r['insumos'], 'totales' => $r['totales'], 'resumen' => pcResumen($r['totales']), 'precio' => $precio,
                        'pu' => $pu, 'importe' => $pu === null ? null : $pu * $c['cantidad']];
    }
    return ['conceptos' => $conceptos, 'explosion' => puExplosion($a), 'sobrecosto' => $s];
}

// Cálculo de un renglón de Gastos de Operación (migraciones/019): por unidad / hora / jornada (cantidad × costo) o
// % de la mano de obra; el importe lo calcula la pantalla con el motor (includes/presupuesto-calculo.php) y se
// guarda en «presupuesto». Sin base es importe fijo: no lleva columnas de cálculo.
function calculoRenglon($g): array
{
    if (!is_array($g) || !in_array($g['base'] ?? '', PC_GASTO_BASES, true)) return [];
    $pct = $g['base'] === 'pct_mo';
    return [
        'calculo_base'     => $g['base'],
        'calculo_cantidad' => $pct ? null : max(0, numero($g['cantidad'] ?? 0, 4)),
        'calculo_unidad'   => $pct ? null : texto($g['unidad'] ?? '', 20),
        'calculo_costo'    => $pct ? null : max(0, numero($g['costo'] ?? 0, 4)),
        'calculo_pct'      => $pct ? max(0, numero($g['pct'] ?? 0, 4)) : null,
    ];
}

// Estatus guardado del presupuesto (error si ya no existe)
function estatusActual(int $id): string
{
    $e = bd_valor('AW', 'select estatus from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$id]);
    if ($e === null || $e === false) error('El presupuesto ya no existe (¿lo eliminaron?).', 404);
    return trim((string) $e);
}

// Detalle del Form46 que cuelga del encabezado: empleados (grid_man_obra), comisiones, anexo de seguro y
// sugeridos relacionados. Se reemplaza completo al guardar. tabla => [columna id, columna del presupuesto, generador de AW]
const DETALLES = [
    'mano_obra_detalle'      => ['mano_obra_det_id', 'docto_sugerido_obra_id', 'id_catalogos'],
    'comisiones_obra_det'    => ['comision_obra_det_id', 'docto_sugerido_obra_id', 'id_catalogos'],
    'anexos_obra_seguro'     => ['anexo_obra_idd', 'docto_sugerido_obra_id', 'id_elementos'],
    'sugeridos_relacionados' => ['sug_relacion_id', 'sugerido_id_padre', 'id_elementos'],
];

function borrarDetalles(int $id): void
{
    foreach (DETALLES as $tabla => [, $colPadre]) bd_ejecutar('AW', "delete from $tabla where $colPadre = ?", [$id]);
}

function guardarDetalles(int $id, array $d, array &$cache): void
{
    $ins = function (string $tabla, array $campos) {
        [$colId, , $gen] = DETALLES[$tabla];
        bd_insertar('AW', $tabla, $colId, $campos, $gen);
    };
    $vistos = [];
    foreach ($d['empleados'] ?? [] as $e) {
        $clave = (int) ($e['clave'] ?? 0);
        $emp = (int) ($e['empleado_id'] ?? 0);
        if ($emp && isset($vistos[$emp])) continue;   // valida_empledo_no_exista
        $vistos[$emp] = 1;
        $sueldo = numero($e['sueldo'] ?? 0);
        $dias = numero($e['dias'] ?? 0);
        $ins('mano_obra_detalle', [
            'docto_sugerido_obra_id' => $id,
            'empleado_id'    => $emp ?: null,
            'clave_empleado' => $clave ?: null,
            'nombre'         => texto($e['nombre'] ?? '', 200),
            'sueldo_diario'  => $sueldo,
            'num_dias'       => $dias,
            'total'          => numero($sueldo * $dias),
        ]);
    }
    foreach ($d['comisiones'] ?? [] as $c) {
        $ins('comisiones_obra_det', [
            'docto_sugerido_obra_id' => $id,
            'tipo_empleado_id' => (int) ($c['tipo_id'] ?? 0) ?: null,
            'nombre'           => texto($c['nombre'] ?? '', 50),
            'porcentaje'       => numero($c['porcentaje'] ?? 0, 4),
            'total_comision'   => numero($c['total'] ?? 0),
        ]);
    }
    foreach ($d['seguros'] ?? [] as $s) {
        $nombre = texto($s['concepto'] ?? '', 80);
        if ($nombre === null) continue;
        $ins('anexos_obra_seguro', [
            'docto_sugerido_obra_id'         => $id,
            'concepto_gas_operacion_obra_id' => conceptoId('GO', $nombre, $cache),
            'nombre'                         => $nombre,
            'porcentaje_1'                   => numero($s['porcentaje_1'] ?? 0),
            'porcentaje_2'                   => numero($s['porcentaje_2'] ?? 0),
            'total'                          => numero($s['total'] ?? 0),
        ]);
    }
    $vistos = [];
    foreach ($d['relacionados'] ?? [] as $r) {
        $hijo = (int) ($r['sugerido_id'] ?? 0);
        if (!$hijo || $hijo === $id || isset($vistos[$hijo])) continue;
        $vistos[$hijo] = 1;
        $h = bd_fila('AW', 'select folio, cliente from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$hijo]);
        if (!$h) continue;   // lo eliminaron mientras tanto
        $ins('sugeridos_relacionados', [
            'sugerido_id_padre'     => $id,
            'sugerido_id_hijo'      => $hijo,
            'folio_sugerido_hijo'   => (int) $h['folio'],
            'cliente_sugerido_hijo' => texto($h['cliente'], 100),
            'tipo'                  => 'SO',
        ]);
    }
}

function guardar(array $d): array
{
    $id = (int) ($d['id'] ?? 0);
    $fecha = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($d['fecha'] ?? '')) ? $d['fecha'] : date('Y-m-d');
    $cliente = texto($d['cliente'] ?? '', 150);
    if ($cliente === null) error('Captura el cliente antes de guardar.');
    // Form46: el correo del contacto de HubSpot y el proyecto son obligatorios
    $email = texto($d['email'] ?? '', 150);
    if ($email === null || mb_strlen($email) <= 10 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        error('Es necesario colocar el correo del contacto con el que se registró en HubSpot para guardar el presupuesto.');
    }
    if (texto($d['proyecto'] ?? '', 200) === null) error('Es necesario capturar el nombre del Proyecto para guardar el presupuesto.');
    // El estatus no cambia al guardar (eso es ?accion=estatus); uno nuevo nace Pendiente
    $estatus = 'Pendiente';
    // Nuevo: NUEVO_SUGERIDO_OBRA (o la autorización de otro usuario que lo tenga)
    if (!$id && !tienePermiso('NUEVO_SUGERIDO_OBRA', 'ADMIN_USER')) autorizacion($d['autoriza'] ?? null, 'NUEVO_SUGERIDO_OBRA');
    if ($id) {
        $estatus = estatusActual($id);
        if (estatusBloqueaCambios($estatus)) error("El presupuesto está $estatus: ya no es posible hacerle modificaciones.");
        // «Modificar» del Form46: el permiso o la autorización de otro usuario, revisados aquí y no solo en la pantalla
        if (!tienePermiso('MODIFICAR_SUGERIDO_OBRA', 'ADMIN_USER')) autorizacion($d['autoriza'] ?? null, 'MODIFICAR_SUGERIDO_OBRA');
    }

    $conceptos = [];
    foreach ($d['conceptos'] ?? [] as $c) {
        $tipo = strtoupper((string) ($c['tipo'] ?? ''));
        $nombre = texto($c['concepto'] ?? '', 80);
        if (!isset(CATALOGOS[$tipo])) continue;
        if ($nombre === null) {
            if (numero($c['presupuesto'] ?? 0) == 0) continue;   // renglón vacío
            error('Hay un concepto con importe pero sin nombre en ' . ['MP' => 'Materia Prima', 'MO' => 'Mano de Obra', 'GO' => 'Gastos de Operacion'][$tipo] . '.');
        }
        $c['tipo'] = $tipo;
        $c['concepto'] = $nombre;
        $conceptos[] = $c;
    }

    // Totales del Form46 calculados aquí con los renglones (no se confía en lo que manda el navegador);
    // el subtotal del navegador solo se acepta si cuadra (lo usa el subtotal capturado a mano)
    // Utilidad «costo»: subtotal = costo × (1 + %) · «margen» (Form46): subtotal = costo / (1 − %)
    $util = numero($d['utilidad_por'] ?? 0, 4);
    $margen = ($d['modo_utilidad'] ?? 'margen') === 'margen';
    if (!calculoUtilidadValida($util, $margen ? 'margen' : 'costo')) error($margen ? 'Con utilidad de margen, la Utilidad Neta debe ser de 0 a 99.99 %.' : 'La Utilidad Neta debe ser de 0 a 1000 %.');
    $suma = ['MP' => 0.0, 'MO' => 0.0, 'GO' => 0.0];
    foreach ($conceptos as $c) $suma[$c['tipo']] += numero($c['presupuesto'] ?? 0);
    $costo = $suma['MP'] + $suma['MO'] + $suma['GO'];
    $esperado = calculoSubtotal($costo, $util, $margen ? 'margen' : 'costo');
    $subtotal = numero($d['totales']['subtotal'] ?? $esperado);
    if (!calculoCuadra($subtotal, $esperado)) {
        error('Los totales del presupuesto no cuadran con sus conceptos (subtotal ' . number_format($subtotal, 2) . ' contra '
            . number_format($esperado, 2) . '). Recarga la página e intenta de nuevo.');
    }
    // Tasa de IVA: una de Administrador › Parámetros de presupuesto, o la que ya tenía guardada; sin la columna, 16 %
    $ivaPct = 16.0;
    if (bd_tiene_columna('AW', 'doctos_sugerido_obra', 'iva_pct')) {
        $ivaPct = is_numeric($d['iva_pct'] ?? null) ? round((float) $d['iva_pct'], 3) : 16.0;
        $previo = $id ? (float) bd_valor('AW', 'select iva_pct from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$id]) : null;
        if (!parametrosIvaValida($ivaPct, parametrosPresupuesto()) && ($previo === null || abs($previo - $ivaPct) >= 0.0001)) {
            error("La tasa de IVA de {$ivaPct} % no está en Administrador › Parámetros de presupuesto.");
        }
    }
    $iva = calculoIva($subtotal, $ivaPct / 100);
    // Comisiones y anexo de seguro: porcentajes del subtotal
    foreach ($d['comisiones'] ?? [] as $i => $c) $d['comisiones'][$i]['total'] = calculoComision($subtotal, numero($c['porcentaje'] ?? 0, 4));
    foreach ($d['seguros'] ?? [] as $i => $s) {
        $d['seguros'][$i]['total'] = calculoSeguro($subtotal, numero($s['porcentaje_1'] ?? 0), numero($s['porcentaje_2'] ?? 0));
    }
    $enc = [
        'fecha'             => $fecha,
        'cliente'           => $cliente,
        'proyecto'          => texto($d['proyecto'] ?? '', 200),
        'ubicacion'         => texto($d['ubicacion'] ?? '', 150),
        'vendedor_obra_id'  => null,
        'estatus'           => $estatus,
        'utilidad_neta_por' => $util,
        'cos_primo'         => round($suma['MP'] + $suma['MO'], 2),
        'gas_operacion'     => round($suma['GO'], 2),
        'utilidad_neta'     => round($subtotal - $costo, 2),
        'subtotal'          => $subtotal,
        'iva'               => $iva,
        'total'             => round($subtotal + $iva, 2),
        'notas'             => texto($d['notas'] ?? '', 32000),
    ];
    $idHs = preg_replace('/\D/', '', (string) ($d['id_hs'] ?? ''));
    if (bd_tiene_columna('AW', 'doctos_sugerido_obra', 'id_hs')) $enc['id_hs'] = $idHs !== '' && $idHs !== '0' ? $idHs : null;
    if (bd_tiene_columna('AW', 'doctos_sugerido_obra', 'correo_electronico')) $enc['correo_electronico'] = texto($d['email'] ?? '', 150);
    if (bd_tiene_columna('AW', 'doctos_sugerido_obra', 'utilidad_modo')) $enc['utilidad_modo'] = $margen ? 'margen' : 'costo';
    if (bd_tiene_columna('AW', 'doctos_sugerido_obra', 'iva_pct')) $enc['iva_pct'] = $ivaPct;
    // Cada Guardar deja su renglón en la bitácora de cambios aunque no cambie el encabezado (migraciones/015)
    if (bd_tiene_columna('AW', 'doctos_sugerido_obra', 'modificado_en')) $enc['modificado_en'] = date('c');
    if (bd_tiene_columna('AW', 'doctos_sugerido_obra', 'datos_obra')) $enc['datos_obra'] = datosObra($d['obra_datos'] ?? []);
    $analisis = analisisPUDatos($d['analisis_pu'] ?? []);
    if (bd_tiene_columna('AW', 'doctos_sugerido_obra', 'analisis_pu')) {
        $enc['analisis_pu'] = analisisPU($analisis);
    } elseif (!empty($d['analisis_pu']['conceptos'])) {
        // Sin la columna se perderían los conceptos analizados (y sus importes en MP / MO al volver a abrirlo)
        error('Para guardar el Análisis P.U. falta preparar la base: corre Consultas/aw_presupuesto_analisis_pu.sql (AW-Management) '
            . 'o Consultas/supabase_presupuesto_analisis_pu.sql (Supabase), o quita los conceptos de la pestaña Análisis P.U.');
    }

    // actualiza_relacion_contacto_hubspot: sin el contacto en HubSpot se guarda igual, solo sin negocio
    $hsContactos = null;
    $hsAvisos = [];
    if (hsActivo()) {
        try {
            $hsContactos = hsContactos($email);
        } catch (Throwable $e) {
            error('No se pudo consultar el contacto en HubSpot, el presupuesto no se guardó: ' . $e->getMessage(), 502);
        }
        if (!$hsContactos) $hsAvisos[] = "El correo $email no está en HubSpot: el presupuesto se guardó sin crear ni actualizar su negocio.";
    } else {
        $hsAvisos[] = 'HubSpot no está configurado (servicio HUBSPOT_API): el presupuesto se guardó sin actualizar su negocio.';
    }

    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        $enc['vendedor_obra_id'] = vendedorId(texto($d['vendedor'] ?? '', 150));

        if ($id) {
            // El estatus se revisa otra vez con el presupuesto apartado (pudieron aceptarlo mientras se capturaba)
            $b = presupuestoBloquear($id);
            if (!$b) error('El presupuesto ya no existe (¿lo eliminaron?).', 404);
            if (estatusBloqueaCambios($b['estatus'])) error("El presupuesto está {$b['estatus']}: ya no es posible hacerle modificaciones.");
            $enc['estatus'] = $b['estatus'];
            bd_ejecutar('AW', 'update doctos_sugerido_obra set ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($enc)))
                . ' where docto_sugerido_obra_id = ?', array_merge(array_values($enc), [$id]));
            // Los renglones se reemplazan completos (con sus artículos importados y el detalle del Form46)
            bd_ejecutar('AW', 'delete from doctos_suge_obra_det_mat where docto_sugerido_obra_det_id in
                                 (select docto_sugerido_obra_det_id from doctos_sugerido_obra_det where docto_sugerido_obra_id = ?)', [$id]);
            bd_ejecutar('AW', 'delete from doctos_sugerido_obra_det where docto_sugerido_obra_id = ?', [$id]);
            borrarDetalles($id);
        } else {
            // folio 0 / sin folio: lo asigna el trigger (Firebird) o la secuencia (Supabase)
            $enc['usuario_creador'] = mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50);
            if (bd_motor('AW') === 'firebird') $enc['folio'] = 0;
            $id = bd_insertar('AW', 'doctos_sugerido_obra', 'docto_sugerido_obra_id', $enc);
        }

        $cache = [];
        $conCalculo = bd_tiene_columna('AW', 'doctos_sugerido_obra_det', 'calculo_base');
        foreach ($conceptos as $c) {
            $docto = (int) ($c['docto_imp_id'] ?? 0);
            $detId = bd_insertar('AW', 'doctos_sugerido_obra_det', 'docto_sugerido_obra_det_id', calculoRenglon($conCalculo ? $c['gasto'] ?? null : null) + [
                'docto_sugerido_obra_id' => $id,
                'concepto_id'            => conceptoId($c['tipo'], $c['concepto'], $cache),
                'presupuesto'            => numero($c['presupuesto'] ?? 0),
                'subtotal'               => numero($c['presupuesto'] ?? 0),
                'total'                  => numero($c['presupuesto'] ?? 0),
                'porcentaje'             => numero($c['porcentaje'] ?? 0),
                'docto_imp_id'           => !empty($c['importar']) && $docto ? $docto : null,
                'folio'                  => texto($c['folio'] ?? '', 20),
                'tipo_docto'             => texto($c['tipo_docto'] ?? '', 2),   // CM, ST, SD, SL o SF del documento importado
                'notas'                  => texto($c['notas'] ?? '', 32000),
                'tipo_concepto'          => $c['tipo'],
            ]);
            foreach ($c['articulos'] ?? [] as $a) {
                bd_insertar('AW', 'doctos_suge_obra_det_mat', 'docto_suge_obra_det_mat_id', [
                    'docto_sugerido_obra_det_id' => $detId,
                    'docto_id'       => (int) ($a['docto_id'] ?? 0) ?: null,
                    'fecha'          => preg_match('/^\d{4}-\d{2}-\d{2}/', (string) ($a['fecha'] ?? '')) ? substr($a['fecha'], 0, 10) : null,
                    'folio'          => texto($a['folio'] ?? '', 10),
                    'clave_cliente'  => texto($a['clave_cliente'] ?? '', 30),
                    'id_articulo'    => (int) ($a['id_articulo'] ?? 0) ?: null,
                    'clave_articulo' => texto($a['clave_articulo'] ?? '', 30),
                    'nom_articulo'   => texto($a['nom_articulo'] ?? '', 200),
                    'unidades'       => numero($a['unidades'] ?? 0),
                    'precio_unit'    => numero($a['precio_unit'] ?? 0),
                    'precio_total'   => numero($a['precio_total'] ?? 0),
                    'unid_medida'    => texto($a['unid_medida'] ?? '', 30),
                ]);
            }
        }
        guardarDetalles($id, $d, $cache);
        // Conceptos del Análisis P.U. en tablas (migraciones/017), con su id; sin la tabla quedan solo en el JSON
        $conceptosPU = presupuestoConceptosDisponible() ? presupuestoConceptosGuardar($id, $analisis ?? ['conceptos' => []]) : [];
        // Conceptos/Tareas (fechas, responsable, avance…); sin la tabla se guarda el resto del presupuesto
        if (isset($d['tareas']) && tareasDisponibles()) guardarTareas($id, (array) $d['tareas']);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    $folio = (int) bd_valor('AW', 'select folio from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$id]);

    // El negocio de HubSpot lo crea o actualiza ?accion=hubspot, que la pantalla llama enseguida con el formato
    // impreso del presupuesto ya con su folio (guarda_o_actualiza_sugerido_hs)
    return ['id' => $id, 'folio' => $folio, 'hubspot' => (bool) $hsContactos, 'avisos' => $hsAvisos, 'conceptos_pu' => (object) $conceptosPU];
}

// guarda_o_actualiza_sugerido_hs, después de guardar: { id, email, formato_html? } → { id_hs, avisos }
function sincronizarHubSpot(array $d): array
{
    $id = (int) ($d['id'] ?? 0);
    if (!hsActivo()) return ['id_hs' => null, 'avisos' => ['HubSpot no está configurado (servicio HUBSPOT_API).']];
    $conHs = bd_tiene_columna('AW', 'doctos_sugerido_obra', 'id_hs');
    $p = bd_fila('AW', 'select folio, proyecto, ubicacion, total, vendedor_obra_id' . ($conHs ? ', id_hs' : '') .
        (bd_tiene_columna('AW', 'doctos_sugerido_obra', 'correo_electronico') ? ', correo_electronico' : '') .
        ' from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$id]);
    if (!$p) error('El presupuesto no existe.', 404);
    $correo = trim((string) (($p['correo_electronico'] ?? '') ?: ($d['email'] ?? '')));
    try {
        $contactos = hsContactos($correo);
        if (!$contactos) return ['id_hs' => $p['id_hs'] ?? null, 'avisos' => ["HubSpot: No existe un contacto con el correo $correo."]];
        $hs = hsGuardarPresupuesto([
            'folio' => $p['folio'], 'proyecto' => (string) $p['proyecto'], 'ubicacion' => (string) $p['ubicacion'], 'total' => $p['total'],
            'id_hs' => $p['id_hs'] ?? '', 'vendedor_obra_id' => (int) $p['vendedor_obra_id'], 'usuario' => (string) ($_SESSION['usuario'] ?? ''),
        ], $contactos, isset($d['formato_html']) && is_string($d['formato_html']) ? mb_substr($d['formato_html'], 0, 3000000) : null);
    } catch (Throwable $e) {
        error_log('AcriGlass HubSpot presupuesto ' . $id . ': ' . $e->getMessage());
        return ['id_hs' => $p['id_hs'] ?? null, 'avisos' => ['El presupuesto se guardó, pero no se pudo actualizar el negocio en HubSpot: ' . $e->getMessage()]];
    }
    // actualiza_id_negosio_obra_saca_hs
    if ($conHs && $hs['id_hs'] && $hs['id_hs'] !== trim((string) ($p['id_hs'] ?? ''))) {
        bd_ejecutar('AW', 'update doctos_sugerido_obra set id_hs = ? where docto_sugerido_obra_id = ?', [$hs['id_hs'], $id]);
    }
    return $hs;
}

// Registra la obra del presupuesto (reg_obras) y la liga al presupuesto (doctos_sugerido_obra.obra_id).
// Si ya tiene obra, regresa la existente. El vendedor del presupuesto queda como responsable
// y el presupuesto pasa a Aceptado.
function registrarObra(array $d): array
{
    $autorizo = tienePermiso('NUEVO_OBRA', 'ADMIN_USER') ? null : autorizacion($d['autoriza'] ?? null, 'NUEVO_OBRA');
    $id = (int) ($d['id'] ?? 0);
    if (!$id) error('Guarda el presupuesto antes de registrar la obra.');
    $p = bd_fila('AW', 'select docto_sugerido_obra_id, folio, cliente, proyecto, ubicacion, vendedor_obra_id, estatus, obra_id
                          from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$id]);
    if (!$p) error('El presupuesto ya no existe (¿lo eliminaron?).', 404);
    $estatus = trim((string) $p['estatus']);
    if (in_array(mb_strtoupper($estatus), ['CANCELADO', 'RECHAZADO'], true)) error("El presupuesto está $estatus: no se puede registrar la obra.");

    // Ya registrada (por obra_id o por una obra que apunte al presupuesto)
    $obraId = presupuestoObra($id, (int) $p['obra_id']);
    if ($obraId) {
        if ((int) $p['obra_id'] !== $obraId) bd_ejecutar('AW', 'update doctos_sugerido_obra set obra_id = ? where docto_sugerido_obra_id = ?', [$obraId, $id]);
        $nom = (string) bd_valor('AW', 'select nom_obra from reg_obras where obra_id = ?', [$obraId]);
        return ['obra_id' => $obraId, 'nom_obra' => $nom, 'nueva' => false, 'estatus' => $estatus];
    }

    // Datos de la obra capturados en el presupuesto: dirección completa y notas (descripción, contacto, observaciones)
    $o = [];
    if (bd_tiene_columna('AW', 'doctos_sugerido_obra', 'datos_obra')) {
        $o = json_decode((string) bd_valor('AW', 'select datos_obra from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$id]), true) ?: [];
    }
    $direccion = implode(', ', array_filter([
        $o['direccion'] ?? null,
        !empty($o['colonia']) ? 'Col. ' . $o['colonia'] : null,
        !empty($o['codigo_postal']) ? 'C.P. ' . $o['codigo_postal'] : null,
        $o['ciudad'] ?? null,
        ($o['estado'] ?? null) !== ($o['ciudad'] ?? null) ? ($o['estado'] ?? null) : null,
    ]));
    $notas = implode("\n", array_filter([
        $o['descripcion'] ?? null,
        !empty($o['telefono']) ? 'Tel. ' . $o['telefono'] : null,
        !empty($o['mail']) ? 'Mail: ' . $o['mail'] : null,
        $o['observaciones'] ?? null,
        !empty($o['bloqueada']) ? 'Obra bloqueada' : null,
        !empty($o['maestra']) ? 'Obra maestra' : null,
    ]));

    $nombre = texto($d['nom_obra'] ?? '', 200) ?? texto($o['nombre'] ?? '', 200) ?? texto($p['proyecto'], 200) ?? texto($p['cliente'], 200);
    $obra = [
        'sugerido_id'      => $id,
        'nom_obra'         => $nombre,
        'direccion'        => texto($direccion, 200) ?? texto($p['ubicacion'], 200),
        'contacto'         => texto($p['cliente'], 150),
        'fecha_ini'        => date('Y-m-d'),
        'estatus'          => 'Planificacion',
        'fecha_creacion'   => date('Y-m-d H:i:s'),
        'usuario_creacion' => mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50),
    ];
    if ($autorizo !== null) $notas = trim($notas . "\nRegistro autorizado por $autorizo.");
    if ($notas !== '') $obra['notas'] = $notas;
    if (bd_tiene_columna('AW', 'reg_obras', 'gasto_administrativo')) $obra['gasto_administrativo'] = 26;
    if (bd_tiene_columna('AW', 'reg_obras', 'avance_obra')) $obra['avance_obra'] = 0;

    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        // Se vuelve a revisar con el presupuesto apartado: otra petición pudo registrar la obra mientras tanto
        $b = presupuestoBloquear($id);
        if (!$b) error('El presupuesto ya no existe (¿lo eliminaron?).', 404);
        if (in_array(mb_strtoupper($b['estatus']), ['CANCELADO', 'RECHAZADO'], true)) error("El presupuesto está {$b['estatus']}: no se puede registrar la obra.");
        if ($b['obra_id']) {
            bd_ejecutar('AW', 'update doctos_sugerido_obra set obra_id = ? where docto_sugerido_obra_id = ?', [$b['obra_id'], $id]);
            $pdo->commit();
            $nom = (string) bd_valor('AW', 'select nom_obra from reg_obras where obra_id = ?', [$b['obra_id']]);
            return ['obra_id' => $b['obra_id'], 'nom_obra' => $nom, 'nueva' => false, 'estatus' => $b['estatus']];
        }
        $obraId = bd_insertar('AW', 'reg_obras', 'obra_id', $obra);
        // Como en el sistema de escritorio: al registrar la obra el presupuesto queda Aceptado
        bd_ejecutar('AW', "update doctos_sugerido_obra set obra_id = ?, estatus = 'Aceptado' where docto_sugerido_obra_id = ?", [$obraId, $id]);
        presupuestoVersion($id, 'obra', $obraId);
        if ((int) $p['vendedor_obra_id']) {
            bd_insertar('AW', 'responsables_de_obra', 'res_obra_id', [
                'obra_id' => $obraId, 'vendedor_obra_id' => (int) $p['vendedor_obra_id'], 'fecha_hora_asig' => date('Y-m-d H:i:s'),
            ], 'id_elementos');   // mismo generador que el trigger RESPONSABLES_DE_OBRA_BI
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['obra_id' => $obraId, 'nom_obra' => $nombre, 'nueva' => true, 'estatus' => 'Aceptado'];
}

// Actualizar Estatus / Cancelar del Form46: requiere MODIFICAR_SUGERIDO_OBRA (o que otro usuario lo autorice)
function cambiarEstatus(array $d): array
{
    $id = (int) ($d['id'] ?? 0);
    if (!$id) error('Es necesario guardar el presupuesto antes de cambiar su estatus.');
    $nuevo = estatusValido($d['estatus'] ?? '');
    if ($nuevo === null) error('Estatus no válido.');
    $antes = estatusActual($id);
    if ($motivo = estatusTransicion($antes, $nuevo)) error($motivo);
    $autorizo = tienePermiso('MODIFICAR_SUGERIDO_OBRA', 'ADMIN_USER') ? null : autorizacion($d['autoriza'] ?? null, 'MODIFICAR_SUGERIDO_OBRA');
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        $b = presupuestoBloquear($id);
        if (!$b) error('El presupuesto ya no existe (¿lo eliminaron?).', 404);
        if ($motivo = estatusTransicion($b['estatus'], $nuevo)) error($motivo);
        // Con obra registrada el presupuesto queda como se aprobó: no se reabre para modificarlo
        if ($b['obra_id'] && mb_strtoupper($b['estatus']) === 'ACEPTADO' && mb_strtoupper($nuevo) !== 'ACEPTADO') {
            error("El presupuesto ya tiene una obra registrada: no se puede pasar a $nuevo. Los cambios de alcance se registran en la obra.");
        }
        bd_ejecutar('AW', 'update doctos_sugerido_obra set estatus = ? where docto_sugerido_obra_id = ?', [$nuevo, $id]);
        // Al aceptarse queda una copia congelada del presupuesto (presupuesto_versiones)
        if (mb_strtoupper($nuevo) === 'ACEPTADO') presupuestoVersion($id, 'aceptado', $b['obra_id'] ?: null);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['estatus' => $nuevo, 'autorizo' => $autorizo];
}

// Form46: solo se elimina un presupuesto Cancelado
function eliminar(array $d): void
{
    $id = (int) ($d['id'] ?? 0);
    if (!$id) error('Falta el presupuesto a eliminar.');
    $estatus = estatusActual($id);
    if (mb_strtoupper($estatus) !== 'CANCELADO') error("Solo se puede eliminar un presupuesto Cancelado (este está $estatus).");
    if (bd_valor('AW', 'select count(*) from reg_obras where sugerido_id = ?', [$id])) {
        error('No se puede eliminar: el presupuesto ya tiene una obra registrada.');
    }
    if (bd_tiene_tabla('AW', 'presupuesto_versiones') && bd_valor('AW', 'select count(*) from presupuesto_versiones where docto_sugerido_obra_id = ?', [$id])) {
        error('No se puede eliminar: el presupuesto ya fue aceptado y tiene versiones guardadas para auditoría. Déjalo Cancelado.');
    }
    if (!tienePermiso('MODIFICAR_SUGERIDO_OBRA', 'ADMIN_USER')) autorizacion($d['autoriza'] ?? null, 'MODIFICAR_SUGERIDO_OBRA');
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        borrarDetalles($id);
        if (tareasDisponibles()) bd_ejecutar('AW', 'delete from conceptos_tareas where docto_sugerido_obra_id = ?', [$id]);
        // Si otro presupuesto lo tenía relacionado, deja de estarlo
        bd_ejecutar('AW', 'delete from sugeridos_relacionados where sugerido_id_hijo = ?', [$id]);
        bd_ejecutar('AW', 'delete from doctos_suge_obra_det_mat where docto_sugerido_obra_det_id in
                             (select docto_sugerido_obra_det_id from doctos_sugerido_obra_det where docto_sugerido_obra_id = ?)', [$id]);
        bd_ejecutar('AW', 'delete from doctos_sugerido_obra_det where docto_sugerido_obra_id = ?', [$id]);
        bd_ejecutar('AW', 'delete from doctos_sugerido_obra where docto_sugerido_obra_id = ?', [$id]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

try {
    switch ($_GET['accion'] ?? '') {
        case 'guardar':
            responder(['ok' => true] + guardar(entrada()));
        case 'hubspot':
            responder(['ok' => true] + sincronizarHubSpot(entrada()));
        case 'registrar_obra':
            responder(['ok' => true] + registrarObra(entrada()));
        case 'estatus':
            responder(['ok' => true] + cambiarEstatus(entrada()));
        case 'autorizar':
            // «Modificar» sin el permiso: otro usuario con MODIFICAR_SUGERIDO_OBRA lo autoriza
            responder(['ok' => true, 'autorizo' => autorizacion(entrada()['autoriza'] ?? null, 'MODIFICAR_SUGERIDO_OBRA')]);
        case 'eliminar':
            eliminar(entrada());
            responder(['ok' => true]);
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/presupuestos: ' . $e->getMessage());
    error('No se pudo guardar en AW-Management: ' . bd_mensaje_error($e), 500);
}
