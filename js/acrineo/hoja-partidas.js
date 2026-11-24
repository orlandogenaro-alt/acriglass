// ACRINEO · Menú de las partidas (clic derecho en el árbol y ⋮), como en Neodata PU Nube+: Nueva partida ▸ (en la
// seleccionada, en la raíz, 'n' partidas), Regenerar WBS, Detalle, Pegado especial, Eliminar, Actualizar, Aplicar
// expresión, Renumerar renglón, Duplicar 'n' veces, Expandir y Colapsar todo.
// Ventanas: includes/acrineo/vistas/partidas.php · servidor: includes/acrineo/hoja.php
(function (AN) {
    'use strict';

    var H = AN.hoja;
    if (!H) return;
    var $ = function (id) { return document.getElementById(id); };
    var esc = AN.ui.esc;
    var fmtM2 = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

    function nombre(p) { return p ? "'" + p.codigo + "'" : ''; }
    function sinPendientes() {
        if (!H.renglonesPendientes()) return true;
        AN.ui.aviso('Guarda o cancela primero los cambios de los conceptos de la partida.', 'error');
        return false;
    }
    function estado(id, texto, tipo) {
        var e = $(id);
        e.textContent = texto || '';
        e.className = 'an-estado' + (tipo ? ' ' + tipo : '');
    }

    // ---------- Detalle de la partida ----------
    var dlgDet = $('anPartidaDetalle');
    var detId = null;
    function detalle() {
        var p = H.partida();
        if (!p) return;
        detId = p.id;
        $('anPartidaDetalleTitulo').textContent = 'Detalle de la partida: ' + p.codigo;
        $('anPdCodigo').value = p.codigo;
        $('anPdAuxiliar').value = p.codigo_auxiliar || '';
        $('anPdRenglon').value = p.renglon == null ? '' : p.renglon;
        $('anPdWbs').value = p.wbs || '';
        $('anPdCorta').value = p.descripcion_corta || '';
        $('anPdDesc').value = p.descripcion;
        $('anPdM2').value = String(p.metros_cuadrados || 1);
        $('anPdImportes').innerHTML = [['Costo', p.costo], ['Precio', p.venta], ['Costo x M2', p.costo_m2], ['Precio x M2', p.venta_m2]]
            .map(function (x) { return '<span>' + x[0] + '<b>' + AN.ui.dinero(x[1]) + '</b></span>'; }).join('')
            + '<span>Metros cuadrados<b>' + fmtM2.format(Number(p.metros_cuadrados) || 1) + '</b></span>';
        dlgDet.querySelectorAll('input:not(#anPdWbs), textarea').forEach(function (i) { i.readOnly = !H.puede; i.classList.remove('invalido'); });
        $('anPdAceptar').hidden = !H.puede;
        contarCorta();
        estado('anPdEstado', '');
        dlgDet.showModal();
        (H.puede ? $('anPdCodigo') : $('anPdDesc')).focus();
    }
    function contarCorta() { $('anPdCortaCuenta').textContent = '(' + $('anPdCorta').value.length + ' de 40)'; }
    $('anPdCorta').addEventListener('input', contarCorta);
    $('anPdAceptar').addEventListener('click', async function () {
        var b = this, campos = { codigo: 'anPdCodigo', descripcion: 'anPdDesc', metros_cuadrados: 'anPdM2', codigo_auxiliar: 'anPdAuxiliar', descripcion_corta: 'anPdCorta', renglon: 'anPdRenglon' };
        var cuerpo = { accion: 'partida_guardar', partida_id: detId };
        Object.keys(campos).forEach(function (k) { var el = $(campos[k]); el.classList.remove('invalido'); cuerpo[k] = el.value.trim(); });
        cuerpo.metros_cuadrados = cuerpo.metros_cuadrados.replace(/,/g, '') || '1';
        if (!cuerpo.codigo || !cuerpo.descripcion) {
            if (!cuerpo.codigo) $('anPdCodigo').classList.add('invalido');
            if (!cuerpo.descripcion) $('anPdDesc').classList.add('invalido');
            estado('anPdEstado', 'La partida necesita código y descripción completa.', 'error');
            return;
        }
        b.disabled = true;
        try {
            await H.post(cuerpo);
            dlgDet.close();
            AN.ui.aviso('Partida ' + cuerpo.codigo + ' guardada.', 'ok');
        } catch (e) {
            var errs = e.errores || {}, primero = null;
            Object.keys(errs).forEach(function (k) { if (campos[k]) { $(campos[k]).classList.add('invalido'); primero = primero || errs[k]; } });
            estado('anPdEstado', primero || e.message, 'error');
        } finally { b.disabled = false; }
    });
    dlgDet.querySelectorAll('[data-pdet-cerrar]').forEach(function (x) { x.addEventListener('click', function () { dlgDet.close(); }); });
    dlgDet.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT' && H.puede) { e.preventDefault(); $('anPdAceptar').click(); }
    });

    // ---------- Pedir un número: Agregar 'n' partidas · Duplicar 'n' veces ----------
    var dlgN = $('anPartidaN'), alAceptarN = null;
    function pedirNumero(op) {
        $('anPartidaNTitulo').textContent = op.titulo;
        $('anPartidaNTexto').textContent = op.texto;
        $('anPartidaNEtiqueta').textContent = op.etiqueta;
        var v = $('anPartidaNValor');
        v.max = op.max;
        v.value = op.valor || 1;
        v.classList.remove('invalido');
        estado('anPartidaNEstado', '');
        alAceptarN = op.aceptar;
        dlgN.showModal();
        v.select();
    }
    $('anPartidaNAceptar').addEventListener('click', async function () {
        var v = $('anPartidaNValor'), n = Number(v.value);
        if (!Number.isInteger(n) || n < 1 || n > Number(v.max)) {
            v.classList.add('invalido');
            estado('anPartidaNEstado', 'Escribe un número entero de 1 a ' + v.max + '.', 'error');
            return;
        }
        var b = this;
        b.disabled = true;
        estado('anPartidaNEstado', 'Procesando…');
        try { await alAceptarN(n); dlgN.close(); }
        catch (e) { estado('anPartidaNEstado', e.message, 'error'); }
        finally { b.disabled = false; }
    });
    $('anPartidaNValor').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('anPartidaNAceptar').click(); } });
    dlgN.querySelectorAll('[data-pn-cerrar]').forEach(function (x) { x.addEventListener('click', function () { dlgN.close(); }); });

    function agregarN(padre) {
        if (!sinPendientes()) return;
        pedirNumero({
            titulo: padre ? "Agregar 'n' partidas en " + nombre(padre) : "Agregar 'n' partidas en la raíz",
            texto: (padre ? 'Se agregan como subpartidas de ' + padre.codigo : 'Se agregan al final del primer nivel')
                + ', con el siguiente código libre y el código como descripción (se cambia con F2 o en Detalle).',
            etiqueta: '¿Cuántas partidas?', max: 200,
            aceptar: async function (n) {
                var r = await AN.api.post(H.url(), { accion: 'partidas_agregar', padre_id: padre ? padre.id : null, n: n });
                if (padre) H.cerrados[padre.id] = false;
                H.aplicar(r);
                if (r.partida_id) await H.seleccionar(r.partida_id);
                AN.ui.aviso(r.agregadas + ' partida' + (r.agregadas === 1 ? '' : 's') + ' agregada' + (r.agregadas === 1 ? '' : 's') + '.', 'ok');
            }
        });
    }

    function duplicarN() {
        var p = H.partida();
        if (!p || !sinPendientes()) return;
        pedirNumero({
            titulo: "Duplicar 'n' veces la partida " + nombre(p),
            texto: 'Cada copia lleva sus subpartidas y sus conceptos con las mismas cantidades, y queda debajo de la anterior con el siguiente código libre.',
            etiqueta: '¿Cuántas copias?', max: 50,
            aceptar: async function (n) {
                var r = await AN.api.post(H.url(), { accion: 'partida_duplicar', partida_id: p.id, veces: n });
                H.aplicar(r);
                if (r.partida_id) await H.seleccionar(r.partida_id);
                AN.ui.aviso('Partida ' + p.codigo + ' duplicada ' + n + (n === 1 ? ' vez.' : ' veces.'), 'ok');
            }
        });
    }

    // ---------- Regenerar WBS ----------
    async function regenerarWbs() {
        if (!(await AN.ui.confirmar({ titulo: 'Regenerar WBS',
            mensaje: 'Se vuelve a calcular el WBS de todas las partidas según el árbol actual: 1, 1.1, 1.2, 2…\nEl WBS que tengan ahora se reemplaza.',
            aceptar: 'Regenerar' }))) return;
        try {
            var r = await H.post({ accion: 'wbs_regenerar', partida_id: H.sel || 0 });
            AN.ui.aviso(r.cambiadas ? 'WBS regenerado (' + r.cambiadas + ' partida' + (r.cambiadas === 1 ? '' : 's') + ' cambió).' : 'El WBS ya estaba al día.', 'ok');
        } catch (e) { AN.ui.aviso(e.message, 'error'); }
    }

    // ---------- Renumerar renglón ----------
    var dlgR = $('anRenglonDlg');
    function renumerar() {
        estado('anRenglonEstado', '');
        dlgR.showModal();
        $('anRenglonInicio').select();
    }
    $('anRenglonAceptar').addEventListener('click', async function () {
        var ini = Number($('anRenglonInicio').value), paso = Number($('anRenglonPaso').value);
        if (!Number.isInteger(ini) || ini < 0 || !Number.isInteger(paso) || paso < 1) {
            estado('anRenglonEstado', 'El renglón inicial y el incremento son números enteros (el incremento, mayor que cero).', 'error');
            return;
        }
        var b = this;
        b.disabled = true;
        try {
            var r = await H.post({ accion: 'renglon_renumerar', inicio: ini, paso: paso, partida_id: H.sel || 0 });
            dlgR.close();
            AN.ui.aviso('Se renumeraron ' + r.renumeradas + ' partida' + (r.renumeradas === 1 ? '' : 's') + '.', 'ok');
        } catch (e) { estado('anRenglonEstado', e.message, 'error'); }
        finally { b.disabled = false; }
    });
    dlgR.querySelectorAll('[data-rr-cerrar]').forEach(function (x) { x.addEventListener('click', function () { dlgR.close(); }); });

    // ---------- Aplicar expresión ----------
    var dlgE = $('anExpresionDlg');
    var SIGNO = { multiplicar: '×', dividir: '÷', sumar: '+', restar: '−', igualar: '=' };
    function ejemplo() {
        var op = $('anExOperacion').value, v = Number(String($('anExValor').value).replace(/,/g, ''));
        if (!isFinite(v)) { $('anExEjemplo').textContent = ''; return; }
        var r = { multiplicar: 10 * v, dividir: v ? 10 / v : 10, sumar: 10 + v, restar: 10 - v, igualar: v }[op];
        $('anExEjemplo').textContent = 'Ejemplo: una cantidad de 10 queda en ' + Math.max(0, Math.round(r * 10000) / 10000).toLocaleString('es-MX', { maximumFractionDigits: 4 })
            + (r < 0 ? ' (nunca queda negativa)' : '') + '.';
    }
    function expresion() {
        if (!sinPendientes()) return;
        var p = H.partida();
        $('anExPartida').disabled = !p;
        $('anExPartidaTexto').textContent = p ? 'De la partida ' + p.codigo + ' y sus subpartidas' : 'De la partida seleccionada (no hay ninguna)';
        dlgE.querySelector('input[name="anExAlcance"][value="' + (p ? 'partida' : 'todo') + '"]').checked = true;
        $('anExValor').classList.remove('invalido');
        estado('anExEstado', '');
        ejemplo();
        dlgE.showModal();
        $('anExValor').select();
    }
    $('anExOperacion').addEventListener('change', ejemplo);
    $('anExValor').addEventListener('input', ejemplo);
    $('anExValor').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('anExAceptar').click(); } });
    $('anExAceptar').addEventListener('click', async function () {
        var alcance = dlgE.querySelector('input[name="anExAlcance"]:checked').value;
        var op = $('anExOperacion').value, valor = String($('anExValor').value).trim().replace(/,/g, '');
        if (valor === '' || !isFinite(Number(valor)) || (op === 'dividir' && Number(valor) === 0)) {
            $('anExValor').classList.add('invalido');
            estado('anExEstado', op === 'dividir' && Number(valor) === 0 ? 'No se puede dividir entre cero.' : 'Escribe un número.', 'error');
            return;
        }
        var p = H.partida();
        var donde = alcance === 'partida' && p ? 'de la partida ' + p.codigo + ' y sus subpartidas' : 'de TODO el presupuesto';
        if (!(await AN.ui.confirmar({ titulo: 'Aplicar expresión',
            mensaje: '¿Cambiar las cantidades de los conceptos ' + donde + ' (cantidad ' + SIGNO[op] + ' ' + valor + ')?\nLos importes se recalculan.',
            aceptar: 'Aplicar' }))) return;
        var b = this;
        b.disabled = true;
        try {
            var r = await H.post({ accion: 'expresion', alcance: alcance, partida_id: H.sel || 0, operacion: op, valor: valor });
            dlgE.close();
            AN.ui.aviso('Se cambió la cantidad de ' + r.expresion.cambiados + ' de ' + r.expresion.revisados + ' concepto' + (r.expresion.revisados === 1 ? '' : 's') + '.', 'ok');
        } catch (e) {
            if (e.errores && e.errores.valor) $('anExValor').classList.add('invalido');
            estado('anExEstado', (e.errores && e.errores.valor) || e.message, 'error');
        } finally { b.disabled = false; }
    });
    dlgE.querySelectorAll('[data-ex-cerrar]').forEach(function (x) { x.addEventListener('click', function () { dlgE.close(); }); });

    // ---------- Menús ----------
    function menu() {
        var p = H.partida(), ed = !!H.edicion, puede = H.puede;
        var op = [];
        if (puede) {
            op.push({ texto: 'Nueva partida', sub: [
                { texto: 'Nueva partida en ' + (p ? nombre(p) : '…'), accion: function () { if (p) H.nuevaPartida(p.id); }, desactivado: ed || !p },
                { texto: 'Nueva partida en la raíz del presupuesto', accion: function () { H.nuevaPartida(null); }, desactivado: ed },
                { texto: "Agregar 'n' partidas en " + (p ? nombre(p) : '…'), accion: function () { agregarN(p); }, desactivado: ed || !p },
                { texto: "Agregar 'n' partidas en la raíz del presupuesto", accion: function () { agregarN(null); }, desactivado: ed }] },
                { texto: 'Regenerar WBS', accion: regenerarWbs, desactivado: ed || !H.partidas.length });
        }
        op.push({ texto: 'Detalle', accion: detalle, desactivado: ed || !p });
        if (puede) {
            op.push({ texto: 'Pegado especial', accion: function () { if (AN.hojaPegado) AN.hojaPegado.abrir(); }, desactivado: ed },
                { texto: 'Eliminar partida ' + (p ? nombre(p) : ''), accion: function () { H.eliminarPartida(); }, desactivado: ed || !p });
        }
        op.push({ texto: 'Actualizar', accion: function () { H.recargar().catch(function (e) { AN.ui.aviso(e.message, 'error'); }); } });
        if (puede) {
            op.push({ texto: 'Aplicar expresión', accion: expresion, desactivado: ed },
                { texto: 'Renumerar renglón', accion: renumerar, desactivado: ed || !H.partidas.length },
                null,
                { texto: "Duplicar 'n' veces la partida " + (p ? nombre(p) : ''), accion: duplicarN, desactivado: ed || !p });
        } else op.push(null);
        op.push({ texto: 'Expandir todo', accion: function () { H.plegarTodas(false); } },
            { texto: 'Colapsar todo', accion: function () { H.plegarTodas(true); } });
        return op;
    }

    // Lo que el ⋮ del árbol agrega a sus opciones
    function menuExtras() {
        var p = H.partida(), ed = !!H.edicion;
        return [
            { texto: 'Detalle de la partida', accion: detalle, desactivado: ed || !p },
            { texto: "Agregar 'n' partidas", sub: [
                { texto: 'En ' + (p ? nombre(p) : 'la seleccionada'), accion: function () { agregarN(p); }, desactivado: ed || !p },
                { texto: 'En la raíz del presupuesto', accion: function () { agregarN(null); }, desactivado: ed }] },
            { texto: "Duplicar 'n' veces", accion: duplicarN, desactivado: ed || !p },
            { texto: 'Regenerar WBS', accion: regenerarWbs, desactivado: ed || !H.partidas.length },
            { texto: 'Renumerar renglón', accion: renumerar, desactivado: ed || !H.partidas.length },
            { texto: 'Aplicar expresión', accion: expresion, desactivado: ed }
        ];
    }

    AN.hojaPartidas = { menu: menu, menuExtras: menuExtras, detalle: detalle };
})(window.AcriNeo = window.AcriNeo || {});
