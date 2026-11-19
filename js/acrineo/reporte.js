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

    // Logo de la Hoja Membretada como PNG (para el .xlsx). Si el navegador no lo deja leer, el Excel sale sin logo.
    function logoPng(src, maxAncho, maxAlto) {
        return new Promise(function (resolver) {
            if (!src) { resolver(null); return; }
            var img = new Image(), listo = false;
            var fin = function (v) { if (!listo) { listo = true; resolver(v); } };
            try { if (new URL(src, location.href).origin !== location.origin && src.indexOf('data:') !== 0) img.crossOrigin = 'anonymous'; } catch (e) { /* ruta relativa */ }
            img.onload = function () {
                try {
                    var k = Math.min(maxAncho / img.naturalWidth, maxAlto / img.naturalHeight, 1);
                    var w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
                    var c = document.createElement('canvas');
                    c.width = w * 2; c.height = h * 2;       // al doble para que se vea nítido
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    c.toBlob(function (b) {
                        if (!b) { fin(null); return; }
                        b.arrayBuffer().then(function (a) { fin({ datos: new Uint8Array(a), ancho: w, alto: h }); }, function () { fin(null); });
                    }, 'image/png');
                } catch (e) { fin(null); }
            };
            img.onerror = function () { fin(null); };
            setTimeout(function () { fin(null); }, 5000);
            img.src = src;
        });
    }

    // Alto de un renglón con texto ajustado (puntos): renglones que caben en el ancho de la columna
    function altoTexto(t, anchoCol) {
        var porLinea = Math.max(10, Math.floor(anchoCol * 1.15));
        var lineas = String(t || '').split(/\r?\n/).reduce(function (n, p) { return n + Math.max(1, Math.ceil(p.length / porLinea)); }, 0);
        return Math.max(15, lineas * 12.75 + 3);
    }

    // PRESUPUESTO DE OBRA con la Hoja Membretada, igual que la impresión: empresa y logo, fecha y cotización, caja con
    // empresa / obra / en atención a / lugar, barra de columnas, conceptos, totales con IVA, importe con letra y condiciones
    async function presupuestoFormato() {
        var m = window.ACRINEO_MEMBRETE || {};
        var anchos = [14, 52, 9, 12, 15, 16];
        var f = [], altos = {}, combinar = [];
        var fila = function (celdas, alto) { f.push(celdas); if (alto) altos[f.length] = alto; return f.length; };
        var une = function (desde, hasta, n) { combinar.push(desde + n + ':' + hasta + n); };

        une('A', 'D', fila([{ v: m.empresa || '', e: 'empresa' }], 22));
        une('A', 'D', fila([{ v: m.subtitulo || '', e: 'sub' }]));
        fila([B('Fecha:'), e.fecha.split('-').reverse().join('/')]);
        fila([B('Cotización:'), e.codigo]);
        fila([]);
        var caja = function (et1, v1, et2, v2) {
            var n = fila([{ v: et1, e: 'cajaNegrita' }, { v: v1 || '', e: 'caja' }, { v: '', e: 'caja' }, { v: et2, e: 'cajaNegrita' }, { v: v2 || '', e: 'caja' }, { v: '', e: 'caja' }], 18);
            une('B', 'C', n); une('E', 'F', n);
        };
        caja('Empresa:', e.cliente, 'Obra:', e.nombre);
        caja('En atención a:', e.contacto, 'Lugar:', e.ciudad || e.lugar);
        fila([]);
        une('A', 'F', fila([{ v: m.titulo || 'PRESUPUESTO DE OBRA', e: 'grande' }], 24));
        fila([]);
        var H = function (t) { return { v: t, e: 'encabezado' }; };
        fila([H('Código'), H('Concepto'), H('Unidad'), H('Cantidad'), H('P. Unitario'), H('Importe')], 22);

        var concepto = function (c) {
            fila([{ v: c.codigo || '', e: 'texto' }, { v: c.descripcion || '', e: 'justificado' }, { v: c.unidad || '', e: 'centro' },
                  Q(c.cantidad), { v: Number(c.precio) || 0, e: 'pesos' }, { v: Number(c.importe) || 0, e: 'pesos' }], altoTexto(c.descripcion, anchos[1]));
        };
        r.partidas.forEach(function (p) {
            if (!r.sin_partidas) fila([B(p.codigo), B(new Array(p.nivel + 1).join('   ') + p.descripcion), '', '', '', TOT(p.importe)], 16);
            p.conceptos.forEach(concepto);
        });

        fila([]);
        var total = function (texto, v) {
            var n = fila([{ v: texto, e: 'totalTexto' }, '', '', '', '', { v: Number(v) || 0, e: 'totalGrande' }], 17);
            une('A', 'E', n);
        };
        total('TOTAL DEL PRESUPUESTO MOSTRADO SIN IVA:', r.subtotal);
        total('IVA ' + Number(r.iva_pct).toFixed(2) + '%', r.iva);
        total('TOTAL DEL PRESUPUESTO MOSTRADO:', r.total);
        une('A', 'F', fila([{ v: '(* ' + String(r.letra || '').replace(/^\(|\)$/g, '') + ' *)', e: 'totalTexto' }], 17));

        if (m.condiciones && m.condiciones.length) {
            fila([]); fila([]);
            fila([B(m.condiciones_titulo || 'CONDICIONES COMERCIALES')]);
            m.condiciones.forEach(function (l) {
                var n = fila(['', { v: '•  ' + l.replace(/\*([^*]+)\*/g, '$1'), e: 'negrita' }]);
                une('B', 'F', n);
            });
        }
        if (m.pie) { fila([]); fila([]); une('A', 'F', fila([{ v: m.pie, e: 'centro' }])); }

        var logo = await logoPng(m.logo, 170, 80);
        return {
            anchos: anchos, filas: f, altos: altos, combinar: combinar, sinCuadricula: true, ajustarPagina: true,
            colorEncabezado: m.color || '#000000',
            imagen: logo ? { datos: logo.datos, col: 4, fila: 0, dx: 8, dy: 2, ancho: logo.ancho, alto: logo.alto } : null
        };
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

    async function excel() {
        var h = r.tipo === 'analisis' ? analisis() : r.tipo === 'explosion' ? explosion() : await presupuestoFormato();
        h.nombre = r.titulo.slice(0, 31);
        var nombre = (r.titulo + ' ' + e.codigo + (e.nombre ? ' ' + e.nombre : '')).replace(/[\\\/:*?"<>|]+/g, ' ').trim();
        window.XlsxSimple.descargar(window.XlsxSimple.crear(h), nombre + '.xlsx');
    }

    document.getElementById('rpImprimir').addEventListener('click', function () { window.print(); });
    document.getElementById('rpExcel').addEventListener('click', excel);
    var q = new URLSearchParams(location.search);
    if (q.get('excel') === '1') excel();
    else if (q.get('imprimir') === '1') window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 150); });
})();
