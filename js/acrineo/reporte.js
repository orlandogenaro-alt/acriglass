// ACRINEO · página del reporte impreso (acrineo-reporte.php): «Imprimir / PDF» y «Exportar a Excel» con los mismos datos.
// ?imprimir=1 abre el cuadro de impresión al cargar y ?excel=1 baja el .xlsx.
(function () {
    'use strict';

    var r = window.ACRINEO_REPORTE;
    if (!r) return;
    var e = r.encabezado;
    var D = function (v) { return v == null ? '' : { v: Number(v), e: 'dinero' }; };
    var Q = function (v) { return v == null ? '' : { v: Number(v), e: 'cantidad' }; };
    var T = function (v) { return { v: v, e: 'titulo' }; };
    var B = function (v) { return { v: v, e: 'negrita' }; };
    var X = function (v) { return { v: v || '', e: 'texto' }; };
    var TOT = function (v) { return { v: Number(v) || 0, e: 'total' }; };

    function cabecera(n) {
        var f = [[B(r.titulo.toUpperCase())], ['Presupuesto', e.codigo], ['Obra', e.nombre], ['Cliente', e.cliente], ['Lugar', e.lugar], ['Fecha', e.fecha.split('-').reverse().join('/')], []];
        f.forEach(function (x) { while (x.length < n) x.push(''); });
        return f;
    }

    function presupuesto() {
        var f = cabecera(6);
        f.push([T('Código'), T('Concepto'), T('Unidad'), T('Cantidad'), T('P. Unitario'), T('Importe')]);
        var fija = f.length;
        r.partidas.forEach(function (p) {
            f.push([B(p.codigo), B(new Array(p.nivel + 1).join('   ') + p.descripcion), '', '', '', TOT(p.importe)]);
            p.conceptos.forEach(function (c) { f.push([c.codigo, X(c.descripcion), c.unidad, Q(c.cantidad), D(c.precio), D(c.importe)]); });
        });
        f.push([], ['', B('TOTAL DEL PRESUPUESTO SIN IVA'), '', '', '', TOT(r.subtotal)],
               ['', B('IVA ' + Number(r.iva_pct).toFixed(2) + ' %'), '', '', '', TOT(r.iva)],
               ['', B('TOTAL DEL PRESUPUESTO'), '', '', '', TOT(r.total)], ['', B(r.letra)]);
        return { anchos: [14, 60, 10, 14, 16, 18], filas: f, fijarFila: fija };
    }

    function analisis() {
        var f = cabecera(7);
        r.conceptos.forEach(function (c) {
            f.push([B('Análisis: ' + c.codigo), X(c.descripcion), B('Unidad: ' + c.unidad), '', '', '', '']);
            f.push([T('Código'), T('Concepto'), T('Unidad'), T('Costo'), T('Cantidad'), T('% Desp.'), T('Importe')]);
            c.grupos.forEach(function (g) {
                f.push([B(g.nombre.toUpperCase())]);
                g.filas.forEach(function (x) { f.push([x.codigo, X(x.descripcion), x.unidad, D(x.costo), { v: x.cantidad, e: 'cantidad' }, x.desperdicio || '', D(x.importe)]); });
                f.push(['', B('Total ' + g.nombre.toLowerCase()), '', '', '', '', TOT(g.total)]);
            });
            f.push(['', B('Costo directo'), '', '', '', '', TOT(c.costo_directo)]);
            c.sobrecosto.forEach(function (s) { f.push(['', s[1] == null ? B(s[0]) : s[0], '', '', '', s[1] == null ? '' : { v: s[1] / 100, e: 'pct' }, s[1] == null ? TOT(s[2]) : D(s[2])]); });
            f.push(['', B('Precio unitario' + (c.precio_alzado ? ' (precio fijo)' : '')), '', '', '', '', TOT(c.precio)], ['', B(c.letra)], []);
        });
        return { anchos: [14, 60, 10, 14, 14, 10, 18], filas: f };
    }

    function explosion() {
        var f = cabecera(6);
        f.push([T('Código'), T('Descripción'), T('Unidad'), T('Costo'), T('Cantidad'), T('Importe')]);
        var fija = f.length;
        r.grupos.forEach(function (g) {
            f.push([B(g.nombre.toUpperCase())]);
            g.insumos.forEach(function (i) { f.push([i.codigo, X(i.descripcion), i.unidad, D(i.costo), Q(i.cantidad), D(i.importe)]); });
            f.push(['', B('Total ' + g.nombre.toLowerCase()), '', '', '', TOT(g.total)]);
        });
        f.push([], ['', B('TOTAL DE LA EXPLOSIÓN DE INSUMOS'), '', '', '', TOT(r.total)]);
        return { anchos: [14, 60, 10, 14, 16, 18], filas: f, fijarFila: fija };
    }

    function excel() {
        var h = r.tipo === 'analisis' ? analisis() : r.tipo === 'explosion' ? explosion() : presupuesto();
        h.nombre = r.titulo.slice(0, 31);
        var nombre = (r.titulo + ' ' + e.codigo).replace(/[\\\/:*?"<>|]+/g, ' ').trim();
        window.XlsxSimple.descargar(window.XlsxSimple.crear(h), nombre + '.xlsx');
    }

    document.getElementById('rpImprimir').addEventListener('click', function () { window.print(); });
    document.getElementById('rpExcel').addEventListener('click', excel);
    var q = new URLSearchParams(location.search);
    if (q.get('excel') === '1') excel();
    else if (q.get('imprimir') === '1') window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 150); });
})();
