// ACRINEO · Ventanas de catálogos chicos de las lupas: «Catálogo Unidades» (columna Unidad) y
// «Catálogo Tipos de insumos» (columna Tipo de la matriz). Filtran por cualquier columna; en el renglón
// seleccionado + agrega, ✏ edita (en la misma fila: Enter / APLICAR guarda, Esc / CANCELAR descarta) y 🗑 borra
// (si nadie lo usa). Doble clic, Enter o ACEPTAR eligen.
//   AcriNeo.unidades.elegir('M2')     → Promise<'M2'|null>
//   AcriNeo.tiposInsumo.elegir('MAT') → Promise<'MAT'|null>
(function (AN) {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    var I = {
        mas: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
        editar: '<svg class="i" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/></svg>',
        borrar: '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'
    };

    // cfg: {id, api, campo, max, mayusculas, t: {nombre, Nombre, agregado, modificado, borrado, vacio, ninguno}}
    function catalogo(cfg) {
        var p = cfg.id, dlg = $(p);
        if (!dlg) return null;
        var esc = AN.ui.esc, t = cfg.t, campo = cfg.campo;
        var tbody = $(p + 'Filas'), txt = $(p + 'Q');
        var st = { items: [], total: 0, sel: null, edicion: null, puede: false, resolver: null, ctrl: null, actual: '' };

        function estado(s, tipo) { $(p + 'Estado').textContent = s || ''; $(p + 'Estado').className = 'an-estado' + (tipo ? ' ' + tipo : ''); }
        function item(id) { return st.items.find(function (u) { return u.id === id; }) || null; }

        async function cargar(seleccionar) {
            if (st.ctrl) st.ctrl.abort();
            st.ctrl = new AbortController();
            try {
                var r = await AN.api.get(AN.api.url(cfg.api, { q: txt.value.trim() }), { signal: st.ctrl.signal });
                st.items = r.items;
                st.total = r.total;
                st.puede = r.puede_cambiar;
                if (seleccionar !== undefined) st.sel = seleccionar;
                else if (!item(st.sel)) {
                    var m = st.items.find(function (u) { return u[campo].toUpperCase() === st.actual.toUpperCase(); });
                    st.sel = m ? m.id : (st.items[0] ? st.items[0].id : null);
                }
                pintar();
            } catch (e) {
                if (e.name !== 'AbortError') estado(e.message, 'error');
            }
        }

        function filaEdicion(e) {
            return '<tr class="an-edicion"><td><input id="' + p + 'EdClave" maxlength="' + cfg.max + '" value="' + esc(e[campo]) + '"'
                + (e.sistema ? ' readonly title="La clave de un ' + t.nombre + ' del sistema no se cambia"' : '')
                + (cfg.mayusculas ? ' style="text-transform:uppercase"' : '') + ' aria-label="' + t.Nombre + '"></td>'
                + '<td colspan="2"><input id="' + p + 'EdDesc" maxlength="60" value="' + esc(e.descripcion) + '" aria-label="Descripción"></td></tr>'
                + '<tr class="an-edicion-botones"><td colspan="3"><small>' + (e.id ? 'Editando ' + t.nombre : t.nuevo) + ' · Enter aplica, Esc cancela</small>'
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
                    + '<td class="an-cat-clave">' + esc(u[campo]) + '</td>'
                    + '<td>' + (u.descripcion ? esc(u.descripcion) : '<span class="an-ayuda">Sin descripción</span>') + '</td>'
                    + '<td class="an-col-acc">' + (sel && st.puede && !e ? '<span class="an-acciones-fila">'
                        + '<button type="button" data-acc="nueva" title="Agregar ' + t.nombre + '" aria-label="Agregar ' + t.nombre + '">' + I.mas + '</button>'
                        + '<button type="button" data-acc="editar" title="Editar ' + t.nombre + '" aria-label="Editar ' + esc(u[campo]) + '">' + I.editar + '</button>'
                        + (u.sistema ? '' : '<button type="button" data-acc="borrar" title="Borrar ' + t.nombre + '" aria-label="Borrar ' + esc(u[campo]) + '">' + I.borrar + '</button>')
                        + '</span>' : '')
                    + '</td></tr>';
            });
            if (!html) html = '<tr class="an-vacio"><td colspan="3">' + (txt.value.trim() ? t.ninguno : t.vacio) + '</td></tr>';
            tbody.innerHTML = html;
            $(p + 'Total').textContent = st.total;
            $(p + 'Nueva').hidden = !st.puede || !!e;
            $(p + 'Aceptar').disabled = !!e || !item(st.sel);
            var tr = tbody.querySelector('tr.sel');
            if (tr && !e) tr.scrollIntoView({ block: 'nearest' });
            if (e) {
                var c = e.sistema ? $(p + 'EdDesc') : $(p + 'EdClave');
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
        function nueva() {
            st.edicion = { id: null, descripcion: '' };
            st.edicion[campo] = txt.value.trim().slice(0, cfg.max);
            estado(''); pintar();
        }
        function editar() {
            var u = item(st.sel); if (!u) return;
            st.edicion = { id: u.id, descripcion: u.descripcion, sistema: !!u.sistema };
            st.edicion[campo] = u[campo];
            estado(''); pintar();
        }
        function cancelarEdicion() { st.edicion = null; estado(''); pintar(); }

        async function aplicar() {
            var e = st.edicion;
            if (!e || e.guardando) return;
            e[campo] = $(p + 'EdClave').value.trim();
            if (cfg.mayusculas) e[campo] = e[campo].toUpperCase();
            e.descripcion = $(p + 'EdDesc').value.trim();
            if (!e[campo]) { $(p + 'EdClave').classList.add('invalido'); estado('La clave es obligatoria.', 'error'); return; }
            e.guardando = true;
            try {
                var datos = { accion: e.id ? 'editar' : 'crear', id: e.id, descripcion: e.descripcion };
                datos[campo] = e[campo];
                var r = await AN.api.post(cfg.api, datos);
                st.edicion = null;
                estado(e.id ? t.modificado : t.agregado, 'ok');
                await cargar(r[campo].id);
            } catch (err) {
                e.guardando = false;
                var errs = err.errores || {};
                if (errs[campo]) $(p + 'EdClave').classList.add('invalido');
                if (errs.descripcion) $(p + 'EdDesc').classList.add('invalido');
                estado(errs[campo] || errs.descripcion || err.message, 'error');
            }
        }

        async function borrar() {
            var u = item(st.sel);
            if (!u || !(await AN.ui.confirmar({ titulo: 'Borrar ' + t.nombre, mensaje: '¿Borrar ' + t.el + ' «' + u[campo] + '» del catálogo?', aceptar: 'Borrar', peligro: true }))) return;
            try {
                await AN.api.post(cfg.api, { accion: 'eliminar', id: u.id });
                estado(t.borrado, 'ok');
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
        function aceptar() { var u = item(st.sel); if (u && !st.edicion) terminar(u[campo]); }

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
        dlg.addEventListener('cancel', function (e) { e.preventDefault(); if (!st.edicion) terminar(null); });
        dlg.addEventListener('close', function () { if (st.resolver) terminar(null); });
        dlg.querySelectorAll('[data-cat-cerrar]').forEach(function (b) { b.addEventListener('click', function () { terminar(null); }); });
        $(p + 'Aceptar').addEventListener('click', aceptar);
        $(p + 'Nueva').addEventListener('click', nueva);

        return { elegir: elegir, items: function () { return st.items; } };
    }

    AN.unidades = catalogo({
        id: 'anUnidades', api: 'api/acrineo/unidades.php', campo: 'unidad', max: 10,
        t: { nombre: 'unidad', Nombre: 'Unidad', el: 'la unidad', nuevo: 'Nueva unidad', agregado: 'Unidad agregada.', modificado: 'Unidad modificada.',
             borrado: 'Unidad borrada.', vacio: 'El catálogo no tiene unidades.', ninguno: 'Ninguna unidad coincide con el filtro.' }
    });
    AN.tiposInsumo = catalogo({
        id: 'anTiposInsumo', api: 'api/acrineo/tipos-insumo.php', campo: 'tipo', max: 3, mayusculas: true,
        t: { nombre: 'tipo', Nombre: 'Tipo', el: 'el tipo', nuevo: 'Nuevo tipo', agregado: 'Tipo agregado.', modificado: 'Tipo modificado.',
             borrado: 'Tipo borrado.', vacio: 'El catálogo no tiene tipos.', ninguno: 'Ningún tipo coincide con el filtro.' }
    });
})(window.AcriNeo = window.AcriNeo || {});
