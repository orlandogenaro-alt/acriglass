// ACRINEO · Ventana «Facturas y Easy-Glass» del presupuesto (botón junto a Detalle): lo que tiene ligado (facturas y
// pedidos de Microsip, presupuestos de Easy-Glass) con el resumen contra el precio de venta, y la búsqueda para ligar
// más (la misma de Asignar Cotización de Obras). includes/acrineo/vistas/ligados.php · includes/acrineo/ligados.php
(function (AN) {
    'use strict';

    var H = AN.hoja;
    var $ = function (id) { return document.getElementById(id); };
    var dlg = $('anLigados');
    if (!H || !dlg) return;
    var esc = AN.ui.esc, dinero = AN.ui.dinero;
    var cfg = window.ACRINEO || {};
    var puede = !!(cfg.permisos && cfg.permisos['presupuestos.documentos']);
    var URL = 'api/acrineo/presupuestos.php';
    var url = function (p) { return AN.api.url(URL, Object.assign({ id: H.id, recurso: 'ligados' }, p || {})); };
    var resultados = [];
    var busqueda = null;
    var CLASE = { 'Factura Microsip': 'fac', 'Pedido Microsip': 'ped', 'Easy-Glass': 'eg' };

    function estado(t, tipo) { var e = $('anLgEstado'); e.textContent = t || ''; e.className = 'an-estado' + (tipo ? ' ' + tipo : ''); }
    function origen(o) { return '<span class="an-lg-origen ' + (CLASE[o] || '') + '">' + esc(o) + '</span>'; }
    function fecha(f) { return esc(AN.ui.fechaCorta(String(f || '').slice(0, 10))); }

    function pintarResumen(r) {
        var dif = r.por_facturar;
        $('anLgResumen').innerHTML = [
            ['Precio de venta', dinero(r.precio_venta), 'sin IVA'],
            ['Precio con IVA', dinero(r.precio_con_iva), r.iva_pct + ' %'],
            ['Facturado', dinero(r.facturado), r.avance_pct.toFixed(1) + ' % del precio con IVA', 'fac'],
            [dif >= 0 ? 'Por facturar' : 'Facturado de más', dinero(Math.abs(dif)), '', dif >= 0 ? '' : 'mas'],
            ['Pedidos Microsip', dinero(r.pedidos), '', 'ped'],
            ['Presupuestos Easy-Glass', dinero(r.easyglass), '', 'eg']
        ].map(function (c) {
            return '<div class="an-lg-dato ' + (c[3] || '') + '"><span>' + esc(c[0]) + '</span><b>' + esc(c[1]) + '</b>' + (c[2] ? '<small>' + esc(c[2]) + '</small>' : '') + '</div>';
        }).join('');
    }

    function pintarLigados(d) {
        pintarResumen(d.resumen);
        var tb = $('anLgFilas');
        if (!d.disponible) { tb.innerHTML = '<tr class="an-vacio"><td colspan="9">Falta aplicar la migración 034 para poder ligar facturas y folios.</td></tr>'; return; }
        if (!d.filas.length) { tb.innerHTML = '<tr class="an-vacio"><td colspan="9">Todavía no hay facturas ni folios ligados. Búscalos abajo.</td></tr>'; return; }
        tb.innerHTML = d.filas.map(function (f) {
            return '<tr><td>' + origen(f.origen) + '</td><td><b>' + esc(f.folio) + '</b>' + (f.folio_easy ? '<small class="an-ayuda"> · ' + esc(f.folio_easy) + '</small>' : '') + '</td>'
                + '<td>' + fecha(f.fecha) + '</td><td>' + esc(f.cliente || '') + '</td><td class="an-lg-det" title="' + esc(f.detalle || '') + '">' + esc(f.detalle || '') + '</td>'
                + '<td class="num">' + dinero(f.total) + (f.moneda && f.moneda !== 'MN' && f.moneda !== 'MXN' ? ' <small>' + esc(f.moneda) + '</small>' : '') + '</td>'
                + '<td>' + esc(f.estatus || '') + (f.tambien_en ? '<small class="an-lg-tambien">También en ' + esc(f.tambien_en) + '</small>' : '') + '</td>'
                + '<td><small>' + esc(f.ligo || '') + '<br>' + fecha(f.ligado_el) + '</small></td>'
                + '<td>' + (puede ? '<button type="button" class="an-btn an-mini an-icono" data-quitar="' + f.id + '" title="Quitar de este presupuesto" aria-label="Quitar ' + esc(f.folio) + '">' + '×' + '</button>' : '') + '</td></tr>';
        }).join('');
    }

    async function cargar() {
        try { pintarLigados(await AN.api.get(url())); estado(''); }
        catch (e) { estado(e.message, 'error'); }
    }

    function pintarResultados() {
        var tb = $('anLgResultados');
        if (!resultados.length) { tb.innerHTML = '<tr class="an-vacio"><td colspan="8">Sin coincidencias en Microsip ni en Easy-Glass.</td></tr>'; return; }
        tb.innerHTML = resultados.map(function (f, i) {
            var boton = f.ligado ? '<span class="an-lg-ya">Ligado</span>'
                : puede ? '<button type="button" class="an-btn an-primario an-mini" data-ligar="' + i + '">Ligar</button>' : '';
            return '<tr' + (f.exacto ? ' class="an-lg-exacto"' : '') + '><td>' + origen(f.origen) + '</td><td><b>' + esc(f.folio) + '</b></td><td>' + fecha(f.fecha) + '</td>'
                + '<td>' + esc(f.cliente || '') + '</td><td class="an-lg-det" title="' + esc(f.detalle || '') + '">' + esc(f.detalle || '') + '</td>'
                + '<td class="num">' + dinero(f.total) + '</td><td>' + esc(f.estatus || '') + (f.tambien_en ? '<small class="an-lg-tambien">Ya está en ' + esc(f.tambien_en) + '</small>' : '') + '</td>'
                + '<td>' + boton + '</td></tr>';
        }).join('');
    }

    var buscar = AN.ui.retrasar(async function () {
        var q = $('anLgQ').value.trim();
        if (busqueda) busqueda.abort();
        if (q.length < 2) { resultados = []; $('anLgResultados').innerHTML = '<tr class="an-vacio"><td colspan="8">Escribe al menos 2 letras o números.</td></tr>'; return; }
        busqueda = new AbortController();
        estado('Buscando «' + q + '» en Microsip y Easy-Glass…', 'info');
        try {
            var r = await AN.api.get(url({ q: q }), { signal: busqueda.signal });
            resultados = r.filas;
            pintarResultados();
            estado('');
        } catch (e) { if (e.name !== 'AbortError') estado(e.message, 'error'); }
    }, 350);

    async function ligar(i) {
        var f = resultados[i];
        if (!f) return;
        if (f.tambien_en && !(await AN.ui.confirmar({
            titulo: 'Ese folio ya está en otro presupuesto',
            mensaje: f.origen + ' ' + f.folio + ' ya está ligado a ' + f.tambien_en + '.\n\n¿Ligarlo también a este presupuesto?',
            aceptar: 'Ligar también'
        }))) return;
        estado('Ligando ' + f.folio + '…', 'info');
        try {
            var r = await AN.api.post(url(), f);
            f.ligado = true;
            pintarLigados(r);
            pintarResultados();
            estado(f.origen + ' ' + f.folio + ' ligado.', 'ok');
        } catch (e) { estado(e.message, 'error'); }
    }

    async function quitar(id) {
        var tr = dlg.querySelector('[data-quitar="' + id + '"]').closest('tr');
        var folio = tr.cells[1].textContent;
        if (!(await AN.ui.confirmar({ titulo: 'Quitar folio', mensaje: '¿Quitar ' + folio + ' de este presupuesto? La factura o el folio no se borra de Microsip ni de Easy-Glass.', aceptar: 'Quitar', peligro: true }))) return;
        try {
            var r = await AN.api.del(url({ ligado: id }));
            pintarLigados(r);
            resultados.forEach(function (x) { if (r.filas.every(function (l) { return l.origen !== x.origen || l.folio.toUpperCase() !== String(x.folio).toUpperCase(); })) x.ligado = false; });
            if (resultados.length) pintarResultados();
            estado(folio + ' quitado.', 'ok');
        } catch (e) { estado(e.message, 'error'); }
    }

    function abrir() {
        $('anLgBuscarSec').hidden = !puede;
        $('anLgFilas').innerHTML = '<tr class="an-vacio"><td colspan="9">Cargando…</td></tr>';
        $('anLgResumen').innerHTML = '';
        estado('');
        dlg.showModal();
        cargar();
        if (puede) {
            AN.api.get(url({ precargar: 1 })).catch(function () {});   // deja listo el índice de facturas de Microsip
            $('anLgQ').focus();
        }
    }

    $('anLgQ').addEventListener('input', buscar);
    dlg.addEventListener('click', function (e) {
        var b = e.target.closest('[data-ligar]');
        if (b) { ligar(+b.dataset.ligar); return; }
        b = e.target.closest('[data-quitar]');
        if (b) { quitar(+b.dataset.quitar); return; }
        if (e.target.closest('[data-lg-cerrar]')) dlg.close();
    });
    $('anHojaLigados').addEventListener('click', abrir);
    AN.hojaLigados = { abrir: abrir };
})(window.AcriNeo = window.AcriNeo || {});
