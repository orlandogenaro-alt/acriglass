// ACRINEO · Matriz de precio unitario de un concepto: sus insumos por unidad del concepto (materiales, mano de obra,
// equipo, herramienta, básicos u otros). Insumos del catálogo del sistema (con su costo vigente; la mano de obra ya
// con su FSR) o renglones libres; «% de M.O.» / «% de materiales» para herramienta menor, seguridad, etc.
// GUARDAR pone el costo directo del concepto = total de la matriz (en todas las partidas donde está).
// El cálculo en pantalla es el mismo que acrineoCalcularMatriz() del servidor, que vuelve a calcular al guardar.
(function (AN) {
    'use strict';

    var H = AN.hoja;
    var dlg = document.getElementById('anMatriz');
    if (!H || !dlg) return;
    var $ = function (id) { return document.getElementById(id); };
    var esc = AN.ui.esc;
    var tbody = $('anMatrizFilas');
    var TIPOS = { MAT: 'Materiales', MO: 'Mano de obra', EQ: 'Equipo y maquinaria', HER: 'Herramienta', BAS: 'Básicos', OTR: 'Otros' };
    var BASES = { '': 'Por unidad', pct_mo: '% de M.O.', pct_mat: '% de materiales' };
    var CAMPOS = ['tipo', 'codigo', 'descripcion', 'unidad', 'base', 'cantidad', 'desperdicio_pct', 'costo'];

    var st = { concepto: null, filas: [], original: '', sec: 0, marcados: new Set(), guardando: false };

    function nueva(datos) {
        var f = { clave: 'm' + (++st.sec), insumo_id: null, tipo: 'MAT', codigo: '', descripcion: '', unidad: '', base: '', cantidad: '1', desperdicio_pct: '0', costo: '0' };
        Object.keys(datos || {}).forEach(function (k) { if (datos[k] !== null && datos[k] !== undefined) f[k] = typeof datos[k] === 'number' ? String(datos[k]) : datos[k]; });
        return f;
    }
    function huella() { return JSON.stringify(st.filas.map(function (f) { var o = { insumo_id: f.insumo_id }; CAMPOS.forEach(function (k) { o[k] = String(f[k] == null ? '' : f[k]).trim(); }); return o; })); }
    function sucio() { return H.puede && huella() !== st.original; }

    // Igual que acrineoCalcularMatriz()
    function calcular() {
        var d = H.ctx.dec_costos, base = { MO: 0, MAT: 0 }, tot = {}, total = 0;
        Object.keys(TIPOS).forEach(function (t) { tot[t] = 0; });
        st.filas.forEach(function (f) {
            if (f.base) return;
            f._importe = H.redondear(Number(f.cantidad) * (1 + Number(f.desperdicio_pct || 0) / 100) * Number(f.costo), d);
            if (base[f.tipo] !== undefined) base[f.tipo] += f._importe;
        });
        st.filas.forEach(function (f) {
            if (f.base) {
                var sobre = f.base === 'pct_mo' ? base.MO : base.MAT;
                f._base = H.redondear(sobre, d);
                f._importe = H.redondear(Number(f.cantidad) / 100 * sobre, d);
            }
            tot[f.tipo] = (tot[f.tipo] || 0) + (f._importe || 0);
        });
        Object.keys(tot).forEach(function (t) { tot[t] = H.redondear(tot[t], d); total += tot[t]; });
        return { totales: tot, total: H.redondear(total, d) };
    }

    function pintar() {
        var editable = H.puede;
        tbody.innerHTML = st.filas.map(function (f) {
            var celdas;
            if (editable) {
                var sel = function (k, opciones) {
                    return '<select class="an-celda-in" data-k="' + k + '" aria-label="' + k + '">' + Object.keys(opciones).map(function (o) {
                        return '<option value="' + o + '"' + (String(f[k] || '') === o ? ' selected' : '') + '>' + esc(opciones[o]) + '</option>';
                    }).join('') + '</select>';
                };
                var inp = function (k, tipo, extra) { return '<input class="an-celda-in' + (tipo === 'number' ? ' num' : '') + '" type="' + tipo + '" data-k="' + k + '" value="' + esc(f[k]) + '"' + (extra || '') + ' aria-label="' + k + '">'; };
                celdas = '<td>' + sel('tipo', TIPOS) + '</td><td>' + inp('codigo', 'text', ' maxlength="30"') + '</td>'
                    + '<td class="an-desc">' + inp('descripcion', 'text', ' maxlength="250"') + (f.insumo_id ? '<span class="an-insignia" title="Del catálogo de insumos">CAT</span>' : '') + '</td>'
                    + '<td><span class="an-celda-unidad">' + inp('unidad', 'text', ' maxlength="20"')
                    + '<button type="button" class="an-btn-buscar" data-unidad title="Catálogo Unidades" aria-label="Buscar en el catálogo de unidades">'
                    + '<svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button></span></td>'
                    + '<td>' + sel('base', BASES) + '</td>'
                    + '<td>' + inp('cantidad', 'number', ' min="0" step="any"' + (f.base ? ' title="Porcentaje"' : '')) + '</td>'
                    + '<td>' + inp('desperdicio_pct', 'number', ' min="0" max="99.9999" step="any"' + (f.base ? ' readonly tabindex="-1"' : '')) + '</td>'
                    + '<td>' + (f.base ? '<span class="an-ayuda" title="Base sobre la que se aplica el %">' + AN.ui.dinero(f._base) + '</span>' : inp('costo', 'number', ' min="0" step="any"')) + '</td>';
            } else {
                celdas = '<td>' + esc(f.tipo) + '</td><td>' + esc(f.codigo) + '</td><td class="an-desc">' + esc(f.descripcion) + '</td><td>' + esc(f.unidad) + '</td>'
                    + '<td>' + esc(BASES[f.base || '']) + '</td><td class="num">' + esc(f.cantidad) + (f.base ? ' %' : '') + '</td><td class="num">' + esc(f.desperdicio_pct) + '</td>'
                    + '<td class="num">' + AN.ui.dinero(f.base ? f._base : f.costo) + '</td>';
            }
            return '<tr class="an-fila" data-clave="' + f.clave + '"><td class="an-col-sel">' + (editable ? '<input type="checkbox" data-marcar="' + f.clave + '"' + (st.marcados.has(f.clave) ? ' checked' : '') + ' aria-label="Marcar">' : '') + '</td>'
                + celdas + '<td class="num" data-importe>' + AN.ui.dinero(f._importe) + '</td></tr>';
        }).join('') || '<tr class="an-vacio"><td colspan="10">La matriz no tiene insumos: el costo del concepto es el que se captura en la hoja.'
            + (editable ? '<br>Agrega insumos del catálogo o renglones libres; al guardar, el costo directo saldrá de la matriz.' : '') + '</td></tr>';
        pintarTotales();
    }

    function pintarTotales() {
        var c = calcular();
        var partes = Object.keys(TIPOS).filter(function (t) { return c.totales[t]; }).map(function (t) { return TIPOS[t] + ' <b>' + AN.ui.dinero(c.totales[t]) + '</b>'; });
        var precio = st.concepto && st.concepto.precio_alzado ? 'P.A. (precio fijo)' : 'Precio <b>' + AN.ui.dinero(H.precio(c.total)) + '</b> (sobrecosto ' + H.ctx.sobrecosto_pct + ' %)';
        $('anMatrizTotales').innerHTML = (partes.join(' · ') || '<span>Sin insumos</span>')
            + '<span class="an-cd">Costo directo <b>' + AN.ui.dinero(c.total) + '</b> · ' + precio + '</span>';
        st.filas.forEach(function (f) {
            var tr = tbody.querySelector('tr[data-clave="' + f.clave + '"]');
            if (!tr) return;
            tr.querySelector('[data-importe]').textContent = AN.ui.dinero(f._importe);
        });
        dlg.classList.toggle('con-cambios', sucio());
        if ($('anMatrizGuardar')) $('anMatrizGuardar').disabled = st.guardando || !sucio();
        if ($('anMatrizQuitar')) $('anMatrizQuitar').disabled = !st.marcados.size;
    }

    function estado(t, tipo) { var e = $('anMatrizEstado'); e.textContent = t || ''; e.className = 'an-estado' + (tipo ? ' ' + tipo : ''); }

    function cargar(r) {
        st.concepto = r.concepto;
        st.filas = r.filas.map(function (f) {
            return nueva({ insumo_id: f.insumo_id, tipo: f.tipo, codigo: f.codigo || '', descripcion: f.descripcion, unidad: f.unidad || '', base: f.base || '',
                           cantidad: f.cantidad, desperdicio_pct: f.desperdicio_pct, costo: f.base ? 0 : f.costo });
        });
        st.marcados.clear();
        calcular();
        st.original = huella();
        var c = r.concepto;
        $('anMatrizTitulo').textContent = 'Matriz de precio unitario · ' + c.codigo + ' · ' + c.descripcion;
        $('anMatrizConcepto').textContent = 'Por unidad del concepto' + (c.unidad ? ' (' + c.unidad + ')' : '') + (c.matriz ? '' : ' · hoy su costo es capturado: ' + AN.ui.dinero(c.costo));
        pintar();
    }

    async function abrir(conceptoId) {
        if (H.renglonesPendientes()) { AN.ui.aviso('Guarda o cancela primero los cambios de los conceptos de la partida.', 'error'); return; }
        estado('Cargando…', 'info');
        tbody.innerHTML = '<tr class="an-vacio"><td colspan="10">Cargando…</td></tr>';
        if (!dlg.open) dlg.showModal();
        try {
            cargar(await AN.api.get(H.url({ recurso: 'matriz', concepto: conceptoId })));
            estado(H.puede ? '' : 'Solo consulta: no tienes permiso para modificar presupuestos.');
        } catch (e) {
            dlg.close();
            AN.ui.aviso(e.message, 'error');
        }
    }

    async function cerrar() {
        if (st.guardando) return;
        if (sucio() && !(await AN.ui.confirmar({ titulo: 'Cambios sin guardar', mensaje: 'Existen cambios sin guardar en la matriz.\n¿Deseas cerrar?', aceptar: 'Cerrar sin guardar', peligro: true }))) return;
        dlg.close();
    }

    async function guardar() {
        if (st.guardando || !sucio()) return;
        tbody.querySelectorAll('.invalido').forEach(function (i) { i.classList.remove('invalido'); });
        var malos = st.filas.filter(function (f) { return !String(f.descripcion).trim(); });
        if (malos.length) {
            malos.forEach(function (f) { var i = tbody.querySelector('tr[data-clave="' + f.clave + '"] [data-k="descripcion"]'); if (i) i.classList.add('invalido'); });
            estado('Cada insumo necesita descripción.', 'error');
            return;
        }
        st.guardando = true;
        estado('Guardando…', 'info');
        pintarTotales();
        try {
            var r = await AN.api.post(H.url(), {
                accion: 'matriz_guardar', concepto_id: st.concepto.concepto_id, partida_id: H.sel || 0,
                filas: st.filas.map(function (f) { var o = { insumo_id: f.insumo_id }; CAMPOS.forEach(function (k) { o[k] = String(f[k] == null ? '' : f[k]).trim(); }); return o; })
            });
            st.guardando = false;
            cargar(r.matriz);
            H.aplicar(r);
            estado('Guardado correctamente', 'ok');
            AN.ui.aviso('Matriz de ' + r.matriz.concepto.codigo + ' guardada: costo directo ' + AN.ui.dinero(r.matriz.total) + '.', 'ok');
        } catch (e) {
            st.guardando = false;
            Object.keys(e.errores || {}).forEach(function (k) {
                var m = /^filas\.(\d+)\.(\w+)$/.exec(k);
                if (!m || !st.filas[+m[1]]) return;
                var i = tbody.querySelector('tr[data-clave="' + st.filas[+m[1]].clave + '"] [data-k="' + m[2] + '"]');
                if (i) { i.classList.add('invalido'); i.title = e.errores[k]; }
            });
            estado(e.message, 'error');
            pintarTotales();
        }
    }

    // ---------- Eventos ----------
    tbody.addEventListener('input', function (e) {
        var k = e.target.dataset.k;
        if (!k || e.target.tagName === 'SELECT') return;
        var f = st.filas.find(function (x) { return x.clave === e.target.closest('tr').dataset.clave; });
        f[k] = e.target.value;
        e.target.classList.remove('invalido');
        pintarTotales();
    });
    // Lupa de Unidad: «Catálogo Unidades»
    tbody.addEventListener('click', function (e) {
        var lupa = e.target.closest('[data-unidad]');
        if (!lupa || !AN.unidades) return;
        var f = st.filas.find(function (x) { return x.clave === lupa.closest('tr').dataset.clave; });
        AN.unidades.elegir(f.unidad).then(function (u) {
            if (u === null) return;
            f.unidad = u;
            var i = tbody.querySelector('tr[data-clave="' + f.clave + '"] [data-k="unidad"]');
            if (i) i.value = u;
            pintarTotales();
        });
    });
    tbody.addEventListener('change', function (e) {
        var tr = e.target.closest('tr[data-clave]');
        if (!tr) return;
        var f = st.filas.find(function (x) { return x.clave === tr.dataset.clave; });
        if (e.target.dataset.marcar) {
            if (e.target.checked) st.marcados.add(f.clave); else st.marcados.delete(f.clave);
            pintarTotales();
            return;
        }
        if (e.target.tagName === 'SELECT') {
            f[e.target.dataset.k] = e.target.value;
            if (e.target.dataset.k === 'base' && f.base) { f.desperdicio_pct = '0'; if (f.unidad === '') f.unidad = '%'; }
            calcular();
            pintar();
        }
    });

    if (H.puede) {
        $('anMatrizInsumo').addEventListener('click', async function () {
            var item = await AN.buscador.abrir('insumos', { url: H.url({ recurso: 'insumos' }) });
            if (!item || !item.datos) return;
            var d = item.datos;
            st.filas.push(nueva({ insumo_id: d.insumo_id, tipo: d.tipo, codigo: d.codigo, descripcion: d.descripcion, unidad: d.unidad, costo: d.costo === null ? 0 : d.costo }));
            if (d.costo === null) estado(d.codigo + ' no tiene precio vigente en el catálogo: captura su costo.', 'error');
            calcular();
            pintar();
            var i = tbody.querySelector('tr:last-child [data-k="cantidad"]');
            if (i) { i.focus(); i.select(); }
        });
        $('anMatrizLibre').addEventListener('click', function () {
            st.filas.push(nueva());
            calcular();
            pintar();
            var i = tbody.querySelector('tr:last-child [data-k="descripcion"]');
            if (i) i.focus();
        });
        $('anMatrizQuitar').addEventListener('click', function () {
            st.filas = st.filas.filter(function (f) { return !st.marcados.has(f.clave); });
            st.marcados.clear();
            calcular();
            pintar();
        });
        $('anMatrizActualizar').addEventListener('click', async function () {
            var conCatalogo = st.filas.filter(function (f) { return f.insumo_id && !f.base; });
            if (!conCatalogo.length) { estado('Ningún insumo de la matriz viene del catálogo.', 'info'); return; }
            try {
                var ids = conCatalogo.map(function (f) { return f.insumo_id; });
                // El servidor da el costo de catálogo de los insumos de la matriz guardada (los recién agregados ya lo traen)
                var m =await AN.api.get(H.url({ recurso: 'matriz', concepto: st.concepto.concepto_id, actualizar: 1 }));
                var costos = {};
                m.filas.forEach(function (f) { if (f.insumo_id && !f.base) costos[f.insumo_id] = f.costo; });
                var cambiados = 0;
                conCatalogo.forEach(function (f) {
                    if (costos[f.insumo_id] !== undefined && Number(costos[f.insumo_id]) !== Number(f.costo)) { f.costo = String(costos[f.insumo_id]); cambiados++; }
                });
                calcular();
                pintar();
                var faltan = ids.filter(function (id) { return costos[id] === undefined; }).length;
                estado(cambiados + ' costo(s) actualizado(s) del catálogo' + (faltan ? ' · ' + faltan + ' insumo(s) recién agregados ya traen su costo del catálogo' : '')
                    + (m.avisos.length ? ' · ' + m.avisos.join('; ') : '') + '. Revisa y GUARDA.', m.avisos.length ? 'error' : 'info');
            } catch (e) { estado(e.message, 'error'); }
        });
        $('anMatrizGuardar').addEventListener('click', guardar);
    }
    $('anMatrizCerrar').addEventListener('click', cerrar);
    $('anMatrizCancelar').addEventListener('click', cerrar);
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); cerrar(); });

    AN.hojaMatriz = { abrir: abrir, abierta: function () { return dlg.open && sucio(); } };
})(window.AcriNeo = window.AcriNeo || {});
