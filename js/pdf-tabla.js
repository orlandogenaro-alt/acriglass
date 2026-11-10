// Lee la tabla de un PDF (catálogo de conceptos de otro sistema o el que imprime Acriglass) y la devuelve
// como texto separado por tabuladores, igual que si se hubieran copiado las celdas de Excel.
// Usa pdf.js (se carga solo la primera vez que se necesita). Los PDF escaneados (imagen) no traen texto.
(function () {
    var BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
    var cargando = null;

    function cargarPdfJs() {
        if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
        if (cargando) return cargando;
        cargando = new Promise(function (listo, falla) {
            var s = document.createElement('script');
            s.src = BASE + 'pdf.min.js';
            s.onload = function () {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.min.js';
                listo(window.pdfjsLib);
            };
            s.onerror = function () { cargando = null; falla(new Error('No se pudo cargar el lector de PDF (revisa la conexión a internet).')); };
            document.head.appendChild(s);
        });
        return cargando;
    }

    // Encabezado de la tabla: trae Concepto (o Descripción) y alguna columna de cantidades
    var ES_ENCABEZADO = function (t) {
        return /(concepto|descripci[oó]n)/i.test(t) && /(cantidad|unidad|p\.?\s*unit|precio|importe)/i.test(t);
    };
    var ES_NUMERO = /^[$\s]*-?[\d,]+(\.\d+)?\s*%?$/;

    // Renglones de la hoja: los textos con la misma altura (y) van juntos, ordenados de izquierda a derecha
    function renglones(items) {
        var lista = items.filter(function (it) { return String(it.str).trim() !== ''; }).map(function (it) {
            var alto = Math.abs(it.transform[3]) || it.height || 8;
            return { t: String(it.str), x: it.transform[4], y: it.transform[5], fin: it.transform[4] + (it.width || 0), alto: alto };
        });
        lista.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
        var filas = [];
        lista.forEach(function (it) {
            var f = filas[filas.length - 1];
            if (f && Math.abs(f.y - it.y) <= Math.max(2, Math.min(f.alto, it.alto) * 0.45)) f.items.push(it);
            else filas.push({ y: it.y, alto: it.alto, items: [it] });
        });
        filas.forEach(function (f) { f.items.sort(function (a, b) { return a.x - b.x; }); });
        return filas;
    }

    // Junta los textos cercanos de un renglón en celdas (p. ej. «P.» y «Unitario»)
    function juntar(items, hueco) {
        var celdas = [];
        items.forEach(function (it) {
            var c = celdas[celdas.length - 1];
            if (c && it.x - c.fin < hueco(it)) { c.t += (it.x - c.fin > it.alto * 0.15 && !/\s$/.test(c.t) ? ' ' : '') + it.t; c.fin = Math.max(c.fin, it.fin); }
            else celdas.push({ t: it.t, x: it.x, fin: it.fin, alto: it.alto });
        });
        celdas.forEach(function (c) { c.t = c.t.replace(/\s+/g, ' ').trim(); });
        return celdas;
    }

    // Límites entre columnas: en el hueco entre dos títulos, la franja más ancha donde no cae ningún texto de la hoja
    function limites(titulos, datos) {
        var lim = [];
        for (var i = 0; i < titulos.length - 1; i++) {
            var a = titulos[i].fin, b = titulos[i + 1].x;
            if (b <= a) { lim.push((a + b) / 2); continue; }
            var tramos = datos.filter(function (d) { return d.fin > a && d.x < b; })
                              .map(function (d) { return [Math.max(a, d.x), Math.min(b, d.fin)]; })
                              .sort(function (p, q) { return p[0] - q[0]; });
            var mejor = null, desde = a;
            tramos.concat([[b, b]]).forEach(function (t) {
                if (t[0] > desde && (!mejor || t[0] - desde > mejor[1] - mejor[0])) mejor = [desde, t[0]];
                desde = Math.max(desde, t[1]);
            });
            lim.push(mejor ? (mejor[0] + mejor[1]) / 2 : (a + b) / 2);
        }
        return lim;
    }

    function celdaTexto(t) {
        t = String(t || '').replace(/\t/g, ' ');
        return t.indexOf('"') >= 0 ? '"' + t.replace(/"/g, '""') + '"' : t;
    }

    function leer(archivo) {
        return Promise.all([cargarPdfJs(), archivo.arrayBuffer()]).then(function (r) {
            return r[0].getDocument({ data: new Uint8Array(r[1]) }).promise;
        }).then(function (pdf) {
            var paginas = [];
            for (var n = 1; n <= pdf.numPages; n++) {
                paginas.push(pdf.getPage(n).then(function (p) { return p.getTextContent(); }));
            }
            return Promise.all(paginas);
        }).then(function (contenidos) {
            var hayTexto = false, titulos = null, lim = null, salida = [];
            contenidos.forEach(function (contenido) {
                var filas = renglones(contenido.items);
                if (filas.length) hayTexto = true;
                var iEnc = -1;
                for (var i = 0; i < filas.length; i++) {
                    if (ES_ENCABEZADO(filas[i].items.map(function (it) { return it.t; }).join(' '))) { iEnc = i; break; }
                }
                if (iEnc >= 0) {
                    titulos = juntar(filas[iEnc].items, function (it) { return it.alto * 0.9; });
                    if (!salida.length) salida.push(titulos.map(function (c) { return c.t; }));
                    filas = filas.slice(iEnc + 1);
                    // Los límites salen de la hoja con encabezado; las hojas siguientes sin encabezado usan los mismos
                    var datos = [];
                    filas.forEach(function (f) { datos = datos.concat(f.items); });
                    lim = limites(titulos, datos);
                }
                if (!titulos) return; // hojas antes del encabezado (portada)
                filas.forEach(function (f) {
                    var celdas = titulos.map(function () { return []; });
                    // Cada texto va a la columna donde cae su centro
                    juntar(f.items, function (it) { return it.alto * 0.6; }).forEach(function (c) {
                        var centro = (c.x + c.fin) / 2, k = 0;
                        while (k < lim.length && centro > lim[k]) k++;
                        celdas[k].push(c.t);
                    });
                    salida.push(celdas.map(function (c) { return c.join(' '); }));
                });
            });
            if (!hayTexto) throw new Error('El PDF no trae texto (parece escaneado): no se puede leer.');
            if (!titulos) throw new Error('No encontré el encabezado de la tabla (Código, Concepto, Unidad, Cantidad, P. Unitario…) en el PDF.');
            subirImportes(salida);
            return salida.map(function (f) { return f.map(celdaTexto).join('\t'); }).join('\n');
        });
    }

    // Si el PDF centra los importes en la altura del concepto, quedan en un renglón sin código:
    // se suben al renglón del código que no los tiene, y el texto de ese renglón sigue como continuación
    function subirImportes(filas) {
        var enc = filas[0] || [];
        var iCod = enc.findIndex(function (t) { return /^(c[oó]digo|clave|cve)/i.test(t); });
        if (iCod < 0) return;
        var numericas = enc.map(function (t, i) { return /^(unidad|u\.?m|cant|p\.?\s*unit|precio|importe|total|%)/i.test(t) ? i : -1; })
                           .filter(function (i) { return i >= 0; });
        var ultimo = -1;
        for (var r = 1; r < filas.length; r++) {
            var f = filas[r];
            var conImporte = numericas.some(function (i) { return f[i] && ES_NUMERO.test(f[i]); });
            if (f[iCod]) { ultimo = numericas.some(function (i) { return f[i]; }) ? -1 : r; continue; }
            if (!conImporte || ultimo < 0) continue;
            numericas.forEach(function (i) { filas[ultimo][i] = f[i]; f[i] = ''; });
            ultimo = -1;
        }
    }

    window.PdfTabla = { leer: leer };
})();
