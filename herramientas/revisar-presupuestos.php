<?php
// Revisión de los presupuestos después de las migraciones 017 a 021 (SOLO LECTURA: no cambia nada en la base).
// Solo desde la línea de comandos; nunca se publica en Vercel (.vercelignore).
//
//   php herramientas/revisar-presupuestos.php --env .env.pruebas           todos los presupuestos con Análisis P.U.
//   php herramientas/revisar-presupuestos.php --env .env.pruebas --id 123  uno solo (docto_sugerido_obra_id)
//
// Revisa:
//   1. Que estén las tablas y columnas de las migraciones 017 a 021.
//   2. Que los conceptos de cada presupuesto en presupuesto_conceptos / presupuesto_concepto_insumos sean los de su
//      JSON (doctos_sugerido_obra.analisis_pu): mismo número de conceptos, descripción, cantidad e insumos (con sus
//      componentes). Así se ve que la copia de la 017 y los guardados posteriores quedaron bien.
//   3. Que no haya conceptos repetidos (dos con el mismo orden en un presupuesto, p. ej. por guardar dos veces).
//   4. Que el Subtotal guardado siga cuadrando con sus renglones y su utilidad (los totales no cambiaron).
// Sale con código 1 si encuentra algo.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$args = array_slice($argv, 1);
$i = array_search('--env', $args, true);
if ($i !== false) {
    $archivo = $args[$i + 1] ?? '';
    if (!is_file($archivo)) { fwrite(STDERR, "No existe el archivo $archivo\n"); exit(2); }
    foreach (file($archivo, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $l) {
        if ($l[0] === '#' || strpos($l, '=') === false) continue;
        [$k, $v] = array_map('trim', explode('=', $l, 2));
        putenv("$k=" . trim($v, "\"'"));
    }
}
$j = array_search('--id', $args, true);
$soloId = $j !== false ? (int) ($args[$j + 1] ?? 0) : 0;

require __DIR__ . '/../includes/nube.php';
if (!ACRI_NUBE) { fwrite(STDERR, "Falta DB_HOST (variables de entorno o --env archivo).\n"); exit(2); }
require __DIR__ . '/../includes/bd.php';
require __DIR__ . '/../includes/calculo.php';
require __DIR__ . '/../includes/presupuesto-conceptos.php';

$problemas = 0;
function problema(string $texto): void
{
    global $problemas;
    $problemas++;
    echo "  PROBLEMA  $texto\n";
}

try {
    echo 'Base: ' . acri_env('DB_USER') . '@' . acri_env('DB_HOST') . "\n\n1. Migraciones\n";
    $requisitos = [
        '017' => fn() => bd_tiene_tabla('AW', 'presupuesto_conceptos') && bd_tiene_tabla('AW', 'presupuesto_concepto_insumos'),
        '018' => fn() => bd_tiene_columna('AW', 'presupuesto_concepto_insumos', 'fasar_id'),
        '019' => fn() => bd_tiene_columna('AW', 'doctos_sugerido_obra_det', 'calculo_base'),
        '020' => fn() => bd_tiene_tabla('AW', 'presupuesto_sobrecosto'),
        '021' => fn() => bd_tiene_columna('AW', 'presupuesto_conceptos', 'programa_inicio'),
    ];
    foreach ($requisitos as $m => $hay) {
        if ($hay()) echo "  ok        $m\n"; else problema("falta la migración $m (php herramientas/migrar.php --aplicar)");
    }
    if (!presupuestoConceptosDisponible()) { echo "\nSin la 017 no hay nada más que revisar.\n"; exit(1); }

    echo "\n2-4. Presupuestos\n";
    $filtro = $soloId ? ' and docto_sugerido_obra_id = ' . $soloId : '';
    $docs = bd_filas('AW', "select docto_sugerido_obra_id as id, folio, cliente, analisis_pu, subtotal, utilidad_neta_por,
                                   utilidad_modo
                              from doctos_sugerido_obra where analisis_pu is not null $filtro order by docto_sugerido_obra_id");
    // Insumos con sus componentes, en una sola cuenta: «Vidrio > Cuadrilla(Aluminero, Ayudante)»
    $firma = function (array $insumos) use (&$firma): string {
        return implode(', ', array_map(fn($i) => mb_strtoupper(trim((string) ($i['descripcion'] ?? ''))) . (!empty($i['componentes']) ? '(' . $firma($i['componentes']) . ')' : ''), $insumos));
    };
    $revisados = 0;
    foreach ($docs as $d) {
        $id = (int) $d['id'];
        $quien = "folio {$d['folio']} (id $id, {$d['cliente']})";
        $json = json_decode((string) $d['analisis_pu'], true);
        if (!is_array($json)) { problema("$quien: el JSON del análisis no se puede leer"); continue; }
        $revisados++;
        $deJson = array_values($json['conceptos'] ?? []);
        $deTabla = presupuestoConceptosLeer($id) ?? [];
        // 2. Tablas = JSON
        if (count($deJson) !== count($deTabla)) {
            problema("$quien: " . count($deJson) . ' conceptos en el JSON y ' . count($deTabla) . ' en las tablas');
        } else {
            foreach ($deJson as $n => $c) {
                $t = $deTabla[$n];
                $nombre = 'concepto ' . ($n + 1) . ' «' . mb_substr((string) ($c['descripcion'] ?? ''), 0, 40) . '»';
                if (trim((string) ($c['descripcion'] ?? '')) !== trim($t['descripcion'])) problema("$quien, $nombre: la descripción no coincide con la tabla");
                if (abs((float) ($c['cantidad'] ?? 0) - $t['cantidad']) > 0.0001) problema("$quien, $nombre: cantidad {$c['cantidad']} en el JSON y {$t['cantidad']} en la tabla");
                if ($firma($c['insumos'] ?? []) !== $firma($t['insumos'])) problema("$quien, $nombre: los insumos no coinciden con la tabla");
            }
        }
        // 3. Repetidos
        foreach (bd_filas('AW', 'select orden, count(*) as n from presupuesto_conceptos where docto_sugerido_obra_id = ?
                                  group by orden having count(*) > 1', [$id]) as $r) {
            problema("$quien: {$r['n']} conceptos con el mismo orden {$r['orden']} (¿repetidos?)");
        }
        // 4. El Subtotal guardado cuadra con sus renglones
        $costo = (float) bd_valor('AW', 'select coalesce(sum(presupuesto), 0) from doctos_sugerido_obra_det where docto_sugerido_obra_id = ?', [$id]);
        // Los guardados antes de la columna utilidad_modo no dicen la forma: vale la que cuadre (como al abrirlos)
        $modos = in_array(trim((string) $d['utilidad_modo']), ['costo', 'margen'], true) ? [trim($d['utilidad_modo'])] : ['margen', 'costo'];
        $cuadra = false;
        foreach ($modos as $modo) {
            $esperado = calculoSubtotal($costo, (float) $d['utilidad_neta_por'], $modo);
            $cuadra = $cuadra || calculoCuadra((float) $d['subtotal'], $esperado);
        }
        if (!$cuadra) {
            problema("$quien: el Subtotal guardado (" . number_format((float) $d['subtotal'], 2) . ') no cuadra con sus renglones ('
                . number_format($esperado, 2) . '). Puede ser un subtotal capturado a mano (lápiz).');
        }
    }
    echo "  $revisados presupuesto(s) revisado(s)\n";
    $sc = (int) bd_valor('AW', 'select count(*) from presupuesto_sobrecosto');
    echo "\n  Sobrecosto guardado en $sc presupuesto(s) (se llena al Guardar cada uno).\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Error: ' . $e->getMessage() . "\n");
    exit(2);
}
echo $problemas ? "\n$problemas problema(s).\n" : "\nTodo en orden.\n";
exit($problemas ? 1 : 0);
