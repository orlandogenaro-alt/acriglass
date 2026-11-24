<?php
require __DIR__ . '/includes/sesion.php';
require __DIR__ . '/includes/acrineo/permisos.php';
require_once __DIR__ . '/includes/acrineo/esquema.php';   // ACRINEO_ESTATUS (filtro del tablero)

$cfg      = sistemaConfig();
$empresa  = $cfg['empresa'];
$restante = max(0, $_SESSION['expira'] - time());
$inicial  = mb_strtoupper(mb_substr($usuarioSesion, 0, 1));
$foto     = fotoUsuario($usuarioSesion);
$avatar   = avatarContenido($foto, $inicial);

// Menú lateral.
// tipo: modulo = listado en pestaña (4º dato = columnas del listado)
//       pagina = página en pestaña (4º dato = url) · pendiente = aún no existe
$colsGasto    = ['CONCEPTO_ID', 'CLAVE', 'NOMBRE', 'DESCRIPCION', 'ESTATUS'];

$menu = [
    [
        // ACRINEO: sistema propio de presupuestos y control de costos; sus opciones se agregan por etapas
        'id' => 'acrineo', 'titulo' => 'ACRINEO', 'icono' => '🧮',
        'items' => [
            ['Catálogo de presupuestos', '📐', 'pagina', 'acrineo-presupuestos.php'],
        ],
    ],
    [
        'id' => 'documentos', 'titulo' => 'Documentos', 'icono' => '📁', 'abierto' => true,
        'items' => [
            ['Presupuestos de Obra',         '🧾', 'modulo', ['DOCTO_SUGERIDO_OBRA_ID', 'FOLIO', 'ESTATUS', 'FECHA', 'CLIENTE', 'PROYECTO', 'VENDEDOR', 'OBRA']],
            ['Obras',                        '🏗️', 'modulo', ['OBRA_ID', 'FOLIO', 'ESTATUS', 'FECHA', 'CLIENTE', 'PROYECTO', 'UBICACION']],
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
        // Los catálogos generales de ACRINEO (acrineo-catalogos.php) van primero, en el orden de Neodata
        'items' => [
            ['Unidades',           '📏', 'pagina', 'acrineo-catalogos.php?c=unidades'],
            ['Tipos de insumos',   '🔢', 'pagina', 'acrineo-catalogos.php?c=tipos_insumo'],
            ['Familias',           '👪', 'pagina', 'acrineo-catalogos.php?c=familias'],
            ['Estados',            '🗺️', 'pagina', 'acrineo-catalogos.php?c=estados'],
            ['Ciudades',           '🏙️', 'pagina', 'acrineo-catalogos.php?c=ciudades'],
            ['Proveedores',        '🚚', 'pagina', 'acrineo-catalogos.php?c=proveedores'],
            ['Responsables',       '🧑‍💼', 'pagina', 'acrineo-catalogos.php?c=responsables'],
            ['Clientes',           '🤝', 'modulo', ['CLAVE_CLIENTE', 'NOMBRE', 'CONTACTO', 'TELEFONO', 'EMAIL', 'CIUDAD', 'VENDEDOR']],
            ['Empresas',           '🏬', 'pagina', 'acrineo-catalogos.php?c=empresas'],
            ['Vendedores de Obra', '🏢', 'modulo', ['VENDEDOR_OBRA_ID', 'NOMBRE', 'ESTATUS']],
            ['Tipos de licitaciones', '💲', 'pagina', 'acrineo-catalogos.php?c=tipos_licitacion'],
            ['Regiones',           '🌎', 'pagina', 'acrineo-catalogos.php?c=regiones'],
            ['Empleados',          '🧑‍🔧', 'modulo', ['NUMERO_EMPLEADO', 'NOMBRE', 'TIPO_EMPLEADO', 'TELEFONO', 'SUELDO_DIARIO', 'ESTATUS']],
            ['Tipos de Empleados', '🪪', 'modulo', ['TIPO_EMPLEADO_ID', 'CLAVE', 'NOMBRE', 'PORCENTAJE']],
            ['Insumos',            '🧱', 'modulo', ['CLAVE', 'DESCRIPCION', 'TIPO', 'UNIDAD', 'FAMILIA', 'PRECIO', 'VIGENCIA', 'COSTO', 'ESTATUS']],
            ['Conceptos P.U.',     '🧩', 'modulo', ['CODIGO', 'DESCRIPCION', 'UNIDAD', 'FAMILIA', 'INSUMOS', 'COSTO_DIRECTO', 'ESTATUS']],
            ['Plantillas de presupuesto', '🗂️', 'modulo', ['NOMBRE', 'DESCRIPCION', 'CONCEPTOS', 'ESTATUS']],
            ['Parámetros de costos', '⚖️', 'pagina', 'parametros-costos.php'],
            ['Importar insumos',   '📥', 'pagina', 'importar-insumos.php'],
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
            ['Parámetros de presupuesto',        '🧮', 'pagina', 'parametros-presupuesto.php'],
            ['Novedades del Sistema',            '📰', 'pagina', 'novedades.php'],
            ['Empresa',            '🏢', 'pendiente'],
        ],
    ],
];

// Servicios con los mismos permisos del módulo de obras
if (!tienePermiso('MODULO_SUGERIDOS_OBRA', 'NUEVO_OBRA', 'MODIFICAR_OBRA', 'CERRAR_OBRA', 'ADMIN_USER')) {
    $menu = array_values(array_filter($menu, fn($g) => $g['id'] !== 'servicios'));
}
// ACRINEO: ACRINEO_VER + ACRINEO_PRESUPUESTOS_VER (o ADMIN_USER)
if (!acrineoPuede('presupuestos.ver')) {
    $menu = array_values(array_filter($menu, fn($g) => $g['id'] !== 'acrineo'));
    // ni sus catálogos generales
    foreach ($menu as &$g) {
        $g['items'] = array_values(array_filter($g['items'], fn($it) => !is_string($it[3] ?? null) || strncmp($it[3], 'acrineo-', 8) !== 0));
    }
    unset($g);
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
    <link rel="stylesheet" href="<?= recurso('css/recorrido.css') ?>">
    <script src="<?= recurso('js/tema.js') ?>"></script>
</head>
<body>

<!-- ================= MENÚ LATERAL ================= -->
<aside class="sidebar" id="sidebar" data-recorrido="menu">
    <div class="sb-cabecera">
        <div class="sb-logo"><img id="logoSistema" src="<?= e(imagenSistema('logo', $cfg)) ?>" alt="AcriGlass"></div>
        <div class="avatar sb-avatar" data-inicial="<?= e($inicial) ?>"><?= $avatar ?></div>
        <div class="sb-usuario"><?= e($usuarioSesion) ?></div>
        <div class="sb-empresa"><?= e($empresa['nombre']) ?></div>
    </div>

    <nav class="menu" id="menu">
        <?php
        // ACRINEO va hasta arriba; Favoritos justo debajo (o arriba si no hay ACRINEO)
        $favoritosPuestos = false;
        $pintarFavoritos = function () { ?>
        <!-- Favoritos (se llena con JS) -->
        <div class="grupo abierto" id="grupoFavoritos" hidden>
            <button class="grupo-titulo"><span class="g-icono">⭐</span><span class="g-texto">Favoritos</span><span class="g-flecha">▸</span></button>
            <div class="grupo-items" id="itemsFavoritos"></div>
        </div>
        <?php };
        if (($menu[0]['id'] ?? '') !== 'acrineo') { $pintarFavoritos(); $favoritosPuestos = true; }
        ?>

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
        <?php if (!$favoritosPuestos) { $pintarFavoritos(); $favoritosPuestos = true; } ?>
        <?php endforeach; ?>

        <div class="item suelto" data-id="manual" data-nombre="Manual de uso" data-tipo="pendiente" tabindex="0">
            <span class="i-icono">📖</span><span class="i-texto">Manual de uso</span>
        </div>
    </nav>

    <!-- Recorrido guiado (js/recorrido.js) -->
    <div class="sb-pie">
        <button class="sb-tour" id="btnTour" title="Iniciar el recorrido guiado" data-recorrido="tour">▶ Tour</button>
    </div>
</aside>
<div class="velo" id="velo"></div>

<!-- ================= ÁREA PRINCIPAL ================= -->
<div class="principal">
    <header class="topbar">
        <button class="tb-btn" id="btnMenu" title="Mostrar / ocultar menú">☰</button>
        <div class="buscador" id="buscador" data-recorrido="buscador">
            <button class="tb-btn" id="btnBuscar" title="Buscar en el menú">🔍</button>
            <input type="search" id="txtBuscar" placeholder="Buscar módulo…" autocomplete="off">
        </div>
        <div class="marca"><span class="m-acri">ACRI</span><span class="m-glass">GLASS</span></div>

        <div class="tb-iconos">
            <!-- Tema claro / oscuro de las pantallas (js/tema.js); se comparte con todas las pestañas -->
            <button class="tb-btn tb-tema" data-tema="auto" title="Tema">
                <svg class="i-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>
                <svg class="i-sol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
                <svg class="i-luna" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>
            </button>
            <button class="tb-btn" id="btnFavoritos" title="Favoritos">⭐</button>
            <button class="tb-btn" id="btnPantalla" title="Pantalla completa">⛶</button>
            <button class="tb-btn" id="btnAvisos" title="Notificaciones">🔔</button>
            <!-- Ayuda: recorrido guiado (js/recorrido.js) -->
            <div class="ayuda">
                <button class="tb-btn tb-ayuda" id="btnAyuda" title="Ayuda" aria-haspopup="true" aria-expanded="false" data-recorrido="ayuda">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.3-2.5 3.8"/><circle cx="12" cy="17.2" r=".6" fill="currentColor"/></svg>
                </button>
                <div class="ayuda-menu" id="menuAyuda" hidden>
                    <div class="am-titulo">Ayuda</div>
                    <button class="am-op" data-ayuda="recorrido">🧭 Iniciar recorrido<small></small></button>
                </div>
            </div>
            <button class="avatar tb-avatar" id="btnUsuario" title="Panel de usuario" data-recorrido="usuario" data-inicial="<?= e($inicial) ?>"><?= $avatar ?></button>
        </div>

        <!-- Panel de usuario -->
        <div class="panel-usuario" id="panelUsuario" hidden>
            <div class="pu-titulo"><span class="avatar mini" data-inicial="<?= e($inicial) ?>"><?= $avatar ?></span> PANEL DE USUARIO</div>

            <section class="pu-caja">
                <h3>👤 USUARIO</h3>
                <!-- Foto del usuario (api/foto-usuario.php): clic para cambiarla -->
                <button class="avatar grande pu-foto" id="btnFotoUsuario" title="Cambiar mi foto" data-inicial="<?= e($inicial) ?>"><?= $avatar ?></button>
                <input type="file" id="archivoFotoUsuario" accept="image/png,image/jpeg,image/webp" hidden>
                <div class="pu-foto-acciones">
                    <button class="pu-enlace" id="btnCambiarFoto">📷 <?= $foto ? 'Cambiar foto' : 'Subir foto' ?></button>
                    <button class="pu-enlace" id="btnQuitarFoto"<?= $foto ? '' : ' hidden' ?>>Quitar</button>
                </div>
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

            <?php if (acrineoPuede('presupuestos.crear')): ?>
            <section class="pu-caja">
                <h3>⚙️ NEODATA</h3>
                <div class="pu-etiqueta">Trae a ACRINEO las obras de tu Neodata (C:\NEODATAWinPlus)</div>
                <div class="pu-botones">
                    <button class="btn-borde" id="btnImportarNeodata" title="Lee la carpeta de archivos de intercambio de Neodata de esta computadora">⚙ Importar mis presupuestos</button>
                </div>
            </section>
            <?php endif; ?>

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
    <div class="pestanas" id="pestanas" data-recorrido="pestanas"></div>

    <div class="paneles" id="paneles">
        <!-- Bienvenido -->
        <section class="panel" id="panel-bienvenido">
            <div class="bienvenido">
                <div class="bv-cabecera">
                    <h1 class="bv-titulo">General</h1>
                    <span class="bv-periodo" id="txtPeriodo"></span>
                </div>
                <!-- Indicadores de los presupuestos de ACRINEO (js/tablero.js, api/acrineo/presupuestos.php?recurso=tablero) -->
                <?php $conAcrineo = !modoConfiguracion() && acrineoPuede('presupuestos.ver'); ?>
                <div class="tarjetas" data-recorrido="resumen">
                    <?php foreach ([
                        ['PRESUPUESTOS PENDIENTES', 'pendientes',       'Borrador, en proceso o enviados'],
                        ['PRESUPUESTOS APROBADOS',  'aprobados',        'Aprobados en ACRINEO'],
                        ['NUEVOS ESTE MES',         'nuevos_mes',       'Capturados o importados de Neodata'],
                        ['IMPORTE APROBADO',        'importe_aprobado', 'Precio de venta de los aprobados (sin IVA)'],
                        ['FACTURADO',               'facturado',        'Facturas de Microsip ligadas a los aprobados'],
                        ['POR FACTURAR',            'por_facturar',     'Aprobado con IVA menos lo facturado'],
                    ] as [$t, $indicador, $nota]): ?>
                    <div class="tarjeta"<?= $conAcrineo ? ' data-indicador="' . $indicador . '" data-nota="' . e($nota) . '"' : '' ?>>
                        <h3><?= $t ?></h3>
                        <div class="t-valor">—</div>
                        <div class="t-nota"><?= $conAcrineo ? 'Consultando ACRINEO…' : 'Sin permiso de ACRINEO' ?></div>
                        <a href="#" class="t-link" data-abrir="<?= idItem('Catálogo de presupuestos') ?>">Ir al catálogo de presupuestos ›</a>
                    </div>
                    <?php endforeach; ?>
                </div>

                <?php if ($conAcrineo): ?>
                <!-- Tablero de los proyectos: presupuestos de ACRINEO con lo facturado -->
                <div class="tablero" id="tablero">
                    <div class="bv-cabecera tb-cabecera">
                        <h2 class="bv-titulo">Proyectos</h2>
                        <div class="tb-filtros">
                            <label>Año <select id="tbAnio"></select></label>
                            <label>Estatus <select id="tbEstatus">
                                <option value="ACTIVOS">Activos (sin rechazados ni cancelados)</option>
                                <?php foreach (ACRINEO_ESTATUS as $k => $v): ?><option value="<?= $k ?>"><?= e($v) ?></option><?php endforeach; ?>
                            </select></label>
                            <label>Presupuesto <select id="tbObra"><option value="0">Todos los presupuestos</option></select></label>
                        </div>
                    </div>
                    <p class="tb-estado" id="tbEstado"></p>

                    <div class="tb-kpis">
                        <div class="tb-kpi" data-serie="pagado"><h3>COSTO DIRECTO</h3><b data-kpi="costo">—</b><small>Materiales, mano de obra y equipo de la hoja</small></div>
                        <div class="tb-kpi" data-serie="cobrado"><h3>PRECIO DE VENTA</h3><b data-kpi="venta">—</b><small>Costo directo + sobrecosto (sin IVA)</small></div>
                        <div class="tb-kpi" data-serie="otros"><h3>FACTURADO</h3><b data-kpi="facturado">—</b><small>Facturas de Microsip ligadas (con IVA)</small></div>
                        <div class="tb-kpi" data-serie="utilidad"><h3>SOBRECOSTO</h3><b data-kpi="utilidad">—</b><small>Precio de venta − costo directo (indirectos, financiamiento y utilidad)</small></div>
                    </div>

                    <div class="tb-fila">
                        <div class="tb-lado">
                            <div class="tb-kpi"><h3>POR FACTURAR</h3><b data-kpi="por_facturar">—</b><small>Precio con IVA menos lo facturado</small></div>
                            <div class="tb-kpi"><h3>PEDIDOS MICROSIP</h3><b data-kpi="pedidos">—</b><small>Pedidos ligados a los presupuestos</small></div>
                        </div>
                        <figure class="tb-grafica"><figcaption>BALANCE FINANCIERO</figcaption><div id="grfFinanciero"></div></figure>
                        <figure class="tb-grafica"><figcaption>COMPOSICIÓN DEL PRECIO</figcaption><div id="grfFinPct"></div></figure>
                    </div>

                    <div class="tb-fila tb-fila-2">
                        <figure class="tb-grafica"><figcaption>PRESUPUESTADO CONTRA FACTURADO (SIN IVA)</figcaption><div id="grfPresupuesto"></div></figure>
                        <figure class="tb-grafica"><figcaption>AVANCE DE FACTURACIÓN</figcaption><div id="grfPresPct"></div></figure>
                    </div>
                </div>
                <?php endif; ?>

                <p class="bv-nota"><?= modoConfiguracion()
                    ? '⚠ Modo configuración: captura la contraseña de AW en Administrador › Bases de datos y vuelve a iniciar sesión con tu usuario.'
                    : 'Los indicadores vienen de los presupuestos de ACRINEO: estatus, costo directo y precio de venta de la hoja, y las facturas y pedidos de Microsip ligados a cada presupuesto.' ?></p>
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
<script>window.ACRI_PRIMER_INGRESO = <?= !empty($_SESSION['primer_ingreso']) ? 'true' : 'false' ?>;</script>
<script src="<?= recurso('js/recorrido-pasos.js') ?>"></script>
<script src="<?= recurso('js/recorrido.js') ?>"></script>
</body>
</html>
