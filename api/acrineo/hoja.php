<?php
// ACRINEO · API de la hoja del presupuesto (partidas y conceptos).
//   GET  ?id=P                                  presupuesto (totales) y partidas en árbol
//   GET  ?id=P&partida=X                         además, los conceptos de la partida
//   GET  ?id=P&recurso=conceptos&q=&pagina=      catálogo de conceptos del presupuesto
//   GET  ?id=P&recurso=codigo&padre=X            código sugerido para una partida nueva
//   POST ?id=P  { accion, … }                    cambios (regresa el estado de la hoja):
//        partida_crear {padre_id, codigo, descripcion} · partida_guardar {partida_id, codigo, descripcion}
//        partida_eliminar {partida_id} · partida_mover {partida_id, direccion: arriba|abajo|izquierda|derecha}
//        renglones_guardar {partida_id, filas, quitar} · copiar {partida_id, conceptos: [{concepto_id, cantidad}]}
//        concepto_eliminar {concepto_id} · sobrecosto {sobrecosto_pct} · matriz_guardar {concepto_id, filas}
//   GET  ?id=P&recurso=matriz&concepto=C[&actualizar=1]   matriz de P.U. del concepto (con costos del catálogo)
//   GET  ?id=P&recurso=insumos&q=                         catálogo de insumos del sistema, para la matriz
define('ACRI_API', true);
require __DIR__ . '/../../includes/sesion.php';
require __DIR__ . '/../../includes/respuesta.php';
require_once __DIR__ . '/../../includes/bd.php';
require __DIR__ . '/../../includes/acrineo/permisos.php';
require __DIR__ . '/../../includes/acrineo/hoja.php';

acrineoExigir('presupuestos.ver');
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($metodo !== 'GET') exigirCsrf();
$usuario = (string) $usuarioSesion;
$puedeEditar = acrineoPuede('presupuestos.editar');
session_write_close();

$id = max(0, (int) ($_GET['id'] ?? 0));

try {
    if (!acrineoHojaDisponible()) error('Falta aplicar la migración 025_acrineo_hoja_presupuesto.sql.', 503);
    if (!$id) error('Falta el presupuesto.', 400);
    $ctx = acrineoHojaContexto($id);

    if ($metodo === 'GET') {
        switch ($_GET['recurso'] ?? '') {
            case 'conceptos':
                responder(['ok' => true] + acrineoConceptosCatalogo($ctx, (string) ($_GET['q'] ?? ''), (int) ($_GET['pagina'] ?? 1), (int) ($_GET['por_pagina'] ?? 100)));
            case 'matriz':
                responder(['ok' => true] + acrineoMatriz($ctx, (int) ($_GET['concepto'] ?? 0), ($_GET['actualizar'] ?? '') === '1'));
            case 'insumos':
                responder(['ok' => true] + acrineoInsumosBuscar((string) ($_GET['q'] ?? ''), (int) ($_GET['pagina'] ?? 1)));
            case 'codigo':
                $padre = (int) ($_GET['padre'] ?? 0);
                responder(['ok' => true, 'codigo' => acrineoCodigoSugerido($ctx, $padre ?: null)]);
            case '':
                responder(['ok' => true] + acrineoHojaEstado($id, (int) ($_GET['partida'] ?? 0) ?: null));
        }
        error('Recurso no válido.', 404);
    }
    if ($metodo !== 'POST') error('Método no permitido.', 405);
    if (!$puedeEditar) error('No tienes permiso para modificar presupuestos (ACRINEO_PRESUPUESTOS_EDITAR).', 403);

    $in = entrada();
    $partida = (int) ($in['partida_id'] ?? 0);
    $extra = [];
    switch ($in['accion'] ?? '') {
        case 'partida_crear':
            $padre = (int) ($in['padre_id'] ?? 0) ?: null;
            $partida = acrineoPartidaCrear($ctx, $padre, $in, $usuario);
            $extra['partida_id'] = $partida;
            break;
        case 'partida_guardar':
            acrineoPartidaGuardar($ctx, $partida, $in, $usuario);
            break;
        case 'partida_eliminar':
            acrineoPartidaEliminar($ctx, $partida, $usuario);
            $partida = 0;
            break;
        case 'partida_mover':
            acrineoPartidaMover($ctx, $partida, (string) ($in['direccion'] ?? ''));
            break;
        case 'renglones_guardar':
            acrineoRenglonesGuardar($ctx, $partida, is_array($in['filas'] ?? null) ? $in['filas'] : [], is_array($in['quitar'] ?? null) ? $in['quitar'] : [], $usuario);
            break;
        case 'copiar':
            $extra['copiados'] = acrineoCopiarConceptos($ctx, $partida, is_array($in['conceptos'] ?? null) ? $in['conceptos'] : [], $usuario);
            break;
        case 'concepto_eliminar':
            acrineoConceptoEliminar($ctx, (int) ($in['concepto_id'] ?? 0), $usuario);
            break;
        case 'matriz_guardar':
            $extra['matriz'] = acrineoMatrizGuardar($ctx, (int) ($in['concepto_id'] ?? 0), is_array($in['filas'] ?? null) ? $in['filas'] : [], $usuario);
            break;
        case 'sobrecosto':
            acrineoSobrecostoGuardar($ctx, $in['sobrecosto_pct'] ?? null, $usuario);
            break;
        default:
            error('Acción no válida.', 400);
    }
    responder(['ok' => true] + $extra + acrineoHojaEstado($id, $partida ?: null));
} catch (AcrineoError $e) {
    responder(['ok' => false, 'error' => $e->getMessage(), 'errores' => (object) $e->errores], $e->http);
} catch (Throwable $e) {
    error_log('ACRINEO api/hoja: ' . $e->getMessage());
    error('No se pudo completar la operación. Intenta de nuevo; si sigue fallando avisa al administrador.', 500);
}
