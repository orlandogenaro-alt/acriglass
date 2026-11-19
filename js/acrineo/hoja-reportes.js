// ACRINEO · Ventana «Imprimir reportes» (Opciones del Presupuesto › Reporte o Ctrl+P): Presupuesto, Análisis de precios
// unitarios y Explosión de insumos. Abre acrineo-reporte.php en otra pestaña para imprimir (o guardar como PDF) o bajar a Excel.
(function (AN) {
    'use strict';

    var H = AN.hoja;
    if (!H || !document.getElementById('anReportes')) return;
    var $ = function (id) { return document.getElementById(id); };
    var dlg = $('anReportes'), form = $('anReportesForm');

    function tipo() { return (form.querySelector('[name=tipo]:checked') || {}).value || 'presupuesto'; }
    function marcados() { return AN.hojaConceptos ? AN.hojaConceptos.marcados() : []; }
    function pintar() {
        var n = marcados().length, explosion = tipo() === 'explosion';
        $('anRpMarcados').disabled = !n || explosion;
        if (!n || explosion) $('anRpMarcados').checked = false;
        $('anRpMarcadosTexto').textContent = 'Sólo los conceptos marcados del catálogo' + (n ? ' (' + n + ')' : ' (no hay marcados)');
        $('anRpMarcadosCaja').title = explosion ? 'La explosión de insumos es de todo el presupuesto' : '';
    }
    function url(extra) {
        var q = new URLSearchParams({ id: H.ctx.id, tipo: tipo() });
        if ($('anRpMarcados').checked) q.set('marcados', marcados().join(','));
        if (extra) q.set(extra, '1');
        return 'acrineo-reporte.php?' + q.toString();
    }
    function abrirReporte(extra) {
        try { localStorage.setItem('acrineo.reporte', tipo()); } catch (e) { /* sin memoria */ }
        var w = window.open(url(extra), '_blank');
        if (!w) { $('anRpEstado').textContent = 'El navegador bloqueó la ventana nueva: permite las ventanas emergentes de este sitio.'; $('anRpEstado').className = 'an-estado error'; return; }
        dlg.close();
    }

    function abrir() {
        if (H.renglonesPendientes && H.renglonesPendientes()) { AN.ui.aviso('Guarda o cancela primero los cambios de los conceptos de la partida.', 'error'); return; }
        var previo = null;
        try { previo = localStorage.getItem('acrineo.reporte'); } catch (e) { /* sin memoria */ }
        var r = previo && form.querySelector('[name=tipo][value="' + previo + '"]');
        if (r) r.checked = true;
        $('anRpEstado').textContent = '';
        pintar();
        dlg.showModal();
    }

    form.addEventListener('change', pintar);
    form.addEventListener('submit', function (e) { e.preventDefault(); abrirReporte('imprimir'); });
    $('anRpVer').addEventListener('click', function () { abrirReporte(null); });
    $('anRpExcel').addEventListener('click', function () { abrirReporte('excel'); });
    dlg.querySelectorAll('[data-rp-cerrar]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });
    // Ctrl+P en la hoja abre los reportes (la hoja de trabajo no se imprime)
    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p' && !document.querySelector('dialog[open]')) { e.preventDefault(); abrir(); }
    });
    // Botón «Imprimir ▾» junto a «Facturas y Easy-Glass»: el presupuesto (formato PRESUPUESTO DE OBRA) a la
    // impresora / PDF o a Excel, sin pasar por la ventana de reportes
    var btnImp = $('anHojaImprimir'), menuImp = $('anHojaImprimirMenu');
    function menuImprimir(abierto) {
        menuImp.hidden = !abierto;
        btnImp.setAttribute('aria-expanded', abierto ? 'true' : 'false');
        if (abierto) menuImp.querySelector('button').focus();
    }
    if (btnImp && menuImp) {
        btnImp.addEventListener('click', function (e) { e.stopPropagation(); menuImprimir(menuImp.hidden); });
        menuImp.addEventListener('click', function (e) {
            var b = e.target.closest('[data-imprimir]');
            if (!b) return;
            menuImprimir(false);
            if (b.dataset.imprimir === 'otros') { abrir(); return; }
            if (H.renglonesPendientes && H.renglonesPendientes()) { AN.ui.aviso('Guarda o cancela primero los cambios de los conceptos de la partida.', 'error'); return; }
            var w = window.open('acrineo-reporte.php?' + new URLSearchParams({ id: H.ctx.id, tipo: 'presupuesto' }) + '&' + b.dataset.imprimir + '=1', '_blank');
            if (!w) AN.ui.aviso('El navegador bloqueó la ventana nueva: permite las ventanas emergentes de este sitio.', 'error');
        });
        document.addEventListener('click', function (e) { if (!menuImp.hidden && !e.target.closest('#anHojaImprimirMenu')) menuImprimir(false); });
        menuImp.addEventListener('keydown', function (e) { if (e.key === 'Escape') { menuImprimir(false); btnImp.focus(); } });
    }

    AN.hojaReportes = { abrir: abrir };
})(window.AcriNeo = window.AcriNeo || {});
