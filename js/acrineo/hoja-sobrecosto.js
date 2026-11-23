// ACRINEO · Ventana «Factor de sobrecosto» (Ctrl+Shift+S): los % de indirectos, financiamiento, utilidad y cargos
// adicionales dan el % de sobrecosto en cascada (la misma cuenta que acrineoSobrecostoDesglose en el servidor).
// ACEPTAR lo guarda y los precios del presupuesto se recalculan.
(function (AN) {
    'use strict';

    var H = AN.hoja;
    if (!H || !document.getElementById('anSobrecostoDlg')) return;
    var $ = function (id) { return document.getElementById(id); };
    var dlg = $('anSobrecostoDlg'), form = $('anSobrecostoForm');
    var FACTORES = ['indirecto_campo', 'indirecto_oficina', 'financiamiento', 'utilidad', 'cargos_adicionales'];

    function desglose(f) {
        var p = function (k) { return (Number(f[k]) || 0) / 100; };
        var cd = 100, ind = p('indirecto_campo') + p('indirecto_oficina');
        var ci = cd * ind, s1 = cd + ci, cf = s1 * p('financiamiento'), s2 = s1 + cf, cu = s2 * p('utilidad'), s3 = s2 + cu, ca = s3 * p('cargos_adicionales'), pu = s3 + ca;
        return { costo_directo: cd, indirectos: ci, subtotal1: s1, financiamiento: cf, subtotal2: s2, utilidad: cu, subtotal3: s3, cargos: ca, precio_unitario: pu,
                 indirecto_total: ind * 100, sobrecosto_pct: Math.round((pu - cd) * 10000) / 10000 };
    }
    function valores() { var f = {}; FACTORES.forEach(function (k) { f[k] = $('anSc_' + k).value; }); return f; }
    function pintar() {
        var f = valores(), d = desglose(f);
        $('anSc_indirecto_total').value = Math.round(d.indirecto_total * 1e6) / 1e6;
        dlg.querySelectorAll('[data-sc]').forEach(function (td) { td.textContent = AN.ui.dinero(d[td.dataset.sc]); });
        dlg.querySelectorAll('[data-scf]').forEach(function (td) {
            var v = td.dataset.scf === 'indirecto_total' ? d.indirecto_total : Number(f[td.dataset.scf]) || 0;
            td.textContent = (Math.round(v * 1e6) / 1e6).toLocaleString('es-MX', { minimumFractionDigits: 4, maximumFractionDigits: 6 }) + ' %';
        });
        $('anScResultado').textContent = d.sobrecosto_pct.toFixed(4) + ' %';
    }
    function estado(t, tipo) { var e = $('anScEstado'); e.textContent = t || ''; e.className = 'an-estado' + (tipo ? ' ' + tipo : ''); }

    async function abrir() {
        if (!H.puede) { AN.ui.aviso('No tienes permiso para cambiar el sobrecosto (ACRINEO_PRESUPUESTOS_EDITAR).', 'error'); return; }
        estado('Cargando…', 'info');
        $('anScActual').textContent = '';
        form.querySelectorAll('.invalido').forEach(function (i) { i.classList.remove('invalido'); });
        dlg.showModal();
        try {
            var r = await AN.api.get(H.url({ recurso: 'sobrecosto' }));
            FACTORES.forEach(function (k) { $('anSc_' + k).value = Number(r.factores[k] || 0).toFixed(6); });
            $('anScActual').textContent = 'Hoy el presupuesto tiene ' + Number(r.sobrecosto_pct).toFixed(4) + ' %';
            pintar();
            cargarLibro();
            estado(r.disponible ? '' : 'Falta aplicar la migración 032 para guardar los factores.', r.disponible ? '' : 'error');
            $('anScAceptar').disabled = !r.disponible;
            $('anSc_indirecto_campo').focus();
        } catch (e) { estado(e.message, 'error'); }
    }

    async function aceptar(e) {
        e.preventDefault();
        if (H.renglonesPendientes()) { estado('Guarda o cancela primero los cambios de los conceptos de la partida.', 'error'); return; }
        $('anScAceptar').disabled = true;
        estado('Guardando…', 'info');
        try {
            var cuerpo = Object.assign({ accion: 'sobrecosto_factores', partida_id: H.sel || 0 }, valores());
            var r = await AN.api.post(H.url(), cuerpo);
            H.aplicar(r);
            dlg.close();
            AN.ui.aviso('% de sobrecosto: ' + Number(r.desglose.sobrecosto_pct).toFixed(4) + ' %. Los precios se recalcularon.', 'ok');
        } catch (err) {
            Object.keys(err.errores || {}).forEach(function (k) { var i = $('anSc_' + k); if (i) i.classList.add('invalido'); });
            estado(err.message, 'error');
        } finally { $('anScAceptar').disabled = false; }
    }

    // ---------- Libro pie de indirectos ----------
    // Se descarga un Excel con el costo directo de la obra, los importes de los indirectos de campo y de oficina y los %
    // de financiamiento, utilidad y cargos adicionales; se trabaja en Excel y al subirlo los factores salen de él:
    // indirecto de campo % = total de campo / costo directo × 100 (igual el de oficina). El archivo se guarda en los
    // Documentos del presupuesto (tipo libro_indirectos, moneda 1).
    var cfg = window.ACRINEO || {};
    var libro = null;   // documento guardado
    var CAMPO = ['Personal técnico y administrativo de obra', 'Oficinas, bodegas e instalaciones provisionales', 'Fletes, acarreos y vehículos',
                 'Seguros y fianzas', 'Pruebas de laboratorio y control de calidad', 'Seguridad e higiene', 'Otros indirectos de campo'];
    var OFICINA = ['Sueldos y honorarios de oficina central', 'Renta, servicios y mantenimiento de oficina', 'Papelería, comunicaciones y equipo de cómputo',
                   'Gastos de concursos y promoción', 'Capacitación', 'Otros indirectos de oficina'];

    function urlDocs(p) { return AN.api.url(AN.api.PRESUPUESTOS, Object.assign({ id: H.id, recurso: 'documentos' }, p || {})); }
    function pintarLibro() {
        var n = $('anScLibroNombre');
        n.textContent = libro ? libro.nombre_original : 'Ningún archivo elegido';
        n.classList.toggle('vacio', !libro);
        $('anScDescargar').disabled = !libro;
    }
    async function cargarLibro() {
        libro = null;
        pintarLibro();
        try {
            var r = await AN.api.get(urlDocs());
            libro = (r.documentos || []).find(function (d) { return d.tipo_documento === 'libro_indirectos' && (+d.moneda || 1) === 1; }) || null;
            pintarLibro();
        } catch (e) { /* sin lista de documentos: solo no se muestra el libro guardado */ }
    }

    function plantilla() {
        var f = valores(), cd = Number(H.ctx.costo_directo) || 0;
        var n = function (k) { return Number(f[k]) || 0; };
        var filas = [[{ v: 'PIE DE INDIRECTOS', e: 'grande' }], [{ v: H.ctx.codigo + ' · ' + H.ctx.nombre, e: 'negrita' }],
            [{ v: 'Captura los importes de la columna C y los % de abajo. Guarda y súbelo en la ventana «Factor de sobrecosto» (Opciones del presupuesto).', e: 'sub' }], [],
            [{ v: 'COSTO DIRECTO DE LA OBRA', e: 'negrita' }, '', { v: cd, e: 'dinero' }], []];
        var seccion = function (titulo, lineas, pct) {
            filas.push([{ v: titulo, e: 'titulo' }, { v: '', e: 'titulo' }, { v: 'Importe', e: 'titulo' }, { v: '% del costo directo', e: 'titulo' }]);
            var desde = filas.length + 1;
            var actual = cd * pct / 100;
            lineas.forEach(function (l, i) { filas.push([l, '', { v: i === 0 ? Math.round(actual * 100) / 100 : 0, e: 'dinero' }]); });
            var hasta = filas.length, fila = hasta + 1;
            filas.push([{ v: 'TOTAL ' + titulo, e: 'negrita' }, '', { f: 'SUM(C' + desde + ':C' + hasta + ')', v: Math.round(actual * 100) / 100, e: 'total' },
                { f: 'IF($C$5>0,C' + fila + '/$C$5*100,0)', v: pct, e: 'cantidad' }]);
            filas.push([]);
        };
        seccion('INDIRECTOS DE CAMPO', CAMPO, n('indirecto_campo'));
        seccion('INDIRECTOS DE OFICINA', OFICINA, n('indirecto_oficina'));
        filas.push([{ v: 'FINANCIAMIENTO %', e: 'negrita' }, '', { v: n('financiamiento'), e: 'cantidad' }]);
        filas.push([{ v: 'UTILIDAD %', e: 'negrita' }, '', { v: n('utilidad'), e: 'cantidad' }]);
        filas.push([{ v: 'CARGOS ADICIONALES %', e: 'negrita' }, '', { v: n('cargos_adicionales'), e: 'cantidad' }]);
        var blob = window.XlsxSimple.crear({ nombre: 'Pie de indirectos', anchos: [52, 4, 18, 20], filas: filas });
        window.XlsxSimple.descargar(blob, 'Pie de indirectos ' + H.ctx.codigo + '.xlsx');
    }

    function normal(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim(); }
    function numero(v) { var x = parseFloat(String(v == null ? '' : v).replace(/[$,%\s]/g, '')); return isFinite(x) ? x : null; }

    // Factores que salen del libro: { indirecto_campo, … } o lanza un error con lo que falta
    function leerLibro(filas) {
        var cd = null, sec = null, suma = { campo: 0, oficina: 0 }, pct = {};
        filas.forEach(function (f) {
            var a = normal(f[0]), c = numero(f[2]);
            if (!a) return;
            if (a.indexOf('COSTO DIRECTO') === 0) { cd = c; sec = null; return; }
            if (a.indexOf('INDIRECTOS DE CAMPO') === 0) { sec = 'campo'; return; }
            if (a.indexOf('INDIRECTOS DE OFICINA') === 0) { sec = 'oficina'; return; }
            if (a.indexOf('TOTAL') === 0) { sec = null; return; }
            if (a.indexOf('FINANCIAMIENTO') === 0) { pct.financiamiento = c; sec = null; return; }
            if (a.indexOf('UTILIDAD') === 0) { pct.utilidad = c; sec = null; return; }
            if (a.indexOf('CARGOS ADICIONALES') === 0) { pct.cargos_adicionales = c; sec = null; return; }
            if (sec && c !== null) suma[sec] += c;
        });
        if (!(cd > 0)) throw new Error('El libro no trae el «COSTO DIRECTO DE LA OBRA» (columna C) mayor que cero.');
        return { indirecto_campo: suma.campo / cd * 100, indirecto_oficina: suma.oficina / cd * 100,
                 financiamiento: pct.financiamiento || 0, utilidad: pct.utilidad || 0, cargos_adicionales: pct.cargos_adicionales || 0 };
    }

    async function subirLibro(archivo) {
        if (!archivo) return;
        try {
            var filas = await window.XlsxSimple.leer(archivo, function (h) { return h.some(function (f) { return normal(f[0]).indexOf('INDIRECTOS DE CAMPO') === 0; }); });
            var r = leerLibro(filas);
            FACTORES.forEach(function (k) { $('anSc_' + k).value = (Math.round(r[k] * 1e6) / 1e6).toFixed(6); });
            pintar();
            estado('Factores tomados del libro: revísalos y presiona ACEPTAR para guardarlos.', 'ok');
        } catch (e) { estado('No se pudo leer el libro: ' + e.message, 'error'); return; }
        if (!(cfg.permisos && cfg.permisos['presupuestos.documentos'])) return;
        try {
            var datos = new FormData();
            datos.append('tipo', 'libro_indirectos');
            datos.append('moneda', '1');
            datos.append('archivo', archivo, archivo.name);
            var d = await AN.api.post(urlDocs(), datos);
            libro = (d.documentos || []).find(function (x) { return x.tipo_documento === 'libro_indirectos' && (+x.moneda || 1) === 1; }) || null;
            pintarLibro();
        } catch (e) { AN.ui.aviso('Los factores se tomaron, pero el libro no se guardó en Documentos: ' + e.message, 'error'); }
    }

    $('anScPlantilla').addEventListener('click', plantilla);
    $('anScSubir').addEventListener('change', function () { var a = this.files[0]; this.value = ''; subirLibro(a); });
    $('anScSubirBtn').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('anScSubir').click(); } });
    $('anScDescargar').addEventListener('click', function () {
        if (libro) window.location.href = urlDocs({ doc: libro.id, modo: 'descargar' });
    });

    form.addEventListener('input', function (e) { if (e.target.id !== 'anScSubir') pintar(); });
    form.addEventListener('submit', aceptar);
    dlg.querySelectorAll('[data-sc-cerrar]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });
    AN.hojaSobrecosto = { abrir: abrir };
})(window.AcriNeo = window.AcriNeo || {});
