<?php
// Estimaciones de la obra: catálogo del contrato, anticipo y estimaciones de avance (se abre desde la obra)
require __DIR__ . '/includes/sesion.php';
exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'CERRAR_OBRA', 'AUTORIZAR_ESTIMACIONES', 'ADMIN_USER');
$obraId = max(0, (int) ($_GET['id'] ?? 0));
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="acri-token" content="<?= e($_SESSION['csrf']) ?>">
    <title>Estimaciones de obra · AcriGlass</title>
    <link rel="icon" href="<?= e(imagenSistema('favicon', sistemaConfig())) ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@700;800&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= recurso('css/parametros-costos.css') ?>">
    <style>
        .tarjetas { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
        .tarjeta { padding: 10px 12px; border: 1px solid var(--borde); border-radius: 8px; background: var(--fondo-2); }
        .tarjeta span { display: block; font-size: 11.5px; color: var(--texto-suave); font-weight: 700; }
        .tarjeta b { font-size: 16px; color: #fff; }
        .tarjeta.fuerte b { color: var(--dorado); }
        .estatus { display: inline-block; padding: 1px 8px; border-radius: 10px; border: 1px solid var(--borde-2); font-size: 11.5px; font-weight: 800; }
        .estatus.autorizada, .estatus.facturada { border-color: #3b82f6; color: #bfdbfe; }
        .estatus.cobrada { border-color: #22c55e; color: #bbf7d0; }
        .estatus.borrador { border-color: #fbbf24; color: #fde68a; }
        .estatus.cancelada { border-color: #f87171; color: #fecaca; }
        .barra { display: inline-block; width: 70px; height: 8px; border-radius: 4px; background: var(--borde); vertical-align: middle; overflow: hidden; }
        .barra i { display: block; height: 100%; background: #22c55e; }
        .tabla.alta { max-height: 380px; }
        td input[type=number] { width: 95px; padding: 3px 6px; text-align: right; }
        td .btn { margin: 1px 2px; }
        .resumen-est { margin-top: 10px; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px 14px; }
        .resumen-est span { color: var(--texto-suave); } .resumen-est b { color: #fff; }
    </style>
</head>
<body data-obra="<?= $obraId ?>">

<header class="cabecera">
    <h1><span class="m-acri">ACRI</span> <span class="m-glass">GLASS</span> <span class="h-texto">Estimaciones de obra</span></h1>
    <p id="titulo">Cargando…</p>
</header>
<p class="aviso" id="aviso" hidden></p>

<section class="bloque" id="bloqueResumen" hidden>
    <h2>Situación del contrato <small class="ayuda">(importes sin IVA)</small></h2>
    <div class="tarjetas" id="tarjetas"></div>
</section>

<section class="bloque" id="bloqueCatalogo" hidden>
    <h2>Catálogo de conceptos del contrato</h2>
    <p class="ayuda" id="ayudaCatalogo"></p>
    <div class="fila" id="filaGenerar" hidden><button class="btn azul" id="generar">Generar catálogo del contrato</button></div>
    <div class="tabla alta"><table><thead><tr><th>Clave</th><th>Partida</th><th>Concepto</th><th>Unidad</th><th class="num">Contratado</th><th class="num">P.U.</th>
        <th class="num">Importe</th><th class="num">Estimado</th><th>Avance</th><th class="num">Por estimar</th></tr></thead><tbody id="catalogo"></tbody></table></div>
</section>

<section class="bloque" id="bloqueEstimaciones" hidden>
    <h2>Anticipo y estimaciones</h2>
    <p class="ayuda">Amortización = % de anticipo × importe (sin pasar de lo que falta) · Subtotal = importe − amortización · IVA sobre el subtotal ·
        Fondo de garantía y retención sobre el importe · Neto = subtotal + IVA − fondo − retención. La autoriza un usuario distinto al que la capturó.</p>
    <div class="fila">
        <button class="btn azul" id="nuevaEstimacion">＋ Nueva estimación</button>
        <button class="btn" id="nuevoAnticipo">＋ Anticipo</button>
    </div>
    <div class="tabla"><table><thead><tr><th>Documento</th><th>Fecha / periodo</th><th class="num">Importe</th><th class="num">Amortización</th><th class="num">IVA</th>
        <th class="num">Fondo</th><th class="num">Retención</th><th class="num">Neto a cobrar</th><th>Estatus</th><th>Factura</th><th></th></tr></thead>
        <tbody id="estimaciones"></tbody></table></div>
</section>

<section class="bloque" id="editor" hidden>
    <h2 id="edTitulo">Nueva estimación</h2>
    <div class="fila">
        <label class="campo"><span>Fecha</span><input type="date" id="edFecha"></label>
        <label class="campo" data-solo="estimacion"><span>Periodo del</span><input type="date" id="edIni"></label>
        <label class="campo" data-solo="estimacion"><span>al</span><input type="date" id="edFin"></label>
        <label class="campo" data-solo="anticipo"><span>Importe del anticipo (sin IVA)</span><input type="number" step="0.01" min="0" id="edImporte"></label>
    </div>
    <div class="tabla alta" data-solo="estimacion"><table><thead><tr><th>Clave</th><th>Concepto</th><th>Unidad</th><th class="num">P.U.</th><th class="num">Por estimar</th>
        <th class="num">Esta estimación</th><th class="num">Importe</th></tr></thead><tbody id="edConceptos"></tbody></table></div>
    <label class="campo ancho" style="margin-top:8px"><span>Notas</span><textarea id="edNotas" rows="2"></textarea></label>
    <div class="resumen-est" id="edResumen"></div>
    <div class="fila" style="margin-top:10px">
        <button class="btn azul" id="edGuardar">💾 Guardar en borrador</button>
        <button class="btn" id="edCerrar">Cerrar</button>
    </div>
</section>

<script src="<?= recurso('js/estimaciones-obra.js') ?>"></script>
</body>
</html>
