// Contrato de obra y convenios (api/contratos.php)
(function () {
    var $ = function (id) { return document.getElementById(id); };
    var token = document.querySelector('meta[name="acri-token"]').content;
    var obraId = parseInt(document.body.dataset.obra, 10) || 0;
    var datos = null, editando = 0;

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
    function dinero(v) { return '$' + num(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function dmy(s) { var p = String(s || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
    function hoy() { return new Date().toISOString().slice(0, 10); }
    function aviso(texto, tipo) {
        var a = $('aviso');
        a.textContent = texto || '';
        a.className = 'aviso ' + (tipo || '');
        a.hidden = !texto;
        if (texto) window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function pedir(accion, cuerpo) {
        var op = { method: cuerpo ? 'POST' : 'GET', headers: { 'X-Acri-Token': token } };
        if (cuerpo) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(cuerpo); }
        return fetch('api/contratos.php?accion=' + accion + (cuerpo ? '' : '&obra=' + obraId), op).then(function (r) {
            if (r.status === 401) { (window.top || window).location.href = 'index.php'; throw new Error('Sesión expirada'); }
            return r.json().catch(function () { throw new Error('Respuesta no válida del servidor (HTTP ' + r.status + ').'); });
        }).then(function (j) { if (!j.ok) throw new Error(j.error); return j; });
    }

    function cargar() {
        if (!obraId) { aviso('Abre el contrato desde una obra guardada.', 'error'); return Promise.resolve(); }
        return pedir('datos').then(function (j) { datos = j; pintar(); }).catch(function (err) { aviso(err.message, 'error'); });
    }

    function pintar() {
        var o = datos.obra, c = datos.contrato, p = datos.propuesta, v = datos.vigente;
        $('titulo').innerHTML = 'Obra <b>' + esc(o.nom_obra) + '</b> · ' + esc(o.cliente || '') + (o.folio ? ' · presupuesto folio ' + esc(o.folio) : '');
        $('bloqueContrato').hidden = false;
        // Resumen
        $('bloqueResumen').hidden = !v;
        if (v) {
            var t = [['Monto original', v.original], ['Aditivas', v.aditivas], ['Deductivas', v.deductivas], ['Órdenes de cambio', v.ordenes_cambio],
                     ['Monto vigente', v.monto, 'fuerte'], ['IVA ' + num(c.iva_pct) + ' %', v.iva], ['Total con IVA', v.total, 'fuerte'],
                     ['Anticipo ' + num(c.anticipo_pct) + ' %', v.anticipo]];
            $('tarjetas').innerHTML = t.map(function (x) {
                return '<div class="tarjeta ' + (x[2] || '') + '"><span>' + esc(x[0]) + '</span><b>' + dinero(x[1]) + ' ' + esc(c.moneda) + '</b></div>';
            }).join('') +
                '<div class="tarjeta"><span>Terminación vigente</span><b>' + (v.fecha_termino ? dmy(v.fecha_termino) : '—') + '</b>' +
                (v.dias ? '<span>' + (v.dias > 0 ? '+' : '') + v.dias + ' días por convenios</span>' : '') + '</div>' +
                '<div class="tarjeta"><span>Convenios pendientes</span><b>' + v.pendientes + '</b>' + (v.pendientes ? '<span>' + dinero(v.pendiente_monto) + ' por autorizar</span>' : '') + '</div>';
            $('notaLibro').textContent = datos.libro ? 'El monto contratado y cada convenio autorizado quedan en el libro de movimientos de la obra.' : '';
        }
        // Contrato
        var r = c || {};
        var base = c ? c : p;
        $('estatusContrato').textContent = c ? c.estatus : 'nuevo';
        $('estatusContrato').className = 'estatus ' + (c ? c.estatus.trim() : 'borrador');
        $('ayudaContrato').textContent = c ? (c.estatus.trim() === 'borrador'
            ? 'En borrador se puede cambiar el monto. Al marcarlo Vigente, los cambios de monto se hacen con convenios.'
            : 'El monto ya no se cambia aquí: registra una aditiva, deductiva u orden de cambio.')
            : 'Propuesta con el monto sin IVA y la tasa del presupuesto (' + p.origen + '). Revísala y guárdala; queda en borrador.';
        $('cNumero').value = base.numero || '';
        $('cFirma').value = r.fecha_firma || '';
        $('cInicio').value = (base.fecha_inicio || '').slice(0, 10);
        $('cTermino').value = (base.fecha_termino || '').slice(0, 10);
        $('cMonto').value = num(base.monto).toFixed(2);
        $('cIva').value = num(base.iva_pct);
        $('cMoneda').value = (r.moneda || 'MXN').trim();
        $('cTc').value = r.tipo_cambio ? num(r.tipo_cambio) : 1;
        $('cAnticipo').value = num(r.anticipo_pct);
        $('cFondo').value = num(r.fondo_garantia_pct);
        $('cRetencion').value = num(r.retencion_pct);
        $('cRetConcepto').value = r.retencion_concepto || '';
        $('cCondiciones').value = r.condiciones_pago || '';
        $('cNotas').value = r.notas || '';
        $('cEstatus').value = c ? c.estatus.trim() : 'borrador';
        var borrador = !c || c.estatus.trim() === 'borrador';
        $('bloqueContrato').querySelectorAll('input, select, textarea, button').forEach(function (el) { el.disabled = !datos.puede_modificar; });
        document.querySelectorAll('[data-monto]').forEach(function (el) { el.disabled = !datos.puede_modificar || !borrador; });
        // Convenios
        $('bloqueConvenios').hidden = !c;
        if (c) pintarConvenios();
    }

    function pintarConvenios() {
        var tipos = datos.tipos, vigente = datos.contrato.estatus.trim() === 'vigente';
        $('vTipo').innerHTML = Object.keys(tipos).map(function (k) { return '<option value="' + k + '">' + esc(tipos[k]) + '</option>'; }).join('');
        $('convenios').innerHTML = datos.convenios.length ? datos.convenios.map(function (v) {
            var est = v.estatus.trim(), pendiente = est === 'pendiente';
            var propio = String(v.solicitado_por || '').trim().toUpperCase() === String(datos.usuario).toUpperCase();
            var botones = !pendiente ? '' :
                (datos.puede_autorizar ? '<button class="btn chico azul" data-resolver="autorizar" data-id="' + v.convenio_id + '"' +
                    (propio ? ' title="Lo registraste tú: lo autoriza otro usuario (salvo un administrador)"' : '') + '>Autorizar</button>' +
                    '<button class="btn chico peligro" data-resolver="rechazar" data-id="' + v.convenio_id + '">Rechazar</button>' : '') +
                (datos.puede_modificar ? '<button class="btn chico" data-editar="' + v.convenio_id + '">Editar</button>' +
                    '<button class="btn chico" data-cancelar="' + v.convenio_id + '">Cancelar</button>' : '');
            return '<tr><td>' + esc(v.numero) + '</td><td>' + esc(tipos[v.tipo] || v.tipo) + '</td><td>' + dmy(v.fecha) + '</td><td>' + esc(v.descripcion) +
                (v.comentario ? '<br><small class="ayuda">' + esc(v.comentario) + '</small>' : '') + '</td>' +
                '<td class="num">' + dinero(v.monto) + '</td><td class="num">' + esc(v.dias) + '</td>' +
                '<td><span class="estatus ' + est + '">' + esc(est) + '</span></td>' +
                '<td>' + esc(v.solicitado_por || '') + (v.resuelto_por ? ' / ' + esc(v.resuelto_por) : '') + '</td><td>' + botones + '</td></tr>';
        }).join('') : '<tr><td colspan="9" class="vacio">Sin convenios.</td></tr>';
        ['vTipo', 'vNumero', 'vFecha', 'vMonto', 'vDias', 'vDescripcion', 'vGuardar'].forEach(function (id) { $(id).disabled = !datos.puede_modificar || !vigente; });
        if (!editando) limpiarConvenio();
    }

    function limpiarConvenio() {
        editando = 0;
        $('vTitulo').textContent = 'Nuevo convenio';
        $('vGuardar').textContent = '💾 Registrar convenio';
        $('vLimpiar').hidden = true;
        $('vNumero').value = 'CONV-' + (datos.convenios.length + 1);
        $('vFecha').value = hoy();
        $('vMonto').value = '';
        $('vDias').value = 0;
        $('vDescripcion').value = '';
    }

    $('cGuardar').addEventListener('click', function () {
        var d = {
            obra: obraId, numero: $('cNumero').value, fecha_firma: $('cFirma').value, fecha_inicio: $('cInicio').value, fecha_termino: $('cTermino').value,
            monto: $('cMonto').value, iva_pct: $('cIva').value, moneda: $('cMoneda').value, tipo_cambio: $('cTc').value,
            anticipo_pct: $('cAnticipo').value, fondo_garantia_pct: $('cFondo').value, retencion_pct: $('cRetencion').value,
            retencion_concepto: $('cRetConcepto').value, condiciones_pago: $('cCondiciones').value, notas: $('cNotas').value, estatus: $('cEstatus').value
        };
        if (d.estatus === 'vigente' && (!datos.contrato || datos.contrato.estatus.trim() === 'borrador') &&
            !confirm('Al marcarlo Vigente el monto queda fijo y entra al libro de la obra; los cambios se harán con convenios. ¿Continuar?')) return;
        pedir('guardar_contrato', d).then(function () { aviso('Contrato guardado.', 'ok'); return cargar(); }).catch(function (err) { aviso(err.message, 'error'); });
    });

    $('vGuardar').addEventListener('click', function () {
        var d = { contrato: datos.contrato.contrato_id, id: editando, tipo: $('vTipo').value, numero: $('vNumero').value, fecha: $('vFecha').value,
                  monto: $('vMonto').value, dias: $('vDias').value, descripcion: $('vDescripcion').value };
        pedir('guardar_convenio', d).then(function () {
            aviso(editando ? 'Convenio actualizado.' : 'Convenio registrado: queda pendiente de autorización.', 'ok');
            editando = 0;
            return cargar();
        }).catch(function (err) { aviso(err.message, 'error'); });
    });
    $('vLimpiar').addEventListener('click', limpiarConvenio);

    $('convenios').addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b || b.disabled) return;
        var id = +(b.dataset.id || b.dataset.editar || b.dataset.cancelar);
        var v = datos.convenios.filter(function (x) { return +x.convenio_id === id; })[0];
        if (b.dataset.resolver) {
            var autorizar = b.dataset.resolver === 'autorizar';
            var comentario = prompt((autorizar ? 'Autorizar' : 'Rechazar') + ' «' + v.numero + '» por ' + dinero(v.monto) + '.\n\nComentario' + (autorizar ? ' (opcional):' : ' (obligatorio):'), '');
            if (comentario === null) return;
            pedir('resolver_convenio', { id: id, decision: b.dataset.resolver, comentario: comentario }).then(function (j) {
                aviso('Convenio ' + j.estatus + '.', 'ok');
                return cargar();
            }).catch(function (err) { aviso(err.message, 'error'); });
        } else if (b.dataset.editar) {
            editando = id;
            $('vTitulo').textContent = 'Editar convenio ' + v.numero;
            $('vGuardar').textContent = '💾 Guardar cambios';
            $('vLimpiar').hidden = false;
            $('vTipo').value = v.tipo; $('vNumero').value = v.numero; $('vFecha').value = String(v.fecha).slice(0, 10);
            $('vMonto').value = v.tipo === 'orden_cambio' ? num(v.monto) : Math.abs(num(v.monto)); $('vDias').value = v.dias; $('vDescripcion').value = v.descripcion;
            $('vDescripcion').focus();
        } else if (b.dataset.cancelar) {
            if (!confirm('¿Cancelar el convenio «' + v.numero + '»?')) return;
            pedir('cancelar_convenio', { id: id }).then(function () { aviso('Convenio cancelado.', 'ok'); return cargar(); }).catch(function (err) { aviso(err.message, 'error'); });
        }
    });

    cargar();
})();
