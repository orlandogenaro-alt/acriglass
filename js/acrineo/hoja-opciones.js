// ACRINEO · «Opciones del presupuesto» (pestaña vertical de la izquierda, como en Neodata) y sus teclas rápidas:
// F4 Presupuesto completo · F9 Catálogo general · F10 Cálculo · F12 Detalle del presupuesto · Ctrl+Shift+S Sobrecosto ·
// Ctrl+Shift+U Actualizar costos y matrices · Ctrl+Shift+F FASAR · Ctrl+P Imprimir reportes. «Buscar opción» filtra la lista.
(function (AN) {
    'use strict';

    var H = AN.hoja;
    if (!H || !document.getElementById('anOpciones')) return;
    var $ = function (id) { return document.getElementById(id); };
    var caja = $('anOpciones'), velo = $('anOpcionesVelo'), boton = $('anOpcionesBoton');

    var ACCIONES = {
        completo: function () { if (AN.hojaCompleto) AN.hojaCompleto.abrir(); },
        calculo: function () { var b = $('anCalculoBoton'); if (b) b.click(); },
        detalle: function () { var b = $('anHojaDetalle'); if (b) b.click(); },
        pegado: function () { if (AN.hojaPegado) AN.hojaPegado.abrir(); },
        grafica: function () { var b = $('anConceptosGrafica'); if (b) b.click(); },
        sobrecosto: function () { if (AN.hojaSobrecosto) AN.hojaSobrecosto.abrir(); },
        reportes: function () { if (AN.hojaReportes) AN.hojaReportes.abrir(); },
        cat_general: function () { if (AN.hojaCatalogo) AN.hojaCatalogo.abrir('general'); },
        cat_MAT: function () { if (AN.hojaCatalogo) AN.hojaCatalogo.abrir('MAT'); },
        cat_MO: function () { if (AN.hojaCatalogo) AN.hojaCatalogo.abrir('MO'); },
        cat_EQ: function () { if (AN.hojaCatalogo) AN.hojaCatalogo.abrir('EQ'); },
        actualizar: function () { if (AN.hojaProcesos) AN.hojaProcesos.actualizar(); },
        recibir: function () { if (AN.hojaProcesos) AN.hojaProcesos.recibir(); },
        depurar: function () { if (AN.hojaProcesos) AN.hojaProcesos.depurar(); },
        renumerar: function () { if (AN.hojaProcesos) AN.hojaProcesos.renumerar(); },
        fasar: function () { if (AN.hojaProcesos) AN.hojaProcesos.fasar(); }
    };
    var TECLAS = { F4: 'completo', F9: 'cat_general', F10: 'calculo', F12: 'detalle' };
    var TECLAS_CTRL_SHIFT = { s: 'sobrecosto', u: 'actualizar', f: 'fasar' };

    function abrir(si) {
        caja.hidden = !si;
        velo.hidden = !si;
        boton.setAttribute('aria-expanded', String(si));
        document.body.classList.toggle('an-opciones-abiertas', si);
        if (si) { $('anOpcionesQ').value = ''; filtrar(); $('anOpcionesQ').focus(); }
    }
    function filtrar() {
        var q = AN.ui.coincide ? $('anOpcionesQ').value : '';
        var seccion = null, visibles = 0;
        Array.prototype.forEach.call($('anOpcionesLista').children, function (el) {
            if (el.tagName === 'H3') {
                if (seccion) seccion.hidden = !visibles;
                seccion = el; visibles = 0;
                return;
            }
            var si = AN.ui.coincide([el.textContent], q, 'contiene');
            el.hidden = !si;
            if (si) visibles++;
        });
        if (seccion) seccion.hidden = !visibles;
    }
    function ejecutar(op) {
        abrir(false);
        if (ACCIONES[op]) ACCIONES[op]();
    }

    boton.addEventListener('click', function () { abrir(caja.hidden); });
    velo.addEventListener('click', function () { abrir(false); });
    $('anOpcionesCerrar').addEventListener('click', function () { abrir(false); });
    $('anOpcionesQ').addEventListener('input', filtrar);
    $('anOpcionesQ').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { var b = $('anOpcionesLista').querySelector('button:not([hidden])'); if (b) { e.preventDefault(); ejecutar(b.dataset.opcion); } }
    });
    $('anOpcionesLista').addEventListener('click', function (e) {
        var b = e.target.closest('[data-opcion]');
        if (b) ejecutar(b.dataset.opcion);
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !caja.hidden) { abrir(false); return; }
        // Ctrl+Shift+S Sobrecosto · Ctrl+Shift+U Actualizar costos y matrices · Ctrl+Shift+F FASAR
        var cs = (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && TECLAS_CTRL_SHIFT[(e.key || '').toLowerCase()];
        if (cs && !document.querySelector('dialog[open]')) { e.preventDefault(); ejecutar(cs); return; }
        var op = TECLAS[e.key];
        if (!op || e.ctrlKey || e.altKey || e.metaKey || document.querySelector('dialog[open]')) return;
        e.preventDefault();
        ejecutar(op);
    });
})(window.AcriNeo = window.AcriNeo || {});
