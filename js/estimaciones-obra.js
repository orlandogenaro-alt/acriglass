// Estimaciones de la obra (api/estimaciones.php). Las cifras definitivas las calcula el servidor; aquí solo se adelantan.
(function () {
    var $ = function (id) { return document.getElementById(id); };
    var token = document.querySelector('meta[name="acri-token"]').content;
    var obraId = parseInt(document.body.dataset.obra, 10) || 0;
    var datos = null, ed = null;   // ed: { id, tipo, cantidades: {ccid: cant} }

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
    function r2(n) { return Math.round(n * 100) / 100; }
    function dinero(v) { return '$' + num(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function cant(v) { return num(v).toLocaleString('es-MX', { maximumFractionDigits: 4 }); }
    function dmy(s) { var p = String(s || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
    function hoy() { return new Date().toISOString().slice(0, 10); }
    function aviso(texto, tipo) {
        var a = $('aviso'); a.textContent = texto || ''; a.className = 'aviso ' + (tipo || ''); a.hidden = !texto;
        if (texto) window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function pedir(accion, cuerpo) {
        var op = { method: cuerpo ? 'POST' : 'GET', headers: { 'X-Acri-Token': token } };
        if (cuerpo) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(cuerpo); }
        return fetch('api/estimaciones.php?accion=' + accion + (cuerpo ? '' : '&obra=' + obraId), op).then(function (r) {
            if (r.status === 401) { (window.top || window).location.href = 'index.php'; throw new Error('Sesión expirada'); }
            return r.json().catch(function () { throw new Error('Respuesta no válida del servidor (HTTP ' + r.status + ').'); });
        }).then(function (j) { if (!j.ok) throw new Error(j.error); return j; });
    }
    function cargar() {
        if (!obraId) { aviso('Abre las estimaciones desde una obra guardada.', 'error'); return Promise.resolve(); }
        return pedir('datos').then(function (j) { datos = j; pintar(); }).catch(function (err) { aviso(err.message, 'error'); });
    }

    function pintar() {
        var o = datos.obra, c = datos.contrato;
        $('titulo').innerHTML = 'Obra <b>' + esc(o.nom_obra) + '</b> · ' + esc(o.cliente || '') + (c ? ' · contrato ' + esc(c.numero) + ' (' + esc(c.estatus) + ')' : '');
        if (!c) { aviso('La obra aún no tiene contrato: regístralo con el botón Contrato de la obra.', 'error'); return; }
        var s = datos.situacion, v = s.vigente;
        $('bloqueResumen').hidden = false;
        $('tarjetas').innerHTML = [
            ['Monto vigente', dinero(v.monto), 'fuerte'], ['Estimado (autorizado)', dinero(s.estimado)], ['Avance financiero', s.avance_financiero + ' %'],
            ['Anticipo pactado', dinero(v.anticipo)], ['Anticipo otorgado', dinero(s.anticipo_otorgado)], ['Amortizado', dinero(s.amortizado)],
            ['Por amortizar', dinero(s.por_amortizar)]
        ].map(function (x) { return '<div class="tarjeta ' + (x[2] || '') + '"><span>' + esc(x[0]) + '</span><b>' + x[1] + '</b></div>'; }).join('');
        // Catálogo
        $('bloqueCatalogo').hidden = false;
        var hay = datos.catalogo.length > 0;
        $('filaGenerar').hidden = hay;
        $('generar').disabled = !datos.puede_modificar;
        $('ayudaCatalogo').textContent = hay
            ? 'P.U. = costo directo del Análisis P.U. aprobado × factor ' + num(c.factor_catalogo).toFixed(6) + ' (monto del contrato ÷ costo directo), así la suma da lo contratado. El avance es lo estimado en estimaciones autorizadas.'
            : 'Se genera una sola vez con los conceptos del Análisis P.U. de la versión aprobada del presupuesto; los P.U. se ajustan para que sumen el monto del contrato.';
        $('catalogo').innerHTML = hay ? datos.catalogo.map(function (x) {
            var pe = num(x.cantidad) - num(x.estimado);
            return '<tr><td>' + esc(x.clave) + '</td><td>' + esc(x.partida || '') + '</td><td>' + esc(x.descripcion) + '</td><td>' + esc(x.unidad) + '</td>' +
                '<td class="num">' + cant(x.cantidad) + '</td><td class="num">' + dinero(x.pu) + '</td><td class="num">' + dinero(x.importe) + '</td>' +
                '<td class="num">' + cant(x.estimado_autorizado) + '</td><td><span class="barra"><i style="width:' + Math.min(100, num(x.avance)) + '%"></i></span> ' + num(x.avance).toFixed(1) + ' %</td>' +
                '<td class="num">' + cant(pe) + '</td></tr>';
        }).join('') : '<tr><td colspan="10" class="vacio">Sin catálogo.</td></tr>';
        // Estimaciones
        var vigente = c.estatus.trim() === 'vigente';
        $('bloqueEstimaciones').hidden = false;
        $('nuevaEstimacion').disabled = !datos.puede_modificar || !vigente || !hay;
        $('nuevoAnticipo').disabled = !datos.puede_modificar || !vigente || !(v.anticipo > 0);
        $('estimaciones').innerHTML = datos.estimaciones.length ? datos.estimaciones.map(function (e) {
            var est = e.estatus.trim(), tipo = e.tipo.trim(), b = [];
            if (est === 'borrador' && datos.puede_modificar) b.push('<button class="btn chico" data-ed="' + e.estimacion_id + '">Editar</button>');
            if (est === 'borrador' && datos.puede_autorizar) b.push('<button class="btn chico azul" data-acc="autorizar" data-id="' + e.estimacion_id + '">Autorizar</button>');
            if (est === 'autorizada' && datos.puede_modificar) b.push('<button class="btn chico azul" data-acc="facturar" data-id="' + e.estimacion_id + '">Facturada</button>');
            if (est === 'facturada' && datos.puede_modificar) b.push('<button class="btn chico azul" data-acc="cobrar" data-id="' + e.estimacion_id + '">Cobrada</button>');
            if ((est === 'borrador' || est === 'autorizada') && datos.puede_modificar) b.push('<button class="btn chico peligro" data-acc="cancelar" data-id="' + e.estimacion_id + '">Cancelar</button>');
            return '<tr><td><b>' + (tipo === 'anticipo' ? 'Anticipo ' : 'Estimación ') + e.numero + '</b></td>' +
                '<td>' + dmy(e.fecha) + (e.periodo_ini ? '<br><small>' + dmy(e.periodo_ini) + ' – ' + dmy(e.periodo_fin) + '</small>' : '') + '</td>' +
                '<td class="num">' + dinero(e.importe) + '</td><td class="num">' + dinero(e.amortizacion) + '</td><td class="num">' + dinero(e.iva) + '</td>' +
                '<td class="num">' + dinero(e.fondo_garantia) + '</td><td class="num">' + dinero(e.retencion) + '</td><td class="num"><b>' + dinero(e.neto) + '</b></td>' +
                '<td><span class="estatus ' + est + '">' + esc(est) + '</span></td><td>' + esc(e.folio_factura || '') + '</td><td>' + b.join('') + '</td></tr>';
        }).join('') : '<tr><td colspan="11" class="vacio">Sin estimaciones.</td></tr>';
    }

    // ---------- Editor ----------
    function porEstimar(x, excluir) {
        var previo = num(x.estimado);
        if (excluir) excluir.conceptos.forEach(function (y) { if (+y.contrato_concepto_id === +x.contrato_concepto_id) previo -= num(y.cantidad); });
        return num(x.cantidad) - previo;
    }
    function abrirEditor(tipo, e) {
        ed = { id: e ? +e.estimacion_id : 0, tipo: tipo, previa: e || null, cantidades: {} };
        if (e) e.conceptos.forEach(function (y) { ed.cantidades[y.contrato_concepto_id] = num(y.cantidad); });
        $('editor').hidden = false;
        $('edTitulo').textContent = (e ? 'Editar ' : 'Nuevo ') + (tipo === 'anticipo' ? 'anticipo' : 'estimación') + (e ? ' ' + e.numero : '');
        document.querySelectorAll('[data-solo]').forEach(function (el) { el.hidden = el.dataset.solo !== tipo; });
        $('edFecha').value = e ? String(e.fecha).slice(0, 10) : hoy();
        $('edIni').value = e && e.periodo_ini ? String(e.periodo_ini).slice(0, 10) : '';
        $('edFin').value = e && e.periodo_fin ? String(e.periodo_fin).slice(0, 10) : '';
        $('edNotas').value = e ? e.notas || '' : '';
        var s = datos.situacion;
        $('edImporte').value = e ? num(e.importe) : r2(Math.max(0, s.vigente.anticipo - s.anticipo_registrado));
        $('edConceptos').innerHTML = datos.catalogo.map(function (x) {
            return '<tr data-cc="' + x.contrato_concepto_id + '"><td>' + esc(x.clave) + '</td><td>' + esc(x.descripcion) + '</td><td>' + esc(x.unidad) + '</td>' +
                '<td class="num">' + dinero(x.pu) + '</td><td class="num">' + cant(porEstimar(x, ed.previa)) + '</td>' +
                '<td class="num"><input type="number" step="any" min="0" value="' + (ed.cantidades[x.contrato_concepto_id] || '') + '"></td>' +
                '<td class="num" data-imp></td></tr>';
        }).join('');
        recalcular();
        $('editor').scrollIntoView({ behavior: 'smooth' });
    }
    // Vista previa con las mismas fórmulas del servidor (includes/estimaciones.php estimacionTotales)
    function recalcular() {
        var c = datos.contrato, importe = 0;
        if (ed.tipo === 'anticipo') importe = r2(num($('edImporte').value));
        else document.querySelectorAll('#edConceptos tr').forEach(function (tr) {
            var x = datos.catalogo.filter(function (y) { return +y.contrato_concepto_id === +tr.dataset.cc; })[0];
            var q = num(tr.querySelector('input').value), imp = r2(q * num(x.pu));
            ed.cantidades[x.contrato_concepto_id] = q;
            tr.querySelector('[data-imp]').textContent = q ? dinero(imp) : '';
            tr.querySelector('input').style.borderColor = q > porEstimar(x, ed.previa) + 0.0001 ? '#f87171' : '';
            importe += imp;
        });
        var anticipo = ed.tipo === 'anticipo', pend = datos.situacion.por_amortizar + (ed.previa ? num(ed.previa.amortizacion) : 0);
        var amort = anticipo ? 0 : r2(Math.min(importe * num(c.anticipo_pct) / 100, Math.max(0, pend)));
        var sub = r2(importe - amort), iva = r2(sub * num(c.iva_pct) / 100);
        var fondo = anticipo ? 0 : r2(importe * num(c.fondo_garantia_pct) / 100), ret = anticipo ? 0 : r2(importe * num(c.retencion_pct) / 100);
        $('edResumen').innerHTML = [['Importe', importe], ['− Amortización', amort], ['= Subtotal', sub], ['+ IVA ' + num(c.iva_pct) + ' %', iva],
            ['− Fondo de garantía', fondo], ['− Retención', ret], ['= Neto a cobrar', r2(sub + iva - fondo - ret)]].map(function (x) {
            return '<div><span>' + esc(x[0]) + '</span><br><b>' + dinero(x[1]) + '</b></div>';
        }).join('');
    }

    $('generar').addEventListener('click', function () {
        if (!confirm('Se genera el catálogo de conceptos del contrato con sus P.U. Solo se hace una vez. ¿Continuar?')) return;
        pedir('generar_catalogo', { contrato: datos.contrato.contrato_id }).then(function (j) {
            aviso('Catálogo generado: ' + j.conceptos + ' conceptos' + (j.diferencia ? ' (diferencia por redondeo ' + dinero(j.diferencia) + ')' : '') + '.', 'ok');
            return cargar();
        }).catch(function (err) { aviso(err.message, 'error'); });
    });
    $('nuevaEstimacion').addEventListener('click', function () { abrirEditor('estimacion', null); });
    $('nuevoAnticipo').addEventListener('click', function () { abrirEditor('anticipo', null); });
    $('editor').addEventListener('input', recalcular);
    $('edCerrar').addEventListener('click', function () { $('editor').hidden = true; ed = null; });
    $('edGuardar').addEventListener('click', function () {
        var conceptos = Object.keys(ed.cantidades).filter(function (k) { return ed.cantidades[k] > 0; })
            .map(function (k) { return { contrato_concepto_id: +k, cantidad: ed.cantidades[k] }; });
        pedir('guardar', { contrato: datos.contrato.contrato_id, id: ed.id, tipo: ed.tipo, fecha: $('edFecha').value, periodo_ini: $('edIni').value,
                           periodo_fin: $('edFin').value, notas: $('edNotas').value, importe: $('edImporte').value, conceptos: conceptos }).then(function (j) {
            aviso('Guardada en borrador · neto ' + dinero(j.neto) + '. La autoriza otro usuario con el permiso «Autorizar estimaciones».', 'ok');
            $('editor').hidden = true;
            ed = null;
            return cargar();
        }).catch(function (err) { aviso(err.message, 'error'); });
    });

    $('estimaciones').addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.ed) {
            var est = datos.estimaciones.filter(function (x) { return +x.estimacion_id === +b.dataset.ed; })[0];
            abrirEditor(est.tipo.trim(), est);
            return;
        }
        var acc = b.dataset.acc, cuerpo = { id: +b.dataset.id, accion: acc };
        if (acc === 'facturar') {
            var folio = prompt('Folio de la factura en Microsip:');
            if (!folio) return;
            cuerpo.folio_factura = folio;
            cuerpo.fecha = prompt('Fecha de la factura (aaaa-mm-dd):', hoy()) || hoy();
        } else if (acc === 'cobrar') {
            var f = prompt('Fecha del cobro (aaaa-mm-dd):', hoy());
            if (!f) return;
            cuerpo.fecha = f;
        } else if (!confirm(acc === 'autorizar' ? '¿Autorizar? Las deducciones se recalculan en este momento.' : '¿Cancelar este documento?')) {
            return;
        }
        pedir('estatus', cuerpo).then(function (j) { aviso('Documento ' + j.estatus + '.', 'ok'); return cargar(); }).catch(function (err) { aviso(err.message, 'error'); });
    });

    cargar();
})();
