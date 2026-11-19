<?php
// ACRINEO · Catálogos generales (menú Catalogos › Unidades, Tipos de insumos, Familias, Estados, Ciudades, Proveedores,
// Responsables, Empresas, Tipos de licitaciones y Regiones). Una sola pantalla (acrineo-catalogos.php?c=clave) y una
// sola API (api/acrineo/catalogos-generales.php) que se arman con la definición de cada catálogo:
//   tabla, id, donde (filtro de los vigentes), orden, cols (las columnas de la cuadrícula), usos (dónde se usa un
//   registro: no se borra si alguien lo usa), renombrar (al cambiar un valor se cambia también donde se usa por texto).
// Columnas: titulo, tipo (texto · largo · correo · cp · rfc · url · bool · ref = id de otro catálogo · lista = texto
//   que debe existir en otro catálogo), max, requerido, mayus, unico, soloLectura, ref, ancho.
// Clientes y Vendedores no están aquí: ya tienen su ficha en Catalogos › Clientes y Vendedores de Obra.
require_once __DIR__ . '/esquema.php';
require_once __DIR__ . '/catalogos.php';

function acrineoCatGenerales(): array
{
    $tel = ['tipo' => 'texto', 'max' => 35, 'ancho' => 120];
    $ciudad = ['titulo' => 'Ciudad', 'tipo' => 'ref', 'ref' => 'ciudades', 'ancho' => 170];
    return [
        'unidades' => [
            'titulo' => 'Unidades', 'singular' => 'la unidad', 'tabla' => 'unidades', 'id' => 'unidad_id',
            'donde' => "estatus = 'A'", 'orden' => 'upper(clave), unidad_id', 'migracion' => '004',
            'cols' => [
                'clave'  => ['titulo' => 'Unidad', 'tipo' => 'texto', 'max' => 10, 'requerido' => true, 'unico' => true, 'ancho' => 120],
                'nombre' => ['titulo' => 'Descripción', 'tipo' => 'texto', 'max' => 60, 'vacio' => ''],
            ],
            'usos' => [['insumos', 'unidad_id', 'insumos'], ['conceptos_pu', 'unidad_id', 'Conceptos P.U.']],
        ],
        'tipos_insumo' => [
            'titulo' => 'Tipos de insumos', 'singular' => 'el tipo de insumo', 'tabla' => 'acrineo_tipos_insumo', 'id' => 'tipo_id',
            'orden' => 'sistema desc, tipo_id', 'migracion' => '028', 'bloqueo' => 'sistema',
            'aviso_bloqueo' => 'Es un tipo del sistema: no se borra ni cambia de clave.',
            'cols' => [
                'tipo'        => ['titulo' => 'Tipo', 'tipo' => 'texto', 'max' => 3, 'requerido' => true, 'mayus' => true, 'unico' => true,
                                  'patron' => '/^[A-Z0-9]{1,3}$/', 'patron_msg' => 'Usa de 1 a 3 letras o números.', 'fija_bloqueo' => true, 'ancho' => 90],
                'descripcion' => ['titulo' => 'Descripción', 'tipo' => 'texto', 'max' => 60, 'requerido' => true],
            ],
            'usos' => [['acrineo_matriz', 'tipo', 'renglones de matrices', 'tipo']],
            'renombrar' => ['tipo' => [['acrineo_matriz', 'tipo']]],
        ],
        'familias' => [
            'titulo' => 'Familias', 'singular' => 'la familia', 'tabla' => 'acrineo_familias', 'id' => 'familia_id',
            'orden' => 'upper(familia)', 'migracion' => '035',
            'cols' => [
                'familia'     => ['titulo' => 'Familia', 'tipo' => 'texto', 'max' => 80, 'requerido' => true, 'unico' => true, 'ancho' => 200],
                'descripcion' => ['titulo' => 'Descripción', 'tipo' => 'texto', 'max' => 150],
            ],
            'usos' => [['insumos', 'familia', 'insumos', 'familia'], ['conceptos_pu', 'familia', 'Conceptos P.U.', 'familia']],
            'renombrar' => ['familia' => [['insumos', 'familia'], ['conceptos_pu', 'familia']]],
        ],
        'estados' => [
            'titulo' => 'Estados', 'singular' => 'el estado', 'tabla' => 'acrineo_estados', 'id' => 'estado_id',
            'orden' => 'upper(nombre)', 'migracion' => '035',
            'cols' => [
                'estado' => ['titulo' => 'Estado', 'tipo' => 'texto', 'max' => 5, 'requerido' => true, 'mayus' => true, 'unico' => true, 'ancho' => 90],
                'nombre' => ['titulo' => 'Nombre', 'tipo' => 'texto', 'max' => 60, 'requerido' => true, 'unico' => true],
            ],
            'usos' => [['ciudades', 'estado', 'ciudades', 'nombre']],
            'renombrar' => ['nombre' => [['ciudades', 'estado']]],
        ],
        'ciudades' => [
            'titulo' => 'Ciudades', 'singular' => 'la ciudad', 'tabla' => 'ciudades', 'id' => 'ciudad_id',
            'orden' => 'upper(nombre)', 'migracion' => '035', 'requiere' => 'acrineo_estados',
            'cols' => [
                'nombre' => ['titulo' => 'Ciudad', 'tipo' => 'texto', 'max' => 100, 'requerido' => true, 'unico' => true, 'ancho' => 240],
                'estado' => ['titulo' => 'Estado', 'tipo' => 'lista', 'ref' => 'estados', 'max' => 60, 'requerido' => true, 'ancho' => 200],
            ],
            'usos' => [['clientes', 'ciudad_id', 'clientes'], ['acrineo_presupuestos', 'ciudad_id', 'presupuestos de ACRINEO'],
                       ['acrineo_proveedores', 'ciudad_id', 'proveedores'], ['acrineo_empresas', 'ciudad_id', 'empresas']],
        ],
        'proveedores' => [
            'titulo' => 'Proveedores', 'singular' => 'el proveedor', 'tabla' => 'acrineo_proveedores', 'id' => 'proveedor_id',
            'orden' => 'upper(proveedor)', 'migracion' => '035', 'creado_por' => 'created_by',
            'cols' => [
                'proveedor'     => ['titulo' => 'Proveedor', 'tipo' => 'texto', 'max' => 20, 'requerido' => true, 'mayus' => true, 'unico' => true, 'ancho' => 100],
                'ciudad_id'     => $ciudad,
                'razon_social'  => ['titulo' => 'Razón social', 'tipo' => 'texto', 'max' => 150, 'requerido' => true, 'ancho' => 260],
                'rfc'           => ['titulo' => 'RFC', 'tipo' => 'rfc', 'max' => 18, 'ancho' => 130],
                'direccion'     => ['titulo' => 'Dirección', 'tipo' => 'texto', 'max' => 200, 'ancho' => 220],
                'colonia'       => ['titulo' => 'Colonia', 'tipo' => 'texto', 'max' => 100, 'ancho' => 150],
                'codigo_postal' => ['titulo' => 'Código postal', 'tipo' => 'cp', 'max' => 10, 'ancho' => 100],
                'telefono'      => ['titulo' => 'Teléfono'] + $tel,
                'fax'           => ['titulo' => 'Fax'] + $tel,
                'mail'          => ['titulo' => 'Mail', 'tipo' => 'correo', 'max' => 150, 'ancho' => 190],
                'contacto'      => ['titulo' => 'Contacto', 'tipo' => 'texto', 'max' => 150, 'ancho' => 170],
                'observaciones' => ['titulo' => 'Observaciones', 'tipo' => 'texto', 'max' => 500, 'ancho' => 220],
                'celular'       => ['titulo' => 'Celular'] + $tel,
                'pagina_web'    => ['titulo' => 'Página web', 'tipo' => 'url', 'max' => 200, 'ancho' => 190],
                'es_default'    => ['titulo' => 'Es proveedor default', 'tipo' => 'bool', 'unico_si' => true, 'ancho' => 90],
            ],
            'usos' => [],
        ],
        'responsables' => [
            'titulo' => 'Responsables', 'singular' => 'el responsable', 'tabla' => 'usuarios', 'id' => 'usuario_id',
            'donde' => "u.estatus = 'A'", 'orden' => 'upper(coalesce(nullif(btrim(u.nombre), \'\'), u.login))', 'migracion' => '035',
            'desde' => 'usuarios u left join acrineo_responsables r on r.usuario_id = u.usuario_id', 'alias' => 'u',
            'sin_alta' => true, 'sin_baja' => true, 'guardar' => 'acrineoCatResponsableGuardar',
            'nota' => 'Los responsables son los usuarios del sistema: se dan de alta y de baja en Administrador › Usuarios. Aquí se capturan su cargo, teléfono y correo.',
            'cols' => [
                'login'    => ['titulo' => 'Responsable', 'tipo' => 'texto', 'soloLectura' => true, 'sql' => 'u.login', 'ancho' => 130],
                'nombre'   => ['titulo' => 'Nombre', 'tipo' => 'texto', 'soloLectura' => true, 'sql' => "coalesce(nullif(btrim(u.nombre), ''), u.login)", 'ancho' => 240],
                'cargo'    => ['titulo' => 'Cargo', 'tipo' => 'texto', 'max' => 100, 'sql' => 'r.cargo', 'ancho' => 200],
                'telefono' => ['titulo' => 'Teléfono', 'sql' => 'r.telefono'] + $tel,
                'mail'     => ['titulo' => 'Mail', 'tipo' => 'correo', 'max' => 150, 'sql' => 'coalesce(r.mail, u.correo)', 'ancho' => 220],
            ],
        ],
        'empresas' => [
            'titulo' => 'Empresas', 'singular' => 'la empresa', 'tabla' => 'acrineo_empresas', 'id' => 'empresa_id',
            'donde' => "estatus = 'A'", 'orden' => 'upper(nombre)', 'migracion' => '035', 'creado_por' => 'created_by',
            'cols' => [
                'clave'         => ['titulo' => 'Empresa', 'tipo' => 'texto', 'max' => 20, 'mayus' => true, 'unico' => true, 'ancho' => 100],
                'nombre'        => ['titulo' => 'Razón social', 'tipo' => 'texto', 'max' => 150, 'requerido' => true, 'mayus' => true, 'unico' => true, 'ancho' => 260],
                'ciudad_id'     => $ciudad,
                'direccion'     => ['titulo' => 'Dirección', 'tipo' => 'texto', 'max' => 200, 'ancho' => 220],
                'colonia'       => ['titulo' => 'Colonia', 'tipo' => 'texto', 'max' => 100, 'ancho' => 150],
                'responsable'   => ['titulo' => 'Responsable', 'tipo' => 'texto', 'max' => 150, 'ancho' => 180],
                'telefono'      => ['titulo' => 'Teléfono'] + $tel,
                'rfc'           => ['titulo' => 'RFC', 'tipo' => 'rfc', 'max' => 18, 'mayus' => true, 'ancho' => 130],
                'codigo_postal' => ['titulo' => 'Código postal', 'tipo' => 'cp', 'max' => 10, 'ancho' => 100],
            ],
            'usos' => [['acrineo_presupuesto_generales', 'empresa_id', 'presupuestos de ACRINEO']],
        ],
        'tipos_licitacion' => [
            'titulo' => 'Tipos de licitaciones', 'singular' => 'el tipo de licitación', 'tabla' => 'acrineo_tipos_licitacion',
            'id' => 'tipo_licitacion_id', 'orden' => 'tipo_licitacion_id', 'migracion' => '035',
            'cols' => [
                'tipo'        => ['titulo' => 'Tipo', 'tipo' => 'texto', 'max' => 10, 'requerido' => true, 'mayus' => true, 'unico' => true, 'ancho' => 90],
                'descripcion' => ['titulo' => 'Descripción', 'tipo' => 'texto', 'max' => 60, 'requerido' => true, 'mayus' => true, 'unico' => true],
            ],
            'usos' => [['acrineo_presupuesto_licitacion', 'tipo_licitacion', 'presupuestos de ACRINEO', 'descripcion']],
            'renombrar' => ['descripcion' => [['acrineo_presupuesto_licitacion', 'tipo_licitacion']]],
        ],
        'regiones' => [
            'titulo' => 'Regiones', 'singular' => 'la región', 'tabla' => 'zonas_clientes', 'id' => 'zona_cliente_id',
            'orden' => 'zona_cliente_id', 'migracion' => '016',
            'cols' => [
                'region' => ['titulo' => 'Región', 'tipo' => 'texto', 'soloLectura' => true, 'sql' => 'zona_cliente_id::text', 'auto' => true, 'ancho' => 90],
                'nombre' => ['titulo' => 'Descripción', 'tipo' => 'texto', 'max' => 100, 'requerido' => true, 'unico' => true],
            ],
            'usos' => [['clientes', 'zona_cliente_id', 'clientes'], ['acrineo_presupuesto_generales', 'region_id', 'presupuestos de ACRINEO']],
        ],
    ];
}

function acrineoCatDef(string $clave): array
{
    $d = acrineoCatGenerales()[$clave] ?? null;
    if ($d === null) throw new AcrineoError('Catálogo no válido.', 400);
    return $d + ['clave' => $clave, 'donde' => '', 'usos' => [], 'renombrar' => [], 'alias' => ''];
}

function acrineoCatDisponible(array $d): bool
{
    if (!bd_tiene_tabla('AW', $d['tabla'])) return false;
    if (!empty($d['requiere']) && !bd_tiene_tabla('AW', $d['requiere'])) return false;
    if ($d['clave'] === 'responsables') return bd_tiene_tabla('AW', 'acrineo_responsables');
    if ($d['clave'] === 'empresas') return bd_tiene_columna('AW', 'acrineo_empresas', 'clave');
    return true;
}

// Lo que necesita la pantalla para pintar la cuadrícula
function acrineoCatCliente(array $d): array
{
    $cols = [];
    foreach ($d['cols'] as $k => $c) {
        $cols[] = ['k' => $k, 'titulo' => $c['titulo'], 'tipo' => $c['tipo'], 'max' => $c['max'] ?? null,
                   'requerido' => !empty($c['requerido']), 'mayus' => !empty($c['mayus']), 'soloLectura' => !empty($c['soloLectura']),
                   'auto' => !empty($c['auto']), 'ref' => $c['ref'] ?? null, 'fijaBloqueo' => !empty($c['fija_bloqueo']),
                   'ancho' => $c['ancho'] ?? null];
    }
    return ['clave' => $d['clave'], 'titulo' => $d['titulo'], 'singular' => $d['singular'], 'cols' => $cols,
            'sinAlta' => !empty($d['sin_alta']), 'sinBaja' => !empty($d['sin_baja']), 'nota' => $d['nota'] ?? '',
            'avisoBloqueo' => $d['aviso_bloqueo'] ?? ''];
}

function acrineoCatColSql(array $d, string $k, array $c): string
{
    return $c['sql'] ?? (($d['alias'] ? $d['alias'] . '.' : '') . $k);
}

// Renglones del catálogo: [{id, <columna>: valor…, bloqueado}]
function acrineoCatListar(array $d): array
{
    $pre = $d['alias'] ? $d['alias'] . '.' : '';
    $sel = ["{$pre}{$d['id']} as id"];
    foreach ($d['cols'] as $k => $c) $sel[] = acrineoCatColSql($d, $k, $c) . " as $k";
    if (!empty($d['bloqueo'])) $sel[] = "{$pre}{$d['bloqueo']} as bloqueado";
    $sql = 'select ' . implode(', ', $sel) . ' from ' . ($d['desde'] ?? $d['tabla'])
         . ($d['donde'] ? " where {$d['donde']}" : '') . " order by {$d['orden']} limit 20000";
    $filas = bd_filas('AW', $sql);
    foreach ($filas as &$f) {
        $f['id'] = (int) $f['id'];
        foreach ($d['cols'] as $k => $c) {
            if ($c['tipo'] === 'bool') $f[$k] = in_array($f[$k], [true, 't', 'true', 1, '1'], true);
            elseif ($c['tipo'] === 'ref') $f[$k] = $f[$k] === null ? null : (int) $f[$k];
            elseif (is_string($f[$k])) $f[$k] = trim($f[$k]);
        }
        $f['bloqueado'] = isset($f['bloqueado']) && in_array($f['bloqueado'], [true, 't', 'true', 1, '1'], true);
    }
    return $filas;
}

// Opciones de las columnas que se eligen de otro catálogo: { ciudades: [{id, texto, extra}], estados: […] }
function acrineoCatRefs(array $d): array
{
    $refs = [];
    foreach ($d['cols'] as $c) {
        $r = $c['ref'] ?? null;
        if (!$r || isset($refs[$r])) continue;
        if ($r === 'ciudades') {
            $refs[$r] = array_map(fn($f) => ['id' => (int) $f['id'], 'texto' => trim($f['texto']), 'extra' => $f['extra']],
                bd_filas('AW', 'select ciudad_id as id, nombre as texto, estado as extra from ciudades order by upper(nombre)'));
        } elseif ($r === 'estados') {
            $refs[$r] = bd_tiene_tabla('AW', 'acrineo_estados')
                ? array_map(fn($f) => ['id' => trim($f['texto']), 'texto' => trim($f['texto']), 'extra' => trim($f['extra'])],
                    bd_filas('AW', 'select nombre as texto, estado as extra from acrineo_estados order by upper(nombre)'))
                : [];
        }
    }
    return $refs;
}

// Valida un valor según su columna. Regresa [valor, error]
function acrineoCatValor(array $c, $v, array $refs): array
{
    if (is_string($v)) $v = trim(preg_replace('/\s+/u', ' ', $v));
    switch ($c['tipo']) {
        case 'bool':
            return [in_array($v, [true, 1, '1', 'true', 't', 'si', 'sí', 'SI', 'SÍ', 'x', 'X'], true), null];
        case 'ref':
            if ($v === null || $v === '' || $v === 0 || $v === '0') return [null, !empty($c['requerido']) ? 'Es obligatorio.' : null];
            foreach ($refs[$c['ref']] ?? [] as $o) {
                if ((is_int($v) || ctype_digit((string) $v)) && $o['id'] === (int) $v) return [$o['id'], null];
                if (is_string($v) && mb_strtoupper($o['texto']) === mb_strtoupper($v)) return [$o['id'], null];
            }
            return [null, 'No está en el catálogo.'];
        case 'lista':
            if ($v === null || $v === '') return [null, !empty($c['requerido']) ? 'Es obligatorio.' : null];
            foreach ($refs[$c['ref']] ?? [] as $o) {
                if (mb_strtoupper($o['texto']) === mb_strtoupper((string) $v) || mb_strtoupper((string) $o['extra']) === mb_strtoupper((string) $v)) {
                    return [$o['texto'], null];
                }
            }
            return [null, 'No está en el catálogo.'];
        case 'rfc':
            [$v, $e] = acrineoValor($v, ['tipo' => 'texto', 'max' => $c['max'] ?? 18]);
            if ($v === null || $e) return [$v, $e];
            $v = mb_strtoupper($v);
            return preg_match('/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/u', $v) ? [$v, null] : [null, 'RFC no válido.'];
        case 'url':
            [$v, $e] = acrineoValor($v, ['tipo' => 'texto', 'max' => $c['max'] ?? 200]);
            if ($v === null || $e) return [$v, $e];
            if (!preg_match('~^[a-z][a-z0-9+.-]*://~i', $v)) $v = 'https://' . $v;
            return preg_match('~^https?://[^\s/$.?#][^\s]*$~i', $v) ? [$v, null] : [null, 'Dirección no válida.'];
    }
    [$v, $e] = acrineoValor($v, $c);
    if ($v !== null && !empty($c['mayus'])) $v = mb_strtoupper($v);
    if ($v !== null && isset($c['patron']) && !preg_match($c['patron'], $v)) return [null, $c['patron_msg'] ?? 'Valor no válido.'];
    return [$v, $e];
}

// Alta ($id null) o cambio de un renglón. $in = { columna: valor… }. Regresa el id
function acrineoCatGuardar(array $d, ?int $id, array $in, string $usuario, ?array $refs = null): int
{
    if (!empty($d['guardar'])) return ($d['guardar'])($d, $id, $in, $refs ?? acrineoCatRefs($d));
    if ($id === null && !empty($d['sin_alta'])) throw new AcrineoError('Este catálogo no admite altas.', 400);
    $refs = $refs ?? acrineoCatRefs($d);
    $actual = null;
    if ($id !== null) {
        $actual = bd_fila('AW', "select * from {$d['tabla']} where {$d['id']} = ?" . ($d['donde'] ? " and {$d['donde']}" : ''), [$id]);
        if (!$actual) throw new AcrineoError(ucfirst($d['singular']) . ' ya no existe.', 404);
    }
    $bloqueado = $actual && !empty($d['bloqueo']) && in_array($actual[$d['bloqueo']], [true, 't', 'true', 1, '1'], true);

    $campos = [];
    $errores = [];
    foreach ($d['cols'] as $k => $c) {
        if (!empty($c['soloLectura'])) continue;
        // En un cambio, lo que no viene se queda como está
        if ($actual !== null && !array_key_exists($k, $in)) continue;
        [$v, $e] = acrineoCatValor($c, $in[$k] ?? null, $refs);
        // Un valor de lista que ya tenía (p. ej. un estado escrito antes de existir el catálogo) se respeta
        if ($e && $c['tipo'] === 'lista' && $actual !== null && is_string($in[$k] ?? null)
            && mb_strtoupper(trim($in[$k])) === mb_strtoupper(trim((string) $actual[$k]))) {
            [$v, $e] = [trim((string) $actual[$k]), null];
        }
        if ($e) { $errores[$k] = $e; continue; }
        if ($v === null && isset($c['vacio'])) $v = $c['vacio'];
        if ($bloqueado && !empty($c['fija_bloqueo']) && trim((string) $v) !== trim((string) $actual[$k])) {
            $errores[$k] = 'No se puede cambiar en un registro del sistema.';
            continue;
        }
        if ($v !== null && $v !== '' && !empty($c['unico'])
            && bd_valor('AW', "select {$d['id']} from {$d['tabla']} where upper(btrim($k)) = upper(btrim(?)) and {$d['id']} <> ?"
                . ($d['donde'] ? " and {$d['donde']}" : ''), [$v, $id ?? 0])) {
            $errores[$k] = 'Ya existe.';
            continue;
        }
        $campos[$k] = $c['tipo'] === 'bool' ? ($v ? 't' : 'f') : $v;
    }
    if ($errores) throw new AcrineoError('Revisa ' . $d['singular'] . ': ' . implode(' ', array_map(
        fn($k, $e) => $d['cols'][$k]['titulo'] . ': ' . $e, array_keys($errores), $errores)), 422, $errores);

    bd_escribir('AW', function () use ($d, &$id, $campos, $actual, $usuario) {
        if ($id === null) {
            if (!empty($d['creado_por'])) $campos[$d['creado_por']] = mb_substr($usuario, 0, 50);
            $id = bd_insertar('AW', $d['tabla'], $d['id'], $campos);
        } elseif ($campos) {
            $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($campos)));
            bd_ejecutar('AW', "update {$d['tabla']} set $sets where {$d['id']} = ?", array_merge(array_values($campos), [$id]));
            // Donde se guarda el texto (no el id), se cambia también
            foreach ($d['renombrar'] as $k => $destinos) {
                if (!array_key_exists($k, $campos) || trim((string) $actual[$k]) === trim((string) $campos[$k])) continue;
                foreach ($destinos as [$tabla, $col]) {
                    if (!bd_tiene_tabla('AW', $tabla)) continue;
                    bd_ejecutar('AW', "update $tabla set $col = ? where upper(btrim($col)) = upper(btrim(?))", [$campos[$k], $actual[$k]]);
                }
            }
        }
        // Solo uno puede ser el predeterminado
        foreach ($d['cols'] as $k => $c) {
            if (!empty($c['unico_si']) && ($campos[$k] ?? 'f') === 't') {
                bd_ejecutar('AW', "update {$d['tabla']} set $k = false where $k and {$d['id']} <> ?", [$id]);
            }
        }
    });
    return $id;
}

// Responsables: solo cargo, teléfono y correo (el usuario se da de alta en Administrador › Usuarios)
function acrineoCatResponsableGuardar(array $d, ?int $id, array $in, array $refs): int
{
    if ($id === null) throw new AcrineoError('Los responsables se dan de alta en Administrador › Usuarios.', 400);
    if (!bd_valor('AW', "select usuario_id from usuarios where usuario_id = ? and estatus = 'A'", [$id])) {
        throw new AcrineoError('El usuario ya no existe o está dado de baja.', 404);
    }
    $actual = bd_fila('AW', 'select r.cargo, r.telefono, coalesce(r.mail, u.correo) as mail from usuarios u
                              left join acrineo_responsables r on r.usuario_id = u.usuario_id where u.usuario_id = ?', [$id]);
    $vals = [];
    $errores = [];
    foreach (['cargo', 'telefono', 'mail'] as $k) {
        if (!array_key_exists($k, $in)) { $vals[$k] = $actual[$k]; continue; }
        [$v, $e] = acrineoCatValor($d['cols'][$k], $in[$k], $refs);
        if ($e) $errores[$k] = $e; else $vals[$k] = $v;
    }
    if ($errores) throw new AcrineoError('Revisa el responsable.', 422, $errores);
    bd_ejecutar('AW', 'insert into acrineo_responsables (usuario_id, cargo, telefono, mail) values (?, ?, ?, ?)
                       on conflict (usuario_id) do update set cargo = excluded.cargo, telefono = excluded.telefono, mail = excluded.mail',
        [$id, $vals['cargo'], $vals['telefono'], $vals['mail']]);
    return $id;
}

// Borra el renglón si nadie lo usa; si lo usan, dice dónde
function acrineoCatEliminar(array $d, int $id): void
{
    if (!empty($d['sin_baja'])) throw new AcrineoError('Este catálogo no admite bajas.', 400);
    $r = bd_fila('AW', "select * from {$d['tabla']} where {$d['id']} = ?", [$id]);
    if (!$r) throw new AcrineoError(ucfirst($d['singular']) . ' ya no existe.', 404);
    $primera = array_key_first(array_filter($d['cols'], fn($c) => empty($c['soloLectura']))) ?? '';
    $nombre = trim((string) ($r[$primera] ?? $id));
    if (!empty($d['bloqueo']) && in_array($r[$d['bloqueo']], [true, 't', 'true', 1, '1'], true)) {
        throw new AcrineoError(ucfirst($d['singular']) . " $nombre es del sistema y no se puede borrar.", 409);
    }
    $usos = [];
    foreach ($d['usos'] as $u) {
        [$tabla, $col, $texto] = $u;
        if (!bd_tiene_tabla('AW', $tabla)) continue;
        $n = isset($u[3])
            ? (int) bd_valor('AW', "select count(*) from $tabla where upper(btrim($col)) = upper(btrim(?))", [(string) $r[$u[3]]])
            : (int) bd_valor('AW', "select count(*) from $tabla where $col = ?", [$id]);
        if ($n) $usos[] = "$n $texto";
    }
    $pron = strncmp($d['singular'], 'el ', 3) === 0 ? 'lo' : 'la';
    if ($usos) throw new AcrineoError("No se puede borrar {$d['singular']} $nombre: $pron usan " . implode(', ', $usos) . '.', 409);
    bd_ejecutar('AW', "delete from {$d['tabla']} where {$d['id']} = ?", [$id]);
}

// Pegar de Excel: cada renglón se da de alta o, si su clave ya existe, se actualiza. Regresa {altas, cambios, errores: [texto]}
function acrineoCatPegar(array $d, array $filas, string $usuario): array
{
    if (count($filas) > 2000) throw new AcrineoError('Pega como máximo 2,000 renglones a la vez.', 422);
    $refs = acrineoCatRefs($d);
    $llave = null;
    foreach ($d['cols'] as $k => $c) if (!empty($c['unico']) && empty($c['soloLectura'])) { $llave = $k; break; }
    $res = ['altas' => 0, 'cambios' => 0, 'errores' => []];
    foreach (array_values($filas) as $i => $f) {
        if (!is_array($f)) continue;
        try {
            $id = null;
            if ($llave !== null && trim((string) ($f[$llave] ?? '')) !== '') {
                $id = bd_valor('AW', "select {$d['id']} from {$d['tabla']} where upper(btrim($llave)) = upper(btrim(?))"
                    . ($d['donde'] ? " and {$d['donde']}" : ''), [trim((string) $f[$llave])]);
                $id = $id ? (int) $id : null;
            }
            if ($id === null && !empty($d['sin_alta'])) {
                // Responsables: se busca por el usuario
                $id = (int) bd_valor('AW', "select usuario_id from usuarios where upper(btrim(login)) = upper(btrim(?)) and estatus = 'A'",
                    [trim((string) ($f['login'] ?? ''))]) ?: null;
                if ($id === null) throw new AcrineoError('No existe el usuario ' . trim((string) ($f['login'] ?? '')) . '.', 404);
            }
            acrineoCatGuardar($d, $id, $f, $usuario, $refs);
            $res[$id === null ? 'altas' : 'cambios']++;
        } catch (AcrineoError $e) {
            $res['errores'][] = 'Renglón ' . ($i + 1) . ': ' . $e->getMessage();
        }
    }
    return $res;
}
