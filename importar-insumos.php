<?php
// Catalogos › Importar insumos: asistente para traer insumos y precios desde Excel / CSV (p. ej. exportados de Neodata)
require __DIR__ . '/includes/sesion.php';
exigirPermiso('CATALOGO_INSUMOS', 'ADMIN_USER');
$puedePrecios = tienePermiso('PRECIOS_INSUMOS', 'ADMIN_USER');
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="acri-token" content="<?= e($_SESSION['csrf']) ?>">
    <title>Importar insumos · AcriGlass</title>
    <link rel="icon" href="<?= e(imagenSistema('favicon', sistemaConfig())) ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@700;800&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= recurso('css/parametros-costos.css') ?>">
    <style>
        .pasos { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
        .pasos span { padding: 4px 10px; border-radius: 12px; border: 1px solid var(--borde-2); color: var(--texto-suave); font-size: 12px; }
        .pasos span.activo { border-color: var(--azul); color: #fff; }
        textarea.pegar { width: 100%; min-height: 160px; font-family: Consolas, monospace; font-size: 12px; }
        .mapa { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
        .mapa .campo { width: auto; }
        tr.error td { background: rgba(248, 113, 113, .08); }
        tr.nuevo td:first-child { box-shadow: inset 3px 0 #22c55e; }
        tr.actualizar td:first-child { box-shadow: inset 3px 0 #3b82f6; }
        .etiqueta { font-size: 11px; font-weight: 800; padding: 1px 7px; border-radius: 10px; border: 1px solid var(--borde-2); white-space: nowrap; }
        .resumen b { color: #fff; margin-right: 12px; }
        .tabla.alta { max-height: 420px; }
        small.aviso-fila { display: block; color: var(--texto-suave); }
        small.error-fila { display: block; color: #fca5a5; }
    </style>
</head>
<body data-precios="<?= $puedePrecios ? '1' : '0' ?>">

<header class="cabecera">
    <h1><span class="m-acri">ACRI</span> <span class="m-glass">GLASS</span> <span class="h-texto">Importar insumos</span></h1>
    <p>Trae insumos y precios desde Excel o un CSV (por ejemplo, el catálogo exportado de Neodata). Primero se revisa todo y se muestra qué se hará;
       nada se guarda hasta que confirmes. Un precio nunca sobrescribe al anterior: se agrega al historial.</p>
    <div class="pasos"><span data-paso="1" class="activo">1 · Cargar</span><span data-paso="2">2 · Columnas</span><span data-paso="3">3 · Revisión</span><span data-paso="4">4 · Resultado</span></div>
</header>
<p class="aviso" id="aviso" hidden></p>

<section class="bloque" id="paso1">
    <h2>1 · Cargar los datos</h2>
    <p class="ayuda">En Excel selecciona las columnas (con su encabezado) y pégalas aquí, o elige un archivo .csv. Hasta 5,000 renglones.</p>
    <div class="fila">
        <label class="campo ancho"><span>Archivo CSV (opcional)</span><input type="file" id="archivo" accept=".csv,.txt,text/csv"></label>
        <label class="check"><input type="checkbox" id="encabezados" checked> La primera fila son encabezados</label>
    </div>
    <textarea class="pegar" id="pegar" placeholder="Clave	Descripción	Tipo	Unidad	Familia	Precio&#10;VT9	Vidrio templado 9 mm	Material	M2	VIDRIO	1250"></textarea>
    <div class="fila"><button class="btn azul" id="leer">Continuar ›</button></div>
</section>

<section class="bloque" id="paso2" hidden>
    <h2>2 · ¿Qué columna es cada dato?</h2>
    <p class="ayuda" id="leidos"></p>
    <div class="mapa" id="mapa"></div>
    <h3 style="margin-top:14px">Opciones</h3>
    <div class="fila">
        <label class="check"><input type="checkbox" id="opActualizar"> Actualizar descripción, tipo, unidad y familia de las claves que ya existen</label>
        <label class="check"><input type="checkbox" id="opUnidades"> Crear las unidades que no existan</label>
    </div>
    <div class="fila">
        <label class="check"><input type="checkbox" id="opPrecios"> Registrar los precios (sin IVA) en el historial</label>
        <label class="campo"><span>Vigentes desde</span><input type="date" id="opDesde"></label>
    </div>
    <div class="fila"><button class="btn" id="volver1">‹ Atrás</button><button class="btn azul" id="validar">Revisar ›</button></div>
</section>

<section class="bloque" id="paso3" hidden>
    <h2>3 · Revisión</h2>
    <p class="resumen" id="resumen"></p>
    <div class="tabla alta"><table><thead><tr><th>#</th><th>Acción</th><th>Clave</th><th>Descripción</th><th>Tipo</th><th>Unidad</th><th>Familia</th><th class="num">Precio</th><th>Notas</th></tr></thead>
        <tbody id="revision"></tbody></table></div>
    <div class="fila"><button class="btn" id="volver2">‹ Cambiar columnas u opciones</button><button class="btn azul" id="importar">✔ Importar</button></div>
</section>

<section class="bloque" id="paso4" hidden>
    <h2>4 · Resultado</h2>
    <p class="resumen" id="resultado"></p>
    <div class="fila"><button class="btn" id="otra">Importar otro archivo</button></div>
</section>

<script src="<?= recurso('js/importar-insumos.js') ?>"></script>
</body>
</html>
