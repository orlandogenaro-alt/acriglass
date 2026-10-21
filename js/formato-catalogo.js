// Formato impreso «Catálogo de Conceptos» (como el PDF PRESUPUESTO DE OBRA: Código, Concepto, Unidad, Cantidad, P. Unitario, Importe).
// Lo usan presupuesto.js (Imprimir › Catálogo de Conceptos) y hoja-membretada.js (vista previa).
// FormatoCatalogo(doc, membrete) → HTML
//   doc = { fecha (aaaa-mm-dd), cotizacion, empresa, atencion, obra, lugar, iva_pct, subtotal, letra,
//           conceptos: [{ clave, descripcion, especificacion, unidad, cantidad, pu, importe }] }
//   Los textos del encabezado, las condiciones y la firma del pie salen de la Hoja Membretada (campos cc_*).
window.FormatoCatalogo = function (doc, m) {
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function n(v) { var x = parseFloat(v); return isNaN(x) ? 0 : x; }
    function dinero(v) { return '$' + n(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function cant(v) { return n(v).toFixed(4); }
    function fecha(f) { return /^\d{4}-\d{2}-\d{2}/.test(f || '') ? f.substr(8, 2) + '/' + f.substr(5, 2) + '/' + f.substr(0, 4) : ''; }
    // Las condiciones: un renglón por viñeta; lo que va entre *asteriscos* sale en negritas
    function condicion(t) { return esc(t).replace(/\*([^*]+)\*/g, '<b>$1</b>'); }
    // Texto para content: "…" de la regla @page
    function cssTexto(s) { return '"' + String(s || '').replace(/[\\"]/g, '\\$&').replace(/[\r\n]+/g, ' ') + '"'; }

    var subtotal = n(doc.subtotal), iva = subtotal * n(doc.iva_pct) / 100;

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
            '<tr><th>En atencion a:</th><td>' + esc(doc.atencion) + '</td><td class="fc-der"><b>Lugar:</b> ' + esc(doc.lugar) + '</td></tr>' +
        '</table>' +
        (m.cc_titulo ? '<h1 class="fc-titulo">' + esc(m.cc_titulo) + '</h1>' : '');
    var columnas = '<tr class="fc-cols"><th>Código</th><th>Concepto</th><th>Unidad</th><th>Cantidad</th><th>P. Unitario</th><th>Importe</th></tr>';

    var filas = (doc.conceptos || []).map(function (c) {
        var espec = String(c.especificacion || '').trim();
        return '<tr class="fc-concepto"><td>' + esc(c.clave) + '</td>' +
            '<td class="fc-texto">' + esc(c.descripcion) + (espec ? '<br>' + esc(espec).replace(/\n/g, '<br>') : '') + '</td>' +
            '<td>' + esc(c.unidad) + '</td><td class="num">' + cant(c.cantidad) + '</td>' +
            '<td class="num">' + dinero(c.pu) + '</td><td class="num">' + dinero(c.importe) + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="fc-vacio">Sin conceptos</td></tr>';

    var letra = String(doc.letra || '').replace(/^\(\s*/, '').replace(/\s*\)$/, '');
    var totales = '<table class="fc-totales">' +
        '<tr><td>TOTAL DEL PRESUPUESTO MOSTRADO SIN IVA:</td><td class="num">' + dinero(subtotal) + '</td></tr>' +
        '<tr><td>IVA ' + n(doc.iva_pct).toFixed(2) + '%</td><td class="num">' + dinero(iva) + '</td></tr>' +
        '<tr><td>TOTAL DEL PRESUPUESTO MOSTRADO:</td><td class="num">' + dinero(subtotal + iva) + '</td></tr>' +
        (letra ? '<tr><td colspan="2">(* ' + esc(letra) + ' *)</td></tr>' : '') +
        '</table>';

    var lineas = String(m.cc_condiciones || '').split(/\r?\n/).map(function (l) { return l.replace(/^\s*[•\-]\s*/, '').trim(); }).filter(Boolean);
    var condiciones = lineas.length
        ? '<div class="fc-cond"><b>' + esc(m.cc_condiciones_titulo || 'CONDICIONES COMERCIALES') + '</b>' +
          lineas.map(function (l) { return '<div>• ' + condicion(l) + '</div>'; }).join('') + '</div>' : '';

    // Al imprimir, la página y la firma del pie van en los márgenes de cada hoja (@page catalogo);
    // en pantalla (vista previa) la firma sale al final.
    var pagina = '<style>@page catalogo { margin: 12mm 10mm 16mm;' +
        ' @top-right { content: "Página " counter(page) " de " counter(pages); font: 9px Arial, sans-serif; }' +
        ' @bottom-right { content: none; }' +
        (m.cc_pie ? ' @bottom-center { content: ' + cssTexto(m.cc_pie) + '; font: 9px Arial, sans-serif; }' : '') + ' }</style>';

    return pagina + '<div class="fc" style="--fc-color:' + esc(m.cc_color || '#000000') + '">' +
        '<table class="fc-hoja"><colgroup><col style="width:12%"><col style="width:45%"><col style="width:7%"><col style="width:10%"><col style="width:13%"><col style="width:13%"></colgroup>' +
        '<thead><tr><td colspan="6" class="fc-cab">' + encabezado + '</td></tr>' + columnas + '</thead>' +
        '<tbody>' + filas + '</tbody></table>' +
        totales + condiciones +
        (m.cc_pie ? '<div class="fc-pie">' + esc(m.cc_pie) + '</div>' : '') +
        '</div>';
};
