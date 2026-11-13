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
    var st = { items: [], total: 0, marcados: new Map(), ctrl: null };   // marcados: concepto_id → cantidad

    async function cargar() {
        if (st.ctrl) st.ctrl.abort();
        st.ctrl = new AbortController();
        try {
            var r = await AN.api.get(H.url({ recurso: 'conceptos', q: $('anConceptosQ').value.trim(), por_pagina: 300 }), { signal: st.ctrl.signal });
            st.items = r.items;
            st.total = r.total;
            pintar();
        } catch (e) {
            if (e.name !== 'AbortError') tbody.innerHTML = '<tr class="an-vacio"><td colspan="11">' + esc(e.message) + '</td></tr>';
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
                + '<td class="num">' + AN.ui.dinero(c.precio) + (c.precio_alzado ? '<span class="an-insignia" title="Precio alzado">P.A.</span>' : '') + '</td>'
                + '<td class="num" title="Cantidad total en el presupuesto: ' + c.cantidad_total + '">' + c.usos + '</td>'
                + '<td class="num">' + esc(c.tipo) + '</td>'
                + '<td>' + (/^https?:\/\/\S+$/i.test(c.url || '') ? '<a class="an-btn-url" href="' + esc(c.url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(c.url) + '" aria-label="Abrir el enlace de ' + esc(c.codigo) + '">' + DOC + '</a>' : '') + '</td>'
                + '<td><span class="an-acciones"><button type="button" class="an-btn-pu' + (c.matriz ? '' : ' vacia') + '" data-pu="' + c.id + '" title="Matriz de precio unitario">' + (c.matriz ? 'P.U.' : '+ P.U.') + '</button>'
                + (H.puede && !c.usos ? '<button type="button" class="an-borrar" data-borrar="' + c.id + '" title="Quitar del catálogo" aria-label="Quitar ' + esc(c.codigo) + ' del catálogo">' + BORRAR + '</button>' : '') + '</span></td></tr>';
        }).join('') || '<tr class="an-vacio"><td colspan="11">' + ($('anConceptosQ').value.trim() ? 'Ningún concepto coincide con el filtro.' : 'La cuadrícula no tiene datos: los conceptos que guardes en las partidas aparecen aquí.') + '</td></tr>';
        $('anConceptosConteo').textContent = st.total + ' concepto' + (st.total === 1 ? '' : 's') + (st.marcados.size ? ' · ' + st.marcados.size + ' marcado' + (st.marcados.size === 1 ? '' : 's') : '');
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
        $('anConceptosConteo').textContent = st.total + ' concepto' + (st.total === 1 ? '' : 's') + (st.marcados.size ? ' · ' + st.marcados.size + ' marcado' + (st.marcados.size === 1 ? '' : 's') : '');
        botones();
    }
    if ($('anCopiar')) $('anCopiar').addEventListener('click', copiar);
    // Conceptos marcados (para «Sólo conceptos marcados» de la ventana Cálculo)
    AN.hojaConceptos = { marcados: function () { return Array.from(st.marcados.keys()); } };

    // Gráfica: importe de cada concepto en el presupuesto (precio × cantidad en todas sus partidas), de mayor a menor;
    // después de los 15 primeros, el resto se junta en «Otros».
    async function grafica() {
        var cuerpo = $('anGraficaCuerpo');
        cuerpo.innerHTML = '<p class="an-ayuda">Cargando…</p>';
        $('anGrafica').showModal();
        try {
            var r = await AN.api.get(H.url({ recurso: 'conceptos', q: '', por_pagina: 500 }));
            var datos = r.items.map(function (c) { return { codigo: c.codigo, desc: c.descripcion, cant: c.cantidad_total, importe: H.redondear(c.precio * c.cantidad_total, H.ctx.dec_costos) }; })
                .filter(function (d) { return d.importe > 0; })
                .sort(function (a, b) { return b.importe - a.importe; });
            var total = datos.reduce(function (t, d) { return t + d.importe; }, 0);
            if (!datos.length) { cuerpo.innerHTML = '<p class="an-vacio-texto">Ningún concepto tiene importe todavía: copia conceptos a las partidas con su cantidad y precio.</p>'; return; }
            if (datos.length > 16) {
                var resto = datos.splice(15);
                datos.push({ codigo: 'Otros', desc: resto.length + ' conceptos más', cant: null, importe: resto.reduce(function (t, d) { return t + d.importe; }, 0), otros: true });
            }
            var max = datos.reduce(function (m, d) { return Math.max(m, d.importe); }, 0);
            cuerpo.innerHTML = '<p class="an-grafica-total">Total del presupuesto <b>' + AN.ui.dinero(total) + '</b></p><ol class="an-barras">'
                + datos.map(function (d) {
                    var pct = total ? d.importe / total * 100 : 0;
                    var tip = d.codigo + ' · ' + d.desc + '\n' + AN.ui.dinero(d.importe) + ' (' + pct.toFixed(1) + ' % del total)' + (d.cant != null ? '\nCantidad en el presupuesto: ' + d.cant : '');
                    return '<li title="' + esc(tip) + '"' + (d.otros ? ' class="otros"' : '') + '><span class="an-barra-etq"><b>' + esc(d.codigo) + '</b> ' + esc(d.desc) + '</span>'
                        + '<span class="an-barra-pista"><span class="an-barra-relleno" style="width:' + Math.max(0.5, d.importe / max * 100).toFixed(2) + '%"></span></span>'
                        + '<span class="an-barra-valor">' + AN.ui.dinero(d.importe) + ' <small>' + pct.toFixed(1) + ' %</small></span></li>';
                }).join('') + '</ol>';
        } catch (e) { cuerpo.innerHTML = '<p class="an-estado error">' + esc(e.message) + '</p>'; }
    }
    $('anConceptosGrafica').addEventListener('click', grafica);
    document.querySelectorAll('[data-grafica-cerrar]').forEach(function (b) { b.addEventListener('click', function () { $('anGrafica').close(); }); });
    $('anGrafica').addEventListener('click', function (e) { if (e.target === this) this.close(); });

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
