// ACRINEO · Catálogo de conceptos del presupuesto (abajo a la derecha): todo concepto guardado en alguna partida queda
// aquí. Se filtra, se marca, se pone la «Cantidad a copiar» y ➤ lo copia a la partida seleccionada (si ya estaba en
// ella, se suma la cantidad). Un concepto que no está en ninguna partida se puede quitar del catálogo.
(function (AN) {
    'use strict';

    var H = AN.hoja;
    if (!H) return;
    var $ = function (id) { return document.getElementById(id); };
    var esc = AN.ui.esc;
    var tbody = $('anConceptos');
    var BORRAR = '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

    var DOC = '<svg class="i" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
    var st = { items: [], insumos: [], total: 0, marcados: new Map(), ctrl: null };   // marcados: concepto_id → cantidad
    var COLS = 14;
    // Tipo de insumo con número, como en Neodata (por dentro siguen MAT, MO…)
    var NUM_TIPO = { MAT: '1', MO: '2', EQ: '3', HER: '3', BAS: '4', OTR: '5' };
    function cantidadExp(n) { return (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 6 }); }
    // «Ver»: Todos (conceptos e insumos de las matrices) / Conceptos del presupuesto / Solo explosión (insumos); se recuerda
    try { var verGuardado = localStorage.getItem('acrineo.hoja.ver'); if (verGuardado) $('anConceptosVer').value = verGuardado; } catch (e) { /* sin memoria */ }

    async function cargar() {
        if (st.ctrl) st.ctrl.abort();
        st.ctrl = new AbortController();
        var ver = $('anConceptosVer').value;
        try {
            if (ver === 'conceptos') {
                var r = await AN.api.get(H.url({ recurso: 'conceptos', q: $('anConceptosQ').value.trim(), modo: AN.ui.modo($('anConceptosQ')), por_pagina: 300 }), { signal: st.ctrl.signal });
                st.items = r.items;
                st.total = r.total;
                st.insumos = [];
            } else {
                var x = await AN.api.get(H.url({ recurso: 'explosion_acoplada', ver: ver, q: $('anConceptosQ').value.trim(), modo: AN.ui.modo($('anConceptosQ')) }), { signal: st.ctrl.signal });
                st.items = x.conceptos;
                st.total = x.conceptos.length;
                st.insumos = x.insumos;
            }
            pintar();
        } catch (e) {
            if (e.name !== 'AbortError') tbody.innerHTML = '<tr class="an-vacio"><td colspan="' + COLS + '">' + esc(e.message) + '</td></tr>';
        }
    }
    var cargarPronto = AN.ui.retrasar(cargar, 250);

    function pintar() {
        tbody.innerHTML = st.items.map(function (c) {
            var m = st.marcados.has(c.id);
            return '<tr class="an-fila' + (m ? ' sel' : '') + '" data-id="' + c.id + '">'
                + '<td class="an-col-sel"><input type="checkbox" data-marcar="' + c.id + '"' + (m ? ' checked' : '') + (H.puede ? '' : ' disabled') + ' aria-label="Marcar ' + esc(c.codigo) + '"></td>'
                + '<td>' + esc(c.codigo) + '</td>'
                + '<td class="num"><input class="an-catalogo-cant" type="number" min="0" step="any" data-cant="' + c.id + '" value="' + esc(m ? st.marcados.get(c.id) : '1') + '"' + (H.puede ? '' : ' disabled') + ' aria-label="Cantidad a copiar de ' + esc(c.codigo) + '"></td>'
                + '<td class="an-desc" title="' + esc(c.descripcion) + '">' + esc(c.descripcion) + '</td><td>' + esc(c.unidad || '') + '</td>'
                + '<td class="num">' + AN.ui.dinero(c.costo) + (c.matriz ? '<span class="an-insignia" title="Costo de su matriz de P.U.">M</span>' : '') + '</td>'
                + '<td class="num">' + AN.ui.dinero(c.precio) + (c.precio_alzado ? '<span class="an-insignia" title="Precio fijo">Fijo</span>' : '') + (c.pendiente_analizar ? '<span class="an-insignia an-insignia-pa" title="Pendiente de analizar">P.A.</span>' : '') + '</td>'
                + '<td class="num" title="Cantidad total en el presupuesto: ' + c.cantidad_total + '">' + c.usos + '</td>'
                + '<td class="num">' + esc(c.tipo) + '</td>'
                + '<td class="num">' + (c.matriz ? 1 : 0) + '</td>'
                + '<td class="num">' + cantidadExp(c.cantidad_total) + '</td>'
                + '<td class="num">' + AN.ui.dinero(H.redondear(c.costo * c.cantidad_total, H.ctx.dec_costos)) + '</td>'
                + '<td>' + (/^https?:\/\/\S+$/i.test(c.url || '') ? '<a class="an-btn-url" href="' + esc(c.url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(c.url) + '" aria-label="Abrir el enlace de ' + esc(c.codigo) + '">' + DOC + '</a>' : '') + '</td>'
                + '<td><span class="an-acciones"><button type="button" class="an-btn-pu' + (c.matriz ? '' : ' vacia') + '" data-pu="' + c.id + '" title="Matriz de precio unitario">' + (c.matriz ? 'P.U.' : '+ P.U.') + '</button>'
                + (H.puede && !c.usos ? '<button type="button" class="an-borrar" data-borrar="' + c.id + '" title="Quitar del catálogo" aria-label="Quitar ' + esc(c.codigo) + ' del catálogo">' + BORRAR + '</button>' : '') + '</span></td></tr>';
        }).join('') + st.insumos.map(function (i) {
            // Insumo de las matrices del presupuesto (explosión): solo se consulta aquí; a una matriz se manda desde la matriz
            return '<tr class="an-fila an-fila-ins" data-ins="' + esc(i.clave) + '" title="Insumo de ' + i.matrices + ' matriz(ces) del presupuesto">'
                + '<td class="an-col-sel"></td><td>' + esc(i.codigo || '') + '</td><td></td>'
                + '<td class="an-desc" title="' + esc(i.descripcion) + '">' + esc(i.descripcion) + '</td><td>' + esc(i.unidad || '') + '</td>'
                + '<td class="num">' + (i.pct ? '—' : AN.ui.dinero(i.costo)) + '</td><td class="num">—</td><td class="num">—</td>'
                + '<td class="num" title="' + esc(i.tipo) + '">' + esc(NUM_TIPO[i.tipo] || i.tipo) + '</td>'
                + '<td class="num">' + i.n + '</td>'
                + '<td class="num">' + (i.pct ? '—' : cantidadExp(i.cantidad)) + '</td>'
                + '<td class="num">' + AN.ui.dinero(i.importe) + '</td><td></td><td></td></tr>';
        }).join('') || '<tr class="an-vacio"><td colspan="' + COLS + '">' + ($('anConceptosQ').value.trim() ? 'Nada coincide con el filtro.' : 'La cuadrícula no tiene datos: los conceptos que guardes en las partidas (y los insumos de sus matrices) aparecen aquí.') + '</td></tr>';
        pintarConteo();
        botones();
    }

    function botones() {
        var b = $('anCopiar');
        if (!b) return;
        var p = H.partida();
        b.disabled = !p || !st.marcados.size;
        b.title = p ? 'Copia los marcados a la partida ' + p.codigo : 'Selecciona una partida';
    }

    async function copiar() {
        var p = H.partida();
        if (!p || !st.marcados.size) return;
        if (H.renglonesPendientes()) { AN.ui.aviso('Guarda o cancela primero los cambios de los conceptos de la partida.', 'error'); return; }
        var lista = [];
        st.marcados.forEach(function (cant, id) { lista.push({ concepto_id: id, cantidad: cant }); });
        if (lista.some(function (x) { return !(String(x.cantidad).trim() !== '' && Number(x.cantidad) >= 0); })) {
            AN.ui.aviso('La cantidad a copiar debe ser un número no negativo.', 'error');
            return;
        }
        try {
            var r = await H.post({ accion: 'copiar', partida_id: p.id, conceptos: lista });
            st.marcados.clear();
            AN.ui.aviso(r.copiados + ' concepto' + (r.copiados === 1 ? '' : 's') + ' copiado' + (r.copiados === 1 ? '' : 's') + ' a ' + p.codigo + '.', 'ok');
        } catch (e) { AN.ui.aviso(e.message, 'error'); }
    }

    async function borrar(id) {
        var c = st.items.find(function (x) { return x.id === id; });
        if (!c || !(await AN.ui.confirmar({ titulo: 'Quitar concepto', mensaje: '¿Quitar «' + c.codigo + ' · ' + c.descripcion + '» del catálogo del presupuesto?', aceptar: 'Quitar', peligro: true }))) return;
        try {
            await H.post({ accion: 'concepto_eliminar', concepto_id: id, partida_id: H.sel || 0 });
            st.marcados.delete(id);
            AN.ui.aviso('Concepto quitado del catálogo.', 'ok');
        } catch (e) { AN.ui.aviso(e.message, 'error'); }
    }

    H.on(function (evento) {
        if (evento === 'estado') cargarPronto();
        else botones();
    });
    $('anConceptosQ').addEventListener('input', cargarPronto);
    $('anConceptosVer').addEventListener('change', function () {
        try { localStorage.setItem('acrineo.hoja.ver', this.value); } catch (e) { /* sin memoria */ }
        cargar();
    });
    $('anConceptosQ').addEventListener('modo', cargar);
    tbody.addEventListener('change', function (e) {
        var id = +(e.target.dataset.marcar || 0);
        if (id) {
            var cant = tbody.querySelector('input[data-cant="' + id + '"]').value;
            if (e.target.checked) st.marcados.set(id, cant); else st.marcados.delete(id);
            e.target.closest('tr').classList.toggle('sel', e.target.checked);
            pintarConteo();
        }
    });
    tbody.addEventListener('input', function (e) {
        var id = +(e.target.dataset.cant || 0);
        if (!id) return;
        // Escribir una cantidad marca el concepto
        st.marcados.set(id, e.target.value);
        var chk = tbody.querySelector('input[data-marcar="' + id + '"]');
        chk.checked = true;
        chk.closest('tr').classList.add('sel');
        pintarConteo();
    });
    tbody.addEventListener('click', function (e) {
        var b = e.target.closest('[data-borrar]');
        if (b) { borrar(+b.dataset.borrar); return; }
        var pu = e.target.closest('[data-pu]');
        if (pu && AN.hojaMatriz) AN.hojaMatriz.abrir(+pu.dataset.pu);
    });
    function pintarConteo() {
        var ver = $('anConceptosVer').value;
        $('anConceptosConteo').textContent = (ver !== 'insumos' ? st.total + ' concepto' + (st.total === 1 ? '' : 's') : '')
            + (ver !== 'conceptos' ? (ver === 'todos' ? ' · ' : '') + st.insumos.length + ' insumo' + (st.insumos.length === 1 ? '' : 's') : '')
            + (st.marcados.size ? ' · ' + st.marcados.size + ' marcado' + (st.marcados.size === 1 ? '' : 's') : '');
        botones();
    }
    if ($('anCopiar')) $('anCopiar').addEventListener('click', copiar);
    // Conceptos marcados (para «Sólo conceptos marcados» de la ventana Cálculo)
    AN.hojaConceptos = {
        marcados: function () { return Array.from(st.marcados.keys()); },
        // Marca (M) desde el Presupuesto completo: es la misma de este catálogo
        marcar: function (id, si) { if (si) st.marcados.set(id, st.marcados.get(id) || '1'); else st.marcados.delete(id); pintar(); }
    };

    // Gráfica «Explosión de insumos» (js/acrineo/grafica.js): importe de los conceptos en el presupuesto (precio × cantidad
    // en todas sus partidas) agrupado por tipo; si hay conceptos marcados, solo esos (como en Neodata).
    async function grafica() {
        AN.grafica.cargando('Explosión de insumos · conceptos del presupuesto');
        try {
            var r = await AN.api.get(H.url({ recurso: 'conceptos', q: '', por_pagina: 500 }));
            var items = st.marcados.size ? r.items.filter(function (c) { return st.marcados.has(c.id); }) : r.items;
            AN.grafica.abrir({
                titulo: 'Explosión de insumos · conceptos del presupuesto',
                nota: (st.marcados.size ? st.marcados.size + ' concepto' + (st.marcados.size === 1 ? '' : 's') + ' marcado' + (st.marcados.size === 1 ? '' : 's')
                    : 'Todos los conceptos (marca algunos para graficar solo esos)') + ' · importe = precio × cantidad en las partidas.',
                nombreTipo: function (t) { return 'Tipo ' + t; },
                filas: items.map(function (c) { return { tipo: c.tipo, codigo: c.codigo, descripcion: c.descripcion, unidad: c.unidad, importe: H.redondear(c.precio * c.cantidad_total, H.ctx.dec_costos) }; })
            });
        } catch (e) { AN.ui.aviso(e.message, 'error'); $('anGrafica').close(); }
    }
    $('anConceptosGrafica').addEventListener('click', grafica);

    // ⋮ de la cuadrícula del catálogo
    if (AN.rejilla) AN.rejilla.opciones('conceptos', {
        fijas: 2,
        archivo: function () { return 'Catalogo de conceptos ' + H.ctx.codigo; },
        extras: function () {
            if (!H.puede) return [];
            return [
                { texto: 'Marcar todos', accion: function () {
                    st.items.forEach(function (c) { if (!st.marcados.has(c.id)) { var i = tbody.querySelector('input[data-cant="' + c.id + '"]'); st.marcados.set(c.id, i ? i.value : '1'); } });
                    pintar();
                }, desactivado: !st.items.length },
                { texto: 'Desmarcar todos', accion: function () { st.marcados.clear(); pintar(); }, desactivado: !st.marcados.size },
                { texto: 'Copiar los marcados a la partida', accion: copiar, desactivado: !H.partida() || !st.marcados.size }];
        }
    });
})(window.AcriNeo = window.AcriNeo || {});
