<?php
// ACRINEO · reglas del «Detalle del presupuesto» (sin base de datos)
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/../includes/sistema.php';
require_once __DIR__ . '/../includes/acrineo/esquema.php';
require_once __DIR__ . '/../includes/acrineo/documentos.php';
require_once __DIR__ . '/../includes/acrineo/hoja-calculo.php';

echo "ACRINEO · presupuestos\n";

function acnErrores(array $entrada, ?array $base = null): array
{
    try {
        acrineoValidar($entrada, $base);
        return [];
    } catch (AcrineoError $e) {
        verificar($e->http === 422, 'el error de validación debe ser 422');
        return $e->errores;
    }
}

function acnMinimo(array $extra = []): array
{
    return array_replace_recursive(['presupuesto' => ['nombre' => 'PALMA CENTRAL', 'descripcion' => 'CANCELERIA']], $extra);
}

prueba('valores por defecto de C.H., cálculo y monedas', function () {
    $d = acrineoDefectos('2026-11-12');
    igual(100.0, $d['ch']['parametros']['depreciacion']['espera']);
    igual(15.0, $d['ch']['parametros']['depreciacion']['reserva']);
    igual(0.0, $d['ch']['parametros']['mantenimiento']['espera']);
    igual(15.0, $d['ch']['parametros']['llantas']['espera']);
    igual(5.0, $d['ch']['parametros']['otras_fuentes']['espera']);
    igual(0.003, $d['ch']['factores']['lubricante_potencia_0'], 6);
    igual(0.0033, $d['ch']['factores']['lubricante_potencia_mayor'], 6);
    igual(0.2271, $d['ch']['factores']['combustible_gasolina'], 6);
    igual(0.1514, $d['ch']['factores']['combustible_diesel'], 6);
    igual('TIIE', $d['ch']['factores']['indicador_seguros']);
    igual(16, $d['calculo']['iva']);
    igual(2, $d['calculo']['decimales_costos']);
    igual(4, $d['calculo']['decimales_cantidades']);
    igual(8, $d['calculo']['decimales_explosion']);
    igual('.', $d['configuracion']['separador_partidas']);
    igual('PESOS', $d['monedas'][1]['descripcion']);
    igual('USD', $d['monedas'][2]['remate']);
    igual('01_Propios', $d['presupuesto']['tipo']);
    igual('2026-11-12', $d['licitacion']['fecha_inicio']);
    igual('2026-11-12', $d['licitacion']['fecha_terminacion']);
});

prueba('nombre y descripción son obligatorios', function () {
    $e = acnErrores(['presupuesto' => ['nombre' => '  ', 'descripcion' => '']]);
    verificar(isset($e['presupuesto.nombre'], $e['presupuesto.descripcion']), 'faltan los errores de nombre y descripción');
    igual([], acnErrores(acnMinimo()));
});

prueba('decimales fuera de rango se rechazan', function () {
    $e = acnErrores(acnMinimo(['calculo' => ['decimales_costos' => 7, 'decimales_cantidades' => -1, 'decimales_explosion' => 9]]));
    verificar(isset($e['calculo.decimales_costos'], $e['calculo.decimales_cantidades'], $e['calculo.decimales_explosion']), 'deben fallar los tres');
    $e = acnErrores(acnMinimo(['calculo' => ['decimales_costos' => '2.5']]));
    verificar(isset($e['calculo.decimales_costos']), 'los decimales deben ser enteros');
    $d = acrineoValidar(acnMinimo(['calculo' => ['decimales_costos' => '6', 'decimales_cantidades' => 0, 'decimales_explosion' => '8']]));
    igual(6, $d['calculo']['decimales_costos']);
    igual(8, $d['calculo']['decimales_explosion']);
});

prueba('IVA entre 0 y 100', function () {
    verificar(isset(acnErrores(acnMinimo(['calculo' => ['iva' => 101]]))['calculo.iva']), 'IVA 101 debe fallar');
    verificar(isset(acnErrores(acnMinimo(['calculo' => ['iva' => 'abc']]))['calculo.iva']), 'IVA texto debe fallar');
    igual(8.0, acrineoValidar(acnMinimo(['calculo' => ['iva' => '8']]))['calculo']['iva']);
});

prueba('fecha de terminación = inicio + días (el primer día cuenta)', function () {
    igual('2026-11-12', acrineoFechaTerminacion('2026-11-12', 1));
    igual('2026-11-21', acrineoFechaTerminacion('2026-11-12', 10));
    igual('2027-01-01', acrineoFechaTerminacion('2026-12-31', 2));
    igual('2028-03-01', acrineoFechaTerminacion('2028-02-28', 3));   // año bisiesto
    igual(null, acrineoFechaTerminacion(null, 5));
    $d = acrineoValidar(acnMinimo(['licitacion' => ['fecha_inicio' => '2026-11-12', 'dias' => '30', 'fecha_terminacion' => '1999-01-01']]));
    igual('2026-12-11', $d['licitacion']['fecha_terminacion']);   // el servidor la recalcula: no acepta la del navegador
    verificar(isset(acnErrores(acnMinimo(['licitacion' => ['dias' => 0]]))['licitacion.dias']), '0 días debe fallar');
    verificar(isset(acnErrores(acnMinimo(['licitacion' => ['fecha_inicio' => '2026-02-30']]))['licitacion.fecha_inicio']), '30 de febrero no existe');
});

prueba('correo, código postal y separador', function () {
    $e = acnErrores(acnMinimo(['presupuesto' => ['correo' => 'no-es-correo', 'codigo_postal' => '<b>'], 'configuracion' => ['separador_partidas' => '..']]));
    verificar(isset($e['presupuesto.correo'], $e['presupuesto.codigo_postal'], $e['configuracion.separador_partidas']), 'deben fallar los tres');
    $d = acrineoValidar(acnMinimo(['presupuesto' => ['correo' => 'obra@acriglass.mx', 'codigo_postal' => '83000'], 'configuracion' => ['separador_partidas' => '-']]));
    igual('-', $d['configuracion']['separador_partidas']);
});

prueba('textos: longitud máxima y caracteres de control', function () {
    verificar(isset(acnErrores(acnMinimo(['presupuesto' => ['nombre' => str_repeat('x', 151)]]))['presupuesto.nombre']), '151 caracteres debe fallar');
    $d = acrineoValidar(acnMinimo(['presupuesto' => ['nombre' => "  OBRA\x07 1  ", 'observaciones' => "linea 1\nlinea 2"]]));
    igual('OBRA 1', $d['presupuesto']['nombre']);
    igual("linea 1\nlinea 2", $d['presupuesto']['observaciones']);
    verificar(isset(acnErrores(acnMinimo(['presupuesto' => ['nombre' => ['a']]]))['presupuesto.nombre']), 'un arreglo no es texto');
});

prueba('C.H.: porcentajes, factores e indicadores', function () {
    $d = acrineoValidar(acnMinimo(['ch' => ['parametros' => ['seguros' => ['espera' => '80', 'reserva' => 50]], 'factores' => ['combustible_otros' => '0.5', 'indicador_referencia' => 'CETES']]]));
    igual(80.0, $d['ch']['parametros']['seguros']['espera']);
    igual(100.0, $d['ch']['parametros']['inversion']['reserva']);   // lo que no viene toma su valor
    igual(0.5, $d['ch']['factores']['combustible_otros'], 6);
    igual('CETES', $d['ch']['factores']['indicador_referencia']);
    $e = acnErrores(acnMinimo(['ch' => ['parametros' => ['seguros' => ['espera' => -1]], 'factores' => ['indicador_seguros' => '']]]));
    verificar(isset($e['ch.parametros.seguros.espera'], $e['ch.factores.indicador_seguros']), 'deben fallar');
});

prueba('monedas: descripción, remate y tipo de cambio', function () {
    $d = acrineoValidar(acnMinimo(['monedas' => ['2' => ['tipo_cambio' => '18.25']]]));
    igual(18.25, $d['monedas'][2]['tipo_cambio'], 6);
    igual('DOLARES', $d['monedas'][2]['descripcion']);
    $e = acnErrores(acnMinimo(['monedas' => [1 => ['descripcion' => '', 'tipo_cambio' => 0]]]));
    verificar(isset($e['monedas.1.descripcion'], $e['monedas.1.tipo_cambio']), 'deben fallar');
});

prueba('en un cambio, lo que no viene conserva el valor guardado', function () {
    $base = acrineoValidar(acnMinimo(['calculo' => ['iva' => 8], 'presupuesto' => ['colonia' => 'CENTRO']]));
    $d = acrineoValidar(['presupuesto' => ['nombre' => 'OTRO']], $base);
    igual('OTRO', $d['presupuesto']['nombre']);
    igual('CENTRO', $d['presupuesto']['colonia']);
    igual(8.0, $d['calculo']['iva']);
});

prueba('historial: solo los campos que cambiaron, con nombres de catálogo', function () {
    $a = acrineoValidar(acnMinimo(['generales' => ['cliente_id' => 5]]));
    $a['generales']['cliente_nombre'] = 'CONSTRUCTORA A';
    $b = acrineoValidar(acnMinimo(['generales' => ['cliente_id' => 7], 'calculo' => ['iva' => 8, 'decimales_costos' => 3]]));
    $b['generales']['cliente_nombre'] = 'CONSTRUCTORA B';
    $cambios = acrineoDiferencias($a, $b);
    $rutas = array_column($cambios, 0);
    sort($rutas);
    igual(['calculo.decimales_costos', 'calculo.iva', 'generales.cliente_id'], $rutas);
    foreach ($cambios as [$ruta, $etiqueta, $antes, $despues]) {
        if ($ruta === 'generales.cliente_id') { igual('CONSTRUCTORA A', $antes); igual('CONSTRUCTORA B', $despues); }
        if ($ruta === 'calculo.iva') { igual('16', $antes); igual('8', $despues); igual('Cálculo · % IVA', $etiqueta); }
    }
    igual([], acrineoDiferencias($a, $a));
});

prueba('documentos: extensión, tipo real, tamaño y nombre', function () {
    igual(null, acrineoDocRechazo('FASAR 2026.xlsx', 2048, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
    igual(null, acrineoDocRechazo('costo horario.xls', 2048, 'application/CDFV2'));
    igual(null, acrineoDocRechazo('indirectos.pdf', 2048, 'application/pdf'));
    verificar(acrineoDocRechazo('virus.exe', 10, 'application/x-dosexec') !== null, '.exe no se acepta');
    verificar(acrineoDocRechazo('libro.php', 10, 'text/x-php') !== null, '.php no se acepta');
    verificar(acrineoDocRechazo('libro.php.xlsx', 10, 'application/zip') !== null, 'doble extensión no se acepta');
    verificar(acrineoDocRechazo('falso.pdf', 10, 'text/html') !== null, 'un HTML con extensión .pdf no se acepta');
    verificar(acrineoDocRechazo('grande.xlsx', ACRINEO_DOC_MAX + 1, 'application/zip') !== null, 'más de 4 MB no se acepta');
    verificar(acrineoDocRechazo('vacio.csv', 0, 'text/plain') !== null, 'vacío no se acepta');
    igual('libro.xlsx', acrineoDocNombre('C:\\fakepath\\libro.xlsx'));
    foreach (['', '.htaccess', "a\x00b.xlsx", 'a<b>.xlsx'] as $malo) {
        try { acrineoDocNombre($malo); throw new RuntimeException("se aceptó el nombre «$malo»"); } catch (AcrineoError $e) {}
    }
    [$tipo, $moneda] = acrineoDocLugar('libro_ch', 2);
    igual(null, $moneda);   // el libro C.H. no va por moneda
    [, $moneda] = acrineoDocLugar('libro_fasar', '2');
    igual(2, $moneda);
    try { acrineoDocLugar('libro_fasar', 3); throw new RuntimeException('moneda 3 aceptada'); } catch (AcrineoError $e) {}
});

prueba('hoja: precio unitario con sobrecosto e importe redondeado por renglón', function () {
    igual(1150.0, acrineoPrecioUnitario(1000, 15, 2));
    igual(123.46, acrineoPrecioUnitario(123.456, 0, 2));
    igual(0.0, acrineoPrecioUnitario(0, 15, 2));
    igual(3450.0, acrineoImporte(3, 1150, 2));
    igual(41.15, acrineoImporte(3.3333, 12.345, 2));
    igual(41.1496, acrineoImporte(3.3333, 12.345, 4), 4);
});

prueba('hoja: la partida suma sus renglones y los de sus subpartidas', function () {
    $padres = [1 => null, 2 => 1, 3 => 2, 4 => null];
    $t = acrineoTotalesPartidas($padres, [3 => ['costo' => 100, 'venta' => 115], 2 => ['costo' => 10, 'venta' => 11.5], 4 => ['costo' => 5, 'venta' => 6]], 2);
    igual(110.0, $t[1]['costo']); igual(126.5, $t[1]['venta']);
    igual(110.0, $t[2]['costo']); igual(100.0, $t[3]['costo']);
    igual(5.0, $t[4]['costo']);
});

prueba('hoja: código sugerido de partida y subpartida', function () {
    igual('A', acrineoSiguienteCodigoPartida(null, []));
    igual('C', acrineoSiguienteCodigoPartida(null, ['A', 'b', 'A1']));
    $usados = array_map(fn($i) => chr(65 + $i), range(0, 25));
    igual('AA', acrineoSiguienteCodigoPartida(null, $usados));
    igual('A1', acrineoSiguienteCodigoPartida('A', ['A']));
    igual('A11', acrineoSiguienteCodigoPartida('A1', ['A', 'A1']));
    igual('A12', acrineoSiguienteCodigoPartida('A1', ['A', 'A1', 'a11']));
});

prueba('hoja: orden de árbol con niveles', function () {
    $o = acrineoOrdenArbol([
        ['id' => 5, 'padre_id' => null, 'orden' => 1], ['id' => 1, 'padre_id' => null, 'orden' => 0],
        ['id' => 3, 'padre_id' => 1, 'orden' => 1], ['id' => 2, 'padre_id' => 1, 'orden' => 0], ['id' => 4, 'padre_id' => 2, 'orden' => 0],
    ]);
    igual([1, 2, 4, 3, 5], array_column($o, 'id'));
    igual([0, 1, 2, 1, 0], array_column($o, 'nivel'));
    igual([2, 1, 0, 0, 0], array_column($o, 'hijos'));
});

prueba('matriz P.U.: material con desperdicio, mano de obra, % de M.O. y % de materiales', function () {
    $m = acrineoCalcularMatriz([
        ['tipo' => 'MAT', 'cantidad' => 1.05, 'desperdicio_pct' => 0, 'costo' => 1250, 'base' => null],     // vidrio 1.05 m2 × 1250 = 1312.50
        ['tipo' => 'MAT', 'cantidad' => 0.4, 'desperdicio_pct' => 10, 'costo' => 120, 'base' => null],      // silicón 0.44 × 120 = 52.80
        ['tipo' => 'MO',  'cantidad' => 0.125, 'desperdicio_pct' => 0, 'costo' => 1600, 'base' => null],    // cuadrilla 1/8 jor = 200.00
        ['tipo' => 'HER', 'cantidad' => 3, 'desperdicio_pct' => 0, 'costo' => 0, 'base' => 'pct_mo'],        // 3 % de 200 = 6.00
        ['tipo' => 'EQ',  'cantidad' => 2, 'desperdicio_pct' => 0, 'costo' => 0, 'base' => 'pct_mat'],       // 2 % de 1365.30 = 27.31
    ], 2);
    igual(1312.50, $m['filas'][0]['importe']);
    igual(52.80, $m['filas'][1]['importe']);
    igual(0.44, $m['filas'][1]['cantidad_efectiva'], 6);
    igual(200.00, $m['filas'][2]['importe']);
    igual(6.00, $m['filas'][3]['importe']);
    igual(200.00, $m['filas'][3]['costo']);   // la base del %
    igual(27.31, $m['filas'][4]['importe']);
    igual(1365.30, $m['totales']['MAT']);
    igual(200.00, $m['totales']['MO']);
    igual(1598.61, $m['total']);
    igual(0.0, acrineoCalcularMatriz([], 2)['total']);
});

prueba('precio del concepto: costo × sobrecosto, o el precio fijo si es P.A.', function () {
    igual(1150.0, acrineoPrecioConcepto(1000, 15, 2, false, 999));
    igual(999.0, acrineoPrecioConcepto(1000, 15, 2, true, 999));
    igual(0.0, acrineoPrecioConcepto(1000, 15, 2, true, null));
});

prueba('URL del concepto: solo http/https, vacía = sin enlace', function () {
    igual([null, null], acrineoUrlConcepto('  '));
    igual(['https://proveedor.mx/ficha-vidrio.pdf', null], acrineoUrlConcepto(' https://proveedor.mx/ficha-vidrio.pdf '));
    igual('http://x.mx/a?b=1', acrineoUrlConcepto('http://x.mx/a?b=1')[0]);
    foreach (['javascript:alert(1)', 'ftp://x.mx/a', 'www.sin-esquema.mx', 'https://con espacio.mx', 'data:text/html,<b>x</b>'] as $mala) {
        verificar(acrineoUrlConcepto($mala)[1] !== null, "se aceptó «{$mala}»");
    }
    verificar(acrineoUrlConcepto('https://x.mx/' . str_repeat('a', 500))[1] !== null, 'más de 500 caracteres');
});
