// ACRINEO · «Importar mis presupuestos de Neodata». Lee en el navegador los archivos de intercambio de Neodata PU Win+
// (C:\NEODATAWinPlus\Archivos Intercambio\OBRA_d-m-aaaa_HrHMnM.zip, con Xn_Presupuesto.xlsx adentro), muestra una obra por
// renglón con su respaldo más reciente y manda cada una a api/acrineo/presupuestos.php?recurso=neodata, que la crea como
// presupuesto del usuario (includes/acrineo/neodata.php). La carpeta elegida se recuerda en este navegador (IndexedDB).
(function (AN) {
    'use strict';

    var dlg = document.getElementById('anNeodata');
    if (!dlg || !window.XlsxSimple) return;
    var $ = function (id) { return document.getElementById(id); };
    var esc = AN.ui.esc;
    var obras = [];        // [{nombre, archivos: [{file, fecha}], estado, mensaje, existe, importado}]
    var marcadas = new Set();
    var carpeta = null;    // FileSystemDirectoryHandle
    var ocupado = false;

    // ---------- Memoria de la carpeta (IndexedDB; si el navegador no deja, solo no se recuerda) ----------
    function bd() {
        return new Promise(function (ok, mal) {
            var r = indexedDB.open('acrineo', 1);
            r.onupgradeneeded = function () { r.result.createObjectStore('preferencias'); };
            r.onsuccess = function () { ok(r.result); };
            r.onerror = function () { mal(r.error); };
        });
    }
    async function recordar(handle) {
        try { var b = await bd(); b.transaction('preferencias', 'readwrite').objectStore('preferencias').put(handle, 'neodata.carpeta'); } catch (e) { /* sin memoria */ }
    }
    async function recordada() {
        try {
            var b = await bd();
            return await new Promise(function (ok) {
                var r = b.transaction('preferencias').objectStore('preferencias').get('neodata.carpeta');
                r.onsuccess = function () { ok(r.result || null); };
                r.onerror = function () { ok(null); };
            });
        } catch (e) { return null; }
    }

    // ---------- Archivos → obras ----------
    var PATRON = /^(.*)_(\d{1,2})-(\d{1,2})-(\d{4})_Hr(\d{1,2})Mn(\d{1,2})\.(zip|neodata\.json)$/i;
    var ES_ARCHIVO = /\.(zip|neodata\.json)$/i;
    function datosArchivo(file) {
        var m = PATRON.exec(file.name);
        if (m) return { obra: m[1].trim(), fecha: new Date(+m[4], +m[3] - 1, +m[2], +m[5], +m[6]) };
        return { obra: file.name.replace(/\.(zip|neodata\.json|json)$/i, '').trim(), fecha: new Date(file.lastModified || 0) };
    }
    function agrupar(files) {
        var porObra = {};
        obras.forEach(function (o) { porObra[o.nombre.toUpperCase()] = o; });
        files.forEach(function (f) {
            if (!ES_ARCHIVO.test(f.name)) return;
            var d = datosArchivo(f), k = d.obra.toUpperCase();
            var o = porObra[k] || (porObra[k] = { nombre: d.obra, archivos: [], estado: 'nueva', mensaje: '', existe: null, importado: null });
            if (!o.archivos.some(function (a) { return a.file.name === f.name && a.file.size === f.size; })) o.archivos.push({ file: f, fecha: d.fecha });
        });
        obras = Object.keys(porObra).map(function (k) {
            var o = porObra[k];
            o.archivos.sort(function (a, b) { return b.fecha - a.fecha; });
            return o;
        }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
        revisarExistentes();
        pintar();
    }
    async function leerCarpeta(handle, profundidad, salida) {
        for await (var entrada of handle.values()) {
            if (salida.length > 5000) break;
            if (entrada.kind === 'file' && ES_ARCHIVO.test(entrada.name)) salida.push(await entrada.getFile());
            else if (entrada.kind === 'directory' && profundidad < 2) await leerCarpeta(entrada, profundidad + 1, salida);
        }
        return salida;
    }
    async function cargarCarpeta(handle, pedirPermiso) {
        try {
            var permiso = await handle.queryPermission({ mode: 'read' });
            if (permiso !== 'granted' && pedirPermiso) permiso = await handle.requestPermission({ mode: 'read' });
            if (permiso !== 'granted') { estado('Da clic en «Volver a leer» para que el navegador te pida permiso de leer la carpeta.', 'info'); $('anNeoReleer').hidden = false; return; }
            estado('Leyendo la carpeta…', 'info');
            obras = [];
            var files = await leerCarpeta(handle, 0, []);
            agrupar(files);
            $('anNeoRuta').textContent = 'Carpeta: ' + handle.name;
            $('anNeoReleer').hidden = false;
            estado(files.length ? obras.length + ' obra(s) con archivo de intercambio.' : 'La carpeta no tiene archivos .zip de intercambio. Elige «Archivos Intercambio» dentro de C:\\NEODATAWinPlus.', files.length ? 'ok' : 'error');
        } catch (e) {
            estado('No se pudo leer la carpeta: ' + e.message, 'error');
        }
    }

    async function revisarExistentes() {
        var nombres = obras.filter(function (o) { return o.existe === null; }).map(function (o) { return o.nombre; });
        if (!nombres.length) return;
        try {
            var r = await AN.api.post(AN.api.url(AN.api.PRESUPUESTOS, { recurso: 'neodata' }), { accion: 'existen', nombres: nombres });
            obras.forEach(function (o) { if (o.existe === null) o.existe = r.existen[o.nombre.toUpperCase()] || false; });
            pintar();
        } catch (e) { /* sin aviso: solo no se marca cuáles ya están */ }
    }

    // ---------- Pintar ----------
    function estado(t, tipo) { var s = $('anNeoEstado'); s.textContent = t || ''; s.className = 'an-estado' + (tipo ? ' ' + tipo : ''); }
    function fecha(d) {
        return d && d.getTime() ? d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
    }
    function visibles() {
        var q = $('anNeoFiltro').value.trim().toUpperCase();
        return obras.filter(function (o) { return !q || o.nombre.toUpperCase().indexOf(q) >= 0; });
    }
    function textoEstado(o) {
        if (o.estado === 'importando') return '<span class="an-neo-est trabajando">Importando…</span>';
        if (o.estado === 'error') return '<span class="an-neo-est error" title="' + esc(o.mensaje) + '">' + esc(o.mensaje) + '</span>';
        if (o.importado) return '<span class="an-neo-est ok">Importada · <a href="acrineo-hoja.php?id=' + o.importado.id + '">' + esc(o.importado.codigo) + '</a></span>'
            + '<small class="an-ayuda"> ' + o.importado.conceptos + ' conceptos · ' + AN.ui.dinero(o.importado.precio_venta) + '</small>';
        if (o.existe) {
            var c = comparar(o), e = o.existe;
            return '<span class="an-neo-est ya">Ya está · <a href="acrineo-hoja.php?id=' + e.id + '">' + esc(e.codigo) + '</a></span>'
                + (c ? ' <span class="an-neo-ver ' + c + '">' + (c === 'nueva' ? 'Esta es más reciente' : c === 'vieja' ? 'Esta es más vieja' : 'Misma versión') + '</span>' : '')
                + '<small class="an-ayuda an-neo-archivo">' + (e.version ? 'Versión del ' + esc(fecha(new Date(e.version))) : 'Sin fecha de versión')
                + ' · subió ' + esc(e.tuyo ? 'tú' : (e.propietario || '¿?')) + '</small>';
        }
        return '<span class="an-neo-est">Nueva</span>';
    }
    function pintar() {
        var v = visibles();
        $('anNeoFilas').innerHTML = v.length ? v.map(function (o) {
            var k = o.nombre.toUpperCase();
            return '<tr data-obra="' + esc(k) + '">'
                + '<td class="an-neo-sel"><input type="checkbox" data-marcar' + (marcadas.has(k) ? ' checked' : '') + (ocupado ? ' disabled' : '') + ' aria-label="Marcar ' + esc(o.nombre) + '"></td>'
                + '<td><b>' + esc(o.nombre) + '</b><small class="an-ayuda an-neo-archivo">' + esc(o.archivos[0].file.name) + '</small></td>'
                + '<td>' + esc(fecha(o.archivos[0].fecha)) + '</td>'
                + '<td class="num">' + o.archivos.length + '</td>'
                + '<td>' + textoEstado(o) + '</td>'
                + '<td><button type="button" class="an-btn an-mini" data-importar' + (ocupado ? ' disabled' : '') + '>' + (o.importado || o.existe ? 'Importar otra vez' : 'Importar') + '</button></td>'
                + '</tr>';
        }).join('') : '<tr class="an-vacio"><td colspan="6">' + (obras.length ? 'Ninguna obra coincide con el filtro.' : 'Elige la carpeta de Neodata o arrastra aquí los archivos .zip de intercambio.') + '</td></tr>';
        var n = obras.filter(function (o) { return marcadas.has(o.nombre.toUpperCase()); }).length;
        $('anNeoImportar').disabled = ocupado || !n;
        $('anNeoImportar').textContent = n ? 'Importar marcadas (' + n + ')' : 'Importar marcadas';
        $('anNeoTodas').checked = v.length > 0 && v.every(function (o) { return marcadas.has(o.nombre.toUpperCase()); });
    }

    // ---------- Leer el archivo de intercambio → datos para el servidor ----------
    function clave(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9%/]/gi, '').toLowerCase(); }
    function limpio(v) {
        return String(v == null ? '' : v).replace(/_x([0-9a-f]{4})_/gi, function (_, h) { var c = parseInt(h, 16); return c === 13 ? '' : String.fromCharCode(c); }).trim();
    }
    // Hoja con encabezado en el primer renglón → [{clave: valor}]
    function tabla(filas) {
        if (!filas || !filas.length) return [];
        var enc = (filas[0] || []).map(clave);
        var out = [];
        for (var i = 1; i < filas.length; i++) {
            var f = filas[i] || [];
            if (!f.some(function (c) { return String(c).trim() !== ''; })) continue;
            var o = {};
            enc.forEach(function (k, j) { if (k && !(k in o)) o[k] = limpio(f[j]); });
            out.push(o);
        }
        return out;
    }
    function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[,$\s]/g, '')); return isFinite(n) ? n : 0; }
    function fechaExcel(v) {
        var t = String(v || '').trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
        var n = num(t);
        if (n < 20000 || n > 80000) return '';
        return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5).toISOString().slice(0, 10);
    }
    function hojaPor(libro, nombre) {
        var k = clave(nombre);
        for (var h in libro) if (clave(h) === k) return libro[h];
        return null;
    }

    async function datosObra(file) {
        if (/\.json$/i.test(file.name)) return datosJson(file);
        var z = XlsxSimple.abrirZip(await file.arrayBuffer());
        var nombre = z.nombres.find(function (n) { return /(^|\/)xn_presupuesto\.xlsx$/i.test(n); });
        if (!nombre) throw new Error('No es un archivo de intercambio de Neodata (no trae Xn_Presupuesto.xlsx).');
        var libro = await XlsxSimple.hojas(await z.leer(nombre));

        // Campos generales: renglones «nombre de celda | descripción | valor»
        var g = {};
        (hojaPor(libro, 'N_Campos Generales') || []).forEach(function (f) { if (f && f[0]) g[clave(f[0])] = limpio(f[2]); });

        // Costos de respaldo cuando el catálogo no trae Costo0 (archivos de versiones anteriores)
        var extra = {};
        tabla(hojaPor(libro, 'DetalleMateriales')).forEach(function (r) {
            extra[(r.codigo || '').toUpperCase()] = num(r.costolabm0) + num(r.fletesm0) + num(r.maniobram0) + num(r.almacenajem0) + num(r.derechosm0) + num(r.mermasm0);
        });
        tabla(hojaPor(libro, 'DetalleManoObra')).forEach(function (r) {
            extra[(r.codigo || '').toUpperCase()] = num(r.salariorealm0) + num(r.viaticosm0) + num(r.alimentacionyhospedajem0) + num(r.gastosdesepeliom0) + num(r.otrasprestacionesm0);
        });
        var catalogo = tabla(hojaPor(libro, 'CatalogoGeneral')).map(function (r) {
            var cod = r.codigo || '';
            return { codigo: cod, descripcion_completa: r.descripcioncompleta || '', descripcion: r.descripcion || '', unidad: r.unidad || '',
                     tipo: num(r.tipo), pct: num(r['%']), tipo_pct: num(r['tipo%']), costo: 'costo0' in r && r.costo0 !== '' ? num(r.costo0) : (extra[cod.toUpperCase()] || 0) };
        }).filter(function (r) { return r.codigo; });

        var partidasH = tabla(hojaPor(libro, 'Partidas'));
        var partidas = partidasH.map(function (r) {
            return { padre_wbs: r.padrewbs || '', wbs: r.partidawbs || '', codigo: r.partida || '', renglon: num(r.renglon),
                     descripcion: r.descripcionpartida || '', descripcion_larga: r.descripcionpartidalarga || '' };
        }).filter(function (r) { return r.wbs || r.codigo; });
        var presH = tabla(hojaPor(libro, 'Presupuesto'));
        var conceptos = presH.map(function (r) {
            return { wbs: r.partidawbs || '', partida: r.partida || '', codigo: r.codigo || '', renglon: num(r.renglon), cantidad: num(r.cantidad), costo: num(r.costo0) };
        }).filter(function (r) { return r.codigo; });
        var matrices = tabla(hojaPor(libro, 'Matrices')).map(function (r) {
            return { m: r.codigom || '', i: r.codigoi || '', renglon: num(r.renglon), op: r['/'] || '*', cantidad: num(r.cantidad) };
        }).filter(function (r) { return r.m && r.i; });

        // % de sobrecosto = precio ÷ costo del presupuesto (lo que Neodata calculó)
        var costo = 0, precio = 0;
        presH.forEach(function (r) { costo += num(r.cantidad) * num(r.costo0); precio += num(r.cantidad) * num(r.precio0); });
        if (!(costo > 0 && precio > 0)) {
            costo = precio = 0;
            partidasH.forEach(function (r) { if (!r.padrewbs) { costo += num(r.costo0); precio += num(r.precio0); } });
        }
        var sobrecosto = costo > 0 && precio > 0 ? Math.round((precio / costo - 1) * 1e6) / 1e4 : null;

        return {
            archivo: file.name,
            nombre: g.codigodelaobra || datosArchivo(file).obra,
            descripcion: g.nombredelaobra || '',
            generales: {
                direccion: g.direcciondelaobra || '', colonia: g.coloniadelaobra || '', codigo_postal: g.codigopostaldelaobra || '',
                estado: g.estadodelaobra || '', observaciones: g.observacionesobra || '',
                numero_licitacion: g.numerodeconcurso || '', lugar_celebracion: g.direcciondeconcurso || '', numero_convocatoria: g.numconvocatoria || '',
                fecha_licitacion: fechaExcel(g.fechadeconcurso), fecha_publicacion: fechaExcel(g.fechaconvocatoria),
                fecha_inicio: fechaExcel(g.fechainicio), dias: num(g.plazocalculado)
            },
            iva: g.porcentajeivapresupuesto !== undefined && g.porcentajeivapresupuesto !== '' ? num(g.porcentajeivapresupuesto) : 16,
            decimales: { costos: g.decimalesredondeo !== undefined ? num(g.decimalesredondeo) : 2, cantidades: g.decimalesredondeoconceptos !== undefined ? num(g.decimalesredondeoconceptos) : 4,
                         explosion: g.decimalesredondeoexplosion !== undefined ? num(g.decimalesredondeoexplosion) : 8 },
            sobrecosto_pct: sobrecosto,
            catalogo: catalogo, partidas: partidas, conceptos: conceptos, matrices: matrices
        };
    }

    // Archivo del exportador de ACRINEO (*.neodata.json): lo leído directo de la base de Neodata de la computadora
    async function datosJson(file) {
        var j;
        try { j = JSON.parse((await file.text()).replace(/^﻿/, '')); } catch (e) { throw new Error('El archivo ' + file.name + ' está dañado.'); }
        if (!j || j.formato !== 'acrineo-neodata') throw new Error('No es un archivo del exportador de Neodata de ACRINEO.');
        var o = j.obra || {}, par = {};
        (o.parametros || []).forEach(function (p) { if (p && p.parametro) par[clave(p.parametro)] = limpio(p.valor); });
        var t = function (v) { return limpio(v); };
        var conceptos = (j.conceptos || []).map(function (c) {
            return { wbs: t(c.wbs), partida: '', codigo: t(c.codigo), renglon: num(c.renglon), cantidad: num(c.cantidad), costo: num(c.costo), precio: num(c.precio) };
        }).filter(function (c) { return c.codigo; });
        var costo = 0, precio = 0;
        conceptos.forEach(function (c) { costo += c.cantidad * c.costo; precio += c.cantidad * c.precio; });
        var dec = function (k, d) { return par[k] !== undefined && par[k] !== '' ? num(par[k]) : d; };
        return {
            archivo: file.name + (j.base ? ' (base ' + j.base + ')' : ''),
            nombre: t(o.nombre) || datosArchivo(file).obra,
            descripcion: t(o.descripcion),
            generales: {
                direccion: t(o.direccion), colonia: t(o.colonia), codigo_postal: t(o.codigo_postal), estado: '', observaciones: t(o.observaciones),
                numero_licitacion: par.opnumerolicitacion || '', lugar_celebracion: par.oplugarcelebracion || '', numero_convocatoria: par.opnumeroconvocatoria || '',
                fecha_licitacion: fechaExcel(par.opfechalicitacion), fecha_publicacion: fechaExcel(par.opfechapublicacion),
                fecha_inicio: fechaExcel(par.opfechainicio), dias: num(par.opplazo)
            },
            iva: o.iva !== undefined && o.iva !== null ? num(o.iva) : 16,
            decimales: { costos: dec('decimalesredondeo', 2), cantidades: dec('decimalesredondeoconceptos', 4), explosion: dec('decimalesredondeoexpins', 8) },
            sobrecosto_pct: costo > 0 && precio > 0 ? Math.round((precio / costo - 1) * 1e6) / 1e4 : null,
            catalogo: (j.catalogo || []).map(function (c) {
                return { codigo: t(c.codigo), descripcion_completa: t(c.descripcion_completa), descripcion: t(c.descripcion), unidad: t(c.unidad),
                         tipo: num(c.tipo), pct: num(c.pct) || (num(c.tipo) === 3 && t(c.unidad) === '%') ? 1 : 0, tipo_pct: 0, costo: num(c.costo) };
            }).filter(function (c) { return c.codigo; }),
            partidas: (j.partidas || []).map(function (p) {
                return { padre_wbs: t(p.padre_wbs), wbs: t(p.wbs), codigo: t(p.codigo), renglon: num(p.renglon), descripcion: t(p.descripcion), descripcion_larga: t(p.descripcion_larga) };
            }),
            conceptos: conceptos,
            matrices: (j.matrices || []).map(function (m) { return { m: t(m.m), i: t(m.i), renglon: num(m.renglon), op: m.op === '/' ? '/' : '*', cantidad: num(m.cantidad) }; })
                .filter(function (m) { return m.m && m.i; })
        };
    }

    // Compara la versión del archivo con la que ya está en ACRINEO: 'nueva' | 'vieja' | 'igual' | ''
    function comparar(o) {
        if (!o.existe || !o.existe.version) return '';
        var a = o.archivos[0].fecha.getTime(), b = new Date(o.existe.version).getTime();
        if (!a || !b) return '';
        return Math.abs(a - b) < 60000 ? 'igual' : (a > b ? 'nueva' : 'vieja');
    }
    var TXT_COMPARA = { nueva: 'MÁS RECIENTE que la que está en ACRINEO', vieja: 'MÁS VIEJA que la que está en ACRINEO', igual: 'LA MISMA versión que ya está en ACRINEO' };

    async function importar(lista) {
        if (ocupado || !lista.length) return;
        // Si la obra ya está (la haya subido quien sea), se pregunta por cada una con las fechas de las dos versiones
        var subir = [];
        for (var k = 0; k < lista.length; k++) {
            var o = lista[k], e = o.existe;
            if (!e) { subir.push(o); continue; }
            var c = comparar(o);
            var ok = await AN.ui.confirmar({
                titulo: 'Ya existe ' + o.nombre + ' en ACRINEO',
                mensaje: 'En ACRINEO ya está ' + o.nombre + ' (' + e.codigo + '), subida por ' + (e.tuyo ? 'ti' : (e.propietario || 'otro usuario'))
                    + (e.subido ? ' el ' + fecha(new Date(e.subido)) : '') + (e.copias > 1 ? ' (hay ' + e.copias + ' copias)' : '') + ',\n'
                    + (e.version ? 'con la versión de Neodata del ' + fecha(new Date(e.version)) : 'sin fecha de versión de Neodata') + '\n\n'
                    + 'La versión que vas a subir es del ' + fecha(o.archivos[0].fecha) + (c ? ' → ' + TXT_COMPARA[c] : '') + '\n\n'
                    + '¿Deseas subir esta versión? Se crea un presupuesto nuevo; el que ya está no se toca.',
                aceptar: 'Subir esta versión',
                peligro: c === 'vieja' || c === 'igual'
            });
            if (ok) subir.push(o);
        }
        if (!subir.length) return;
        ocupado = true;
        var bien = 0, mal = 0;
        for (var i = 0; i < subir.length; i++) {
            o = subir[i];
            o.estado = 'importando';
            estado('Importando ' + o.nombre + ' (' + (i + 1) + ' de ' + subir.length + ')…', 'info');
            pintar();
            try {
                var datos = await datosObra(o.archivos[0].file);
                datos.obra = o.nombre;
                datos.version_fecha = o.archivos[0].fecha.getTime() ? o.archivos[0].fecha.toISOString() : null;
                var r = await AN.api.post(AN.api.url(AN.api.PRESUPUESTOS, { recurso: 'neodata' }), datos);
                o.importado = r.importado;
                o.existe = { id: r.importado.id, codigo: r.importado.codigo, propietario: '', tuyo: true, version: datos.version_fecha, subido: new Date().toISOString(),
                             copias: (o.existe ? o.existe.copias : 0) + 1 };
                o.estado = 'ok';
                marcadas.delete(o.nombre.toUpperCase());
                bien++;
            } catch (e2) {
                o.estado = 'error';
                o.mensaje = e2.message || 'No se pudo importar.';
                mal++;
            }
        }
        ocupado = false;
        pintar();
        estado(bien + ' obra(s) importada(s)' + (mal ? ', ' + mal + ' con error (pasa el puntero sobre el error para leerlo).' : '.'), mal ? 'error' : 'ok');
        if (bien && AN.catalogo && AN.catalogo.recargar) AN.catalogo.recargar();
    }

    // ---------- Eventos ----------
    $('anNeoCarpeta').addEventListener('click', async function () {
        if (!window.showDirectoryPicker) { $('anNeoDirInput').click(); return; }
        try {
            var h = await window.showDirectoryPicker({ id: 'acrineo-neodata', mode: 'read' });
            carpeta = h;
            recordar(h);
            cargarCarpeta(h, true);
        } catch (e) {
            if (e.name !== 'AbortError') estado('No se pudo abrir la carpeta: ' + e.message + '. Usa «Subir archivos .zip».', 'error');
        }
    });
    $('anNeoReleer').addEventListener('click', function () { if (carpeta) cargarCarpeta(carpeta, true); });
    $('anNeoDirInput').addEventListener('change', function () {
        var files = Array.prototype.slice.call(this.files);
        if (files.length) { $('anNeoRuta').textContent = 'Carpeta: ' + (files[0].webkitRelativePath || '').split('/')[0]; agrupar(files); estado(obras.length + ' obra(s) con archivo de intercambio.', 'ok'); }
        this.value = '';
    });
    $('anNeoArchivos').addEventListener('change', function () { agrupar(Array.prototype.slice.call(this.files)); this.value = ''; });
    var zona = $('anNeoZona');
    zona.addEventListener('dragover', function (e) { e.preventDefault(); zona.classList.add('an-neo-soltar'); });
    zona.addEventListener('dragleave', function () { zona.classList.remove('an-neo-soltar'); });
    zona.addEventListener('drop', function (e) {
        e.preventDefault();
        zona.classList.remove('an-neo-soltar');
        agrupar(Array.prototype.slice.call(e.dataTransfer.files || []));
    });
    $('anNeoFiltro').addEventListener('input', pintar);
    $('anNeoTodas').addEventListener('change', function () {
        var si = this.checked;
        visibles().forEach(function (o) { if (si) marcadas.add(o.nombre.toUpperCase()); else marcadas.delete(o.nombre.toUpperCase()); });
        pintar();
    });
    $('anNeoFilas').addEventListener('change', function (e) {
        var tr = e.target.closest('tr[data-obra]');
        if (!tr || !e.target.matches('[data-marcar]')) return;
        if (e.target.checked) marcadas.add(tr.dataset.obra); else marcadas.delete(tr.dataset.obra);
        pintar();
    });
    $('anNeoFilas').addEventListener('click', function (e) {
        var b = e.target.closest('[data-importar]');
        if (!b) return;
        var k = b.closest('tr').dataset.obra;
        importar(obras.filter(function (o) { return o.nombre.toUpperCase() === k; }));
    });
    $('anNeoImportar').addEventListener('click', function () { importar(obras.filter(function (o) { return marcadas.has(o.nombre.toUpperCase()); })); });
    dlg.querySelectorAll('[data-neo-cerrar]').forEach(function (b) { b.addEventListener('click', function () { if (!ocupado) dlg.close(); }); });
    dlg.addEventListener('cancel', function (e) { if (ocupado) e.preventDefault(); });

    async function abrir() {
        dlg.showModal();
        if (obras.length || carpeta) return;
        carpeta = await recordada();
        if (carpeta) {
            $('anNeoRuta').textContent = 'Carpeta: ' + carpeta.name;
            $('anNeoReleer').hidden = false;
            cargarCarpeta(carpeta, false);
        }
    }
    AN.importarNeodata = { abrir: abrir, datosObra: datosObra };
})(window.AcriNeo = window.AcriNeo || {});
