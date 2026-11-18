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
    var CAMPOS = ['codigo', 'descripcion', 'unidad', 'cantidad', 'costo', 'precio_alzado', 'precio_fijo', 'url', 'tipo', 'pendiente_analizar'];
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

    function partidaTexto(p) { return p ? p.codigo + '-' + p.descripcion : 'Selecciona una partida'; }

    // Filtro de conceptos de la barra de arriba (código, descripción o unidad); en edición se ven todos
    function pasaFiltro(r) {
        return AN.ui.coincide([r.codigo, r.descripcion, r.unidad], H.filtro && H.filtro.q, AN.ui.modo($('anFiltroQ')));
    }
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
    // Conceptos guardados de la partida, en su orden (Anterior / Siguiente de la matriz)
    H.conceptosPartida = function () { return st.filas.map(function (r) { return r.concepto_id; }); };

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
                    + '<td class="an-col-pa"><input type="checkbox" data-k="pendiente_analizar"' + (b.pendiente_analizar ? ' checked' : '') + ' aria-label="Pendiente de analizar (P.A.)" title="P.A.: pendiente de analizar"></td>'
                    + celda(b, 'codigo', 'text', 30) + celda(b, 'descripcion', 'text', 4000)
                    // Unidad: se escribe o se elige con la lupa del «Catálogo Unidades»
                    + '<td><span class="an-celda-unidad"><input class="an-celda-in" type="text" data-k="unidad" value="' + esc(b.unidad) + '" maxlength="20" aria-label="Unidad">'
                    + '<button type="button" class="an-btn-buscar" data-unidad title="Catálogo Unidades" aria-label="Buscar en el catálogo de unidades">'
                    + '<svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button></span></td>'
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
                if (!pasaFiltro(r)) return;
                html += '<tr class="an-fila" data-renglon="' + r.renglon_id + '">'
                    + '<td class="an-col-sel"></td><td class="an-col-url">' + botonUrl(r.url) + '</td><td class="an-col-pa">' + (r.pendiente_analizar ? '<span class="an-pa si" title="Pendiente de analizar">✓</span>' : '<span class="an-pa" title="Analizado (no pendiente)">✕</span>') + '</td>'
                    + '<td>' + esc(r.codigo) + '</td><td class="an-desc">' + esc(r.descripcion) + '</td><td>' + esc(r.unidad || '') + '</td>'
                    + '<td class="num">' + cantidad(r.cantidad) + '</td><td class="num">' + AN.ui.dinero(r.costo) + (r.matriz ? '<span class="an-insignia" title="Costo de su matriz de P.U.">M</span>' : '') + '</td>'
                    + '<td class="num">' + AN.ui.dinero(r.precio) + (r.precio_alzado ? '<span class="an-insignia" title="Precio fijo (capturado, no sale de costo × sobrecosto)">Fijo</span>' : '') + '</td><td class="num">' + AN.ui.dinero(r.importe) + '</td>'
                    + '<td class="num">' + esc(r.tipo) + '</td><td>' + botonPU(r) + '</td></tr>';
            });
        }
        if (!html && !st.editando && st.filas.length && H.filtro && H.filtro.q) {
            html = '<tr class="an-vacio"><td colspan="' + COLS + '">Ningún concepto de esta partida coincide con «' + esc(H.filtro.q) + '».</td></tr>';
        } else if (!html) {
            html = '<tr class="an-vacio"><td colspan="' + COLS + '">' + (p ? 'La cuadrícula no tiene datos.' : 'Selecciona o crea una partida a la izquierda.')
                + (p && st.editando ? '<br><button type="button" class="an-btn an-primario" data-agregar title="Alt+N">Agregar registro</button>'
                    : p && H.puede ? '<br><small class="an-ayuda">Usa el lápiz para agregar conceptos, o cópialos del catálogo de abajo.</small>' : '')
                + '</td></tr>';
        }
        tbody.innerHTML = html;
        tbody.querySelectorAll('textarea.an-celda-desc').forEach(crecer);
        if (!st.editando && H.filtro && H.filtro.q && st.filas.length) {
            var n = st.filas.filter(pasaFiltro).length;
            estado('Filtro «' + H.filtro.q + '»: ' + n + ' de ' + st.filas.length + ' concepto' + (st.filas.length === 1 ? '' : 's') + '.', 'info');
        } else if (!st.editando && /^Filtro «/.test($('anRenglonesEstado').textContent)) estado('');
        $('anRenglonesTodos').disabled = !st.editando;
        $('anRenglonesTodos').checked = false;
        total();
        botones();
    }

    function celda(b, k, tipo, max, clase) {
        var v = b[k] == null ? '' : b[k];
        if (k === 'descripcion') {
            return '<td class="an-desc"><textarea class="an-celda-in an-celda-desc" data-k="descripcion" maxlength="' + max + '" rows="1" aria-label="descripcion">' + esc(v) + '</textarea></td>';
        }
        return '<td' + (k === 'descripcion' ? ' class="an-desc"' : '') + '><input class="an-celda-in ' + (clase || '') + '" type="' + tipo + '" data-k="' + k + '" value="' + esc(v) + '"'
            + (max ? ' maxlength="' + max + '"' : ' min="0" step="any" inputmode="decimal"') + ' aria-label="' + k + '"></td>';
    }

    // El cuadro de la descripción muestra todo el texto (crece con sus renglones)
    function crecer(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; }

    function total() {
        var t = 0;
        if (st.editando) {
            st.borradores.forEach(function (b) {
                if (b.renglon_id && st.quitar.has(b.renglon_id)) return;
                t += H.redondear(Number(b.cantidad) * precioDe(b), H.ctx.dec_costos);
            });
        } else st.filas.forEach(function (r) { if (pasaFiltro(r)) t += r.importe; });
        $('anRenglonesTotal').textContent = AN.ui.dinero(t);
    }

    function botones() {
        if (!H.puede) return;
        var p = H.partida();
        $('anEditarRenglones').disabled = !p || st.guardando;
        $('anEditarRenglones').setAttribute('aria-pressed', String(st.editando));
        $('anAgregarRenglon').hidden = !st.editando;
        $('anCancelarRenglones').disabled = !st.editando || st.guardando;
        $('anQuitarRenglones').disabled = !st.editando || !st.marcados.size;
        $('anGuardarRenglones').disabled = !st.editando || st.guardando || !pendiente();
        $('anDeshacer').disabled = !st.editando || !st.deshacer.length;
        $('anRehacer').disabled = !st.editando || !st.rehacer.length;
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
            b.pendiente_analizar = !!r.pendiente_analizar;
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
        var b = { clave: 'n' + (++st.sec), renglon_id: null, matriz: false, codigo: '', descripcion: '', unidad: '', cantidad: '1', costo: '0', precio_alzado: false, precio_fijo: '', url: '', tipo: '4', pendiente_analizar: false };
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
        tbody.querySelectorAll('.invalido').forEach(function (i) { i.classList.remove('invalido'); });
        enviar.forEach(function (b) {
            var tr = tbody.querySelector('tr[data-clave="' + b.clave + '"]');
            [['codigo', !String(b.codigo).trim()], ['descripcion', !String(b.descripcion).trim()], ['cantidad', !noNeg(b.cantidad)],
             ['costo', !b.matriz && !noNeg(b.costo)], ['precio_fijo', b.precio_alzado && !noNeg(b.precio_fijo)],
             ['url', String(b.url).trim() !== '' && !urlValida(b.url)], ['tipo', !/^\d{1,2}$/.test(String(b.tipo).trim())]]
                .forEach(function (x) { if (x[1]) { malos++; var i = tr && tr.querySelector('[data-k="' + x[0] + '"]'); if (i) { i.classList.add('invalido'); i.title = 'Es obligatorio (y no negativo).'; } } });
        });
        if (malos) { estado('Revisa los renglones marcados: código, descripción, cantidad y costo (o precio si es P.A.) son obligatorios; la URL debe empezar con http:// o https:// y el Tipo es un número de 0 a 99.', 'error'); return; }

        st.guardando = true;
        botones();
        estado('Guardando…', 'info');
        try {
            var r = await AN.api.post(H.url(), {
                accion: 'renglones_guardar', partida_id: p.id,
                filas: enviar.map(function (b) {
                    var f = { renglon_id: b.renglon_id, precio_alzado: !!b.precio_alzado, precio_fijo: b.precio_alzado ? String(b.precio_fijo).trim() : null, pendiente_analizar: !!b.pendiente_analizar };
                    ['codigo', 'descripcion', 'unidad', 'cantidad', 'costo', 'url', 'tipo'].forEach(function (k) { f[k] = String(b[k]).trim(); });
                    return f;
                }),
                quitar: Array.from(st.quitar)
            });
            st.guardando = false;
            // Guardado: la cuadrícula queda en solo lectura; para volver a modificar se usa el lápiz
            salirEdicion();
            st.filas = r.renglones || [];
            H.aplicar(r);
            pintar();
            estado('Guardado correctamente', 'ok');
            AN.ui.aviso('Conceptos de la partida ' + p.codigo + ' guardados.', 'ok');
        } catch (e) {
            st.guardando = false;
            Object.keys(e.errores || {}).forEach(function (k) {
                var m = /^filas\.(\d+)\.(\w+)$/.exec(k);
                if (!m || !enviar[+m[1]]) return;
                var i = tbody.querySelector('tr[data-clave="' + enviar[+m[1]].clave + '"] [data-k="' + m[2] + '"]');
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
        else if (evento === 'filtro') pintar();
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
        if (e.target.tagName === 'TEXTAREA') crecer(e.target);
        if (k === 'cantidad' || k === 'costo' || k === 'precio_fijo') recalcular(b, tr);
        else { tr.classList.toggle('modificado', !!b.renglon_id && modificado(b)); botones(); }
    });
    tbody.addEventListener('change', function (e) {
        var tr = e.target.closest('tr[data-clave]');
        if (!tr) return;
        if (e.target.dataset.k === 'codigo') completarPorCodigo(borrador(tr.dataset.clave), tr);
        if (e.target.dataset.k === 'pendiente_analizar') {
            guardarFoto();
            var bp = borrador(tr.dataset.clave);
            bp.pendiente_analizar = e.target.checked;
            tr.classList.toggle('modificado', !!bp.renglon_id && modificado(bp));
            botones();
        }
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
        if (e.key === 'Enter' && e.target.tagName === 'TEXTAREA') return;   // renglón nuevo dentro de la descripción
        if (e.key === 'Enter') { e.preventDefault(); guardar(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancelarEdicion(); }
    });
    tbody.addEventListener('click', function (e) {
        if (e.target.closest('[data-agregar]')) { agregar(); return; }
        var lupa = e.target.closest('[data-unidad]');
        if (lupa && AN.unidades) {
            var tr = lupa.closest('tr[data-clave]');
            var b = borrador(tr.dataset.clave);
            AN.unidades.elegir(b.unidad).then(function (u) {
                if (u === null || u === b.unidad) return;
                guardarFoto();   // se puede deshacer
                b.unidad = u;
                var fila = tbody.querySelector('tr[data-clave="' + b.clave + '"]');
                if (!fila) return;
                var i = fila.querySelector('input[data-k="unidad"]');
                i.value = u;
                i.classList.remove('invalido');
                fila.classList.toggle('modificado', !!b.renglon_id && modificado(b));
                botones();
                i.focus();
            });
            return;
        }
        var pu = e.target.closest('[data-pu]');
        if (pu && AN.hojaMatriz) AN.hojaMatriz.abrir(+pu.dataset.pu);
    });
    // Doble clic en cualquier parte del concepto: abre su matriz en la pestaña «Matriz».
    // En edición no cuenta el doble clic dentro de un campo (sirve para seleccionar el texto).
    tbody.addEventListener('dblclick', function (e) {
        if (!AN.hojaMatriz || e.target.closest('input, select, textarea, button, a')) return;
        var tr = e.target.closest('tr[data-renglon], tr[data-clave]');
        if (!tr) return;
        var id = tr.dataset.renglon ? +tr.dataset.renglon : (borrador(tr.dataset.clave) || {}).renglon_id;
        var r = id && st.filas.find(function (x) { return x.renglon_id === id; });
        if (!r) { AN.ui.aviso('Guarda primero el concepto para armar su matriz.', 'error'); return; }
        var sel = window.getSelection && window.getSelection();
        if (sel && sel.removeAllRanges) sel.removeAllRanges();   // el doble clic selecciona una palabra
        AN.hojaMatriz.abrir(r.concepto_id);
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
        if (!st.editando || !(e.ctrlKey || e.metaKey) || document.querySelector('dialog[open]') || $('anHoja').hidden) return;
        var a = document.activeElement;
        if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !tbody.contains(a)) return;
        var k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); st.fotoPendiente = null; deshacer(); }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); rehacer(); }
    });

    // Alt+N: agrega un renglón (entra al modo edición si hace falta), uno tras otro
    if (H.puede) document.addEventListener('keydown', function (e) {
        if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.key.toLowerCase() !== 'n') return;
        if (document.querySelector('dialog[open]') || $('anHoja').hidden || !H.partida() || st.guardando) return;
        e.preventDefault();
        if (!st.editando) entrarEdicion();
        agregar();
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

    // Áreas de la hoja que se ocultan desde el ⋮ de los conceptos (como en Neodata); se recuerda en este navegador
    function verArea(area, si) {
        var cont = area === 'partidas' ? $('anHoja') : $('anHojaDerecha');
        cont.classList.toggle(area === 'partidas' ? 'sin-partidas' : 'sin-catalogo', !si);
        try { localStorage.setItem('acrineo.hoja.' + area, si ? '1' : '0'); } catch (e) { /* sin memoria */ }
    }
    function areaVisible(area) { return area === 'partidas' ? !$('anHoja').classList.contains('sin-partidas') : !$('anHojaDerecha').classList.contains('sin-catalogo'); }
    ['partidas', 'catalogo'].forEach(function (a) {
        var v = null;
        try { v = localStorage.getItem('acrineo.hoja.' + a); } catch (e) { /* sin memoria */ }
        if (v === '0') verArea(a, false);
    });

    function opcionesPartida() {
        var p = H.partida(), op = [];
        op.push({ texto: (areaVisible('partidas') ? 'Ocultar' : 'Mostrar') + ' el área de partidas', accion: function () { verArea('partidas', !areaVisible('partidas')); } });
        op.push({ texto: (areaVisible('catalogo') ? 'Ocultar' : 'Mostrar') + ' la explosión de insumos (abajo)', accion: function () { verArea('catalogo', !areaVisible('catalogo')); } });
        op.push(null);
        if (H.puede) {
            op.push({ texto: 'Agregar registro', accion: function () { if (!st.editando) entrarEdicion(); agregar(); }, desactivado: !p || st.guardando });
            op.push(st.editando ? { texto: 'Salir de la edición', accion: cancelarEdicion } : { texto: 'Editar los conceptos', accion: entrarEdicion, desactivado: !p });
        }
        var marcado = st.filas.find(function (r) { return r.renglon_id === (borrador(Array.from(st.marcados)[0]) || {}).renglon_id; }) || st.filas[0];
        op = op.concat(opcionesConcepto(marcado));
        if (H.puede) op.push(null,
            { texto: 'Editar la partida', accion: function () { H.editarPartida(); }, desactivado: !p || !!H.edicion },
            { texto: 'Copiar la partida', accion: function () { H.copiarPartida(); }, desactivado: !p || !!H.edicion });
        return op;
    }
    // Opciones de un concepto (las mismas en el ⋮ y en el clic derecho sobre el renglón), como en Neodata
    function opcionesConcepto(r) {
        var op = [];
        op.push({ texto: 'Ver matriz' + (r ? ' de ' + r.codigo : ''), accion: function () { if (r && AN.hojaMatriz) AN.hojaMatriz.abrir(r.concepto_id); }, desactivado: !r || !AN.hojaMatriz });
        op.push({ texto: 'Explosión de insumos por concepto' + (r ? ' (' + r.codigo + ')' : ''), accion: function () { if (r && AN.hojaCalculo) AN.hojaCalculo.explosionConcepto(r.concepto_id); }, desactivado: !r || !AN.hojaCalculo });
        if (H.puede) {
            op.push(null);
            op.push({ texto: 'Marcar todo', accion: marcarTodo, desactivado: !H.partida() || !st.filas.length });
            op.push({ texto: 'Desmarcar todo', accion: function () { $('anRenglonesTodos').checked = false; $('anRenglonesTodos').dispatchEvent(new Event('change')); }, desactivado: !st.marcados.size });
        }
        op.push({ texto: 'Copiar (Ctrl+C)', accion: function () { copiarConceptos(r); }, desactivado: !st.filas.length });
        if (H.puede) op.push({ texto: 'Pegar (Ctrl+V)', accion: pegarConceptos, desactivado: !H.partida() || !AN.hojaPegado });
        return op;
    }
    function marcarTodo() {
        if (!st.editando) entrarEdicion();
        $('anRenglonesTodos').checked = true;
        $('anRenglonesTodos').dispatchEvent(new Event('change'));
    }
    // Copiar: los marcados (o el renglón del clic derecho, o todos) como celdas de Excel, en el formato del Pegado especial
    function copiarConceptos(r) {
        var ids = st.editando && st.marcados.size ? Array.from(st.marcados).map(function (k) { return (borrador(k) || {}).renglon_id; }) : null;
        var filas = ids ? st.filas.filter(function (x) { return ids.indexOf(x.renglon_id) >= 0; }) : (r && !st.editando && ctxRenglon ? [r] : st.filas);
        ctxRenglon = null;
        if (!filas.length) { AN.ui.aviso('Marca los conceptos que quieres copiar (los nuevos sin guardar no se copian).', 'error'); return; }
        var celda = function (v) { v = String(v == null ? '' : v); return /[\t\n"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        var texto = [['Código', 'Descripción completa', 'Unidad', 'Cantidad', 'Costo']].concat(filas.map(function (x) { return [x.codigo, x.descripcion, x.unidad || '', x.cantidad, x.costo]; }))
            .map(function (f) { return f.map(celda).join('\t'); }).join('\n');
        var listo = function () { AN.ui.aviso(filas.length + ' concepto' + (filas.length === 1 ? '' : 's') + ' copiado' + (filas.length === 1 ? '' : 's') + ': pégalos en otra partida o en Excel.', 'ok'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(listo, function () { AN.ui.aviso('El navegador no dejó copiar al portapapeles.', 'error'); });
        else AN.ui.aviso('Este navegador no permite copiar al portapapeles.', 'error');
        st.ultimaCopia = texto;
    }
    // Pegar: lo copiado (de aquí o de Excel) entra por el Pegado especial, en la partida seleccionada
    function pegarConceptos() {
        if (!AN.hojaPegado) return;
        var abrir = function (t) { AN.hojaPegado.abrir(t || ''); };
        if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(abrir, function () { abrir(st.ultimaCopia); });
        else abrir(st.ultimaCopia);
    }
    // Clic derecho sobre un concepto: su menú (como en Neodata)
    var ctxRenglon = null;
    tbody.addEventListener('contextmenu', function (e) {
        var tr = e.target.closest('tr[data-renglon], tr[data-clave]');
        if (!tr || e.target.closest('input, textarea')) return;
        var id = tr.dataset.renglon ? +tr.dataset.renglon : (borrador(tr.dataset.clave) || {}).renglon_id;
        ctxRenglon = st.filas.find(function (x) { return x.renglon_id === id; }) || null;
        AN.rejilla.contextual('renglones', e, opcionesConcepto(ctxRenglon));
    });
    document.addEventListener('keydown', function (e) {
        // Ctrl+C / Ctrl+V sobre la cuadrícula (sin estar escribiendo en un campo)
        var a = document.activeElement;
        if (!(e.ctrlKey || e.metaKey) || document.querySelector('dialog[open]') || $('anHoja').hidden) return;
        if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
        if (!a || !a.closest || !a.closest('#anTablaRenglones')) return;
        var k = e.key.toLowerCase();
        if (k === 'c' && !String(window.getSelection && window.getSelection())) { e.preventDefault(); copiarConceptos(null); }
        else if (k === 'v' && H.puede) { e.preventDefault(); pegarConceptos(); }
    });

    var menuLista = $('anRenglonesMenuLista'), menuAcciones = [];
    $('anRenglonesMenu').addEventListener('click', function (e) {
        e.stopPropagation();
        var abierto = !menuLista.hidden;
        if (AN.rejilla) AN.rejilla.cerrar();
        if (abierto) return;
        menuAcciones = opcionesPartida();
        menuLista.innerHTML = menuAcciones.map(function (a, i) {
            return a ? '<button type="button" role="menuitem" data-accion="' + i + '"' + (a.desactivado ? ' disabled' : '') + '>' + esc(a.texto) + '</button>' : '<div class="an-sep"></div>';
        }).join('');
        menuLista.hidden = false;
        this.setAttribute('aria-expanded', 'true');
    });
    menuLista.addEventListener('click', function (e) {
        var b = e.target.closest('[data-accion]');
        if (!b) return;
        var a = menuAcciones[+b.dataset.accion];
        if (AN.rejilla) AN.rejilla.cerrar();
        if (a && a.accion) a.accion();
    });
    // ---------- Importar PDF ----------
    // Cotización o presupuesto impreso (Código · Concepto · Unidad · Cantidad · P. Unitario · Importe): js/pdf-tabla.js lee
    // la tabla de todas las hojas; aquí cada código es un concepto, las líneas sin código siguen su descripción, y se
    // agregan a la partida en modo edición (si el código ya está en la partida se actualiza). Nada se guarda hasta GUARDAR.
    function filasTsv(texto) {
        return texto.split('\n').map(function (l) {
            var celdas = [], c = '', comillas = false;
            for (var i = 0; i < l.length; i++) {
                var ch = l[i];
                if (comillas) { if (ch === '"' && l[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') comillas = false; else c += ch; }
                else if (ch === '"' && c === '') comillas = true;
                else if (ch === '\t') { celdas.push(c); c = ''; }
                else c += ch;
            }
            celdas.push(c);
            return celdas.map(function (x) { return x.trim(); });
        });
    }
    function numeroPdf(t) {
        var s = String(t || '').replace(/[$\s]/g, '').replace(/,/g, '');
        return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
    }
    function conceptosDelPdf(texto) {
        var filas = filasTsv(texto), enc = filas.shift() || [];
        var col = function (re) { return enc.findIndex(function (t) { return re.test(t); }); };
        var iCod = col(/^(c[oó]digo|clave|cve)/i), iCon = col(/^(concepto|descripci)/i), iUni = col(/^(unidad|u\.?\s*m)/i),
            iCant = col(/^cant/i), iPu = col(/^(p\.?\s*unit|precio\s*unit|p\.?\s*u\.?$|precio$)/i), iImp = col(/^(importe|total)/i);
        if (iCod < 0 || iCon < 0) throw new Error('No encontré las columnas Código y Concepto en la tabla del PDF.');
        var lista = [], c = null;
        var esTotal = /^((sub)?total\b|iva\b|i\.v\.a\.?)|total del presupuesto|importe con letra|\(\*.*m\.n\./i;
        filas.forEach(function (f) {
            var cod = (f[iCod] || '').trim(), desc = (f[iCon] || '').trim();
            if (esTotal.test(cod) || esTotal.test(desc)) { c = null; return; }   // totales, IVA y lo que les sigue
            if (cod) {
                var cant = numeroPdf(f[iCant]), pu = numeroPdf(f[iPu]), imp = numeroPdf(f[iImp]);
                if (pu === null && imp !== null && cant) pu = imp / cant;   // sin precio unitario: importe / cantidad
                c = { codigo: cod.slice(0, 30), descripcion: desc, unidad: (f[iUni] || '').slice(0, 20), cantidad: cant === null ? 1 : cant, costo: pu === null ? 0 : pu };
                lista.push(c);
            } else if (c && desc) c.descripcion = (c.descripcion + (/[.:]$/.test(c.descripcion) ? '\n' : ' ') + desc).trim();
        });
        // Se respetan los renglones del PDF que terminan en punto o dos puntos (6mm. / Correspondiente… / aproximadas: / 2.26 m. x 1.66 m.…);
        // las demás líneas eran solo el ancho de la columna y se unen con espacio
        lista.forEach(function (x) { x.descripcion = x.descripcion.split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean).join('\n').slice(0, 4000); });
        return lista;
    }
    var entradaPdf = document.createElement('input');
    entradaPdf.type = 'file';
    entradaPdf.accept = 'application/pdf,.pdf';
    entradaPdf.hidden = true;
    entradaPdf.id = 'anImportarPdfArchivo';
    document.body.appendChild(entradaPdf);
    function importarPdf() {
        if (!H.partida()) { AN.ui.aviso('Selecciona primero la partida donde van los conceptos.', 'error'); return; }
        if (!window.PdfTabla) { AN.ui.aviso('No está disponible el lector de PDF.', 'error'); return; }
        entradaPdf.value = '';
        entradaPdf.click();
    }
    entradaPdf.addEventListener('change', async function () {
        var f = entradaPdf.files[0], p = H.partida();
        if (!f || !p) return;
        estado('Leyendo el PDF «' + f.name + '»…', 'info');
        var lista;
        try { lista = conceptosDelPdf(await window.PdfTabla.leer(f)); }
        catch (e) { estado('No se pudo leer el PDF: ' + (e && e.message || e), 'error'); return; }
        if (!lista.length) { estado('El PDF no trae conceptos con código que se puedan importar.', 'error'); return; }
        if (!st.editando) entrarEdicion();
        guardarFoto();   // se puede deshacer todo junto
        var nuevos = 0, cambiados = 0;
        lista.forEach(function (x) {
            var b = st.borradores.find(function (y) { return !(y.renglon_id && st.quitar.has(y.renglon_id)) && String(y.codigo).trim().toUpperCase() === x.codigo.toUpperCase(); });
            if (!b) {
                b = { clave: 'n' + (++st.sec), renglon_id: null, matriz: false, codigo: x.codigo, descripcion: '', unidad: '', cantidad: '1', costo: '0', precio_alzado: false, precio_fijo: '', url: '', tipo: '4' };
                st.borradores.push(b);
                nuevos++;
            } else cambiados++;
            b.descripcion = x.descripcion;
            if (x.unidad) b.unidad = x.unidad;
            b.cantidad = String(x.cantidad);
            if (!b.matriz) b.costo = String(H.redondear(x.costo, 6));
        });
        pintar();
        estado('PDF «' + f.name + '»: ' + nuevos + ' concepto' + (nuevos === 1 ? '' : 's') + ' nuevo' + (nuevos === 1 ? '' : 's')
            + (cambiados ? ' y ' + cambiados + ' actualizado' + (cambiados === 1 ? '' : 's') : '') + ' en ' + p.codigo
            + '. El P. Unitario quedó como costo' + (H.ctx.sobrecosto_pct ? ' (el precio lleva el ' + H.ctx.sobrecosto_pct + ' % de sobrecosto)' : '')
            + '. Revisa y da GUARDAR.', 'info');
        AN.ui.aviso(lista.length + ' concepto' + (lista.length === 1 ? '' : 's') + ' leído' + (lista.length === 1 ? '' : 's') + ' del PDF.', 'ok');
    });

    if (AN.rejilla) AN.rejilla.opciones('renglones', {
        fijas: 3,
        archivo: function () { var p = H.partida(); return 'Conceptos ' + (p ? p.codigo : ''); },
        trasExportar: function () { return H.puede ? [{ texto: 'Importar PDF', accion: importarPdf, desactivado: !H.partida() || st.guardando }] : []; }
    });

    AN.hojaRenglones = { editando: function () { return st.editando; } };
})(window.AcriNeo = window.AcriNeo || {});
