// ACRINEO · Ventana «Catálogo Unidades» (lupa de la columna Unidad).
// AcriNeo.unidades.elegir('M2') → Promise<'M2'|null>. Filtra por cualquier columna; en el renglón seleccionado
// + agrega, ✏ edita (en la misma fila: Enter / APLICAR guarda, Esc / CANCELAR descarta) y 🗑 borra (si nadie la usa).
// Doble clic, Enter o ACEPTAR eligen la unidad.
(function (AN) {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    var dlg = $('anUnidades');
    if (!dlg) return;
    var esc = AN.ui.esc;
    var API = 'api/acrineo/unidades.php';
    var tbody = $('anUnidadesFilas'), txt = $('anUnidadesQ');
    var I = {
        mas: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
        editar: '<svg class="i" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/></svg>',
        borrar: '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'
    };

    var st = { items: [], total: 0, sel: null, edicion: null, puede: false, resolver: null, ctrl: null, actual: '' };

    function estado(t, tipo) { $('anUnidadesEstado').textContent = t || ''; $('anUnidadesEstado').className = 'an-estado' + (tipo ? ' ' + tipo : ''); }
    function item(id) { return st.items.find(function (u) { return u.id === id; }) || null; }

    async function cargar(seleccionar) {
        if (st.ctrl) st.ctrl.abort();
        st.ctrl = new AbortController();
        try {
            var r = await AN.api.get(AN.api.url(API, { q: txt.value.trim() }), { signal: st.ctrl.signal });
            st.items = r.items;
            st.total = r.total;
            st.puede = r.puede_cambiar;
            if (seleccionar !== undefined) st.sel = seleccionar;
            else if (!item(st.sel)) {
                var m = st.items.find(function (u) { return u.unidad.toUpperCase() === st.actual.toUpperCase(); });
                st.sel = m ? m.id : (st.items[0] ? st.items[0].id : null);
            }
            pintar();
        } catch (e) {
            if (e.name !== 'AbortError') estado(e.message, 'error');
        }
    }

    function filaEdicion(e) {
        return '<tr class="an-edicion"><td><input id="anUniEdClave" maxlength="10" value="' + esc(e.unidad) + '" aria-label="Unidad"></td>'
            + '<td colspan="2"><input id="anUniEdDesc" maxlength="60" value="' + esc(e.descripcion) + '" aria-label="Descripción"></td></tr>'
            + '<tr class="an-edicion-botones"><td colspan="3"><small>' + (e.id ? 'Editando unidad' : 'Nueva unidad') + ' · Enter aplica, Esc cancela</small>'
            + '<button type="button" class="an-btn an-texto an-mini" data-ed="cancelar">Cancelar</button>'
            + '<button type="button" class="an-btn an-primario an-mini" data-ed="aplicar">Aplicar</button></td></tr>';
    }

    function pintar() {
        var e = st.edicion, html = '';
        if (e && !e.id) html += filaEdicion(e);
        st.items.forEach(function (u) {
            if (e && e.id === u.id) { html += filaEdicion(e); return; }
            var sel = u.id === st.sel;
            html += '<tr class="an-fila' + (sel ? ' sel' : '') + '" data-id="' + u.id + '" aria-selected="' + sel + '">'
                + '<td class="an-uni-clave">' + esc(u.unidad) + '</td>'
                + '<td>' + (u.descripcion ? esc(u.descripcion) : '<span class="an-ayuda">Sin descripción</span>') + '</td>'
                + '<td class="an-col-acc">' + (sel && st.puede && !e ? '<span class="an-acciones-fila">'
                    + '<button type="button" data-acc="nueva" title="Agregar unidad" aria-label="Agregar unidad">' + I.mas + '</button>'
                    + '<button type="button" data-acc="editar" title="Editar unidad" aria-label="Editar ' + esc(u.unidad) + '">' + I.editar + '</button>'
                    + '<button type="button" data-acc="borrar" title="Borrar unidad" aria-label="Borrar ' + esc(u.unidad) + '">' + I.borrar + '</button></span>' : '')
                + '</td></tr>';
        });
        if (!html) html = '<tr class="an-vacio"><td colspan="3">' + (txt.value.trim() ? 'Ninguna unidad coincide con el filtro.' : 'El catálogo no tiene unidades.') + '</td></tr>';
        tbody.innerHTML = html;
        $('anUnidadesTotal').textContent = st.total;
        $('anUnidadNueva').hidden = !st.puede || !!e;
        $('anUnidadesAceptar').disabled = !!e || !item(st.sel);
        var tr = tbody.querySelector('tr.sel');
        if (tr && !e) tr.scrollIntoView({ block: 'nearest' });
        if (e) {
            var c = $('anUniEdClave');
            if (c && !e.enfocado) {
                e.enfocado = true;
                // La fila en edición a la vista (la nueva va arriba; no debe quedar bajo el encabezado fijo)
                if (!e.id) tbody.closest('.an-tabla-cont').scrollTop = 0;
                else c.closest('tr').scrollIntoView({ block: 'center' });
                c.focus({ preventScroll: true });
                c.select();
            }
        }
    }

    // ---------- Altas, cambios y bajas ----------
    function nueva() { st.edicion = { id: null, unidad: txt.value.trim().slice(0, 10), descripcion: '' }; estado(''); pintar(); }
    function editar() { var u = item(st.sel); if (!u) return; st.edicion = { id: u.id, unidad: u.unidad, descripcion: u.descripcion }; estado(''); pintar(); }
    function cancelarEdicion() { st.edicion = null; estado(''); pintar(); }

    async function aplicar() {
        var e = st.edicion;
        if (!e || e.guardando) return;
        e.unidad = $('anUniEdClave').value.trim();
        e.descripcion = $('anUniEdDesc').value.trim();
        if (!e.unidad) { $('anUniEdClave').classList.add('invalido'); estado('La unidad es obligatoria.', 'error'); return; }
        e.guardando = true;
        try {
            var r = await AN.api.post(API, { accion: e.id ? 'editar' : 'crear', id: e.id, unidad: e.unidad, descripcion: e.descripcion });
            st.edicion = null;
            estado(e.id ? 'Unidad modificada.' : 'Unidad agregada.', 'ok');
            await cargar(r.unidad.id);
        } catch (err) {
            e.guardando = false;
            var errs = err.errores || {};
            if (errs.unidad) $('anUniEdClave').classList.add('invalido');
            if (errs.descripcion) $('anUniEdDesc').classList.add('invalido');
            estado(errs.unidad || errs.descripcion || err.message, 'error');
        }
    }

    async function borrar() {
        var u = item(st.sel);
        if (!u || !(await AN.ui.confirmar({ titulo: 'Borrar unidad', mensaje: '¿Borrar la unidad «' + u.unidad + '» del catálogo?', aceptar: 'Borrar', peligro: true }))) return;
        try {
            await AN.api.post(API, { accion: 'eliminar', id: u.id });
            estado('Unidad borrada.', 'ok');
            st.sel = null;
            await cargar();
        } catch (e) { estado(e.message, 'error'); }
    }

    // ---------- Abrir / elegir ----------
    function terminar(valor) {
        var r = st.resolver;
        st.resolver = null;
        if (dlg.open) dlg.close();
        if (r) r(valor);
    }
    function aceptar() { var u = item(st.sel); if (u && !st.edicion) terminar(u.unidad); }

    function elegir(actual) {
        if (st.resolver) terminar(null);
        st.actual = String(actual || '').trim();
        st.sel = null;
        st.edicion = null;
        txt.value = '';
        estado('');
        tbody.innerHTML = '<tr class="an-vacio"><td colspan="3">Cargando…</td></tr>';
        dlg.showModal();
        txt.focus();
        cargar();
        return new Promise(function (resolver) { st.resolver = resolver; });
    }

    // ---------- Eventos ----------
    txt.addEventListener('input', AN.ui.retrasar(function () { st.sel = null; cargar(); }, 250));
    tbody.addEventListener('click', function (e) {
        var acc = e.target.closest('[data-acc]');
        if (acc) { ({ nueva: nueva, editar: editar, borrar: borrar })[acc.dataset.acc](); return; }
        var ed = e.target.closest('[data-ed]');
        if (ed) { if (ed.dataset.ed === 'aplicar') aplicar(); else cancelarEdicion(); return; }
        var tr = e.target.closest('tr[data-id]');
        if (tr && !st.edicion) { st.sel = +tr.dataset.id; pintar(); }
    });
    tbody.addEventListener('dblclick', function (e) {
        var tr = e.target.closest('tr[data-id]');
        if (tr && !st.edicion && !e.target.closest('[data-acc]')) { st.sel = +tr.dataset.id; aceptar(); }
    });
    dlg.addEventListener('keydown', function (e) {
        if (st.edicion) {
            if (e.key === 'Enter') { e.preventDefault(); aplicar(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancelarEdicion(); }
            return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            var i = st.items.findIndex(function (u) { return u.id === st.sel; });
            var j = Math.max(0, Math.min(st.items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
            if (st.items[j]) { st.sel = st.items[j].id; pintar(); }
        } else if (e.key === 'Enter') { e.preventDefault(); aceptar(); }
    });
    dlg.addEventListener('cancel', function (e) { if (st.edicion) { e.preventDefault(); return; } e.preventDefault(); terminar(null); });
    dlg.addEventListener('close', function () { if (st.resolver) terminar(null); });
    dlg.querySelectorAll('[data-unidades-cerrar]').forEach(function (b) { b.addEventListener('click', function () { terminar(null); }); });
    $('anUnidadesAceptar').addEventListener('click', aceptar);
    $('anUnidadNueva').addEventListener('click', nueva);

    AN.unidades = { elegir: elegir };
})(window.AcriNeo = window.AcriNeo || {});
