<?php
// Catalogos › Parámetros de costos: tipo de cambio del dólar y FASAR (Factor de Salario Real) de la mano de obra
require __DIR__ . '/includes/sesion.php';
exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_SUGERIDO_OBRA', 'MODIFICAR_SUGERIDO_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA',
    'CATALOGO_INSUMOS', 'PRECIOS_INSUMOS', 'ADMIN_USER');
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="acri-token" content="<?= e($_SESSION['csrf']) ?>">
    <title>Parámetros de costos · AcriGlass</title>
    <link rel="icon" href="<?= e(imagenSistema('favicon', sistemaConfig())) ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@700;800&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= recurso('css/parametros-costos.css') ?>">
</head>
<body>

<header class="cabecera">
    <h1><span class="m-acri">ACRI</span> <span class="m-glass">GLASS</span> <span class="h-texto">Parámetros de costos</span></h1>
    <p>Datos que usa el cálculo de costos de los insumos. Ningún valor viene cargado: los captura Acristala.</p>
</header>
<p class="aviso" id="aviso" hidden></p>

<section class="bloque" id="bloqueTc">
    <h2>Tipo de cambio del dólar</h2>
    <p class="ayuda">Los precios de insumos en USD se convierten a pesos con el tipo de cambio vigente (el de fecha más reciente). Sin tipo de cambio, esos insumos quedan «Pendiente».</p>
    <div class="fila">
        <div class="dato"><span>Vigente</span><b id="tcVigente">—</b></div>
        <label class="campo"><span>Fecha</span><input type="date" id="tcFecha"></label>
        <label class="campo"><span>Pesos por dólar</span><input type="number" step="any" min="0" id="tcValor"></label>
        <button class="btn azul" id="tcGuardar">💾 Guardar</button>
        <button class="btn" id="tcBanxico" title="Dólar FIX del último día publicado (serie SF43718)">🏦 Traer de Banxico</button>
    </div>
    <p class="ayuda" id="tcBanxicoNota" hidden>Para traerlo de Banxico, captura el token del servicio en Administrador › APIs y servicios.</p>
    <div class="tabla"><table><thead><tr><th>Fecha</th><th class="num">Tipo de cambio</th><th>Fuente</th><th>Capturó</th></tr></thead><tbody id="tcHistorial"></tbody></table></div>
</section>

<section class="bloque" id="bloqueFasar">
    <h2>FASAR · Factor de Salario Real</h2>
    <p class="ayuda">
        <b>Fsr = Ps × (Tp / Tl) + Tp / Tl</b>, donde Tp son los días pagados al año, Tl los días laborados y Ps las obligaciones obrero-patronales
        (IMSS, INFONAVIT, SAR, impuesto sobre nómina…) como fracción del salario. La mano de obra ligada a un FASAR toma su FSR al guardarlo.
    </p>
    <div class="fila">
        <button class="btn azul" id="fsNuevo">＋ Nuevo FASAR</button>
    </div>
    <div class="tabla"><table><thead><tr><th>Nombre</th><th class="num">Tp</th><th class="num">Tl</th><th class="num">Ps</th><th class="num">FSR</th><th class="num">Mano de obra ligada</th><th>Estatus</th></tr></thead>
        <tbody id="fsLista"></tbody></table></div>

    <div class="editor" id="fsEditor" hidden>
        <div class="fila">
            <label class="campo ancho"><span>Nombre</span><input type="text" id="fsNombre" maxlength="100" placeholder="p. ej. Instaladores 2026"></label>
            <label class="campo"><span>Días calendario</span><input type="number" step="any" min="1" id="fsDias" value="365"></label>
            <label class="check"><input type="checkbox" id="fsActivo" checked> Activo</label>
        </div>
        <div class="tres">
            <div><h3>Días pagados además del calendario</h3><table class="lista" data-lista="dias_pagados" data-campo="dias"><thead><tr><th>Concepto</th><th class="num">Días</th><th></th></tr></thead><tbody></tbody></table>
                <button class="btn chico" data-agregar="dias_pagados">＋ Renglón</button></div>
            <div><h3>Días no laborados</h3><table class="lista" data-lista="dias_no_laborados" data-campo="dias"><thead><tr><th>Concepto</th><th class="num">Días</th><th></th></tr></thead><tbody></tbody></table>
                <button class="btn chico" data-agregar="dias_no_laborados">＋ Renglón</button></div>
            <div><h3>Obligaciones obrero-patronales</h3><table class="lista" data-lista="obligaciones" data-campo="pct"><thead><tr><th>Concepto</th><th class="num">%</th><th></th></tr></thead><tbody></tbody></table>
                <button class="btn chico" data-agregar="obligaciones">＋ Renglón</button></div>
        </div>
        <label class="campo ancho"><span>Notas (fuente de los porcentajes, año, reforma…)</span><textarea id="fsNotas" rows="2"></textarea></label>
        <div class="resultado" id="fsResultado"></div>
        <div class="fila">
            <button class="btn azul" id="fsGuardar">💾 Guardar</button>
            <button class="btn peligro" id="fsEliminar">🗑 Eliminar</button>
            <button class="btn" id="fsCerrar">Cerrar</button>
        </div>
    </div>
</section>

<script src="<?= recurso('js/parametros-costos.js') ?>"></script>
</body>
</html>
