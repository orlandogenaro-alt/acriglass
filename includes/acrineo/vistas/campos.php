<?php
// ACRINEO · Ayudantes de las vistas: campos generados desde el esquema (etiqueta, tipo, longitud, rango y
// obligatorio salen de includes/acrineo/esquema.php) e iconos SVG. Todo texto pasa por e().
require_once __DIR__ . '/../esquema.php';

const AN_ICONOS = [
    'buscar'    => '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    'cerrar'    => '<path d="M18 6 6 18M6 6l12 12"/>',
    'mas'       => '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
    'nuevo'     => '<path d="M4 6h10M4 12h10M4 18h7M18 13v8M14 17h8"/>',
    'compartir' => '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    'respaldar' => '<path d="M7 18a4.5 4.5 0 1 1 .9-8.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8"/><path d="M12 12v8M9 15l3-3 3 3"/>',
    'subir'     => '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
    'descargar' => '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
    'ver'       => '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    'borrar'    => '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    'editar'    => '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
    'historial' => '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    'abrir'     => '<path d="M14 3h7v7M10 14 21 3M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
    'filtro'    => '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    'arriba'    => '<path d="M12 19V5M6 11l6-6 6 6"/>',
    'abajo'     => '<path d="M12 5v14M6 13l6 6 6-6"/>',
    'aviso'     => '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
    'calc'      => '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18.5h.01M12 18.5h.01M16 18.5h.01"/>',
    'chevron'   => '<path d="m6 9 6 6 6-6"/>',
    'refrescar' => '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
    'limpiar'   => '<path d="M3 5h18l-7 8v6l-4 2v-8z"/><path d="m16 16 5 5M21 16l-5 5"/>',
    'ojo_no'    => '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.6 3.5M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    'fijar'     => '<path d="M15 3l6 6-3 1-4 4 1 4-2 2-4-4-5 5M9 11l-4-4 2-2 4 1 4-4z"/>',
    'portapapeles' => '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 2h6v4H9zM8.5 11h7M8.5 15h5"/>',
    'cuadricula'=> '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
    'grafica'   => '<path d="M4 20h16"/><path d="M7 16v-5M12 16V6M17 16v-8"/>',
    'enviar'    => '<path d="M3 11.5 21 4l-7.5 18-2.5-8z"/>',
    'guardar'   => '<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
    'subpartida'=> '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
];

function anIcono(string $nombre): string
{
    return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' . (AN_ICONOS[$nombre] ?? '') . '</svg>';
}

// Regla del esquema para una ruta 'seccion.campo'
function anDef(string $ruta): array
{
    [$sec, $campo] = explode('.', $ruta, 2);
    $def = acrineoCampos()[$sec][$campo] ?? null;
    if ($def === null) throw new LogicException("Campo desconocido: $ruta");
    return $def;
}

function anId(string $ruta): string
{
    return 'an-' . str_replace(['.', '_'], '-', $ruta);
}

// Atributos de validación del navegador a partir de la regla
function anAtributos(array $def): string
{
    $a = '';
    if (!empty($def['requerido'])) $a .= ' required aria-required="true"';
    switch ($def['tipo']) {
        case 'texto': case 'largo': case 'correo': case 'cp':
            if (isset($def['max'])) $a .= ' maxlength="' . (int) $def['max'] . '"';
            break;
        case 'caracter':
            $a .= ' maxlength="1"';
            break;
        case 'entero':
        case 'decimal':
            if (isset($def['min'])) $a .= ' min="' . e($def['min']) . '"';
            if (isset($def['max'])) $a .= ' max="' . e($def['max']) . '"';
            $a .= ' step="' . ($def['tipo'] === 'entero' ? '1' : e('0.' . str_repeat('0', max(0, ($def['decimales'] ?? 2) - 1)) . '1')) . '"';
            $a .= ' inputmode="' . ($def['tipo'] === 'entero' ? 'numeric' : 'decimal') . '"';
            break;
    }
    return $a;
}

// Campo completo: etiqueta, control y lugar para el mensaje de error.
// $op: clase (css extra), etiqueta (otra), ayuda (texto bajo el campo), buscar (catálogo para un campo de texto),
//      rellena / rellenaVacio (ruta que se llena con el dato extra del catálogo elegido)
function anCampo(string $ruta, array $op = []): string
{
    $def = anDef($ruta);
    $id = anId($ruta);
    $etiqueta = $op['etiqueta'] ?? $def['etiqueta'];
    $req = !empty($def['requerido']) ? '<i aria-hidden="true">*</i>' : '';
    $attrs = anAtributos($def);
    $campo = e($ruta);

    switch ($def['tipo']) {
        case 'largo':
            $control = "<textarea id=\"$id\" data-campo=\"$campo\" rows=\"3\"$attrs></textarea>";
            break;
        case 'fecha':
            $ro = !empty($def['calculado']) ? ' readonly tabindex="-1"' : '';
            $control = "<input type=\"date\" id=\"$id\" data-campo=\"$campo\" min=\"1900-01-01\" max=\"2200-12-31\"$attrs$ro>";
            break;
        case 'entero':
        case 'decimal':
            $control = "<input type=\"number\" id=\"$id\" data-campo=\"$campo\"$attrs>";
            break;
        case 'opcion':
            $opciones = '';
            foreach ($def['opciones'] as $o) $opciones .= '<option value="' . e($o) . '">' . e(ACRINEO_ESTATUS[$o] ?? $o) . '</option>';
            $control = "<select id=\"$id\" data-campo=\"$campo\"$attrs>$opciones</select>";
            break;
        case 'catalogo':
            $control = anReferencia($ruta, $def['catalogo'], $etiqueta, $op);
            break;
        default:
            $tipo = $def['tipo'] === 'correo' ? 'email' : 'text';
            $extra = $def['tipo'] === 'correo' ? ' autocomplete="email"' : ($def['tipo'] === 'cp' ? ' inputmode="numeric"' : '');
            $control = "<input type=\"$tipo\" id=\"$id\" data-campo=\"$campo\"$attrs$extra>";
            if (!empty($op['buscar'])) {
                $control = '<div class="an-ref an-ref-texto">' . $control
                    . '<button type="button" class="an-btn-buscar" data-buscar="' . e($op['buscar']) . '" data-destino-texto="' . $campo . '"'
                    . ' aria-label="Buscar ' . e($etiqueta) . '" title="Buscar en el catálogo">' . anIcono('buscar') . '</button></div>';
            }
    }
    $etiquetaFor = $def['tipo'] === 'catalogo' ? $id . '-texto' : $id;
    $ayuda = isset($op['ayuda']) ? '<small class="an-ayuda">' . e($op['ayuda']) . '</small>' : '';
    return '<div class="an-campo ' . e($op['clase'] ?? '') . '" data-error-de="' . $campo . '">'
        . "<label for=\"$etiquetaFor\">" . e($etiqueta) . ":$req</label>$control$ayuda"
        . '<small class="an-error" hidden></small></div>';
}

// Campo de catálogo: id oculto + nombre visible + botones de búsqueda y quitar
function anReferencia(string $ruta, string $catalogo, string $etiqueta, array $op): string
{
    $id = anId($ruta);
    $campo = e($ruta);
    $rellena = isset($op['rellena']) ? ' data-rellena="' . e($op['rellena']) . '"' : '';
    $rellena .= isset($op['rellenaVacio']) ? ' data-rellena-vacio="' . e($op['rellenaVacio']) . '"' : '';
    return '<div class="an-ref">'
        . "<input type=\"hidden\" id=\"$id\" data-campo=\"$campo\" data-tipo=\"catalogo\">"
        . "<input type=\"text\" id=\"$id-texto\" data-nombre-de=\"$campo\" readonly placeholder=\"Sin seleccionar\" tabindex=\"-1\">"
        . '<button type="button" class="an-btn-buscar" data-buscar="' . e($catalogo) . "\" data-destino=\"$campo\"$rellena"
        . ' aria-label="Buscar ' . e($etiqueta) . '" title="Buscar en el catálogo">' . anIcono('buscar') . '</button>'
        . "<button type=\"button\" class=\"an-btn-quitar\" data-quitar=\"$campo\" aria-label=\"Quitar " . e($etiqueta) . '" title="Quitar">&times;</button>'
        . '</div>';
}

// Celda numérica sin etiqueta propia (tabla de C.H.)
function anCelda(string $ruta, array $def, string $etiqueta, string $sufijo = '%'): string
{
    $id = 'an-' . str_replace(['.', '_'], '-', $ruta);
    return '<div class="an-celda" data-error-de="' . e($ruta) . '"><input type="number" id="' . $id . '" data-campo="' . e($ruta) . '"'
        . anAtributos($def) . ' aria-label="' . e($etiqueta) . '"><span>' . e($sufijo) . '</span></div>';
}
