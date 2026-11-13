// ACRINEO · Ventana «Cálculo: <presupuesto>» (botón de cuadrícula arriba a la derecha de la hoja), como en Neodata.
// Carga las opciones guardadas del presupuesto; ACEPTAR las guarda, recalcula las matrices y los totales y muestra el
// resultado: explosión de insumos (de todo el presupuesto o de los conceptos marcados en el catálogo de abajo), por
// concepto si se pide, y los errores potenciales. El servidor hace todo el cálculo (includes/acrineo/calculo.php).
(function (AN) {
    'use strict';

    var H = AN.hoja;
    if (!H) return;
    var $ = function (id) { return document.getElementById(id); };
    var esc = AN.ui.esc;
    var dlg = $('anCalculo'), form = $('anCalculoForm'), res = $('anExplosion');
    var ultimo = null;   // último resultado (para exportarlo)
    var BOOL = ['errores_potenciales', 'ch_misma_tasa', 'asignar_fecha', 'explosion_x_concepto', 'explotar_ch', 'no_explotar_integrados'];
    var NOMBRE_TIPO = { MAT: 'Materiales', MO: 'Mano de obra', EQ: 'Equipo', HER: 'Herramienta', BAS: 'Básicos', OTR: 'Otros' };

    function estado(t, tipo) { var e = $('anCalculoEstado'); e.textContent = t || ''; e.className = 'an-estado' + (tipo ? ' ' + tipo : ''); }
    function campo(n) { return form.elements[n]; }

    function habilitar() {
        campo('ch_tasa').disabled = !campo('ch_misma_tasa').checked;
        campo('fecha_insumos').disabled = !campo('asignar_fecha').checked;
        var no = form.querySelector('input[name=tipo_explosion][value=no]').checked;
        ['explosion_x_concepto', 'explotar_ch', 'no_explotar_integrados', 'decimales_explosion'].forEach(function (n) { campo(n).disabled = no; });
    }

    async function abrir() {
        if (!H.puede) { AN.ui.aviso('No tienes permiso para calcular el presupuesto (ACRINEO_PRESUPUESTOS_EDITAR).', 'error'); return; }
        $('anCalculoTitulo').textContent = 'Cálculo: ' + H.ctx.nombre;
        estado('Cargando…', 'info');
        form.querySelectorAll('.invalido').forEach(function (i) { i.classList.remove('invalido'); });
        dlg.showModal();
        try {
            var r = await AN.api.get(H.url({ recurso: 'calculo' }));
            var o = r.opciones;
            form.querySelector('input[name=tipo_explosion][value="' + o.tipo_explosion + '"]').checked = true;
            form.querySelector('input[name=moneda][value="' + o.moneda + '"]').checked = true;
            BOOL.forEach(function (n) { campo(n).checked = !!o[n]; });
            campo('respaldo_correo').checked = false;
            ['ch_tasa', 'decimales_costos', 'decimales_explosion', 'fecha_insumos'].forEach(function (n) { campo(n).value = o[n] == null ? '' : o[n]; });
            (r.monedas || []).forEach(function (m) {
                var s = form.querySelector('[data-moneda="' + m.numero + '"]');
                if (s) s.textContent = 'Moneda ' + m.numero + ' · ' + m.descripcion + (m.numero > 1 ? ' (T.C. ' + m.tipo_cambio + ')' : '');
            });
            habilitar();
            estado(o.disponible ? '' : 'Falta aplicar la migración 030 para guardar estas opciones y calcular.', o.disponible ? '' : 'error');
            $('anCalculoAceptar').disabled = !o.disponible;
        } catch (e) { estado(e.message, 'error'); }
    }

    async function aceptar(e) {
        e.preventDefault();
        if (H.renglonesPendientes()) { estado('Guarda o cancela primero los cambios de los conceptos de la partida.', 'error'); return; }
        var o = {
            accion: 'calcular', partida_id: H.sel || 0,
            tipo_explosion: form.querySelector('input[name=tipo_explosion]:checked').value,
            moneda: +form.querySelector('input[name=moneda]:checked').value,
            ch_tasa: campo('ch_tasa').value, decimales_costos: campo('decimales_costos').value,
            decimales_explosion: campo('decimales_explosion').value, fecha_insumos: campo('fecha_insumos').value,
            marcados: AN.hojaConceptos ? AN.hojaConceptos.marcados() : []
        };
        BOOL.forEach(function (n) { o[n] = campo(n).checked; });
        form.querySelectorAll('.invalido').forEach(function (i) { i.classList.remove('invalido'); });
        $('anCalculoAceptar').disabled = true;
        estado('Calculando…', 'info');
        try {
            var r = await AN.api.post(H.url(), o);
            H.aplicar(r);
            dlg.close();
            mostrar(r.calculo);
            AN.ui.aviso('Presupuesto calculado: ' + AN.ui.dinero(r.presupuesto.costo_directo) + ' de costo directo.', 'ok');
        } catch (err) {
            Object.keys(err.errores || {}).forEach(function (k) { var i = campo(k); if (i && i.classList) i.classList.add('invalido'); });
            var k1 = Object.keys(err.errores || {})[0];
            estado(err.message + (k1 && err.errores[k1] && !/^No hay/.test(err.errores[k1]) ? ' ' + err.errores[k1] : ''), 'error');
        } finally { $('anCalculoAceptar').disabled = false; }
    }

    // ---------- Resultado ----------
    function num(n, d) { return (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d }); }
    function tablaInsumos(items, dq, moneda) {
        var html = '<table class="an-tabla an-explosion"><thead><tr><th><div class="an-th"><span>Código</span></div></th><th><div class="an-th"><span>Descripción</span></div></th>'
            + '<th><div class="an-th"><span>Unidad</span></div></th><th class="num"><div class="an-th"><span>Cantidad</span></div></th>'
            + '<th class="num"><div class="an-th"><span>Costo</span></div></th><th class="num"><div class="an-th"><span>Importe</span></div></th></tr></thead><tbody>';
        var tipo = null, sub = 0;
        var cierre = function () { if (tipo !== null) html += '<tr class="an-explosion-sub"><td colspan="5">Total ' + esc((NOMBRE_TIPO[tipo] || tipo).toLowerCase()) + '</td><td class="num">' + dinero(sub, moneda) + '</td></tr>'; };
        items.forEach(function (i) {
            if (i.tipo !== tipo) { cierre(); tipo = i.tipo; sub = 0; html += '<tr class="an-grupo"><td colspan="6">' + esc(NOMBRE_TIPO[tipo] || tipo) + '</td></tr>'; }
            sub += i.importe;
            html += '<tr class="an-fila"><td>' + esc(i.codigo || '') + '</td><td class="an-desc">' + esc(i.descripcion) + '</td><td>' + esc(i.unidad || '') + '</td>'
                + '<td class="num">' + (i.pct ? '—' : num(i.cantidad, dq)) + '</td><td class="num">' + (i.costo == null ? '—' : dinero(i.costo, moneda)) + '</td>'
                + '<td class="num">' + dinero(i.importe, moneda) + '</td></tr>';
        });
        cierre();
        return html + '</tbody></table>';
    }
    function dinero(n, moneda) { return moneda && moneda.numero === 2 ? (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) + ' ' + (moneda.descripcion || '') : AN.ui.dinero(n); }

    function mostrar(c) {
        ultimo = c;
        var o = c.opciones, x = c.explosion, mon = c.moneda;
        var html = '<p class="an-explosion-resumen">Se recalcularon las matrices y los totales: <b>' + c.recalculados + '</b> concepto' + (c.recalculados === 1 ? '' : 's') + ' cambiaron de costo'
            + (o.asignar_fecha || o.ch_misma_tasa ? ' · <b>' + c.actualizados + '</b> insumo' + (c.actualizados === 1 ? '' : 's') + ' tomaron costo del catálogo'
                + (o.asignar_fecha ? ' al ' + esc(AN.ui.fechaCorta ? AN.ui.fechaCorta(o.fecha_insumos) : o.fecha_insumos) : '') + (o.ch_misma_tasa ? ' (costos horarios al ' + o.ch_tasa + ' %)' : '') : '') + '.</p>';
        if (c.errores) {
            html += '<section class="an-explosion-errores"><h3>Errores potenciales (' + c.errores.length + ')</h3>'
                + (c.errores.length ? '<ul>' + c.errores.map(function (e) { return '<li>' + esc(e.texto) + '</li>'; }).join('') + '</ul>' : '<p>No se encontró nada que revisar.</p>') + '</section>';
        } else if (c.avisos && c.avisos.length) {
            html += '<section class="an-explosion-errores"><h3>Avisos</h3><ul>' + c.avisos.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></section>';
        }
        if (x) {
            html += '<h3 class="an-explosion-h">Explosión de insumos · ' + (o.tipo_explosion === 'marcados' ? 'conceptos marcados' : 'todo el presupuesto') + ' · ' + esc(mon.descripcion) + '</h3>';
            if (x.sin_matriz.length) html += '<p class="an-ayuda">Sin matriz (no se explotan): ' + esc(x.sin_matriz.join(', ')) + '.</p>';
            html += x.items.length ? tablaInsumos(x.items, o.decimales_explosion, mon) + '<p class="an-explosion-total">Total <b>' + dinero(x.total, mon) + '</b></p>'
                : '<p class="an-vacio-texto">Ningún concepto tiene matriz de precio unitario que explotar.</p>';
            (x.por_concepto || []).forEach(function (pc) {
                html += '<details class="an-explosion-concepto"><summary><b>' + esc(pc.codigo) + '</b> ' + esc(pc.descripcion) + ' · ' + num(pc.cantidad, o.decimales_explosion) + ' ' + esc(pc.unidad || '')
                    + '<span class="an-flex"></span>' + dinero(pc.total, mon) + '</summary>' + tablaInsumos(pc.items, o.decimales_explosion, mon) + '</details>';
            });
        }
        $('anExplosionCuerpo').innerHTML = html;
        $('anExplosionExcel').hidden = !x || !x.items.length;
        res.showModal();
    }

    function exportar() {
        var x = ultimo && ultimo.explosion;
        if (!x) return;
        var filas = [['Tipo', 'Código', 'Descripción', 'Unidad', 'Cantidad', 'Costo', 'Importe']];
        var agrega = function (items, pre) { items.forEach(function (i) { filas.push((pre || []).concat([i.tipo, i.codigo || '', i.descripcion, i.unidad || '', i.pct ? '' : i.cantidad, i.costo == null ? '' : i.costo, i.importe])); }); };
        agrega(x.items);
        filas.push(['', '', 'Total', '', '', '', x.total]);
        if (x.por_concepto && x.por_concepto.length) {
            filas.push([], ['Concepto', 'Cantidad del concepto', 'Tipo', 'Código', 'Descripción', 'Unidad', 'Cantidad', 'Costo', 'Importe']);
            x.por_concepto.forEach(function (pc) { agrega(pc.items, [pc.codigo, pc.cantidad]); });
        }
        var blob = window.XlsxSimple.crear({ nombre: 'Explosion de insumos', anchos: [8, 14, 50, 10, 14, 14, 16], filas: filas });
        window.XlsxSimple.descargar(blob, 'Explosion de insumos ' + H.ctx.codigo + '.xlsx');
    }

    form.addEventListener('change', habilitar);
    form.addEventListener('submit', aceptar);
    dlg.querySelectorAll('[data-calculo-cerrar]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });
    res.querySelectorAll('[data-explosion-cerrar]').forEach(function (b) { b.addEventListener('click', function () { res.close(); }); });
    $('anExplosionExcel').addEventListener('click', exportar);
    $('anCalculoBoton').addEventListener('click', abrir);
})(window.AcriNeo = window.AcriNeo || {});
