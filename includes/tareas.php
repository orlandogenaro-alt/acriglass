<?php
// Conceptos/Tareas de un presupuesto de obra (tabla conceptos_tareas). Los usan el presupuesto y la obra.
// Cada renglón es una tarea de js/conceptos-tareas.js: uid / padre_uid arman el árbol dentro del presupuesto,
// origen liga la tarea con su concepto de MP / MO / GO ('mp:3', 'mp:3:0' para una partida) y tipo 'Excluido'
// guarda los conceptos que el usuario quitó de la lista.
require_once __DIR__ . '/bd.php';

function tareasDisponibles(): bool
{
    return bd_tiene_columna('AW', 'conceptos_tareas', 'tarea_id');
}

function tareasAviso(): string
{
    return 'Falta crear la tabla de Conceptos/Tareas: corre ' . (ACRI_NUBE ? 'Consultas/supabase_obras.sql en Supabase' : 'Consultas/aw_conceptos_tareas.sql en AW-Management') . '.';
}

function leerTareas(int $presupuesto): array
{
    return bd_filas('AW',
        'select uid, padre_uid, orden, origen, tipo, clave, nombre, agrupador, descripcion, cantidad, unidad, monto,
                ini_real, fin_real, ini_cli, fin_cli, jornada, responsable, empleados, color, avance, estatus, manual
           from conceptos_tareas where docto_sugerido_obra_id = ? order by orden', [$presupuesto]);
}

// 'AAAA-MM-DDTHH:MM' del navegador → timestamp
function tareaFecha($v): ?string
{
    return preg_match('/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/', (string) $v, $m) ? "$m[1] $m[2]:00" : null;
}

function tareaTexto($v, int $largo): ?string
{
    $v = trim((string) ($v ?? ''));
    return $v === '' ? null : mb_substr($v, 0, $largo);
}

// Avance general: promedio de las tareas principales ponderado por su costo (todas igual si ninguna tiene costo).
// El de una tarea con subtareas es el de sus subtareas si alguna tiene avance; si no, el suyo.
// (Misma regla que avanceGeneral() de js/conceptos-tareas.js)
function avanceTareas(array $filas): int
{
    $hijas = [];
    $raiz = [];
    foreach ($filas as $f) {
        if (($f['tipo'] ?? '') === 'Excluido') continue;
        $padre = (int) ($f['padre_uid'] ?? 0);
        if ($padre) $hijas[$padre][] = $f; else $raiz[] = $f;
    }
    $avanceDe = function (array $lista) use (&$avanceDe, $hijas): float {
        if (!$lista) return 0.0;
        $conCosto = (bool) array_filter($lista, fn($f) => (float) ($f['monto'] ?? 0) > 0);
        $peso = $suma = 0.0;
        foreach ($lista as $f) {
            $p = $conCosto ? (float) ($f['monto'] ?? 0) : 1.0;
            $sub = $hijas[(int) $f['uid']] ?? [];
            $deHijas = $sub ? $avanceDe($sub) : 0.0;
            $peso += $p;
            $suma += $p * min(100, $deHijas > 0 ? $deHijas : max(0, (float) ($f['avance'] ?? 0)));
        }
        return $peso > 0 ? $suma / $peso : 0.0;
    };
    return (int) round($avanceDe($raiz));
}

// Reemplaza los Conceptos/Tareas del presupuesto. Si alguna tarea ya tiene avance y el presupuesto tiene
// obra, el avance de la obra se actualiza con el de las tareas. Regresa ['avance' => %, 'obra_id' => id|0].
// Se llama dentro de la transacción de quien guarda.
function guardarTareas(int $presupuesto, array $filas): array
{
    bd_ejecutar('AW', 'delete from conceptos_tareas where docto_sugerido_obra_id = ?', [$presupuesto]);
    $limpias = [];
    foreach (array_values($filas) as $i => $f) {
        $uid = (int) ($f['uid'] ?? 0);
        if (!$uid) continue;
        $tipo = tareaTexto($f['tipo'] ?? '', 15) ?? 'Tarea';
        $nombre = tareaTexto($f['nombre'] ?? '', 200);
        if ($nombre === null && $tipo !== 'Excluido') continue;
        $r = [
            'docto_sugerido_obra_id' => $presupuesto,
            'uid'         => $uid,
            'padre_uid'   => (int) ($f['padre_uid'] ?? 0) ?: null,
            'orden'       => $i + 1,
            'origen'      => tareaTexto($f['origen'] ?? '', 30),
            'tipo'        => $tipo,
            'clave'       => tareaTexto($f['clave'] ?? '', 30),
            'nombre'      => $nombre,
            'agrupador'   => tareaTexto($f['agrupador'] ?? '', 100),
            'descripcion' => tareaTexto($f['descripcion'] ?? '', 32000),
            'cantidad'    => round((float) ($f['cantidad'] ?? 0), 3),
            'unidad'      => tareaTexto($f['unidad'] ?? '', 30),
            'monto'       => round((float) ($f['monto'] ?? 0), 2),
            'ini_real'    => tareaFecha($f['ini_real'] ?? ''),
            'fin_real'    => tareaFecha($f['fin_real'] ?? ''),
            'ini_cli'     => tareaFecha($f['ini_cli'] ?? ''),
            'fin_cli'     => tareaFecha($f['fin_cli'] ?? ''),
            'jornada'     => tareaTexto($f['jornada'] ?? '', 50),
            'responsable' => tareaTexto($f['responsable'] ?? '', 150),
            'empleados'   => tareaTexto($f['empleados'] ?? '', 500),
            'color'       => preg_match('/^#[0-9a-f]{6}$/i', (string) ($f['color'] ?? '')) ? $f['color'] : null,
            'avance'      => round(min(100, max(0, (float) ($f['avance'] ?? 0))), 2),
            'estatus'     => tareaTexto($f['estatus'] ?? '', 20),
            'manual'      => tareaTexto($f['manual'] ?? '', 100),
            'fecha_mod'   => date('Y-m-d H:i:s'),
            'usuario_mod' => mb_substr((string) ($_SESSION['usuario'] ?? ''), 0, 50),
        ];
        bd_insertar('AW', 'conceptos_tareas', 'tarea_id', $r);
        $limpias[] = $r;
    }

    $avance = avanceTareas($limpias);
    $obra = (int) bd_valor('AW', 'select min(obra_id) from reg_obras where sugerido_id = ?', [$presupuesto]);
    $conAvance = array_filter($limpias, fn($f) => $f['tipo'] !== 'Excluido' && $f['avance'] > 0);
    if ($obra && $conAvance && bd_tiene_columna('AW', 'reg_obras', 'avance_obra')) {
        bd_ejecutar('AW', "update reg_obras set avance_obra = ? where obra_id = ? and estatus not in ('Finalizacion', 'Cancelado')", [$avance, $obra]);
    }
    return ['avance' => $avance, 'obra_id' => $obra, 'avance_obra' => $obra && $conAvance];
}
