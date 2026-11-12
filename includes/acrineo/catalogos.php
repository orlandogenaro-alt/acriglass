<?php
// ACRINEO · Catálogos de los botones de búsqueda (🔍) del «Detalle del presupuesto».
// Reutilizan las tablas que ya tiene el sistema; solo «empresas» es propia de ACRINEO.
// Cada uno: tabla, columna id, expresión del nombre, dato adicional (extra) y filtro de activos.
require_once __DIR__ . '/esquema.php';

const ACRINEO_CATALOGOS = [
    'ciudades'   => ['titulo' => 'Ciudades', 'tabla' => 'ciudades', 'id' => 'ciudad_id', 'nombre' => 'nombre',
                     'extra' => 'estado', 'extra_titulo' => 'Estado', 'activos' => ''],
    'usuarios'   => ['titulo' => 'Responsables', 'tabla' => 'usuarios', 'id' => 'usuario_id',
                     'nombre' => "coalesce(nullif(btrim(nombre), ''), login)", 'extra' => 'login', 'extra_titulo' => 'Usuario',
                     'activos' => "estatus = 'A'"],
    'empresas'   => ['titulo' => 'Empresas', 'tabla' => 'acrineo_empresas', 'id' => 'empresa_id', 'nombre' => 'nombre',
                     'extra' => 'rfc', 'extra_titulo' => 'RFC', 'activos' => "estatus = 'A'", 'alta' => true],
    'clientes'   => ['titulo' => 'Clientes', 'tabla' => 'clientes', 'id' => 'cliente_id', 'nombre' => 'nombre',
                     'extra' => 'contacto', 'extra_titulo' => 'Contacto', 'activos' => "coalesce(estatus, 'A') = 'A'",
                     'clave' => 'clave_cliente'],
    'vendedores' => ['titulo' => 'Vendedores', 'tabla' => 'vendedores_obras', 'id' => 'vendedor_obra_id', 'nombre' => 'nombre',
                     'extra' => null, 'extra_titulo' => '', 'activos' => "coalesce(estatus, 'A') = 'A'"],
    'regiones'   => ['titulo' => 'Regiones', 'tabla' => 'zonas_clientes', 'id' => 'zona_cliente_id', 'nombre' => 'nombre',
                     'extra' => null, 'extra_titulo' => '', 'activos' => ''],
    'plantillas' => ['titulo' => 'Contenido (plantillas de presupuesto)', 'tabla' => 'plantillas_presupuesto', 'id' => 'plantilla_id',
                     'nombre' => 'nombre', 'extra' => 'descripcion', 'extra_titulo' => 'Descripción', 'activos' => "estatus = 'A'"],
];

function acrineoCatalogo(string $clave): array
{
    if ($clave === 'tipos_licitacion') return ['titulo' => 'Tipos de licitación', 'fijo' => true, 'extra_titulo' => ''];
    if (!isset(ACRINEO_CATALOGOS[$clave])) throw new AcrineoError('Catálogo no válido.', 400);
    return ACRINEO_CATALOGOS[$clave];
}

// Texto de búsqueda para ILIKE, con % y _ escapados
function acrineoPatron(string $q): string
{
    return '%' . strtr(mb_substr(trim($q), 0, 100), ['\\' => '\\\\', '%' => '\\%', '_' => '\\_']) . '%';
}

// Búsqueda paginada: { titulo, extra_titulo, items: [{id, nombre, extra}], total, alta }
function acrineoBuscarCatalogo(string $clave, string $q, int $pagina = 1, int $porPagina = 50): array
{
    $c = acrineoCatalogo($clave);
    $porPagina = max(1, min(500, $porPagina));
    $pagina = max(1, $pagina);

    if (!empty($c['fijo'])) {
        $items = [];
        foreach (ACRINEO_TIPOS_LICITACION as $t) {
            if ($q === '' || mb_stripos($t, trim($q)) !== false) $items[] = ['id' => $t, 'nombre' => $t, 'extra' => null];
        }
        return ['titulo' => $c['titulo'], 'extra_titulo' => '', 'items' => array_slice($items, ($pagina - 1) * $porPagina, $porPagina),
                'total' => count($items), 'alta' => false];
    }
    if (!bd_tiene_tabla('AW', $c['tabla'])) throw new AcrineoError("Falta el catálogo {$c['titulo']} en la base (migraciones).", 503);

    $where = [];
    $params = [];
    if ($c['activos'] !== '') $where[] = $c['activos'];
    if (trim($q) !== '') {
        $cols = array_filter([$c['nombre'], $c['extra'], $c['clave'] ?? null]);
        $where[] = '(' . implode(' or ', array_map(fn($col) => "$col ilike ?", $cols)) . ')';
        foreach ($cols as $_) $params[] = acrineoPatron($q);
    }
    $w = $where ? ' where ' . implode(' and ', $where) : '';
    $extra = $c['extra'] ? $c['extra'] : 'null';
    $total = (int) bd_valor('AW', "select count(*) from {$c['tabla']}$w", $params);
    $items = bd_filas('AW', "select {$c['id']} as id, {$c['nombre']} as nombre, $extra as extra from {$c['tabla']}$w
                              order by 2, 1 limit ? offset ?", array_merge($params, [$porPagina, ($pagina - 1) * $porPagina]));
    foreach ($items as &$i) $i['id'] = (int) $i['id'];
    return ['titulo' => $c['titulo'], 'extra_titulo' => $c['extra_titulo'], 'items' => $items, 'total' => $total, 'alta' => !empty($c['alta'])];
}

// Nombres de varios ids de un catálogo: [id => nombre]. Sirve para validar que existan.
function acrineoNombresCatalogo(string $clave, array $ids): array
{
    $c = acrineoCatalogo($clave);
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), fn($i) => $i > 0)));
    if (!$ids || !empty($c['fijo'])) return [];
    $filas = bd_filas('AW', "select {$c['id']} as id, {$c['nombre']} as nombre from {$c['tabla']} where {$c['id']} in ("
        . implode(',', array_fill(0, count($ids), '?')) . ')', $ids);
    return array_column($filas, 'nombre', 'id');
}

// Alta rápida de una empresa desde la ventana de búsqueda
function acrineoAltaEmpresa(array $in, string $usuario): array
{
    [$nombre, $e1] = acrineoValor($in['nombre'] ?? null, ['tipo' => 'texto', 'max' => 150, 'requerido' => true]);
    [$rfc, $e2] = acrineoValor($in['rfc'] ?? null, ['tipo' => 'texto', 'max' => 18]);
    $errores = array_filter(['nombre' => $e1, 'rfc' => $e2]);
    if ($rfc !== null && !preg_match('/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/u', mb_strtoupper($rfc))) $errores['rfc'] = 'RFC no válido.';
    if ($errores) throw new AcrineoError('Revisa los datos de la empresa.', 422, $errores);
    $nombre = mb_strtoupper($nombre);
    if (bd_valor('AW', 'select empresa_id from acrineo_empresas where upper(btrim(nombre)) = ?', [$nombre])) {
        throw new AcrineoError('Ya existe una empresa con ese nombre.', 409, ['nombre' => 'Ya existe.']);
    }
    $id = bd_insertar('AW', 'acrineo_empresas', 'empresa_id', [
        'nombre' => $nombre, 'rfc' => $rfc === null ? null : mb_strtoupper($rfc), 'created_by' => mb_substr($usuario, 0, 50),
    ]);
    return ['id' => $id, 'nombre' => $nombre, 'extra' => $rfc === null ? null : mb_strtoupper($rfc)];
}
