<?php
// Mini marco de pruebas (sin Composer ni PHPUnit): prueba('nombre', fn) y verificar / igual dentro.
// Se corre desde la línea de comandos: php pruebas/correr.php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$GLOBALS['pruebas_fallas'] = 0;
$GLOBALS['pruebas_total'] = 0;

function prueba(string $nombre, callable $fn): void
{
    $GLOBALS['pruebas_total']++;
    try {
        $fn();
        echo "  ok    $nombre\n";
    } catch (Throwable $e) {
        $GLOBALS['pruebas_fallas']++;
        echo "  FALLA $nombre\n        " . $e->getMessage() . "\n";
    }
}

function verificar(bool $condicion, string $mensaje = 'la condición no se cumple'): void
{
    if (!$condicion) throw new RuntimeException($mensaje);
}

// Igualdad de importes a centavos (o a $decimales)
function igual($esperado, $obtenido, int $decimales = 2): void
{
    if (is_float($esperado) || is_float($obtenido)) {
        if (abs((float) $esperado - (float) $obtenido) < pow(10, -$decimales) / 2) return;
    } elseif ($esperado === $obtenido) {
        return;
    }
    throw new RuntimeException('se esperaba ' . var_export($esperado, true) . ' y se obtuvo ' . var_export($obtenido, true));
}
