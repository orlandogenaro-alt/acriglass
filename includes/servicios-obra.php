<?php
// Menú Servicios: reportes de las obras calculados con AW-Management y capturas propias de la obra
// (renta de maquinaria, cuentas por pagar, subcontratos, trámites, bitácora, pruebas, planos y gastos indirectos).
// Las capturas van a la tabla servicios_obra (Consultas/aw_servicios_obra.sql · Consultas/supabase_servicios_obra.sql):
// una sola tabla con columnas genéricas; cada apartado usa las suyas (ver 'campos').
//
// Cada apartado:
//   tipo      tabla = renglones calculados por el servidor · registro = captura en servicios_obra
//             resultados / gantt = vistas especiales de js/servicios-obra.js
//   filtro    anio = año (u obras en proceso) y obra · presupuesto = año de los presupuestos
//   cobranza  obra = el navegador suma la facturación de Microsip de cada obra (api/obras.php?accion=facturacion)
//             documentos = los renglones son los documentos de cobro con saldo
//   columnas  [encabezado, campo, formato]  formato: txt | fecha | dinero | num | pct | barra | estatus | dias | archivo
//   totales   campos que se suman en el pie y en los subtotales
//   agrupar   [campo, texto] opciones de «Agrupar por»
//   campos    (registro) [campo, etiqueta, tipo, opciones, obligatorio]
//             tipo: obra | txt | texto | fecha | num | dinero | pct | lista | combo | archivo
require_once __DIR__ . '/bd.php';
require_once __DIR__ . '/tareas.php';

const SO_ESTATUS_OBRA_ABIERTA = ['Planificacion', 'Ejecucion', 'Obra Terminada'];

// Columnas de servicios_obra que puede capturar un apartado y su tipo
const SO_COLUMNAS = [
    'obra_id' => 'int', 'fecha' => 'fecha', 'fecha_fin' => 'fecha', 'fecha_vence' => 'fecha',
    'folio' => 30, 'concepto' => 200, 'tipo' => 60, 'proveedor' => 150, 'responsable' => 150,
    'cantidad' => 'num', 'unidad' => 30, 'precio' => 'num', 'importe' => 'num', 'pagado' => 'num',
    'avance' => 'pct', 'estatus' => 30, 'revision' => 20, 'notas' => 2000,
];

const SO_ARCHIVO_MAX_MB = 4;   // Vercel no acepta peticiones de más de 4.5 MB
const SO_PROHIBIDAS = ['php', 'phtml', 'phar', 'pl', 'py', 'cgi', 'sh', 'exe', 'bat', 'cmd', 'com', 'msi', 'js', 'vbs',
                       'ps1', 'jar', 'scr', 'htaccess', 'html', 'htm', 'svg'];

function soModulos(): array
{
    $obra = ['Obra', 'obra', 'txt'];
    return [
        'resultados' => [
            'titulo' => 'Estado de resultados', 'tipo' => 'resultados', 'filtro' => 'anio', 'cobranza' => 'obra',
            'descripcion' => 'Ventas, costo directo, gastos indirectos y utilidad de una obra o de todas las del año, presupuestado contra real. ' .
                'Las ventas reales son lo facturado en Microsip sin IVA; el costo real son las salidas de material, la mano de obra y los gastos reales ' .
                'de AW, más la renta de maquinaria, los subcontratos y las cuentas por pagar capturadas en Servicios.',
        ],
        'explosion' => [
            'titulo' => 'Explosión insumos', 'tipo' => 'tabla', 'filtro' => 'anio',
            'descripcion' => 'Insumos de la explosión de material de las obras, consolidados por artículo, contra lo que ya se surtió con las salidas de material. ' .
                'Sirve para saber qué falta por surtir o comprar.',
            'columnas' => [['Clave', 'clave', 'txt'], ['Insumo', 'nombre', 'txt'], ['U.M.', 'um', 'txt'], ['Uds explosión', 'uds_exp', 'num'],
                           ['Costo explosión', 'costo_exp', 'dinero'], ['Uds surtidas', 'uds_sur', 'num'], ['Costo surtido', 'costo_sur', 'dinero'],
                           ['Por surtir', 'por_surtir', 'num'], ['% surtido', 'pct_surtido', 'barra'], ['Obras', 'obra', 'txt']],
            'totales' => ['costo_exp', 'costo_sur'],
            'agrupar' => [['um', 'Unidad de medida'], ['obra', 'Obra']],
        ],
        'ordenes' => [
            'titulo' => 'Órdenes por cobrar', 'tipo' => 'tabla', 'filtro' => 'anio', 'cobranza' => 'obra',
            'descripcion' => 'Órdenes de trabajo vigentes de las obras. Lo cobrado de cada obra (Microsip y AW, sin IVA) se aplica a sus órdenes ' .
                'de la más antigua a la más reciente; lo que no alcanza queda por cobrar.',
            'columnas' => [['Folio OT', 'folio', 'txt'], $obra, ['Cliente', 'cliente', 'txt'], ['Fecha', 'fecha', 'fecha'], ['Entrega', 'fecha_entrega', 'fecha'],
                           ['Estatus', 'estatus', 'estatus'], ['Importe', 'importe', 'dinero'], ['Cobrado', 'cobrado', 'dinero'], ['Por cobrar', 'por_cobrar', 'dinero'],
                           ['Días entregada', 'dias', 'dias'], ['Descripción', 'descripcion', 'txt']],
            'totales' => ['importe', 'cobrado', 'por_cobrar'],
            'agrupar' => [['obra', 'Obra'], ['cliente', 'Cliente'], ['estatus', 'Estatus']],
        ],
        'renta' => [
            'titulo' => 'Renta de maquinaria', 'tipo' => 'registro', 'filtro' => 'anio',
            'descripcion' => 'Equipo y maquinaria rentados para las obras (andamios, grúas, plataformas, generadores…). El importe entra al costo de la obra ' .
                'y el saldo aparece en Cuentas por pagar.',
            'columnas' => [$obra, ['Equipo', 'concepto', 'txt'], ['Arrendador', 'proveedor', 'txt'], ['Contrato', 'folio', 'txt'], ['Inicio', 'fecha', 'fecha'],
                           ['Fin', 'fecha_fin', 'fecha'], ['Periodos', 'cantidad', 'num'], ['Unidad', 'unidad', 'txt'], ['Tarifa', 'precio', 'dinero'],
                           ['Importe', 'importe', 'dinero'], ['Pagado', 'pagado', 'dinero'], ['Saldo', 'saldo', 'dinero'], ['Estatus', 'estatus', 'estatus']],
            'totales' => ['importe', 'pagado', 'saldo'],
            'agrupar' => [['obra', 'Obra'], ['proveedor', 'Arrendador'], ['estatus', 'Estatus']],
            'campos' => [['obra_id', 'Obra', 'obra', null, true], ['concepto', 'Equipo / maquinaria', 'txt', null, true],
                         ['proveedor', 'Arrendador', 'txt'], ['folio', 'Contrato / factura', 'txt'],
                         ['fecha', 'Inicio', 'fecha', null, true], ['fecha_fin', 'Fin', 'fecha'],
                         ['cantidad', 'Periodos', 'num'], ['unidad', 'Unidad', 'lista', ['Hora', 'Día', 'Semana', 'Mes', 'Servicio']],
                         ['precio', 'Tarifa', 'dinero'], ['importe', 'Importe', 'dinero'], ['pagado', 'Pagado', 'dinero'],
                         ['estatus', 'Estatus', 'lista', ['Rentada', 'Devuelta', 'Cancelada']], ['notas', 'Notas', 'texto']],
        ],
        'cxp' => [
            'titulo' => 'Cuentas por pagar', 'tipo' => 'registro', 'filtro' => 'anio', 'sin_obra' => true,
            'descripcion' => 'Facturas de proveedores por pagar (las que se capturan aquí) y, sin capturarlas otra vez, los saldos de la renta de maquinaria, ' .
                'subcontratos y gastos indirectos, más la mano de obra y los gastos de AW que aún no tienen importe real.',
            'columnas' => [['Origen', 'origen', 'txt'], $obra, ['Proveedor', 'proveedor', 'txt'], ['Factura', 'folio', 'txt'], ['Concepto', 'concepto', 'txt'],
                           ['Fecha', 'fecha', 'fecha'], ['Vence', 'fecha_vence', 'fecha'], ['Días vencida', 'dias', 'dias'], ['Importe', 'importe', 'dinero'],
                           ['Pagado', 'pagado', 'dinero'], ['Saldo', 'saldo', 'dinero'], ['Estatus', 'estatus', 'estatus']],
            'totales' => ['importe', 'pagado', 'saldo'],
            'agrupar' => [['proveedor', 'Proveedor'], ['obra', 'Obra'], ['origen', 'Origen'], ['estatus', 'Estatus']],
            'campos' => [['obra_id', 'Obra (vacía = gasto general)', 'obra'], ['proveedor', 'Proveedor', 'txt', null, true],
                         ['folio', 'Factura', 'txt'], ['concepto', 'Concepto', 'txt', null, true],
                         ['fecha', 'Fecha', 'fecha', null, true], ['fecha_vence', 'Vence', 'fecha'],
                         ['importe', 'Importe', 'dinero', null, true], ['pagado', 'Pagado', 'dinero'],
                         ['estatus', 'Estatus', 'lista', ['Vigente', 'Cancelada']], ['archivo', 'Factura (PDF / XML)', 'archivo'], ['notas', 'Notas', 'texto']],
        ],
        'mano' => [
            'titulo' => 'Mano de obra', 'tipo' => 'tabla', 'filtro' => 'anio',
            'descripcion' => 'Horas y costo de la mano de obra asignada a las obras, por empleado: lo asignado contra lo real (AW · Asignar Mano de Obra).',
            'columnas' => [['Fecha', 'fecha', 'fecha'], $obra, ['OT', 'ot', 'txt'], ['Empleado', 'nombre', 'txt'], ['Costo x hora', 'costo_x_hrs', 'dinero'],
                           ['Hrs asignadas', 'hrs', 'num'], ['Hrs reales', 'hrs_real', 'num'], ['Importe asignado', 'importe', 'dinero'],
                           ['Importe real', 'importe_real', 'dinero'], ['Diferencia', 'diferencia', 'dinero'], ['Estatus', 'estatus', 'estatus']],
            'totales' => ['hrs', 'hrs_real', 'importe', 'importe_real', 'diferencia'],
            'agrupar' => [['nombre', 'Empleado'], ['obra', 'Obra']],
        ],
        'presupuesto' => [
            'titulo' => 'Presupuesto', 'tipo' => 'tabla', 'filtro' => 'presupuesto',
            'descripcion' => 'Presupuestos de obra del año con su materia prima, mano de obra, gastos de operación, utilidad y total. ' .
                'Doble clic abre el presupuesto.',
            'columnas' => [['Folio', 'folio', 'txt'], ['Fecha', 'fecha', 'fecha'], ['Cliente', 'cliente', 'txt'], ['Proyecto', 'proyecto', 'txt'],
                           ['Vendedor', 'vendedor', 'txt'], ['Estatus', 'estatus', 'estatus'], ['Materia prima', 'mp', 'dinero'], ['Mano de obra', 'mo', 'dinero'],
                           ['Gastos operación', 'go', 'dinero'], ['Utilidad', 'utilidad', 'dinero'], ['% Utilidad', 'pct_utilidad', 'pct'],
                           ['Subtotal', 'subtotal', 'dinero'], ['Total', 'total', 'dinero'], $obra],
            'totales' => ['mp', 'mo', 'go', 'utilidad', 'subtotal', 'total'],
            'agrupar' => [['estatus', 'Estatus'], ['vendedor', 'Vendedor'], ['cliente', 'Cliente']],
        ],
        'gastos' => [
            'titulo' => 'Relación de gastos', 'tipo' => 'tabla', 'filtro' => 'anio',
            'descripcion' => 'Todos los gastos de las obras en una sola relación: gastos adicionales de AW, renta de maquinaria, subcontratos, ' .
                'cuentas por pagar y gastos indirectos capturados en Servicios.',
            'columnas' => [['Fecha', 'fecha', 'fecha'], $obra, ['Origen', 'origen', 'txt'], ['Concepto', 'concepto', 'txt'], ['Proveedor / detalle', 'proveedor', 'txt'],
                           ['Folio', 'folio', 'txt'], ['Presupuestado', 'presupuestado', 'dinero'], ['Importe', 'importe', 'dinero'], ['Pagado', 'pagado', 'dinero'],
                           ['Estatus', 'estatus', 'estatus']],
            'totales' => ['presupuestado', 'importe', 'pagado'],
            'agrupar' => [['origen', 'Origen'], ['concepto', 'Concepto'], ['obra', 'Obra'], ['proveedor', 'Proveedor']],
        ],
        'pruebas' => [
            'titulo' => 'Pruebas', 'tipo' => 'registro', 'filtro' => 'anio',
            'descripcion' => 'Pruebas de calidad en obra (hermeticidad, infiltración, carga de viento, anclajes, adherencia de silicón…) con su resultado y el reporte.',
            'columnas' => [['Fecha', 'fecha', 'fecha'], $obra, ['Prueba', 'tipo', 'txt'], ['Elemento probado', 'concepto', 'txt'], ['Laboratorio', 'proveedor', 'txt'],
                           ['Responsable', 'responsable', 'txt'], ['Resultado', 'estatus', 'estatus'], ['Costo', 'importe', 'dinero'], ['Reporte', 'archivo', 'archivo'], ['Notas', 'notas', 'txt']],
            'totales' => ['importe'],
            'agrupar' => [['obra', 'Obra'], ['tipo', 'Prueba'], ['estatus', 'Resultado']],
            'campos' => [['obra_id', 'Obra', 'obra', null, true], ['fecha', 'Fecha', 'fecha', null, true],
                         ['tipo', 'Prueba', 'combo', ['Hermeticidad al agua', 'Infiltración de aire', 'Carga de viento', 'Deflexión', 'Anclaje / extracción',
                                                      'Adherencia de silicón', 'Impacto', 'Otra'], true],
                         ['concepto', 'Elemento probado', 'txt', null, true], ['proveedor', 'Laboratorio / quien prueba', 'txt'], ['responsable', 'Responsable', 'txt'],
                         ['estatus', 'Resultado', 'lista', ['Pendiente', 'Aprobada', 'Rechazada', 'Repetir']], ['importe', 'Costo', 'dinero'],
                         ['archivo', 'Reporte', 'archivo'], ['notas', 'Observaciones', 'texto']],
        ],
        'planos' => [
            'titulo' => 'Planos', 'tipo' => 'registro', 'filtro' => 'anio',
            'descripcion' => 'Control de planos de cada obra: clave, revisión, estatus y el archivo vigente.',
            'columnas' => [$obra, ['Clave', 'folio', 'txt'], ['Plano', 'concepto', 'txt'], ['Disciplina', 'tipo', 'txt'], ['Rev.', 'revision', 'txt'],
                           ['Fecha', 'fecha', 'fecha'], ['Elaboró', 'responsable', 'txt'], ['Estatus', 'estatus', 'estatus'], ['Archivo', 'archivo', 'archivo']],
            'agrupar' => [['obra', 'Obra'], ['tipo', 'Disciplina'], ['estatus', 'Estatus']],
            'campos' => [['obra_id', 'Obra', 'obra', null, true], ['folio', 'Clave del plano', 'txt', null, true], ['concepto', 'Nombre del plano', 'txt', null, true],
                         ['tipo', 'Disciplina', 'combo', ['Arquitectónico', 'Fachada', 'Taller (shop drawing)', 'Estructural', 'Detalle', 'Instalaciones', 'Otro']],
                         ['revision', 'Revisión', 'txt'], ['fecha', 'Fecha', 'fecha', null, true], ['responsable', 'Elaboró', 'txt'],
                         ['estatus', 'Estatus', 'lista', ['En elaboración', 'En revisión', 'Aprobado', 'Para construcción', 'Obsoleto']],
                         ['archivo', 'Archivo (PDF / DWG / imagen)', 'archivo'], ['notas', 'Notas', 'texto']],
        ],
        'gantt' => [
            'titulo' => 'Gantt Obras', 'tipo' => 'gantt', 'filtro' => 'anio',
            'descripcion' => 'Calendario de las obras con su avance. Clic en una obra muestra sus Conceptos/Tareas; doble clic la abre.',
            'columnas' => [$obra, ['Estatus', 'estatus', 'estatus'], ['Inicio', 'fecha_ini', 'fecha'], ['Fin', 'fecha_fin', 'fecha'], ['Avance', 'avance', 'barra']],
        ],
        'tramites' => [
            'titulo' => 'Tramites', 'tipo' => 'registro', 'filtro' => 'anio',
            'descripcion' => 'Licencias, permisos, dictámenes, fianzas y demás trámites de las obras, con su vigencia. Los aprobados con la vigencia vencida se marcan como Vencido.',
            'columnas' => [$obra, ['Trámite', 'concepto', 'txt'], ['Tipo', 'tipo', 'txt'], ['Dependencia', 'proveedor', 'txt'], ['No. trámite', 'folio', 'txt'],
                           ['Solicitado', 'fecha', 'fecha'], ['Vigencia', 'fecha_vence', 'fecha'], ['Responsable', 'responsable', 'txt'], ['Costo', 'importe', 'dinero'],
                           ['Estatus', 'estatus', 'estatus'], ['Documento', 'archivo', 'archivo']],
            'totales' => ['importe'],
            'agrupar' => [['obra', 'Obra'], ['tipo', 'Tipo'], ['estatus', 'Estatus']],
            'campos' => [['obra_id', 'Obra', 'obra', null, true], ['concepto', 'Trámite', 'txt', null, true],
                         ['tipo', 'Tipo', 'combo', ['Licencia de construcción', 'Permiso', 'Dictamen', 'Aviso', 'Fianza', 'Seguro', 'Alta patronal / IMSS', 'Otro']],
                         ['proveedor', 'Dependencia', 'txt'], ['folio', 'No. de trámite', 'txt'], ['fecha', 'Solicitado', 'fecha', null, true],
                         ['fecha_vence', 'Vigencia', 'fecha'], ['responsable', 'Responsable', 'txt'], ['importe', 'Costo', 'dinero'],
                         ['estatus', 'Estatus', 'lista', ['En preparación', 'Ingresado', 'Aprobado', 'Rechazado', 'Cancelado']],
                         ['archivo', 'Documento', 'archivo'], ['notas', 'Notas', 'texto']],
        ],
        'ganancia' => [
            'titulo' => 'Ganancia por proyecto', 'tipo' => 'tabla', 'filtro' => 'anio', 'cobranza' => 'obra',
            'descripcion' => 'Venta, costo y utilidad de cada obra, contra la utilidad presupuestada. La venta es el presupuesto sin IVA; ' .
                'facturado, cobrado y por cobrar salen de Microsip (sin IVA). Doble clic abre la obra.',
            'columnas' => [$obra, ['Cliente', 'cliente', 'txt'], ['Estatus', 'estatus', 'estatus'], ['Venta', 'venta', 'dinero'], ['Costo directo', 'costo', 'dinero'],
                           ['Indirectos', 'indirectos', 'dinero'], ['Utilidad', 'utilidad', 'dinero'], ['Margen', 'margen', 'pct'],
                           ['Utilidad presup.', 'utilidad_pres', 'dinero'], ['Facturado', 'facturado', 'dinero'], ['Cobrado', 'cobrado', 'dinero'],
                           ['Por cobrar', 'por_cobrar', 'dinero']],
            'totales' => ['venta', 'costo', 'indirectos', 'utilidad', 'utilidad_pres', 'facturado', 'cobrado', 'por_cobrar'],
            'agrupar' => [['cliente', 'Cliente'], ['estatus', 'Estatus']],
        ],
        'bitacora' => [
            'titulo' => 'Bitácora de obra', 'tipo' => 'registro', 'filtro' => 'anio',
            'descripcion' => 'Notas diarias de cada obra: avances, incidencias, instrucciones, visitas y clima, con foto o archivo. El número de nota es consecutivo por obra.',
            'columnas' => [['Nota', 'folio', 'txt'], ['Fecha', 'fecha', 'fecha'], $obra, ['Tipo', 'tipo', 'estatus'], ['Asunto', 'concepto', 'txt'],
                           ['Descripción', 'notas', 'txt'], ['Responsable', 'responsable', 'txt'], ['Avance', 'avance', 'barra'], ['Archivo', 'archivo', 'archivo']],
            'agrupar' => [['obra', 'Obra'], ['tipo', 'Tipo'], ['responsable', 'Responsable']],
            'campos' => [['obra_id', 'Obra', 'obra', null, true], ['fecha', 'Fecha', 'fecha', null, true],
                         ['tipo', 'Tipo', 'lista', ['Avance', 'Incidencia', 'Instrucción', 'Visita', 'Clima', 'Seguridad', 'Entrega', 'Otro'], true],
                         ['concepto', 'Asunto', 'txt', null, true], ['notas', 'Descripción', 'texto'], ['responsable', 'Responsable', 'txt'],
                         ['avance', '% avance de la obra', 'pct'], ['archivo', 'Foto / archivo', 'archivo']],
        ],
        'subcontratos' => [
            'titulo' => 'Subcontratos', 'tipo' => 'registro', 'filtro' => 'anio',
            'descripcion' => 'Trabajos subcontratados por obra: alcance, importe contratado, avance y pagos. Lo devengado (importe × avance) entra al costo ' .
                'de la obra y el saldo aparece en Cuentas por pagar.',
            'columnas' => [$obra, ['Subcontratista', 'proveedor', 'txt'], ['Alcance', 'concepto', 'txt'], ['Contrato', 'folio', 'txt'], ['Inicio', 'fecha', 'fecha'],
                           ['Fin', 'fecha_fin', 'fecha'], ['Contratado', 'importe', 'dinero'], ['Avance', 'avance', 'barra'], ['Devengado', 'devengado', 'dinero'],
                           ['Pagado', 'pagado', 'dinero'], ['Saldo', 'saldo', 'dinero'], ['Estatus', 'estatus', 'estatus']],
            'totales' => ['importe', 'devengado', 'pagado', 'saldo'],
            'agrupar' => [['obra', 'Obra'], ['proveedor', 'Subcontratista'], ['estatus', 'Estatus']],
            'campos' => [['obra_id', 'Obra', 'obra', null, true], ['proveedor', 'Subcontratista', 'txt', null, true], ['concepto', 'Alcance', 'txt', null, true],
                         ['folio', 'Contrato', 'txt'], ['fecha', 'Inicio', 'fecha', null, true], ['fecha_fin', 'Fin', 'fecha'],
                         ['importe', 'Importe contratado', 'dinero', null, true], ['avance', '% avance', 'pct'], ['pagado', 'Pagado', 'dinero'],
                         ['estatus', 'Estatus', 'lista', ['Por iniciar', 'En proceso', 'Terminado', 'Cancelado']],
                         ['archivo', 'Contrato (archivo)', 'archivo'], ['notas', 'Notas', 'texto']],
        ],
        'inventario' => [
            'titulo' => 'Inventario de obras', 'tipo' => 'tabla', 'filtro' => 'anio',
            'descripcion' => 'Material que está en cada obra: lo surtido con las salidas de material menos lo consumido (Consumos de material en obra), ' .
                'valuado al costo promedio de las salidas.',
            'columnas' => [$obra, ['Clave', 'clave', 'txt'], ['Artículo', 'nombre', 'txt'], ['U.M.', 'um', 'txt'], ['Surtido', 'surtido', 'num'],
                           ['Consumido', 'consumido', 'num'], ['Existencia', 'existencia', 'num'], ['Costo prom.', 'costo', 'dinero'], ['Valor', 'valor', 'dinero']],
            'totales' => ['valor'],
            'agrupar' => [['obra', 'Obra'], ['nombre', 'Artículo']],
        ],
        'cxc' => [
            'titulo' => 'Cuentas por cobrar', 'tipo' => 'tabla', 'filtro' => 'anio', 'cobranza' => 'documentos',
            'descripcion' => 'Documentos de las obras con saldo: cotizaciones y folios de Easy-Glass cruzados con la facturación y cobranza de Microsip, ' .
                'y notas de cargo de AW, con su antigüedad.',
            'columnas' => [$obra, ['Folio', 'folio', 'txt'], ['Documento', 'tipo_docto', 'txt'], ['Cliente', 'cliente', 'txt'], ['Fecha', 'fecha', 'fecha'],
                           ['Factura', 'factura', 'txt'], ['Días', 'dias', 'num'], ['Antigüedad', 'antiguedad', 'estatus'], ['Cargos', 'cargos', 'dinero'],
                           ['Créditos', 'creditos', 'dinero'], ['Saldo', 'saldo', 'dinero']],
            'totales' => ['cargos', 'creditos', 'saldo'],
            'agrupar' => [['obra', 'Obra'], ['cliente', 'Cliente'], ['antiguedad', 'Antigüedad']],
        ],
        'actividades' => [
            'titulo' => 'Presupuesto por actividades', 'tipo' => 'tabla', 'filtro' => 'anio',
            'descripcion' => 'Conceptos/Tareas del presupuesto de cada obra con su monto, fechas y avance: lo devengado (monto × avance) y lo que falta por ejercer. ' .
                'Si la obra aún no tiene Conceptos/Tareas guardados se muestran los conceptos del presupuesto.',
            'columnas' => [$obra, ['Clave', 'clave', 'txt'], ['Actividad', 'nombre', 'txt'], ['Tipo', 'tipo', 'txt'], ['Responsable', 'responsable', 'txt'],
                           ['Inicio', 'ini', 'fecha'], ['Fin', 'fin', 'fecha'], ['Monto', 'monto', 'dinero'], ['Avance', 'avance', 'barra'],
                           ['Devengado', 'devengado', 'dinero'], ['Por ejercer', 'por_ejercer', 'dinero'], ['Estatus', 'estatus', 'estatus']],
            'totales' => ['monto', 'devengado', 'por_ejercer'],
            'agrupar' => [['obra', 'Obra'], ['agrupador', 'Sección'], ['responsable', 'Responsable'], ['estatus', 'Estatus']],
            'agrupar_inicial' => 'obra',
        ],
        'avance' => [
            'titulo' => 'Avance financiero', 'tipo' => 'tabla', 'filtro' => 'anio',
            'descripcion' => 'Por obra: % del presupuesto de costo ya ejercido contra el % de avance físico y el % del tiempo transcurrido. ' .
                'Una desviación negativa indica que se ha gastado más de lo que se ha avanzado.',
            'columnas' => [$obra, ['Estatus', 'estatus', 'estatus'], ['Inicio', 'fecha_ini', 'fecha'], ['Fin', 'fecha_fin', 'fecha'], ['Tiempo', 'pct_tiempo', 'barra'],
                           ['Presupuesto costo', 'presupuesto', 'dinero'], ['Ejercido', 'ejercido', 'dinero'], ['Por ejercer', 'por_ejercer', 'dinero'],
                           ['Avance financiero', 'pct_financiero', 'barra'], ['Avance físico', 'pct_fisico', 'barra'], ['Desviación', 'desviacion', 'pct']],
            'totales' => ['presupuesto', 'ejercido', 'por_ejercer'],
            'agrupar' => [['estatus', 'Estatus']],
        ],
        'indirectos' => [
            'titulo' => 'Gastos indirectos', 'tipo' => 'registro', 'filtro' => 'anio', 'sin_obra' => true,
            'descripcion' => 'Gastos que no son de materiales ni mano de obra: oficina de obra, fianzas, seguros, supervisión, vehículos, honorarios… ' .
                'Con obra entran a su Estado de resultados; sin obra son gastos generales del año.',
            'columnas' => [['Fecha', 'fecha', 'fecha'], $obra, ['Categoría', 'tipo', 'txt'], ['Concepto', 'concepto', 'txt'], ['Proveedor', 'proveedor', 'txt'],
                           ['Factura', 'folio', 'txt'], ['Importe', 'importe', 'dinero'], ['Pagado', 'pagado', 'dinero'], ['Saldo', 'saldo', 'dinero']],
            'totales' => ['importe', 'pagado', 'saldo'],
            'agrupar' => [['tipo', 'Categoría'], ['obra', 'Obra'], ['proveedor', 'Proveedor']],
            'campos' => [['obra_id', 'Obra (vacía = gasto general)', 'obra'], ['fecha', 'Fecha', 'fecha', null, true],
                         ['tipo', 'Categoría', 'combo', ['Oficina de obra', 'Fianzas', 'Seguros', 'Supervisión', 'Vehículos', 'Papelería', 'Comunicaciones',
                                                         'Honorarios', 'Seguridad e higiene', 'Otro'], true],
                         ['concepto', 'Concepto', 'txt', null, true], ['proveedor', 'Proveedor', 'txt'], ['folio', 'Factura', 'txt'],
                         ['importe', 'Importe', 'dinero', null, true], ['pagado', 'Pagado', 'dinero'], ['archivo', 'Comprobante', 'archivo'], ['notas', 'Notas', 'texto']],
        ],
    ];
}

function soModulo(string $id): array
{
    $m = soModulos()[$id] ?? null;
    if (!$m) throw new InvalidArgumentException('Apartado de Servicios no válido.');
    return $m + ['id' => $id, 'columnas' => [], 'totales' => [], 'agrupar' => [], 'campos' => [], 'cobranza' => null, 'sin_obra' => false];
}

// ---------- Utilidades ----------

$GLOBALS['so_avisos'] = [];

function soAviso(string $texto): void
{
    if (!in_array($texto, $GLOBALS['so_avisos'], true)) $GLOBALS['so_avisos'][] = $texto;
}

// Consulta que no detiene el reporte si una tabla no existe en esta base: deja un aviso
function soLeer(string $sql, array $p = []): array
{
    try {
        return bd_filas('AW', $sql, $p);
    } catch (Throwable $e) {
        soAviso(bd_mensaje_error($e));
        return [];
    }
}

function soEn(array $ids): string
{
    return '(' . implode(',', array_fill(0, max(1, count($ids)), '?')) . ')';
}

function soDisponible(): bool
{
    static $si = null;
    if ($si === null) {
        try {
            $si = bd_tiene_columna('AW', 'servicios_obra', 'servicio_obra_id');
        } catch (Throwable $e) {
            $si = false;
        }
    }
    return $si;
}

function soAvisoTabla(): string
{
    return 'Falta crear la tabla de Servicios: corre ' . (ACRI_NUBE ? 'Consultas/supabase_servicios_obra.sql en Supabase' : 'Consultas/aw_servicios_obra.sql en AW-Management') . '.';
}

function soNombreObra(array $o): string
{
    $nombre = trim((string) ($o['nom_obra'] ?? '')) ?: trim((string) ($o['proyecto'] ?? '')) ?: 'Obra ' . $o['obra_id'];
    return (!empty($o['folio']) ? 'F' . $o['folio'] . ' · ' : '') . $nombre;
}

function soDias(?string $desde, ?string $hasta = null): ?int
{
    if (!$desde || !preg_match('/^\d{4}-\d{2}-\d{2}/', $desde)) return null;
    $a = new DateTime(substr($desde, 0, 10));
    $b = new DateTime($hasta ?: date('Y-m-d'));
    return (int) $a->diff($b)->format('%r%a');
}

function soEstatusLetra($e, bool $orden = false): string
{
    $e = strtoupper(trim((string) $e));
    $mapa = $orden ? ['P' => 'Produccion', 'O' => 'Por liberar', 'F' => 'Fin Produccion', 'C' => 'Cancelado'] : ['C' => 'Cancelado', 'A' => 'Activo'];
    return $mapa[$e] ?? $e;
}

// ---------- Obras del filtro ----------

// Obras del año (por fecha de inicio, sin canceladas) o, con $anio = 0, las que siguen abiertas.
// Con $obra, solo esa obra (sea del año que sea).
function soObras(int $anio, int $obra = 0): array
{
    $avance = bd_tiene_columna('AW', 'reg_obras', 'avance_obra') ? 'a.avance_obra' : '0';
    $admin = bd_tiene_columna('AW', 'reg_obras', 'gasto_administrativo') ? 'a.gasto_administrativo' : '26';
    $sql = "select a.obra_id, a.sugerido_id, a.nom_obra, a.estatus, a.fecha_ini, a.fecha_fin, $avance as avance_obra,
                   $admin as gasto_administrativo, b.folio, b.cliente, b.proyecto
              from reg_obras a
              left join doctos_sugerido_obra b on b.docto_sugerido_obra_id = a.sugerido_id ";
    if ($obra) {
        $filas = bd_filas('AW', $sql . 'where a.obra_id = ?', [$obra]);
    } elseif ($anio) {
        $filas = bd_filas('AW', $sql . "where a.fecha_ini between ? and ? and a.estatus <> 'Cancelado' order by a.obra_id desc", ["$anio-01-01", "$anio-12-31"]);
    } else {
        $filas = bd_filas('AW', $sql . 'where a.estatus in ' . soEn(SO_ESTATUS_OBRA_ABIERTA) . ' order by a.obra_id desc', SO_ESTATUS_OBRA_ABIERTA);
    }
    $r = [];
    foreach ($filas as $o) {
        $o['obra'] = soNombreObra($o);
        $r[(int) $o['obra_id']] = $o;
    }
    return $r;
}

// Todas las obras no canceladas (para elegir la obra al capturar)
function soObrasCaptura(): array
{
    return array_map(fn($o) => ['id' => (int) $o['obra_id'], 'nombre' => soNombreObra($o), 'estatus' => $o['estatus']], bd_filas('AW',
        "select a.obra_id, a.nom_obra, a.estatus, b.folio, b.proyecto
           from reg_obras a left join doctos_sugerido_obra b on b.docto_sugerido_obra_id = a.sugerido_id
          where a.estatus <> 'Cancelado' order by a.obra_id desc"));
}

// Nombre de una obra que no está en el filtro (registros de otros años)
function soNombres(array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) return [];
    $r = [];
    foreach (soLeer('select a.obra_id, a.nom_obra, b.folio, b.proyecto from reg_obras a
                       left join doctos_sugerido_obra b on b.docto_sugerido_obra_id = a.sugerido_id where a.obra_id in ' . soEn($ids), $ids) as $o) {
        $r[(int) $o['obra_id']] = soNombreObra($o);
    }
    return $r;
}

// ---------- Costos por obra (Estado de resultados, Ganancia y Avance financiero) ----------

function soCostos(array $obras): array
{
    $c = [];
    foreach ($obras as $id => $o) {
        $c[$id] = array_fill_keys(['pres_mp', 'pres_mo', 'pres_go', 'venta', 'venta_iva', 'utilidad_pres', 'materiales', 'mano_obra',
                                   'mano_obra_asig', 'gastos', 'gastos_pres', 'renta', 'subcontratos', 'proveedores', 'indirectos', 'admin'], 0.0);
    }
    $ids = array_keys($obras);
    if (!$ids) return $c;
    $en = soEn($ids);

    foreach (soLeer("select o.obra_id, trim(d.tipo_concepto) as tipo, coalesce(sum(d.presupuesto), 0) as total
                       from doctos_sugerido_obra_det d
                       join reg_obras o on o.sugerido_id = d.docto_sugerido_obra_id
                      where o.obra_id in $en
                      group by o.obra_id, trim(d.tipo_concepto)", $ids) as $f) {
        $k = ['MP' => 'pres_mp', 'MO' => 'pres_mo', 'GO' => 'pres_go'][$f['tipo']] ?? null;
        if ($k) $c[(int) $f['obra_id']][$k] = (float) $f['total'];
    }
    foreach (soLeer("select o.obra_id, s.subtotal, s.total, s.utilidad_neta
                       from reg_obras o join doctos_sugerido_obra s on s.docto_sugerido_obra_id = o.sugerido_id
                      where o.obra_id in $en", $ids) as $f) {
        $id = (int) $f['obra_id'];
        $c[$id]['venta'] = (float) $f['subtotal'];
        $c[$id]['venta_iva'] = (float) $f['total'];
        $c[$id]['utilidad_pres'] = (float) $f['utilidad_neta'];
    }
    foreach (soLeer("select o.obra_id, coalesce(sum(d.costo_total), 0) as total
                       from doctos_solicitudes_det d
                       join dvd_solicitudes_material s on s.docto_solicitud_id = d.docto_solicitud_id
                       join doctos_orden_obra o on o.docto_orden_obra_id = s.docto_orden_obra_id
                      where o.obra_id in $en and trim(coalesce(s.estatus, '')) not in ('C', 'Cancelado')
                      group by o.obra_id", $ids) as $f) {
        $c[(int) $f['obra_id']]['materiales'] = (float) $f['total'];
    }
    foreach (soLeer("select obra_id, coalesce(sum(importe_mo), 0) as asignado, coalesce(sum(coalesce(imp_mo_real, 0)), 0) as imp_real
                       from empleados_asignados_a_obra
                      where obra_id in $en and trim(coalesce(estatus, '')) <> 'C'
                      group by obra_id", $ids) as $f) {
        $c[(int) $f['obra_id']]['mano_obra'] = (float) $f['imp_real'];
        $c[(int) $f['obra_id']]['mano_obra_asig'] = (float) $f['asignado'];
    }
    foreach (soLeer("select g.obra_id, g.importe,
                            (select coalesce(sum(d.imp_real), 0) from gastos_adicionales_obra_det d where d.gasto_adicional_id = g.gasto_adicional_id) as imp_real
                       from gastos_adicionales_obra g
                      where g.obra_id in $en and trim(coalesce(g.estatus, '')) <> 'C'", $ids) as $f) {
        $c[(int) $f['obra_id']]['gastos'] += (float) $f['imp_real'];
        $c[(int) $f['obra_id']]['gastos_pres'] += (float) $f['importe'];
    }
    if (soDisponible()) {
        foreach (soLeer("select obra_id, modulo, importe, pagado, avance from servicios_obra
                          where obra_id in $en and modulo in ('renta', 'subcontratos', 'cxp', 'indirectos')
                            and coalesce(estatus, '') not in ('Cancelada', 'Cancelado')", $ids) as $f) {
            $id = (int) $f['obra_id'];
            $imp = (float) $f['importe'];
            switch (trim($f['modulo'])) {
                case 'renta':        $c[$id]['renta'] += $imp; break;
                case 'subcontratos': $c[$id]['subcontratos'] += soDevengado($f); break;
                case 'cxp':          $c[$id]['proveedores'] += $imp; break;
                case 'indirectos':   $c[$id]['indirectos'] += $imp; break;
            }
        }
    }
    // Gastos de administración de la obra: su % sobre materiales + mano de obra reales (como la analítica del escritorio)
    foreach ($obras as $id => $o) {
        $pct = $o['gasto_administrativo'] === null ? 26 : (float) $o['gasto_administrativo'];
        $c[$id]['admin'] = round($pct / 100 * ($c[$id]['materiales'] + $c[$id]['mano_obra']), 2);
        $c[$id]['pct_admin'] = $pct;
    }
    return $c;
}

function soDevengado(array $f): float
{
    return max((float) $f['importe'] * min(100, (float) ($f['avance'] ?? 0)) / 100, (float) ($f['pagado'] ?? 0));
}

function soCostoDirecto(array $c): float
{
    return $c['materiales'] + $c['mano_obra'] + $c['gastos'] + $c['renta'] + $c['subcontratos'] + $c['proveedores'];
}

// Gastos indirectos sin obra (generales) del año
function soIndirectosGenerales(int $anio): float
{
    if (!soDisponible() || !$anio) return 0.0;
    return (float) (soLeer("select coalesce(sum(importe), 0) as total from servicios_obra
                             where modulo = 'indirectos' and coalesce(obra_id, 0) = 0 and fecha between ? and ?", ["$anio-01-01", "$anio-12-31"])[0]['total'] ?? 0);
}

// ---------- Reportes ----------

function soReporte(array $m, int $anio, array $obras, int $obraSel): array
{
    switch ($m['id']) {
        case 'resultados':   return soResultados($obraSel ? 0 : $anio, $obras);
        case 'explosion':    return ['filas' => soExplosion($obras)];
        case 'ordenes':      return ['filas' => soOrdenes($obras)];
        case 'mano':         return ['filas' => soMano($obras)];
        case 'presupuesto':  return ['filas' => soPresupuestos($anio)];
        case 'gastos':       return ['filas' => soGastos($anio, $obras, $obraSel)];
        case 'gantt':        return ['filas' => soGantt($obras)];
        case 'ganancia':     return ['filas' => soGanancia($obras)];
        case 'inventario':   return ['filas' => soInventario($obras)];
        case 'cxc':          return ['filas' => []];   // los arma el navegador con la facturación de cada obra
        case 'actividades':  return ['filas' => soActividades($obras)];
        case 'avance':       return ['filas' => soAvance($obras)];
    }
    return ['filas' => soRegistros($m, $anio, $obras, $obraSel)];
}

function soResultados(int $anio, array $obras): array
{
    $c = soCostos($obras);
    $t = array_fill_keys(['pres_mp', 'pres_mo', 'pres_go', 'venta', 'venta_iva', 'utilidad_pres', 'materiales', 'mano_obra', 'mano_obra_asig',
                          'gastos', 'gastos_pres', 'renta', 'subcontratos', 'proveedores', 'indirectos', 'admin'], 0.0);
    foreach ($c as $x) foreach ($x as $k => $v) $t[$k] = ($t[$k] ?? 0) + $v;
    return ['filas' => [], 'costos' => $t, 'por_obra' => $c, 'generales' => soIndirectosGenerales($anio)];
}

function soExplosion(array $obras): array
{
    $ids = array_keys($obras);
    if (!$ids) return [];
    $en = soEn($ids);
    $art = [];
    $clave = fn($c, $n) => mb_strtoupper(trim((string) ($c ?: $n)));
    $nuevo = fn($f, $c, $n, $um) => ['clave' => $c, 'nombre' => $n, 'um' => $um, 'uds_exp' => 0.0, 'costo_exp' => 0.0, 'uds_sur' => 0.0, 'costo_sur' => 0.0, 'obras' => []];
    foreach (soLeer("select obra_id, clave, nombre, um, uds, costo_tot from explocion_material_de_obra where obra_id in $en", $ids) as $f) {
        $k = $clave($f['clave'], $f['nombre']);
        $art[$k] = $art[$k] ?? $nuevo($f, $f['clave'], $f['nombre'], $f['um']);
        $art[$k]['uds_exp'] += (float) $f['uds'];
        $art[$k]['costo_exp'] += (float) $f['costo_tot'];
        $art[$k]['obras'][(int) $f['obra_id']] = true;
    }
    foreach (soLeer("select o.obra_id, d.clave_art, d.nom_art, d.unid_med, d.unidades, d.costo_total
                       from doctos_solicitudes_det d
                       join dvd_solicitudes_material s on s.docto_solicitud_id = d.docto_solicitud_id
                       join doctos_orden_obra o on o.docto_orden_obra_id = s.docto_orden_obra_id
                      where o.obra_id in $en and trim(coalesce(s.estatus, '')) not in ('C', 'Cancelado')", $ids) as $f) {
        $k = $clave($f['clave_art'], $f['nom_art']);
        $art[$k] = $art[$k] ?? $nuevo($f, $f['clave_art'], $f['nom_art'], $f['unid_med']);
        $art[$k]['uds_sur'] += (float) $f['unidades'];
        $art[$k]['costo_sur'] += (float) $f['costo_total'];
        $art[$k]['obras'][(int) $f['obra_id']] = true;
    }
    $filas = [];
    foreach ($art as $a) {
        $nombres = array_map(fn($id) => $obras[$id]['obra'] ?? "Obra $id", array_keys($a['obras']));
        $a['obra'] = count($nombres) === 1 ? $nombres[0] : count($nombres) . ' obras';
        $a['obra_id'] = count($nombres) === 1 ? array_key_first($a['obras']) : null;
        $a['por_surtir'] = round(max(0, $a['uds_exp'] - $a['uds_sur']), 3);
        $a['pct_surtido'] = $a['uds_exp'] > 0 ? min(100, round($a['uds_sur'] / $a['uds_exp'] * 100, 1)) : null;
        unset($a['obras']);
        $filas[] = $a;
    }
    usort($filas, fn($x, $y) => strcmp((string) $x['nombre'], (string) $y['nombre']));
    return $filas;
}

function soOrdenes(array $obras): array
{
    $ids = array_keys($obras);
    if (!$ids) return [];
    return array_map(function ($f) use ($obras) {
        $estatus = trim((string) $f['estatus']);
        return [
            'id' => $f['id'], 'obra_id' => (int) $f['obra_id'], 'obra' => $obras[(int) $f['obra_id']]['obra'] ?? '',
            'folio' => $f['folio'], 'cliente' => $f['nom_cliente'], 'fecha' => $f['fecha'], 'fecha_entrega' => $f['fecha_entrega'],
            'estatus' => soEstatusLetra($estatus, true), 'importe' => (float) $f['importe_neto'], 'descripcion' => $f['descripcion'],
            // Días desde la entrega de las órdenes terminadas
            'dias' => strtoupper($estatus) === 'F' ? soDias($f['fecha_entrega']) : null,
        ];
    }, soLeer("select docto_orden_obra_id as id, obra_id, folio, nom_cliente, fecha, fecha_entrega, estatus, importe_neto, descripcion
                 from doctos_orden_obra
                where obra_id in " . soEn($ids) . " and trim(coalesce(estatus, '')) <> 'C'
                order by obra_id, fecha, folio", $ids));
}

function soMano(array $obras): array
{
    $ids = array_keys($obras);
    if (!$ids) return [];
    return array_map(function ($f) use ($obras) {
        $costo = (float) $f['costo_x_hrs'];
        $imp = round($costo * (float) $f['hrs_trabajo'], 2);
        $real = round($costo * (float) $f['hrs_trabajo_real'], 2);
        return [
            'obra_id' => (int) $f['obra_id'], 'obra' => $obras[(int) $f['obra_id']]['obra'] ?? '', 'fecha' => $f['fecha'], 'ot' => $f['ot'],
            'nombre' => $f['nombre'], 'costo_x_hrs' => $costo, 'hrs' => (float) $f['hrs_trabajo'], 'hrs_real' => (float) $f['hrs_trabajo_real'],
            'importe' => $imp, 'importe_real' => $real, 'diferencia' => round($imp - $real, 2), 'estatus' => soEstatusLetra($f['estatus']),
        ];
    }, soLeer("select a.obra_id, a.fecha, a.estatus, o.folio as ot, d.nombre, d.costo_x_hrs, d.hrs_trabajo, d.hrs_trabajo_real
                 from empleados_asignados_a_obra_det d
                 join empleados_asignados_a_obra a on a.empleado_asignado_obra_id = d.empleado_asignado_obra_id
                 left join doctos_orden_obra o on o.docto_orden_obra_id = a.docto_orden_obra_id
                where a.obra_id in " . soEn($ids) . " and trim(coalesce(a.estatus, '')) <> 'C'
                order by a.fecha, d.nombre", $ids));
}

function soPresupuestos(int $anio): array
{
    $where = $anio ? 'a.fecha between ? and ?' : "a.estatus in ('Pendiente', 'Seguimiento')";
    $p = $anio ? ["$anio-01-01", "$anio-12-31"] : [];
    $filas = soLeer("select a.docto_sugerido_obra_id as id, a.folio, a.fecha, a.cliente, a.proyecto, a.estatus, a.subtotal, a.total,
                            a.utilidad_neta, a.utilidad_neta_por, a.obra_id, v.nombre as vendedor, o.nom_obra
                       from doctos_sugerido_obra a
                       left join vendedores_obras v on v.vendedor_obra_id = a.vendedor_obra_id
                       left join reg_obras o on o.obra_id = a.obra_id
                      where $where order by a.folio desc", $p);
    if (!$filas) return [];
    $det = [];
    foreach (soLeer("select d.docto_sugerido_obra_id as id, trim(d.tipo_concepto) as tipo, coalesce(sum(d.presupuesto), 0) as total
                       from doctos_sugerido_obra_det d
                       join doctos_sugerido_obra a on a.docto_sugerido_obra_id = d.docto_sugerido_obra_id
                      where $where
                      group by d.docto_sugerido_obra_id, trim(d.tipo_concepto)", $p) as $d) {
        $det[(int) $d['id']][strtolower($d['tipo'])] = (float) $d['total'];
    }
    return array_map(function ($f) use ($det) {
        $d = $det[(int) $f['id']] ?? [];
        $sub = (float) $f['subtotal'];
        return [
            'id' => (int) $f['id'], 'folio' => $f['folio'], 'fecha' => $f['fecha'], 'cliente' => $f['cliente'], 'proyecto' => $f['proyecto'],
            'vendedor' => $f['vendedor'], 'estatus' => $f['estatus'], 'mp' => $d['mp'] ?? 0, 'mo' => $d['mo'] ?? 0, 'go' => $d['go'] ?? 0,
            'utilidad' => (float) $f['utilidad_neta'], 'pct_utilidad' => $sub > 0 ? round((float) $f['utilidad_neta'] / $sub * 100, 1) : null,
            'subtotal' => $sub, 'total' => (float) $f['total'], 'obra_id' => (int) $f['obra_id'] ?: null, 'obra' => $f['nom_obra'],
        ];
    }, $filas);
}

function soGastos(int $anio, array $obras, int $obraSel): array
{
    $ids = array_keys($obras);
    $filas = [];
    if ($ids) {
        foreach (soLeer("select g.gasto_adicional_id as id, g.obra_id, g.fecha_creacion, g.estatus, g.notas, g.nom_unidad, cg.nombre as concepto,
                                d.imp_presupuestado, d.imp_real
                           from gastos_adicionales_obra_det d
                           join gastos_adicionales_obra g on g.gasto_adicional_id = d.gasto_adicional_id
                           left join conceptos_gastos_obra cg on cg.concepto_gasto_id = d.concepto_gasto_id
                          where g.obra_id in " . soEn($ids), $ids) as $f) {
            $filas[] = [
                'fecha' => substr((string) $f['fecha_creacion'], 0, 10), 'obra_id' => (int) $f['obra_id'], 'obra' => $obras[(int) $f['obra_id']]['obra'] ?? '',
                'origen' => 'Gastos adicionales (AW)', 'concepto' => $f['concepto'], 'proveedor' => trim(($f['nom_unidad'] ?? '') . ' ' . ($f['notas'] ?? '')),
                'folio' => $f['id'], 'presupuestado' => (float) $f['imp_presupuestado'], 'importe' => (float) $f['imp_real'], 'pagado' => (float) $f['imp_real'],
                'estatus' => soEstatusLetra($f['estatus']),
            ];
        }
    }
    if (soDisponible()) {
        $origen = ['renta' => 'Renta de maquinaria', 'subcontratos' => 'Subcontratos', 'cxp' => 'Proveedores', 'indirectos' => 'Gastos indirectos'];
        foreach (soRegistrosDe(array_keys($origen), $anio, $obras, $obraSel) as $f) {
            $imp = trim($f['modulo']) === 'subcontratos' ? soDevengado($f) : (float) $f['importe'];
            $filas[] = [
                'fecha' => $f['fecha'], 'obra_id' => (int) $f['obra_id'] ?: null, 'obra' => $f['obra'], 'origen' => $origen[trim($f['modulo'])],
                'concepto' => $f['tipo'] ? $f['tipo'] . ' · ' . $f['concepto'] : $f['concepto'], 'proveedor' => $f['proveedor'], 'folio' => $f['folio'],
                'presupuestado' => trim($f['modulo']) === 'subcontratos' ? (float) $f['importe'] : 0, 'importe' => $imp, 'pagado' => (float) $f['pagado'],
                'estatus' => $f['estatus'] ?: 'Vigente',
            ];
        }
    }
    usort($filas, fn($a, $b) => strcmp((string) $a['fecha'], (string) $b['fecha']));
    return $filas;
}

function soGantt(array $obras): array
{
    return array_values(array_map(fn($o) => [
        'obra_id' => (int) $o['obra_id'], 'sugerido_id' => (int) $o['sugerido_id'], 'obra' => $o['obra'], 'cliente' => $o['cliente'],
        'estatus' => $o['estatus'], 'fecha_ini' => $o['fecha_ini'], 'fecha_fin' => $o['fecha_fin'], 'avance' => (float) $o['avance_obra'],
    ], $obras));
}

function soGanancia(array $obras): array
{
    $c = soCostos($obras);
    $filas = [];
    foreach ($obras as $id => $o) {
        $x = $c[$id];
        $costo = soCostoDirecto($x);
        $ind = $x['admin'] + $x['indirectos'];
        $filas[] = [
            'obra_id' => $id, 'obra' => $o['obra'], 'cliente' => $o['cliente'], 'estatus' => $o['estatus'], 'venta' => $x['venta'],
            'costo' => round($costo, 2), 'indirectos' => round($ind, 2), 'utilidad' => round($x['venta'] - $costo - $ind, 2),
            'margen' => $x['venta'] > 0 ? round(($x['venta'] - $costo - $ind) / $x['venta'] * 100, 1) : null,
            'utilidad_pres' => $x['utilidad_pres'], 'facturado' => null, 'cobrado' => null, 'por_cobrar' => null,
        ];
    }
    return $filas;
}

function soInventario(array $obras): array
{
    $ids = array_keys($obras);
    if (!$ids) return [];
    $en = soEn($ids);
    $inv = [];
    foreach (soLeer("select o.obra_id, d.clave_art, d.nom_art, d.unid_med, d.unidades, d.costo_total
                       from doctos_solicitudes_det d
                       join dvd_solicitudes_material s on s.docto_solicitud_id = d.docto_solicitud_id
                       join doctos_orden_obra o on o.docto_orden_obra_id = s.docto_orden_obra_id
                      where o.obra_id in $en and trim(coalesce(s.estatus, '')) not in ('C', 'Cancelado')", $ids) as $f) {
        $k = $f['obra_id'] . '|' . mb_strtoupper(trim((string) ($f['clave_art'] ?: $f['nom_art'])));
        $inv[$k] = $inv[$k] ?? ['obra_id' => (int) $f['obra_id'], 'clave' => $f['clave_art'], 'nombre' => $f['nom_art'], 'um' => $f['unid_med'],
                                'surtido' => 0.0, 'consumido' => 0.0, 'importe' => 0.0];
        $inv[$k]['surtido'] += (float) $f['unidades'];
        $inv[$k]['importe'] += (float) $f['costo_total'];
    }
    foreach (soLeer("select c.obra_id, d.clave, d.descripcion, d.unimed, d.uds_consumo
                       from consumos_material_en_obra_det d
                       join consumos_metrial_en_obra c on c.consumo_material_obra_id = d.consumo_meterial_obra_id
                      where c.obra_id in $en and trim(coalesce(c.estatus, '')) not in ('C', 'Cancelado')", $ids) as $f) {
        $k = $f['obra_id'] . '|' . mb_strtoupper(trim((string) ($f['clave'] ?: $f['descripcion'])));
        $inv[$k] = $inv[$k] ?? ['obra_id' => (int) $f['obra_id'], 'clave' => $f['clave'], 'nombre' => $f['descripcion'], 'um' => $f['unimed'],
                                'surtido' => 0.0, 'consumido' => 0.0, 'importe' => 0.0];
        $inv[$k]['consumido'] += (float) $f['uds_consumo'];
    }
    $filas = [];
    foreach ($inv as $a) {
        $a['obra'] = $obras[$a['obra_id']]['obra'] ?? '';
        $a['existencia'] = round($a['surtido'] - $a['consumido'], 3);
        $a['costo'] = $a['surtido'] > 0 ? round($a['importe'] / $a['surtido'], 2) : 0;
        $a['valor'] = round(max(0, $a['existencia']) * $a['costo'], 2);
        unset($a['importe']);
        $filas[] = $a;
    }
    usort($filas, fn($x, $y) => [$x['obra'], $x['nombre']] <=> [$y['obra'], $y['nombre']]);
    return $filas;
}

function soActividades(array $obras): array
{
    $filas = [];
    $hayTareas = false;
    try {
        $hayTareas = tareasDisponibles();
    } catch (Throwable $e) {}
    if (!$hayTareas) soAviso(tareasAviso());
    $hoy = date('Y-m-d');
    foreach ($obras as $id => $o) {
        $sug = (int) $o['sugerido_id'];
        if (!$sug) continue;
        $tareas = [];
        if ($hayTareas) {
            try {
                $tareas = array_values(array_filter(leerTareas($sug), fn($t) => ($t['tipo'] ?? '') !== 'Excluido'));
            } catch (Throwable $e) {
                soAviso('Conceptos/Tareas: ' . bd_mensaje_error($e));
            }
        }
        if ($tareas) {
            $nivel = [];
            foreach ($tareas as $t) {
                $padre = (int) $t['padre_uid'];
                $nivel[(int) $t['uid']] = $padre ? ($nivel[$padre] ?? 0) + 1 : 0;
                $avance = min(100, max(0, (float) $t['avance']));
                $monto = (float) $t['monto'];
                $fin = substr((string) $t['fin_real'], 0, 10);
                $estatus = $t['estatus'] ?: ($avance >= 100 ? 'Terminada' : ($avance > 0 ? 'En proceso' : 'Pendiente'));
                if ($avance < 100 && $fin && $fin < $hoy) $estatus = 'Atrasada';
                $filas[] = [
                    'obra_id' => $id, 'obra' => $o['obra'], 'clave' => $t['clave'], 'nivel' => $nivel[(int) $t['uid']],
                    'nombre' => $t['nombre'], 'tipo' => $t['tipo'], 'agrupador' => $t['agrupador'] ?: 'Sin sección', 'responsable' => $t['responsable'],
                    'ini' => substr((string) $t['ini_real'], 0, 10), 'fin' => $fin, 'monto' => $monto, 'avance' => $avance,
                    // Solo las tareas principales suman (las subtareas ya están dentro del monto de su tarea)
                    'devengado' => round($monto * $avance / 100, 2), 'por_ejercer' => round($monto * (100 - $avance) / 100, 2),
                    'estatus' => $estatus, 'suma' => $padre ? false : true,
                ];
            }
            continue;
        }
        // Sin Conceptos/Tareas guardados: los conceptos del presupuesto, con el avance de la obra
        $av = (float) $o['avance_obra'];
        foreach (soLeer("select trim(d.tipo_concepto) as tipo, d.presupuesto, coalesce(cmp.descripcion, cmo.descripcion, cgo.descripcion) as concepto
                           from doctos_sugerido_obra_det d
                           left join conceptos_mat_prima_obra cmp on trim(d.tipo_concepto) = 'MP' and cmp.concepto_mat_prima_id = d.concepto_id
                           left join conceptos_mano_obra cmo on trim(d.tipo_concepto) = 'MO' and cmo.concepto_mano_obra_id = d.concepto_id
                           left join conceptos_gas_operacion_obra cgo on trim(d.tipo_concepto) = 'GO' and cgo.concepto_gas_operacion_obra_id = d.concepto_id
                          where d.docto_sugerido_obra_id = ? order by d.docto_sugerido_obra_det_id", [$sug]) as $d) {
            $monto = (float) $d['presupuesto'];
            if (!$monto) continue;
            $filas[] = [
                'obra_id' => $id, 'obra' => $o['obra'], 'clave' => $d['tipo'], 'nivel' => 0, 'nombre' => $d['concepto'], 'tipo' => 'Concepto',
                'agrupador' => ['MP' => 'Materia Prima', 'MO' => 'Mano de Obra', 'GO' => 'Gastos de Operación'][$d['tipo']] ?? $d['tipo'],
                'responsable' => '', 'ini' => $o['fecha_ini'], 'fin' => $o['fecha_fin'], 'monto' => $monto, 'avance' => $av,
                'devengado' => round($monto * $av / 100, 2), 'por_ejercer' => round($monto * (100 - $av) / 100, 2),
                'estatus' => 'Sin tareas', 'suma' => true,
            ];
        }
    }
    return $filas;
}

function soAvance(array $obras): array
{
    $c = soCostos($obras);
    $hoy = date('Y-m-d');
    $filas = [];
    foreach ($obras as $id => $o) {
        $x = $c[$id];
        $pres = $x['pres_mp'] + $x['pres_mo'] + $x['pres_go'];
        $ejer = soCostoDirecto($x) + $x['admin'] + $x['indirectos'];
        $tiempo = null;
        $ini = substr((string) $o['fecha_ini'], 0, 10);
        $fin = substr((string) $o['fecha_fin'], 0, 10);
        if ($ini && $fin && $fin > $ini) $tiempo = max(0, min(100, round(soDias($ini, min($hoy, $fin)) / soDias($ini, $fin) * 100, 1)));
        $fin_pct = $pres > 0 ? round($ejer / $pres * 100, 1) : null;
        $fis = (float) $o['avance_obra'];
        $filas[] = [
            'obra_id' => $id, 'obra' => $o['obra'], 'estatus' => $o['estatus'], 'fecha_ini' => $ini, 'fecha_fin' => $fin, 'pct_tiempo' => $tiempo,
            'presupuesto' => round($pres, 2), 'ejercido' => round($ejer, 2), 'por_ejercer' => round($pres - $ejer, 2),
            'pct_financiero' => $fin_pct, 'pct_fisico' => $fis, 'desviacion' => $fin_pct === null ? null : round($fis - $fin_pct, 1),
        ];
    }
    return $filas;
}

// ---------- Registros (servicios_obra) ----------

const SO_SELECT = 'servicio_obra_id as id, modulo, obra_id, fecha, fecha_fin, fecha_vence, folio, concepto, tipo, proveedor, responsable,
                   cantidad, unidad, precio, importe, pagado, avance, estatus, revision, notas, nombre_archivo,
                   case when archivo is null then 0 else 1 end as tiene_archivo, usuario_creacion, fecha_mod, usuario_mod';

// Registros de uno o varios apartados: con una sola obra en el filtro, todos los de esa obra; con el año, los de ese año
// (de cualquier obra, también sin obra); con obras en proceso, los de esas obras y los generales.
function soRegistrosDe(array $modulos, int $anio, array $obras, int $obraSel): array
{
    if (!soDisponible()) return [];
    $p = $modulos;
    $where = 'modulo in ' . soEn($modulos);
    if ($obraSel) {
        $where .= ' and obra_id = ?';
        $p[] = $obraSel;
    } elseif ($anio) {
        $where .= ' and fecha between ? and ?';
        array_push($p, "$anio-01-01", "$anio-12-31");
    } else {
        $ids = array_keys($obras);
        $where .= ' and (coalesce(obra_id, 0) = 0' . ($ids ? ' or obra_id in ' . soEn($ids) : '') . ')';
        $p = array_merge($p, $ids);
    }
    $filas = soLeer('select ' . SO_SELECT . " from servicios_obra where $where order by fecha, servicio_obra_id", $p);
    $faltan = array_diff(array_unique(array_map(fn($f) => (int) $f['obra_id'], $filas)), array_keys($obras), [0]);
    $nombres = soNombres($faltan);
    foreach ($filas as &$f) {
        $id = (int) $f['obra_id'];
        $f['obra'] = $id ? ($obras[$id]['obra'] ?? $nombres[$id] ?? "Obra $id") : 'General';
    }
    unset($f);
    return $filas;
}

function soRegistros(array $m, int $anio, array $obras, int $obraSel): array
{
    if (!soDisponible()) {
        soAviso(soAvisoTabla());
        return $m['id'] === 'cxp' ? soPorPagarAW($obras) : [];
    }
    $hoy = date('Y-m-d');
    $filas = array_map(function ($f) use ($m, $hoy) {
        foreach (['cantidad', 'precio', 'importe', 'pagado', 'avance'] as $k) $f[$k] = (float) $f[$k];
        $f['saldo'] = round($f['importe'] - $f['pagado'], 2);
        $f['archivo'] = (int) $f['tiene_archivo'] ? $f['nombre_archivo'] : null;
        $f['editable'] = true;
        $f['estatus_captura'] = $f['estatus'];   // el que se edita; el que se muestra puede ser calculado (Vencido, Pagada…)
        switch ($m['id']) {
            case 'subcontratos':
                $f['devengado'] = round(soDevengado($f), 2);
                break;
            case 'tramites':
                if ($f['estatus'] === 'Aprobado' && $f['fecha_vence'] && substr($f['fecha_vence'], 0, 10) < $hoy) $f['estatus'] = 'Vencido';
                break;
            case 'cxp':
                $f['origen'] = 'Proveedores';
                $f = soEstatusPago($f, $hoy);
                break;
        }
        return $f;
    }, soRegistrosDe([$m['id']], $anio, $obras, $obraSel));

    if ($m['id'] === 'cxp') $filas = array_merge($filas, soPorPagarOtros($anio, $obras, $obraSel, $hoy), soPorPagarAW($obras));
    return $filas;
}

function soEstatusPago(array $f, string $hoy): array
{
    if (in_array($f['estatus'], ['Cancelada', 'Cancelado'], true)) { $f['saldo'] = 0; $f['dias'] = null; return $f; }
    $vence = substr((string) ($f['fecha_vence'] ?: ''), 0, 10);
    $f['dias'] = $vence && $f['saldo'] > 0 ? max(0, soDias($vence, $hoy)) : null;
    $f['estatus'] = $f['saldo'] <= 0.005 ? 'Pagada' : ($vence && $vence < $hoy ? 'Vencida' : ($f['pagado'] > 0 ? 'Parcial' : 'Pendiente'));
    return $f;
}

// Saldos de renta, subcontratos e indirectos (se pagan desde su propio apartado)
function soPorPagarOtros(int $anio, array $obras, int $obraSel, string $hoy): array
{
    $origen = ['renta' => 'Renta de maquinaria', 'subcontratos' => 'Subcontratos', 'indirectos' => 'Gastos indirectos'];
    $filas = [];
    foreach (soRegistrosDe(array_keys($origen), $anio, $obras, $obraSel) as $f) {
        if (in_array($f['estatus'], ['Cancelada', 'Cancelado'], true)) continue;
        $mod = trim($f['modulo']);
        $imp = $mod === 'subcontratos' ? soDevengado($f) : (float) $f['importe'];
        $f['importe'] = round($imp, 2);
        $f['pagado'] = (float) $f['pagado'];
        $f['saldo'] = round($imp - $f['pagado'], 2);
        if ($f['saldo'] <= 0.005) continue;
        $f['origen'] = $origen[$mod];
        $f['editable'] = false;
        $f['modulo_origen'] = $mod;
        $f['archivo'] = null;
        $filas[] = soEstatusPago($f, $hoy);
    }
    return $filas;
}

// Mano de obra y gastos de AW capturados sin importe real todavía
function soPorPagarAW(array $obras): array
{
    $ids = array_keys($obras);
    if (!$ids) return [];
    $en = soEn($ids);
    $filas = [];
    foreach (soLeer("select e.obra_id, e.fecha, e.nom_unidad, e.notas, e.importe_mo, coalesce(e.imp_mo_real, 0) as imp_real, o.folio
                       from empleados_asignados_a_obra e
                       left join doctos_orden_obra o on o.docto_orden_obra_id = e.docto_orden_obra_id
                      where e.obra_id in $en and trim(coalesce(e.estatus, '')) <> 'C'", $ids) as $f) {
        $saldo = round((float) $f['importe_mo'] - (float) $f['imp_real'], 2);
        if ($saldo <= 0.005) continue;
        $filas[] = ['origen' => 'Mano de obra (AW)', 'obra_id' => (int) $f['obra_id'], 'obra' => $obras[(int) $f['obra_id']]['obra'],
                    'proveedor' => 'Personal de obra', 'folio' => $f['folio'] ? 'OT ' . $f['folio'] : '', 'concepto' => trim(($f['nom_unidad'] ?? '') . ' ' . ($f['notas'] ?? '')) ?: 'Mano de obra asignada',
                    'fecha' => $f['fecha'], 'fecha_vence' => null, 'dias' => null, 'importe' => (float) $f['importe_mo'], 'pagado' => (float) $f['imp_real'],
                    'saldo' => $saldo, 'estatus' => (float) $f['imp_real'] > 0 ? 'Parcial' : 'Pendiente', 'editable' => false];
    }
    foreach (soLeer("select g.obra_id, g.fecha_creacion, g.importe, g.notas, cg.nombre,
                            (select coalesce(sum(d.imp_real), 0) from gastos_adicionales_obra_det d where d.gasto_adicional_id = g.gasto_adicional_id) as imp_real
                       from gastos_adicionales_obra g
                       left join conceptos_gastos_obra cg on cg.concepto_gasto_id = g.concepto_gasto_id
                      where g.obra_id in $en and trim(coalesce(g.estatus, '')) <> 'C'", $ids) as $f) {
        $saldo = round((float) $f['importe'] - (float) $f['imp_real'], 2);
        if ($saldo <= 0.005) continue;
        $filas[] = ['origen' => 'Gastos adicionales (AW)', 'obra_id' => (int) $f['obra_id'], 'obra' => $obras[(int) $f['obra_id']]['obra'],
                    'proveedor' => $f['notas'] ?: '', 'folio' => '', 'concepto' => $f['nombre'] ?: 'Gasto adicional',
                    'fecha' => substr((string) $f['fecha_creacion'], 0, 10), 'fecha_vence' => null, 'dias' => null, 'importe' => (float) $f['importe'],
                    'pagado' => (float) $f['imp_real'], 'saldo' => $saldo, 'estatus' => (float) $f['imp_real'] > 0 ? 'Parcial' : 'Pendiente', 'editable' => false];
    }
    return $filas;
}

// Siguiente número de nota de la bitácora de una obra
function soSiguienteNota(int $obra): string
{
    $n = 0;
    foreach (bd_filas('AW', "select folio from servicios_obra where modulo = 'bitacora' and obra_id = ?", [$obra]) as $f) {
        $n = max($n, (int) $f['folio']);
    }
    return (string) ($n + 1);
}
