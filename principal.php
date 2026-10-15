<?php
require __DIR__ . '/includes/sesion.php';

$cfg      = sistemaConfig();
$empresa  = $cfg['empresa'];
$restante = max(0, $_SESSION['expira'] - time());
$inicial  = mb_strtoupper(mb_substr($usuarioSesion, 0, 1));

// Menú lateral.
// tipo: modulo = listado en pestaña (4º dato = columnas del listado)
//       pagina = página en pestaña (4º dato = url) · pendiente = aún no existe
$colsGasto    = ['CONCEPTO_ID', 'CLAVE', 'NOMBRE', 'DESCRIPCION', 'ESTATUS'];

$menu = [
    [
        'id' => 'documentos', 'titulo' => 'Documentos', 'icono' => '📁', 'abierto' => true,
        'items' => [
            ['Presupuestos de Obra',         '🧾', 'modulo', ['DOCTO_SUGERIDO_OBRA_ID', 'FOLIO', 'ESTATUS', 'FECHA', 'CLIENTE', 'PROYECTO', 'VENDEDOR', 'OBRA']],
            ['Obras',                        '🏗️', 'modulo', ['OBRA_ID', 'FOLIO', 'ESTATUS', 'FECHA', 'CLIENTE', 'PROYECTO', 'UBICACION']],
            ['Orden de Fabricacion',         '⚙️', 'modulo', ['ORDEN_FABRICACION_ID', 'FOLIO', 'ESTATUS', 'FECHA', 'OBRA', 'CLIENTE']],
            ['Gastos de Obra',               '💵', 'modulo', ['GASTO_OBRA_ID', 'FOLIO', 'FECHA', 'OBRA', 'CONCEPTO', 'IMPORTE']],
            ['Salidas de Personal a Obra',   '👷', 'modulo', ['SALIDA_PERSONAL_ID', 'FOLIO', 'FECHA', 'OBRA', 'EMPLEADO', 'ESTATUS']],
            ['Salidas de Materiales',        '📦', 'modulo', ['SALIDA_MATERIAL_ID', 'FOLIO', 'FECHA', 'OBRA', 'ESTATUS']],
            ['Consumos de Material en Obra', '🧰', 'modulo', ['CONSUMO_MATERIAL_ID', 'FOLIO', 'FECHA', 'OBRA', 'ESTATUS']],
        ],
    ],
    [
        'id' => 'servicios', 'titulo' => 'Servicios', 'icono' => '🧭',
        'items' => [
            ['Estado de resultados',        '📊', 'pagina', 'servicio-obra.php?m=resultados'],
            ['Explosión insumos',           '🧱', 'pagina', 'servicio-obra.php?m=explosion'],
            ['Órdenes por cobrar',          '🧾', 'pagina', 'servicio-obra.php?m=ordenes'],
            ['Renta de maquinaria',         '🚜', 'pagina', 'servicio-obra.php?m=renta'],
            ['Cuentas por pagar',           '💸', 'pagina', 'servicio-obra.php?m=cxp'],
            ['Mano de obra',                '👷', 'pagina', 'servicio-obra.php?m=mano'],
            ['Presupuesto',                 '📝', 'pagina', 'servicio-obra.php?m=presupuesto'],
            ['Relación de gastos',          '💵', 'pagina', 'servicio-obra.php?m=gastos'],
            ['Pruebas',                     '🧪', 'pagina', 'servicio-obra.php?m=pruebas'],
            ['Planos',                      '📐', 'pagina', 'servicio-obra.php?m=planos'],
            ['Gantt Obras',                 '📅', 'pagina', 'servicio-obra.php?m=gantt'],
            ['Tramites',                    '📑', 'pagina', 'servicio-obra.php?m=tramites'],
            ['Ganancia por proyecto',       '📈', 'pagina', 'servicio-obra.php?m=ganancia'],
            ['Bitácora de obra',            '📓', 'pagina', 'servicio-obra.php?m=bitacora'],
            ['Subcontratos',                '🤝', 'pagina', 'servicio-obra.php?m=subcontratos'],
            ['Inventario de obras',         '📦', 'pagina', 'servicio-obra.php?m=inventario'],
            ['Cuentas por cobrar',          '💰', 'pagina', 'servicio-obra.php?m=cxc'],
            ['Presupuesto por actividades', '🗒️', 'pagina', 'servicio-obra.php?m=actividades'],
            ['Avance financiero',           '📉', 'pagina', 'servicio-obra.php?m=avance'],
            ['Gastos indirectos',           '🏷️', 'pagina', 'servicio-obra.php?m=indirectos'],
        ],
    ],
    [
        'id' => 'catalogos', 'titulo' => 'Catalogos', 'icono' => '🗂️',
        'items' => [
            ['Clientes',           '🤝', 'modulo', ['CLAVE_CLIENTE', 'NOMBRE', 'CONTACTO', 'TELEFONO', 'EMAIL', 'CIUDAD', 'VENDEDOR']],
            ['Vendedores de Obra', '🏢', 'modulo', ['VENDEDOR_OBRA_ID', 'NOMBRE', 'ESTATUS']],
            ['Empleados',          '🧑‍🔧', 'modulo', ['NUMERO_EMPLEADO', 'NOMBRE', 'TIPO_EMPLEADO', 'TELEFONO', 'SUELDO_DIARIO', 'ESTATUS']],
            ['Tipos de Empleados', '🪪', 'modulo', ['TIPO_EMPLEADO_ID', 'CLAVE', 'NOMBRE', 'PORCENTAJE']],
            ['Insumos',            '🧱', 'modulo', ['CLAVE', 'DESCRIPCION', 'TIPO', 'UNIDAD', 'FAMILIA', 'PRECIO', 'VIGENCIA', 'COSTO', 'ESTATUS']],
            ['Parámetros de costos', '⚖️', 'pagina', 'parametros-costos.php'],
        ],
    ],
    [
        'id' => 'conceptos', 'titulo' => 'Conceptos', 'icono' => '📋',
        'items' => [
            ['Conceptos Gastos en Obra',   '💰', 'modulo', $colsGasto],
        ],
    ],
    [
        'id' => 'administrador', 'titulo' => 'Administrador', 'icono' => '🛠️',
        'items' => [
            ['Bases de datos',     '🗄️', 'pagina', 'bases-datos.php'],
            ['APIs y servicios',   '🔌', 'pagina', 'servicios.php'],
            ['Imagen del Sistema', '🖼️', 'pagina', 'imagen-sistema.php'],
            ['Hoja Membretada',    '📄', 'pagina', 'hoja-membretada.php'],
            ['Usuarios',           '👥', 'pagina', 'usuarios.php'],
            ['Roles',              '🔐', 'pagina', 'roles.php'],
            ['Conceptos de Materia Prima',       '🧱', 'pagina', 'conceptos.php?tipo=mp'],
            ['Conceptos de Mano de Obra',        '👷', 'pagina', 'conceptos.php?tipo=mo'],
            ['Conceptos de Gastos de Operacion', '💲', 'pagina', 'conceptos.php?tipo=go'],
            ['Estatus de Presupuestos',          '🔄', 'pagina', 'estatus.php'],
            ['Novedades del Sistema',            '📰', 'pagina', 'novedades.php'],
            ['Empresa',            '🏢', 'pendiente'],
        ],
    ],
];

// Servicios con los mismos permisos del módulo de obras
if (!tienePermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'CERRAR_OBRA', 'ADMIN_USER')) {
    $menu = array_values(array_filter($menu, fn($g) => $g['id'] !== 'servicios'));
}
// Administrador solo con el permiso ADMIN_USER de AW
if (!tienePermiso('ADMIN_USER')) {
    $menu = array_values(array_filter($menu, fn($g) => $g['id'] !== 'administrador'));
}

function idItem(string $nombre): string
{
    return strtolower(preg_replace('/[^a-z0-9]+/i', '-', iconv('UTF-8', 'ASCII//TRANSLIT', $nombre)));
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AcriGlass · Vidrio y Aluminio</title>
    <link rel="icon" id="favicon" href="<?= e(imagenSistema('favicon', $cfg)) ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@700;800&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= recurso('css/principal.css') ?>">
    <link rel="stylesheet" href="<?= recurso('css/fichas.css') ?>">
</head>
<body>

<!-- ================= MENÚ LATERAL ================= -->
<aside class="sidebar" id="sidebar">
    <div class="sb-cabecera">
        <div class="sb-logo"><img id="logoSistema" src="<?= e(imagenSistema('logo', $cfg)) ?>" alt="AcriGlass"></div>
        <div class="avatar sb-avatar"><?= e($inicial) ?></div>
        <div class="sb-usuario"><?= e($usuarioSesion) ?></div>
        <div class="sb-empresa"><?= e($empresa['nombre']) ?></div>
    </div>

    <nav class="menu" id="menu">
        <!-- Favoritos (se llena con JS) -->
        <div class="grupo abierto" id="grupoFavoritos" hidden>
            <button class="grupo-titulo"><span class="g-icono">⭐</span><span class="g-texto">Favoritos</span><span class="g-flecha">▸</span></button>
            <div class="grupo-items" id="itemsFavoritos"></div>
        </div>

        <?php foreach ($menu as $g): ?>
        <div class="grupo<?= !empty($g['abierto']) ? ' abierto' : '' ?>" data-grupo="<?= $g['id'] ?>">
            <button class="grupo-titulo">
                <span class="g-icono"><?= $g['icono'] ?></span>
                <span class="g-texto"><?= e($g['titulo']) ?></span>
                <span class="g-flecha">▸</span>
            </button>
            <div class="grupo-items">
                <?php foreach ($g['items'] as $it): [$nombre, $icono, $tipo] = $it; ?>
                <div class="item" data-id="<?= idItem($nombre) ?>" data-nombre="<?= e($nombre) ?>"
                     data-tipo="<?= $tipo ?>"
                     <?php if (isset($it[3]) && is_array($it[3])): ?>data-columnas="<?= e(json_encode($it[3])) ?>"<?php endif; ?>
                     <?php if (isset($it[3]) && is_string($it[3])): ?>data-url="<?= e($it[3]) ?>"<?php endif; ?>
                     tabindex="0">
                    <span class="i-icono"><?= $icono ?></span>
                    <span class="i-texto"><?= e($nombre) ?></span>
                    <button class="i-estrella" title="Agregar a favoritos">★</button>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endforeach; ?>

        <div class="item suelto" data-id="manual" data-nombre="Manual de uso" data-tipo="pendiente" tabindex="0">
            <span class="i-icono">📖</span><span class="i-texto">Manual de uso</span>
        </div>
    </nav>
</aside>
<div class="velo" id="velo"></div>

<!-- ================= ÁREA PRINCIPAL ================= -->
<div class="principal">
    <header class="topbar">
        <button class="tb-btn" id="btnMenu" title="Mostrar / ocultar menú">☰</button>
        <div class="buscador" id="buscador">
            <button class="tb-btn" id="btnBuscar" title="Buscar en el menú">🔍</button>
            <input type="search" id="txtBuscar" placeholder="Buscar módulo…" autocomplete="off">
        </div>
        <div class="marca"><span class="m-acri">ACRI</span><span class="m-glass">GLASS</span></div>

        <div class="tb-iconos">
            <button class="tb-btn" id="btnFavoritos" title="Favoritos">⭐</button>
            <button class="tb-btn" id="btnPantalla" title="Pantalla completa">⛶</button>
            <button class="tb-btn" id="btnAvisos" title="Notificaciones">🔔</button>
            <button class="avatar tb-avatar" id="btnUsuario" title="Panel de usuario"><?= e($inicial) ?></button>
        </div>

        <!-- Panel de usuario -->
        <div class="panel-usuario" id="panelUsuario" hidden>
            <div class="pu-titulo"><span class="avatar mini"><?= e($inicial) ?></span> PANEL DE USUARIO</div>

            <section class="pu-caja">
                <h3>👤 USUARIO</h3>
                <div class="avatar grande"><?= e($inicial) ?></div>
                <div class="pu-nombre"><?= e($usuarioSesion) ?></div>
                <div class="pu-etiqueta">Expiración de sesión</div>
                <div class="pu-reloj" id="reloj" data-restante="<?= $restante ?>">
                    <div><b id="rH">0</b><small>Horas</small></div>
                    <div><b id="rM">0</b><small>Minutos</small></div>
                    <div><b id="rS">0</b><small>Segundos</small></div>
                </div>
                <div class="pu-botones">
                    <button class="btn-borde" id="btnEditarUsuario">Editar</button>
                    <a class="btn-borde" href="logout.php">Cerrar sesión ⏻</a>
                </div>
            </section>

            <section class="pu-caja">
                <h3>🏢 EMPRESA</h3>
                <div class="pu-empresa">
                    <span class="pu-emp-icono">🏢</span>
                    <div>
                        <small>Nombre:</small>
                        <div><?= e($empresa['nombre']) ?></div>
                        <small>RFC:</small>
                        <div><?= $empresa['rfc'] !== '' ? e($empresa['rfc']) : '<em>Sin capturar</em>' ?></div>
                    </div>
                </div>
            </section>
        </div>
    </header>

    <!-- Pestañas internas -->
    <div class="pestanas" id="pestanas"></div>

    <div class="paneles" id="paneles">
        <!-- Bienvenido -->
        <section class="panel" id="panel-bienvenido">
            <div class="bienvenido">
                <div class="bv-cabecera">
                    <h1 class="bv-titulo">General</h1>
                    <span class="bv-periodo" id="txtPeriodo"></span>
                </div>
                <div class="tarjetas">
                    <?php foreach ([
                        ['PRESUPUESTOS PENDIENTES', 'Presupuestos de Obra', 'presupuestos_pendientes'],
                        ['PRESUPUESTOS APROBADOS',  'Presupuestos de Obra', 'presupuestos_aceptados'],
                        ['OBRAS EN PROCESO',        'Obras',                'obras_en_proceso'],
                        ['ÓRDENES DE FABRICACIÓN',  'Orden de Fabricacion', null],
                        ['GASTOS DE OBRA',          'Gastos de Obra',       null],
                        ['SALIDAS DE MATERIAL',     'Salidas de Materiales', null],
                    ] as [$t, $mod, $indicador]):
                        if (modoConfiguracion()) $indicador = null; ?>
                    <div class="tarjeta"<?= $indicador ? ' data-indicador="' . $indicador . '"' : '' ?>>
                        <h3><?= $t ?></h3>
                        <div class="t-valor">—</div>
                        <div class="t-nota">Sin datos todavía</div>
                        <a href="#" class="t-link" data-abrir="<?= idItem($mod) ?>">Ir a <?= e(mb_strtolower($mod)) ?> ›</a>
                    </div>
                    <?php endforeach; ?>
                </div>

                <?php if (!modoConfiguracion()): ?>
                <!-- Tablero de los proyectos (obras): financiero y presupuesto -->
                <div class="tablero" id="tablero">
                    <div class="bv-cabecera tb-cabecera">
                        <h2 class="bv-titulo">Proyectos</h2>
                        <div class="tb-filtros">
                            <label>Año <select id="tbAnio"></select></label>
                            <label>Obra <select id="tbObra"><option value="0">Todas las obras del año</option></select></label>
                        </div>
                    </div>
                    <p class="tb-estado" id="tbEstado"></p>

                    <div class="tb-kpis">
                        <div class="tb-kpi" data-serie="pagado"><h3>COSTO EJERCIDO</h3><b data-kpi="pagado">—</b><small>Material surtido + mano de obra real (no son pagos)</small></div>
                        <div class="tb-kpi" data-serie="cobrado"><h3>COBRADO</h3><b data-kpi="cobrado">—</b><small>Cobros, anticipos y notas de crédito (con IVA)</small></div>
                        <div class="tb-kpi" data-serie="otros"><h3>OTROS GASTOS</h3><b data-kpi="otros">—</b><small>Gastos adicionales reales</small></div>
                        <div class="tb-kpi" data-serie="utilidad"><h3>UTILIDAD / PÉRDIDA</h3><b data-kpi="utilidad">—</b><small>Cobrado sin IVA − costo ejercido − otros gastos</small></div>
                    </div>

                    <div class="tb-fila">
                        <div class="tb-lado">
                            <div class="tb-kpi"><h3>POR COBRAR</h3><b data-kpi="por_cobrar">—</b><small>Saldo en Microsip y AW</small></div>
                            <div class="tb-kpi"><h3>POR PAGAR</h3><b data-kpi="por_pagar">—</b><small>Mano de obra y gastos sin importe real</small></div>
                        </div>
                        <figure class="tb-grafica"><figcaption>BALANCE FINANCIERO</figcaption><div id="grfFinanciero"></div></figure>
                        <figure class="tb-grafica"><figcaption>PORCENTAJE FINANCIERO</figcaption><div id="grfFinPct"></div></figure>
                    </div>

                    <div class="tb-fila tb-fila-2">
                        <figure class="tb-grafica"><figcaption>BALANCE PRESUPUESTO</figcaption><div id="grfPresupuesto"></div></figure>
                        <figure class="tb-grafica"><figcaption>PORCENTAJE PRESUPUESTO</figcaption><div id="grfPresPct"></div></figure>
                    </div>
                </div>
                <?php endif; ?>

                <p class="bv-nota"><?= modoConfiguracion()
                    ? '⚠ Modo configuración: captura la contraseña de AW en Administrador › Bases de datos y vuelve a iniciar sesión con tu usuario.'
                    : 'Presupuestos y obras vienen de AW-Management; el resto de los indicadores se conectará después.' ?></p>
            </div>
        </section>
    </div>
</div>

<script>
    window.ACRI = {
        usuario: <?= json_encode($usuarioSesion, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>,
        token: <?= json_encode($_SESSION['csrf']) ?>
    };
</script>
<script src="<?= recurso('js/fichas.js') ?>"></script>
<script src="<?= recurso('js/principal.js') ?>"></script>
<script src="<?= recurso('js/tablero.js') ?>"></script>
</body>
</html>
