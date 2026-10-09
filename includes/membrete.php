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
];

// Campos de texto: nombre => largo máximo
const ACRI_MEMBRETE_TEXTOS = [
    'empresa' => 120, 'datos' => 300, 'titulo' => 60, 'titulo_detalle' => 60,
    'codigo' => 20, 'revision' => 10, 'leyenda_firma' => 40, 'pie' => 300,
];

function membrete(): array
{
    $m = array_replace(ACRI_MEMBRETE_DEFECTO, configLeer('hoja_membretada'));
    $firmas = array_values(array_filter(array_map(fn($f) => trim((string) $f), (array) $m['firmas']), fn($f) => $f !== ''));
    $m['firmas'] = array_slice($firmas ?: ACRI_MEMBRETE_DEFECTO['firmas'], 0, 4);
    if (!preg_match('/^#[0-9a-f]{6}$/i', (string) $m['color'])) $m['color'] = ACRI_MEMBRETE_DEFECTO['color'];
    $m['mostrar_notas'] = (bool) $m['mostrar_notas'];
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
    if (isset($in['color']) && preg_match('/^#[0-9a-f]{6}$/i', (string) $in['color'])) $m['color'] = strtolower($in['color']);
    if (array_key_exists('mostrar_notas', $in)) $m['mostrar_notas'] = !empty($in['mostrar_notas']);
    configGuardar('hoja_membretada', $m);
    return membrete();
}
