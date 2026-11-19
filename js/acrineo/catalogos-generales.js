// ACRINEO · Catálogos generales (acrineo-catalogos.php?c=…, api/acrineo/catalogos-generales.php).
// Una cuadrícula como la de Neodata: filtro (contiene / comienza con), + Nuevo (Insert), lápiz o doble clic / F2 edita en
// la misma fila (Enter guarda, Esc cancela), papelera (Supr) borra si nadie usa el registro, Ctrl+V pega renglones
// copiados de Excel (alta o, si la clave ya existe, cambio) y exportar a Excel lo que se ve.
(function (AN) {
    'use strict';

    var esc = AN.ui.esc;
    var $ = function (id) { return document.getElementById(id); };
    var CLAVE = document.querySelector('.an-catgen').dataset.catalogo;
    var API = 'api/acrineo/catalogos-generales.php?c=' + encodeURIComponent(CLAVE);

    var st = { cat: null, items: [], refs: {}, puede: false, sel: null, edicion: null, vistos: [] };
    var filtro = $('cgFiltro');
    var tbody = $('cgFilas');

    function estado(t, tipo) { var e = $('cgEstado'); e.textContent = t || ''; e.className = 'an-estado' + (tipo ? ' ' + tipo : ''); }
    function item(id) { return st.items.find(function (i) { return i.id === id; }) || null; }
    function editables() { return st.cat.cols.filter(function (c) { return !c.soloLectura; }); }
    // Columnas que se pegan de Excel: todas menos las automáticas (en Responsables va el usuario para encontrarlo)
    function colsPegar() { return st.cat.cols.filter(function (c) { return !c.auto; }); }

    function refTexto(c, v) {
        if (v === null || v === undefined || v === '') return '';
        if (c.tipo !== 'ref') return String(v);
        var o = (st.refs[c.ref] || []).find(function (r) { return r.id === v; });
        return o ? o.texto : '';
    }
    function textoCelda(c, f) {
        if (c.tipo === 'bool') return f[c.k] ? 'Sí' : '';
        return refTexto(c, f[c.k]);
    }

    // ---------- Cuadrícula ----------
    function encabezado() {
        $('cgEncabezado').innerHTML = st.cat.cols.map(function (c) {
            return '<th scope="col"' + (c.ancho ? ' style="min-width:' + c.ancho + 'px"' : '') + '><div class="an-th"><span>'
                + esc(c.titulo) + (c.requerido ? '*' : '') + '</span></div></th>';
        }).join('') + '<th scope="col" class="an-col-acc"><div class="an-th"></div></th>';
    }

    function celdaVista(c, f, i) {
        var t = textoCelda(c, f);
        var cls = i === 0 ? ' class="an-cat-clave"' : (c.tipo === 'bool' ? ' class="an-centro"' : '');
        if (c.tipo === 'bool') return '<td' + cls + '>' + (f[c.k] ? '✓' : '') + '</td>';
        if (c.tipo === 'url' && t) return '<td' + cls + '><a href="' + esc(t) + '" target="_blank" rel="noopener noreferrer">' + esc(t) + '</a></td>';
        return '<td' + cls + ' title="' + esc(t) + '">' + esc(t) + '</td>';
    }

    function celdaEdicion(c, e, i) {
        var v = e.datos[c.k];
        var cls = i === 0 ? ' class="an-cat-clave"' : '';
        if (c.soloLectura) return '<td' + cls + '>' + (c.auto && !e.id ? '<span class="an-ayuda">(automático)</span>' : esc(refTexto(c, v))) + '</td>';
        var inv = e.errores[c.k] ? ' invalido' : '';
        var tit = e.errores[c.k] ? ' title="' + esc(e.errores[c.k]) + '"' : '';
        var bloqueada = e.bloqueado && c.fijaBloqueo;
        var h;
        if (c.tipo === 'bool') {
            h = '<input type="checkbox" data-k="' + c.k + '"' + (v ? ' checked' : '') + ' aria-label="' + esc(c.titulo) + '">';
        } else if (c.tipo === 'ref' || c.tipo === 'lista') {
            var ops = st.refs[c.ref] || [];
            var hay = v === null || v === '' || ops.some(function (o) { return String(o.id) === String(v); });
            h = '<select data-k="' + c.k + '" class="an-catgen-in' + inv + '"' + tit + ' aria-label="' + esc(c.titulo) + '">'
                + '<option value="">' + (c.requerido ? 'Elige…' : '—') + '</option>'
                + (hay ? '' : '<option value="' + esc(v) + '" selected>' + esc(v) + ' (no está en el catálogo)</option>')
                + ops.map(function (o) {
                    return '<option value="' + esc(o.id) + '"' + (String(o.id) === String(v) ? ' selected' : '') + '>'
                        + esc(o.texto) + (o.extra && c.tipo === 'lista' ? ' (' + esc(o.extra) + ')' : '') + '</option>';
                }).join('') + '</select>';
        } else {
            h = '<input type="' + (c.tipo === 'correo' ? 'email' : c.tipo === 'url' ? 'url' : 'text') + '" data-k="' + c.k + '"'
                + ' class="an-catgen-in' + inv + (c.mayus ? ' an-mayus' : '') + '"' + tit
                + (c.max ? ' maxlength="' + c.max + '"' : '') + (bloqueada ? ' readonly' : '')
                + ' value="' + esc(v == null ? '' : v) + '" aria-label="' + esc(c.titulo) + '">';
        }
        return '<td' + cls + '>' + h + '</td>';
    }

    function filaEdicion(e) {
        return '<tr class="an-fila sel an-editando" data-id="' + (e.id || '') + '">'
            + st.cat.cols.map(function (c, i) { return celdaEdicion(c, e, i); }).join('')
            + '<td class="an-col-acc"><span class="an-acciones-fila">'
            + '<button type="button" data-acc="listo" title="Listo (Enter)" aria-label="Guardar">✓</button>'
            + '<button type="button" data-acc="cancelar" title="Cancelar (Esc)" aria-label="Cancelar">✕</button>'
            + '</span></td></tr>';
    }

    function pintar() {
        var e = st.edicion;
        var q = filtro.value, m = AN.ui.modo(filtro);
        st.vistos = st.items.filter(function (f) {
            return (e && e.id === f.id) || AN.ui.coincide(st.cat.cols.map(function (c) { return textoCelda(c, f); }), q, m);
        });
        var html = e && !e.id ? filaEdicion(e) : '';
        st.vistos.forEach(function (f) {
            if (e && e.id === f.id) { html += filaEdicion(e); return; }
            var sel = f.id === st.sel;
            html += '<tr class="an-fila' + (sel ? ' sel' : '') + (f.bloqueado ? ' an-bloqueado' : '') + '" data-id="' + f.id + '" aria-selected="' + sel + '"'
                + (f.bloqueado && st.cat.avisoBloqueo ? ' title="' + esc(st.cat.avisoBloqueo) + '"' : '') + '>'
                + st.cat.cols.map(function (c, i) { return celdaVista(c, f, i); }).join('') + '<td class="an-col-acc"></td></tr>';
        });
        if (!html) html = '<tr class="an-vacio"><td colspan="' + (st.cat.cols.length + 1) + '">'
            + (q.trim() ? 'Ningún registro coincide con el filtro.' : 'La cuadrícula no tiene datos.') + '</td></tr>';
        tbody.innerHTML = html;
        $('cgTotal').textContent = st.items.length;
        $('cgMostrando').textContent = st.vistos.length !== st.items.length ? 'Mostrando ' + st.vistos.length : '';
        var f = item(st.sel);
        $('cgEditar').disabled = !!e || !f;
        $('cgBorrar').disabled = !!e || !f || f.bloqueado;
        $('cgNuevo').disabled = !!e;
        if (e && !e.enfocado) {
            e.enfocado = true;
            var tr = tbody.querySelector('tr.an-editando');
            var primero = tr && tr.querySelector('input:not([readonly]):not([type=checkbox]), select');
            if (tr) tr.scrollIntoView({ block: 'nearest' });
            if (primero) { primero.focus(); if (primero.select) primero.select(); }
        } else if (!e) {
            var s = tbody.querySelector('tr.sel');
            if (s) s.scrollIntoView({ block: 'nearest' });
        }
    }

    // ---------- Datos ----------
    async function cargar(seleccionar) {
        try {
            var r = await AN.api.get(API);
            st.cat = r.catalogo; st.items = r.items; st.refs = r.refs || {}; st.puede = !!r.puede_cambiar;
            if (seleccionar) st.sel = seleccionar;
            if (!item(st.sel)) st.sel = null;
            $('cgNuevo').hidden = !st.puede || st.cat.sinAlta;
            $('cgEditar').hidden = !st.puede;
            $('cgBorrar').hidden = !st.puede || st.cat.sinBaja;
            $('cgPegar').hidden = !st.puede;
            var nota = $('cgNota');
            nota.hidden = !st.cat.nota;
            nota.textContent = st.cat.nota || '';
            encabezado();
            pintar();
        } catch (err) {
            tbody.innerHTML = '<tr class="an-vacio"><td>' + esc(err.message) + '</td></tr>';
            estado(err.message, 'error');
        }
    }

    // ---------- Altas, cambios y bajas ----------
    function nuevo() {
        if (!st.puede || st.cat.sinAlta || st.edicion) return;
        var datos = {};
        st.cat.cols.forEach(function (c) { datos[c.k] = c.tipo === 'bool' ? false : null; });
        st.edicion = { id: null, datos: datos, errores: {} };
        estado(''); pintar();
    }
    function editar(id) {
        var f = item(id || st.sel);
        if (!st.puede || !f || st.edicion) return;
        st.sel = f.id;
        st.edicion = { id: f.id, datos: Object.assign({}, f), errores: {}, bloqueado: f.bloqueado };
        estado(f.bloqueado && st.cat.avisoBloqueo ? st.cat.avisoBloqueo : ''); pintar();
    }
    function cancelar() { st.edicion = null; estado(''); pintar(); }

    function leerEdicion() {
        var e = st.edicion, tr = tbody.querySelector('tr.an-editando');
        editables().forEach(function (c) {
            var el = tr && tr.querySelector('[data-k="' + c.k + '"]');
            if (!el) return;
            if (c.tipo === 'bool') e.datos[c.k] = el.checked;
            else if (c.tipo === 'ref') e.datos[c.k] = el.value ? Number(el.value) : null;
            else e.datos[c.k] = c.mayus ? el.value.trim().toUpperCase() : el.value.trim();
        });
    }

    async function guardar() {
        var e = st.edicion;
        if (!e || e.guardando) return;
        leerEdicion();
        e.errores = {};
        editables().forEach(function (c) {
            var v = e.datos[c.k];
            if (c.requerido && (v === null || v === '')) e.errores[c.k] = 'Es obligatorio.';
        });
        if (Object.keys(e.errores).length) { e.enfocado = false; pintar(); estado('Llena las columnas obligatorias (*).', 'error'); return; }
        var datos = {};
        editables().forEach(function (c) { datos[c.k] = e.datos[c.k]; });
        e.guardando = true;
        estado('Guardando…', 'info');
        try {
            var r = await AN.api.post(API, { accion: 'guardar', id: e.id, datos: datos });
            st.edicion = null;
            estado(e.id ? 'Cambio guardado.' : 'Registro agregado.', 'ok');
            await cargar(r.id);
        } catch (err) {
            e.guardando = false;
            e.errores = err.errores || {};
            e.enfocado = false;
            pintar();
            estado(err.message, 'error');
        }
    }

    async function borrar() {
        var f = item(st.sel);
        if (!st.puede || st.cat.sinBaja || !f || f.bloqueado || st.edicion) return;
        var nombre = textoCelda(st.cat.cols.find(function (c) { return !c.soloLectura; }) || st.cat.cols[0], f);
        if (!(await AN.ui.confirmar({ titulo: 'Borrar registro', mensaje: '¿Borrar ' + st.cat.singular + ' «' + nombre + '» del catálogo?', aceptar: 'Borrar', peligro: true }))) return;
        try {
            await AN.api.post(API, { accion: 'eliminar', id: f.id });
            st.sel = null;
            estado('Registro borrado.', 'ok');
            await cargar();
        } catch (err) { estado(err.message, 'error'); AN.ui.aviso(err.message, 'error'); }
    }

    // ---------- Pegar de Excel ----------
    function quitarAcentos(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\*/g, '').trim(); }

    async function pegarTexto(texto) {
        if (!st.puede || st.edicion) return;
        var lineas = String(texto || '').replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() !== ''; });
        if (!lineas.length) return;
        var cols = colsPegar();
        var filas = lineas.map(function (l) { return l.split('\t'); });
        // Si el primer renglón son los encabezados, se brinca
        if (filas[0].some(function (t, i) { return cols[i] && quitarAcentos(t) === quitarAcentos(cols[i].titulo); })) filas.shift();
        if (!filas.length) return;
        var datos = filas.map(function (celdas) {
            var o = {};
            cols.forEach(function (c, i) { if (i < celdas.length) o[c.k] = celdas[i].trim(); });
            return o;
        });
        var ok = await AN.ui.confirmar({
            titulo: 'Pegar de Excel',
            mensaje: '¿Pegar ' + datos.length + ' renglón(es) en el catálogo ' + st.cat.titulo + '? Las columnas se toman en este orden: '
                + cols.map(function (c) { return c.titulo; }).join(', ') + '. Si la clave ya existe se actualiza; si no, se da de alta.',
            aceptar: 'Pegar'
        });
        if (!ok) return;
        estado('Pegando…', 'info');
        try {
            var r = await AN.api.post(API, { accion: 'pegar', filas: datos });
            var msg = r.altas + ' alta(s) y ' + r.cambios + ' cambio(s).';
            if (r.errores.length) {
                estado(msg + ' ' + r.errores.length + ' con error.', 'error');
                AN.ui.aviso(r.errores.slice(0, 5).join(' · ') + (r.errores.length > 5 ? ' · …' : ''), 'error', 12000);
            } else estado(msg, 'ok');
            await cargar();
        } catch (err) { estado(err.message, 'error'); }
    }

    // ---------- Exportar a Excel ----------
    function exportar() {
        var cols = st.cat.cols;
        var filas = [cols.map(function (c) { return c.titulo; })].concat(st.vistos.map(function (f) {
            return cols.map(function (c) { return textoCelda(c, f); });
        }));
        if (filas.length < 2) { AN.ui.aviso('No hay renglones para exportar.', 'error'); return; }
        var nombre = 'Catálogo ' + st.cat.titulo;
        var blob = window.XlsxSimple.crear({ nombre: st.cat.titulo, anchos: cols.map(function (c) { return Math.max(10, Math.round((c.ancho || 300) / 7)); }), filas: filas });
        window.XlsxSimple.descargar(blob, nombre + '.xlsx');
    }

    // ---------- Eventos ----------
    filtro.addEventListener('input', AN.ui.retrasar(pintar, 150));
    filtro.addEventListener('modo', pintar);
    $('cgNuevo').addEventListener('click', nuevo);
    $('cgEditar').addEventListener('click', function () { editar(); });
    $('cgBorrar').addEventListener('click', borrar);
    $('cgExcel').addEventListener('click', exportar);
    $('cgRefrescar').addEventListener('click', function () { if (!st.edicion) { estado(''); cargar(); } });
    $('cgPegar').addEventListener('click', async function () {
        try { await pegarTexto(await navigator.clipboard.readText()); }
        catch (e) { AN.ui.aviso('El navegador no dejó leer el portapapeles: haz clic en la cuadrícula y usa Ctrl+V.', 'info', 6000); }
    });

    tbody.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-acc]');
        if (b) { if (b.dataset.acc === 'listo') guardar(); else cancelar(); return; }
        var tr = ev.target.closest('tr.an-fila');
        if (!tr || st.edicion || ev.target.closest('a')) return;
        st.sel = Number(tr.dataset.id);
        pintar();
    });
    tbody.addEventListener('dblclick', function (ev) {
        var tr = ev.target.closest('tr.an-fila');
        if (tr && !st.edicion) editar(Number(tr.dataset.id));
    });
    tbody.addEventListener('keydown', function (ev) {
        if (!st.edicion) return;
        if (ev.key === 'Enter') { ev.preventDefault(); guardar(); }
        else if (ev.key === 'Escape') { ev.preventDefault(); cancelar(); }
    });
    document.addEventListener('keydown', function (ev) {
        if (st.edicion || !st.cat || document.querySelector('dialog[open]')) return;
        var enCampo = /^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName);
        if (ev.key === 'Insert') { ev.preventDefault(); nuevo(); return; }
        if (enCampo) return;
        if (ev.key === 'F2') { ev.preventDefault(); editar(); }
        else if (ev.key === 'Delete') { ev.preventDefault(); borrar(); }
        else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
            if (!st.vistos.length) return;
            ev.preventDefault();
            var i = st.vistos.findIndex(function (f) { return f.id === st.sel; });
            i = ev.key === 'ArrowDown' ? Math.min(st.vistos.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
            st.sel = st.vistos[i].id;
            pintar();
        }
    });
    document.addEventListener('paste', function (ev) {
        if (/^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName) || document.querySelector('dialog[open]')) return;
        var t = ev.clipboardData && ev.clipboardData.getData('text/plain');
        if (!t) return;
        ev.preventDefault();
        pegarTexto(t);
    });
    // Con una fila a medio editar, avisa antes de cerrar la pestaña
    window.addEventListener('beforeunload', function (ev) { if (st.edicion) { ev.preventDefault(); ev.returnValue = ''; } });

    cargar();
})(window.AcriNeo = window.AcriNeo || {});
