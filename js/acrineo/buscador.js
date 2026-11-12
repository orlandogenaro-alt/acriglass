// ACRINEO · Ventana de búsqueda en catálogos (botones 🔍). AcriNeo.buscador.abrir('clientes') → Promise<{id, nombre, extra}|null>
// Búsqueda paginada en el servidor; flechas ↑ ↓ para moverse, Enter o doble clic para elegir.
(function (AN) {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    var dlg = $('anBuscador');
    if (!dlg) return;
    var txt = $('anBuscadorQ'), filas = $('anBuscadorFilas'), conteo = $('anBuscadorConteo'), btnMas = $('anBuscadorMas');
    var btnElegir = $('anBuscadorElegir'), estado = $('anBuscadorEstado'), alta = $('anBuscadorAlta');
    var permisos = (window.ACRINEO && window.ACRINEO.permisos) || {};
    var puedeAlta = !!(permisos['presupuestos.crear'] || permisos['presupuestos.editar']);

    var st = { catalogo: '', pagina: 1, items: [], total: 0, sel: -1, resolver: null, ctrl: null };

    async function cargar(reiniciar) {
        if (reiniciar) { st.pagina = 1; st.items = []; st.sel = -1; }
        if (st.ctrl) st.ctrl.abort();
        st.ctrl = new AbortController();
        estado.className = 'an-estado info';
        estado.textContent = 'Buscando…';
        try {
            var base = st.fuente || AN.api.url(AN.api.CATALOGOS, { catalogo: st.catalogo });
            var r = await AN.api.get(AN.api.url(base, { q: txt.value.trim(), pagina: st.pagina }), { signal: st.ctrl.signal });
            $('anBuscadorTitulo').textContent = r.titulo;
            $('anBuscadorExtra').querySelector('span').textContent = r.extra_titulo || '';
            st.items = st.items.concat(r.items);
            st.total = r.total;
            alta.hidden = !(r.alta && puedeAlta);
            if (st.sel < 0 && st.items.length) st.sel = 0;
            estado.textContent = '';
            pintar();
        } catch (e) {
            if (e.name === 'AbortError') return;
            estado.className = 'an-estado error';
            estado.textContent = e.message;
        }
    }

    function pintar() {
        if (!st.items.length) {
            filas.innerHTML = '<tr class="an-vacio"><td colspan="2">Sin resultados' + (txt.value.trim() ? ' para «' + AN.ui.esc(txt.value.trim()) + '»' : '') + '.</td></tr>';
        } else {
            filas.innerHTML = st.items.map(function (it, i) {
                return '<tr class="an-fila' + (i === st.sel ? ' sel' : '') + '" data-i="' + i + '" aria-selected="' + (i === st.sel) + '">'
                    + '<td>' + AN.ui.esc(it.nombre) + '</td><td>' + AN.ui.esc(it.extra || '') + '</td></tr>';
            }).join('');
        }
        conteo.textContent = st.items.length + ' de ' + st.total;
        btnMas.hidden = st.items.length >= st.total;
        btnElegir.disabled = st.sel < 0;
        var tr = filas.querySelector('tr.sel');
        if (tr) tr.scrollIntoView({ block: 'nearest' });
    }

    function terminar(item) {
        var r = st.resolver;
        st.resolver = null;
        if (dlg.open) dlg.close();
        if (r) r(item || null);
    }

    // op.url: otra fuente con la misma respuesta { titulo, extra_titulo, items, total, alta } (p. ej. insumos de la hoja)
    function abrir(catalogo, op) {
        if (st.resolver) terminar(null);
        st.catalogo = catalogo;
        st.fuente = op && op.url ? op.url : null;
        txt.value = '';
        alta.hidden = true;
        alta.reset();
        limpiarErroresAlta();
        filas.innerHTML = '<tr class="an-vacio"><td colspan="2">Cargando…</td></tr>';
        dlg.showModal();
        txt.focus();
        cargar(true);
        return new Promise(function (resolver) { st.resolver = resolver; });
    }

    txt.addEventListener('input', AN.ui.retrasar(function () { cargar(true); }, 250));
    txt.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!st.items.length) return;
            st.sel = Math.max(0, Math.min(st.items.length - 1, st.sel + (e.key === 'ArrowDown' ? 1 : -1)));
            pintar();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (st.sel >= 0) terminar(st.items[st.sel]);
        }
    });
    filas.addEventListener('click', function (e) {
        var tr = e.target.closest('tr[data-i]');
        if (!tr) return;
        st.sel = +tr.dataset.i;
        pintar();
    });
    filas.addEventListener('dblclick', function (e) {
        var tr = e.target.closest('tr[data-i]');
        if (tr) terminar(st.items[+tr.dataset.i]);
    });
    btnMas.addEventListener('click', function () { st.pagina++; cargar(false); });
    btnElegir.addEventListener('click', function () { if (st.sel >= 0) terminar(st.items[st.sel]); });
    dlg.querySelectorAll('[data-cerrar]').forEach(function (b) { b.addEventListener('click', function () { terminar(null); }); });
    dlg.addEventListener('close', function () { if (st.resolver) terminar(null); });

    // Alta rápida (solo el catálogo de empresas)
    function limpiarErroresAlta() {
        alta.querySelectorAll('.an-campo').forEach(function (c) {
            c.classList.remove('invalido');
            c.querySelector('.an-error').hidden = true;
        });
    }
    alta.addEventListener('submit', async function (e) {
        e.preventDefault();
        limpiarErroresAlta();
        var nombre = $('anAltaNombre').value.trim();
        if (!nombre) { marcarAlta('nombre', 'Es obligatorio.'); return; }
        try {
            var r = await AN.api.post(AN.api.url(AN.api.CATALOGOS, { catalogo: st.catalogo }), { nombre: nombre, rfc: $('anAltaRfc').value.trim() });
            AN.ui.aviso('Empresa agregada: ' + r.item.nombre, 'ok');
            terminar(r.item);
        } catch (err) {
            var errores = err.errores || {};
            Object.keys(errores).forEach(function (k) { marcarAlta(k, errores[k]); });
            if (!Object.keys(errores).length) { estado.className = 'an-estado error'; estado.textContent = err.message; }
        }
    });
    function marcarAlta(campo, msg) {
        var c = alta.querySelector('[data-error-de="alta.' + campo + '"]');
        if (!c) return;
        c.classList.add('invalido');
        var s = c.querySelector('.an-error');
        s.textContent = msg;
        s.hidden = false;
    }

    AN.buscador = { abrir: abrir };
})(window.AcriNeo = window.AcriNeo || {});
