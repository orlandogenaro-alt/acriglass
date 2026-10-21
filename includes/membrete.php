<?php
// Hoja membretada de los formatos impresos (Administrador › Hoja Membretada).
// Se guarda en config/hoja_membretada.json (o tabla configuracion); el logo es la imagen
// «membrete» de api/imagenes.php y, si no se sube, se usa el logo del sistema.
require_once __DIR__ . '/sistema.php';

const ACRI_MEMBRETE_DEFECTO = [
    'empresa'        => '',          // nombre bajo el logo (vacío = no se imprime)
    'datos'          => '',          // dirección, teléfonos, RFC… (bajo el logo, opcional)
    'titulo'         => 'PRESUPUESTO POR PROYECTO',
    'titulo_detalle' => 'PRESUPUESTO POR PROYECTO DETALLE',
    'codigo'         => 'CT-REG-13',
    'revision'       => '00',
    'firmas'         => ['ELABORO', 'REVISO', 'REVISO', 'AUTORIZO'],
    'leyenda_firma'  => 'Nombre y Firma',
    'pie'            => '',
    'color'          => '#000000',   // líneas y títulos de sección
    'mostrar_notas'  => true,
    // Formato Análisis de Cancelería (Imprimir › Análisis de Cancelería)
    'an_titulo'          => 'COSTOS ACRISTALA',
    'an_subtitulo'       => 'ANALISIS CANCELERIA',
    'an_codigo'          => 'CT-REG-13',
    'an_revision'        => '00',
    'an_fecha_emision'   => '08-07-2020',
    'an_etiqueta_cliente'=> 'ARQUITECTO',
    'an_nota'            => 'COMIDAS ESTAN AUTORIZADAS SIEMPRE Y CUANDO SEAN EN HORARIOS EXTRAORDINARIOS QUE ENTREN ALAS 7AM O REGRESEN DESPUES DE LAS 8PM TRABAJOS NOCTURNOS',
    'an_autorizo'        => 'Autorizó',
    'an_puesto'          => 'Dirección General',
    'an_nombre'          => 'LIC. FERNANDO LOVERA COLÍN',
    'an_color'           => '#daeef3',   // relleno de encabezados de columna y totales
    'an_color_titulo'    => '#95b3d7',   // relleno del subtítulo (ANALISIS CANCELERIA)
    'an_dolares'         => true,        // renglón Total en dólares (con el tipo de cambio)
];

// Campos de texto: nombre => largo máximo
const ACRI_MEMBRETE_TEXTOS = [
    'empresa' => 120, 'datos' => 300, 'titulo' => 60, 'titulo_detalle' => 60,
    'codigo' => 20, 'revision' => 10, 'leyenda_firma' => 40, 'pie' => 300,
    'an_titulo' => 60, 'an_subtitulo' => 60, 'an_codigo' => 20, 'an_revision' => 10, 'an_fecha_emision' => 20,
    'an_etiqueta_cliente' => 30, 'an_nota' => 500, 'an_autorizo' => 40, 'an_puesto' => 60, 'an_nombre' => 80,
];

function membrete(): array
{
    $m = array_replace(ACRI_MEMBRETE_DEFECTO, configLeer('hoja_membretada'));
    $firmas = array_values(array_filter(array_map(fn($f) => trim((string) $f), (array) $m['firmas']), fn($f) => $f !== ''));
    $m['firmas'] = array_slice($firmas ?: ACRI_MEMBRETE_DEFECTO['firmas'], 0, 4);
    foreach (['color', 'an_color', 'an_color_titulo'] as $k) {
        if (!preg_match('/^#[0-9a-f]{6}$/i', (string) $m[$k])) $m[$k] = ACRI_MEMBRETE_DEFECTO[$k];
    }
    $m['mostrar_notas'] = (bool) $m['mostrar_notas'];
    $m['an_dolares'] = (bool) $m['an_dolares'];
    return $m;
}

// Lo que necesita la impresión: textos + logo vigente
function membreteImpresion(): array
{
    $cfg = sistemaConfig();
    $m = membrete();
    $m['logo'] = imagenPropia('membrete', $cfg) ? $cfg['imagenes']['membrete'] : imagenSistema('logo', $cfg);
    $m['logo_propio'] = imagenPropia('membrete', $cfg);
    return $m;
}

function membreteGuardar(array $in): array
{
    $m = membrete();
    foreach (ACRI_MEMBRETE_TEXTOS as $k => $largo) {
        if (array_key_exists($k, $in)) $m[$k] = mb_substr(trim((string) $in[$k]), 0, $largo);
    }
    for ($i = 0; $i < 4; $i++) {
        if (array_key_exists("firma$i", $in)) $m['firmas'][$i] = mb_substr(trim((string) $in["firma$i"]), 0, 30);
    }
    foreach (['color', 'an_color', 'an_color_titulo'] as $k) {
        if (isset($in[$k]) && preg_match('/^#[0-9a-f]{6}$/i', (string) $in[$k])) $m[$k] = strtolower($in[$k]);
    }
    foreach (['mostrar_notas', 'an_dolares'] as $k) {
        if (array_key_exists($k, $in)) $m[$k] = !empty($in[$k]);
    }
    configGuardar('hoja_membretada', $m);
    return membrete();
}
