<?php
// ACRINEO · Catálogo de unidades (ventana «Catálogo Unidades» de la lupa de Unidad).
// Usa la tabla unidades del sistema (migraciones/004_insumos.sql): clave = Unidad, nombre = Descripción.
// La misma tabla la usan el catálogo de insumos y los Conceptos P.U.; por eso una unidad que ya usan no se borra.
require_once __DIR__ . '/esquema.php';
require_once __DIR__ . '/catalogos.php';

const ACRINEO_CAMPO_UNIDAD_CLAVE = ['tipo' => 'texto', 'max' => 10, 'requerido' => true];
const ACRINEO_CAMPO_UNIDAD_DESC  = ['tipo' => 'texto', 'max' => 60];

function acrineoUnidadesDisponible(): bool
{
    return bd_tiene_tabla('AW', 'unidades');
}

// Unidades activas (filtro en Unidad o Descripción). Regresa {items: [{id, unidad, descripcion}], total}
function acrineoUnidadesListar(string $q, int $limite = 1000): array
{
    $where = "estatus = 'A'";
    $params = [];
    if (trim($q) !== '') {
        $where .= ' and (clave ilike ? or nombre ilike ?)';
        array_push($params, acrineoPatron($q), acrineoPatron($q));
    }
    $total = (int) bd_valor('AW', "select count(*) from unidades where $where", $params);
    $filas = bd_filas('AW', "select unidad_id as id, clave as unidad, nombre as descripcion from unidades where $where
                              order by upper(clave), unidad_id limit ?", array_merge($params, [max(1, min(2000, $limite))]));
    foreach ($filas as &$f) $f['id'] = (int) $f['id'];
    return ['items' => $filas, 'total' => $total];
}

// Alta ($id null) o cambio. La clave no se repite (sin importar mayúsculas)
function acrineoUnidadGuardar(?int $id, array $in): array
{
    [$clave, $e1] = acrineoValor($in['unidad'] ?? null, ACRINEO_CAMPO_UNIDAD_CLAVE);
    [$desc, $e2] = acrineoValor($in['descripcion'] ?? null, ACRINEO_CAMPO_UNIDAD_DESC);
    $errores = array_filter(['unidad' => $e1, 'descripcion' => $e2]);
    if (!$e1 && bd_valor('AW', 'select unidad_id from unidades where upper(trim(clave)) = ? and unidad_id <> ?', [mb_strtoupper($clave), $id ?? 0])) {
        $errores['unidad'] = 'Ya existe esa unidad.';
    }
    if ($errores) throw new AcrineoError('Revisa la unidad.', 422, $errores);
    $desc = $desc ?? '';
    if ($id) {
        $n = bd_ejecutar('AW', "update unidades set clave = ?, nombre = ? where unidad_id = ? and estatus = 'A'", [$clave, $desc, $id]);
        if (!$n) throw new AcrineoError('La unidad ya no existe.', 404);
    } else {
        $id = bd_insertar('AW', 'unidades', 'unidad_id', ['clave' => $clave, 'nombre' => $desc]);
    }
    return ['id' => $id, 'unidad' => $clave, 'descripcion' => $desc];
}

// Borra la unidad si nadie la usa; si la usan insumos o Conceptos P.U., avisa cuántos
function acrineoUnidadEliminar(int $id): void
{
    $u = bd_fila('AW', 'select clave from unidades where unidad_id = ?', [$id]);
    if (!$u) throw new AcrineoError('La unidad ya no existe.', 404);
    $usos = [];
    foreach (['insumos' => 'insumos', 'conceptos_pu' => 'Conceptos P.U.'] as $tabla => $texto) {
        if (!bd_tiene_tabla('AW', $tabla)) continue;
        $n = (int) bd_valor('AW', "select count(*) from $tabla where unidad_id = ?", [$id]);
        if ($n) $usos[] = "$n $texto";
    }
    if ($usos) throw new AcrineoError("No se puede borrar la unidad {$u['clave']}: la usan " . implode(' y ', $usos) . '.', 409);
    bd_ejecutar('AW', 'delete from unidades where unidad_id = ?', [$id]);
}
