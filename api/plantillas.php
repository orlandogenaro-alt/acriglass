<?php
// Plantillas de presupuesto (migraciones/008_plantillas_presupuesto.sql; solo Supabase)
// GET  ?accion=listar              renglones del menú Catalogos › Plantillas de presupuesto
// GET  ?accion=ficha&id=N          registro y sus conceptos (id 0 = nueva)
// GET  ?accion=buscar&q=…          conceptos del catálogo activos con matriz, para agregarlos (30 como máximo)
// POST ?accion=guardar             {id, nombre, descripcion, activo, conceptos (JSON [{concepto_pu_id, cantidad, partida}])}
// POST ?accion=eliminar            {id}
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/bd.php';
require __DIR__ . '/../includes/respuesta.php';

if (modoConfiguracion()) error('Modo configuración: aún no hay conexión a la base.', 503);
exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_SUGERIDO_OBRA', 'MODIFICAR_SUGERIDO_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA',
    'CATALOGO_INSUMOS', 'PRECIOS_INSUMOS', 'ADMIN_USER');
$accion = $_GET['accion'] ?? 'listar';
if ($accion === 'guardar' || $accion === 'eliminar') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
    exigirCsrf();
    exigirPermiso('CATALOGO_INSUMOS', 'ADMIN_USER');
}
$puedeModificar = tienePermiso('CATALOGO_INSUMOS', 'ADMIN_USER');
session_write_close();

if (!bd_tiene_tabla('AW', 'plantillas_presupuesto')) {
    error('Las plantillas aún no están en la base: aplica migraciones/008_plantillas_presupuesto.sql (php herramientas/migrar.php --aplicar).', 503);
}

function texto($v, int $largo): ?string
{
    $v = trim((string) ($v ?? ''));
    return $v === '' ? null : mb_substr($v, 0, $largo);
}

function conceptosDe(int $id): array
{
    return bd_filas('AW', 'select pc.concepto_pu_id, c.codigo, c.descripcion, u.clave as unidad, c.familia, pc.cantidad, pc.partida, c.estatus
                             from plantilla_conceptos pc
                             join conceptos_pu c on c.concepto_pu_id = pc.concepto_pu_id
                             join unidades u on u.unidad_id = c.unidad_id
                            where pc.plantilla_id = ? order by pc.orden, pc.plantilla_concepto_id', [$id]);
}

function guardar(array $d): array
{
    $id = (int) ($d['id'] ?? 0);
    if ($id && !bd_valor('AW', 'select count(*) from plantillas_presupuesto where plantilla_id = ?', [$id])) error('La plantilla ya no existe.', 404);
    $nombre = texto($d['nombre'] ?? '', 100);
    if ($nombre === null) error('Captura el nombre de la plantilla.');
    if (bd_valor('AW', 'select count(*) from plantillas_presupuesto where upper(trim(nombre)) = ? and plantilla_id <> ?', [mb_strtoupper($nombre), $id])) {
        error("Ya existe una plantilla con el nombre «{$nombre}».");
    }
    $lista = json_decode((string) ($d['conceptos'] ?? '[]'), true);
    if (!is_array($lista)) error('Los conceptos de la plantilla no son válidos.');
    $conceptos = [];
    foreach ($lista as $i => $c) {
        $cid = (int) ($c['concepto_pu_id'] ?? 0);
        if (!$cid || !bd_valor('AW', 'select count(*) from conceptos_pu where concepto_pu_id = ?', [$cid])) error('El concepto del renglón ' . ($i + 1) . ' ya no existe.');
        $cant = $c['cantidad'] ?? 1;
        if (!is_numeric($cant) || (float) $cant < 0) error('La cantidad del renglón ' . ($i + 1) . ' debe ser un número de 0 en adelante.');
        $conceptos[] = ['concepto_pu_id' => $cid, 'cantidad' => round((float) $cant, 4), 'partida' => texto($c['partida'] ?? '', 100), 'orden' => $i];
    }
    $campos = ['nombre' => $nombre, 'descripcion' => texto($d['descripcion'] ?? '', 4000), 'estatus' => !empty($d['activo']) ? 'A' : 'B'];
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        if ($id) {
            bd_ejecutar('AW', 'update plantillas_presupuesto set nombre = ?, descripcion = ?, estatus = ? where plantilla_id = ?', array_merge(array_values($campos), [$id]));
        } else {
            $id = bd_insertar('AW', 'plantillas_presupuesto', 'plantilla_id', $campos + ['usuario_creacion' => mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50)]);
        }
        bd_ejecutar('AW', 'delete from plantilla_conceptos where plantilla_id = ?', [$id]);
        foreach ($conceptos as $c) bd_insertar('AW', 'plantilla_conceptos', 'plantilla_concepto_id', ['plantilla_id' => $id] + $c);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return ['id' => $id];
}

try {
    switch ($accion) {
        case 'listar':
            responder(['ok' => true, 'puede_modificar' => $puedeModificar, 'filas' => array_map(fn($f) => [
                'id' => (int) $f['plantilla_id'], 'nombre' => $f['nombre'], 'descripcion' => $f['descripcion'], 'conceptos' => (int) $f['conceptos'],
                'estatus' => trim((string) $f['estatus']) === 'B' ? 'Baja' : 'Activo',
            ], bd_filas('AW', 'select p.plantilla_id, p.nombre, p.descripcion, p.estatus,
                                      (select count(*) from plantilla_conceptos c where c.plantilla_id = p.plantilla_id) as conceptos
                                 from plantillas_presupuesto p order by p.nombre'))]);
        case 'ficha':
            $id = (int) ($_GET['id'] ?? 0);
            $r = ['ok' => true, 'puede_modificar' => $puedeModificar, 'registro' => null, 'conceptos' => []];
            if ($id) {
                $reg = bd_fila('AW', 'select * from plantillas_presupuesto where plantilla_id = ?', [$id]);
                if (!$reg) error('La plantilla ya no existe (¿la eliminaron?).', 404);
                $reg['id'] = $id;
                $reg['activo'] = trim((string) $reg['estatus']) !== 'B';
                $r['registro'] = $reg;
                $r['conceptos'] = conceptosDe($id);
            }
            responder($r);
        case 'buscar':
            $q = '%' . mb_strtoupper(trim((string) ($_GET['q'] ?? ''))) . '%';
            responder(['ok' => true, 'filas' => bd_filas('AW', "select c.concepto_pu_id, c.codigo, c.descripcion, u.clave as unidad, c.familia
                                                                   from conceptos_pu c join unidades u on u.unidad_id = c.unidad_id
                                                                  where c.estatus = 'A' and (upper(c.codigo) like ? or upper(c.descripcion) like ?)
                                                                  order by c.codigo limit 30", [$q, $q])]);
        case 'guardar':
            responder(['ok' => true] + guardar(entrada()));
        case 'eliminar':
            bd_ejecutar('AW', 'delete from plantillas_presupuesto where plantilla_id = ?', [(int) (entrada()['id'] ?? 0)]);
            responder(['ok' => true]);
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/plantillas: ' . $e->getMessage());
    error('No se pudo completar: ' . bd_mensaje_error($e), 500);
}
