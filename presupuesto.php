<?php
require __DIR__ . '/includes/sesion.php';
exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_SUGERIDO_OBRA', 'MODIFICAR_SUGERIDO_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'CERRAR_OBRA', 'ADMIN_USER');
require __DIR__ . '/includes/servicios.php';
require __DIR__ . '/includes/conceptos.php';
require __DIR__ . '/includes/estatus.php';
require __DIR__ . '/includes/membrete.php';
require __DIR__ . '/includes/conceptos-tareas.php';
require __DIR__ . '/includes/pu.php';
require __DIR__ . '/includes/parametros-presupuesto.php';

// Presupuesto existente a abrir (sin id = nuevo)
$presupuestoId = max(0, (int) ($_GET['id'] ?? 0));

// Vendedores de obra de AW; si no hay, los vendedores activos de Easy-Glass (API v1)
$vendedores = [];
if (!modoConfiguracion()) {
    try {
        $vendedores = array_column(bd_filas('AW', "select nombre from vendedores_obras where estatus = 'A' order by nombre"), 'nombre');
    } catch (Throwable $e) {
        error_log('AcriGlass presupuesto vendedores: ' . $e->getMessage());
    }
}
// Form46: cmb_vendedor sale solo del catálogo de vendedores de obra (retorna_vendedores_obra)
$vendedores = array_values(array_unique(array_filter(array_map('trim', $vendedores))));

// Conceptos de Materia Prima / Mano de Obra / Gastos de Operacion (Administrador › Conceptos de …)
$conceptos = ['mp' => [], 'mo' => [], 'go' => []];
$fijos = ['mano_obra' => ACRI_CONCEPTOS_FIJOS['mano_obra']['descripcion'], 'comisiones' => ACRI_CONCEPTOS_FIJOS['comisiones']['descripcion']];
// Empleados (Mano de Obra × días) y tipos de empleado (comisiones) del Form46
$empleados = $tiposComision = [];
// % de Utilidad Neta por defecto: parámetro de costos 101 (Form46.carga_inicial)
$utilidadDefecto = 40;
if (!modoConfiguracion()) {
    try {
        $conceptos = conceptosPresupuesto();
        $fijos = conceptosFijosNombres($conceptos);
    } catch (Throwable $e) {
        error_log('AcriGlass presupuesto conceptos: ' . $e->getMessage());
    }
    try {
        $empleados = bd_filas('AW', "select empleado_id, numero_empleado, nombre, sueldo_diario from empleados_obra
                                      where estatus = 'A' order by nombre");
        $tiposComision = bd_filas('AW', 'select tipo_empleado_id, nombre, porcentaje from tipos_empleados_comisiones order by nombre');
    } catch (Throwable $e) {
        error_log('AcriGlass presupuesto empleados: ' . $e->getMessage());
    }
    try {
        $v = bd_valor('AW', 'select valor from parametros_costos_sug where clave = 101');
        if (is_numeric($v) && $v >= 0 && $v < 100) $utilidadDefecto = round((float) $v, 4);
    } catch (Throwable $e) {
        error_log('AcriGlass presupuesto utilidad: ' . $e->getMessage());
    }
}

// Análisis P.U.: conceptos e insumos ya capturados en otros presupuestos, para copiarlos sin volver a armarlos
// (lo más reciente gana). { conceptos: [{descripcion, unidad, partida, folio, insumos}], insumos: [{tipo, descripcion, unidad, costo}] }
$bibliotecaPU = ['conceptos' => [], 'insumos' => []];
if (!modoConfiguracion()) {
    try {
        if (bd_tiene_columna('AW', 'doctos_sugerido_obra', 'analisis_pu')) {
            $sql = 'select %s docto_sugerido_obra_id as id, folio, analisis_pu from doctos_sugerido_obra
                     where analisis_pu is not null and docto_sugerido_obra_id <> ? order by docto_sugerido_obra_id desc %s';
            $sql = bd_motor('AW') === 'firebird' ? sprintf($sql, 'first 200', '') : sprintf($sql, '', 'limit 200');
            $vistosC = $vistosI = [];
            foreach (bd_filas('AW', $sql, [$presupuestoId]) as $f) {
                $a = json_decode((string) $f['analisis_pu'], true);
                foreach (($a['conceptos'] ?? []) as $c) {
                    $k = mb_strtoupper(trim((string) ($c['descripcion'] ?? ''))) . '|' . mb_strtoupper(trim((string) ($c['unidad'] ?? '')));
                    if (empty($c['insumos']) || $k === '|' || isset($vistosC[$k]) || count($vistosC) >= 400) continue;
                    $vistosC[$k] = 1;
                    $bibliotecaPU['conceptos'][] = ['descripcion' => $c['descripcion'], 'unidad' => $c['unidad'] ?? '', 'partida' => $c['partida'] ?? '',
                                                    'especificacion' => $c['especificacion'] ?? '',
                                                    'folio' => (int) $f['folio'], 'insumos' => $c['insumos']];
                    foreach ($c['insumos'] as $i) {
                        $ki = ($i['tipo'] ?? '') . '|' . mb_strtoupper(trim((string) ($i['descripcion'] ?? '')));
                        if (trim((string) ($i['descripcion'] ?? '')) === '' || isset($vistosI[$ki]) || count($vistosI) >= 800) continue;
                        $vistosI[$ki] = 1;
                        $bibliotecaPU['insumos'][] = ['tipo' => $i['tipo'] ?? 'MAT', 'descripcion' => $i['descripcion'], 'unidad' => $i['unidad'] ?? '', 'costo' => (float) ($i['costo'] ?? 0)];
                    }
                }
            }
        }
    } catch (Throwable $e) {
        error_log('AcriGlass presupuesto biblioteca P.U.: ' . $e->getMessage());
    }
}

// Administrador › Parámetros de presupuesto: utilidad, indirectos, financiamiento e IVA de un presupuesto nuevo
$paramsPres = parametrosPresupuestoDefecto();
if (!modoConfiguracion()) {
    try {
        $paramsPres = parametrosPresupuesto();
    } catch (Throwable $e) {
        error_log('AcriGlass presupuesto parámetros: ' . $e->getMessage());
    }
}
if ($paramsPres['utilidad_pct'] !== null) $utilidadDefecto = (float) $paramsPres['utilidad_pct'];
// Sin % configurado se usa el parámetro 101 del escritorio, que en Form46 es margen: costo / ((100 − %) × 0.01)
else $paramsPres['utilidad_modo'] = 'margen';
$paramsJs = [
    'utilidad_modo' => $paramsPres['utilidad_modo'], 'financiamiento_pct' => (float) $paramsPres['financiamiento_pct'],
    'indirectos' => array_keys(parametrosIndirectosActivos($paramsPres)),
    'iva_tasas' => $paramsPres['iva_tasas'], 'iva_defecto' => (float) $paramsPres['iva_defecto'],
    'tipo_cambio_usd' => 0,
];
// Tipo de cambio vigente (Catalogos › Tipos de cambio) para el «Total en dólares» del resumen del catálogo
if (!modoConfiguracion()) {
    try {
        $paramsJs['tipo_cambio_usd'] = (float) (puTiposCambio()['USD'] ?? 0);
    } catch (Throwable $e) {
        error_log('AcriGlass presupuesto tipo de cambio: ' . $e->getMessage());
    }
}

// Análisis P.U.: insumos del catálogo (Catalogos › Insumos) con su precio vigente en pesos, para sugerirlos primero.
// La mano de obra va con su salario base (sin FSR): el análisis le aplica su propio FSR y así no se aplica dos veces.
// Los básicos no se ofrecen todavía: su costo ya trae el FSR de su mano de obra.
$catalogoPU = [];
if (!modoConfiguracion()) {
    try {
        if (puDisponible()) {
            $tc = puTiposCambio();
            foreach (bd_filas('AW', "select i.clave, i.descripcion, i.tipo, u.clave as unidad, p.precio, p.moneda
                                       from insumos i join unidades u on u.unidad_id = i.unidad_id
                                       join insumos_precio_vigente p on p.insumo_id = i.insumo_id
                                      where i.estatus = 'A' and i.tipo <> 'BAS' order by i.clave") as $f) {
                $cambio = puTipoCambio(trim($f['moneda']), $tc);
                if ($cambio === null) continue;
                $catalogoPU[] = ['tipo' => ['MAT' => 'MAT', 'MO' => 'MO', 'EQ' => 'EQ', 'HER' => 'EQ'][$f['tipo']] ?? 'MAT',
                                 'descripcion' => $f['descripcion'], 'clave' => $f['clave'], 'unidad' => $f['unidad'],
                                 'costo' => round((float) $f['precio'] * $cambio, 6)];
            }
        }
    } catch (Throwable $e) {
        error_log('AcriGlass presupuesto catálogo P.U.: ' . $e->getMessage());
    }
}

// Análisis P.U.: conceptos del catálogo (Catalogos › Conceptos P.U.) con su matriz ya desarmada en insumos simples
// (MO con salario base), para copiarlos al escribir su descripción. Los que tienen insumos sin precio se marcan.
$conceptosPU = [];
if (!modoConfiguracion()) {
    try {
        if (puDisponible() && bd_tiene_tabla('AW', 'conceptos_pu')) {
            [$insumosCat, $componentesCat] = puCargarCatalogo();
            $tcCat = puTiposCambio();
            $matricesCat = [];
            foreach (bd_filas('AW', 'select concepto_pu_id, insumo_id, cantidad, rendimiento, desperdicio_pct from concepto_pu_insumos order by concepto_pu_id, orden') as $r) {
                $matricesCat[(int) $r['concepto_pu_id']][] = $r;
            }
            foreach (bd_filas('AW', "select c.concepto_pu_id, c.codigo, c.descripcion, c.descripcion_tecnica, c.familia, u.clave as unidad
                                       from conceptos_pu c join unidades u on u.unidad_id = c.unidad_id
                                      where c.estatus = 'A' order by c.codigo limit 1000") as $c) {
                $m = $matricesCat[(int) $c['concepto_pu_id']] ?? [];
                if (!$m) continue;
                try {
                    $a = puAplanarMatriz($m, $insumosCat, $componentesCat, $tcCat);
                } catch (Throwable $e) {
                    continue;
                }
                $conceptosPU[] = ['codigo' => $c['codigo'], 'descripcion' => $c['descripcion'], 'unidad' => $c['unidad'], 'partida' => $c['familia'] ?? '',
                                  'especificacion' => (string) ($c['descripcion_tecnica'] ?? ''),
                                  'faltan' => $a['faltan'],
                                  'insumos' => array_map(fn($i) => ['tipo' => $i['tipo'], 'descripcion' => $i['descripcion'], 'unidad' => $i['unidad'],
                                                                     'cantidad' => $i['cantidad'], 'rinde' => 0, 'costo' => $i['costo'] ?? 0], $a['insumos'])];
            }
        }
    } catch (Throwable $e) {
        error_log('AcriGlass presupuesto conceptos P.U.: ' . $e->getMessage());
    }
}

// FASAR activos (Catalogos › Parámetros de costos) para el FSR de la mano de obra: botón FASAR y ventana del análisis
$fasarPU = [];
if (!modoConfiguracion()) {
    try {
        if (bd_tiene_tabla('AW', 'fasar')) {
            foreach (bd_filas('AW', "select fasar_id, nombre, dias_calendario, dias_pagados, dias_no_laborados, obligaciones, tp, tl, ps, fsr
                                       from fasar where estatus = 'A' order by nombre") as $f) {
                foreach (['dias_pagados', 'dias_no_laborados', 'obligaciones'] as $k) $f[$k] = json_decode((string) $f[$k], true) ?: [];
                foreach (['dias_calendario', 'tp', 'tl', 'ps', 'fsr'] as $k) $f[$k] = (float) $f[$k];
                $f['fasar_id'] = (int) $f['fasar_id'];
                $fasarPU[] = $f;
            }
        }
    } catch (Throwable $e) {
        error_log('AcriGlass presupuesto FASAR: ' . $e->getMessage());
    }
}

// Plantillas de presupuesto activas (Catalogos › Plantillas de presupuesto): sus conceptos por código del catálogo
$plantillasPU = [];
if (!modoConfiguracion() && $conceptosPU) {
    try {
        if (bd_tiene_tabla('AW', 'plantillas_presupuesto')) {
            $porId = [];
            foreach (bd_filas('AW', "select p.plantilla_id, p.nombre, c.codigo, pc.cantidad, pc.partida
                                       from plantillas_presupuesto p
                                       join plantilla_conceptos pc on pc.plantilla_id = p.plantilla_id
                                       join conceptos_pu c on c.concepto_pu_id = pc.concepto_pu_id
                                      where p.estatus = 'A' order by p.nombre, pc.orden, pc.plantilla_concepto_id") as $f) {
                $k = (int) $f['plantilla_id'];
                if (!isset($porId[$k])) $porId[$k] = ['nombre' => $f['nombre'], 'conceptos' => []];
                $porId[$k]['conceptos'][] = ['codigo' => $f['codigo'], 'cantidad' => (float) $f['cantidad'], 'partida' => (string) ($f['partida'] ?? '')];
            }
            $plantillasPU = array_values($porId);
        }
    } catch (Throwable $e) {
        error_log('AcriGlass presupuesto plantillas: ' . $e->getMessage());
    }
}

// Estatus del menú «Actualizar Estatus» (Administrador › Estatus de Presupuestos)
try {
    $estatus = estatusPresupuesto();
} catch (Throwable $e) {
    error_log('AcriGlass presupuesto estatus: ' . $e->getMessage());
    $estatus = array_map(fn($d) => $d + ['sistema' => false], ACRI_ESTATUS_DEFECTO);
}

// Hoja membretada de Imprimir / Imprimir Detalle (Administrador › Hoja Membretada)
try {
    $membrete = membreteImpresion();
} catch (Throwable $e) {
    error_log('AcriGlass presupuesto membrete: ' . $e->getMessage());
    $membrete = ACRI_MEMBRETE_DEFECTO + ['logo' => imagenSistema('logo'), 'logo_propio' => false];
}

// Un presupuesto guardado se abre en solo lectura; «Modificar» lo habilita con este permiso
$puedeModificar = tienePermiso('MODIFICAR_SUGERIDO_OBRA', 'ADMIN_USER');
$puedeRegistrarObra = tienePermiso('NUEVO_OBRA', 'ADMIN_USER');

// Secciones del presupuesto (pestañas verticales)
$secciones = [
    'cc' => 'Catálogo de Conceptos',
    'mp' => 'Materia Prima',
    'mo' => 'Mano de Obra',
    'go' => 'Gastos de Operacion',
    'pu' => 'Análisis P.U.',
    'ex' => 'Explosión',
    'an' => 'Análisis',
];
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Presupuesto de Obra · AcriGlass</title>
    <meta name="acri-token" content="<?= e($_SESSION['csrf']) ?>">
    <link rel="icon" href="<?= e(imagenSistema('favicon')) ?>">
    <link rel="stylesheet" href="<?= recurso('css/presupuesto.css') ?>">
    <link rel="stylesheet" href="<?= recurso('css/formato-presupuesto.css') ?>">
    <link rel="stylesheet" href="<?= recurso('css/recorrido.css') ?>">
    <script src="<?= recurso('js/tema.js') ?>"></script>
</head>
<body data-presupuesto="<?= $presupuestoId ?>">

<!-- Barra de herramientas -->
<header class="toolbar">
    <button class="tb" data-accion="guardar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h8V3"/><path d="M8 21v-7h8v7"/></svg>
        <span>Guardar</span>
    </button>
    <button class="tb" data-accion="guardar-cerrar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M12 21H5V3h11l3 3v6"/><path d="M8 3v5h8V3"/><path d="M14 18l2.5 2.5L21 16"/></svg>
        <span>Guardar y Cerrar</span>
    </button>
    <span class="sep"></span>
    <div class="tb-drop">
        <button class="tb" data-accion="imprimir">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>
            <span>Imprimir <small>▾</small></span>
        </button>
        <div class="menu">
            <button data-imprimir="normal">Imprimir</button>
            <button data-imprimir="detalle">Imprimir Detalle</button>
            <button data-imprimir="propuesta">Propuesta para el cliente (PDF)</button>
            <button data-imprimir="pu">Imprimir Precios Unitarios</button>
            <button data-imprimir="pu-detalle">Imprimir Análisis de P.U.</button>
            <button data-imprimir="analisis">Análisis de Cancelería</button>
            <button data-imprimir="catalogo">Catálogo de Conceptos</button>
            <button data-versiones>Versiones aprobadas…</button>
        </div>
    </div>
    <button class="tb" data-accion="modificar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/></svg>
        <span>Modificar</span>
    </button>
    <button class="tb" data-accion="duplicar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>
        <span>Duplicar</span>
    </button>
    <button class="tb" data-accion="prueba" title="Llena un presupuesto nuevo con datos de PRUEBA en todos los apartados y explica de dónde sale cada dato. No guarda nada.">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/></svg>
        <span>Prueba</span>
    </button>
    <span class="sep"></span>
    <div class="tb-drop">
        <button class="tb" data-accion="estatus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9"/><path d="M18.5 3v4h-4M5.5 21v-4h4"/></svg>
            <span>Actualizar Estatus <small>▾</small></span>
        </button>
        <div class="menu menu-estatus">
            <?php foreach ($estatus as $e): if (!$e['activo']) continue; ?>
            <button data-estatus="<?= e($e['nombre']) ?>" class="c-<?= e($e['color']) ?>"<?= $e['descripcion'] !== '' ? ' title="' . e($e['descripcion']) . '"' : '' ?>>
                <i></i><?= e($e['descripcion'] !== '' ? $e['descripcion'] : $e['nombre']) ?>
            </button>
            <?php endforeach; ?>
        </div>
    </div>
    <button class="tb" data-accion="registrar-obra">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9.5 21v-6h5v6M9 10.5h.01M15 10.5h.01"/></svg>
        <span>Registrar Obra</span>
    </button>
    <span class="sep"></span>
    <button class="tb peligro" data-accion="cancelar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>
        <span>Cancelar</span>
    </button>
    <button class="tb" data-accion="bitacora" title="Bitácora de cambios: quién movió el presupuesto y cuándo (solo consulta)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M5 4a1 1 0 0 1 1-1h12v18H6a1 1 0 0 1-1-1z"/><path d="M5 17.5A1.5 1.5 0 0 1 6.5 16H18"/><path d="M9 7h6M9 10.5h6"/></svg>
        <span>Bitácora</span>
    </button>
    <button class="tb" data-accion="sobrecosto" title="Sobrecosto: indirectos, financiamiento, utilidad y cargos sobre el costo directo, y el factor de sobrecosto">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M4 20h16"/><rect x="5" y="13" width="3.5" height="7"/><rect x="10.25" y="9" width="3.5" height="11"/><rect x="15.5" y="4" width="3.5" height="16"/></svg>
        <span>Sobrecosto</span>
    </button>
    <button class="tb" data-accion="fasar" title="FASAR: Factor de Salario Real de la mano de obra (salario base × FSR = salario real)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><circle cx="9" cy="7" r="3.2"/><path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2"/><path d="M14 21l7-7"/><circle cx="15" cy="15" r="1.3"/><circle cx="20" cy="20" r="1.3"/></svg>
        <span>FASAR</span>
    </button>
    <button class="tb" data-accion="calculo" title="Cálculo al periodo de corte: lo que se requiere hasta una fecha y las actividades programadas en ese periodo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M13 13.5v4.5M11 15.5l2 2.5 2-2.5"/></svg>
        <span>Cálculo</span>
    </button>
    <button class="tb" data-accion="completo" title="Presupuesto completo: todos los conceptos por partida y subpartida con su costo directo, P.U., importe, % y familia">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M3.5 8.5h17M9 8.5v12M12 12h5.5M12 15.5h5.5"/></svg>
        <span>Presupuesto completo</span>
    </button>
    <button class="tb peligro" data-accion="eliminar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
        <span>Eliminar</span>
    </button>
    <span class="sep"></span>
    <button class="tb" data-accion="cerrar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        <span>Cerrar</span>
    </button>
    <span class="sep"></span>
    <button class="tb" id="btnTour" title="Recorrido guiado del presupuesto">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/></svg>
        <span>Tour</span>
    </button>

    <span class="modo" id="modo" hidden title="Presiona «Modificar» para cambiar el presupuesto">🔒 Solo lectura</span>
    <div class="estatus c-<?= e(array_column($estatus, 'color', 'nombre')['Pendiente'] ?? 'ambar') ?>" id="estatus">Pendiente</div>
</header>

<!-- Pestañas del documento -->
<nav class="doc-tabs">
    <button class="doc-tab activo" data-vista="documento">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="1.5" width="10" height="13" rx="1"/><path d="M5.5 5h5M5.5 8h5M5.5 11h3"/></svg>
        Documento
    </button>
    <button class="doc-tab" data-vista="sugeridos">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="2.5" width="13" height="10" rx="1"/><path d="M4 6h8M4 9h4"/><circle cx="12.5" cy="12.5" r="2.5" fill="#22c55e" stroke="none"/></svg>
        Sugeridos relacionados
    </button>
</nav>

<!-- ============ VISTA: DOCUMENTO ============ -->
<section class="vista visible" data-vista="documento">

    <!-- Encabezado -->
    <div class="encabezado">
        <div class="enc-izq">
            <label>Cliente:   <input type="text" id="cliente"></label>
            <label>Email:
                <span class="con-boton">
                    <input type="email" id="email">
                    <button type="button" class="mini" id="buscarHubspot" title="Buscar el contacto en HubSpot">
                        <svg viewBox="0 0 16 16"><circle cx="10" cy="9" r="3" fill="none" stroke="#f26b3a" stroke-width="2"/><path d="M3 3l5 4M3 14l5-3M10 3v3" stroke="#f26b3a" stroke-width="2"/></svg>
                    </button>
                </span>
            </label>
            <label>Proyecto:  <input type="text" id="proyecto"></label>
            <label>Ubicacion: <input type="text" id="ubicacion"></label>
        </div>

        <!-- Datos de la obra (ventana Nueva obra): se usan al «Registrar Obra» -->
        <div class="enc-obra">
            <label>Nombre: <input type="text" id="obraNombre" maxlength="200" placeholder="Nombre de la obra"></label>
            <label>Teléfono: <input type="text" id="obraTelefono" maxlength="30"></label>
            <label>Mail: <input type="email" id="obraMail" maxlength="150"></label>
            <label>Dirección: <input type="text" id="obraDireccion" maxlength="200"></label>
            <label>Colonia: <input type="text" id="obraColonia" maxlength="100"></label>
            <label>C. P.: <input type="text" id="obraCp" maxlength="10"></label>
            <label>Ciudad: <input type="text" id="obraCiudad" maxlength="100" value="Ciudad de México"></label>
            <label>Estado: <input type="text" id="obraEstado" maxlength="100" value="Ciudad de México"></label>
            <div class="obra-checks">
                <label><input type="checkbox" id="obraBloqueada"> Obra bloqueada</label>
                <label><input type="checkbox" id="obraMaestra"> Obra maestra</label>
            </div>
            <label class="ancho">Descripción: <input type="text" id="obraDescripcion" maxlength="500"></label>
            <label class="ancho">Observaciones: <input type="text" id="obraObservaciones" maxlength="500"></label>
        </div>

        <div class="enc-der">
            <div class="negocio">Id de Negocio: <a href="#" id="idNegocio" title="Abrir el negocio en HubSpot">0</a></div>
            <div class="fila">
                <label class="corto">Folio <input type="text" id="folio" value="0" readonly class="num"></label>
                <label class="corto">Fecha: <input type="date" id="fecha" value="<?= date('Y-m-d') ?>"></label>
            </div>
            <label class="vendedor">Vendedor:
                <select id="vendedor">
                    <?php foreach ($vendedores as $v): ?>
                    <option><?= htmlspecialchars($v) ?></option>
                    <?php endforeach; ?>
                </select>
            </label>
            <div class="obra"><strong>OBRA:</strong> <span id="obra"></span></div>
        </div>

        <!-- Como la cinta de Excel: oculta o muestra el encabezado -->
        <button type="button" class="enc-plegar" id="encPlegar" title="Ocultar el encabezado" aria-expanded="true">
            <svg viewBox="0 0 12 12"><path d="M2 8.5L6 4l4 4.5z" fill="currentColor"/></svg>
        </button>
    </div>

    <!-- Conceptos -->
    <div class="conceptos">
        <nav class="sec-tabs">
            <?php foreach ($secciones as $clave => $nombre): ?>
            <button class="sec-tab<?= $clave === 'mp' ? ' activo' : '' ?>" data-sec="<?= $clave ?>"><span><?= $nombre ?></span></button>
            <?php endforeach; ?>
        </nav>

        <div class="sec-cuerpo">
            <div class="sec-titulo">
                <strong id="secNombre">Materia Prima:</strong>
                <span id="secAyuda">Ctrl + I para agregar un nuevo Concepto</span>
            </div>

            <!-- Conceptos/Tareas: se generan solos con lo capturado en MP / MO / GO; ya no tienen pestaña en el presupuesto,
                 pero se siguen guardando con él para el programa de la Obra (13-Conceptos/Tareas) -->
            <?php ctPanel(true); ?>

            <!-- Catálogo de Conceptos (como Neodata): los conceptos del Análisis P.U. por partida y subpartida,
                 con clave, unidad, cantidad, P.U., importe y % de cada partida; el total con letra -->
            <div class="cc-panel" id="ccPanel" hidden>
                <section class="extra cc-catalogo">
                    <div class="extra-barra">
                        <button type="button" class="ct-btn" id="ccPartida" title="Nueva partida (agrupa conceptos, ej. «Cancelería»)">+ Partida</button>
                        <button type="button" class="ct-btn" id="ccSubpartida" title="Nueva subpartida dentro de la partida seleccionada">+ Subpartida</button>
                        <button type="button" class="ct-btn" id="ccConcepto" title="Nuevo concepto en la partida seleccionada (Ctrl + I)">+ Concepto</button>
                        <?php if ($plantillasPU): ?>
                        <select id="ccPlantilla" class="ct-btn" title="Agrega todos los conceptos de una plantilla con los precios vigentes del catálogo">
                            <option value="">+ Desde plantilla…</option>
                            <?php foreach ($plantillasPU as $i => $pl): ?>
                            <option value="<?= $i ?>"><?= e($pl['nombre']) ?> (<?= count($pl['conceptos']) ?>)</option>
                            <?php endforeach; ?>
                        </select>
                        <?php endif; ?>
                        <button type="button" class="ct-btn" id="ccRenumerar" title="Vuelve a poner las claves en orden por partida: 01-001, 01.01-001…">Renumerar claves</button>
                        <button type="button" class="ct-btn" id="ccImportar" title="Agrega conceptos copiados de Excel o de un archivo CSV (Código, Concepto, Unidad, Cantidad, P. Unitario…)">Importar de Excel</button>
                        <button type="button" class="ct-btn" id="ccExportar" title="Descarga el catálogo para abrirlo en Excel">Exportar a Excel</button>
                        <input type="search" id="ccBuscar" class="cc-buscar" placeholder="Buscar clave o descripción" autocomplete="off">
                    </div>
                    <div class="extra-caja">
                        <table class="grid mini-grid cc-grid">
                            <thead><tr><th class="c-id cc-clave">Código</th><th>Concepto</th><th class="cc-unidad">Unidad</th><th class="c-num">Cantidad</th><th class="c-num">P. Unitario</th><th class="c-num">Importe</th><th class="c-pct">%</th><th class="cc-acc"></th></tr></thead>
                            <tbody id="ccCuerpo"></tbody>
                            <tfoot id="ccPie"></tfoot>
                        </table>
                    </div>
                </section>
            </div>

            <!-- Análisis (como la hoja de Excel): se llena solo con lo capturado en MP / MO / GO, con Costo Primo,
                 márgenes, Gastos de Operacion y Utilidad Neta -->
            <div class="cc-panel" id="anPanel" hidden>
                <section class="extra ccr-resumen">
                    <div class="extra-barra">
                        <button type="button" class="ct-btn" id="anImportar" title="Pone los importes de Materia Prima, Mano de Obra y Gastos de Operacion desde la hoja de Excel del Análisis">Importar de Excel</button>
                        <button type="button" class="ct-btn" id="anExportar" title="Descarga el Análisis para abrirlo en Excel">Exportar a Excel</button>
                        <span class="extra-ayuda">Clic en un renglón para ir a capturarlo</span>
                    </div>
                    <div class="extra-caja">
                        <table class="grid mini-grid ccr-grid">
                            <thead><tr><th class="ccr-anexo">Anexos</th><th>Partidas</th><th class="c-num">Presupuesto sugerido</th><th class="c-num">Subtotal</th><th class="c-num">Total</th><th class="c-pct">%</th></tr></thead>
                            <tbody id="ccrCuerpo"></tbody>
                        </table>
                    </div>
                </section>
            </div>

            <!-- Explosión de insumos (como Neodata): todo lo que llevan los conceptos, de toda la obra o de uno, con las matrices
                 dentro de matrices desarmadas hasta sus insumos básicos -->
            <div class="cc-panel" id="exPanel" hidden>
                <section class="extra ex-explosion">
                    <div class="extra-barra">
                        <label>Ver: <select id="exConcepto" class="ct-btn"><option value="">Toda la obra</option></select></label>
                        <label class="ex-check" title="Las cuadrillas, básicos y demás insumos compuestos se muestran desarmados en lo que llevan"><input type="checkbox" id="exDesglosar" checked> Desarmar las matrices dentro de matrices</label>
                        <button type="button" class="ct-btn" id="exExportar" title="Descarga la explosión para abrirla en Excel">Exportar a Excel</button>
                        <span class="extra-ayuda" id="exNota"></span>
                    </div>
                    <div class="extra-caja">
                        <table class="grid mini-grid">
                            <thead><tr><th class="c-id">Código</th><th>Insumo</th><th>Tipo</th><th>Unidad</th><th class="c-num">Cantidad</th><th class="c-num">Costo prom.</th><th class="c-num">Importe</th><th class="c-pct">%</th></tr></thead>
                            <tbody id="exCuerpo"></tbody>
                            <tfoot id="exPie"></tfoot>
                        </table>
                    </div>
                </section>
            </div>

            <!-- Análisis de Precios Unitarios (como Neodata): conceptos con cantidad × P.U. y su análisis de insumos.
                 Lo que se captura aquí pasa solo a Materia Prima y Mano de Obra; lo capturado por importe se respeta. -->
            <div class="pu-panel" id="puPanel" hidden>
                <ol class="pu-pasos">
                    <li><b>1</b> Agrega cada trabajo de la obra con su <em>unidad</em> y <em>cantidad</em> (ej. «Cancel de baño», m², 12).</li>
                    <li><b>2</b> Presiona <em>Analizar</em> y anota lo que lleva <em>una</em> unidad: materiales, mano de obra y equipo.</li>
                    <li><b>3</b> El precio unitario y el total salen solos y pasan a Materia Prima y Mano de Obra.</li>
                </ol>
                <div class="pu-cuerpo">
                    <section class="extra pu-conceptos">
                        <div class="extra-barra">
                            <strong>Catálogo de conceptos</strong>
                            <button type="button" class="ct-btn" id="puAgregar">+ Agregar concepto</button>
                            <?php if ($plantillasPU): ?>
                            <select id="puPlantilla" class="ct-btn" title="Agrega todos los conceptos de una plantilla con los precios vigentes del catálogo">
                                <option value="">+ Desde plantilla…</option>
                                <?php foreach ($plantillasPU as $i => $pl): ?>
                                <option value="<?= $i ?>"><?= e($pl['nombre']) ?> (<?= count($pl['conceptos']) ?>)</option>
                                <?php endforeach; ?>
                            </select>
                            <?php endif; ?>
                            <span class="extra-ayuda">Si el concepto ya se hizo en otro presupuesto, elígelo de la lista al escribirlo y se copia su análisis.</span>
                        </div>
                        <div class="extra-caja">
                            <table class="grid mini-grid">
                                <thead><tr><th class="c-id">Clave</th><th>Partida</th><th>Concepto</th><th>Unidad</th><th class="c-num">Cantidad</th><th class="c-num">P.U.</th><th class="c-num">Importe</th><th>Revisión</th><th></th></tr></thead>
                                <tbody id="puConceptos"></tbody>
                                <tfoot><tr class="pu-total"><td colspan="6" class="ro">Total del catálogo (precio de venta sin IVA)</td><td class="ro" id="puTotalCat">0.00</td><td colspan="2"></td></tr></tfoot>
                            </table>
                        </div>
                    </section>
                    <section class="extra pu-resumen">
                        <div class="extra-barra"><strong>Integración del precio</strong></div>
                        <div class="pu-utilidad">
                            <label>Utilidad <input type="number" id="puUtilVis" class="num" step="0.01" min="0"> %</label>
                            <select id="puModoVis" title="Cómo se aplica el % de utilidad">
                                <option value="costo">+ sobre el costo</option>
                                <option value="margen">margen (Form46)</option>
                            </select>
                            <small>Es la misma Utilidad Neta del presupuesto.</small>
                        </div>
                        <div class="extra-caja">
                            <table class="grid mini-grid"><tbody id="puResumen"></tbody></table>
                        </div>
                        <details class="pu-avanzado">
                            <summary>Ajustes avanzados (solo si sabes qué son)</summary>
                            <label title="Factor de Salario Real: multiplica los sueldos por prestaciones, IMSS y días no trabajados. 1 = sin cambio; lo usual es entre 1.3 y 1.7">Factor de salario real (FSR)
                                <input type="number" id="puFsr" class="num" step="0.0001" min="0" value="1"></label>
                            <label title="Desgaste de herramienta pequeña: % sobre la mano de obra. Lo usual es 3 %">Herramienta menor %
                                <input type="number" id="puHm" class="num" step="0.01" min="0" value="0"></label>
                            <label title="Costo del dinero mientras se cobra la obra: % sobre costo directo + indirectos">Financiamiento %
                                <input type="number" id="puFin" class="num" step="0.01" min="0" value="0"></label>
                            <label class="check" title="Para presupuestos traídos de Neodata: el Catálogo da el precio al cliente y la matriz de cada concepto su costo. Se marca sola al importar las matrices si Materia Prima y Mano de Obra no tienen importes capturados a mano">
                                <input type="checkbox" id="puMatrizCosto"> La matriz de los conceptos de precio fijo es el costo (sus insumos van a Materia Prima y Mano de Obra)</label>
                            <p>Indirectos = Gastos de Operacion: <b id="puInd">0.00 %</b> del costo directo · Cargos adicionales = comisiones y seguro: <b id="puCa">0.00 %</b> del precio.</p>
                        </details>
                    </section>
                    <section class="extra pu-insumos">
                        <div class="extra-barra"><strong>Explosión de insumos</strong><span class="extra-ayuda">Todo lo que lleva la obra, sumado: insumos de los análisis y artículos importados</span></div>
                        <div class="extra-caja">
                            <table class="grid mini-grid">
                                <thead><tr><th>Insumo</th><th>Tipo</th><th>Unidad</th><th class="c-num">Cantidad</th><th class="c-num">Costo prom.</th><th class="c-num">Importe</th><th class="c-pct">%</th></tr></thead>
                                <tbody id="puInsumos"></tbody>
                            </table>
                        </div>
                    </section>
                </div>
                <datalist id="puUnidades"><option>m²</option><option>m</option><option>ml</option><option>pza</option><option>jgo</option><option>lote</option><option>kg</option><option>m³</option><option>lt</option><option>hr</option><option>jornal</option><option>día</option><option>servicio</option><option>viaje</option></datalist>
                <datalist id="puPartidas"></datalist>
                <datalist id="puSugConceptos"></datalist>
                <datalist id="puSugMAT"></datalist>
                <datalist id="puSugMO"></datalist>
                <datalist id="puSugEQ"></datalist>
            </div>

            <div class="grid-caja">
                <table class="grid" id="grid">
                    <thead>
                        <tr>
                            <th class="sel-col"></th>
                            <th class="c-id">ID</th>
                            <th class="c-concepto">Concepto</th>
                            <th class="c-num">Presupuesto</th>
                            <th class="c-num">Subtotal</th>
                            <th class="c-num">Total</th>
                            <th class="c-pct">%</th>
                            <th class="c-imp">Importar</th>
                            <th class="c-folio">Folio.Doc.</th>
                            <th class="c-del"></th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>

            <!-- Mano de Obra: empleados × días y comisiones (grid_man_obra / grid_comisiones del Form46) -->
            <div class="extras" id="extrasMO" hidden>
                <!-- Mano de obra de las matrices del Análisis P.U.: salario base × FSR (FASAR) = salario real, jornadas e importe -->
                <section class="extra mo-analisis">
                    <div class="extra-barra">
                        <strong>Mano de obra de los análisis</strong>
                        <button type="button" class="ct-btn" id="moFasar" title="FSR del presupuesto y desglose del FASAR">FASAR…</button>
                        <span class="extra-ayuda">Trabajadores y cuadrillas de las matrices. Doble clic para abrir el análisis donde se usa.</span>
                    </div>
                    <div class="extra-caja">
                        <table class="grid mini-grid">
                            <thead><tr><th class="c-id">Código</th><th>Descripción</th><th>Unidad</th><th class="c-num">Salario base</th><th>FASAR</th><th class="c-num">FSR</th>
                                <th class="c-num" title="Salario base × FSR + viáticos, alimentación y hospedaje">Salario real</th><th class="c-num" title="Viáticos + alimentación + hospedaje por jornada">Viát. / alim. / hosp.</th>
                                <th class="c-num" title="Cantidad total en la obra (jornadas)">Jornadas</th><th class="c-num">Importe</th><th class="c-num">Conceptos</th></tr></thead>
                            <tbody id="tbManoObraPU"></tbody>
                        </table>
                    </div>
                </section>
                <section class="extra">
                    <div class="extra-barra">
                        <strong>Empleados</strong>
                        <select id="selEmpleado">
                            <?php foreach ($empleados as $em): ?>
                            <option value="<?= (int) $em['empleado_id'] ?>"><?= e($em['nombre']) ?></option>
                            <?php endforeach; ?>
                        </select>
                        <button type="button" class="ct-btn" id="addEmpleado">+ Agregar</button>
                        <span class="extra-total">Total: <output id="totEmpleados">0.00</output> → <em id="fijoMO"></em></span>
                    </div>
                    <div class="extra-caja">
                        <table class="grid mini-grid">
                            <thead><tr><th>No.</th><th>Empleado</th><th class="c-num">Sueldo diario</th><th class="c-num">Días</th><th class="c-num">Total</th><th class="c-del"></th></tr></thead>
                            <tbody id="tbEmpleados"></tbody>
                        </table>
                    </div>
                </section>
                <section class="extra">
                    <div class="extra-barra">
                        <strong>Comisiones</strong>
                        <select id="selTipoComision">
                            <?php foreach ($tiposComision as $tc): ?>
                            <option value="<?= (int) $tc['tipo_empleado_id'] ?>"><?= e($tc['nombre']) ?></option>
                            <?php endforeach; ?>
                        </select>
                        <button type="button" class="ct-btn" id="addComision">+ Agregar</button>
                        <span class="extra-total">Total: <output id="totComisiones">0.00</output> → <em id="fijoCOM"></em></span>
                    </div>
                    <div class="extra-caja">
                        <table class="grid mini-grid">
                            <thead><tr><th>Tipo de empleado</th><th class="c-num">% sobre subtotal</th><th class="c-num">Total</th><th class="c-del"></th></tr></thead>
                            <tbody id="tbComisiones"></tbody>
                        </table>
                    </div>
                </section>
            </div>

            <!-- Gastos de Operacion: anexo de seguro (grid_anexo7 del Form46) -->
            <div class="extras" id="extrasGO" hidden>
                <section class="extra">
                    <div class="extra-barra">
                        <strong>Anexo de seguro</strong>
                        <select id="selSeguro"></select>
                        <button type="button" class="ct-btn" id="addSeguro">+ Agregar</button>
                        <span class="extra-ayuda">Total = Subtotal × %1 × %2 · pasa al concepto de Gastos de Operacion</span>
                    </div>
                    <div class="extra-caja">
                        <table class="grid mini-grid">
                            <thead><tr><th>Concepto</th><th class="c-num">% 1</th><th class="c-num">% 2</th><th class="c-num">Total</th><th class="c-del"></th></tr></thead>
                            <tbody id="tbSeguros"></tbody>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    </div>

    <!-- Totales -->
    <div class="pie">
        <div class="t-fila t-primo">
            <span>Materia Prima:</span> <output id="tMP">0</output>
            <b>+</b>
            <span>Mano de Obra:</span> <output id="tMO">0</output>
            <b>=</b>
            <span>Costo Primo:</span> <output id="tCP">0</output>
        </div>

        <div class="pie-izq">
            <label class="desc">Descripcion:
                <textarea id="descripcion"></textarea>
            </label>
        </div>

        <div class="totales">
            <div class="t-fila"><b>+</b><span>Gastos de Operacion:</span> <output id="tGO">0</output></div>
            <div class="t-fila">
                <b>+</b><span class="t-util">Utilidad Neta
                    <select id="modoUtilidad" title="Cómo se aplica el % de utilidad">
                        <option value="costo"<?= $paramsPres['utilidad_modo'] === 'costo' ? ' selected' : '' ?>>+ % sobre el costo</option>
                        <option value="margen"<?= $paramsPres['utilidad_modo'] === 'margen' ? ' selected' : '' ?>>% de margen (Form46)</option>
                    </select>:</span>
                <input type="number" id="pctUtilidad" value="<?= e((string) $utilidadDefecto) ?>" min="0" max="1000" step="0.01" class="num pct" title="% de utilidad">
                <output id="tUT">0</output>
            </div>
            <div class="t-fila">
                <b>=</b><span>Subtotal:</span>
                <input type="text" id="tSUB" class="num" value="0" readonly>
                <button type="button" class="mini" id="editarSubtotal" title="Capturar subtotal manualmente">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/></svg>
                </button>
            </div>
            <div class="t-fila"><b>+</b><span class="t-util">IVA
                    <select id="ivaTasa" title="Tasa de IVA (Administrador › Parámetros de presupuesto)">
                        <?php foreach ($paramsPres['iva_tasas'] as $t): ?>
                        <option value="<?= e((string) (float) $t['pct']) ?>"<?= abs((float) $t['pct'] - (float) $paramsPres['iva_defecto']) < 0.0001 ? ' selected' : '' ?>><?= e($t['nombre']) ?></option>
                        <?php endforeach; ?>
                    </select> (<span id="pctIvaTxt"><?= e((string) (float) $paramsPres['iva_defecto']) ?></span>%):</span> <output id="tIVA">0</output></div>
            <div class="t-fila"><b>=</b><span>Total:</span> <output id="tTOT" class="fuerte">0</output></div>
        </div>
    </div>
</section>

<!-- ============ VISTA: SUGERIDOS ============ -->
<section class="vista" data-vista="sugeridos">
    <div class="extra sug-panel">
        <div class="extra-barra">
            <strong>Sugeridos relacionados</strong>
            <span class="extra-ayuda">Otros presupuestos de obra ligados a este (se guardan con el presupuesto)</span>
            <button type="button" class="ct-btn" id="addRelacionado">+ Relacionar por folio</button>
        </div>
        <div class="extra-caja">
            <table class="grid mini-grid">
                <thead><tr><th>Folio</th><th>Cliente</th><th>Proyecto</th><th>Estatus</th><th class="c-num">Total</th><th class="c-del"></th></tr></thead>
                <tbody id="tbRelacionados"></tbody>
            </table>
        </div>
    </div>
</section>

<!-- ============ BUSCAR EN HUBSPOT ============ -->
<dialog class="hs-dialogo" id="hsDialogo">
    <div class="hs-cabecera">
        <svg viewBox="0 0 16 16"><circle cx="10" cy="9" r="3" fill="none" stroke="#f26b3a" stroke-width="2"/><path d="M3 3l5 4M3 14l5-3M10 3v3" stroke="#f26b3a" stroke-width="2"/></svg>
        <strong>Buscar en HubSpot</strong>
        <button type="button" class="hs-cerrar" id="hsCerrar" title="Cerrar">✕</button>
    </div>
    <form class="hs-buscar" id="hsForm">
        <input type="search" id="hsTexto" placeholder="Correo, nombre, teléfono o empresa" autocomplete="off">
        <button type="submit" class="hs-btn">🔎 Buscar</button>
    </form>
    <p class="hs-estado" id="hsEstado"></p>

    <div class="hs-seccion">1. Contacto</div>
    <div class="hs-tabla">
        <table class="hs-grid">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Empresa</th><th></th></tr></thead>
            <tbody id="hsContactos"><tr><td colspan="5" class="hs-vacio">Escribe el correo y presiona Buscar.</td></tr></tbody>
        </table>
    </div>

    <div class="hs-seccion">2. Negocio (deal) del contacto</div>
    <div class="hs-tabla">
        <table class="hs-grid">
            <thead><tr><th>Id</th><th>Negocio</th><th>Etapa</th><th class="num">Monto</th><th>Creado</th><th>Cierre</th><th></th></tr></thead>
            <tbody id="hsNegocios"><tr><td colspan="7" class="hs-vacio">Selecciona un contacto.</td></tr></tbody>
        </table>
    </div>

    <div class="hs-pie">
        <span id="hsSeleccion"></span>
        <button type="button" class="hs-btn" id="hsCancelar">Cancelar</button>
        <button type="button" class="hs-btn principal" id="hsUsar" disabled>Usar</button>
    </div>
</dialog>

<?php ctDialogos($vendedores); ?>

<!-- ============ ANÁLISIS DEL PRECIO UNITARIO DE UN CONCEPTO ============ -->
<dialog class="hs-dialogo pu-dialogo" id="puDialogo">
    <div class="hs-cabecera">
        <strong>Análisis del precio unitario</strong>
        <button type="button" class="hs-cerrar" data-pu-cerrar title="Cerrar">✕</button>
    </div>
    <div class="pu-dlg-concepto">
        <label class="ancho">Concepto: <input type="text" id="puDConcepto" maxlength="300" list="puSugConceptos"></label>
        <label>Unidad: <input type="text" id="puDUnidad" maxlength="20" list="puUnidades"></label>
        <label>Cantidad: <input type="number" id="puDCantidad" class="num" step="0.01" min="0"></label>
        <label>Partida: <input type="text" id="puDPartida" maxlength="100" list="puPartidas" placeholder="ej. Cancelería / Planta baja"
               title="Para una subpartida escribe «Partida / Subpartida»"></label>
    </div>
    <div class="pu-dlg-espec">
        <label>Especificación técnica (va en la propuesta para el cliente):
            <textarea id="puDEspecificacion" rows="2" maxlength="4000" placeholder="Materiales, acabados, medidas, herrajes, sellado…"></textarea></label>
    </div>
    <p class="pu-dlg-ayuda" id="puDAyuda"></p>
    <div class="pu-dlg-botones">
        <button type="button" class="ct-btn" data-pu-insumo="MAT">+ Material</button>
        <button type="button" class="ct-btn" data-pu-insumo="MO">+ Mano de obra</button>
        <button type="button" class="ct-btn" data-pu-insumo="EQ">+ Equipo / herramienta</button>
        <button type="button" class="ct-btn" data-pu-insumo="OTRO" title="Flete, servicio u otro costo (el tipo se puede cambiar en el renglón: maquinaria, herramienta…)">+ Otro</button>
        <!-- Las matrices de TODOS los conceptos en un Excel (un renglón por insumo); al importarlo se reemplaza la matriz de cada concepto -->
        <button type="button" class="ct-btn pu-dlg-excel" id="puDExportar" title="Descarga en Excel la matriz de todos los conceptos del catálogo, un renglón por insumo">Exportar matrices a Excel</button>
        <button type="button" class="ct-btn" id="puDImportar" title="Llena la matriz de los conceptos desde el Excel (el mismo formato que Exportar matrices)">Importar matrices de Excel</button>
        <input type="file" id="puDArchivo" accept=".xlsx,.csv,.txt" hidden>
    </div>
    <div class="pu-dlg-ruta" id="puDRuta" hidden></div>
    <div class="extra-caja pu-dlg-tabla">
        <table class="grid mini-grid">
            <!-- Columnas como la matriz de Neodata -->
            <thead><tr><th class="pu-c-ren">Renglón</th><th class="pu-c-cod">Código</th><th class="pu-c-desc">Descripción</th><th class="pu-c-tipo">Tipo</th><th class="pu-c-uni">Unidad</th>
                <th class="pu-c-calc" title="Cantidad: lo que lleva una unidad (3.30 m² de vidrio). Rendimiento: cuántas unidades del concepto rinde una unidad del insumo (una cuadrilla instala 3 canceles por jornada). Fijo por concepto: para todo el concepto (un flete). % de la M.O.: porcentaje de la mano de obra (herramienta 3 %)">Cálculo</th>
                <th class="c-num pu-c-n">Costo</th><th class="c-num pu-c-n" id="puDColCant">Cantidad</th>
                <th class="c-num pu-c-n" title="Solo con cálculo por Rendimiento: cuántas unidades del concepto rinde una unidad del insumo (ej. 3 canceles por jornada)">Rendimiento</th>
                <th class="c-num pu-c-n" title="Multiplica la cantidad (vacío = 1)">Factor</th><th class="c-num pu-c-n" title="Desperdicio en % (vacío = 0)">Merma %</th>
                <th class="c-num pu-c-n" title="Cantidad por unidad del concepto ya con rendimiento, factor y merma">Cant. resultante</th>
                <th class="c-num pu-c-n">Importe</th><th class="c-pct" title="% del costo directo del concepto">%</th>
                <th class="pu-c-prov">Proveedor</th><th class="pu-c-fecha">Fecha de costo</th><th class="c-del"></th></tr></thead>
            <tbody id="puDInsumos"></tbody>
        </table>
    </div>
    <div class="pu-dlg-totales" id="puDTotales"></div>
    <div class="hs-pie">
        <span class="extra-ayuda" id="puDNota">Los cambios se aplican al momento.</span>
        <button type="button" class="hs-btn principal" data-pu-cerrar>Listo</button>
    </div>
</dialog>

<!-- ============ CÁLCULO AL PERIODO DE CORTE ============ -->
<dialog class="hs-dialogo cal-dialogo" id="calDialogo">
    <div class="hs-cabecera">
        <strong>Cálculo al periodo de corte</strong>
        <button type="button" class="hs-cerrar" data-cal-cerrar title="Cerrar">✕</button>
    </div>
    <p class="pu-dlg-ayuda">Captura el programa (inicio y fin) de cada concepto y la fecha de corte: el avance programado al corte es parejo por días
        entre su inicio y su fin. Queda listo para cuando el programa de obra llene estas fechas.</p>
    <div class="cal-periodo">
        <label>Periodo desde (opcional) <input type="date" id="calDesde"></label>
        <label>Periodo de corte <input type="date" id="calCorte"></label>
        <label class="cal-check"><input type="checkbox" id="calCantidad"> Calcular cantidad a requerir hasta el periodo de corte</label>
        <label class="cal-check"><input type="checkbox" id="calMarcar"> Marcar actividades programadas en el periodo de corte</label>
        <span class="extra-ayuda" id="calNota"></span>
    </div>
    <div class="extra-caja cal-tabla">
        <table class="grid mini-grid">
            <thead><tr><th class="c-id">Clave</th><th>Concepto</th><th>Unidad</th><th class="c-num">Cantidad</th><th>Inicio</th><th>Fin</th>
                <th class="c-num" title="Avance programado a la fecha de corte">% al corte</th><th class="c-num">Cantidad al corte</th><th class="c-num">Importe al corte</th><th></th></tr></thead>
            <tbody id="calCuerpo"></tbody>
            <tfoot id="calPie"></tfoot>
        </table>
    </div>
    <div class="extra-caja cal-tabla" id="calInsumosCaja" hidden>
        <table class="grid mini-grid">
            <thead><tr><th class="c-id">Código</th><th>Insumos a requerir hasta el corte</th><th>Tipo</th><th>Unidad</th><th class="c-num">Cantidad</th><th class="c-num">Costo prom.</th><th class="c-num">Importe</th><th class="c-pct">%</th></tr></thead>
            <tbody id="calInsumos"></tbody>
        </table>
    </div>
    <div class="hs-pie">
        <span class="extra-ayuda">El periodo y los programas se guardan con el presupuesto.</span>
        <button type="button" class="hs-btn principal" data-cal-cerrar>Listo</button>
    </div>
</dialog>

<!-- ============ PRESUPUESTO COMPLETO: TODOS LOS CONCEPTOS EN UNA VISTA ============ -->
<dialog class="hs-dialogo pc-dialogo" id="pcDialogo">
    <div class="hs-cabecera">
        <strong>Presupuesto completo</strong>
        <button type="button" class="hs-cerrar" data-pc-cerrar title="Cerrar">✕</button>
    </div>
    <div class="extra-barra pc-barra">
        <input type="search" id="pcBuscar" class="cc-buscar" placeholder="Buscar partida, código, concepto o familia" autocomplete="off">
        <button type="button" class="ct-btn" id="pcExportar" title="Descarga el presupuesto completo para abrirlo en Excel">Exportar a Excel</button>
        <span class="extra-ayuda" id="pcResumen"></span>
    </div>
    <div class="extra-caja pc-tabla">
        <table class="grid mini-grid">
            <thead><tr><th>Partida</th><th>Subpartida</th><th class="c-id">Código</th><th>Concepto</th><th>Unidad</th><th class="c-num">Cantidad</th>
                <th class="c-num" title="Costo directo de una unidad">C.D. unitario</th><th class="c-num">C.D. total</th><th class="c-num">P. Unitario</th>
                <th class="c-num">Importe</th><th class="c-pct">%</th><th>Familia</th></tr></thead>
            <tbody id="pcCuerpo"></tbody>
            <tfoot id="pcPie"></tfoot>
        </table>
    </div>
    <div class="hs-pie">
        <span class="extra-ayuda">Doble clic en un concepto para abrir su análisis.</span>
        <button type="button" class="hs-btn principal" data-pc-cerrar>Cerrar</button>
    </div>
</dialog>

<!-- ============ SOBRECOSTO: INTEGRACIÓN DEL PRECIO Y FACTOR DE SOBRECOSTO ============ -->
<dialog class="hs-dialogo sc-dialogo" id="scDialogo">
    <div class="hs-cabecera">
        <strong>Sobrecosto · integración del precio</strong>
        <button type="button" class="hs-cerrar" data-sc-cerrar title="Cerrar">✕</button>
    </div>
    <p class="pu-dlg-ayuda"><b>Precio de venta = Costo directo + Indirectos + Financiamiento + Utilidad + Cargos adicionales.</b>
        Factor de sobrecosto = Precio de venta ÷ Costo directo: el P.U. de cada concepto es su costo directo × este factor.
        Se guarda con todos sus componentes al Guardar el presupuesto.</p>
    <div class="sc-cuerpo">
        <div class="extra-caja sc-caja">
            <table class="grid mini-grid">
                <thead><tr><th>Concepto</th><th>Base</th><th class="c-num">Importe</th></tr></thead>
                <tbody id="scCascada"></tbody>
            </table>
        </div>
        <div class="sc-param">
            <fieldset>
                <legend>Financiamiento</legend>
                <label>% de financiamiento (sobre CD + indirectos) <input type="number" id="scFin" class="num" step="0.0001" min="0"></label>
                <label>Indicador económico <input type="text" id="scIndicador" maxlength="60" placeholder="ej. TIIE 28 días"></label>
                <label>Tasa de interés anual % <input type="number" id="scTasa" class="num" step="0.01" min="0"></label>
                <label>Plazo de ejecución (meses) <input type="number" id="scPlazo" class="num" step="0.5" min="0"></label>
                <label>Anticipo % <input type="number" id="scAnticipo" class="num" step="0.01" min="0" max="100"></label>
                <p class="sc-estimado">Estimado: <b id="scEstimado"></b>
                    <button type="button" class="ct-btn" id="scUsar" title="Pone el estimado como % de financiamiento">Usar este %</button>
                    <small>tasa anual × meses / 12 × (1 − anticipo)</small></p>
            </fieldset>
            <fieldset>
                <legend>Utilidad</legend>
                <label>Utilidad Neta % <input type="number" id="scUtil" class="num" step="0.01" min="0"></label>
                <label>Cómo se aplica
                    <select id="scModo">
                        <option value="costo">+ % sobre el costo</option>
                        <option value="margen">% de margen (Form46)</option>
                    </select>
                </label>
            </fieldset>
            <p class="extra-ayuda">Indirectos de campo y de oficina: renglones de Gastos de Operación (sus % en Administrador › Parámetros de presupuesto).
                Cargos adicionales: comisiones (Mano de Obra) y anexo de seguro (Gastos de Operación).</p>
        </div>
    </div>
    <div class="hs-pie">
        <span class="extra-ayuda" id="scGuardado"></span>
        <button type="button" class="hs-btn principal" data-sc-cerrar>Listo</button>
    </div>
</dialog>

<!-- ============ FASAR: FACTOR DE SALARIO REAL DE LA MANO DE OBRA ============ -->
<dialog class="hs-dialogo fs-dialogo" id="fsDialogo">
    <div class="hs-cabecera">
        <strong>FASAR · Factor de Salario Real</strong>
        <button type="button" class="hs-cerrar" data-fs-cerrar title="Cerrar">✕</button>
    </div>
    <p class="pu-dlg-ayuda"><b>Salario real = salario base × FSR</b> (+ viáticos, alimentación y hospedaje). El FSR sale del FASAR del catálogo
        con los días pagados, los no laborados y las obligaciones obrero-patronales. Los FASAR se capturan en
        <a href="parametros-costos.php" target="_blank" rel="noopener">Catalogos › Parámetros de costos</a>. Cada mano de obra puede tener su propio FASAR
        (abajo de ella, en la ventana del análisis); si no, toma el del presupuesto.</p>
    <div class="fs-elegir">
        <label>FASAR del presupuesto: <select id="fsElegir"></select></label>
        <label>FSR: <input type="number" id="fsFsr" class="num" step="0.0001" min="0"></label>
        <span class="extra-ayuda" id="fsNota"></span>
    </div>
    <div class="fs-cuerpo">
        <div class="extra-caja fs-caja"><table class="grid mini-grid"><tbody id="fsDesglose"></tbody></table></div>
        <div class="extra-caja fs-caja">
            <table class="grid mini-grid">
                <thead><tr><th class="c-id">Código</th><th>Descripción</th><th>Unidad</th><th class="c-num">Salario base</th><th>FASAR</th><th class="c-num">FSR</th>
                    <th class="c-num">Salario real</th><th class="c-num">Viát. / alim. / hosp.</th><th class="c-num">Jornadas</th><th class="c-num">Importe</th><th class="c-num">Conceptos</th></tr></thead>
                <tbody id="fsManoObra"></tbody>
            </table>
        </div>
    </div>
    <div class="hs-pie">
        <span class="extra-ayuda">Los cambios se aplican al momento.</span>
        <button type="button" class="hs-btn" id="fsTodos" title="Quita los FASAR y FSR propios de cada mano de obra">Toda la mano de obra con el FASAR del presupuesto</button>
        <button type="button" class="hs-btn principal" data-fs-cerrar>Listo</button>
    </div>
</dialog>

<!-- ============ CÁLCULO DE UN GASTO DE OPERACIÓN (botón ƒx) ============ -->
<dialog class="hs-dialogo go-dialogo" id="goDialogo">
    <div class="hs-cabecera">
        <strong>Cálculo del gasto de operación</strong>
        <button type="button" class="hs-cerrar" data-go-cerrar title="Cerrar">✕</button>
    </div>
    <p class="pu-dlg-ayuda"><b id="goConcepto"></b><br>Maquinaria, herramienta, equipo, fletes, equipo de seguridad, consumibles u otro costo de operación:
        captura su importe fijo en la pestaña o calcúlalo aquí. Se guarda cómo se calculó, no solo el importe.</p>
    <div class="go-campos">
        <label class="ancho">Cómo se calcula
            <select id="goBase">
                <option value="">Importe fijo (se captura en la pestaña)</option>
                <option value="unidad">Por unidad (cantidad × costo)</option>
                <option value="hora">Por hora (horas × costo por hora)</option>
                <option value="jornada">Por jornada (jornadas × costo por jornada)</option>
                <option value="pct_mo">% de la mano de obra</option>
            </select>
        </label>
        <label data-go="cant">Cantidad <input type="number" id="goCantidad" class="num" step="0.0001" min="0"></label>
        <label data-go="cant">Unidad <input type="text" id="goUnidad" maxlength="20" list="puUnidades"></label>
        <label data-go="cant">Costo por <span id="goPor">unidad</span> <input type="number" id="goCosto" class="num" step="0.01" min="0"></label>
        <label data-go="pct">% de la mano de obra <input type="number" id="goPct" class="num" step="0.01" min="0" placeholder="ej. 3"></label>
        <p data-go="pct" class="go-nota">Mano de obra del presupuesto (sin comisiones): <b id="goBaseMo"></b></p>
    </div>
    <p class="go-importe">Importe: <b id="goImporte"></b></p>
    <div class="hs-pie">
        <span></span>
        <button type="button" class="hs-btn" data-go-cerrar>Cancelar</button>
        <button type="button" class="hs-btn principal" id="goAplicar">Aplicar</button>
    </div>
</dialog>

<!-- ============ PRUEBA: DE DÓNDE SALE CADA DATO ============ -->
<dialog class="hs-dialogo pr-dialogo" id="prDialogo">
    <div class="hs-cabecera">
        <strong>Prueba cargada: de dónde sale cada dato</strong>
        <button type="button" class="hs-cerrar" data-pr-cerrar title="Cerrar">✕</button>
    </div>
    <p class="pu-dlg-ayuda">Se llenaron todos los apartados con datos de <b>PRUEBA</b>. Recorre las pestañas de la izquierda (Materia Prima, Mano de Obra, Gastos de Operacion, Catálogo de Conceptos y Análisis P.U.) para verlos. <b>No se guardó nada</b>: si presionas Guardar se crea un presupuesto PRUEBA normal, que después puedes Cancelar y Eliminar.</p>
    <div class="extra-caja pr-tabla">
        <table class="grid mini-grid">
            <thead><tr><th>Apartado</th><th>Qué se cargó</th><th>De dónde sale la información</th></tr></thead>
            <tbody id="prGuia"></tbody>
        </table>
    </div>
    <div class="hs-pie">
        <span></span>
        <button type="button" class="hs-btn principal" data-pr-cerrar>Entendido</button>
    </div>
</dialog>

<!-- ============ IMPORTAR CONCEPTOS DE EXCEL AL CATÁLOGO ============ -->
<dialog class="hs-dialogo pr-dialogo" id="ccImpDialogo">
    <div class="hs-cabecera">
        <strong>Importar conceptos de Excel</strong>
        <button type="button" class="hs-cerrar" data-cci-cerrar title="Cerrar">✕</button>
    </div>
    <p class="pu-dlg-ayuda">En Excel selecciona las columnas <b>con su encabezado</b> (Código, Concepto, Unidad, Cantidad, P. Unitario; opcionales Partida y Especificación)
        y pégalas aquí, o elige el archivo de Excel (.xlsx) o .csv. Si el código está en <b>Catalogos › Conceptos P.U.</b> se toma su análisis con los precios vigentes (automático);
        si no, el concepto entra con el P. Unitario del archivo. Lo que ya está en el presupuesto (mismo código) no se vuelve a sumar: solo se actualiza si cambió.</p>
    <div class="cci-entrada">
        <textarea id="cciPegar" rows="6" placeholder="Pega aquí las celdas copiadas de Excel"></textarea>
        <div class="cci-opciones">
            <label>Archivo de Excel (.xlsx) o CSV (opcional): <input type="file" id="cciArchivo" accept=".xlsx,.csv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
            <label><input type="checkbox" id="cciVenta"> Precio fijo para el cliente: el P. Unitario del archivo no suma al costo, porque el costo ya viene del Análisis (Materia Prima, Mano de Obra y Gastos de Operacion)</label>
            <label><input type="checkbox" id="cciCatalogo" checked> Usar el análisis del catálogo cuando el código exista</label>
            <button type="button" class="ct-btn" id="cciLeer">Revisar</button>
        </div>
    </div>
    <div class="extra-caja pr-tabla">
        <table class="grid mini-grid">
            <thead><tr><th>Código</th><th>Concepto</th><th>Partida</th><th>Unidad</th><th class="num">Cantidad</th><th class="num">P. Unitario</th><th>Qué se hace</th></tr></thead>
            <tbody id="cciVista"><tr class="vacio-fila"><td colspan="7">Pega las celdas y presiona Revisar.</td></tr></tbody>
        </table>
    </div>
    <div class="hs-pie">
        <span id="cciResumen"></span>
        <button type="button" class="hs-btn" data-cci-cerrar>Cancelar</button>
        <button type="button" class="hs-btn principal" id="cciAgregar" disabled>Agregar al catálogo</button>
    </div>
</dialog>

<!-- ============ IMPORTAR EL ANÁLISIS DE EXCEL (importes de MP / MO / GO) ============ -->
<dialog class="hs-dialogo pr-dialogo" id="anImpDialogo">
    <div class="hs-cabecera">
        <strong>Importar el Análisis de Excel</strong>
        <button type="button" class="hs-cerrar" data-ani-cerrar title="Cerrar">✕</button>
    </div>
    <p class="pu-dlg-ayuda">En la hoja de Excel del Análisis selecciona desde el encabezado (<b>Anexos, Partidas, Presupuesto sugerido, Subtotal…</b>) hasta el Total de Gastos de Operacion
        y pégalo aquí, o elige el archivo de Excel (el que descarga Exportar a Excel). Los renglones bajo <b>Materia Prima</b>, <b>Mano de Obra</b> y <b>Gastos de Operacion</b>
        actualizan el importe del concepto con el mismo nombre o se agregan como nuevos; los renglones automáticos (calculados) no se cambian.</p>
    <div class="cci-entrada">
        <textarea id="aniPegar" rows="6" placeholder="Pega aquí las celdas copiadas de Excel"></textarea>
        <div class="cci-opciones">
            <label>Archivo de Excel (.xlsx) o CSV (opcional): <input type="file" id="aniArchivo" accept=".xlsx,.csv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
            <label><input type="checkbox" id="aniQuitar"> Quitar los conceptos que no vengan en el archivo (de las secciones que sí vienen)</label>
            <label id="aniSubtotalCaja" hidden><input type="checkbox" id="aniSubtotal" checked> <span id="aniSubtotalTxt"></span></label>
            <label id="aniVentaCaja" hidden><input type="checkbox" id="aniVenta" checked> Los conceptos del Catálogo de Conceptos quedan con su P. Unitario como precio fijo para el cliente (ya no suman al costo)</label>
            <button type="button" class="ct-btn" id="aniLeer">Revisar</button>
        </div>
    </div>
    <div class="extra-caja pr-tabla">
        <table class="grid mini-grid">
            <thead><tr><th>Sección</th><th>Anexo</th><th>Partida</th><th class="num">Importe actual</th><th class="num">Importe nuevo</th><th>Qué se hace</th></tr></thead>
            <tbody id="aniVista"><tr class="vacio-fila"><td colspan="6">Pega las celdas y presiona Revisar.</td></tr></tbody>
        </table>
    </div>
    <div class="hs-pie">
        <span id="aniResumen"></span>
        <button type="button" class="hs-btn" data-ani-cerrar>Cancelar</button>
        <button type="button" class="hs-btn principal" id="aniAplicar" disabled>Aplicar al presupuesto</button>
    </div>
</dialog>

<!-- ============ VERSIONES CONGELADAS (al aceptar o registrar la obra) ============ -->
<dialog class="hs-dialogo pr-dialogo" id="verDialogo">
    <div class="hs-cabecera">
        <strong>Versiones aprobadas del presupuesto</strong>
        <button type="button" class="hs-cerrar" data-ver-cerrar title="Cerrar">✕</button>
    </div>
    <p class="pu-dlg-ayuda">Copias que se guardaron al <b>aceptar</b> el presupuesto o al <b>registrar su obra</b>. No se pueden modificar ni borrar;
        «Íntegra» indica que la copia sigue idéntica a como se guardó.</p>
    <div class="extra-caja pr-tabla">
        <table class="grid mini-grid">
            <thead><tr><th>Versión</th><th>Motivo</th><th>Fecha</th><th>Usuario</th><th class="num">Total</th><th>Íntegra</th><th></th></tr></thead>
            <tbody id="verLista"></tbody>
        </table>
    </div>
    <div class="hs-pie"><span></span><button type="button" class="hs-btn principal" data-ver-cerrar>Cerrar</button></div>
</dialog>

<!-- ============ BITÁCORA DE CAMBIOS (solo consulta) ============ -->
<dialog class="hs-dialogo bit-dialogo" id="bitDialogo">
    <div class="hs-cabecera">
        <strong>Bitácora de cambios</strong>
        <button type="button" class="hs-cerrar" data-bit-cerrar title="Cerrar">✕</button>
    </div>
    <div class="bit-total"><span class="bit-signo">$</span> <b>Total del Presupuesto</b> <output id="bitTotal"></output> <small>· como está hoy el documento</small></div>
    <div class="bit-tabla">
        <table class="grid mini-grid">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Dónde</th><th>Movimiento</th></tr></thead>
            <tbody id="bitLista"></tbody>
        </table>
    </div>
    <div class="hs-pie"><span></span><button type="button" class="hs-btn" data-bit-cerrar>Cerrar</button></div>
</dialog>

<!-- ============ AUTORIZACIÓN DE OTRO USUARIO (Dialog225) ============ -->
<dialog class="hs-dialogo au-dialogo" id="auDialogo">
    <form id="auForm">
        <div class="hs-cabecera">
            <strong>Autorización</strong>
            <button type="button" class="hs-cerrar" data-au-cerrar title="Cerrar">✕</button>
        </div>
        <div class="au-campos">
            <p id="auMensaje"></p>
            <label>Usuario que autoriza: <input id="auUsuario" autocomplete="off" required></label>
            <label>Contraseña: <input type="password" id="auContrasena" autocomplete="off" required></label>
        </div>
        <div class="hs-pie">
            <span></span>
            <button type="button" class="hs-btn" data-au-cerrar>Cancelar</button>
            <button type="submit" class="hs-btn principal">Autorizar</button>
        </div>
    </form>
</dialog>

<!-- Formato impreso (Imprimir / Imprimir Detalle): solo se ve al imprimir -->
<div id="formatoImpresion"></div>

<script>
    window.ACRI_MEMBRETE = <?= json_encode($membrete, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.ACRI_USUARIO = <?= json_encode($usuarioSesion, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.ACRI_PUEDE_MODIFICAR = <?= $puedeModificar ? 'true' : 'false' ?>;
    window.ACRI_PUEDE_REGISTRAR_OBRA = <?= $puedeRegistrarObra ? 'true' : 'false' ?>;
    window.ACRI_ESTATUS = <?= json_encode(array_column($estatus, 'color', 'nombre'), JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.ACRI_CONCEPTOS = <?= json_encode($conceptos, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.ACRI_FIJOS = <?= json_encode($fijos, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.ACRI_EMPLEADOS = <?= json_encode($empleados, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.ACRI_TIPOS_COMISION = <?= json_encode($tiposComision, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.ACRI_BIBLIOTECA_PU = <?= json_encode($bibliotecaPU, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.ACRI_CATALOGO_PU = <?= json_encode($catalogoPU, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.ACRI_PARAMETROS_PRES = <?= json_encode($paramsJs, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.ACRI_PLANTILLAS_PU = <?= json_encode($plantillasPU, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.ACRI_CONCEPTOS_PU = <?= json_encode($conceptosPU, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    window.ACRI_FASAR = <?= json_encode($fasarPU, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
</script>
<script src="<?= recurso('js/presupuesto-calculo.js') ?>"></script>
<script src="<?= recurso('js/formato-presupuesto.js') ?>"></script>
<script src="<?= recurso('js/formato-analisis.js') ?>"></script>
<script src="<?= recurso('js/xlsx-simple.js') ?>"></script>
<script src="<?= recurso('js/formato-catalogo.js') ?>"></script>
<script src="<?= recurso('js/ruta-critica.js') ?>"></script>
<script src="<?= recurso('js/conceptos-tareas.js') ?>"></script>
<script src="<?= recurso('js/presupuesto.js') ?>"></script>
<script>window.ACRI_PRIMER_INGRESO = <?= !empty($_SESSION['primer_ingreso']) ? 'true' : 'false' ?>;</script>
<script src="<?= recurso('js/recorrido-presupuesto.js') ?>"></script>
<script src="<?= recurso('js/recorrido.js') ?>"></script>
</body>
</html>
