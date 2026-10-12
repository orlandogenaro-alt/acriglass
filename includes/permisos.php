<?php
// Permisos que revisa el sistema (exigirPermiso / tienePermiso) y los que se asignan en
// Administrador › Usuarios y Administrador › Roles. Mismos nombres que las columnas de
// PERMISOS_USUARIOS de AW-Management. Al usar un permiso nuevo en el código, agrégalo aquí.
const ACRI_PERMISOS = [
    'ADMIN_USER'              => 'Administrador: todo el sistema y el menú Administrador',
    'MODULO_SUGERIDOS_OBRA'   => 'Consultar presupuestos y obras',
    'NUEVO_SUGERIDO_OBRA'     => 'Crear presupuestos de obra',
    'MODIFICAR_SUGERIDO_OBRA' => 'Modificar presupuestos de obra',
    'NUEVO_OBRA'              => 'Registrar obras',
    'MODIFICAR_OBRA'          => 'Modificar obras',
    'CERRAR_OBRA'             => 'Cerrar obras',
    'MODIFICAR_ASIGNAR_MO'    => 'Modificar mano de obra asignada a la obra',
    'CANCELAR_ASIGNAR_MO'     => 'Cancelar mano de obra asignada a la obra',
    'ENVIAR_MICROSIP_OBRA'    => 'Enviar presupuestos de Easy-Glass a Microsip (Pedido y Orden de compra)',
    'NUEVO_EMPLEADOS_OBRA'    => 'Alta y cambios de empleados de obra',
    'NUEVO_TIPO_EMPLEADO'     => 'Alta y cambios de tipos de empleado',
];

// Solo los permisos conocidos, en mayúsculas y sin repetir
function permisosValidos($lista): array
{
    $lista = array_map(fn($p) => strtoupper(trim((string) $p)), is_array($lista) ? $lista : []);
    return array_values(array_intersect(array_keys(ACRI_PERMISOS), $lista));
}

// Permisos marcados en el formulario del catálogo (perm_ADMIN_USER: true…)
function permisosFormulario(array $in): array
{
    $marcados = [];
    foreach ($in as $k => $v) {
        if (strncmp($k, 'perm_', 5) === 0 && $v) $marcados[] = substr($k, 5);
    }
    return permisosValidos($marcados);
}

// Usuarios, roles y permisos por renglón solo existen en Supabase; en AW (Firebird) cada permiso es una columna
function exigirSupabase(): void
{
    if (bd_motor('AW') !== 'pgsql') {
        error('Los usuarios y roles se administran en Supabase. En el servidor local (AW-Management) se siguen dando de alta en el sistema de escritorio.', 503);
    }
}
