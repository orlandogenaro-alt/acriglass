// Pasos del recorrido guiado de la Obra (botón Tour de la barra). El motor es js/recorrido.js;
// el formato de cada paso está explicado en js/recorrido-pasos.js.
(function () {
    function q(s) { return document.querySelector(s); }
    function boton(a) { return q('header.toolbar .tb[data-accion="' + a + '"]'); }
    // Los pasos de 1-Datos necesitan esa pestaña a la vista
    function verDatos() {
        var t = q('.ob-tabs .doc-tab[data-vista="datos"]');
        if (t && !t.classList.contains('activo')) t.click();
    }

    window.RECORRIDO_OPCIONES = {
        id: 'obra',
        usuario: document.body.dataset.usuario || '',
        titulo: '¡Bienvenido a la Obra!',
        intro: 'Te mostraremos cómo está acomodada la obra: la barra de botones, los pasos de su estatus, las pestañas y los datos generales con su avance.',
        volver: 'Podrás abrirlo nuevamente con el botón Tour de la barra de botones.',
        listo: '¡Listo! Puedes volver a consultar este recorrido con el botón Tour de la barra.'
    };

    window.RECORRIDO_PASOS = [
        {
            id: 'barra',
            elemento: 'header.toolbar',
            titulo: 'Barra de botones',
            texto: 'Aquí están todas las acciones de la obra. Si la ventana es angosta, desliza la barra hacia los lados para ver el resto.',
            posicion: 'abajo'
        },
        {
            id: 'guardar',
            elemento: function () { return [boton('guardar'), boton('guardar-cerrar')]; },
            titulo: 'Guardar',
            texto: 'Guardar conserva los cambios; Guardar y Cerrar además cierra la pestaña. En una obra ya guardada se activan al presionar Modificar.',
            posicion: 'abajo'
        },
        {
            id: 'contrato',
            elemento: function () { return [boton('contrato'), boton('estimaciones')]; },
            titulo: 'Contrato y Estimaciones',
            texto: 'Contrato abre en otra pestaña el contrato con el cliente, sus convenios, aditivas y órdenes de cambio. Estimaciones abre el catálogo del contrato, el anticipo y las estimaciones de avance.',
            posicion: 'abajo'
        },
        {
            id: 'imprimir',
            elemento: function () { return [boton('imprimir'), boton('imprimir-detalle')]; },
            titulo: 'Imprimir la analítica',
            texto: 'Imprimir saca la analítica de la obra: presupuestado contra real, utilidad y facturación. Imprimir Detalle agrega los artículos, la mano de obra, las comisiones y los gastos.',
            posicion: 'abajo'
        },
        {
            id: 'pasos',
            elemento: function () { return [boton('ejecucion'), boton('terminada'), boton('finalizar')]; },
            titulo: 'Pasos de la obra',
            texto: 'La obra avanza en orden: (1) de Planificación a Ejecución, (2) a Obra Terminada y (3) Finalizar Obra para cerrarla. El paso en que va se ve marcado.',
            posicion: 'abajo'
        },
        {
            id: 'modificar',
            elemento: function () { return [boton('modificar'), boton('estatus') && boton('estatus').closest('.tb-drop')]; },
            titulo: 'Modificar y Modificar Estatus',
            texto: 'La obra se abre en solo lectura: presiona Modificar para cambiar sus datos. Modificar Estatus la cambia a Planificación, Ejecución u Obra Terminada.',
            posicion: 'abajo'
        },
        {
            id: 'cerrar',
            elemento: function () { return [boton('cancelar'), boton('cerrar')]; },
            titulo: 'Cancelar y Cerrar',
            texto: 'Cancelar cancela la obra (pide confirmación). Cerrar cierra la pestaña; si hay cambios sin guardar te avisa.',
            posicion: 'abajo'
        },
        {
            id: 'pestanas',
            elemento: '.ob-tabs',
            titulo: 'Pestañas de la obra',
            texto: '1-Datos es la ficha de la obra. De la 2 a la 13 ves su facturación, órdenes de trabajo, material, mano de obra, consumibles, gastos, adjuntos, Microsip, parámetros, HubSpot / Easy-Glass y conceptos/tareas. Desliza la barra para ver todas.',
            posicion: 'abajo'
        },
        {
            id: 'presupuesto',
            elemento: '.ob-presupuesto',
            titulo: 'Presupuesto de Obra',
            texto: 'El presupuesto del que salió la obra. Haz doble clic en el Id para abrirlo.',
            posicion: 'derecha',
            preparar: verDatos
        },
        {
            id: 'datos',
            elemento: function () { return [q('#nombreObra'), q('#direccion'), q('#contacto')].map(function (x) { return x && x.closest('.ob-campo'); }); },
            titulo: 'Datos de la obra',
            texto: 'Nombre, dirección y contacto de la obra. Para cambiarlos presiona Modificar.',
            posicion: 'derecha',
            preparar: verDatos
        },
        {
            id: 'responsables',
            elemento: function () { return [q('#responsable') && q('#responsable').closest('.ob-campo'), q('.ob-grid-resp')]; },
            titulo: 'Responsables de obra',
            texto: 'Elige a una persona y presiona Agregar. La ✕ de cada renglón la quita de la lista.',
            posicion: 'derecha',
            preparar: verDatos
        },
        {
            id: 'imagen',
            elemento: '.ob-imagen',
            titulo: 'Imagen de la obra',
            texto: 'Haz clic o arrastra una foto (JPG o PNG) para cargarla; también con Examinar. Doble clic la muestra completa.',
            posicion: 'izquierda',
            preparar: verDatos
        },
        {
            id: 'fechas',
            elemento: function () { return [q('.ob-fechas'), q('.ob-estatus')]; },
            titulo: 'Fechas y estatus',
            texto: 'Fecha de inicio y de término de la obra, y abajo el estatus en que va.',
            posicion: 'arriba',
            preparar: verDatos
        },
        {
            id: 'avance',
            elemento: '.ob-avance',
            titulo: 'Avance de obra',
            texto: 'Mueve la barra al porcentaje de avance y presiona Actualizar Avance de Obra para guardarlo.',
            posicion: 'arriba',
            preparar: verDatos
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
