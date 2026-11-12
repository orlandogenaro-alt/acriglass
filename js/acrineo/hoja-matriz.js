// ACRINEO · Pestaña «Matriz» de la hoja: matriz de precio unitario de un concepto, con sus insumos por unidad del
// concepto (materiales, mano de obra, equipo, herramienta, básicos u otros) y, abajo, el catálogo de insumos del
// sistema (con su costo vigente; la mano de obra ya con su FSR). «% de M.O.» / «% de materiales» para herramienta
// menor, seguridad, etc. GUARDAR pone el costo directo del concepto = total de la matriz (en todas sus partidas).
// El cálculo en pantalla es el mismo que acrineoCalcularMatriz() del servidor, que vuelve a calcular al guardar.
// Se abre con doble clic en un concepto de la partida o con su botón P.U.; la × de la pestaña la cierra.
// Lápiz = edición (igual que los conceptos de la partida): ↶ / ↷ (Ctrl+Z / Ctrl+Y), GUARDAR, CANCELAR y quitar los
// marcados. Copiar del catálogo o agregar un renglón libre entran solos a edición.
(function (AN) {
    'use strict';

    var H = AN.hoja;
    var panel = document.getElementById('anMatriz');
    if (!H || !panel) return;
    var $ = function (id) { return document.getElementById(id); };
    var esc = AN.ui.esc;
    var tbody = $('anMatrizFilas');
    var cuerpoCat = $('anInsumosFilas');
    var COLS = 11;
    var TIPOS = { MAT: 'Materiales', MO: 'Mano de obra', EQ: 'Equipo y maquinaria', HER: 'Herramienta', BAS: 'Básicos', OTR: 'Otros' };
    var BASES = { '': 'Por unidad', pct_mo: '% de M.O.', pct_mat: '% de materiales' };
    var CAMPOS = ['tipo', 'codigo', 'descripcion', 'unidad', 'base', 'cantidad', 'desperdicio_pct', 'costo'];
    var ICONO_URL = '<svg class="i" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
    var LUPA = '<svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

    var st = { concepto: null, filas: [], guardadas: '[]', original: '', sec: 0, marcados: new Set(), guardando: false, abierta: false,
               editando: false, deshacer: [], rehacer: [], fotoPendiente: null };
    var cat = { items: [], total: 0, pagina: 1, marcados: new Map(), cargado: false, ctrl: null };

    function nueva(datos) {
        var f = { clave: 'm' + (++st.sec), insumo_id: null, tipo: 'MAT', codigo: '', descripcion: '', unidad: '', base: '', cantidad: '1', desperdicio_pct: '0', costo: '0' };
        Object.keys(datos || {}).forEach(function (k) { if (datos[k] !== null && datos[k] !== undefined) f[k] = typeof datos[k] === 'number' ? String(datos[k]) : datos[k]; });
        return f;
    }
    function limpia(f) { var o = { insumo_id: f.insumo_id }; CAMPOS.forEach(function (k) { o[k] = String(f[k] == null ? '' : f[k]).trim(); }); return o; }
    function huella() { return JSON.stringify(st.filas.map(limpia)); }
    function sucio() { return H.puede && st.abierta && huella() !== st.original; }
    function editable() { return H.puede && st.editando; }

    // ---------- Pestañas Presupuesto / Matriz ----------
    function verPestana(matriz) {
        $('anHoja').hidden = matriz;
        panel.hidden = !matriz;
        $('anTabPresupuesto').setAttribute('aria-selected', String(!matriz));
        $('anTabMatriz').setAttribute('aria-selected', String(matriz));
        if (matriz && !cat.cargado) cargarCatalogo();
    }
    function mostrarMatriz() {
        st.abierta = true;
        $('anTabMatrizCont').hidden = false;
        verPestana(true);
    }
    function ocultarMatriz() {
        st.abierta = false;
        st.editando = false;
        st.concepto = null;
        st.filas = [];
        st.original = huella();
        panel.classList.remove('con-cambios');
        $('anTabMatriz').classList.remove('con-cambios');
        $('anTabMatrizCont').hidden = true;
        verPestana(false);
    }

    // ---------- Cálculo (igual que acrineoCalcularMatriz()) ----------
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

    // ---------- Deshacer / rehacer ----------
    function foto() { return JSON.stringify({ f: st.filas, s: st.sec }); }
    function guardarFoto(f) {
        st.deshacer.push(f || foto());
        if (st.deshacer.length > 100) st.deshacer.shift();
        st.rehacer = [];
        botones();
    }
    function restaurar(f) {
        var o = JSON.parse(f);
        st.filas = o.f;
        st.sec = o.s;
        st.marcados.clear();
        st.fotoPendiente = null;
        calcular();
        pintar();
    }
    function deshacer() { if (!st.deshacer.length) return; st.rehacer.push(foto()); restaurar(st.deshacer.pop()); }
    function rehacer() { if (!st.rehacer.length) return; st.deshacer.push(foto()); restaurar(st.rehacer.pop()); }

    // ---------- Pintar la matriz ----------
    function coincide(f, q) {
        if (!q) return true;
        return [f.codigo, f.descripcion, f.unidad, TIPOS[f.tipo]].join(' ').toLowerCase().indexOf(q) >= 0;
    }
    function cantidadTexto(n) { return (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 6 }); }

    function pintar() {
        var ed = editable();
        var q = $('anMatrizQ').value.trim().toLowerCase();
        var html = '';
        st.filas.forEach(function (f, n) {
            if (!coincide(f, q)) return;
            var celdas;
            if (ed) {
                var sel = function (k, opciones) {
                    return '<select class="an-celda-in" data-k="' + k + '" aria-label="' + k + '">' + Object.keys(opciones).map(function (o) {
                        return '<option value="' + o + '"' + (String(f[k] || '') === o ? ' selected' : '') + '>' + esc(opciones[o]) + '</option>';
                    }).join('') + '</select>';
                };
                var inp = function (k, tipo, extra) { return '<input class="an-celda-in' + (tipo === 'number' ? ' num' : '') + '" type="' + tipo + '" data-k="' + k + '" value="' + esc(f[k]) + '"' + (extra || '') + ' aria-label="' + k + '">'; };
                celdas = '<td>' + inp('codigo', 'text', ' maxlength="30"') + '</td>'
                    + '<td class="an-desc">' + inp('descripcion', 'text', ' maxlength="250"') + '</td>'
                    + '<td>' + sel('tipo', TIPOS) + '</td>'
                    + '<td><span class="an-celda-unidad">' + inp('unidad', 'text', ' maxlength="20"')
                    + '<button type="button" class="an-btn-buscar" data-unidad title="Catálogo Unidades" aria-label="Buscar en el catálogo de unidades">' + LUPA + '</button></span></td>'
                    + '<td>' + (f.base ? '<span class="an-ayuda" title="Base sobre la que se aplica el %">' + AN.ui.dinero(f._base) + '</span>' : inp('costo', 'number', ' min="0" step="any"')) + '</td>'
                    + '<td>' + sel('base', BASES) + '</td>'
                    + '<td>' + inp('cantidad', 'number', ' min="0" step="any"' + (f.base ? ' title="Porcentaje"' : '')) + '</td>'
                    + '<td>' + inp('desperdicio_pct', 'number', ' min="0" max="99.9999" step="any"' + (f.base ? ' readonly tabindex="-1"' : '')) + '</td>';
            } else {
                celdas = '<td>' + esc(f.codigo) + '</td><td class="an-desc">' + esc(f.descripcion) + '</td>'
                    + '<td><span class="an-tipo an-tipo-' + esc(f.tipo) + '">' + esc(TIPOS[f.tipo] || f.tipo) + '</span></td><td>' + esc(f.unidad) + '</td>'
                    + '<td class="num">' + AN.ui.dinero(f.base ? f._base : f.costo) + '</td><td>' + esc(BASES[f.base || '']) + '</td>'
                    + '<td class="num">' + cantidadTexto(f.cantidad) + (f.base ? ' %' : '') + '</td><td class="num">' + cantidadTexto(f.desperdicio_pct) + '</td>';
            }
            html += '<tr class="an-fila' + (f.insumo_id ? '' : ' an-libre') + '" data-clave="' + f.clave + '">'
                + '<td class="an-col-sel">' + (ed ? '<input type="checkbox" data-marcar="' + f.clave + '"' + (st.marcados.has(f.clave) ? ' checked' : '') + ' aria-label="Marcar">' : '') + '</td>'
                + '<td class="num an-col-n">' + (n + 1) + (f.insumo_id ? '' : '<span class="an-insignia" title="Renglón libre (no está en el catálogo)">L</span>') + '</td>'
                + celdas + '<td class="num" data-importe>' + AN.ui.dinero(f._importe) + '</td></tr>';
        });
        if (!html) {
            html = '<tr class="an-vacio"><td colspan="' + COLS + '">' + (st.filas.length ? 'Ningún insumo coincide con el filtro.'
                : 'La cuadrícula no tiene datos: el costo del concepto es el que se captura en la hoja.'
                  + (H.puede ? '<br><small class="an-ayuda">Copia insumos del catálogo de abajo (marca y pon la «Cantidad a copiar», luego ➤) o agrega un renglón libre; al guardar, el costo directo saldrá de la matriz.</small>' : '')) + '</td></tr>';
        }
        tbody.innerHTML = html;
        $('anMatrizConteo').textContent = st.filas.length;
        if ($('anMatrizTodos')) { $('anMatrizTodos').disabled = !ed; $('anMatrizTodos').checked = false; }
        pintarTotales();
    }

    function pintarTotales() {
        var c = calcular();
        var partes = Object.keys(TIPOS).filter(function (t) { return c.totales[t]; }).map(function (t) { return TIPOS[t] + ' <b>' + AN.ui.dinero(c.totales[t]) + '</b>'; });
        var precio = st.concepto && st.concepto.precio_alzado ? 'P.A. (precio fijo)' : 'Precio <b>' + AN.ui.dinero(H.precio(c.total)) + '</b>';
        $('anMatrizTotales').innerHTML = (partes.length ? '<span>' + partes.join(' · ') + '</span>' : '')
            + '<span class="an-cd">Σ Costo directo <b>' + AN.ui.dinero(c.total) + '</b> · ' + precio + '</span>';
        st.filas.forEach(function (f) {
            var tr = tbody.querySelector('tr[data-clave="' + f.clave + '"]');
            if (tr) tr.querySelector('[data-importe]').textContent = AN.ui.dinero(f._importe);
        });
        botones();
    }

    function botones() {
        var s = sucio(), ed = editable();
        panel.classList.toggle('con-cambios', s);
        $('anTabMatriz').classList.toggle('con-cambios', s);
        if (!H.puede) return;
        $('anMatrizEditar').setAttribute('aria-pressed', String(ed));
        $('anMatrizEditar').title = ed ? 'Salir de la edición' : 'Editar la matriz';
        $('anMatrizGuardar').disabled = $('anMatrizGuardarCab').disabled = st.guardando || !s;
        $('anMatrizCancelar').disabled = !ed;
        $('anMatrizQuitar').disabled = !ed || !st.marcados.size;
        $('anMatrizDeshacer').disabled = !ed || !st.deshacer.length;
        $('anMatrizRehacer').disabled = !ed || !st.rehacer.length;
        $('anMatrizEditar').disabled = !st.concepto;
        $('anMatrizLibre').disabled = $('anMatrizActualizar').disabled = !st.concepto;
        var b = $('anInsumosCopiar');
        b.disabled = !st.concepto || !cat.marcados.size;
        b.lastChild.textContent = ' Copiar a la matriz' + (cat.marcados.size ? ' (' + cat.marcados.size + ')' : '');
    }

    function estado(t, tipo) { var e = $('anMatrizEstado'); e.textContent = t || ''; e.className = 'an-estado' + (tipo ? ' ' + tipo : ''); }

    // ---------- Cargar / editar / guardar ----------
    function cargar(r) {
        st.concepto = r.concepto;
        st.filas = r.filas.map(function (f) {
            return nueva({ insumo_id: f.insumo_id, tipo: f.tipo, codigo: f.codigo || '', descripcion: f.descripcion, unidad: f.unidad || '', base: f.base || '',
                           cantidad: f.cantidad, desperdicio_pct: f.desperdicio_pct, costo: f.base ? 0 : f.costo });
        });
        st.marcados.clear();
        st.editando = false;
        st.deshacer = [];
        st.rehacer = [];
        calcular();
        st.original = huella();
        st.guardadas = JSON.stringify(st.filas);
        var c = r.concepto;
        $('anMatrizTitulo').textContent = 'Código: ' + c.codigo + ' | Unidad: ' + (c.unidad || '—');
        $('anMatrizDesc').textContent = c.descripcion;
        $('anMatrizConcepto').textContent = 'Insumos por unidad del concepto' + (c.unidad ? ' (' + c.unidad + ')' : '')
            + (c.matriz ? ' · su costo directo sale de esta matriz' : ' · hoy su costo es capturado: ' + AN.ui.dinero(c.costo));
        $('anMatrizUrl').innerHTML = /^https?:\/\/\S+$/i.test(String(c.url || '').trim())
            ? '<a class="an-btn-cab an-icono" href="' + esc(c.url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(c.url) + '" aria-label="Abrir el enlace del concepto">' + ICONO_URL + '</a>'
            : '<span class="an-btn-cab an-icono vacia" title="El concepto no tiene enlace">' + ICONO_URL + '</span>';
        $('anTabMatriz').textContent = 'Matriz · ' + c.codigo;
        $('anTabMatriz').title = c.codigo + ' · ' + c.descripcion;
        pintar();
    }

    function entrarEdicion() {
        if (!H.puede || !st.concepto || st.editando) return;
        st.editando = true;
        st.deshacer = [];
        st.rehacer = [];
        st.marcados.clear();
        pintar();
    }
    async function cancelarEdicion() {
        if (!st.editando) return;
        if (sucio() && !(await AN.ui.confirmar({ titulo: 'Cancelar cambios', mensaje: 'Se descartarán los cambios de la matriz.\n¿Deseas continuar?', aceptar: 'Descartar cambios', peligro: true }))) return;
        st.filas = JSON.parse(st.guardadas);
        st.editando = false;
        st.marcados.clear();
        estado('');
        calcular();
        pintar();
    }

    async function abrir(conceptoId) {
        if (H.renglonesPendientes()) { AN.ui.aviso('Guarda o cancela primero los cambios de los conceptos de la partida.', 'error'); return; }
        if (st.guardando) return;
        // Ya está abierta la matriz de este concepto: solo se muestra la pestaña (sin perder lo capturado)
        if (st.abierta && st.concepto && st.concepto.concepto_id === conceptoId) { mostrarMatriz(); return; }
        if (sucio()) {
            mostrarMatriz();
            if (!(await AN.ui.confirmar({ titulo: 'Cambios sin guardar', mensaje: 'Existen cambios sin guardar en la matriz de ' + st.concepto.codigo + '.\n¿Deseas abrir otra sin guardarlos?', aceptar: 'Abrir sin guardar', peligro: true }))) return;
        }
        st.concepto = null;
        st.filas = [];
        st.editando = false;
        estado('Cargando…', 'info');
        $('anMatrizTitulo').textContent = 'Matriz de precio unitario';
        $('anMatrizDesc').textContent = '';
        $('anMatrizConcepto').textContent = '';
        $('anMatrizUrl').innerHTML = '';
        $('anMatrizTotales').innerHTML = '';
        $('anMatrizQ').value = '';
        tbody.innerHTML = '<tr class="an-vacio"><td colspan="' + COLS + '">Cargando…</td></tr>';
        mostrarMatriz();
        try {
            cargar(await AN.api.get(H.url({ recurso: 'matriz', concepto: conceptoId })));
            estado(H.puede ? '' : 'Solo consulta: no tienes permiso para modificar presupuestos.');
        } catch (e) {
            ocultarMatriz();
            AN.ui.aviso(e.message, 'error');
        }
    }

    async function cerrar() {
        if (st.guardando) return;
        if (sucio() && !(await AN.ui.confirmar({ titulo: 'Cambios sin guardar', mensaje: 'Existen cambios sin guardar en la matriz.\n¿Deseas cerrar?', aceptar: 'Cerrar sin guardar', peligro: true }))) return;
        ocultarMatriz();
    }

    async function guardar() {
        if (st.guardando || !sucio()) return;
        tbody.querySelectorAll('.invalido').forEach(function (i) { i.classList.remove('invalido'); });
        var malos = st.filas.filter(function (f) { return !String(f.descripcion).trim(); });
        if (malos.length) {
            if (!st.editando) entrarEdicion();
            $('anMatrizQ').value = '';
            pintar();
            malos.forEach(function (f) { var i = tbody.querySelector('tr[data-clave="' + f.clave + '"] [data-k="descripcion"]'); if (i) i.classList.add('invalido'); });
            estado('Cada insumo necesita descripción.', 'error');
            return;
        }
        st.guardando = true;
        estado('Guardando…', 'info');
        botones();
        try {
            var r = await AN.api.post(H.url(), { accion: 'matriz_guardar', concepto_id: st.concepto.concepto_id, partida_id: H.sel || 0, filas: st.filas.map(limpia) });
            st.guardando = false;
            cargar(r.matriz);
            H.aplicar(r);
            estado('Guardado correctamente', 'ok');
            AN.ui.aviso('Matriz de ' + r.matriz.concepto.codigo + ' guardada: costo directo ' + AN.ui.dinero(r.matriz.total) + '.', 'ok');
        } catch (e) {
            st.guardando = false;
            if (!st.editando) { st.editando = true; }
            $('anMatrizQ').value = '';
            pintar();
            Object.keys(e.errores || {}).forEach(function (k) {
                var m = /^filas\.(\d+)\.(\w+)$/.exec(k);
                if (!m || !st.filas[+m[1]]) return;
                var i = tbody.querySelector('tr[data-clave="' + st.filas[+m[1]].clave + '"] [data-k="' + m[2] + '"]');
                if (i) { i.classList.add('invalido'); i.title = e.errores[k]; }
            });
            estado(e.message, 'error');
            botones();
        }
    }

    function agregarFilas(nuevas) {
        if (!nuevas.length) return;
        if (!st.editando) entrarEdicion();
        guardarFoto();
        nuevas.forEach(function (d) { st.filas.push(nueva(d)); });
        $('anMatrizQ').value = '';
        calcular();
        pintar();
        var ult = tbody.querySelector('tr:last-child');
        if (ult) ult.scrollIntoView({ block: 'nearest' });
    }

    // ---------- Catálogo de insumos (abajo) ----------
    async function cargarCatalogo(mas) {
        if (cat.ctrl) cat.ctrl.abort();
        cat.ctrl = new AbortController();
        var pagina = mas ? cat.pagina + 1 : 1;
        if (!mas) cuerpoCat.innerHTML = '<tr class="an-vacio"><td colspan="11">Cargando…</td></tr>';
        try {
            var r = await AN.api.get(H.url({ recurso: 'insumos_tabla', q: $('anInsumosQ').value.trim(), pagina: pagina, por_pagina: 100 }), { signal: cat.ctrl.signal });
            cat.cargado = true;
            cat.pagina = r.pagina;
            cat.total = r.total;
            cat.items = mas ? cat.items.concat(r.items) : r.items;
            pintarCatalogo();
        } catch (e) {
            if (e.name === 'AbortError') return;
            cuerpoCat.innerHTML = '<tr class="an-vacio"><td colspan="11">' + esc(e.message) + '</td></tr>';
        }
    }
    var cargarCatalogoPronto = AN.ui.retrasar(function () { cargarCatalogo(false); }, 250);

    function pintarCatalogo() {
        var puede = H.puede;
        cuerpoCat.innerHTML = cat.items.map(function (i) {
            var m = cat.marcados.has(i.insumo_id);
            return '<tr class="an-fila' + (m ? ' marcado' : '') + '" data-insumo="' + i.insumo_id + '">'
                + '<td class="an-col-sel">' + (puede ? '<input type="checkbox" data-marcar-ins' + (m ? ' checked' : '') + ' aria-label="Marcar ' + esc(i.codigo) + '">' : '') + '</td>'
                + '<td class="an-cat-codigo">' + esc(i.codigo) + '</td>'
                + '<td class="num">' + (puede ? '<input class="an-catalogo-cant" type="number" min="0" step="any" inputmode="decimal" data-cant value="' + esc(m ? cat.marcados.get(i.insumo_id).cantidad : '') + '" placeholder="1" aria-label="Cantidad a copiar de ' + esc(i.codigo) + '">' : '') + '</td>'
                + '<td class="an-desc">' + esc(i.descripcion) + '</td><td>' + esc(i.unidad) + '</td>'
                + '<td><span class="an-tipo an-tipo-' + esc(i.tipo) + '">' + esc(TIPOS[i.tipo] || i.tipo) + '</span></td>'
                + '<td class="num">' + (i.costo === null ? '<span class="an-ayuda">sin precio</span>' : AN.ui.dinero(i.costo)) + '</td>'
                + '<td>' + esc(i.familia || '') + '</td><td>' + esc(i.proveedor || '') + '</td>'
                + '<td>' + esc(AN.ui.fechaCorta(i.fecha)) + (i.moneda && i.moneda !== 'MXN' ? ' <small class="an-ayuda">' + esc(i.moneda) + '</small>' : '') + '</td>'
                + '<td>' + esc(i.clave_microsip || '') + '</td></tr>';
        }).join('') || '<tr class="an-vacio"><td colspan="11">' + ($('anInsumosQ').value.trim() ? 'Ningún insumo coincide con el filtro.' : 'El catálogo de insumos está vacío.') + '</td></tr>';
        $('anInsumosConteo').textContent = cat.total ? (cat.items.length < cat.total ? cat.items.length + ' de ' : '') + cat.total + ' insumo(s)' : '';
        $('anInsumosPie').hidden = cat.items.length >= cat.total;
        botones();
    }

    function marcarInsumo(id, si, cantidad) {
        var item = cat.items.find(function (i) { return i.insumo_id === id; });
        if (si && item) cat.marcados.set(id, { item: item, cantidad: cantidad == null ? (cat.marcados.has(id) ? cat.marcados.get(id).cantidad : '') : cantidad });
        else cat.marcados.delete(id);
        var tr = cuerpoCat.querySelector('tr[data-insumo="' + id + '"]');
        if (tr) { tr.classList.toggle('marcado', si); var c = tr.querySelector('[data-marcar-ins]'); if (c) c.checked = si; }
        botones();
    }

    function filaDeInsumo(i, cantidad) {
        return { insumo_id: i.insumo_id, tipo: i.tipo, codigo: i.codigo, descripcion: i.descripcion, unidad: i.unidad,
                 costo: i.costo === null ? 0 : i.costo, cantidad: String(cantidad) };
    }
    function copiar() {
        if (!st.concepto || !cat.marcados.size) return;
        var sinPrecio = [];
        var nuevas = Array.from(cat.marcados.values()).map(function (m) {
            var cant = Number(m.cantidad);
            if (m.item.costo === null) sinPrecio.push(m.item.codigo);
            return filaDeInsumo(m.item, m.cantidad !== '' && cant >= 0 ? m.cantidad : 1);
        });
        agregarFilas(nuevas);
        cat.marcados.clear();
        pintarCatalogo();
        estado(nuevas.length + ' insumo(s) copiados a la matriz' + (sinPrecio.length ? ' · sin precio vigente, captura su costo: ' + sinPrecio.join(', ') : '') + '. Revisa y GUARDA.', sinPrecio.length ? 'error' : 'info');
    }

    // ---------- Eventos de la matriz ----------
    tbody.addEventListener('focusin', function (e) { if (e.target.dataset.k && st.editando) st.fotoPendiente = foto(); });
    tbody.addEventListener('input', function (e) {
        var k = e.target.dataset.k;
        if (!k || e.target.tagName === 'SELECT') return;
        if (st.fotoPendiente) { guardarFoto(st.fotoPendiente); st.fotoPendiente = null; }
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
            if (u === null || u === f.unidad) return;
            guardarFoto();
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
            botones();
            return;
        }
        if (e.target.tagName === 'SELECT') {
            guardarFoto(st.fotoPendiente || undefined);
            st.fotoPendiente = null;
            f[e.target.dataset.k] = e.target.value;
            if (e.target.dataset.k === 'base' && f.base) { f.desperdicio_pct = '0'; if (f.unidad === '') f.unidad = '%'; }
            calcular();
            pintar();
        }
    });
    // Doble clic en un insumo (fuera de edición) entra a editar
    tbody.addEventListener('dblclick', function (e) {
        if (!H.puede || st.editando || !e.target.closest('tr[data-clave]')) return;
        entrarEdicion();
    });
    $('anMatrizQ').addEventListener('input', pintar);
    if ($('anMatrizTodos')) $('anMatrizTodos').addEventListener('change', function () {
        var si = this.checked;
        st.marcados.clear();
        if (si) st.filas.forEach(function (f) { st.marcados.add(f.clave); });
        tbody.querySelectorAll('input[data-marcar]').forEach(function (c) { c.checked = si; });
        botones();
    });

    // ---------- Eventos del catálogo ----------
    $('anInsumosQ').addEventListener('input', cargarCatalogoPronto);
    $('anInsumosMas').addEventListener('click', function () { cargarCatalogo(true); });
    cuerpoCat.addEventListener('change', function (e) {
        var tr = e.target.closest('tr[data-insumo]');
        if (tr && e.target.matches('[data-marcar-ins]')) marcarInsumo(+tr.dataset.insumo, e.target.checked);
    });
    cuerpoCat.addEventListener('input', function (e) {
        var tr = e.target.closest('tr[data-insumo]');
        if (!tr || !e.target.matches('[data-cant]')) return;
        var v = e.target.value.trim();
        marcarInsumo(+tr.dataset.insumo, v !== '' && Number(v) > 0, v);
    });
    cuerpoCat.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target.matches('[data-cant]')) { e.preventDefault(); copiar(); }
    });
    // Doble clic en un insumo del catálogo: lo copia a la matriz (con su «Cantidad a copiar», o 1)
    cuerpoCat.addEventListener('dblclick', function (e) {
        if (!H.puede || !st.concepto || e.target.closest('input, button, a')) return;
        var tr = e.target.closest('tr[data-insumo]');
        if (!tr) return;
        var id = +tr.dataset.insumo;
        if (!cat.marcados.has(id)) marcarInsumo(id, true, tr.querySelector('[data-cant]').value.trim());
        copiar();
    });

    // ---------- Encabezado y barra ----------
    function ocultarTexto(si) {
        $('anMatrizTexto').hidden = si;
        $('anMatrizOcultarTexto').setAttribute('aria-pressed', String(si));
        $('anMatrizOcultarTexto').textContent = si ? 'Mostrar texto' : 'Ocultar texto';
    }
    try { ocultarTexto(localStorage.getItem('acrineo.matriz.ocultarTexto') === '1'); } catch (e) { /* sin almacenamiento */ }
    $('anMatrizOcultarTexto').addEventListener('click', function () {
        var si = !$('anMatrizTexto').hidden;
        ocultarTexto(si);
        try { localStorage.setItem('acrineo.matriz.ocultarTexto', si ? '1' : '0'); } catch (e) { /* sin almacenamiento */ }
    });

    if (H.puede) {
        $('anMatrizEditar').addEventListener('click', function () { if (st.editando) cancelarEdicion(); else entrarEdicion(); });
        $('anMatrizCancelar').addEventListener('click', cancelarEdicion);
        $('anMatrizGuardar').addEventListener('click', guardar);
        $('anMatrizGuardarCab').addEventListener('click', guardar);
        $('anMatrizDeshacer').addEventListener('click', deshacer);
        $('anMatrizRehacer').addEventListener('click', rehacer);
        $('anMatrizLibre').addEventListener('click', function () {
            agregarFilas([{}]);
            var i = tbody.querySelector('tr:last-child [data-k="descripcion"]');
            if (i) i.focus();
        });
        $('anMatrizQuitar').addEventListener('click', function () {
            if (!st.marcados.size) return;
            guardarFoto();
            st.filas = st.filas.filter(function (f) { return !st.marcados.has(f.clave); });
            st.marcados.clear();
            calcular();
            pintar();
        });
        $('anMatrizActualizar').addEventListener('click', async function () {
            var conCatalogo = st.filas.filter(function (f) { return f.insumo_id && !f.base; });
            if (!conCatalogo.length) { estado('Ningún insumo de la matriz viene del catálogo.', 'info'); return; }
            try {
                // El servidor da el costo de catálogo de los insumos de la matriz guardada (los recién copiados ya lo traen)
                var m = await AN.api.get(H.url({ recurso: 'matriz', concepto: st.concepto.concepto_id, actualizar: 1 }));
                var costos = {};
                m.filas.forEach(function (f) { if (f.insumo_id && !f.base) costos[f.insumo_id] = f.costo; });
                var cambian = conCatalogo.filter(function (f) { return costos[f.insumo_id] !== undefined && Number(costos[f.insumo_id]) !== Number(f.costo); });
                if (cambian.length) {
                    if (!st.editando) entrarEdicion();
                    guardarFoto();
                    cambian.forEach(function (f) { f.costo = String(costos[f.insumo_id]); });
                }
                calcular();
                pintar();
                estado(cambian.length + ' costo(s) actualizado(s) del catálogo' + (m.avisos.length ? ' · ' + m.avisos.join('; ') : '') + (cambian.length ? '. Revisa y GUARDA.' : '.'), m.avisos.length ? 'error' : 'info');
            } catch (e) { estado(e.message, 'error'); }
        });
        $('anInsumosCopiar').addEventListener('click', copiar);
    }
    $('anMatrizCerrar').addEventListener('click', cerrar);
    $('anTabPresupuesto').addEventListener('click', function () { verPestana(false); });
    $('anTabMatriz').addEventListener('click', function () { verPestana(true); });

    // Ctrl+Z / Ctrl+Y y Ctrl+S en la pestaña Matriz
    document.addEventListener('keydown', function (e) {
        if (panel.hidden || !(e.ctrlKey || e.metaKey) || document.querySelector('dialog[open]')) return;
        var k = e.key.toLowerCase();
        if (k === 's') { e.preventDefault(); guardar(); return; }
        if (!st.editando) return;
        var a = document.activeElement;
        if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !tbody.contains(a)) return;
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); st.fotoPendiente = null; deshacer(); }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); rehacer(); }
    });

    // abierta() = la matriz tiene cambios sin guardar (la hoja pregunta antes de cerrar la pestaña del navegador)
    AN.hojaMatriz = { abrir: abrir, abierta: function () { return sucio(); } };
})(window.AcriNeo = window.AcriNeo || {});
