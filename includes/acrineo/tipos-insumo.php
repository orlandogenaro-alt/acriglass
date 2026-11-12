<?php
// ACRINEO · Catálogo Tipos de insumos (ventana de la lupa de Tipo en la matriz de precio unitario).
// Tabla acrineo_tipos_insumo (migraciones/028_acrineo_tipos_insumo.sql). Sin la migración se usan los seis
// tipos del sistema (ACRINEO_TIPOS_INSUMO) y el catálogo no se puede cambiar.
require_once __DIR__ . '/esquema.php';
require_once __DIR__ . '/catalogos.php';
require_once __DIR__ . '/hoja-calculo.php';

const ACRINEO_CAMPO_TIPO_INSUMO_CLAVE = ['tipo' => 'texto', 'max' => 3, 'requerido' => true];
const ACRINEO_CAMPO_TIPO_INSUMO_DESC  = ['tipo' => 'texto', 'max' => 60, 'requerido' => true];

function acrineoTiposInsumoDisponible(): bool
{
    return bd_tiene_tabla('AW', 'acrineo_tipos_insumo');
}

// [clave => descripción] de todos los tipos (los del sistema primero)
function acrineoTiposInsumo(): array
{
    static $tipos = null;
    if ($tipos !== null) return $tipos;
    if (!acrineoTiposInsumoDisponible()) return $tipos = ACRINEO_TIPOS_INSUMO;
    $tipos = [];
    foreach (bd_filas('AW', 'select tipo, descripcion from acrineo_tipos_insumo order by sistema desc, tipo_id') as $f) {
        $tipos[trim($f['tipo'])] = $f['descripcion'];
    }
    return $tipos + ACRINEO_TIPOS_INSUMO;
}

// Tipos (filtro en Tipo o Descripción). Regresa {items: [{id, tipo, descripcion, sistema}], total}
function acrineoTiposInsumoListar(string $q): array
{
    if (!acrineoTiposInsumoDisponible()) {
        $items = [];
        $n = 0;
        foreach (ACRINEO_TIPOS_INSUMO as $t => $d) {
            if (trim($q) === '' || stripos($t . ' ' . $d, trim($q)) !== false) $items[] = ['id' => ++$n, 'tipo' => $t, 'descripcion' => $d, 'sistema' => true];
        }
        return ['items' => $items, 'total' => count($items)];
    }
    $where = 'true';
    $params = [];
    if (trim($q) !== '') {
        $where = 'tipo ilike ? or descripcion ilike ?';
        array_push($params, acrineoPatron($q), acrineoPatron($q));
    }
    $filas = bd_filas('AW', "select tipo_id as id, tipo, descripcion, sistema from acrineo_tipos_insumo where $where
                              order by sistema desc, tipo_id", $params);
    foreach ($filas as &$f) {
        $f['id'] = (int) $f['id'];
        $f['tipo'] = trim($f['tipo']);
        $f['sistema'] = in_array($f['sistema'], [true, 't', 'true', 1, '1'], true);
    }
    return ['items' => $filas, 'total' => count($filas)];
}

// Alta ($id null) o cambio. La clave (hasta 3 letras o números) no se repite; la de un tipo del sistema no cambia
function acrineoTipoInsumoGuardar(?int $id, array $in): array
{
    [$clave, $e1] = acrineoValor(mb_strtoupper(trim((string) ($in['tipo'] ?? ''))), ACRINEO_CAMPO_TIPO_INSUMO_CLAVE);
    [$desc, $e2] = acrineoValor($in['descripcion'] ?? null, ACRINEO_CAMPO_TIPO_INSUMO_DESC);
    if (!$e1 && !preg_match('/^[A-Z0-9]{1,3}$/', $clave)) $e1 = 'Usa de 1 a 3 letras o números.';
    $actual = $id ? bd_fila('AW', 'select tipo, sistema from acrineo_tipos_insumo where tipo_id = ?', [$id]) : null;
    if ($id && !$actual) throw new AcrineoError('El tipo ya no existe.', 404);
    $sistema = $actual && in_array($actual['sistema'], [true, 't', 'true', 1, '1'], true);
    if (!$e1 && $sistema && $clave !== trim($actual['tipo'])) $e1 = 'La clave de un tipo del sistema no se puede cambiar.';
    if (!$e1 && bd_valor('AW', 'select tipo_id from acrineo_tipos_insumo where tipo = ? and tipo_id <> ?', [$clave, $id ?? 0])) {
        $e1 = 'Ya existe ese tipo.';
    }
    $errores = array_filter(['tipo' => $e1, 'descripcion' => $e2]);
    if ($errores) throw new AcrineoError('Revisa el tipo.', 422, $errores);
    if ($id) {
        $anterior = trim($actual['tipo']);
        bd_ejecutar('AW', 'update acrineo_tipos_insumo set tipo = ?, descripcion = ? where tipo_id = ?', [$clave, $desc, $id]);
        // Las matrices que ya lo usan siguen con el mismo tipo
        if ($anterior !== $clave) bd_ejecutar('AW', 'update acrineo_matriz set tipo = ? where trim(tipo) = ?', [$clave, $anterior]);
    } else {
        $id = bd_insertar('AW', 'acrineo_tipos_insumo', 'tipo_id', ['tipo' => $clave, 'descripcion' => $desc]);
    }
    return ['id' => $id, 'tipo' => $clave, 'descripcion' => $desc, 'sistema' => $sistema];
}

// Borra el tipo si no es del sistema y ninguna matriz lo usa
function acrineoTipoInsumoEliminar(int $id): void
{
    $t = bd_fila('AW', 'select tipo, sistema from acrineo_tipos_insumo where tipo_id = ?', [$id]);
    if (!$t) throw new AcrineoError('El tipo ya no existe.', 404);
    $clave = trim($t['tipo']);
    if (in_array($t['sistema'], [true, 't', 'true', 1, '1'], true)) throw new AcrineoError("El tipo $clave es del sistema y no se puede borrar.", 409);
    $n = (int) bd_valor('AW', 'select count(*) from acrineo_matriz where trim(tipo) = ?', [$clave]);
    if ($n) throw new AcrineoError("No se puede borrar el tipo $clave: lo usan $n renglón(es) de matrices.", 409);
    bd_ejecutar('AW', 'delete from acrineo_tipos_insumo where tipo_id = ?', [$id]);
}
