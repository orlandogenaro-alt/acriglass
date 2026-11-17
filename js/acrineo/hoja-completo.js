// ACRINEO · Pestaña «Presupuesto completo» (F4), como en Neodata: todos los conceptos del presupuesto en orden, sin el
// árbol de partidas, con su % de participación y el acumulado. La cantidad y el costo se cambian aquí mismo (Enter o al
// salir del campo; el costo de un concepto con matriz sale de ella). La marca (M) es la misma del catálogo de abajo y
// sirve para el Cálculo «Sólo conceptos marcados». Doble clic abre la matriz del concepto.
(function (AN) {
    'use strict';

    var H = AN.hoja;
    if (!H || !document.getElementById('anCompleto')) return;
    var $ = function (id) { return document.getElementById(id); };
    var esc = AN.ui.esc;
    var tbody = $('anCompletoFilas');
    var panel = $('anCompleto');
    var st = { filas: [], abierta: false, cargando: 0 };
    var COLS = 16;

    function cantidad(n) { return (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: H.ctx.dec_cantidades, maximumFractionDigits: H.ctx.dec_cantidades }); }
    function estado(t, tipo) { var e = $('anCompletoEstado'); e.textContent = t || ''; e.className = 'an-ayuda an-estado' + (tipo ? ' ' + tipo : ''); }

    // ---------- Pestaña ----------
    function ver(si) {
        panel.hidden = !si;
        $('anTabCompleto').setAttribute('aria-selected', String(si));
        if (si) {
            $('anHoja').hidden = true;
            $('anMatriz').hidden = true;
            $('anTabPresupuesto').setAttribute('aria-selected', 'false');
            $('anTabMatriz').setAttribute('aria-selected', 'false');
        }
    }
    function abrir() {
        st.abierta = true;
        $('anTabCompletoCont').hidden = false;
        ver(true);
        cargar();
    }
    function cerrar() {
        st.abierta = false;
        $('anTabCompletoCont').hidden = true;
        ver(false);
        $('anTabPresupuesto').click();
    }
    // Si se muestra la hoja o la matriz (sus pestañas, doble clic…), esta pestaña se oculta
    var obs = new MutationObserver(function () { if (!panel.hidden && (!$('anHoja').hidden || !$('anMatriz').hidden)) ver(false); });
    obs.observe($('anHoja'), { attributes: true, attributeFilter: ['hidden'] });
    obs.observe($('anMatriz'), { attributes: true, attributeFilter: ['hidden'] });

    // ---------- Datos ----------
    async function cargar() {
        var n = ++st.cargando;
        if (!st.filas.length) tbody.innerHTML = '<tr class="an-vacio"><td colspan="' + COLS + '">Cargando…</td></tr>';
        try {
            var r = await AN.api.get(H.url({ recurso: 'completo' }));
            if (n !== st.cargando) return;
            st.filas = r.renglones;
            pintar();
        } catch (e) { tbody.innerHTML = '<tr class="an-vacio"><td colspan="' + COLS + '">' + esc(e.message) + '</td></tr>'; }
    }

    function pintar() {
        var q = $('anCompletoQ').value.trim(), modo = AN.ui.modo($('anCompletoQ'));
        var filas = st.filas.filter(function (r) { return AN.ui.coincide([r.partida_codigo, r.partida_descripcion, r.codigo, r.descripcion, r.unidad], q, modo); });
        var total = st.filas.reduce(function (t, r) { return t + r.importe; }, 0), acum = 0;
        var marcado = function (id) { return AN.hojaConceptos && AN.hojaConceptos.marcados().indexOf(id) >= 0; };
        var puede = H.puede;
        tbody.innerHTML = filas.map(function (r) {
            var pct = total ? r.importe / total * 100 : 0;
            acum += pct;
            return '<tr class="an-fila" data-renglon="' + r.renglon_id + '" data-concepto="' + r.concepto_id + '">'
                + '<td class="an-col-sel"><input type="checkbox" data-marca' + (marcado(r.concepto_id) ? ' checked' : '') + ' aria-label="Marcar ' + esc(r.codigo) + '"></td>'
                + '<td class="an-col-pa">' + (r.pendiente_analizar ? '<span class="an-pa si" title="Pendiente de analizar">✓</span>' : '<span class="an-pa" title="Analizado">✕</span>') + '</td>'
                + '<td class="num">' + r.n + '</td>'
                + '<td>' + esc(r.partida_codigo) + '</td><td class="an-desc-corta" title="' + esc(r.partida_descripcion) + '">' + esc(r.partida_descripcion) + '</td>'
                + '<td class="num">' + r.renglon + '</td><td>' + esc(r.codigo) + '</td>'
                + '<td class="an-desc">' + esc(r.descripcion) + '</td><td>' + esc(r.unidad || '') + '</td><td class="num">' + esc(r.tipo) + '</td>'
                + '<td class="num">' + (puede ? '<input class="an-celda-in num" type="number" min="0" step="any" inputmode="decimal" data-k="cantidad" value="' + esc(r.cantidad) + '" aria-label="Cantidad de ' + esc(r.codigo) + '">' : cantidad(r.cantidad)) + '</td>'
                + '<td class="num">' + (puede && !r.matriz ? '<input class="an-celda-in num" type="number" min="0" step="any" inputmode="decimal" data-k="costo" value="' + esc(r.costo) + '" aria-label="Costo de ' + esc(r.codigo) + '">'
                    : AN.ui.dinero(r.costo) + (r.matriz ? '<span class="an-insignia" title="Sale de su matriz">M</span>' : '')) + '</td>'
                + '<td class="num">' + AN.ui.dinero(r.precio) + (r.precio_alzado ? '<span class="an-insignia" title="Precio fijo">Fijo</span>' : '') + '</td>'
                + '<td class="num">' + AN.ui.dinero(r.importe) + '</td>'
                + '<td class="num">' + pct.toFixed(2) + ' %</td><td class="num">' + acum.toFixed(2) + ' %</td></tr>';
        }).join('') || '<tr class="an-vacio"><td colspan="' + COLS + '">' + (q ? 'Ningún concepto coincide con el filtro.' : 'El presupuesto todavía no tiene conceptos en sus partidas.') + '</td></tr>';
        $('anCompletoConteo').textContent = (filas.length < st.filas.length ? filas.length + ' de ' : '') + st.filas.length + ' concepto' + (st.filas.length === 1 ? '' : 's');
        $('anCompletoTotal').textContent = AN.ui.dinero(total);
    }

    // ---------- Cambios ----------
    async function cambiar(input) {
        var tr = input.closest('tr[data-renglon]'), r = st.filas.find(function (x) { return x.renglon_id === +tr.dataset.renglon; });
        var k = input.dataset.k, v = input.value.trim();
        if (!r || String(r[k]) === v || (v !== '' && Number(v) === Number(r[k]))) return;
        input.classList.remove('invalido');
        estado('Guardando…', 'info');
        var cuerpo = { accion: 'renglon_cambiar', renglon_id: r.renglon_id, partida_id: H.sel || 0 };
        cuerpo[k] = v;
        try {
            H.aplicar(await AN.api.post(H.url(), cuerpo));
            await cargar();
            estado(r.codigo + ': ' + (k === 'cantidad' ? 'cantidad' : 'costo') + ' guardado', 'ok');
            var sig = tbody.querySelector('tr[data-renglon="' + r.renglon_id + '"] [data-k="' + k + '"]');
            if (sig && document.activeElement === document.body) sig.focus();
        } catch (e) {
            input.classList.add('invalido');
            input.title = e.message;
            estado(e.message, 'error');
        }
    }
    tbody.addEventListener('change', function (e) {
        if (e.target.dataset.k) { cambiar(e.target); return; }
        if (e.target.matches('[data-marca]') && AN.hojaConceptos) {
            var cid = +e.target.closest('tr').dataset.concepto;
            AN.hojaConceptos.marcar(cid, e.target.checked);
            tbody.querySelectorAll('tr[data-concepto="' + cid + '"] [data-marca]').forEach(function (c) { c.checked = e.target.checked; });   // el mismo concepto en otras partidas
        }
    });
    tbody.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target.dataset.k) { e.preventDefault(); e.target.blur(); }
        else if (e.key === 'Escape' && e.target.dataset.k) {
            var r = st.filas.find(function (x) { return x.renglon_id === +e.target.closest('tr').dataset.renglon; });
            if (r) e.target.value = r[e.target.dataset.k];
            e.target.blur();
        }
    });
    tbody.addEventListener('dblclick', function (e) {
        if (e.target.closest('input')) return;
        var tr = e.target.closest('tr[data-concepto]');
        if (tr && AN.hojaMatriz) AN.hojaMatriz.abrir(+tr.dataset.concepto);
    });
    $('anCompletoQ').addEventListener('input', AN.ui.retrasar(pintar, 150));
    $('anCompletoQ').addEventListener('modo', pintar);
    $('anTabCompleto').addEventListener('click', function () { ver(true); cargar(); });
    $('anCompletoCerrar').addEventListener('click', cerrar);
    // Si cambia algo en la hoja (otra pestaña), al volver se recarga
    H.on(function (evento) { if (evento === 'estado' && st.abierta && panel.hidden) st.filas = []; });

    if (AN.rejilla) AN.rejilla.opciones('completo', { fijas: 0, archivo: function () { return 'Presupuesto completo ' + H.ctx.codigo; } });
    AN.hojaCompleto = { abrir: abrir };
})(window.AcriNeo = window.AcriNeo || {});
