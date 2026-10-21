// Formato impreso «Análisis de Cancelería» (como la hoja de Excel COSTOS ACRISTALA · ANALISIS CANCELERIA).
// Lo usan presupuesto.js (Imprimir › Análisis de Cancelería) y hoja-membretada.js (vista previa).
// FormatoAnalisis(doc, membrete) → HTML
//   doc = { folio, fecha (aaaa-mm-dd), cliente, proyecto, ubicacion, tc, subtotal, iva, total, letra,
//           filas: [{ clase, anexo, nombre, extra, pres, sub, tot, p, como }] }   (filasResumenCc de presupuesto.js)
//   Los textos del encabezado, la nota y la firma salen de la Hoja Membretada (campos an_*).
window.FormatoAnalisis = function (doc, m) {
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function n(v) { var x = parseFloat(v); return isNaN(x) ? 0 : x; }
    function mil(v) { return n(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    // Como en Excel: el signo a la izquierda y el importe a la derecha; el cero es «-»
    function dinero(v, fijo) {
        if (v == null) return '';
        return '<span class="fa-sig">$</span>' + (!fijo && Math.abs(n(v)) < 0.005 ? '-' : mil(v));
    }
    function pct(v) { return v == null ? '' : mil(v) + '%'; }
    function fechaLarga(f) {
        if (!/^\d{4}-\d{2}-\d{2}/.test(f || '')) return '';
        var d = new Date(+f.substr(0, 4), +f.substr(5, 2) - 1, +f.substr(8, 2));
        return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    var filas = (doc.filas || []).filter(function (f) {
        return f.clase.indexOf('ccr-vacio') < 0 && (f.como !== 'usd' || m.an_dolares);
    }).map(function (f) {
        var cls = f.clase.split(' ').map(function (c) { return c.replace('ccr-', 'fa-'); }).join(' ');
        var tot = f.como === 'pct' ? (f.tot == null ? '' : '<b>' + pct(f.tot) + '</b>')
            : f.como === 'usd' ? (f.tot == null ? '' : 'US$ ' + mil(f.tot)) : dinero(f.tot, f.como === 'fijo');
        return '<tr class="' + cls + '"><td class="fa-anexo">' + esc(f.anexo) + '</td>' +
            '<td>' + esc(f.nombre) + (f.extra ? ' <small>(' + esc(f.extra) + ')</small>' : '') + '</td>' +
            '<td class="num">' + dinero(f.pres) + '</td><td class="num">' + dinero(f.sub) + '</td>' +
            '<td class="num">' + tot + '</td><td class="num">' + pct(f.p) + '</td></tr>';
    }).join('');

    var encabezado =
        '<table class="fa-enc">' +
            '<tr><td class="fa-logo" rowspan="3">' + (m.logo ? '<img src="' + esc(m.logo) + '" alt="">' : '') + '</td>' +
                '<td colspan="3" class="fa-t1">' + esc(m.an_titulo) + '</td></tr>' +
            '<tr><td colspan="3" class="fa-t2 fa-relleno">' + esc(m.an_subtitulo) + '</td></tr>' +
            '<tr><td>Código: <b>' + esc(m.an_codigo) + '</b></td><td>Revisión <b>' + esc(m.an_revision) + '</b></td>' +
                '<td class="fa-emision">Fecha de emisión: <b>' + esc(m.an_fecha_emision) + '</b></td></tr>' +
        '</table>' +
        '<table class="fa-datos">' +
            '<tr><td colspan="2"><b>PROPUESTA N°: ' + esc(doc.folio || 0) + '</b></td></tr>' +
            '<tr><td><b>NOMBRE DEL PROYECTO: ' + esc(doc.proyecto) + '</b></td><td class="fa-der"><b>FECHA: &nbsp;' + esc(fechaLarga(doc.fecha)) + '</b></td></tr>' +
            '<tr><td><b>UBICACIÓN: ' + esc(doc.ubicacion) + '</b></td><td class="fa-der"><b>T.C.: ' + (n(doc.tc) > 0 ? mil(doc.tc) : '') + '</b></td></tr>' +
            '<tr><td colspan="2"><b>' + esc(m.an_etiqueta_cliente) + ': ' + esc(doc.cliente) + '</b></td></tr>' +
        '</table>' +
        '<div class="fa-caja"><table class="fa-mini">' +
            '<tr><td>SUBTOTAL</td><td class="num">' + dinero(doc.subtotal, true) + '</td></tr>' +
            '<tr><td>IVA</td><td class="num">' + dinero(doc.iva, true) + '</td></tr>' +
            '<tr><td>TOTAL</td><td class="num">' + dinero(doc.total, true) + '</td></tr>' +
        '</table></div>';

    var tabla = '<table class="fa-tabla">' +
        '<thead><tr class="fa-relleno"><th>ANEXOS</th><th>PARTIDAS</th><th>PRESUPUESTO SUGERIDO AL COSTO</th><th>SUBTOTAL</th><th>TOTAL</th><th>%</th></tr></thead>' +
        '<tbody>' + filas + (doc.letra ? '<tr class="fa-letra"><td></td><td colspan="5">' + esc(doc.letra) + '</td></tr>' : '') + '</tbody></table>';

    var nota = m.an_nota ? '<div class="fa-nota"><span>NOTA:</span><b>' + esc(m.an_nota).replace(/\n/g, '<br>') + '</b></div>' : '';
    var firma = (m.an_autorizo || m.an_puesto || m.an_nombre)
        ? '<div class="fa-firma"><div>' + esc(m.an_autorizo) + '</div><div class="fa-linea"></div>' +
          '<div>' + esc(m.an_puesto) + '</div><div>' + esc(m.an_nombre) + '</div></div>' : '';

    return '<div class="fa" style="--fa-relleno:' + esc(m.an_color || '#dbeef4') + '">' +
        encabezado + tabla + nota + firma + '</div>';
};
