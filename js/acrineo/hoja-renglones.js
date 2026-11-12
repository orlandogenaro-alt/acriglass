// ACRINEO · Conceptos de la partida seleccionada (arriba a la derecha).
// Lápiz = modo edición: «Agregar registro» abre un renglón para Código, Descripción, Unidad, Cantidad y Costo; si el
// código ya está en el catálogo del presupuesto, se llenan sus datos. GUARDAR manda todo junto (y el concepto queda en
// el catálogo de abajo); CANCELAR descarta; ↶ / ↷ (Ctrl+Z / Ctrl+Y) deshacen y rehacen dentro de la edición.
// Precio = costo × (1 + % sobrecosto), o el precio fijo si el concepto es P.A. (precio alzado). Si el concepto tiene
// matriz (botón P.U.), su costo sale de ella y aquí no se captura.
(function (AN) {
    'use strict';

    var H = AN.hoja;
    if (!H) return;
    var $ = function (id) { return document.getElementById(id); };
    var esc = AN.ui.esc;
    var tbody = $('anRenglones');
    var COLS = 12;
    var CAMPOS = ['codigo', 'descripcion', 'unidad', 'cantidad', 'costo', 'precio_alzado', 'precio_fijo', 'url', 'tipo'];
    var ICONO_URL = '<svg class="i" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
    var urlValida = function (u) { return /^https?:\/\/\S+$/i.test(String(u || '').trim()); };

    // Botón de la columna URL: abre el enlace del concepto en otra pestaña (solo http/https)
    function botonUrl(url) {
        return urlValida(url)
            ? '<a class="an-btn-url" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(url) + '" aria-label="Abrir el enlace del concepto">' + ICONO_URL + '</a>'
            : '<span class="an-btn-url vacia" title="Sin enlace">' + ICONO_URL + '</span>';
    }

    var st = { filas: [], editando: false, borradores: [], quitar: new Set(), marcados: new Set(), sec: 0, guardando: false, cargando: 0,
               deshacer: [], rehacer: [], fotoPendiente: null };

    function partidaTexto(p) { return p ? p.codigo + ' · ' + p.descripcion : 'Selecciona una partida'; }
    function txt(v) { return v === true ? '1' : v === false ? '' : String(v == null ? '' : v).trim(); }

    function pendiente() {
        if (!st.editando) return false;
        if (st.quitar.size) return true;
        return st.borradores.some(function (b) { return !b.renglon_id || modificado(b); });
    }
    function modificado(b) {
        if (!b.original) return true;
        return CAMPOS.some(function (k) { return txt(b[k]) !== txt(b.original[k]); });
    }
    H.renglonesPendientes = pendiente;

    function precioDe(b) { return b.precio_alzado ? H.redondear(Number(b.precio_fijo) || 0, H.ctx.dec_costos) : H.precio(b.costo); }

    // ---------- Deshacer / rehacer ----------
    function foto() { return JSON.stringify({ b: st.borradores, q: Array.from(st.quitar), s: st.sec }); }
    function guardarFoto(f) {
        st.deshacer.push(f || foto());
        if (st.deshacer.length > 100) st.deshacer.shift();
        st.rehacer = [];
        botones();
    }
    function restaurar(f) {
        // Se vuelve a poner el foco en el mismo campo (la cuadrícula se redibuja)
        var a = document.activeElement, tr = a && a.closest ? a.closest('tr[data-clave]') : null;
        var donde = tr && a.dataset.k ? { clave: tr.dataset.clave, k: a.dataset.k } : null;
        var o = JSON.parse(f);
        st.borradores = o.b;
        st.quitar = new Set(o.q);
        st.sec = o.s;
        st.marcados.clear();
        pintar();
        var i = donde && tbody.querySelector('tr[data-clave="' + donde.clave + '"] [data-k="' + donde.k + '"]');
        if (i) { i.focus(); st.fotoPendiente = null; }
    }
    function deshacer() { if (!st.deshacer.length) return; st.rehacer.push(foto()); restaurar(st.deshacer.pop()); }
    function rehacer() { if (!st.rehacer.length) return; st.deshacer.push(foto()); restaurar(st.rehacer.pop()); }

    // ---------- Carga ----------
    async function cargar(p) {
        salirEdicion();
        $('anPartidaActual').textContent = partidaTexto(p);
        $('anPartidaActual').title = partidaTexto(p);
        st.filas = [];
        if (!p) { pintar(); return; }
        var n = ++st.cargando;
        tbody.innerHTML = '<tr class="an-vacio"><td colspan="' + COLS + '">Cargando…</td></tr>';
        try {
            var r = await AN.api.get(H.url({ partida: p.id }));
            if (n !== st.cargando) return;
            H.ctx = r.presupuesto;
            st.filas = r.renglones || [];
            pintar();
        } catch (e) {
            tbody.innerHTML = '<tr class="an-vacio"><td colspan="' + COLS + '">' + esc(e.message) + '</td></tr>';
        }
    }

    // ---------- Pintar ----------
    function cantidad(n) { return (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: H.ctx.dec_cantidades, maximumFractionDigits: H.ctx.dec_cantidades }); }
    function botonPU(r) {
        return '<button type="button" class="an-btn-pu' + (r.matriz ? '' : ' vacia') + '" data-pu="' + r.concepto_id + '" title="' + (r.matriz ? 'Ver la matriz de precio unitario' : 'Armar la matriz de precio unitario') + '">'
            + (r.matriz ? 'P.U.' : '+ P.U.') + '</button>';
    }

    function pintar() {
        var p = H.partida();
        var html = '';
        if (st.editando) {
            st.borradores.forEach(function (b) {
                if (b.renglon_id && st.quitar.has(b.renglon_id)) return;
                var precio = precioDe(b), importe = H.redondear(Number(b.cantidad) * precio, H.ctx.dec_costos);
                html += '<tr class="an-fila' + (!b.renglon_id ? ' nuevo-renglon' : modificado(b) ? ' modificado' : '') + '" data-clave="' + b.clave + '">'
                    + '<td class="an-col-sel"><input type="checkbox" data-marcar="' + b.clave + '"' + (st.marcados.has(b.clave) ? ' checked' : '') + ' aria-label="Marcar renglón"></td>'
                    + '<td><input class="an-celda-in" type="url" data-k="url" value="' + esc(b.url) + '" maxlength="500" placeholder="https://…" aria-label="URL del concepto"></td>'
                    + '<td class="an-col-pa"><input type="checkbox" data-k="precio_alzado"' + (b.precio_alzado ? ' checked' : '') + ' aria-label="Precio alzado (P.A.)" title="P.A.: precio unitario fijo"></td>'
                    + celda(b, 'codigo', 'text', 30) + celda(b, 'descripcion', 'text', 4000) + celda(b, 'unidad', 'text', 20)
                    + celda(b, 'cantidad', 'number', null, 'num')
                    + (b.matriz ? '<td class="num" title="Sale de su matriz de P.U.">' + AN.ui.dinero(b.costo) + '<span class="an-insignia">M</span></td>' : celda(b, 'costo', 'number', null, 'num'))
                    // Precio siempre editable: escribirlo lo deja fijo (P.A.); vacío vuelve a costo × sobrecosto
                    + '<td><input class="an-celda-in num" type="number" data-k="precio_fijo" min="0" step="any" inputmode="decimal" value="'
                    + esc(b.precio_alzado ? b.precio_fijo : String(precio)) + '" title="' + (b.precio_alzado ? 'Precio fijo (P.A.). Bórralo para volver a costo × sobrecosto.' : 'Calculado: costo × (1 + % sobrecosto). Escríbelo para fijarlo (P.A.).')
                    + '" aria-label="Precio"></td>'
                    + '<td class="num" data-importe>' + AN.ui.dinero(importe) + '</td>'
                    + '<td><input class="an-celda-in num" type="number" data-k="tipo" value="' + esc(b.tipo) + '" min="0" max="99" step="1" inputmode="numeric" aria-label="Tipo"></td><td></td></tr>';
            });
        } else {
            st.filas.forEach(function (r) {
                html += '<tr class="an-fila" data-renglon="' + r.renglon_id + '">'
                    + '<td class="an-col-sel"></td><td class="an-col-url">' + botonUrl(r.url) + '</td><td class="an-col-pa">' + (r.precio_alzado ? '<span class="an-pa" title="Precio alzado">✕</span>' : '') + '</td>'
                    + '<td>' + esc(r.codigo) + '</td><td class="an-desc">' + esc(r.descripcion) + '</td><td>' + esc(r.unidad || '') + '</td>'
                    + '<td class="num">' + cantidad(r.cantidad) + '</td><td class="num">' + AN.ui.dinero(r.costo) + (r.matriz ? '<span class="an-insignia" title="Costo de su matriz de P.U.">M</span>' : '') + '</td>'
                    + '<td class="num">' + AN.ui.dinero(r.precio) + '</td><td class="num">' + AN.ui.dinero(r.importe) + '</td>'
                    + '<td class="num">' + esc(r.tipo) + '</td><td>' + botonPU(r) + '</td></tr>';
            });
        }
        if (!html) {
            html = '<tr class="an-vacio"><td colspan="' + COLS + '">' + (p ? 'La cuadrícula no tiene datos.' : 'Selecciona o crea una partida a la izquierda.')
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
                t += H.redondear(Number(b.cantidad) * precioDe(b), H.ctx.dec_costos);
            });
        } else st.filas.forEach(function (r) { t += r.importe; });
        $('anRenglonesTotal').textContent = AN.ui.dinero(t);
    }

    function botones() {
        if (!H.puede) return;
        var p = H.partida();
        $('anEditarRenglones').disabled = !p || st.guardando;
        $('anEditarRenglones').setAttribute('aria-pressed', String(st.editando));
        ['anAgregarRenglon', 'anCancelarRenglones', 'anGuardarRenglones', 'anDeshacer', 'anRehacer'].forEach(function (id) { $(id).hidden = !st.editando; });
        $('anQuitarRenglones').hidden = !st.editando || !st.marcados.size;
        $('anGuardarRenglones').disabled = st.guardando || !pendiente();
        $('anDeshacer').disabled = !st.deshacer.length;
        $('anRehacer').disabled = !st.rehacer.length;
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
        st.deshacer = [];
        st.rehacer = [];
        st.borradores = st.filas.map(function (r) {
            var b = { clave: 'r' + r.renglon_id, renglon_id: r.renglon_id, matriz: r.matriz };
            ['codigo', 'descripcion', 'unidad', 'cantidad', 'costo'].forEach(function (k) { b[k] = r[k] == null ? '' : String(r[k]); });
            b.precio_alzado = !!r.precio_alzado;
            b.precio_fijo = r.precio_fijo == null ? '' : String(r.precio_fijo);
            b.url = r.url || '';
            b.tipo = String(r.tipo == null ? 4 : r.tipo);
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
        st.deshacer = [];
        st.rehacer = [];
        estado('');
    }

    function agregar() {
        guardarFoto();
        var b = { clave: 'n' + (++st.sec), renglon_id: null, matriz: false, codigo: '', descripcion: '', unidad: '', cantidad: '1', costo: '0', precio_alzado: false, precio_fijo: '', url: '', tipo: '4' };
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

    // Código que ya está en el catálogo del presupuesto: trae su descripción, unidad, costo y P.A.
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
            b.matriz = c.matriz;
            if (!String(b.url).trim() && c.url) b.url = c.url;
            if (String(b.tipo) === '4' && c.tipo != null) b.tipo = String(c.tipo);
            if (c.precio_alzado && !b.precio_alzado) { b.precio_alzado = true; b.precio_fijo = String(c.precio_fijo == null ? '' : c.precio_fijo); }
            pintar();
            estado('«' + c.codigo + '» ya está en el catálogo: se usan sus datos (si los cambias, cambian en todas sus partidas).', 'info');
        } catch (e) { /* sin autollenado */ }
    }

    function recalcular(b, tr) {
        var precio = precioDe(b);
        // Sin precio fijo, el precio sigue al costo (si no se está escribiendo en él)
        var inPrecio = tr.querySelector('input[data-k="precio_fijo"]');
        if (inPrecio && !b.precio_alzado && document.activeElement !== inPrecio) inPrecio.value = String(precio);
        if (inPrecio) inPrecio.title = b.precio_alzado ? 'Precio fijo (P.A.). Bórralo para volver a costo × sobrecosto.' : 'Calculado: costo × (1 + % sobrecosto). Escríbelo para fijarlo (P.A.).';
        var pa = tr.querySelector('input[data-k="precio_alzado"]');
        if (pa) pa.checked = !!b.precio_alzado;
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
        var noNeg = function (v) { return String(v).trim() !== '' && Number(v) >= 0; };
        tbody.querySelectorAll('input.invalido').forEach(function (i) { i.classList.remove('invalido'); });
        enviar.forEach(function (b) {
            var tr = tbody.querySelector('tr[data-clave="' + b.clave + '"]');
            [['codigo', !String(b.codigo).trim()], ['descripcion', !String(b.descripcion).trim()], ['cantidad', !noNeg(b.cantidad)],
             ['costo', !b.matriz && !noNeg(b.costo)], ['precio_fijo', b.precio_alzado && !noNeg(b.precio_fijo)],
             ['url', String(b.url).trim() !== '' && !urlValida(b.url)], ['tipo', !/^\d{1,2}$/.test(String(b.tipo).trim())]]
                .forEach(function (x) { if (x[1]) { malos++; var i = tr && tr.querySelector('input[data-k="' + x[0] + '"]'); if (i) { i.classList.add('invalido'); i.title = 'Es obligatorio (y no negativo).'; } } });
        });
        if (malos) { estado('Revisa los renglones marcados: código, descripción, cantidad y costo (o precio si es P.A.) son obligatorios; la URL debe empezar con http:// o https:// y el Tipo es un número de 0 a 99.', 'error'); return; }

        st.guardando = true;
        botones();
        estado('Guardando…', 'info');
        try {
            var r = await AN.api.post(H.url(), {
                accion: 'renglones_guardar', partida_id: p.id,
                filas: enviar.map(function (b) {
                    var f = { renglon_id: b.renglon_id, precio_alzado: !!b.precio_alzado, precio_fijo: b.precio_alzado ? String(b.precio_fijo).trim() : null };
                    ['codigo', 'descripcion', 'unidad', 'cantidad', 'costo', 'url', 'tipo'].forEach(function (k) { f[k] = String(b[k]).trim(); });
                    return f;
                }),
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

    // Una foto para deshacer antes del primer cambio de cada campo
    tbody.addEventListener('focusin', function (e) { if (e.target.dataset.k) st.fotoPendiente = foto(); });
    tbody.addEventListener('input', function (e) {
        var k = e.target.dataset.k;
        if (!k || e.target.type === 'checkbox') return;
        if (st.fotoPendiente) { guardarFoto(st.fotoPendiente); st.fotoPendiente = null; }
        var tr = e.target.closest('tr[data-clave]');
        var b = borrador(tr.dataset.clave);
        b[k] = e.target.value;
        // Escribir el precio lo fija (P.A.); dejarlo vacío regresa al precio calculado
        if (k === 'precio_fijo') b.precio_alzado = e.target.value.trim() !== '';
        e.target.classList.remove('invalido');
        if (k === 'cantidad' || k === 'costo' || k === 'precio_fijo') recalcular(b, tr);
        else { tr.classList.toggle('modificado', !!b.renglon_id && modificado(b)); botones(); }
    });
    tbody.addEventListener('change', function (e) {
        var tr = e.target.closest('tr[data-clave]');
        if (!tr) return;
        if (e.target.dataset.k === 'codigo') completarPorCodigo(borrador(tr.dataset.clave), tr);
        if (e.target.dataset.k === 'precio_alzado') {
            guardarFoto();
            var b = borrador(tr.dataset.clave);
            b.precio_alzado = e.target.checked;
            if (b.precio_alzado && String(b.precio_fijo).trim() === '') b.precio_fijo = String(H.precio(b.costo));
            pintar();
            var i = tbody.querySelector('tr[data-clave="' + b.clave + '"] input[data-k="precio_fijo"]');
            if (i) { i.focus(); i.select(); }
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
    tbody.addEventListener('click', function (e) {
        if (e.target.closest('[data-agregar]')) { agregar(); return; }
        var pu = e.target.closest('[data-pu]');
        if (pu && AN.hojaMatriz) AN.hojaMatriz.abrir(+pu.dataset.pu);
    });
    $('anRenglonesTodos').addEventListener('change', function () {
        var si = this.checked;
        st.marcados.clear();
        if (si) st.borradores.forEach(function (b) { if (!(b.renglon_id && st.quitar.has(b.renglon_id))) st.marcados.add(b.clave); });
        tbody.querySelectorAll('input[data-marcar]').forEach(function (c) { c.checked = si; });
        botones();
    });
    // Ctrl+Z / Ctrl+Y mientras la cuadrícula está en edición (si no hay otra ventana abierta encima ni se escribe en otro lado)
    document.addEventListener('keydown', function (e) {
        if (!st.editando || !(e.ctrlKey || e.metaKey) || document.querySelector('dialog[open]')) return;
        var a = document.activeElement;
        if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !tbody.contains(a)) return;
        var k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); st.fotoPendiente = null; deshacer(); }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); rehacer(); }
    });

    if (H.puede) {
        $('anEditarRenglones').addEventListener('click', function () { if (st.editando) cancelarEdicion(); else entrarEdicion(); });
        $('anAgregarRenglon').addEventListener('click', agregar);
        $('anCancelarRenglones').addEventListener('click', cancelarEdicion);
        $('anGuardarRenglones').addEventListener('click', guardar);
        $('anDeshacer').addEventListener('click', function () { st.fotoPendiente = null; deshacer(); });
        $('anRehacer').addEventListener('click', rehacer);
        $('anQuitarRenglones').addEventListener('click', function () {
            guardarFoto();
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
