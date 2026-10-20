// Pasos del recorrido guiado (Ayuda › Iniciar recorrido). Para agregar o cambiar uno:
//   elemento:  selector CSS o función que regresa el elemento a resaltar.
//              Usa los atributos data-recorrido de principal.php, no posiciones del HTML.
//   titulo / texto: lo que dice la tarjeta (una o dos frases).
//   posicion:  lado preferido de la tarjeta: derecha, izquierda, abajo o arriba
//              (si no cabe se usa otro lado; si no cabe en ninguno, se pega arriba o abajo de la pantalla).
//   menu:      true = muestra el menú lateral durante el paso (en celular lo abre).
//   si:        condición para mostrar el paso (p. ej. que la pantalla exista para el usuario).
//   preparar(h): cambios temporales con h.clase(elemento, clase, valor) o h.abrirGrupo(grupo);
//              se deshacen solos al cambiar de paso o al salir.
// Si un elemento no aparece en unos segundos, el paso se omite sin detener el recorrido.
(function () {
    // Sección del menú que se usa de ejemplo (Documentos, o la primera que tenga el usuario)
    function grupoGuia() {
        return document.querySelector('#menu .grupo[data-grupo="documentos"]:not(.oculto)') ||
            document.querySelector('#menu .grupo[data-grupo]:not(.oculto)');
    }

    window.RECORRIDO_PASOS = [
        {
            id: 'menu',
            elemento: '[data-recorrido="menu"]',
            titulo: 'Menú lateral',
            texto: 'Aquí están todos los módulos del sistema, agrupados por sección. Con el botón ☰ de la barra superior lo ocultas o lo vuelves a mostrar.',
            posicion: 'derecha',
            menu: true
        },
        {
            id: 'secciones',
            elemento: grupoGuia,
            titulo: 'Secciones y opciones',
            texto: 'Haz clic en el nombre de una sección para desplegar sus opciones. Cada opción se abre en su propia pestaña, sin cerrar lo que ya tienes abierto.',
            posicion: 'derecha',
            menu: true,
            si: function () { return !!grupoGuia(); },
            preparar: function (h) { h.abrirGrupo(grupoGuia()); }
        },
        {
            id: 'favoritos',
            elemento: function () { var g = grupoGuia(); return g && g.querySelector('.item:not(.oculto)'); },
            titulo: 'Favoritos',
            texto: 'Marca con ★ las opciones que más usas: aparecen en Favoritos, arriba del menú, y las encuentras rápido con el botón ⭐ de la barra superior.',
            posicion: 'derecha',
            menu: true,
            si: function () { var g = grupoGuia(); return !!(g && g.querySelector('.item .i-estrella')); },
            preparar: function (h) { h.abrirGrupo(grupoGuia()); }
        },
        {
            id: 'buscador',
            elemento: '[data-recorrido="buscador"]',
            titulo: 'Buscador',
            texto: 'Escribe el nombre de un módulo para encontrarlo en el menú. Presiona Enter para abrir la primera coincidencia.',
            posicion: 'abajo',
            preparar: function (h) { h.clase(document.querySelector('[data-recorrido="buscador"]'), 'abierto', true); }
        },
        {
            id: 'pestanas',
            elemento: '[data-recorrido="pestanas"]',
            titulo: 'Tus pestañas de trabajo',
            texto: 'Aquí puedes cambiar entre las pantallas que tienes abiertas. Selecciona una pestaña para regresar a ella; ↻ la recarga y ✕ la cierra.',
            posicion: 'abajo'
        },
        {
            id: 'resumen',
            elemento: '[data-recorrido="resumen"]',
            titulo: 'Resumen general',
            texto: 'Un vistazo rápido a los presupuestos, obras y demás indicadores. El enlace «Ir a…» de cada tarjeta abre su listado.',
            posicion: 'abajo',
            // Solo si la pestaña Bienvenido está a la vista
            si: function () { return !!document.querySelector('#panel-bienvenido.activo [data-recorrido="resumen"]'); }
        },
        {
            id: 'usuario',
            elemento: '[data-recorrido="usuario"]',
            titulo: 'Tu usuario',
            texto: 'Aquí ves tu usuario, el tiempo que le queda a tu sesión y los datos de la empresa. Desde aquí también cierras sesión.',
            posicion: 'abajo'
        },
        {
            id: 'tour',
            elemento: '[data-recorrido="tour"]',
            titulo: 'Volver a ver el recorrido',
            texto: 'Cuando quieras repasar, presiona Tour al pie del menú (o Ayuda › Iniciar recorrido en la barra superior) para volver a ver esta guía.',
            posicion: 'derecha',
            menu: true
        }
    ];
})();
