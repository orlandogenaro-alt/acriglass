<?php
// Catálogos de obra en AW-Management: Vendedores de Obra, Empleados y Tipos de Empleados
// ?tipo=vendedores|empleados|tipos en todas las peticiones
// GET  ?accion=listar              renglones para el listado del menú Catalogos
// GET  ?accion=ficha&id=N          registro para la ficha (id 0 = nuevo) con sus listas
// POST ?accion=guardar             {id, …campos}; regresa { id }
// POST ?accion=eliminar            {id}   solo si no está en uso
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/bd.php';
require __DIR__ . '/../includes/respuesta.php';

if (modoConfiguracion()) error('Modo configuración: aún no hay conexión a AW-Management.', 503);

// tabla, columna id, generador de Firebird (el mismo de su trigger en AW), permisos para dar de alta / cambiar
const CATALOGOS_OBRA = [
    'vendedores' => ['vendedores_obras', 'vendedor_obra_id', 'id_catalogos', ['NUEVO_SUGERIDO_OBRA', 'MODIFICAR_SUGERIDO_OBRA', 'ADMIN_USER']],
    'empleados'  => ['empleados_obra', 'empleado_id', 'id_elementos', ['NUEVO_EMPLEADOS_OBRA', 'ADMIN_USER']],
    'tipos'      => ['tipos_empleados_comisiones', 'tipo_empleado_id', 'id_contador', ['NUEVO_TIPO_EMPLEADO', 'NUEVO_EMPLEADOS_OBRA', 'ADMIN_USER']],
];

$tipo = $_GET['tipo'] ?? '';
if (!isset(CATALOGOS_OBRA[$tipo])) error('Catálogo no válido.');
[$tabla, $colId, $generador, $permisosAlta] = CATALOGOS_OBRA[$tipo];

exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_SUGERIDO_OBRA', 'MODIFICAR_SUGERIDO_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', ...$permisosAlta);
$accion = $_GET['accion'] ?? 'listar';
if ($accion === 'guardar' || $accion === 'eliminar') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
    exigirCsrf();
    exigirPermiso(...$permisosAlta);
}
$puedeModificar = tienePermiso(...$permisosAlta);
session_write_close();

function texto($v, int $largo): ?string
{
    $v = trim(preg_replace('/\s+/u', ' ', (string) ($v ?? '')));
    return $v === '' ? null : mb_substr($v, 0, $largo);
}

function numero($v, string $campo): float
{
    if ($v === '' || $v === null) return 0.0;
    if (!is_numeric($v)) error("$campo debe ser un número.");
    return round((float) $v, 2);
}

function estatusTexto($e): string
{
    return strtoupper(trim((string) $e)) === 'B' ? 'Baja' : 'Activo';
}

function listar(string $tipo): array
{
    switch ($tipo) {
        case 'vendedores':
            return array_map(fn($f) => ['id' => (int) $f['vendedor_obra_id'], 'estatus' => estatusTexto($f['estatus'])] + $f,
                bd_filas('AW', 'select vendedor_obra_id, nombre, estatus from vendedores_obras order by nombre'));
        case 'empleados':
            return array_map(fn($f) => ['id' => (int) $f['empleado_id'], 'estatus' => estatusTexto($f['estatus'])] + $f,
                bd_filas('AW', 'select e.empleado_id, e.numero_empleado, e.nombre, t.nombre as tipo_empleado, e.telefono,
                                       e.sueldo_diario, e.estatus
                                  from empleados_obra e
                                  left join tipos_empleados_comisiones t on t.tipo_empleado_id = e.tipo
                                 order by e.nombre'));
        case 'tipos':
            return array_map(fn($f) => ['id' => (int) $f['tipo_empleado_id']] + $f,
                bd_filas('AW', 'select tipo_empleado_id, clave, nombre, porcentaje from tipos_empleados_comisiones order by nombre'));
    }
    return [];
}

function existe(string $tabla, string $colId, int $id): void
{
    if (!$id || !bd_valor('AW', "select count(*) from $tabla where $colId = ?", [$id])) error('El registro ya no existe (¿lo eliminaron?).', 404);
}

// Mismo nombre en otro registro
function repetido(string $tabla, string $colId, string $col, string $valor, int $id): bool
{
    return (bool) bd_valor('AW', "select count(*) from $tabla where upper(trim($col)) = ? and $colId <> ?", [mb_strtoupper($valor), $id]);
}

function guardar(string $tipo, string $tabla, string $colId, string $generador, array $d): int
{
    $id = (int) ($d['id'] ?? 0);
    if ($id) existe($tabla, $colId, $id);
    $nombre = texto($d['nombre'] ?? '', $tipo === 'empleados' ? 200 : ($tipo === 'tipos' ? 50 : 150));
    if ($nombre === null) error('Captura el nombre.');
    $nombre = mb_strtoupper($nombre);

    switch ($tipo) {
        case 'vendedores':
            if (repetido($tabla, $colId, 'nombre', $nombre, $id)) error("Ya existe el vendedor «{$nombre}».");
            $campos = ['nombre' => $nombre, 'estatus' => !empty($d['activo']) ? 'A' : 'B'];
            // Propietario de HubSpot del vendedor (migración 013): sus presupuestos quedan a su nombre en HubSpot
            if (bd_tiene_columna('AW', 'vendedores_obras', 'id_hubspot')) {
                $hs = trim((string) ($d['id_hubspot'] ?? ''));
                if ($hs !== '' && !ctype_digit($hs)) error('El Id de HubSpot del vendedor es un número (el Id de propietario / owner).');
                $campos['id_hubspot'] = $hs === '' ? null : $hs;
            }
            break;

        case 'empleados':
            if (repetido($tabla, $colId, 'nombre', $nombre, $id)) error("Ya existe el empleado «{$nombre}».");
            $num = trim((string) ($d['numero_empleado'] ?? ''));
            if ($num !== '' && !ctype_digit($num)) error('El número de empleado debe ser un número entero.');
            if ($num !== '' && bd_valor('AW', "select count(*) from empleados_obra where numero_empleado = ? and empleado_id <> ?", [(int) $num, $id])) {
                error("El número de empleado $num ya está asignado.");
            }
            $tipoEmp = (int) ($d['tipo'] ?? 0);
            if ($tipoEmp && !bd_valor('AW', 'select count(*) from tipos_empleados_comisiones where tipo_empleado_id = ?', [$tipoEmp])) {
                error('El tipo de empleado ya no existe.');
            }
            $campos = [
                'numero_empleado' => $num === '' ? null : (int) $num,
                'nombre'          => $nombre,
                'tipo'            => $tipoEmp ?: null,
                'estatus'         => !empty($d['activo']) ? 'A' : 'B',
                'telefono'        => texto($d['telefono'] ?? '', 50),
                'direccion'       => texto($d['direccion'] ?? '', 430),
                'sueldo_diario'   => numero($d['sueldo_diario'] ?? 0, 'El sueldo diario'),
                'comision'        => numero($d['comision'] ?? 0, 'La comisión'),
            ];
            break;

        case 'tipos':
            if (repetido($tabla, $colId, 'nombre', $nombre, $id)) error("Ya existe el tipo de empleado «{$nombre}».");
            $pct = numero($d['porcentaje'] ?? 0, 'El porcentaje');
            if ($pct < 0 || $pct > 100) error('El porcentaje debe estar entre 0 y 100.');
            $campos = ['clave' => texto(mb_strtoupper((string) ($d['clave'] ?? '')), 20), 'nombre' => $nombre, 'porcentaje' => $pct];
            break;
    }

    if ($id) {
        bd_ejecutar('AW', "update $tabla set " . implode(', ', array_map(fn($k) => "$k = ?", array_keys($campos)))
            . " where $colId = ?", array_merge(array_values($campos), [$id]));
        return $id;
    }
    return bd_insertar('AW', $tabla, $colId, $campos, $generador);
}

function eliminar(string $tipo, string $tabla, string $colId, int $id): void
{
    existe($tabla, $colId, $id);
    switch ($tipo) {
        case 'vendedores':
            $usos = (int) bd_valor('AW', 'select count(*) from doctos_sugerido_obra where vendedor_obra_id = ?', [$id])
                  + (int) bd_valor('AW', 'select count(*) from responsables_de_obra where vendedor_obra_id = ?', [$id]);
            if ($usos) error('El vendedor ya está en presupuestos u obras y no se puede eliminar: desmarca «Activo» para darlo de baja.');
            break;
        case 'empleados':
            error('Los empleados no se eliminan (pueden tener salidas a obra): desmarca «Activo» para darlo de baja.');
        case 'tipos':
            if (bd_valor('AW', 'select count(*) from empleados_obra where tipo = ?', [$id])) {
                error('Hay empleados con este tipo: cámbialos de tipo antes de eliminarlo.');
            }
            break;
    }
    bd_ejecutar('AW', "delete from $tabla where $colId = ?", [$id]);
}

try {
    switch ($accion) {
        case 'listar':
            responder(['ok' => true, 'filas' => listar($tipo), 'puede_modificar' => $puedeModificar]);

        case 'ficha':
            $id = (int) ($_GET['id'] ?? 0);
            $r = ['ok' => true, 'registro' => null, 'puede_modificar' => $puedeModificar];
            if ($id) {
                $r['registro'] = bd_fila('AW', "select * from $tabla where $colId = ?", [$id]);
                if (!$r['registro']) error('El registro ya no existe (¿lo eliminaron?).', 404);
                $r['registro']['id'] = $id;
                if (isset($r['registro']['estatus'])) $r['registro']['activo'] = strtoupper(trim((string) $r['registro']['estatus'])) !== 'B';
            }
            if ($tipo === 'empleados') {
                $r['tipos'] = bd_filas('AW', 'select tipo_empleado_id as id, nombre from tipos_empleados_comisiones order by nombre');
            }
            responder($r);

        case 'guardar':
            responder(['ok' => true, 'id' => guardar($tipo, $tabla, $colId, $generador, entrada())]);

        case 'eliminar':
            eliminar($tipo, $tabla, $colId, (int) (entrada()['id'] ?? 0));
            responder(['ok' => true]);
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/catalogos: ' . $e->getMessage());
    error('No se pudo completar en AW-Management: ' . bd_mensaje_error($e), 500);
}
