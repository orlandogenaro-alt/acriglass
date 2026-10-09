// Formato impreso del Presupuesto por Proyecto (normal y detalle) sobre la hoja membretada.
// Lo usan presupuesto.js (Imprimir / Imprimir Detalle) y hoja-membretada.js (vista previa).
// FormatoPresupuesto(doc, membrete, detalle) → HTML
//   doc = { folio, fecha (aaaa-mm-dd), estatus, cliente, proyecto, ubicacion, vendedor, elaboro, notas,
//           secciones: [{ titulo, conceptos: [{ concepto, importe, folio, articulos: [{ nombre, unidades, um, total }] }] }],
//           utilidad_pct, subtotal, iva_pct }
window.FormatoPresupuesto = function (doc, m, detalle) {
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function n(v) { var x = parseFloat(v); return isNaN(x) ? 0 : x; }
    function dinero(v) { return '$' + n(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function pct(v) { return n(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'; }
    function cant(v) { return String(Math.round(n(v) * 100) / 100); }
    function fecha(f) { return /^\d{4}-\d{2}-\d{2}/.test(f || '') ? f.substr(8, 2) + '/' + f.substr(5, 2) + '/' + f.substr(0, 4) : ''; }
    function ahora() {
        var d = new Date(), h = d.getHours();
        var dd = function (x) { return ('0' + x).slice(-2); };
        return dd(d.getDate()) + '/' + dd(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' +
            dd(h % 12 || 12) + ':' + dd(d.getMinutes()) + ':' + dd(d.getSeconds()) + (h < 12 ? ' a. m.' : ' p. m.');
    }

    var subtotal = n(doc.subtotal);
    var totSec = doc.secciones.map(function (s) {
        return s.conceptos.reduce(function (t, c) { return t + n(c.importe); }, 0);
    });
    var primo = (totSec[0] || 0) + (totSec[1] || 0);
    var gastos = totSec[2] || 0;
    var costo = primo + gastos;
    var iva = subtotal * n(doc.iva_pct) / 100;
    var porc = function (v) { return subtotal > 0 ? v / subtotal * 100 : 0; };

    // ---------- Encabezado (se repite en cada hoja) ----------
    var encabezado =
        '<div class="fp-enc">' +
            '<div class="fp-logo">' + (m.logo ? '<img src="' + esc(m.logo) + '" alt="">' : '') +
                (m.empresa ? '<b>' + esc(m.empresa) + '</b>' : '') +
                (m.datos ? '<small>' + esc(m.datos).replace(/\n/g, '<br>') + '</small>' : '') + '</div>' +
            '<div class="fp-titulo"><h1>' + esc(detalle ? m.titulo_detalle : m.titulo) + '</h1>' +
                '<div class="fp-folio"><b>Folio: ' + esc(doc.folio || 0) + '</b><small>Fe.Imp:' + ahora() + '</small></div></div>' +
            '<div class="fp-codigo"><b>Codigo: ' + esc(m.codigo) + '</b></div>' +
            '<div class="fp-rev"><b>Revision: ' + esc(m.revision) + '</b></div>' +
            '<div class="fp-elaboro"><b>Elaboro:</b><br><b>' + esc(doc.elaboro) + '</b></div>' +
        '</div>' +
        '<div class="fp-datos">' +
            '<div class="fp-r1"><b>Estatus:</b><br>' + esc(doc.estatus) + '</div>' +
            '<div class="fp-r1"><b>Cliente:</b><br><b>' + esc(doc.cliente) + '</b></div>' +
            '<div class="fp-r1"><b>Fecha:</b><br>' + fecha(doc.fecha) + '</div>' +
            '<div class="fp-totales">' +
                '<span>Subtotal:</span><b>' + dinero(subtotal) + '</b>' +
                '<span>Iva(' + cant(doc.iva_pct) + '%):</span><b>' + dinero(iva) + '</b>' +
                '<span>Total:</span><b>' + dinero(subtotal + iva) + '</b>' +
            '</div>' +
            '<div><b>Vendedor</b><br><b>' + esc(doc.vendedor) + '</b></div>' +
            '<div class="fp-proyecto"><b>Proyecto: ' + esc(doc.proyecto) + (doc.ubicacion ? ' / ' + esc(doc.ubicacion) : '') + '</b></div>' +
        '</div>';

    // ---------- Secciones ----------
    var cuerpo = doc.secciones.map(function (s, i) {
        var filas = s.conceptos.map(function (c) {
            var h = '<tr class="fp-concepto"><td>' + esc(c.concepto) + '</td><td class="num">' + dinero(c.importe) + '</td>' +
                '<td class="num">' + pct(porc(n(c.importe))) + '</td><td class="fp-pres">' + esc(c.folio) + '</td></tr>';
            if (detalle && c.articulos && c.articulos.length) {
                h += '<tr class="fp-det"><td colspan="4"><table>' +
                    '<thead><tr><th>Nombre</th><th class="num">Uds.</th><th>UM</th><th class="num">Total</th></tr></thead><tbody>' +
                    c.articulos.map(function (a) {
                        return '<tr><td>' + esc(a.nombre) + '</td><td class="num">' + cant(a.unidades) + '</td><td>' + esc(a.um) + '</td>' +
                            '<td class="num">' + dinero(a.total) + '</td></tr>';
                    }).join('') + '</tbody></table></td></tr>';
            }
            return h;
        }).join('');
        return '<table class="fp-sec">' +
            '<thead><tr><th>' + esc(s.titulo) + ':</th><th class="num">Importe</th><th class="num">Porcentaje</th><th class="fp-pres">Presupuesto</th></tr></thead>' +
            '<tbody>' + (filas || '<tr><td colspan="4" class="fp-vacio">Sin conceptos</td></tr>') + '</tbody>' +
            '<tfoot><tr><td colspan="4">TOTAL ' + esc(s.titulo) + ': ' + dinero(totSec[i]) + ' &nbsp; ' + pct(porc(totSec[i])) + '</td></tr></tfoot>' +
            '</table>';
    }).join('');

    var resumen = '<div class="fp-resumen">' +
        '<span>Costo Primo:</span><b>' + dinero(primo) + '</b>' +
        '<span>+ Gastos de operacion:</span><b>' + dinero(gastos) + '</b>' +
        '<span>= Costo Total:</span><b>' + dinero(costo) + '</b>' +
        '<span>+ Utilidad Neta: ' + n(doc.utilidad_pct).toLocaleString('es-MX', { maximumFractionDigits: 4 }) + '%</span><b>' + dinero(subtotal - costo) + '</b>' +
        '</div>';

    var notas = m.mostrar_notas
        ? '<div class="fp-notas"><b>Notas:</b> ' + esc(doc.notas).replace(/\n/g, '<br>') + '</div>' : '';

    var firmas = (m.firmas || []).length
        ? '<table class="fp-firmas"><tr>' + m.firmas.map(function (f) { return '<th>' + esc(f) + '</th>'; }).join('') + '</tr>' +
          '<tr>' + m.firmas.map(function () { return '<td>' + esc(m.leyenda_firma) + '</td>'; }).join('') + '</tr></table>'
        : '';

    return '<div class="fp" style="--fp-color:' + esc(m.color || '#000') + '">' +
        '<table class="fp-hoja"><thead><tr><td>' + encabezado + '</td></tr></thead>' +
        '<tbody><tr><td>' + cuerpo + resumen + '<div class="fp-final">' + notas + firmas + '</div></td></tr></tbody>' +
        (m.pie ? '<tfoot><tr><td><div class="fp-pie">' + esc(m.pie) + '</div></td></tr></tfoot>' : '') +
        '</table></div>';
};
