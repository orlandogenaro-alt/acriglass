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
            FACTORES.forEach(function (k) { $('anSc_' + k).value = r.factores[k]; });
            $('anScActual').textContent = 'Hoy el presupuesto tiene ' + Number(r.sobrecosto_pct).toFixed(4) + ' %';
            pintar();
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

    form.addEventListener('input', pintar);
    form.addEventListener('submit', aceptar);
    dlg.querySelectorAll('[data-sc-cerrar]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });
    AN.hojaSobrecosto = { abrir: abrir };
})(window.AcriNeo = window.AcriNeo || {});
