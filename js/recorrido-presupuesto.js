// Pasos del recorrido guiado de Presupuesto de Obra (botón Tour de la barra). El motor es js/recorrido.js;
// el formato de cada paso está explicado en js/recorrido-pasos.js.
(function () {
    function q(s) { return document.querySelector(s); }
    function boton(a) { return q('.tb[data-accion="' + a + '"]'); }
    function drop(a) { var b = boton(a); return b && (b.closest('.tb-drop') || b); }
    // Los pasos del documento necesitan la pestaña Documento a la vista
    function verDocumento() {
        var t = q('.doc-tab[data-vista="documento"]');
        if (t && !t.classList.contains('activo')) t.click();
    }

    window.RECORRIDO_OPCIONES = {
        id: 'presupuesto',
        usuario: document.body.dataset.usuario || window.ACRI_USUARIO || '',
        titulo: '¡Bienvenido al Presupuesto de Obra!',
        intro: 'Te mostraremos cómo está acomodado el presupuesto: la barra de botones, el encabezado, las secciones de conceptos y los totales.',
        volver: 'Podrás abrirlo nuevamente con el botón Tour de la barra de botones.',
        listo: '¡Listo! Puedes volver a consultar este recorrido con el botón Tour de la barra.'
    };

    window.RECORRIDO_PASOS = [
        {
            id: 'barra',
            elemento: 'header.toolbar',
            titulo: 'Barra de botones',
            texto: 'Aquí están todas las acciones del presupuesto. Si la ventana es angosta, desliza la barra hacia los lados para ver el resto.',
            posicion: 'abajo'
        },
        {
            id: 'guardar',
            elemento: function () { return [boton('guardar'), boton('guardar-cerrar')]; },
            titulo: 'Guardar',
            texto: 'Guardar conserva los cambios y deja el presupuesto abierto; Guardar y Cerrar lo guarda y cierra la pestaña.',
            posicion: 'abajo'
        },
        {
            id: 'modificar',
            elemento: function () { return [boton('modificar'), q('#modo')]; },
            titulo: 'Modificar',
            texto: 'Un presupuesto guardado se abre en solo lectura (🔒). Presiona Modificar para poder cambiarlo.',
            posicion: 'abajo'
        },
        {
            id: 'imprimir',
            elemento: function () { return drop('imprimir'); },
            titulo: 'Imprimir',
            texto: 'Elige el formato: Imprimir, Imprimir Detalle, la Propuesta para el cliente en PDF, los Precios Unitarios con o sin su análisis, o las versiones aprobadas.',
            posicion: 'abajo'
        },
        {
            id: 'duplicar',
            elemento: function () { return [boton('duplicar'), boton('prueba')]; },
            titulo: 'Duplicar y Prueba',
            texto: 'Duplicar deja en pantalla una copia como presupuesto nuevo; recibe su folio al guardarla. Prueba llena uno nuevo con datos de ejemplo y explica de dónde sale cada dato; no guarda nada.',
            posicion: 'abajo'
        },
        {
            id: 'estatus',
            elemento: function () { return [drop('estatus'), q('#estatus')]; },
            titulo: 'Estatus del presupuesto',
            texto: 'A la derecha ves el estatus actual. Con Actualizar Estatus lo cambias (por ejemplo, de Pendiente a Aprobado).',
            posicion: 'abajo'
        },
        {
            id: 'registrar',
            elemento: function () { return boton('registrar-obra'); },
            titulo: 'Registrar Obra',
            texto: 'Crea la Obra del presupuesto con los datos de la obra del encabezado; si ya tiene una, la abre. La obra se sigue en Documentos › Obras.',
            posicion: 'abajo'
        },
        {
            id: 'cerrar',
            elemento: function () { return [boton('cancelar'), boton('eliminar'), boton('cerrar')]; },
            titulo: 'Cancelar, Eliminar y Cerrar',
            texto: 'Cancelar cambia el presupuesto a Cancelado; solo un presupuesto cancelado se puede Eliminar. Ambos piden confirmación. Cerrar cierra la pestaña.',
            posicion: 'abajo'
        },
        {
            id: 'pestanas',
            elemento: '.doc-tabs',
            titulo: 'Documento y Sugeridos relacionados',
            texto: 'Documento es el presupuesto. En Sugeridos relacionados ligas por folio otros presupuestos de la misma obra.',
            posicion: 'abajo'
        },
        {
            id: 'cliente',
            elemento: '.enc-izq',
            titulo: 'Cliente',
            texto: 'Captura el cliente, su email, el proyecto y la ubicación. El botón junto al email busca el contacto en HubSpot.',
            posicion: 'derecha',
            preparar: verDocumento
        },
        {
            id: 'obra',
            elemento: '.enc-obra',
            titulo: 'Datos de la obra',
            texto: 'Nombre, contacto y dirección de la obra. Se usan al presionar Registrar Obra.',
            posicion: 'abajo',
            preparar: verDocumento
        },
        {
            id: 'folio',
            elemento: '.enc-der',
            titulo: 'Folio, fecha y vendedor',
            texto: 'El folio se asigna al guardar. Aquí también eliges el vendedor, ves la obra registrada y el Id de Negocio, que abre el negocio en HubSpot.',
            posicion: 'izquierda',
            preparar: verDocumento
        },
        {
            id: 'secciones',
            elemento: '.sec-tabs',
            titulo: 'Secciones del presupuesto',
            texto: 'Materia Prima, Mano de Obra, Gastos de Operación, Conceptos/Tareas y Análisis P.U. Haz clic en una para ver y capturar sus conceptos.',
            posicion: 'derecha',
            preparar: verDocumento
        },
        {
            id: 'conceptos',
            elemento: '.sec-cuerpo',
            titulo: 'Conceptos de la sección',
            texto: 'Cada renglón es un concepto con su importe. Presiona Ctrl + I para agregar uno nuevo. En Mano de Obra también capturas empleados y comisiones.',
            posicion: 'izquierda',
            preparar: verDocumento
        },
        {
            id: 'totales',
            elemento: '.pie',
            titulo: 'Totales',
            texto: 'Materia Prima + Mano de Obra dan el Costo Primo; se suman Gastos de Operación y Utilidad para el Subtotal, y con el IVA sale el Total. A la izquierda capturas la Descripción.',
            posicion: 'arriba',
            preparar: verDocumento
        },
        {
            id: 'tour',
            elemento: '#btnTour',
            titulo: 'Volver a ver el recorrido',
            texto: 'Cuando quieras repasar, presiona Tour para volver a ver esta guía.',
            posicion: 'abajo'
        }
    ];
})();
