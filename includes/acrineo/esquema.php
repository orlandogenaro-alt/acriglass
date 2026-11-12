<?php
// ACRINEO · Esquema del «Detalle del presupuesto».
// Fuente única de los campos: etiqueta, tipo, longitud, rango y valor por defecto. De aquí salen la validación
// del servidor, los valores iniciales, las etiquetas del historial y las reglas que usa la ventana (js/acrineo/).
// Solo funciones puras: no toca la base de datos (se prueba en pruebas/acrineo.php).

// Error con código HTTP y errores por campo ('presupuesto.nombre' => 'mensaje')
class AcrineoError extends RuntimeException
{
    public int $http;
    public array $errores;

    public function __construct(string $mensaje, int $http = 400, array $errores = [])
    {
        parent::__construct($mensaje);
        $this->http = $http;
        $this->errores = $errores;
    }
}

const ACRINEO_ESTATUS = [
    'BORRADOR'   => 'Borrador',
    'EN_PROCESO' => 'En proceso',
    'ENVIADO'    => 'Enviado',
    'APROBADO'   => 'Aprobado',
    'RECHAZADO'  => 'Rechazado',
    'CANCELADO'  => 'Cancelado',
];

// Pestaña C.H.: elemento => [etiqueta, espera %, reserva %] por defecto
const ACRINEO_CH_ELEMENTOS = [
    'depreciacion'      => ['Depreciación', 100, 15],
    'inversion'         => ['Inversión', 100, 100],
    'seguros'           => ['Seguros', 100, 100],
    'mantenimiento'     => ['Mantenimiento', 0, 15],
    'combustible'       => ['Combustible', 5, 0],
    'lubricante'        => ['Lubricante', 5, 0],
    'llantas'           => ['Llantas', 15, 0],
    'piezas_especiales' => ['Piezas especiales', 0, 0],
    'operacion'         => ['Operación', 100, 100],
    'otras_fuentes'     => ['Otras fuentes de energía', 5, 0],
];

// Pestaña C.H.: factores e indicadores. clave => [grupo, etiqueta, tipo (num|texto), defecto]
const ACRINEO_CH_FACTORES = [
    'lubricante_potencia_0'     => ['lubricante', 'Para potencia 0', 'num', 0.003],
    'lubricante_potencia_mayor' => ['lubricante', 'Para potencia mayor que 0', 'num', 0.0033],
    'combustible_gasolina'      => ['combustible', 'Gasolina', 'num', 0.2271],
    'combustible_diesel'        => ['combustible', 'Diesel', 'num', 0.1514],
    'combustible_otros'         => ['combustible', 'Otros', 'num', 0.0],
    'indicador_referencia'      => ['indicador', 'Referencia', 'texto', 'TIIE'],
    'indicador_seguros'         => ['indicador', 'Específico de seguros', 'texto', 'TIIE'],
];
const ACRINEO_CH_GRUPOS = ['lubricante' => 'Factores de lubricante', 'combustible' => 'Factores de combustible', 'indicador' => 'Indicadores de'];

// Pestaña OTROS: monedas por defecto. número => [descripción, remate, tipo de cambio]
const ACRINEO_MONEDAS = [1 => ['PESOS', 'M.N.', 1], 2 => ['DOLARES', 'USD', 1]];

// Tipos de licitación (catálogo del botón de búsqueda)
const ACRINEO_TIPOS_LICITACION = [
    'LICITACION PUBLICA NACIONAL',
    'LICITACION PUBLICA INTERNACIONAL',
    'INVITACION A CUANDO MENOS TRES PERSONAS',
    'ADJUDICACION DIRECTA',
    'CONCURSO PRIVADO',
];

// Campos por sección (cada sección es una tabla). Tipos:
//   texto · largo (varias líneas) · correo · cp · fecha · entero · decimal · catalogo (id de otro catálogo) · opcion · caracter
// calculado = lo pone el servidor, no se acepta del navegador
function acrineoCampos(): array
{
    return [
        'presupuesto' => [
            'nombre'        => ['etiqueta' => 'Nombre', 'tipo' => 'texto', 'max' => 150, 'requerido' => true],
            'descripcion'   => ['etiqueta' => 'Descripción', 'tipo' => 'largo', 'max' => 4000, 'requerido' => true],
            'direccion'     => ['etiqueta' => 'Dirección', 'tipo' => 'texto', 'max' => 250],
            'colonia'       => ['etiqueta' => 'Colonia', 'tipo' => 'texto', 'max' => 120],
            'codigo_postal' => ['etiqueta' => 'Código Postal', 'tipo' => 'cp', 'max' => 10],
            'ciudad_id'     => ['etiqueta' => 'Ciudad', 'tipo' => 'catalogo', 'catalogo' => 'ciudades'],
            'estado'        => ['etiqueta' => 'Estado', 'tipo' => 'texto', 'max' => 60],
            'telefono'      => ['etiqueta' => 'Teléfono', 'tipo' => 'texto', 'max' => 35],
            'correo'        => ['etiqueta' => 'Correo', 'tipo' => 'correo', 'max' => 150],
            'observaciones' => ['etiqueta' => 'Observaciones', 'tipo' => 'largo', 'max' => 4000],
            'tipo'          => ['etiqueta' => 'Tipo', 'tipo' => 'texto', 'max' => 40, 'requerido' => true, 'defecto' => '01_Propios'],
            'agrupador'     => ['etiqueta' => 'Agrupador', 'tipo' => 'texto', 'max' => 60],
            'estatus'       => ['etiqueta' => 'Estatus', 'tipo' => 'opcion', 'opciones' => array_keys(ACRINEO_ESTATUS), 'requerido' => true, 'defecto' => 'BORRADOR'],
        ],
        'generales' => [
            'responsable_id'       => ['etiqueta' => 'Responsable', 'tipo' => 'catalogo', 'catalogo' => 'usuarios'],
            'cargo_responsable'    => ['etiqueta' => 'Cargo resp.', 'tipo' => 'texto', 'max' => 100],
            'empresa_id'           => ['etiqueta' => 'Empresa', 'tipo' => 'catalogo', 'catalogo' => 'empresas'],
            'cliente_id'           => ['etiqueta' => 'Cliente', 'tipo' => 'catalogo', 'catalogo' => 'clientes'],
            'area_cliente'         => ['etiqueta' => 'Área Cliente', 'tipo' => 'texto', 'max' => 100],
            'departamento_cliente' => ['etiqueta' => 'Depto. Cliente', 'tipo' => 'texto', 'max' => 100],
            'contacto_cliente'     => ['etiqueta' => 'Contacto cliente', 'tipo' => 'texto', 'max' => 150],
            'vendedor_id'          => ['etiqueta' => 'Vendedor', 'tipo' => 'catalogo', 'catalogo' => 'vendedores'],
            'region_id'            => ['etiqueta' => 'Región', 'tipo' => 'catalogo', 'catalogo' => 'regiones'],
        ],
        'licitacion' => [
            'fecha_licitacion'    => ['etiqueta' => 'Fecha de Licitación', 'tipo' => 'fecha', 'defecto' => 'hoy'],
            'numero_licitacion'   => ['etiqueta' => 'Número de licitación', 'tipo' => 'texto', 'max' => 60],
            'lugar_celebracion'   => ['etiqueta' => 'Lugar de celebración', 'tipo' => 'texto', 'max' => 200],
            'numero_convocatoria' => ['etiqueta' => 'Número de convocatoria', 'tipo' => 'texto', 'max' => 60],
            'tipo_licitacion'     => ['etiqueta' => 'Tipo de licitación', 'tipo' => 'texto', 'max' => 60],
            'fecha_publicacion'   => ['etiqueta' => 'Fecha de publicación', 'tipo' => 'fecha', 'defecto' => 'hoy'],
            'fecha_inicio'        => ['etiqueta' => 'Fecha de inicio', 'tipo' => 'fecha', 'defecto' => 'hoy'],
            'dias'                => ['etiqueta' => 'Días', 'tipo' => 'entero', 'min' => 1, 'max' => 36500, 'defecto' => 1],
            'fecha_terminacion'   => ['etiqueta' => 'Fecha de terminación', 'tipo' => 'fecha', 'calculado' => true],
        ],
        'calculo' => [
            'iva'                  => ['etiqueta' => '% IVA', 'tipo' => 'decimal', 'min' => 0, 'max' => 100, 'decimales' => 2, 'requerido' => true, 'defecto' => 16],
            'decimales_costos'     => ['etiqueta' => 'Decimales de costos unitarios e importes', 'tipo' => 'entero', 'min' => 0, 'max' => 6, 'requerido' => true, 'defecto' => 2],
            'decimales_cantidades' => ['etiqueta' => 'Decimales de cantidad en presupuesto', 'tipo' => 'entero', 'min' => 0, 'max' => 6, 'requerido' => true, 'defecto' => 4],
            'decimales_explosion'  => ['etiqueta' => 'Decimales de la explosión de insumos', 'tipo' => 'entero', 'min' => 0, 'max' => 8, 'requerido' => true, 'defecto' => 8],
        ],
        'configuracion' => [
            'separador_partidas'     => ['etiqueta' => 'Caracter separador de partidas', 'tipo' => 'caracter', 'requerido' => true, 'defecto' => '.'],
            'contenido_plantilla_id' => ['etiqueta' => 'Contenido', 'tipo' => 'catalogo', 'catalogo' => 'plantillas'],
        ],
    ];
}

// Reglas de los porcentajes de C.H. y de las monedas (mismo formato que acrineoCampos)
const ACRINEO_CAMPO_PCT_CH = ['tipo' => 'decimal', 'min' => 0, 'max' => 1000, 'decimales' => 4, 'requerido' => true];
const ACRINEO_CAMPO_FACTOR = ['tipo' => 'decimal', 'min' => 0, 'max' => 999999, 'decimales' => 6, 'requerido' => true];
const ACRINEO_CAMPO_INDICADOR = ['tipo' => 'texto', 'max' => 30, 'requerido' => true];
const ACRINEO_CAMPOS_MONEDA = [
    'descripcion' => ['etiqueta' => 'Descripción', 'tipo' => 'texto', 'max' => 40, 'requerido' => true],
    'remate'      => ['etiqueta' => 'Remate', 'tipo' => 'texto', 'max' => 10, 'requerido' => true],
    'tipo_cambio' => ['etiqueta' => 'Tipo de cambio', 'tipo' => 'decimal', 'min' => 0.000001, 'max' => 999999, 'decimales' => 6, 'requerido' => true],
];

// Fecha de terminación: el día de inicio cuenta como el primero (1 día = termina el mismo día)
function acrineoFechaTerminacion(?string $inicio, $dias): ?string
{
    if ($inicio === null || !acrineoFechaValida($inicio) || !is_int($dias) || $dias < 1) return null;
    return (new DateTimeImmutable($inicio))->modify('+' . ($dias - 1) . ' days')->format('Y-m-d');
}

function acrineoFechaValida(string $f): bool
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $f, $m)) return false;
    return checkdate((int) $m[2], (int) $m[3], (int) $m[1]) && (int) $m[1] >= 1900 && (int) $m[1] <= 2200;
}

// Valores de un presupuesto nuevo (mismo formato que acrineoValidar devuelve y que acrineoObtener entrega)
function acrineoDefectos(?string $hoy = null): array
{
    $hoy = $hoy ?? date('Y-m-d');
    $d = [];
    foreach (acrineoCampos() as $sec => $campos) {
        foreach ($campos as $campo => $def) {
            $v = $def['defecto'] ?? null;
            $d[$sec][$campo] = $v === 'hoy' ? $hoy : $v;
        }
    }
    $d['licitacion']['fecha_terminacion'] = acrineoFechaTerminacion($d['licitacion']['fecha_inicio'], $d['licitacion']['dias']);
    foreach (ACRINEO_CH_ELEMENTOS as $k => [, $espera, $reserva]) $d['ch']['parametros'][$k] = ['espera' => (float) $espera, 'reserva' => (float) $reserva];
    foreach (ACRINEO_CH_FACTORES as $k => [, , $tipo, $v]) $d['ch']['factores'][$k] = $tipo === 'num' ? (float) $v : $v;
    foreach (ACRINEO_MONEDAS as $n => [$desc, $remate, $tc]) $d['monedas'][$n] = ['descripcion' => $desc, 'remate' => $remate, 'tipo_cambio' => (float) $tc];
    return $d;
}

// Valida y normaliza un valor según su regla. Devuelve [valor, error|null]; vacío = null
function acrineoValor($v, array $def): array
{
    if (is_array($v) || is_object($v)) return [null, 'Valor no válido.'];
    if (is_string($v)) $v = trim($v);
    if (is_bool($v)) return [null, 'Valor no válido.'];
    if ($v === null || $v === '') return [null, !empty($def['requerido']) ? 'Es obligatorio.' : null];

    switch ($def['tipo']) {
        case 'texto':
        case 'largo':
            $v = (string) $v;
            if (!mb_check_encoding($v, 'UTF-8')) return [null, 'Texto no válido.'];
            // Sin caracteres de control (salvo saltos de línea en los de varias líneas)
            $v = preg_replace($def['tipo'] === 'largo' ? '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u' : '/[\x00-\x1F\x7F]/u', '', $v);
            if (isset($def['max']) && mb_strlen($v) > $def['max']) return [null, "Máximo {$def['max']} caracteres."];
            return [$v, null];
        case 'correo':
            $v = (string) $v;
            if (mb_strlen($v) > ($def['max'] ?? 150) || !filter_var($v, FILTER_VALIDATE_EMAIL)) return [null, 'Correo no válido.'];
            return [$v, null];
        case 'cp':
            $v = (string) $v;
            if (!preg_match('/^[0-9A-Za-z -]{3,10}$/', $v)) return [null, 'Código postal no válido.'];
            return [$v, null];
        case 'caracter':
            $v = (string) $v;
            if (mb_strlen($v) !== 1 || preg_match('/[\x00-\x20\x7F]/', $v)) return [null, 'Debe ser un solo caracter visible.'];
            return [$v, null];
        case 'fecha':
            $v = (string) $v;
            if (!acrineoFechaValida($v)) return [null, 'Fecha no válida (aaaa-mm-dd).'];
            return [$v, null];
        case 'opcion':
            return in_array($v, $def['opciones'], true) ? [$v, null] : [null, 'Opción no válida.'];
        case 'catalogo':
        case 'entero':
            if (is_float($v) && floor($v) == $v) $v = (int) $v;
            if (!is_int($v) && !(is_string($v) && preg_match('/^-?\d{1,10}$/', $v))) return [null, 'Debe ser un número entero.'];
            $v = (int) $v;
            if ($def['tipo'] === 'catalogo') return $v > 0 ? [$v, null] : [null, 'Selección no válida.'];
            return acrineoRango($v, $def);
        case 'decimal':
            if (is_string($v)) $v = str_replace(',', '', $v);
            if (!is_numeric($v) || !is_finite((float) $v)) return [null, 'Debe ser un número.'];
            $v = round((float) $v, $def['decimales'] ?? 6);
            return acrineoRango($v, $def);
    }
    return [null, 'Tipo de campo desconocido.'];
}

function acrineoRango($v, array $def): array
{
    $min = $def['min'] ?? null;
    $max = $def['max'] ?? null;
    if ($min !== null && $max !== null && ($v < $min || $v > $max)) return [null, "Debe estar entre {$min} y {$max}."];
    if ($min !== null && $v < $min) return [null, "Debe ser al menos {$min}."];
    if ($max !== null && $v > $max) return [null, "Debe ser como máximo {$max}."];
    return [$v, null];
}

// Valida todo el detalle que manda la ventana. Lo que no viene toma su valor por defecto (alta) o el actual (cambio).
// Devuelve los datos normalizados; si hay errores lanza AcrineoError 422 con cada campo.
function acrineoValidar(array $entrada, ?array $base = null): array
{
    $base = $base ?? acrineoDefectos();
    $datos = [];
    $errores = [];

    foreach (acrineoCampos() as $sec => $campos) {
        $in = is_array($entrada[$sec] ?? null) ? $entrada[$sec] : [];
        foreach ($campos as $campo => $def) {
            if (!empty($def['calculado'])) continue;
            $v = array_key_exists($campo, $in) ? $in[$campo] : ($base[$sec][$campo] ?? null);
            [$valor, $err] = acrineoValor($v, $def);
            if ($err) $errores["$sec.$campo"] = $err;
            $datos[$sec][$campo] = $valor;
        }
    }
    $datos['licitacion']['fecha_terminacion'] = acrineoFechaTerminacion($datos['licitacion']['fecha_inicio'] ?? null, $datos['licitacion']['dias'] ?? null);

    $ch = is_array($entrada['ch'] ?? null) ? $entrada['ch'] : [];
    foreach (ACRINEO_CH_ELEMENTOS as $k => $_) {
        foreach (['espera', 'reserva'] as $col) {
            $v = $ch['parametros'][$k][$col] ?? $base['ch']['parametros'][$k][$col] ?? null;
            [$valor, $err] = acrineoValor($v, ACRINEO_CAMPO_PCT_CH);
            if ($err) $errores["ch.parametros.$k.$col"] = $err;
            $datos['ch']['parametros'][$k][$col] = $valor;
        }
    }
    foreach (ACRINEO_CH_FACTORES as $k => [, , $tipo]) {
        $v = array_key_exists($k, $ch['factores'] ?? []) ? $ch['factores'][$k] : ($base['ch']['factores'][$k] ?? null);
        [$valor, $err] = acrineoValor($v, $tipo === 'num' ? ACRINEO_CAMPO_FACTOR : ACRINEO_CAMPO_INDICADOR);
        if ($err) $errores["ch.factores.$k"] = $err;
        $datos['ch']['factores'][$k] = $valor;
    }

    $monedas = is_array($entrada['monedas'] ?? null) ? $entrada['monedas'] : [];
    foreach (ACRINEO_MONEDAS as $n => $_) {
        foreach (ACRINEO_CAMPOS_MONEDA as $campo => $def) {
            $in = $monedas[$n] ?? $monedas[(string) $n] ?? [];
            $v = is_array($in) && array_key_exists($campo, $in) ? $in[$campo] : ($base['monedas'][$n][$campo] ?? null);
            [$valor, $err] = acrineoValor($v, $def);
            if ($err) $errores["monedas.$n.$campo"] = $err;
            $datos['monedas'][$n][$campo] = $valor;
        }
    }

    if ($errores) throw new AcrineoError('Revisa los campos marcados.', 422, $errores);
    return $datos;
}

// Presupuesto → lista plana [ruta => [etiqueta, valor como se ve]] para comparar y registrar el historial.
// Los campos de catálogo se muestran con su nombre (llave «…_nombre» que entrega acrineoObtener).
function acrineoAplanar(array $p): array
{
    $titulos = ['presupuesto' => '', 'generales' => 'Generales · ', 'licitacion' => 'Licitación · ', 'calculo' => 'Cálculo · ', 'configuracion' => 'Otros · '];
    $plano = [];
    foreach (acrineoCampos() as $sec => $campos) {
        foreach ($campos as $campo => $def) {
            $v = $p[$sec][$campo] ?? null;
            if ($def['tipo'] === 'catalogo') {
                $nombre = $p[$sec][preg_replace('/_id$/', '_nombre', $campo)] ?? null;
                $v = $v === null ? null : ($nombre ?? "#$v");
            } elseif ($def['tipo'] === 'opcion' && $sec === 'presupuesto' && $campo === 'estatus') {
                $v = ACRINEO_ESTATUS[$v] ?? $v;
            }
            $plano["$sec.$campo"] = [$titulos[$sec] . $def['etiqueta'], acrineoTextoValor($v)];
        }
    }
    foreach (ACRINEO_CH_ELEMENTOS as $k => [$etiqueta]) {
        $plano["ch.parametros.$k.espera"] = ["C.H. · $etiqueta · Espera %", acrineoTextoValor($p['ch']['parametros'][$k]['espera'] ?? null)];
        $plano["ch.parametros.$k.reserva"] = ["C.H. · $etiqueta · Reserva %", acrineoTextoValor($p['ch']['parametros'][$k]['reserva'] ?? null)];
    }
    foreach (ACRINEO_CH_FACTORES as $k => [$grupo, $etiqueta]) {
        $plano["ch.factores.$k"] = ['C.H. · ' . ACRINEO_CH_GRUPOS[$grupo] . ' · ' . $etiqueta, acrineoTextoValor($p['ch']['factores'][$k] ?? null)];
    }
    foreach (ACRINEO_MONEDAS as $n => $_) {
        foreach (ACRINEO_CAMPOS_MONEDA as $campo => $def) {
            $plano["monedas.$n.$campo"] = ["Otros · Moneda $n · {$def['etiqueta']}", acrineoTextoValor($p['monedas'][$n][$campo] ?? null)];
        }
    }
    return $plano;
}

function acrineoTextoValor($v): ?string
{
    if ($v === null || $v === '') return null;
    if (is_float($v) || (is_string($v) && is_numeric($v) && strpos($v, '.') !== false)) {
        $s = rtrim(rtrim(number_format((float) $v, 6, '.', ''), '0'), '.');
        return $s === '-0' ? '0' : $s;
    }
    return (string) $v;
}

// Cambios entre dos versiones: [[ruta, etiqueta, antes, después], …]
function acrineoDiferencias(array $antes, array $despues): array
{
    $a = acrineoAplanar($antes);
    $cambios = [];
    foreach (acrineoAplanar($despues) as $ruta => [$etiqueta, $nuevo]) {
        $viejo = $a[$ruta][1] ?? null;
        if ($viejo !== $nuevo) $cambios[] = [$ruta, $etiqueta, $viejo, $nuevo];
    }
    return $cambios;
}

// Reglas que necesita la ventana (sin nada interno del servidor)
function acrineoEsquemaCliente(): array
{
    return [
        'campos'          => acrineoCampos(),
        'ch_elementos'    => ACRINEO_CH_ELEMENTOS,
        'ch_factores'     => ACRINEO_CH_FACTORES,
        'ch_grupos'       => ACRINEO_CH_GRUPOS,
        'pct_ch'          => ACRINEO_CAMPO_PCT_CH,
        'factor'          => ACRINEO_CAMPO_FACTOR,
        'indicador'       => ACRINEO_CAMPO_INDICADOR,
        'monedas'         => ACRINEO_CAMPOS_MONEDA,
        'estatus'         => ACRINEO_ESTATUS,
        'defectos'        => acrineoDefectos(),
    ];
}
