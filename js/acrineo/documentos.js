// ACRINEO · Pestaña DOCUMENTOS del «Detalle del presupuesto»: subir, descargar, visualizar y eliminar los libros
// (C.H. por presupuesto; FASAR y pie de indirectos por moneda). La ventana le pasa cómo obtener el id del
// presupuesto: si es nuevo, el detalle lo guarda primero (obtenerId) y luego se sube el archivo.
(function (AN) {
    'use strict';

    var cfg = window.ACRINEO || {};
    var puede = !!(cfg.permisos && cfg.permisos['presupuestos.documentos']);
    var MAX = (cfg.docMaxMb || 4) * 1024 * 1024;
    var EXT = cfg.docExt || [];
    var panel = document.getElementById('an-panel-documentos');
    if (!panel) return;

    var st = { lista: [], obtenerId: null, idActual: function () { return 0; }, soloLectura: false };

    function lugar(el) { return { tipo: el.dataset.docTipo, moneda: el.dataset.docMonedaValor ? +el.dataset.docMonedaValor : null }; }
    function docDe(el) {
        var l = lugar(el);
        return st.lista.find(function (d) { return d.tipo_documento === l.tipo && (d.moneda || null) === l.moneda; }) || null;
    }
    function urlDoc(d, modo) {
        return AN.api.url(AN.api.PRESUPUESTOS, { id: st.idActual(), recurso: 'documentos', doc: d.id, modo: modo });
    }

    function pintar() {
        panel.querySelectorAll('.an-doc').forEach(function (el) {
            var d = docDe(el);
            var nombre = el.querySelector('[data-doc-nombre]');
            nombre.textContent = d ? d.nombre_original : 'Ningún archivo elegido';
            nombre.classList.toggle('vacio', !d);
            nombre.title = d ? (d.nombre_original + ' · ' + (d.tamano / 1024).toFixed(1) + ' KB · ' + (d.uploaded_by || '') + ' · ' + AN.ui.fechaCorta(d.created_at)) : '';
            el.querySelector('[data-doc-accion="descargar"]').disabled = !d;
            el.querySelector('[data-doc-accion="ver"]').disabled = !d;
            el.querySelector('[data-doc-accion="eliminar"]').disabled = !d || !puede || st.soloLectura;
            var subir = el.querySelector('[data-doc-subir]');
            subir.hidden = !puede || st.soloLectura;
            subir.tabIndex = 0;
            subir.setAttribute('role', 'button');
        });
    }

    async function subir(el, archivo) {
        var ext = (archivo.name.split('.').pop() || '').toLowerCase();
        if (EXT.indexOf(ext) < 0) { AN.ui.aviso('Tipo de archivo no permitido. Se aceptan: ' + EXT.join(', ') + '.', 'error'); return; }
        if (archivo.size > MAX) { AN.ui.aviso('El archivo pesa más de ' + cfg.docMaxMb + ' MB.', 'error'); return; }
        if (archivo.size === 0) { AN.ui.aviso('El archivo está vacío.', 'error'); return; }

        var id = await st.obtenerId();   // un presupuesto nuevo se guarda antes
        if (!id) return;
        var l = lugar(el);
        var datos = new FormData();
        datos.append('tipo', l.tipo);
        if (l.moneda) datos.append('moneda', l.moneda);
        datos.append('archivo', archivo, archivo.name);
        el.classList.add('subiendo');
        try {
            var r = await AN.api.post(AN.api.url(AN.api.PRESUPUESTOS, { id: id, recurso: 'documentos' }), datos);
            st.lista = r.documentos;
            pintar();
            AN.ui.aviso('Documento guardado: ' + archivo.name, 'ok');
        } catch (e) {
            AN.ui.aviso(e.message, 'error');
        } finally {
            el.classList.remove('subiendo');
        }
    }

    function descargar(d) {
        var a = document.createElement('a');
        a.href = urlDoc(d, 'descargar');
        a.download = d.nombre_original;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    // PDF: en otra pestaña del navegador. Excel (.xlsx) y CSV: tabla de vista previa. .xls / .ods: se descargan.
    async function ver(d) {
        var ext = (d.nombre_original.split('.').pop() || '').toLowerCase();
        if (ext === 'pdf') { window.open(urlDoc(d, 'ver'), '_blank', 'noopener'); return; }
        if (ext !== 'xlsx' && ext !== 'csv') {
            AN.ui.aviso('La vista previa está disponible para .xlsx, .csv y .pdf. Este archivo se descargará.', 'info');
            descargar(d);
            return;
        }
        try {
            var b = await AN.api.blob(urlDoc(d, 'descargar'));
            var filas = ext === 'csv' ? leerCsv(await b.text()) : await window.XlsxSimple.leer(b);
            mostrarVista(d.nombre_original, filas);
        } catch (e) {
            AN.ui.aviso('No se pudo mostrar la vista previa: ' + e.message, 'error');
        }
    }

    function leerCsv(texto) {
        var filas = [], fila = [], campo = '', comillas = false;
        var sep = (texto.split('\n')[0].match(/;/g) || []).length > (texto.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
        for (var i = 0; i < texto.length; i++) {
            var c = texto[i];
            if (comillas) {
                if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
                else if (c === '"') comillas = false;
                else campo += c;
            } else if (c === '"') comillas = true;
            else if (c === sep) { fila.push(campo); campo = ''; }
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && texto[i + 1] === '\n') i++;
                fila.push(campo); filas.push(fila); fila = []; campo = '';
            } else campo += c;
        }
        if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
        return filas;
    }

    function mostrarVista(nombre, filas) {
        var MAXF = 300, MAXC = 40;
        var dlg = document.getElementById('anVista');
        document.getElementById('anVistaTitulo').textContent = 'Vista previa · ' + nombre;
        var cortadas = filas.length > MAXF || filas.some(function (f) { return f.length > MAXC; });
        document.getElementById('anVistaNota').textContent = filas.length + ' renglones (primera hoja)'
            + (cortadas ? ' · se muestran los primeros ' + MAXF + ' renglones y ' + MAXC + ' columnas' : '') + '.';
        document.getElementById('anVistaFilas').innerHTML = filas.slice(0, MAXF).map(function (f, i) {
            return '<tr class="an-fila"><td class="an-ayuda num">' + (i + 1) + '</td>'
                + (f || []).slice(0, MAXC).map(function (v) { return '<td title="' + AN.ui.esc(v) + '">' + AN.ui.esc(v) + '</td>'; }).join('') + '</tr>';
        }).join('') || '<tr class="an-vacio"><td>La hoja está vacía.</td></tr>';
        dlg.showModal();
    }

    async function eliminar(d) {
        var ok = await AN.ui.confirmar({ titulo: 'Eliminar documento', mensaje: '¿Eliminar «' + d.nombre_original + '» de este presupuesto?', aceptar: 'Eliminar', peligro: true });
        if (!ok) return;
        try {
            var r = await AN.api.del(AN.api.url(AN.api.PRESUPUESTOS, { id: st.idActual(), recurso: 'documentos', doc: d.id }));
            st.lista = r.documentos;
            pintar();
            AN.ui.aviso('Documento eliminado.', 'ok');
        } catch (e) {
            AN.ui.aviso(e.message, 'error');
        }
    }

    // Eventos
    panel.addEventListener('change', function (e) {
        if (e.target.type !== 'file' || !e.target.files.length) return;
        var archivo = e.target.files[0];
        var el = e.target.closest('.an-doc');
        e.target.value = '';
        subir(el, archivo);
    });
    panel.addEventListener('keydown', function (e) {
        var l = e.target.closest('[data-doc-subir]');
        if (l && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); l.querySelector('input').click(); }
    });
    panel.addEventListener('click', function (e) {
        var tab = e.target.closest('[data-doc-moneda-tab]');
        if (tab) {
            panel.querySelectorAll('[data-doc-moneda-tab]').forEach(function (b) { b.setAttribute('aria-selected', String(b === tab)); });
            panel.querySelectorAll('[data-doc-moneda]').forEach(function (p) { p.hidden = p.dataset.docMoneda !== tab.dataset.docMonedaTab; });
            return;
        }
        var b = e.target.closest('[data-doc-accion]');
        if (!b || b.disabled) return;
        var d = docDe(b.closest('.an-doc'));
        if (!d) return;
        if (b.dataset.docAccion === 'descargar') descargar(d);
        else if (b.dataset.docAccion === 'ver') ver(d);
        else if (b.dataset.docAccion === 'eliminar') eliminar(d);
    });
    AN.ui.cerrables(document.getElementById('anVista'));

    AN.documentos = {
        // op: { obtenerId: async () => id|null, idActual: () => id, soloLectura }
        montar: function (op) { st.obtenerId = op.obtenerId; st.idActual = op.idActual; },
        cargar: function (lista, soloLectura) { st.lista = lista || []; st.soloLectura = !!soloLectura; pintar(); }
    };
})(window.AcriNeo = window.AcriNeo || {});
