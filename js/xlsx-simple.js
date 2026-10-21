// Excel (.xlsx) sin librerías: escribir una hoja con formato y leer la primera hoja de un archivo.
// XlsxSimple.crear({ nombre, anchos: [n…], filas: [[celda…]] }) → Blob
//   celda: texto, número, null, o { v, e } con e = 'titulo' (negritas con fondo), 'texto' (ajustar texto, arriba),
//          'dinero' (#,##0.00), 'cantidad' (0.0000), 'pct' (0.00%), 'negrita', 'total' (negritas #,##0.00)
// XlsxSimple.leer(archivo) → Promise de [[texto…]] (la primera hoja, con los valores como se ven en las celdas)
window.XlsxSimple = (function () {
    var ESTILOS = { titulo: 1, texto: 2, dinero: 3, cantidad: 4, pct: 5, negrita: 6, total: 7 };

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    }
    function columna(i) { var s = ''; i++; while (i) { s = String.fromCharCode(65 + (i - 1) % 26) + s; i = Math.floor((i - 1) / 26); } return s; }

    function hojaXml(h) {
        var cols = (h.anchos || []).map(function (a, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + a + '" customWidth="1"/>'; }).join('');
        var filas = h.filas.map(function (f, r) {
            return '<row r="' + (r + 1) + '">' + f.map(function (c, i) {
                if (c == null || c === '') return '';
                var v = typeof c === 'object' ? c.v : c, s = typeof c === 'object' && ESTILOS[c.e] ? ' s="' + ESTILOS[c.e] + '"' : '';
                var ref = columna(i) + (r + 1);
                if (v == null || v === '') return s ? '<c r="' + ref + '"' + s + '/>' : '';
                if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + s + '><v>' + v + '</v></c>';
                return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
            }).join('') + '</row>';
        }).join('');
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
            '<sheetViews><sheetView workbookViewId="0">' + (h.fijarFila ? '<pane ySplit="' + h.fijarFila + '" topLeftCell="A' + (h.fijarFila + 1) + '" activePane="bottomLeft" state="frozen"/>' : '') +
            '</sheetView></sheetViews>' + (cols ? '<cols>' + cols + '</cols>' : '') + '<sheetData>' + filas + '</sheetData></worksheet>';
    }

    var ESTILOS_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0.0000"/></numFmts>' +
        '<fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts>' +
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F1"/><bgColor indexed="64"/></patternFill></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="8">' +
            '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top"/></xf>' +
            '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
            '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
            '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
            '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
            '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
            '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
            '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
        '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

    // ---------- ZIP (sin compresión) ----------
    var TABLA_CRC = (function () {
        var t = [];
        for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
        return t;
    })();
    function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
    function zip(archivos) {
        var enc = new TextEncoder(), partes = [], central = [], pos = 0;
        function u16(v) { return [v & 255, (v >>> 8) & 255]; }
        function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
        archivos.forEach(function (a) {
            var nombre = enc.encode(a.nombre), datos = enc.encode(a.texto), crc = crc32(datos);
            var comun = [].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(datos.length), u32(datos.length), u16(nombre.length), u16(0));
            var local = new Uint8Array([].concat(u32(0x04034b50), comun));
            partes.push(local, nombre, datos);
            central.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), comun, u16(0), u16(0), u16(0), u32(0), u32(pos))), nombre);
            pos += local.length + nombre.length + datos.length;
        });
        var tamCentral = central.reduce(function (s, b) { return s + b.length; }, 0);
        var fin = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(archivos.length), u16(archivos.length), u32(tamCentral), u32(pos), u16(0)));
        return new Blob(partes.concat(central, [fin]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

    function crear(h) {
        var nombre = esc(String(h.nombre || 'Hoja1').replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31));
        return zip([
            { nombre: '[Content_Types].xml', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
                '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
                '<Default Extension="xml" ContentType="application/xml"/>' +
                '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
                '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
                '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
            { nombre: '_rels/.rels', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
            { nombre: 'xl/workbook.xml', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
                '<sheets><sheet name="' + nombre + '" sheetId="1" r:id="rId1"/></sheets></workbook>' },
            { nombre: 'xl/_rels/workbook.xml.rels', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
                '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
            { nombre: 'xl/styles.xml', texto: ESTILOS_XML },
            { nombre: 'xl/worksheets/sheet1.xml', texto: hojaXml(h) }
        ]);
    }

    // ---------- Leer: zip (guardado o deflate) → primera hoja ----------
    function inflar(datos) {
        var flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Response(flujo).arrayBuffer().then(function (b) { return new Uint8Array(b); });
    }
    function archivosZip(buf) {
        var b = new Uint8Array(buf), dv = new DataView(buf), fin = -1;
        for (var i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break; }
        if (fin < 0) throw new Error('El archivo no es un Excel (.xlsx).');
        var n = dv.getUint16(fin + 10, true), p = dv.getUint32(fin + 16, true), dec = new TextDecoder(), lista = {};
        for (var k = 0; k < n; k++) {
            var metodo = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true), largo = dv.getUint16(p + 28, true);
            var extra = dv.getUint16(p + 30, true), coment = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
            var nombre = dec.decode(b.subarray(p + 46, p + 46 + largo));
            var ini = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
            lista[nombre] = { metodo: metodo, datos: b.subarray(ini, ini + tam) };
            p += 46 + largo + extra + coment;
        }
        return lista;
    }
    function texto(lista, nombre) {
        var a = lista[nombre];
        if (!a) return Promise.resolve('');
        return (a.metodo === 8 ? inflar(a.datos) : Promise.resolve(a.datos)).then(function (d) { return new TextDecoder().decode(d); });
    }
    function indiceColumna(ref) {
        var m = /^([A-Z]+)/.exec(ref || ''), n = 0;
        if (!m) return -1;
        for (var i = 0; i < m[1].length; i++) n = n * 26 + m[1].charCodeAt(i) - 64;
        return n - 1;
    }
    function leer(archivo) {
        return archivo.arrayBuffer().then(function (buf) {
            var lista = archivosZip(buf);
            return Promise.all([texto(lista, 'xl/workbook.xml'), texto(lista, 'xl/_rels/workbook.xml.rels'), texto(lista, 'xl/sharedStrings.xml')]).then(function (t) {
                var dp = new DOMParser();
                // La primera hoja del libro (no siempre es sheet1.xml)
                var ruta = 'xl/worksheets/sheet1.xml';
                var hoja = dp.parseFromString(t[0], 'application/xml').getElementsByTagName('sheet')[0];
                var rid = hoja && (hoja.getAttribute('r:id') || hoja.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
                Array.prototype.forEach.call(dp.parseFromString(t[1] || '<x/>', 'application/xml').getElementsByTagName('Relationship'), function (r) {
                    if (r.getAttribute('Id') === rid) ruta = 'xl/' + r.getAttribute('Target').replace(/^\/?xl\//, '').replace(/^\//, '');
                });
                var compartidos = Array.prototype.map.call(dp.parseFromString(t[2] || '<x/>', 'application/xml').getElementsByTagName('si'), function (si) {
                    return Array.prototype.map.call(si.getElementsByTagName('t'), function (x) { return x.textContent; }).join('');
                });
                return texto(lista, ruta).then(function (xml) {
                    var filas = [];
                    Array.prototype.forEach.call(dp.parseFromString(xml, 'application/xml').getElementsByTagName('row'), function (r) {
                        var fila = [];
                        Array.prototype.forEach.call(r.getElementsByTagName('c'), function (c) {
                            var i = indiceColumna(c.getAttribute('r')), tipo = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
                            var val = tipo === 's' ? compartidos[+(v && v.textContent)] || ''
                                    : tipo === 'inlineStr' ? Array.prototype.map.call(c.getElementsByTagName('t'), function (x) { return x.textContent; }).join('')
                                    : v ? v.textContent : '';
                            fila[i < 0 ? fila.length : i] = val;
                        });
                        for (var k = 0; k < fila.length; k++) if (fila[k] == null) fila[k] = '';
                        filas[(+r.getAttribute('r') || filas.length + 1) - 1] = fila;
                    });
                    for (var k = 0; k < filas.length; k++) if (!filas[k]) filas[k] = [];
                    return filas;
                });
            });
        });
    }

    // Filas → texto con tabuladores y comillas (como lo que se copia de Excel), para las ventanas de importar
    function aTexto(filas) {
        return filas.map(function (f) {
            return f.map(function (v) { v = String(v == null ? '' : v); return /[\t\n\r"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join('\t');
        }).join('\n');
    }

    function descargar(blob, nombre) {
        var enlace = document.createElement('a');
        enlace.href = URL.createObjectURL(blob);
        enlace.download = String(nombre).replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.xlsx';
        enlace.click();
        setTimeout(function () { URL.revokeObjectURL(enlace.href); }, 1000);
    }

    return { crear: crear, leer: leer, aTexto: aTexto, descargar: descargar };
})();
