<?php
// ACRINEO · Presupuestos: catálogo paginado, detalle completo, alta / cambio (con sus tablas relacionadas
// en una sola transacción), eliminación lógica y respaldo. Solo Supabase (migraciones/024_acrineo_presupuestos.sql).
require_once __DIR__ . '/esquema.php';
require_once __DIR__ . '/catalogos.php';
require_once __DIR__ . '/historial.php';
require_once __DIR__ . '/documentos.php';

// Columnas de cada sección en su tabla (las de licitación, cálculo y configuración se llaman igual que el campo)
const ACRINEO_TABLAS = [
    'generales'     => 'acrineo_presupuesto_generales',
    'licitacion'    => 'acrineo_presupuesto_licitacion',
    'calculo'       => 'acrineo_presupuesto_calculo',
    'configuracion' => 'acrineo_presupuesto_configuracion',
];

// Orden permitido en el catálogo: parámetro => expresión SQL
const ACRINEO_ORDEN = [
    'codigo' => 'p.codigo', 'tipo' => 'p.tipo', 'agrupador' => 'p.agrupador', 'organizacion' => 'p.organizacion',
    'propietario' => 'p.propietario', 'nombre' => 'p.nombre', 'descripcion' => 'p.descripcion', 'ciudad' => 'c.nombre',
    'sobrecosto_pct' => 'p.sobrecosto_pct', 'costo_directo' => 'p.costo_directo', 'precio_venta' => 'p.precio_venta',
    'updated_at' => 'p.updated_at', 'estatus' => 'p.estatus',
];
// Filtros de texto por columna (embudo del encabezado): parámetro f_<columna>
const ACRINEO_FILTROS_TEXTO = [
    'codigo' => 'p.codigo', 'tipo' => 'p.tipo', 'agrupador' => 'p.agrupador', 'organizacion' => 'p.organizacion',
    'propietario' => 'p.propietario', 'nombre' => 'p.nombre', 'descripcion' => 'p.descripcion', 'ciudad' => 'c.nombre',
];

// true cuando la base es Supabase y ya tiene la migración 024
function acrineoDisponible(): bool
{
    return bd_motor('AW') === 'pgsql' && bd_tiene_tabla('AW', 'acrineo_presupuestos');
}

// ---------- Catálogo ----------

function acrineoListar(array $f): array
{
    $where = ['p.deleted_at is null'];
    $params = [];
    $q = trim((string) ($f['q'] ?? ''));
    if ($q !== '') {
        $cols = ['p.codigo', 'p.nombre', 'p.descripcion', 'p.organizacion', 'p.propietario', 'p.tipo', 'p.agrupador', 'c.nombre'];
        $where[] = '(' . implode(' or ', array_map(fn($c) => "$c ilike ?", $cols)) . ')';
        foreach ($cols as $_) $params[] = acrineoPatron($q);
    }
    foreach (ACRINEO_FILTROS_TEXTO as $k => $col) {
        $v = trim((string) ($f["f_$k"] ?? ''));
        if ($v === '') continue;
        $where[] = "$col ilike ?";
        $params[] = acrineoPatron($v);
    }
    if (($f['estatus'] ?? '') !== '') {
        if (!isset(ACRINEO_ESTATUS[$f['estatus']])) throw new AcrineoError('Estatus no válido.');
        $where[] = 'p.estatus = ?';
        $params[] = $f['estatus'];
    }
    if ((int) ($f['ciudad_id'] ?? 0) > 0) {
        $where[] = 'p.ciudad_id = ?';
        $params[] = (int) $f['ciudad_id'];
    }
    $w = ' where ' . implode(' and ', $where);
    $desde = ' from acrineo_presupuestos p left join ciudades c on c.ciudad_id = p.ciudad_id';

    $orden = ACRINEO_ORDEN[$f['orden'] ?? ''] ?? 'p.updated_at';
    $dir = strtolower((string) ($f['dir'] ?? '')) === 'asc' ? 'asc' : 'desc';
    $agrupar = ($f['agrupar'] ?? '') === 'tipo';
    $porPagina = max(10, min(200, (int) ($f['por_pagina'] ?? 50)));
    $pagina = max(1, (int) ($f['pagina'] ?? 1));

    $total = (int) bd_valor('AW', "select count(*)$desde$w", $params);
    $paginas = max(1, (int) ceil($total / $porPagina));
    $pagina = min($pagina, $paginas);

    $filas = bd_filas('AW', "select p.presupuesto_id as id, p.codigo, p.tipo, p.agrupador, p.organizacion, p.propietario, p.nombre,
                                    p.descripcion, c.nombre as ciudad, p.sobrecosto_pct, p.costo_directo, p.precio_venta, p.estatus,
                                    to_char(p.updated_at at time zone ?, 'YYYY-MM-DD HH24:MI') as updated_at
                             $desde$w
                             order by " . ($agrupar ? 'p.tipo asc, ' : '') . "$orden $dir nulls last, p.presupuesto_id desc
                             limit ? offset ?", array_merge([nube_zona()], $params, [$porPagina, ($pagina - 1) * $porPagina]));
    foreach ($filas as &$r) {
        $r['id'] = (int) $r['id'];
        foreach (['sobrecosto_pct', 'costo_directo', 'precio_venta'] as $k) $r[$k] = (float) $r[$k];
        $r['estatus_texto'] = ACRINEO_ESTATUS[$r['estatus']] ?? $r['estatus'];
    }
    unset($r);

    $grupos = [];
    if ($agrupar && $total) {
        foreach (bd_filas('AW', "select p.tipo, count(*) as n$desde$w group by p.tipo", $params) as $g) $grupos[$g['tipo']] = (int) $g['n'];
    }
    return ['filas' => $filas, 'total' => $total, 'pagina' => $pagina, 'paginas' => $paginas, 'por_pagina' => $porPagina,
            'grupos' => (object) $grupos];
}

// ---------- Detalle ----------

// Convierte lo que regresa PostgreSQL (texto) al tipo del campo
function acrineoTipar($v, array $def)
{
    if ($v === null) return null;
    switch ($def['tipo']) {
        case 'entero':
        case 'catalogo': return (int) $v;
        case 'decimal':  return (float) $v;
    }
    return (string) $v;
}

function acrineoObtener(int $id): ?array
{
    $f = bd_fila('AW', "select p.presupuesto_id, p.codigo, p.nombre, p.descripcion, p.direccion, p.colonia, p.codigo_postal,
                               p.ciudad_id, c.nombre as ciudad_nombre, p.estado, p.telefono, p.correo, p.observaciones,
                               p.tipo, p.agrupador, p.organizacion, p.propietario, p.estatus, p.sobrecosto_pct, p.costo_directo,
                               p.precio_venta, p.version, p.created_by, p.updated_by,
                               to_char(p.created_at at time zone ?, 'YYYY-MM-DD HH24:MI') as created_at,
                               to_char(p.updated_at at time zone ?, 'YYYY-MM-DD HH24:MI') as updated_at,
                               g.responsable_id, coalesce(nullif(btrim(u.nombre), ''), u.login) as responsable_nombre, g.cargo_responsable,
                               g.empresa_id, e.nombre as empresa_nombre, g.cliente_id, cl.nombre as cliente_nombre,
                               g.area_cliente, g.departamento_cliente, g.contacto_cliente,
                               g.vendedor_id, v.nombre as vendedor_nombre, g.region_id, z.nombre as region_nombre,
                               to_char(l.fecha_licitacion, 'YYYY-MM-DD') as fecha_licitacion, l.numero_licitacion, l.lugar_celebracion,
                               l.numero_convocatoria, l.tipo_licitacion, to_char(l.fecha_publicacion, 'YYYY-MM-DD') as fecha_publicacion,
                               to_char(l.fecha_inicio, 'YYYY-MM-DD') as fecha_inicio, l.dias,
                               to_char(l.fecha_terminacion, 'YYYY-MM-DD') as fecha_terminacion,
                               k.iva, k.decimales_costos, k.decimales_cantidades, k.decimales_explosion,
                               cf.separador_partidas, cf.contenido_plantilla_id, pl.nombre as contenido_plantilla_nombre,
                               (g.presupuesto_id is not null) as hay_generales, (l.presupuesto_id is not null) as hay_licitacion,
                               (k.presupuesto_id is not null) as hay_calculo, (cf.presupuesto_id is not null) as hay_configuracion
                          from acrineo_presupuestos p
                          left join ciudades c on c.ciudad_id = p.ciudad_id
                          left join acrineo_presupuesto_generales g on g.presupuesto_id = p.presupuesto_id
                          left join usuarios u on u.usuario_id = g.responsable_id
                          left join acrineo_empresas e on e.empresa_id = g.empresa_id
                          left join clientes cl on cl.cliente_id = g.cliente_id
                          left join vendedores_obras v on v.vendedor_obra_id = g.vendedor_id
                          left join zonas_clientes z on z.zona_cliente_id = g.region_id
                          left join acrineo_presupuesto_licitacion l on l.presupuesto_id = p.presupuesto_id
                          left join acrineo_presupuesto_calculo k on k.presupuesto_id = p.presupuesto_id
                          left join acrineo_presupuesto_configuracion cf on cf.presupuesto_id = p.presupuesto_id
                          left join plantillas_presupuesto pl on pl.plantilla_id = cf.contenido_plantilla_id
                         where p.presupuesto_id = ? and p.deleted_at is null", [nube_zona(), nube_zona(), $id]);
    if (!$f) return null;

    // Una sección sin renglón (no debería pasar) toma los valores por defecto
    $def = acrineoDefectos();
    $p = ['meta' => [
        'id' => (int) $f['presupuesto_id'], 'codigo' => $f['codigo'], 'version' => (int) $f['version'],
        'organizacion' => $f['organizacion'], 'propietario' => $f['propietario'],
        'sobrecosto_pct' => (float) $f['sobrecosto_pct'], 'costo_directo' => (float) $f['costo_directo'], 'precio_venta' => (float) $f['precio_venta'],
        'created_by' => $f['created_by'], 'created_at' => $f['created_at'], 'updated_by' => $f['updated_by'], 'updated_at' => $f['updated_at'],
    ]];
    foreach (acrineoCampos() as $sec => $campos) {
        $hay = $sec === 'presupuesto' || in_array($f["hay_$sec"], [true, 't', 1, '1'], true);
        foreach ($campos as $campo => $d) {
            $p[$sec][$campo] = $hay ? acrineoTipar($f[$campo], $d) : ($def[$sec][$campo] ?? null);
            if ($d['tipo'] === 'catalogo') {
                $k = preg_replace('/_id$/', '_nombre', $campo);
                $p[$sec][$k] = $hay ? $f[$k] : null;
            }
        }
    }

    $p['ch'] = $def['ch'];
    foreach (bd_filas('AW', 'select tipo, espera, reserva from acrineo_ch_parametros where presupuesto_id = ?', [$id]) as $r) {
        if (isset($p['ch']['parametros'][$r['tipo']])) $p['ch']['parametros'][$r['tipo']] = ['espera' => (float) $r['espera'], 'reserva' => (float) $r['reserva']];
    }
    foreach (bd_filas('AW', 'select clave, valor_numerico, valor_texto from acrineo_ch_factores where presupuesto_id = ?', [$id]) as $r) {
        if (!isset(ACRINEO_CH_FACTORES[$r['clave']])) continue;
        $p['ch']['factores'][$r['clave']] = ACRINEO_CH_FACTORES[$r['clave']][2] === 'num' ? (float) $r['valor_numerico'] : $r['valor_texto'];
    }
    $p['monedas'] = $def['monedas'];
    foreach (bd_filas('AW', 'select numero, descripcion, remate, tipo_cambio from acrineo_presupuesto_monedas where presupuesto_id = ?', [$id]) as $r) {
        $p['monedas'][(int) $r['numero']] = ['descripcion' => $r['descripcion'], 'remate' => $r['remate'], 'tipo_cambio' => (float) $r['tipo_cambio']];
    }
    return $p;
}

// ---------- Alta / cambio ----------

// Los ids de catálogo deben existir; regresa los errores por campo
function acrineoValidarCatalogos(array $datos): void
{
    $errores = [];
    foreach (acrineoCampos() as $sec => $campos) {
        foreach ($campos as $campo => $def) {
            if ($def['tipo'] !== 'catalogo' || $datos[$sec][$campo] === null) continue;
            if (!acrineoNombresCatalogo($def['catalogo'], [$datos[$sec][$campo]])) $errores["$sec.$campo"] = 'Ya no existe en el catálogo.';
        }
    }
    if ($errores) throw new AcrineoError('Revisa los campos marcados.', 422, $errores);
}

// insert … on conflict do update de varios renglones. $filas: lista de arreglos con las mismas llaves.
function acrineoUpsert(string $tabla, array $llaves, array $filas): void
{
    if (!$filas) return;
    $cols = array_keys($filas[0]);
    $params = [];
    foreach ($filas as $f) foreach ($cols as $c) $params[] = $f[$c];
    $renglon = '(' . implode(', ', array_fill(0, count($cols), '?')) . ')';
    $set = array_map(fn($c) => "$c = excluded.$c", array_diff($cols, $llaves));
    bd_ejecutar('AW', "insert into $tabla (" . implode(', ', $cols) . ') values ' . implode(', ', array_fill(0, count($filas), $renglon))
        . ' on conflict (' . implode(', ', $llaves) . ') do ' . ($set ? 'update set ' . implode(', ', $set) : 'nothing'), $params);
}

function acrineoGuardarRelacionados(int $id, array $d): void
{
    foreach (ACRINEO_TABLAS as $sec => $tabla) {
        acrineoUpsert($tabla, ['presupuesto_id'], [['presupuesto_id' => $id] + $d[$sec]]);
    }
    $filas = [];
    foreach ($d['ch']['parametros'] as $tipo => $v) $filas[] = ['presupuesto_id' => $id, 'tipo' => $tipo, 'espera' => $v['espera'], 'reserva' => $v['reserva']];
    acrineoUpsert('acrineo_ch_parametros', ['presupuesto_id', 'tipo'], $filas);

    $filas = [];
    foreach ($d['ch']['factores'] as $clave => $v) {
        $num = ACRINEO_CH_FACTORES[$clave][2] === 'num';
        $filas[] = ['presupuesto_id' => $id, 'grupo' => ACRINEO_CH_FACTORES[$clave][0], 'clave' => $clave,
                    'valor_numerico' => $num ? $v : null, 'valor_texto' => $num ? null : $v];
    }
    acrineoUpsert('acrineo_ch_factores', ['presupuesto_id', 'clave'], $filas);

    $filas = [];
    foreach ($d['monedas'] as $n => $m) $filas[] = ['presupuesto_id' => $id, 'numero' => (int) $n] + $m;
    acrineoUpsert('acrineo_presupuesto_monedas', ['presupuesto_id', 'numero'], $filas);
}

// Crea ($id null) o actualiza un presupuesto con todas sus pestañas. $version: la que tenía la ventana al abrirse
// (si otro usuario guardó antes, responde 409 para no pisar sus cambios). Regresa el detalle ya guardado.
function acrineoGuardar(?int $id, array $entrada, string $usuario, ?int $version = null): array
{
    $antes = null;
    if ($id) {
        $antes = acrineoObtener($id);
        if (!$antes) throw new AcrineoError('El presupuesto no existe o fue eliminado.', 404);
        if ($version === null) throw new AcrineoError('Falta la versión del presupuesto. Vuelve a abrirlo.', 400);
    }
    $d = acrineoValidar($entrada, $antes);
    acrineoValidarCatalogos($d);
    $usuario = mb_substr($usuario, 0, 50);
    $p = $d['presupuesto'];

    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        if (!$id) {
            $id = bd_insertar('AW', 'acrineo_presupuestos', 'presupuesto_id', $p + [
                'organizacion' => mb_substr((string) (sistemaConfig()['empresa']['nombre'] ?? ''), 0, 150) ?: null,
                'propietario'  => $usuario,
                'created_by'   => $usuario,
                'updated_by'   => $usuario,
            ]);
            bd_ejecutar('AW', "update acrineo_presupuestos set codigo = 'ACN-' || lpad(presupuesto_id::text, 6, '0') where presupuesto_id = ?", [$id]);
        } else {
            $set = implode(', ', array_map(fn($c) => "$c = ?", array_keys($p)));
            $n = bd_ejecutar('AW', "update acrineo_presupuestos set $set, version = version + 1, updated_at = now(), updated_by = ?
                                     where presupuesto_id = ? and version = ? and deleted_at is null",
                array_merge(array_values($p), [$usuario, $id, $version]));
            if ($n === 0) {
                throw new AcrineoError('Otro usuario guardó cambios en este presupuesto mientras lo editabas. Ciérralo y vuelve a abrirlo para ver la versión actual.', 409);
            }
        }
        acrineoGuardarRelacionados($id, $d);
        $despues = acrineoObtener($id);

        if ($antes === null) {
            acrineoRegistrar($id, $usuario, 'CREAR', [['Presupuesto', null, $despues['meta']['codigo'] . ' · ' . $despues['presupuesto']['nombre']]]);
        } else {
            acrineoRegistrar($id, $usuario, 'MODIFICAR', array_map(fn($c) => [$c[1], $c[2], $c[3]], acrineoDiferencias($antes, $despues)));
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return $despues;
}

// ---------- Eliminar (lógico) ----------

function acrineoEliminar(array $ids, string $usuario): int
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), fn($i) => $i > 0)));
    if (!$ids) throw new AcrineoError('No se indicó ningún presupuesto.');
    if (count($ids) > 100) throw new AcrineoError('Se pueden eliminar hasta 100 presupuestos a la vez.');
    $pdo = bd_pdo('AW');
    $pdo->beginTransaction();
    try {
        $filas = bd_filas('AW', 'update acrineo_presupuestos set deleted_at = now(), updated_by = ?, updated_at = now()
                                  where presupuesto_id in (' . implode(',', array_fill(0, count($ids), '?')) . ') and deleted_at is null
                                  returning presupuesto_id, codigo, nombre', array_merge([mb_substr($usuario, 0, 50)], $ids));
        foreach ($filas as $f) acrineoRegistrar((int) $f['presupuesto_id'], $usuario, 'ELIMINAR', [['Presupuesto', $f['codigo'] . ' · ' . $f['nombre'], null]]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    if (!$filas) throw new AcrineoError('El presupuesto no existe o ya fue eliminado.', 404);
    return count($filas);
}

// ---------- Respaldo ----------

// JSON con el detalle completo de los presupuestos (sin el contenido de los documentos, solo sus datos)
function acrineoRespaldo(array $ids, string $usuario): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), fn($i) => $i > 0)));
    if (!$ids) throw new AcrineoError('Selecciona al menos un presupuesto.');
    if (count($ids) > 100) throw new AcrineoError('Se pueden respaldar hasta 100 presupuestos a la vez.');
    $lista = [];
    foreach ($ids as $id) {
        $p = acrineoObtener($id);
        if ($p === null) continue;
        $p['documentos'] = acrineoDocListar($id);
        $lista[] = $p;
    }
    if (!$lista) throw new AcrineoError('Los presupuestos seleccionados ya no existen.', 404);
    return ['sistema' => 'ACRINEO · ACRI GLASS', 'formato' => 1, 'generado' => date('c'), 'usuario' => $usuario, 'presupuestos' => $lista];
}
