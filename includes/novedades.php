<?php
// Novedades del Sistema (Administrador › Novedades del Sistema).
// Cada cambio al sistema se anota aquí, el más reciente ARRIBA.
// tipo: nuevo = se agregó · mejora = se modificó o reforzó · correccion = se arregló una falla
return [
    [
        'fecha' => '2026-10-12',
        'cambios' => [
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
