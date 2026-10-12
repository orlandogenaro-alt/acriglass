<?php
// Estatus de los Presupuestos de Obra (Administrador › Estatus de Presupuestos).
// Se guardan en la configuración del sistema (config/estatus_presupuestos.json o tabla configuracion)
// y salen en el menú «Actualizar Estatus» del presupuesto. El nombre se guarda tal cual en
// doctos_sugerido_obra.estatus (VARCHAR(15)).
require_once __DIR__ . '/sistema.php';

// color => [nombre, muestra para la lista del administrador]
const ACRI_ESTATUS_COLORES = [
    'ambar' => ['Amarillo', '#f5c26b'],
    'azul'  => ['Azul',     '#3b82f6'],
    'verde' => ['Verde',    '#22c55e'],
    'rojo'  => ['Rojo',     '#f87171'],
    'gris'  => ['Gris',     '#94a3b8'],
];

// Los usa el sistema (estatus de un presupuesto nuevo, indicadores de la pantalla General, botón Cancelar):
// se les puede cambiar el color y la descripción, pero no el nombre ni eliminarlos
const ACRI_ESTATUS_SISTEMA = ['Pendiente', 'Aceptado', 'Cancelado'];

const ACRI_ESTATUS_DEFECTO = [
    ['nombre' => 'Pendiente',   'descripcion' => 'Presupuesto recién capturado', 'color' => 'ambar', 'activo' => true],
    ['nombre' => 'Seguimiento', 'descripcion' => 'Presupuesto en seguimiento',   'color' => 'azul',  'activo' => true],
    ['nombre' => 'Aceptado',    'descripcion' => 'Presupuesto aceptado',         'color' => 'verde', 'activo' => true],
    ['nombre' => 'Rechazado',   'descripcion' => 'Presupuesto rechazado',        'color' => 'rojo',  'activo' => true],
    ['nombre' => 'Cancelado',   'descripcion' => 'Presupuesto cancelado',        'color' => 'gris',  'activo' => true],
];

// Lista vigente: [{nombre, descripcion, color, activo, sistema}] en el orden del administrador
function estatusPresupuesto(): array
{
    $lista = configLeer('estatus_presupuestos')['lista'] ?? null;
    if (!is_array($lista) || !$lista) $lista = ACRI_ESTATUS_DEFECTO;

    $res = [];
    foreach ($lista as $e) {
        $nombre = trim((string) ($e['nombre'] ?? ''));
        if ($nombre === '' || isset($res[mb_strtoupper($nombre)])) continue;
        $sistema = in_array($nombre, ACRI_ESTATUS_SISTEMA, true);
        $res[mb_strtoupper($nombre)] = [
            'nombre'      => $nombre,
            'descripcion' => (string) ($e['descripcion'] ?? ''),
            'color'       => isset(ACRI_ESTATUS_COLORES[$e['color'] ?? '']) ? $e['color'] : 'gris',
            'activo'      => $sistema || !empty($e['activo']),
            'sistema'     => $sistema,
        ];
    }
    // Los del sistema siempre existen
    foreach (ACRI_ESTATUS_DEFECTO as $d) {
        if (in_array($d['nombre'], ACRI_ESTATUS_SISTEMA, true) && !isset($res[mb_strtoupper($d['nombre'])])) {
            $res[mb_strtoupper($d['nombre'])] = $d + ['sistema' => true];
        }
    }
    return array_values($res);
}

function estatusGuardar(array $lista): void
{
    configGuardar('estatus_presupuestos', ['lista' => array_map(fn($e) => [
        'nombre' => $e['nombre'], 'descripcion' => $e['descripcion'], 'color' => $e['color'], 'activo' => (bool) $e['activo'],
    ], array_values($lista))]);
}

// Nombre válido tal como está en el catálogo (sin importar mayúsculas), o null
function estatusValido($nombre): ?string
{
    $n = mb_strtoupper(trim((string) $nombre));
    foreach (estatusPresupuesto() as $e) {
        if (mb_strtoupper($e['nombre']) === $n) return $e['nombre'];
    }
    return null;
}

// Reglas del Form46 para pasar de un estatus a otro; regresa el motivo si no se permite, o null.
//   Aceptado / Cancelado: no desde Aceptado, Cancelado ni Rechazado
//   Rechazado:            no desde Aceptado ni Cancelado
//   Seguimiento y los demás del catálogo: no desde Cancelado ni Rechazado
function estatusTransicion(string $antes, string $despues): ?string
{
    $a = mb_strtoupper(trim($antes));
    $d = mb_strtoupper(trim($despues));
    if ($a === $d) return null;
    $bloquean = [
        'ACEPTADO'  => ['ACEPTADO', 'CANCELADO', 'RECHAZADO'],
        'CANCELADO' => ['ACEPTADO', 'CANCELADO', 'RECHAZADO'],
        'RECHAZADO' => ['ACEPTADO', 'CANCELADO'],
    ][$d] ?? ['CANCELADO', 'RECHAZADO'];
    return in_array($a, $bloquean, true) ? "En el estatus actual del presupuesto ($antes) ya no es posible pasarlo a $despues." : null;
}

// Un presupuesto Aceptado o Cancelado ya no se modifica (Form46: Modificar)
function estatusBloqueaCambios(string $estatus): bool
{
    return in_array(mb_strtoupper(trim($estatus)), ['ACEPTADO', 'CANCELADO'], true);
}
