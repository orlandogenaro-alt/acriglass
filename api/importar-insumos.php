<?php
// Catalogos › Importar insumos: renglones pegados desde Excel o CSV (exportación de Neodata u otra lista)
// POST ?accion=validar    {filas: [{clave, descripcion, tipo, unidad, familia, precio, moneda}], opciones}
//                          → cada renglón con lo que se hará (nuevo / actualizar / sin cambios / error) y por qué
// POST ?accion=importar   mismo cuerpo; aplica todo en una sola transacción (si un renglón falla no se importa nada)
// opciones: {actualizar: bool (cambiar descripción, tipo, unidad y familia de claves que ya existen),
//            precios: bool (agregar el precio al historial; nunca sobrescribe), vigente_desde, crear_unidades: bool}
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/bd.php';
require __DIR__ . '/../includes/pu.php';
require __DIR__ . '/../includes/respuesta.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
if (modoConfiguracion()) error('Modo configuración: aún no hay conexión a la base.', 503);
exigirCsrf();
exigirPermiso('CATALOGO_INSUMOS', 'ADMIN_USER');
$puedePrecios = tienePermiso('PRECIOS_INSUMOS', 'ADMIN_USER');
session_write_close();
if (!puDisponible()) error('El catálogo de insumos aún no está en la base: aplica migraciones/004_insumos.sql.', 503);

const IMPORTAR_MAX = 5000;

// Revisa todos los renglones sin escribir nada: ['filas' => [...con accion y avisos], 'resumen' => [...]]
function revisar(array $filas, array $op, bool $puedePrecios): array
{
    if (count($filas) > IMPORTAR_MAX) error('Son más de ' . IMPORTAR_MAX . ' renglones: divide el archivo.');
    $unidades = [];
    foreach (bd_filas('AW', 'select unidad_id, upper(trim(clave)) as clave from unidades') as $u) $unidades[$u['clave']] = (int) $u['unidad_id'];
    $existentes = [];
    foreach (bd_filas('AW', 'select i.insumo_id, upper(trim(i.clave)) as clave, i.descripcion, i.tipo, upper(trim(u.clave)) as unidad, i.familia,
                                    p.precio, p.moneda, (select count(*) from insumo_componentes c where c.insumo_id = i.insumo_id) as componentes
                               from insumos i join unidades u on u.unidad_id = i.unidad_id
                               left join insumos_precio_vigente p on p.insumo_id = i.insumo_id') as $e) {
        $existentes[$e['clave']] = $e;
    }
    $vistos = [];
    $res = [];
    $resumen = ['nuevos' => 0, 'actualizar' => 0, 'sin_cambios' => 0, 'precios' => 0, 'errores' => 0, 'unidades_nuevas' => []];
    foreach ($filas as $i => $f) {
        $r = ['n' => $i + 1, 'clave' => mb_strtoupper(trim((string) ($f['clave'] ?? ''))), 'descripcion' => trim((string) ($f['descripcion'] ?? '')),
              'tipo' => puTipoTexto((string) ($f['tipo'] ?? '')), 'unidad' => mb_strtoupper(trim((string) ($f['unidad'] ?? ''))),
              'familia' => mb_strtoupper(trim((string) ($f['familia'] ?? ''))), 'precio' => puNumeroTexto($f['precio'] ?? ''),
              'moneda' => mb_strtoupper(trim((string) ($f['moneda'] ?? ''))) ?: 'MXN', 'errores' => [], 'avisos' => []];
        if ($r['clave'] === '' && $r['descripcion'] === '') continue;   // renglón vacío
        if ($r['clave'] === '') $r['errores'][] = 'Sin clave';
        elseif (mb_strlen($r['clave']) > 30) $r['errores'][] = 'Clave de más de 30 caracteres';
        if ($r['descripcion'] === '') $r['errores'][] = 'Sin descripción';
        if (!$r['tipo']) $r['errores'][] = 'Tipo no reconocido («' . trim((string) ($f['tipo'] ?? '')) . '»): usa Material, Mano de obra, Equipo, Herramienta o Básico';
        if ($r['unidad'] === '') $r['errores'][] = 'Sin unidad';
        elseif (!isset($unidades[$r['unidad']])) {
            if (!empty($op['crear_unidades']) && mb_strlen($r['unidad']) <= 10) {
                $resumen['unidades_nuevas'][$r['unidad']] = true;
                $r['avisos'][] = "Unidad nueva {$r['unidad']}";
            } else {
                $r['errores'][] = "Unidad «{$r['unidad']}» no existe";
            }
        }
        if (is_float($r['precio']) && is_nan($r['precio'])) { $r['errores'][] = 'Precio no numérico'; $r['precio'] = null; }
        elseif ($r['precio'] !== null && $r['precio'] < 0) $r['errores'][] = 'Precio negativo';
        if (!in_array($r['moneda'], ['MXN', 'USD'], true)) $r['errores'][] = "Moneda «{$r['moneda']}» (usa MXN o USD)";
        if ($r['clave'] !== '' && isset($vistos[$r['clave']])) $r['errores'][] = 'Clave repetida en el archivo (renglón ' . $vistos[$r['clave']] . ')';
        $vistos[$r['clave']] = $i + 1;

        $e = $existentes[$r['clave']] ?? null;
        if ($r['errores']) {
            $r['accion'] = 'error';
        } elseif (!$e) {
            $r['accion'] = 'nuevo';
        } else {
            $cambia = $e['descripcion'] !== $r['descripcion'] || trim($e['tipo']) !== $r['tipo'] || $e['unidad'] !== $r['unidad']
                || (string) $e['familia'] !== $r['familia'];
            $r['accion'] = $cambia && !empty($op['actualizar']) ? 'actualizar' : 'sin_cambios';
            if ($cambia && empty($op['actualizar'])) $r['avisos'][] = 'Ya existe con otros datos (no se cambia: marca «Actualizar»)';
            if ($r['tipo'] === 'BAS' && trim($e['tipo']) !== 'BAS') $r['avisos'][] = 'Pasa a básico: captura sus componentes en la ficha';
            if ($r['accion'] === 'actualizar' && trim($e['tipo']) === 'BAS' && $r['tipo'] !== 'BAS' && (int) $e['componentes']) {
                $r['errores'][] = 'Es un básico con componentes: no puede cambiar de tipo';
                $r['accion'] = 'error';
            }
        }
        // Precio: solo si se pide, hay permiso, no es básico y es distinto del vigente
        if ($r['accion'] !== 'error' && $r['precio'] !== null && !empty($op['precios'])) {
            if (!$puedePrecios) $r['avisos'][] = 'Sin permiso para precios: no se registra';
            elseif ($r['tipo'] === 'BAS') $r['avisos'][] = 'Un básico no lleva precio (sale de sus componentes)';
            elseif ($e && $e['precio'] !== null && abs((float) $e['precio'] - $r['precio']) < 0.000001 && trim((string) $e['moneda']) === $r['moneda']) {
                $r['avisos'][] = 'Mismo precio vigente: no se repite';
            } else {
                $r['registrar_precio'] = true;
                $resumen['precios']++;
                if ($e && $e['precio'] !== null) $r['avisos'][] = 'Precio vigente ' . number_format((float) $e['precio'], 2) . ' → ' . number_format($r['precio'], 2) . ' (queda el historial)';
            }
        }
        $resumen[$r['accion'] === 'error' ? 'errores' : $r['accion']]++;
        $res[] = $r;
    }
    $resumen['unidades_nuevas'] = array_keys($resumen['unidades_nuevas']);
    return ['filas' => $res, 'resumen' => $resumen];
}

function importar(array $revision, array $op): array
{
    if ($revision['resumen']['errores']) error('Hay renglones con errores: corrígelos o quítalos antes de importar.');
    $desde = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($op['vigente_desde'] ?? '')) ? $op['vigente_desde'] : date('Y-m-d');
    $usuario = mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50);
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        foreach ($revision['resumen']['unidades_nuevas'] as $u) bd_insertar('AW', 'unidades', 'unidad_id', ['clave' => $u, 'nombre' => $u]);
        $unidades = [];
        foreach (bd_filas('AW', 'select unidad_id, upper(trim(clave)) as clave from unidades') as $u) $unidades[$u['clave']] = (int) $u['unidad_id'];
        foreach ($revision['filas'] as $r) {
            $campos = ['descripcion' => mb_substr($r['descripcion'], 0, 250), 'tipo' => $r['tipo'], 'unidad_id' => $unidades[$r['unidad']],
                       'familia' => $r['familia'] !== '' ? mb_substr($r['familia'], 0, 60) : null];
            if ($r['accion'] === 'nuevo') {
                $id = bd_insertar('AW', 'insumos', 'insumo_id', ['clave' => $r['clave']] + $campos + ['usuario_creacion' => $usuario]);
            } else {
                $id = (int) bd_valor('AW', 'select insumo_id from insumos where upper(trim(clave)) = ?', [$r['clave']]);
                if ($r['accion'] === 'actualizar') {
                    bd_ejecutar('AW', 'update insumos set descripcion = ?, tipo = ?, unidad_id = ?, familia = ? where insumo_id = ?',
                        array_merge(array_values($campos), [$id]));
                }
            }
            if (!empty($r['registrar_precio'])) {
                bd_insertar('AW', 'insumo_precios', 'precio_id', ['insumo_id' => $id, 'precio' => round($r['precio'], 6), 'moneda' => $r['moneda'],
                    'vigente_desde' => $desde, 'fuente' => 'importacion', 'notas' => 'Importación desde archivo', 'usuario' => $usuario]);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return $revision['resumen'];
}

try {
    $d = entrada();
    $op = is_array($d['opciones'] ?? null) ? $d['opciones'] : [];
    $revision = revisar(is_array($d['filas'] ?? null) ? $d['filas'] : [], $op, $puedePrecios);
    switch ($_GET['accion'] ?? '') {
        case 'validar':
            responder(['ok' => true] + $revision);
        case 'importar':
            responder(['ok' => true, 'resumen' => importar($revision, $op)]);
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/importar-insumos: ' . $e->getMessage());
    error('No se pudo importar: ' . bd_mensaje_error($e), 500);
}
