<?php
// Novedades del Sistema (Administrador › Novedades del Sistema).
// Cada cambio al sistema se anota aquí, el más reciente ARRIBA.
// tipo: nuevo = se agregó · mejora = se modificó o reforzó · correccion = se arregló una falla
return [
    [
        'fecha' => '2026-10-12',
        'cambios' => [
            ['nuevo',      'Obra: capturas en la web', 'Ya no se usa el sistema de escritorio: Nueva Orden de Trabajo (con partidas, liberar a producción, fin de producción y cancelar), Nueva Cotización para Facturación, Nuevo Documento de Cobro (efectivo, nota de cargo, anticipo), agregar artículos a la Explosión de Material (o importarlos del presupuesto) y corregir sus unidades y costo, Asignar Mano de Obra por empleado y horas, y Gastos Adicionales con importes y personal. Doble clic en un renglón lo abre.'],
            ['correccion', 'Obra: la imagen no se guardaba en línea', 'El sitio en línea respondía «HTTP 404» al guardar la imagen de la obra.'],
            ['mejora',     'Obra: tablas en la base en línea', 'Script Consultas/supabase_obras.sql con las tablas de órdenes, facturación, explosión, salidas, mano de obra, consumos, gastos y adjuntos.'],
            ['nuevo',  'Obra: Guardar y Modificar', 'Guardar escribe la obra, sus responsables, el % de gastos de administración y el avance en AW, y deja el presupuesto Aceptado. Modificar pide el permiso «Modificar obras» o la autorización de otro usuario.'],
            ['nuevo',  'Obra: estatus como en el sistema de escritorio', '(1) Ejecución solo desde Planificación, (2) Obra Terminada solo desde Ejecución (avance al 99 %), (3) Finalizar solo desde Obra Terminada: las órdenes en producción pasan a Fin de Producción, las no liberadas y las salidas pendientes se cancelan. Cancelar y Finalizar piden «Cerrar obras»; Modificar Estatus lo autoriza un administrador. Los movimientos de Microsip del cierre se siguen haciendo en el escritorio.'],
            ['nuevo',  'Obra: Imagen de Obra', 'Se carga con Examinar, con clic en el recuadro o arrastrando la foto; se guarda al momento y las fotos grandes se reducen solas. También se puede quitar.'],
            ['nuevo',  'Obra: Facturación con Microsip', 'La pestaña Facturación muestra las cotizaciones asignadas, los pagos y anticipos de AW y los folios de Easy-Glass del negocio de HubSpot, con su factura, cargos, créditos y saldo de Microsip (API de Easy-Glass). Clic en un renglón muestra pedidos, facturas, cobros y anticipos. «Asignar Cotización Microsip» busca el folio en Microsip y lo liga a la obra.'],
            ['nuevo',  'Obra: pestañas con datos reales', 'Órdenes de trabajo, explosión de material (con eliminar partidas), salidas de material (documentos / detalle y exportar a Excel), mano de obra, consumos y gastos adicionales se consultan al abrir su pestaña. Adjuntos: adjuntar, abrir y eliminar archivos.'],
            ['nuevo',  'Obra: pestaña 13-Conceptos/Tareas', 'Los conceptos/tareas del presupuesto de la obra con su clave, partidas, cantidad e importe, agrupados por Materia Prima, Mano de Obra y Gastos de Operación.'],
            ['nuevo',  'Presupuesto: conceptos de cálculo automático', 'Los conceptos marcados con cálculo automático en el catálogo se calculan solos con su porcentaje del subtotal; los Gastos de Operación administrativos se calculan sobre la materia prima y la mano de obra. Se muestran en azul y no se capturan.'],
            ['nuevo',  'Presupuesto: empleados y comisiones en Mano de Obra', 'Debajo de Mano de Obra se agregan empleados (sueldo diario × días) y tipos de empleado con su % de comisión sobre el subtotal. Sus totales llenan solos los renglones de mano de obra y comisiones.'],
            ['nuevo',  'Presupuesto: anexo de seguro en Gastos de Operación', 'Los conceptos de seguro se calculan como Subtotal × %1 × %2 y pasan solos a Gastos de Operación.'],
            ['nuevo',  'Presupuesto: Sugeridos relacionados', 'La pestaña Sugeridos relacionados permite ligar otros presupuestos por su folio.'],
            ['mejora', 'Presupuesto: reglas de estatus como en el sistema de escritorio', 'El estatus se guarda al momento y respeta las reglas: no se acepta ni se cancela un presupuesto Aceptado, Cancelado o Rechazado, y no se pasa a Seguimiento uno Cancelado o Rechazado. Sin el permiso, otro usuario puede autorizar el cambio y también «Modificar».'],
            ['mejora', 'Presupuesto: Eliminar solo presupuestos Cancelados', 'Para eliminar un presupuesto primero hay que cancelarlo.'],
            ['mejora', 'Presupuesto: correo y proyecto obligatorios', 'Para guardar se pide el correo del contacto de HubSpot y el nombre del proyecto. El % de utilidad inicial sale del parámetro de costos 101.'],
            ['nuevo',  'Administrador › Novedades del Sistema', 'Esta página: aquí se anota todo lo que se agrega, modifica o refuerza en el sistema.'],
            ['mejora', 'Concepto/Tarea: el Costo se puede capturar', 'El costo capturado a mano ya no se sobrescribe al sincronizar con su sección; si se borra, vuelve a tomarse en automático.'],
            ['mejora', 'Concepto/Tarea: Modificar y Guardar bajo el título', 'Los botones se movieron debajo del título del diálogo.'],
            ['nuevo',  'Botón Modificar en Ver Concepto/Tarea', 'En la vista de solo lectura, Modificar desbloquea los campos y habilita Guardar.'],
            ['nuevo',  'Registrar Obra con autorización de otro usuario', 'Si el usuario no tiene el permiso «Registrar obras», otro usuario de AW con ese permiso puede autorizarlo con su usuario y contraseña. La obra anota quién autorizó.'],
            ['mejora', 'Registrar Obra deja el presupuesto Aceptado', 'Pide confirmación y que el presupuesto esté guardado; no registra si está Cancelado o Rechazado. Un presupuesto Aceptado o Cancelado ya no se puede modificar.'],
        ],
    ],
    [
        'fecha' => '2026-10-09',
        'cambios' => [
            ['nuevo',      'Registrar Obra desde el presupuesto', 'Crea la obra, la liga al presupuesto, asigna al vendedor como responsable y la abre en Obras. El listado de presupuestos muestra la obra ligada.'],
            ['nuevo',      'Catalogos › Clientes', 'Ficha de Clientes de Easy-Glass: General, Direcciones, Condiciones Comerciales, Historial y Hubspot.'],
            ['nuevo',      'Fichas de Vendedores de Obra, Empleados y Tipos de Empleados', 'Botón Nuevo y ficha con alta, cambios y baja/eliminar.'],
            ['nuevo',      'Presupuesto: Modificar e impresión', 'Un presupuesto guardado se abre en solo lectura y «Modificar» lo habilita. Imprimir / Imprimir Detalle generan el Presupuesto por Proyecto sobre la hoja membretada.'],
            ['nuevo',      'Administrador › Hoja Membretada', 'Logo, título, código, revisión, firmas, pie y color, con vista previa.'],
            ['correccion', 'Menú Actualizar Estatus recortado', 'Los desplegables de la barra de herramientas ya no se cortan; se cierran con Esc y marcan el estatus actual con ✓.'],
            ['nuevo',      'Administrador › Estatus de Presupuestos', 'Catálogo de estatus con nombre, color, descripción y orden. El menú «Actualizar Estatus» toma sus opciones de ahí.'],
            ['nuevo',      'Administrador › Usuarios y Roles', 'Alta, edición, baja y permisos por rol más permisos sueltos.'],
            ['nuevo',      'Catálogos de conceptos', 'Materia Prima, Mano de Obra y Gastos de Operación: alta, edición, activar/desactivar y eliminar si no se usa. El presupuesto elige el concepto de esta lista.'],
            ['nuevo',      'Guardar presupuestos de obra', 'Guardar, Guardar y Cerrar, Duplicar y Eliminar ya escriben en la base de datos.'],
            ['nuevo',      'Conexión con la API de Easy-Glass', 'Vendedores desde Easy-Glass Boss; la llave se captura en Administrador › APIs y servicios.'],
            ['mejora',     'Sistema en la nube (Vercel + Supabase)', 'El sistema funciona en línea con sus imágenes y adjuntos en Supabase Storage, y sigue funcionando igual en el servidor local.'],
        ],
    ],
    [
        'fecha' => '2026-10-08',
        'cambios' => [
            ['nuevo', 'Inicio del proyecto AcriGlass', 'Primera versión del sistema.'],
        ],
    ],
];
