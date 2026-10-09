<?php
// Administrador › Estatus de Presupuestos (config/estatus_presupuestos.json o tabla configuracion)
// GET  ?accion=listar
// POST ?accion=guardar   {clave, nuevo, nombre, descripcion, color}
// POST ?accion=activar   {clave}   los del sistema no se desactivan
// POST ?accion=subir | bajar {clave}   orden en el menú «Actualizar Estatus»
// POST ?accion=eliminar  {clave}   solo si ningún presupuesto lo tiene y no es del sistema
// clave = nombre del estatus en mayúsculas. Al renombrar se actualizan los presupuestos que lo tienen.
define('ACRI_API', true);
require __DIR__ . '/../includes/sesion.php';
require __DIR__ . '/../includes/bd.php';
require __DIR__ . '/../includes/estatus.php';
require __DIR__ . '/../includes/respuesta.php';

exigirPermiso('ADMIN_USER');

$accion = $_GET['accion'] ?? 'listar';
if ($accion !== 'listar') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido.', 405);
    exigirCsrf();
}
session_write_close();

$in = entrada();

// Presupuestos por estatus (en mayúsculas); sin conexión a AW la columna sale vacía
function usos(): ?array
{
    if (modoConfiguracion()) return null;
    try {
        $n = [];
        foreach (bd_filas('AW', 'select upper(trim(estatus)) as estatus, count(*) as n from doctos_sugerido_obra group by upper(trim(estatus))') as $f) {
            $n[(string) $f['estatus']] = (int) $f['n'];
        }
        return $n;
    } catch (Throwable $e) {
        error_log('AcriGlass api/estatus usos: ' . $e->getMessage());
        return null;
    }
}

function listar(): void
{
    $usos = usos();
    $filas = [];
    foreach (estatusPresupuesto() as $i => $e) {
        $clave = mb_strtoupper($e['nombre']);
        $filas[] = $e + [
            'clave'  => $clave,
            'orden'  => $i + 1,
            'activa' => $e['activo'],
            'color_nombre' => ACRI_ESTATUS_COLORES[$e['color']][0],
            'muestra'      => ACRI_ESTATUS_COLORES[$e['color']][1],
            'usos'   => $usos === null ? null : ($usos[$clave] ?? 0),
        ];
    }
    responder(['ok' => true, 'filas' => $filas, 'colores' => ACRI_ESTATUS_COLORES]);
}

// Posición del estatus en la lista
function posicion(array $lista, $clave): int
{
    foreach ($lista as $i => $e) {
        if (mb_strtoupper($e['nombre']) === mb_strtoupper(trim((string) $clave))) return $i;
    }
    error('El estatus ya no existe.', 404);
}

try {
    $lista = estatusPresupuesto();

    switch ($accion) {
        case 'listar':
            listar();

        case 'guardar':
            $nuevo  = !empty($in['nuevo']);
            $nombre = trim(preg_replace('/\s+/u', ' ', (string) ($in['nombre'] ?? '')));
            $desc   = mb_substr(trim((string) ($in['descripcion'] ?? '')), 0, 100);
            $color  = (string) ($in['color'] ?? '');
            if ($nombre === '' || mb_strlen($nombre) > 15) error('Escribe el nombre del estatus (máximo 15 caracteres).');
            if (!isset(ACRI_ESTATUS_COLORES[$color])) error('Elige un color.');

            $i = $nuevo ? -1 : posicion($lista, $in['clave'] ?? '');
            foreach ($lista as $j => $e) {
                if ($j !== $i && mb_strtoupper($e['nombre']) === mb_strtoupper($nombre)) error("Ya existe el estatus «{$e['nombre']}».");
            }

            if ($nuevo) {
                $lista[] = ['nombre' => $nombre, 'descripcion' => $desc, 'color' => $color, 'activo' => true];
            } else {
                $anterior = $lista[$i]['nombre'];
                if ($lista[$i]['sistema'] && $nombre !== $anterior) error("«{$anterior}» lo usa el sistema: solo se le puede cambiar el color y la descripción.");
                if ($nombre !== $anterior) {
                    if (modoConfiguracion()) error('Modo configuración: sin conexión a AW-Management no se puede renombrar (los presupuestos guardan el nombre).', 503);
                    bd_ejecutar('AW', 'update doctos_sugerido_obra set estatus = ? where upper(trim(estatus)) = ?', [$nombre, mb_strtoupper($anterior)]);
                }
                $lista[$i] = ['nombre' => $nombre, 'descripcion' => $desc, 'color' => $color] + $lista[$i];
            }
            estatusGuardar($lista);
            listar();

        case 'activar':
            $i = posicion($lista, $in['clave'] ?? '');
            if ($lista[$i]['sistema']) error("«{$lista[$i]['nombre']}» lo usa el sistema y no se puede desactivar.");
            $lista[$i]['activo'] = !$lista[$i]['activo'];
            estatusGuardar($lista);
            listar();

        case 'subir':
        case 'bajar':
            $i = posicion($lista, $in['clave'] ?? '');
            $j = $accion === 'subir' ? $i - 1 : $i + 1;
            if (isset($lista[$j])) {
                [$lista[$i], $lista[$j]] = [$lista[$j], $lista[$i]];
                estatusGuardar($lista);
            }
            listar();

        case 'eliminar':
            $i = posicion($lista, $in['clave'] ?? '');
            $e = $lista[$i];
            if ($e['sistema']) error("«{$e['nombre']}» lo usa el sistema y no se puede eliminar.");
            $usos = usos();
            if ($usos === null) error('Sin conexión a AW-Management no se puede revisar si algún presupuesto lo usa. Desactívalo en su lugar.');
            if ($n = $usos[mb_strtoupper($e['nombre'])] ?? 0) {
                error("Hay $n presupuesto(s) con estatus «{$e['nombre']}»: no se puede eliminar. Usa «Activar / Desactivar» para que ya no se ofrezca.");
            }
            array_splice($lista, $i, 1);
            estatusGuardar($lista);
            listar();
    }
    error('Acción no válida.');
} catch (Throwable $e) {
    error_log('AcriGlass api/estatus: ' . $e->getMessage());
    error('No se pudo completar: ' . bd_mensaje_error($e), 500);
}
