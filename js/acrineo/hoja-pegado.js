// ACRINEO · «Pegado especial» (botón de portapapeles de las partidas), como en Neodata: partidas y conceptos copiados de
// Excel (o un .xlsx). Se lee el texto (celdas separadas por tabulador, con comillas para las celdas de varias líneas),
// se reconoce el encabezado, se muestra una vista previa y PEGAR lo manda al servidor (includes/acrineo/pegado.php).
(function (AN) {
    'use strict';

    var H = AN.hoja;
    if (!H || !document.getElementById('anPegado')) return;
    var $ = function (id) { return document.getElementById(id); };
    var esc = AN.ui.esc;
    var dlg = $('anPegado');
    var datos = null;   // { partidas: [], conceptos: [], avisos: [] }

    var COLUMNAS = [
        ['partida', /^(partida|agrupador)/i],
        ['codigo', /^(c[oó]digo|clave|cve)(?!.*aux)/i],
        ['descripcion', /^descripci[oó]n\s*completa/i],
        ['descripcion_corta', /^descripci/i],
        ['unidad', /^(unidad|u\.?\s*m\.?$)/i],
        ['cantidad', /^cant/i],
        ['costo', /^(costo|p\.?\s*unit|precio\s*unit|precio$)/i]
    ];

    // Celdas separadas por tabulador; "…" puede traer tabuladores, saltos de línea y "" (como copia Excel)
    function celdas(texto) {
        var filas = [], fila = [], c = '', comillas = false;
        texto = String(texto || '').replace(/\r\n?/g, '\n');
        for (var i = 0; i < texto.length; i++) {
            var ch = texto[i];
            if (comillas) {
                if (ch === '"' && texto[i + 1] === '"') { c += '"'; i++; }
                else if (ch === '"') comillas = false;
                else c += ch;
            } else if (ch === '"' && c === '') comillas = true;
            else if (ch === '\t') { fila.push(c); c = ''; }
            else if (ch === '\n') { fila.push(c); filas.push(fila); fila = []; c = ''; }
            else c += ch;
        }
        if (c !== '' || fila.length) { fila.push(c); filas.push(fila); }
        return filas.map(function (f) { return f.map(function (x) { return x.trim(); }); });
    }
    function numero(t) {
        var s = String(t || '').replace(/[$\s]/g, '').replace(/,/g, '');
        return s === '' ? '' : (/^-?\d+(\.\d+)?$/.test(s) ? s : t);
    }

    function analizar() {
        var filas = celdas($('anPegadoTexto').value).filter(function (f) { return f.some(function (x) { return x !== ''; }); });
        datos = null;
        $('anPegadoVista').hidden = true;
        $('anPegadoAceptar').disabled = true;
        estado('');
        if (!filas.length) { $('anPegadoResumen').textContent = ''; return; }
        // Encabezado: el primer renglón (de los 10 primeros) que trae al menos dos columnas conocidas
        var iEnc = -1, mapa = null;
        for (var i = 0; i < Math.min(10, filas.length) && iEnc < 0; i++) {
            var m = {};
            filas[i].forEach(function (t, j) {
                for (var k = 0; k < COLUMNAS.length; k++) {
                    if (COLUMNAS[k][1].test(t) && m[COLUMNAS[k][0]] == null) { m[COLUMNAS[k][0]] = j; break; }
                }
            });
            if (Object.keys(m).length >= 2 && (m.codigo != null || m.partida != null)) { iEnc = i; mapa = m; }
        }
        if (iEnc < 0) { estado('No encontré el encabezado (Partida, Código, Descripción completa, Unidad, Cantidad…). Copia también el renglón de los títulos.', 'error'); return; }
        if (mapa.descripcion == null && mapa.descripcion_corta != null) mapa.descripcion = mapa.descripcion_corta;
        var val = function (f, k) { return mapa[k] == null ? '' : (f[mapa[k]] || ''); };
        var d = { partidas: [], conceptos: [], avisos: [] }, actual = '', vistas = {};
        filas.slice(iEnc + 1).forEach(function (f, n) {
            var part = val(f, 'partida'), cod = val(f, 'codigo');
            if (!cod && part) {
                actual = part;
                if (!vistas[part.toUpperCase()]) { vistas[part.toUpperCase()] = 1; d.partidas.push({ codigo: part, descripcion: val(f, 'descripcion') }); }
                return;
            }
            if (!cod) return;
            var c = { partida: part || actual, codigo: cod, descripcion: val(f, 'descripcion'), unidad: val(f, 'unidad'), cantidad: numero(val(f, 'cantidad')), costo: numero(val(f, 'costo')) };
            if (c.cantidad === '') d.avisos.push('Renglón ' + (iEnc + n + 2) + ' (' + cod + '): sin cantidad.');
            d.conceptos.push(c);
        });
        if (mapa.partida == null && !H.partida()) d.avisos.push('No hay columna Partida: selecciona la partida donde van los conceptos.');
        datos = d;
        $('anPegadoResumen').textContent = d.partidas.length + ' partida' + (d.partidas.length === 1 ? '' : 's') + ' · ' + d.conceptos.length + ' concepto' + (d.conceptos.length === 1 ? '' : 's')
            + (mapa.partida == null && H.partida() ? ' → partida ' + H.partida().codigo : '');
        pintarVista();
        $('anPegadoAceptar').disabled = !(d.partidas.length + d.conceptos.length) || (mapa.partida == null && !H.partida());
        if (d.avisos.length) estado(d.avisos.slice(0, 3).join(' ') + (d.avisos.length > 3 ? ' (y ' + (d.avisos.length - 3) + ' más)' : ''), 'error');
    }

    function pintarVista() {
        var d = datos, filas = [];
        var porPartida = {};
        d.conceptos.forEach(function (c) { (porPartida[c.partida.toUpperCase()] = porPartida[c.partida.toUpperCase()] || []).push(c); });
        d.partidas.forEach(function (p) {
            filas.push('<tr class="an-pegado-partida"><td>' + esc(p.codigo) + '</td><td colspan="5">' + esc(p.descripcion || p.codigo) + '</td></tr>');
            (porPartida[p.codigo.toUpperCase()] || []).forEach(function (c) { filas.push(fila(c)); });
            delete porPartida[p.codigo.toUpperCase()];
        });
        Object.keys(porPartida).forEach(function (k) { porPartida[k].forEach(function (c) { filas.push(fila(c)); }); });
        var total = filas.length;
        $('anPegadoVista').innerHTML = '<table class="an-tabla"><thead><tr><th><div class="an-th"><span>Partida</span></div></th><th><div class="an-th"><span>Código</span></div></th>'
            + '<th><div class="an-th"><span>Descripción completa</span></div></th><th><div class="an-th"><span>Unidad</span></div></th>'
            + '<th class="num"><div class="an-th"><span>Cantidad</span></div></th><th class="num"><div class="an-th"><span>Costo</span></div></th></tr></thead><tbody>'
            + filas.slice(0, 200).join('') + '</tbody></table>' + (total > 200 ? '<p class="an-ayuda">… y ' + (total - 200) + ' renglones más.</p>' : '');
        $('anPegadoVista').hidden = false;
        function fila(c) {
            return '<tr class="an-fila"><td>' + esc(c.partida || (H.partida() ? H.partida().codigo : '')) + '</td><td>' + esc(c.codigo) + '</td><td class="an-desc">' + esc(c.descripcion) + '</td>'
                + '<td>' + esc(c.unidad) + '</td><td class="num' + (c.cantidad === '' ? ' an-falta' : '') + '">' + esc(c.cantidad) + '</td><td class="num">' + esc(c.costo) + '</td></tr>';
        }
    }

    function estado(t, tipo) { var e = $('anPegadoEstado'); e.textContent = t || ''; e.className = 'an-estado' + (tipo ? ' ' + tipo : ''); }

    async function aceptar() {
        if (!datos) return;
        if (H.renglonesPendientes()) { estado('Guarda o cancela primero los cambios de los conceptos de la partida.', 'error'); return; }
        $('anPegadoAceptar').disabled = true;
        estado('Pegando…', 'info');
        try {
            var r = await AN.api.post(H.url(), { accion: 'pegado_especial', partida_id: H.sel || 0, partidas: datos.partidas, conceptos: datos.conceptos });
            H.aplicar(r);
            if (r.pegado.primera && r.pegado.primera !== H.sel) await H.seleccionar(r.pegado.primera);
            else if (H.sel) H.emitir('partida', H.partida());
            dlg.close();
            var p = r.pegado;
            AN.ui.aviso('Pegado especial: ' + p.partidas + ' partida(s) nuevas, ' + p.conceptos_nuevos + ' concepto(s) nuevos, '
                + p.agregados + ' renglón(es) agregados' + (p.actualizados ? ' y ' + p.actualizados + ' actualizados' : '') + '.', 'ok', 6000);
        } catch (e) {
            estado(e.message, 'error');
            $('anPegadoAceptar').disabled = false;
        }
    }

    function plantilla() {
        var filas = [['Partida', 'Código', 'Descripción completa', 'Unidad', 'Cantidad', 'Costo'],
            ['A', '', 'CANCELERÍA', '', '', ''],
            ['A.01', '', 'VENTANAS', '', '', ''],
            ['A.01', 'VEN-01', 'Suministro e instalación de ventana corrediza…', 'PZA', 2, 3500],
            ['A.02', '', 'PUERTAS', '', '', ''],
            ['A.02', 'PUE-01', 'Suministro e instalación de puerta abatible…', 'PZA', 1, 8200]];
        window.XlsxSimple.descargar(window.XlsxSimple.crear({ nombre: 'Pegado especial', anchos: [12, 14, 60, 10, 12, 14], filas: filas }), 'Plantilla pegado especial.xlsx');
    }

    function abrir() {
        $('anPegadoTexto').value = '';
        $('anPegadoResumen').textContent = '';
        $('anPegadoVista').hidden = true;
        $('anPegadoAceptar').disabled = true;
        estado(H.partida() ? '' : 'Sin partida seleccionada: el archivo debe traer la columna Partida.', H.partida() ? '' : 'info');
        dlg.showModal();
        $('anPegadoTexto').focus();
    }

    var analizarPronto = AN.ui.retrasar(analizar, 200);
    $('anPegadoTexto').addEventListener('input', analizarPronto);
    $('anPegadoArchivo').addEventListener('change', function () {
        var f = this.files[0];
        if (!f) return;
        var listo = function (texto) { $('anPegadoTexto').value = texto; analizar(); };
        if (/\.xlsx$/i.test(f.name)) window.XlsxSimple.leer(f).then(function (filas) { listo(window.XlsxSimple.aTexto(filas)); }).catch(function (e) { estado('No se pudo leer el Excel: ' + e.message, 'error'); });
        else f.text().then(listo);
        this.value = '';
    });
    $('anPegadoPlantilla').addEventListener('click', plantilla);
    $('anPegadoAceptar').addEventListener('click', aceptar);
    dlg.querySelectorAll('[data-pegado-cerrar]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });
    if ($('anPegadoEspecial')) $('anPegadoEspecial').addEventListener('click', abrir);
    AN.hojaPegado = { abrir: abrir };
})(window.AcriNeo = window.AcriNeo || {});
