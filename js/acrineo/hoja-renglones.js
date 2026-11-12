// ACRINEO · Conceptos de la partida seleccionada (arriba a la derecha).
// Lápiz = modo edición: «Agregar registro» abre un renglón para Código, Descripción, Unidad, Cantidad y Costo; si el
// código ya está en el catálogo del presupuesto, se llenan sus datos. GUARDAR manda todo junto (y el concepto queda en
// el catálogo de abajo); CANCELAR descarta. Precio = costo × (1 + % sobrecosto); importe = cantidad × precio.
(function (AN) {
    'use strict';

    var H = AN.hoja;
    if (!H) return;
    var $ = function (id) { return document.getElementById(id); };
    var esc = AN.ui.esc;
    var tbody = $('anRenglones');
    var CAMPOS = ['codigo', 'descripcion', 'unidad', 'cantidad', 'costo'];

    var st = { filas: [], editando: false, borradores: [], quitar: new Set(), marcados: new Set(), sec: 0, guardando: false, cargando: 0 };

    function partidaTexto(p) { return p ? p.codigo + ' · ' + p.descripcion : 'Selecciona una partida'; }

    function pendiente() {
        if (!st.editando) return false;
        if (st.quitar.size) return true;
        return st.borradores.some(function (b) { return !b.renglon_id || modificado(b); });
    }
    function modificado(b) {
        if (!b.original) return true;
        return CAMPOS.some(function (k) { return String(b[k] == null ? '' : b[k]).trim() !== String(b.original[k] == null ? '' : b.original[k]); });
    }
    H.renglonesPendientes = pendiente;

    // ---------- Carga ----------
    async function cargar(p) {
        salirEdicion();
        $('anPartidaActual').textContent = partidaTexto(p);
        $('anPartidaActual').title = partidaTexto(p);
        st.filas = [];
        st.marcados.clear();
        if (!p) { pintar(); return; }
        var n = ++st.cargando;
        tbody.innerHTML = '<tr class="an-vacio"><td colspan="8">Cargando…</td></tr>';
        try {
            var r = await AN.api.get(H.url({ partida: p.id }));
            if (n !== st.cargando) return;
            H.ctx = r.presupuesto;
            st.filas = r.renglones || [];
            pintar();
        } catch (e) {
            tbody.innerHTML = '<tr class="an-vacio"><td colspan="8">' + esc(e.message) + '</td></tr>';
        }
    }

    // ---------- Pintar ----------
    function dinero(n) { return AN.ui.dinero(n); }
    function cantidad(n) { return (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: H.ctx.dec_cantidades, maximumFractionDigits: H.ctx.dec_cantidades }); }

    function pintar() {
        var p = H.partida();
        var html = '';
        if (st.editando) {
            st.borradores.forEach(function (b) {
                if (b.renglon_id && st.quitar.has(b.renglon_id)) return;
                var precio = H.precio(b.costo), importe = H.redondear(Number(b.cantidad) * precio, H.ctx.dec_costos);
                html += '<tr class="an-fila' + (!b.renglon_id ? ' nuevo-renglon' : modificado(b) ? ' modificado' : '') + '" data-clave="' + b.clave + '">'
                    + '<td class="an-col-sel"><input type="checkbox" data-marcar="' + b.clave + '"' + (st.marcados.has(b.clave) ? ' checked' : '') + ' aria-label="Marcar renglón"></td>'
                    + celda(b, 'codigo', 'text', 30) + celda(b, 'descripcion', 'text', 4000, 'an-desc') + celda(b, 'unidad', 'text', 20)
                    + celda(b, 'cantidad', 'number', null, 'num') + celda(b, 'costo', 'number', null, 'num')
                    + '<td class="num" data-precio>' + dinero(precio) + '</td><td class="num" data-importe>' + dinero(importe) + '</td></tr>';
            });
        } else {
            st.filas.forEach(function (r) {
                html += '<tr class="an-fila" data-renglon="' + r.renglon_id + '">'
                    + '<td class="an-col-sel"></td><td>' + esc(r.codigo) + '</td><td class="an-desc">' + esc(r.descripcion) + '</td><td>' + esc(r.unidad || '') + '</td>'
                    + '<td class="num">' + cantidad(r.cantidad) + '</td><td class="num">' + dinero(r.costo) + '</td>'
                    + '<td class="num">' + dinero(r.precio) + '</td><td class="num">' + dinero(r.importe) + '</td></tr>';
            });
        }
        if (!html) {
            html = '<tr class="an-vacio"><td colspan="8">' + (p ? 'La cuadrícula no tiene datos.' : 'Selecciona o crea una partida a la izquierda.')
                + (p && st.editando ? '<br><button type="button" class="an-btn an-primario" data-agregar>Agregar registro</button>'
                    : p && H.puede ? '<br><small class="an-ayuda">Usa el lápiz para agregar conceptos, o cópialos del catálogo de abajo.</small>' : '')
                + '</td></tr>';
        }
        tbody.innerHTML = html;
        $('anRenglonesTodos').disabled = !st.editando;
        $('anRenglonesTodos').checked = false;
        total();
        botones();
    }

    function celda(b, k, tipo, max, clase) {
        var v = b[k] == null ? '' : b[k];
        return '<td' + (k === 'descripcion' ? ' class="an-desc"' : '') + '><input class="an-celda-in ' + (clase || '') + '" type="' + tipo + '" data-k="' + k + '" value="' + esc(v) + '"'
            + (max ? ' maxlength="' + max + '"' : ' min="0" step="any" inputmode="decimal"') + ' aria-label="' + k + '"></td>';
    }

    function total() {
        var t = 0;
        if (st.editando) {
            st.borradores.forEach(function (b) {
                if (b.renglon_id && st.quitar.has(b.renglon_id)) return;
                t += H.redondear(Number(b.cantidad) * H.precio(b.costo), H.ctx.dec_costos);
            });
        } else st.filas.forEach(function (r) { t += r.importe; });
        $('anRenglonesTotal').textContent = AN.ui.dinero(t);
    }

    function botones() {
        if (!H.puede) return;
        var p = H.partida();
        $('anEditarRenglones').disabled = !p || st.guardando;
        $('anEditarRenglones').setAttribute('aria-pressed', String(st.editando));
        ['anAgregarRenglon', 'anCancelarRenglones', 'anGuardarRenglones'].forEach(function (id) { $(id).hidden = !st.editando; });
        $('anQuitarRenglones').hidden = !st.editando || !st.marcados.size;
        $('anGuardarRenglones').disabled = st.guardando || !pendiente();
    }

    function estado(texto, tipo) {
        var e = $('anRenglonesEstado');
        e.textContent = texto || '';
        e.className = 'an-estado' + (tipo ? ' ' + tipo : '');
    }

    // ---------- Edición ----------
    function entrarEdicion() {
        if (!H.partida()) return;
        st.editando = true;
        st.quitar.clear();
        st.marcados.clear();
        st.borradores = st.filas.map(function (r) {
            var b = { clave: 'r' + r.renglon_id, renglon_id: r.renglon_id };
            CAMPOS.forEach(function (k) { b[k] = r[k] == null ? '' : String(r[k]); });
            b.original = Object.assign({}, b);
            return b;
        });
        estado('Modo edición: los cambios se guardan con GUARDAR.', 'info');
        pintar();
    }

    function salirEdicion() {
        st.editando = false;
        st.borradores = [];
        st.quitar.clear();
        st.marcados.clear();
        estado('');
    }

    function agregar() {
        var b = { clave: 'n' + (++st.sec), renglon_id: null, codigo: '', descripcion: '', unidad: '', cantidad: '1', costo: '0' };
        st.borradores.push(b);
        pintar();
        var input = tbody.querySelector('tr[data-clave="' + b.clave + '"] input[data-k="codigo"]');
        if (input) { input.focus(); input.scrollIntoView({ block: 'nearest' }); }
    }

    async function cancelarEdicion() {
        if (pendiente() && !(await AN.ui.confirmar({ titulo: 'Cambios sin guardar', mensaje: 'Existen cambios sin guardar en los conceptos.\n¿Deseas descartarlos?', aceptar: 'Descartar cambios', peligro: true }))) return;
        salirEdicion();
        pintar();
    }

    function borrador(clave) { return st.borradores.find(function (b) { return b.clave === clave; }); }

    // Código que ya está en el catálogo del presupuesto: trae su descripción, unidad y costo
    async function completarPorCodigo(b, tr) {
        var codigo = b.codigo.trim();
        if (!codigo || b.renglon_id) return;
        try {
            var r = await AN.api.get(H.url({ recurso: 'conceptos', q: codigo, por_pagina: 20 }));
            var c = r.items.find(function (x) { return x.codigo.toUpperCase() === codigo.toUpperCase(); });
            if (!c || b.codigo.trim().toUpperCase() !== codigo.toUpperCase()) return;
            if (!b.descripcion.trim()) b.descripcion = c.descripcion;
            if (!b.unidad.trim()) b.unidad = c.unidad || '';
            if (Number(b.costo) === 0) b.costo = String(c.costo);
            ['descripcion', 'unidad', 'costo'].forEach(function (k) { var i = tr.querySelector('input[data-k="' + k + '"]'); if (i) i.value = b[k]; });
            recalcular(b, tr);
            estado('«' + c.codigo + '» ya está en el catálogo: se usan sus datos (si los cambias, cambian en todas sus partidas).', 'info');
        } catch (e) { /* sin autollenado */ }
    }

    function recalcular(b, tr) {
        var precio = H.precio(b.costo);
        tr.querySelector('[data-precio]').textContent = AN.ui.dinero(precio);
        tr.querySelector('[data-importe]').textContent = AN.ui.dinero(H.redondear(Number(b.cantidad) * precio, H.ctx.dec_costos));
        tr.classList.toggle('modificado', !!b.renglon_id && modificado(b));
        total();
        botones();
    }

    async function guardar() {
        if (st.guardando || !pendiente()) return;
        var p = H.partida();
        var enviar = st.borradores.filter(function (b) { return !(b.renglon_id && st.quitar.has(b.renglon_id)) && (!b.renglon_id || modificado(b)); });
        // Validación rápida aquí; el servidor vuelve a validar todo
        var malos = 0;
        tbody.querySelectorAll('input.invalido').forEach(function (i) { i.classList.remove('invalido'); });
        enviar.forEach(function (b) {
            var tr = tbody.querySelector('tr[data-clave="' + b.clave + '"]');
            [['codigo', !String(b.codigo).trim()], ['descripcion', !String(b.descripcion).trim()],
             ['cantidad', !(String(b.cantidad).trim() !== '' && Number(b.cantidad) >= 0)], ['costo', !(String(b.costo).trim() !== '' && Number(b.costo) >= 0)]]
                .forEach(function (x) { if (x[1]) { malos++; var i = tr && tr.querySelector('input[data-k="' + x[0] + '"]'); if (i) { i.classList.add('invalido'); i.title = 'Es obligatorio (y no negativo).'; } } });
        });
        if (malos) { estado('Revisa los renglones marcados: código y descripción son obligatorios.', 'error'); return; }

        st.guardando = true;
        botones();
        estado('Guardando…', 'info');
        try {
            var r = await AN.api.post(H.url(), {
                accion: 'renglones_guardar', partida_id: p.id,
                filas: enviar.map(function (b) { var f = { renglon_id: b.renglon_id }; CAMPOS.forEach(function (k) { f[k] = String(b[k]).trim(); }); return f; }),
                quitar: Array.from(st.quitar)
            });
            st.guardando = false;
            salirEdicion();
            st.filas = r.renglones || [];
            H.aplicar(r);
            entrarEdicion();
            estado('Guardado correctamente', 'ok');
            AN.ui.aviso('Conceptos de la partida ' + p.codigo + ' guardados.', 'ok');
        } catch (e) {
            st.guardando = false;
            Object.keys(e.errores || {}).forEach(function (k) {
                var m = /^filas\.(\d+)\.(\w+)$/.exec(k);
                if (!m || !enviar[+m[1]]) return;
                var i = tbody.querySelector('tr[data-clave="' + enviar[+m[1]].clave + '"] input[data-k="' + m[2] + '"]');
                if (i) { i.classList.add('invalido'); i.title = e.errores[k]; }
            });
            var primero = Object.keys(e.errores || {})[0];
            estado(primero ? e.message + ' ' + e.errores[primero] : e.message, 'error');
            botones();
        }
    }

    // ---------- Eventos ----------
    H.on(function (evento, datos) {
        if (evento === 'partida') cargar(datos);
        else if (evento === 'estado') {
            var p = H.partida();
            $('anPartidaActual').textContent = partidaTexto(p);
            if (!p) { salirEdicion(); st.filas = []; pintar(); return; }
            if (datos.renglones && !st.editando) { st.filas = datos.renglones; pintar(); }
            else if (datos.renglones && st.editando && !pendiente() && !st.guardando) { st.filas = datos.renglones; entrarEdicion(); }
            else if (st.editando) pintar();   // precios con el sobrecosto nuevo
            else botones();
        }
    });

    tbody.addEventListener('input', function (e) {
        var k = e.target.dataset.k;
        if (!k) return;
        var tr = e.target.closest('tr[data-clave]');
        var b = borrador(tr.dataset.clave);
        b[k] = e.target.value;
        e.target.classList.remove('invalido');
        if (k === 'cantidad' || k === 'costo') recalcular(b, tr);
        else { tr.classList.toggle('modificado', !!b.renglon_id && modificado(b)); botones(); }
    });
    tbody.addEventListener('change', function (e) {
        if (e.target.dataset.k === 'codigo') {
            var tr = e.target.closest('tr[data-clave]');
            completarPorCodigo(borrador(tr.dataset.clave), tr);
        }
        if (e.target.dataset.marcar) {
            if (e.target.checked) st.marcados.add(e.target.dataset.marcar); else st.marcados.delete(e.target.dataset.marcar);
            botones();
        }
    });
    tbody.addEventListener('keydown', function (e) {
        if (!e.target.dataset.k) return;
        if (e.key === 'Enter') { e.preventDefault(); guardar(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancelarEdicion(); }
    });
    tbody.addEventListener('click', function (e) { if (e.target.closest('[data-agregar]')) agregar(); });
    $('anRenglonesTodos').addEventListener('change', function () {
        var si = this.checked;
        st.marcados.clear();
        if (si) st.borradores.forEach(function (b) { if (!(b.renglon_id && st.quitar.has(b.renglon_id))) st.marcados.add(b.clave); });
        tbody.querySelectorAll('input[data-marcar]').forEach(function (c) { c.checked = si; });
        botones();
    });

    if (H.puede) {
        $('anEditarRenglones').addEventListener('click', function () { if (st.editando) cancelarEdicion(); else entrarEdicion(); });
        $('anAgregarRenglon').addEventListener('click', agregar);
        $('anCancelarRenglones').addEventListener('click', cancelarEdicion);
        $('anGuardarRenglones').addEventListener('click', guardar);
        $('anQuitarRenglones').addEventListener('click', function () {
            st.borradores = st.borradores.filter(function (b) {
                if (!st.marcados.has(b.clave)) return true;
                if (b.renglon_id) { st.quitar.add(b.renglon_id); return true; }
                return false;   // renglón nuevo sin guardar: se descarta
            });
            st.marcados.clear();
            estado(st.quitar.size ? st.quitar.size + ' renglón(es) se quitarán de la partida al GUARDAR.' : '', 'info');
            pintar();
        });
    }

    AN.hojaRenglones = { editando: function () { return st.editando; } };
})(window.AcriNeo = window.AcriNeo || {});
