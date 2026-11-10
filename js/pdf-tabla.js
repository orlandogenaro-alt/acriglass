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
            // Un texto que cruza todo el hueco (p. ej. «TOTAL DEL PRESUPUESTO…» a lo ancho) no cuenta
            var tramos = datos.filter(function (d) { return d.fin > a && d.x < b && !(d.x <= a && d.fin >= b); })
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
            var hayTexto = false, titulos = null, lim = null, enc = null, paginas = [];
            contenidos.forEach(function (contenido) {
                var filas = renglones(contenido.items);
                if (filas.length) hayTexto = true;
                var iEnc = -1;
                for (var i = 0; i < filas.length; i++) {
                    if (ES_ENCABEZADO(filas[i].items.map(function (it) { return it.t; }).join(' '))) { iEnc = i; break; }
                }
                if (iEnc >= 0) {
                    var nuevos = juntar(filas[iEnc].items, function (it) { return it.alto * 0.9; });
                    filas = filas.slice(iEnc + 1);
                    // Los límites salen de la primera hoja con encabezado; si las demás repiten el mismo encabezado
                    // (en el mismo lugar) se usan los mismos, para que los totales de la última hoja no los muevan
                    var igual = titulos && titulos.length === nuevos.length && nuevos.every(function (c, i) { return Math.abs(c.x - titulos[i].x) < 3; });
                    if (!igual) {
                        titulos = nuevos;
                        if (!enc) enc = titulos.map(function (c) { return c.t; });
                        var datos = [];
                        filas.forEach(function (f) { datos = datos.concat(f.items); });
                        lim = limites(titulos, datos);
                    }
                }
                if (!titulos) return; // hojas antes del encabezado (portada)
                paginas.push(filas.map(function (f) {
                    var celdas = titulos.map(function () { return []; });
                    // Cada texto va a la columna donde cae su centro
                    juntar(f.items, function (it) { return it.alto * 0.6; }).forEach(function (c) {
                        var centro = (c.x + c.fin) / 2, k = 0;
                        while (k < lim.length && centro > lim[k]) k++;
                        celdas[k].push(c.t);
                    });
                    return { y: f.y, c: celdas.map(function (c) { return c.join(' '); }) };
                }));
            });
            if (!hayTexto) throw new Error('El PDF no trae texto (parece escaneado): no se puede leer.');
            if (!titulos) throw new Error('No encontré el encabezado de la tabla (Código, Concepto, Unidad, Cantidad, P. Unitario…) en el PDF.');
            var salida = ordenarBloques(paginas, enc);
            subirImportes(salida);
            return salida.map(function (f) { return f.map(celdaTexto).join('\t'); }).join('\n');
        });
    }

    // Cada concepto es un bloque de renglones juntos (entre conceptos queda un espacio más grande que entre líneas).
    // Muchos PDF ponen el código y los importes a media altura del concepto: se pasan a la primera línea del bloque,
    // para que las líneas de arriba no se peguen al concepto anterior. Además:
    // - la primera oración (hasta el punto) queda como el concepto y lo demás como continuación (especificación);
    // - el pie de página que se repite en cada hoja (p. ej. «DIRECTOR GENERAL: …») se quita;
    // - una línea suelta de 1 a 4 letras o números en mayúsculas (p. ej. «A») es la partida de los conceptos que siguen.
    function ordenarBloques(paginas, enc) {
        var col = function (re) { return enc.findIndex(function (t) { return re.test(t); }); };
        var iCod = col(/^(c[oó]digo|clave|cve)/i), iCon = col(/^(concepto|descripci)/i);
        var nums = enc.map(function (t, i) { return /^(cant|p\.?\s*unit|precio|importe|total)/i.test(t) ? i : -1; })
                      .filter(function (i) { return i >= 0; });
        var llave = function (f) { return f.c.join('|') + '@' + Math.round(f.y / 4); };
        var soloConcepto = function (f) { return f.c.every(function (t, i) { return i === iCon || !t; }); };
        var conImporte = function (f) { return nums.some(function (i) { return ES_NUMERO.test(f.c[i] || ''); }); };
        var esAncla = function (f) { return iCod >= 0 ? !!f.c[iCod] : conImporte(f); };
        var veces = {};
        paginas.forEach(function (p) {
            var vistos = {};
            p.forEach(function (f) { var k = llave(f); if (!vistos[k]) { vistos[k] = 1; veces[k] = (veces[k] || 0) + 1; } });
        });
        var salida = [enc.concat(['Partida'])], partida = '', hayPartida = false, enTotales = false;
        var esPartida = function (f) { return iCon >= 0 && soloConcepto(f) && /^[A-Z0-9]{1,4}[.)]?$/.test(f.c[iCon]); };
        paginas.forEach(function (p) {
            // Totales (Total, Subtotal, IVA…): se quitan junto con lo que les sigue hasta el siguiente código
            p = p.filter(function (f) {
                var texto = f.c.join(' ').trim();
                if (/^((sub)?total\b|iva\b)/i.test(texto) && conImporte(f)) { enTotales = true; return false; }
                if (enTotales && esAncla(f)) enTotales = false;
                return !enTotales;
            });
            var huecos = [];
            for (var i = 1; i < p.length; i++) huecos.push(p[i - 1].y - p[i].y);
            huecos.sort(function (a, b) { return a - b; });
            var linea = huecos.length ? huecos[Math.floor(huecos.length / 2)] : 12;
            var bloques = [], b = null;
            p.forEach(function (f, i) {
                if (!b || p[i - 1].y - f.y > linea * 1.7) { b = []; bloques.push(b); }
                b.push(f);
            });
            bloques.forEach(function (b) {
                // Partida en la primera línea del bloque (pegada o no al concepto)
                if (b.length && esPartida(b[0])) {
                    partida = b[0].c[iCon].replace(/[.)]$/, '');
                    hayPartida = true;
                    b = b.slice(1);
                }
                var anclas = b.filter(esAncla);
                if (!anclas.length) {
                    if (paginas.length > 1) b = b.filter(function (f) { return veces[llave(f)] < 2; });
                } else if (anclas.length === 1 && iCon >= 0) {
                    var primera = b[0];
                    // Código, unidad e importes del bloque a la primera línea
                    b.slice(1).forEach(function (f) {
                        f.c.forEach(function (t, i) { if (i !== iCon && t && !primera.c[i]) { primera.c[i] = t; f.c[i] = ''; } });
                    });
                    // La primera oración completa es el concepto (si termina en punto dentro de las primeras 6 líneas)
                    var n = 0;
                    while (n < b.length && n < 6 && !/[.:]\s*$/.test(b[n].c[iCon])) n++;
                    if (n > 0 && n < b.length && n < 6) {
                        for (var k = 1; k <= n; k++) {
                            primera.c[iCon] = primera.c[iCon].replace(/\s+$/, '') + ' ' + b[k].c[iCon];
                            b[k].c[iCon] = '';
                        }
                    }
                }
                b.forEach(function (f) {
                    if (f.c.every(function (t) { return !t; })) return;
                    salida.push(f.c.concat([iCod >= 0 && f.c[iCod] ? partida : '']));
                });
            });
        });
        if (!hayPartida) salida.forEach(function (f) { f.pop(); });
        return salida;
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
