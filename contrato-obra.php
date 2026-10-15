<?php
// Contrato de obra y convenios (se abre desde la obra: botón Contrato)
require __DIR__ . '/includes/sesion.php';
exigirPermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'CERRAR_OBRA', 'AUTORIZAR_CONVENIOS', 'ADMIN_USER');
$obraId = max(0, (int) ($_GET['id'] ?? 0));
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="acri-token" content="<?= e($_SESSION['csrf']) ?>">
    <title>Contrato de obra · AcriGlass</title>
    <link rel="icon" href="<?= e(imagenSistema('favicon', sistemaConfig())) ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@700;800&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= recurso('css/parametros-costos.css') ?>">
    <style>
        .tarjetas { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 10px; }
        .tarjeta { padding: 10px 12px; border: 1px solid var(--borde); border-radius: 8px; background: var(--fondo-2); }
        .tarjeta span { display: block; font-size: 11.5px; color: var(--texto-suave); font-weight: 700; }
        .tarjeta b { font-size: 16px; color: #fff; }
        .tarjeta.fuerte b { color: var(--dorado); }
        .estatus { display: inline-block; padding: 1px 8px; border-radius: 10px; border: 1px solid var(--borde-2); font-size: 11.5px; font-weight: 800; }
        .estatus.autorizado, .estatus.vigente { border-color: #22c55e; color: #bbf7d0; }
        .estatus.pendiente, .estatus.borrador { border-color: #fbbf24; color: #fde68a; }
        .estatus.rechazado, .estatus.cancelado { border-color: #f87171; color: #fecaca; }
        textarea { width: 100%; }
        td .btn { margin-right: 4px; }
    </style>
</head>
<body data-obra="<?= $obraId ?>">

<header class="cabecera">
    <h1><span class="m-acri">ACRI</span> <span class="m-glass">GLASS</span> <span class="h-texto">Contrato de obra</span></h1>
    <p id="titulo">Cargando…</p>
</header>
<p class="aviso" id="aviso" hidden></p>

<section class="bloque" id="bloqueResumen" hidden>
    <h2>Cifras vigentes <small class="ayuda">(solo cuentan los convenios autorizados; importes sin IVA salvo el total)</small></h2>
    <div class="tarjetas" id="tarjetas"></div>
    <p class="ayuda" id="notaLibro"></p>
</section>

<section class="bloque" id="bloqueContrato" hidden>
    <h2>Contrato <span class="estatus" id="estatusContrato"></span></h2>
    <p class="ayuda" id="ayudaContrato"></p>
    <div class="fila">
        <label class="campo"><span>Número</span><input type="text" id="cNumero" maxlength="40"></label>
        <label class="campo"><span>Firma</span><input type="date" id="cFirma"></label>
        <label class="campo"><span>Inicio</span><input type="date" id="cInicio"></label>
        <label class="campo"><span>Terminación</span><input type="date" id="cTermino"></label>
    </div>
    <div class="fila">
        <label class="campo"><span>Monto sin IVA</span><input type="number" step="0.01" min="0" id="cMonto" data-monto></label>
        <label class="campo"><span>IVA %</span><input type="number" step="any" min="0" id="cIva" data-monto></label>
        <label class="campo"><span>Moneda</span><select id="cMoneda" data-monto><option>MXN</option><option>USD</option></select></label>
        <label class="campo"><span>Tipo de cambio</span><input type="number" step="any" min="0" id="cTc" data-monto></label>
    </div>
    <div class="fila">
        <label class="campo"><span>Anticipo %</span><input type="number" step="any" min="0" max="100" id="cAnticipo"></label>
        <label class="campo"><span>Fondo de garantía %</span><input type="number" step="any" min="0" max="100" id="cFondo"></label>
        <label class="campo"><span>Retención %</span><input type="number" step="any" min="0" max="100" id="cRetencion"></label>
        <label class="campo ancho"><span>Concepto de la retención</span><input type="text" id="cRetConcepto" maxlength="100" placeholder="p. ej. 5 al millar"></label>
    </div>
    <label class="campo ancho"><span>Condiciones de pago</span><textarea id="cCondiciones" rows="2"></textarea></label>
    <label class="campo ancho" style="margin-top:8px"><span>Notas</span><textarea id="cNotas" rows="2"></textarea></label>
    <div class="fila" style="margin-top:10px">
        <label class="campo"><span>Estatus</span>
            <select id="cEstatus"><option value="borrador">Borrador</option><option value="vigente">Vigente (firmado)</option>
                <option value="terminado">Terminado</option><option value="cancelado">Cancelado</option></select></label>
        <button class="btn azul" id="cGuardar">💾 Guardar contrato</button>
    </div>
</section>

<section class="bloque" id="bloqueConvenios" hidden>
    <h2>Convenios, aditivas y órdenes de cambio</h2>
    <p class="ayuda">Se registran pendientes y solo cambian el monto o el plazo cuando otro usuario con el permiso «Autorizar convenios» los autoriza.</p>
    <div class="tabla"><table><thead><tr><th>Número</th><th>Tipo</th><th>Fecha</th><th>Descripción</th><th class="num">Monto</th><th class="num">Días</th><th>Estatus</th><th>Registró / resolvió</th><th></th></tr></thead>
        <tbody id="convenios"></tbody></table></div>
    <h3 style="margin-top:14px" id="vTitulo">Nuevo convenio</h3>
    <div class="fila">
        <label class="campo"><span>Tipo</span><select id="vTipo"></select></label>
        <label class="campo"><span>Número</span><input type="text" id="vNumero" maxlength="40"></label>
        <label class="campo"><span>Fecha</span><input type="date" id="vFecha"></label>
        <label class="campo"><span>Monto sin IVA</span><input type="number" step="0.01" id="vMonto"></label>
        <label class="campo"><span>Días de plazo</span><input type="number" step="1" id="vDias" value="0"></label>
    </div>
    <label class="campo ancho"><span>Descripción (qué cambia y por qué)</span><textarea id="vDescripcion" rows="2"></textarea></label>
    <div class="fila" style="margin-top:10px">
        <button class="btn azul" id="vGuardar">💾 Registrar convenio</button>
        <button class="btn" id="vLimpiar" hidden>Cancelar edición</button>
    </div>
</section>

<script src="<?= recurso('js/contrato-obra.js') ?>"></script>
</body>
</html>
