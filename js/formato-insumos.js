// Formato impreso de los insumos de la obra, como los reportes de Neodata «Relación y análisis de costos básicos de
// los materiales» (Costos Mat) y «Datos básicos del costo de la maquinaria» (Costo Maq): por tipo de insumo, su código,
// unidad, costo unitario, cantidad que lleva la obra e importe. Usa la misma hoja que el Catálogo de Conceptos (.fc).
// Lo usa presupuesto.js (Imprimir › Relación de Costos de Materiales / Explosión de Insumos).
// FormatoInsumos(doc, membrete) → HTML
//   doc = { fecha (aaaa-mm-dd), cotizacion, empresa, obra, lugar, titulo,
//           grupos: [{ titulo, insumos: [{ codigo, nombre, um, cantidad, importe }] }] }
window.FormatoInsumos = function (doc, m) {
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function n(v) { var x = parseFloat(v); return isNaN(x) ? 0 : x; }
    function dinero(v) { return '$' + n(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function cant(v) { return n(v).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }); }
    function fecha(f) { return /^\d{4}-\d{2}-\d{2}/.test(f || '') ? f.substr(8, 2) + '/' + f.substr(5, 2) + '/' + f.substr(0, 4) : ''; }
    function cssTexto(s) { return '"' + String(s || '').replace(/[\\"]/g, '\\$&').replace(/[\r\n]+/g, ' ') + '"'; }

    var grupos = (doc.grupos || []).filter(function (g) { return g.insumos && g.insumos.length; });
    var total = 0;

    var encabezado =
        '<div class="fc-enc">' +
            '<div class="fc-enc-izq">' +
                (m.cc_empresa ? '<div class="fc-empresa">' + esc(m.cc_empresa) + '</div>' : '') +
                (m.cc_subtitulo ? '<div class="fc-sub">' + esc(m.cc_subtitulo) + '</div>' : '') +
                '<table class="fc-mini"><tr><td>Fecha:</td><td>' + fecha(doc.fecha) + '</td></tr>' +
                '<tr><td>Cotizacion:</td><td>' + esc(doc.cotizacion) + '</td></tr></table>' +
            '</div>' +
            '<div class="fc-logo">' + (m.logo ? '<img src="' + esc(m.logo) + '" alt="">' : '') + '</div>' +
        '</div>' +
        '<table class="fc-datos">' +
            '<tr><th>Empresa:</th><td>' + esc(doc.empresa) + '</td><td class="fc-der"><b>Obra:</b> ' + esc(doc.obra) + '</td></tr>' +
            '<tr><th>Lugar:</th><td colspan="2">' + esc(doc.lugar) + '</td></tr>' +
        '</table>' +
        '<h1 class="fc-titulo">' + esc(doc.titulo || 'EXPLOSIÓN DE INSUMOS') + '</h1>';
    var columnas = '<tr class="fc-cols"><th>Código</th><th>Concepto</th><th>Unidad</th><th>Costo Unitario</th><th>Cantidad</th><th>Importe</th></tr>';

    var filas = grupos.map(function (g) {
        var suma = 0;
        var renglones = g.insumos.map(function (i) {
            suma += n(i.importe);
            var q = n(i.cantidad);
            return '<tr class="fi-insumo"><td>' + esc(i.codigo) + '</td><td>' + esc(i.nombre) + '</td><td>' + esc(i.um) + '</td>' +
                '<td class="num">' + (q ? dinero(n(i.importe) / q) : '') + '</td><td class="num">' + (q ? cant(q) : '') + '</td>' +
                '<td class="num">' + dinero(i.importe) + '</td></tr>';
        }).join('');
        total += suma;
        return (grupos.length > 1 ? '<tr class="fi-grupo"><td colspan="6">' + esc(g.titulo) + '</td></tr>' : '') + renglones +
            '<tr class="fi-suma"><td colspan="5">Total ' + esc(g.titulo) + '</td><td class="num">' + dinero(suma) + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="fc-vacio">Sin insumos</td></tr>';

    var totales = grupos.length > 1
        ? '<table class="fc-totales"><tr><td>TOTAL DE INSUMOS (COSTO DIRECTO):</td><td class="num">' + dinero(total) + '</td></tr></table>' : '';

    var pagina = '<style>@page catalogo { margin: 12mm 10mm 16mm;' +
        ' @top-right { content: "Página " counter(page) " de " counter(pages); font: 9px Arial, sans-serif; }' +
        ' @bottom-right { content: none; }' +
        (m.cc_pie ? ' @bottom-center { content: ' + cssTexto(m.cc_pie) + '; font: 9px Arial, sans-serif; }' : '') + ' }</style>';

    return pagina + '<div class="fc fi" style="--fc-color:' + esc(m.cc_color || '#000000') + '">' +
        '<table class="fc-hoja"><colgroup><col style="width:14%"><col style="width:43%"><col style="width:7%"><col style="width:12%"><col style="width:11%"><col style="width:13%"></colgroup>' +
        '<thead><tr><td colspan="6" class="fc-cab">' + encabezado + '</td></tr>' + columnas + '</thead>' +
        '<tbody>' + filas + '</tbody></table>' +
        totales +
        (m.cc_pie ? '<div class="fc-pie">' + esc(m.cc_pie) + '</div>' : '') +
        '</div>';
};
