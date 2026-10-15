<?php
// Administrador › Parámetros de presupuesto: utilidad, indirectos, financiamiento e IVA
require __DIR__ . '/includes/sesion.php';
exigirPermiso('ADMIN_USER');
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="acri-token" content="<?= e($_SESSION['csrf']) ?>">
    <title>Parámetros de presupuesto · AcriGlass</title>
    <link rel="icon" href="<?= e(imagenSistema('favicon', sistemaConfig())) ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@700;800&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= recurso('css/parametros-costos.css') ?>">
</head>
<body>

<header class="cabecera">
    <h1><span class="m-acri">ACRI</span> <span class="m-glass">GLASS</span> <span class="h-texto">Parámetros de presupuesto</span></h1>
    <p>Cómo se calcula el precio de los presupuestos de obra. Aplican a los presupuestos <b>nuevos</b>; uno guardado conserva su utilidad y su IVA,
       pero si se modifica, sus indirectos se recalculan con el % vigente.</p>
</header>
<p class="aviso" id="aviso" hidden></p>

<section class="bloque">
    <h2>Utilidad</h2>
    <div class="fila">
        <label class="campo ancho"><span>Forma</span>
            <select id="utilidadModo">
                <option value="costo">% sobre el costo (20 % de $1,000 = $1,200)</option>
                <option value="margen">% de margen sobre el precio (20 % de $1,000 = $1,250)</option>
            </select></label>
        <label class="campo"><span>% de utilidad de un presupuesto nuevo</span><input type="number" step="any" min="0" id="utilidadPct"></label>
    </div>
    <p class="ayuda" id="utilidadNota"></p>
</section>

<section class="bloque">
    <h2>Indirectos</h2>
    <p class="ayuda">Se agregan solos a un presupuesto nuevo como Gastos de Operación de cálculo automático, como % del costo directo
        (toda la Materia Prima y la Mano de Obra sin comisiones). En el Análisis P.U. cuentan como indirectos.</p>
    <div class="fila">
        <label class="campo ancho"><span>Cómo se manejan</span>
            <select id="indirectosModo">
                <option value="ninguno">Sin indirectos automáticos (se capturan como Gastos de Operación)</option>
                <option value="unico">Un solo porcentaje</option>
                <option value="oficina_campo">Separados en oficina y campo</option>
            </select></label>
        <label class="campo" data-modo="unico"><span>Indirectos %</span><input type="number" step="any" min="0" id="indirectoPct"></label>
        <label class="campo" data-modo="oficina_campo"><span>Oficina %</span><input type="number" step="any" min="0" id="indirectoOficinaPct"></label>
        <label class="campo" data-modo="oficina_campo"><span>Campo %</span><input type="number" step="any" min="0" id="indirectoCampoPct"></label>
    </div>
</section>

<section class="bloque">
    <h2>Financiamiento</h2>
    <div class="fila">
        <label class="campo"><span>% de un Análisis P.U. nuevo</span><input type="number" step="any" min="0" id="financiamientoPct"></label>
    </div>
    <p class="ayuda">Se aplica en el Análisis P.U. sobre costo directo + indirectos.</p>
</section>

<section class="bloque">
    <h2>IVA</h2>
    <p class="ayuda">Tasas que se pueden elegir en cada presupuesto. La marcada es la de un presupuesto nuevo.</p>
    <table class="lista" id="ivaTabla"><thead><tr><th>Predeterminada</th><th>Nombre</th><th class="num">%</th><th></th></tr></thead><tbody></tbody></table>
    <button class="btn chico" id="ivaAgregar">＋ Tasa</button>
</section>

<div class="fila" style="max-width:1100px;margin-top:16px">
    <button class="btn azul" id="guardar">💾 Guardar parámetros</button>
</div>

<script src="<?= recurso('js/parametros-presupuesto.js') ?>"></script>
</body>
</html>
