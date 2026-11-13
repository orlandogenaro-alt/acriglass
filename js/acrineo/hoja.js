// ACRINEO · Hoja del presupuesto: estado compartido (AcriNeo.hoja), encabezado con totales y % de sobrecosto, y el
// árbol de partidas (+ partida, ⊞ subpartida, editar, eliminar, mover ◀ ▶ ▲ ▼). La edición de una partida es en
// la misma fila: Enter o APLICAR guarda, Esc o CANCELAR la descarta.
// Los conceptos de la partida (hoja-renglones.js) y el catálogo de conceptos (hoja-conceptos.js) escuchan sus eventos.
(function (AN) {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    var cfg = window.ACRINEO || {};
    if (!cfg.hoja) return;
    var esc = AN.ui.esc;
    var puede = !!(cfg.permisos && cfg.permisos['presupuestos.editar']);
    var API = 'api/acrineo/hoja.php';
    var tbody = $('anPartidas');
    var CHEVRON = '<svg class="i" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';

    var oyentes = [];
    var H = AN.hoja = {
        id: cfg.hoja.id,
        ctx: cfg.hoja,
        partidas: [],
        sel: null,
        puede: puede,
        cerrados: {},
        edicion: null,          // { modo: 'nueva'|'editar', padre_id, partida_id, codigo, descripcion }
        filtro: { q: '', ids: null, visibles: null },   // filtro de conceptos: texto y, con «Todo el presupuesto», las partidas que coinciden
        renglonesPendientes: function () { return false; },   // lo reemplaza hoja-renglones.js
        url: function (p) { return AN.api.url(API, Object.assign({ id: H.id }, p || {})); },
        on: function (fn) { oyentes.push(fn); },
        emitir: function (evento, datos) { oyentes.forEach(function (fn) { fn(evento, datos); }); },
        partida: function () { return H.partidas.find(function (p) { return p.id === H.sel; }) || null; },
        precio: function (costo) {
            var d = H.ctx.dec_costos;
            return redondear(Number(costo) * (1 + H.ctx.sobrecosto_pct / 100), d);
        },
        redondear: function (n, d) { return redondear(n, d); }
    };
    function redondear(n, d) { var f = Math.pow(10, d); return Math.round((Number(n) || 0) * f + (n >= 0 ? 1e-9 : -1e-9)) / f; }

    // Aplica la respuesta de la API (presupuesto, partidas y, si viene, los renglones de la partida)
    H.aplicar = function (r) {
        H.ctx = r.presupuesto;
        H.partidas = r.partidas;
        if (H.sel && !H.partida()) H.sel = null;
        if (H.filtro.ids) calcularVisibles();
        pintar();
        H.emitir('estado', r);
        if (H.filtro.ids) refrescarFiltro();
    };

    H.post = async function (cuerpo) {
        var r = await AN.api.post(H.url(), cuerpo);
        H.aplicar(r);
        return r;
    };

    H.recargar = async function () {
        H.aplicar(await AN.api.get(H.url({ partida: H.sel || '' })));
    };

    H.seleccionar = async function (id) {
        if (id === H.sel) return true;
        if (H.renglonesPendientes() && !(await AN.ui.confirmar({
            titulo: 'Cambios sin guardar', mensaje: 'Los conceptos de la partida tienen cambios sin guardar.\n¿Deseas descartarlos?',
            aceptar: 'Descartar cambios', peligro: true }))) return false;
        H.sel = id;
        pintar();
        H.emitir('partida', H.partida());
        return true;
    };

    // ---------- Encabezado ----------
    function pintarEncabezado() {
        var p = H.partida();
        $('anTotales').innerHTML = 'Pre <b>' + AN.ui.dinero(H.ctx.costo_directo) + '</b> / <b>' + AN.ui.dinero(H.ctx.precio_venta) + '</b>'
            + ' &nbsp; Par <b>' + AN.ui.dinero(p ? p.costo : 0) + '</b> / <b>' + AN.ui.dinero(p ? p.venta : 0) + '</b>';
        $('anTotales').title = 'Costo directo / precio de venta del presupuesto (Pre) y de la partida seleccionada (Par)';
        var s = $('anSobrecosto');
        if (document.activeElement !== s) s.value = H.ctx.sobrecosto_pct;
        $('anHojaTitulo').textContent = H.ctx.codigo + ' · ' + H.ctx.nombre;
        document.title = H.ctx.codigo + ' · ' + H.ctx.nombre + ' · ACRINEO';
    }

    // ---------- Árbol ----------
    function oculta(p) {
        var padre = p.padre_id;
        while (padre) {
            if (H.cerrados[padre]) return true;
            var x = H.partidas.find(function (q) { return q.id === padre; });
            padre = x ? x.padre_id : null;
        }
        return false;
    }

    // Con el filtro de todo el presupuesto, solo las partidas con conceptos que coinciden (y sus padres)
    function porFiltro(p) { return !H.filtro.visibles || H.filtro.visibles.has(p.id); }
    function calcularVisibles() {
        if (!H.filtro.ids) { H.filtro.visibles = null; return; }
        var v = new Set(), buscar = function (id) { return H.partidas.find(function (q) { return q.id === id; }); };
        H.filtro.ids.forEach(function (id) {
            for (var x = buscar(id); x && !v.has(x.id); x = x.padre_id ? buscar(x.padre_id) : null) v.add(x.id);
        });
        H.filtro.visibles = v;
    }

    function filaEdicion(e, nivel) {
        return '<tr class="an-edicion"><td style="padding-left:' + (8 + nivel * 16) + 'px">'
            + '<input id="anPEdCodigo" maxlength="30" value="' + esc(e.codigo) + '" aria-label="Partida"></td>'
            + '<td colspan="3"><input id="anPEdDesc" maxlength="4000" value="' + esc(e.descripcion) + '" aria-label="Descripción completa"></td></tr>'
            + '<tr class="an-edicion-botones"><td colspan="4"><small>' + (e.modo === 'nueva' ? (e.padre_id ? 'Nueva subpartida' : 'Nueva partida') : 'Editando partida')
            + ' · Enter aplica, Esc cancela</small><button type="button" class="an-btn an-texto an-mini" id="anPEdCancelar">Cancelar</button>'
            + '<button type="button" class="an-btn an-primario an-mini" id="anPEdAplicar">Aplicar</button></td></tr>';
    }

    // Después de qué fila va la partida nueva: al final de los descendientes de su padre (o al final)
    function ultimaDe(padreId) {
        if (!padreId) return H.partidas.length ? H.partidas[H.partidas.length - 1].id : null;
        var i = H.partidas.findIndex(function (p) { return p.id === padreId; });
        var nivel = H.partidas[i].nivel, ultima = padreId;
        for (var k = i + 1; k < H.partidas.length && H.partidas[k].nivel > nivel; k++) ultima = H.partidas[k].id;
        return ultima;
    }

    function pintar() {
        pintarEncabezado();
        var e = H.edicion, html = '';
        var despues = e && e.modo === 'nueva' ? ultimaDe(e.padre_id) : null;
        var nivelNueva = 0;
        if (e && e.modo === 'nueva' && e.padre_id) {
            var padre = H.partidas.find(function (p) { return p.id === e.padre_id; });
            nivelNueva = padre ? padre.nivel + 1 : 0;
        }
        if (e && e.modo === 'nueva' && despues === null) html += filaEdicion(e, 0);
        H.partidas.forEach(function (p) {
            if (oculta(p) && !(e && e.modo === 'nueva' && e.padre_id === p.padre_id)) return;
            if (!porFiltro(p) && !(e && e.modo === 'editar' && e.partida_id === p.id)) return;
            if (e && e.modo === 'editar' && e.partida_id === p.id) {
                html += filaEdicion(e, p.nivel);
            } else {
                var toggle = p.hijos ? '<button type="button" data-plegar="' + p.id + '" class="' + (H.cerrados[p.id] ? 'cerrado' : '') + '" aria-label="'
                    + (H.cerrados[p.id] ? 'Mostrar' : 'Ocultar') + ' subpartidas">' + CHEVRON + '</button>' : '<span class="an-hueco"></span>';
                html += '<tr class="an-fila' + (p.id === H.sel ? ' sel' : '') + '" data-id="' + p.id + '" tabindex="0" aria-level="' + (p.nivel + 1) + '" aria-selected="' + (p.id === H.sel) + '">'
                    + '<td style="padding-left:' + (8 + p.nivel * 16) + 'px"><span class="an-sangria">' + toggle + esc(p.codigo) + '</span></td>'
                    + '<td title="' + esc(p.descripcion) + '">' + esc(p.descripcion) + '</td>'
                    + '<td class="num">' + AN.ui.dinero(p.costo) + '</td><td class="num">' + AN.ui.dinero(p.venta) + '</td></tr>';
            }
            if (despues === p.id) html += filaEdicion(e, nivelNueva);
        });
        if (!html && H.filtro.visibles && H.partidas.length) {
            html = '<tr class="an-vacio"><td colspan="4">Ninguna partida tiene conceptos que coincidan con «' + esc(H.filtro.q) + '».</td></tr>';
        } else if (!html) {
            html = '<tr class="an-vacio"><td colspan="4">El presupuesto todavía no tiene partidas.'
                + (puede ? '<br><button type="button" class="an-btn an-primario" data-primera>+ Agregar partida</button>' : '') + '</td></tr>';
        }
        tbody.innerHTML = html;
        $('anPartidasConteo').textContent = (H.filtro.visibles ? H.filtro.ids.size + ' de ' : '') + H.partidas.length + ' partida' + (H.partidas.length === 1 ? '' : 's');
        if (e) {
            var c = $('anPEdCodigo');
            if (c && !c.dataset.listo) { c.dataset.listo = '1'; (e.modo === 'nueva' ? $('anPEdDesc') : c).focus(); }
        }
        botones();
    }

    function botones() {
        if (!puede) return;
        var p = H.partida(), editando = !!H.edicion;
        $('anPartidaNueva').disabled = editando;
        $('anSubpartidaNueva').disabled = editando || !p;
        $('anPartidaEditar').disabled = editando || !p;
        $('anPartidaEliminar').disabled = editando || !p;
        $('anPartidaCopiar').disabled = editando || !p;
        document.querySelectorAll('[data-mover]').forEach(function (b) { b.disabled = editando || !p; });
    }

    // ---------- Edición de partidas ----------
    async function nueva(padreId) {
        if (H.edicion) return;
        try {
            var r = await AN.api.get(H.url({ recurso: 'codigo', padre: padreId || '' }));
            if (padreId) H.cerrados[padreId] = false;
            H.edicion = { modo: 'nueva', padre_id: padreId || null, codigo: r.codigo, descripcion: '' };
            pintar();
        } catch (e) { AN.ui.aviso(e.message, 'error'); }
    }

    function editar() {
        var p = H.partida();
        if (!p || H.edicion) return;
        H.edicion = { modo: 'editar', partida_id: p.id, codigo: p.codigo, descripcion: p.descripcion };
        pintar();
    }

    function cancelar() { H.edicion = null; pintar(); }

    async function aplicarEdicion() {
        var e = H.edicion;
        if (!e || e.guardando) return;
        e.codigo = $('anPEdCodigo').value.trim();
        e.descripcion = $('anPEdDesc').value.trim();
        $('anPEdCodigo').classList.toggle('invalido', !e.codigo);
        $('anPEdDesc').classList.toggle('invalido', !e.descripcion);
        if (!e.codigo || !e.descripcion) { AN.ui.aviso('La partida necesita código y descripción.', 'error'); return; }
        e.guardando = true;
        try {
            var r = await AN.api.post(H.url(), e.modo === 'nueva'
                ? { accion: 'partida_crear', padre_id: e.padre_id, codigo: e.codigo, descripcion: e.descripcion }
                : { accion: 'partida_guardar', partida_id: e.partida_id, codigo: e.codigo, descripcion: e.descripcion });
            H.edicion = null;
            var nuevaId = r.partida_id || e.partida_id;
            H.aplicar(r);
            await H.seleccionar(nuevaId);
            if (e.modo === 'nueva') AN.ui.aviso('Partida ' + e.codigo + ' agregada.', 'ok');
        } catch (err) {
            e.guardando = false;
            var errs = err.errores || {};
            if (errs.codigo) $('anPEdCodigo').classList.add('invalido');
            if (errs.descripcion) $('anPEdDesc').classList.add('invalido');
            AN.ui.aviso(errs.codigo || errs.descripcion || err.message, 'error');
        }
    }

    async function eliminar() {
        var p = H.partida();
        if (!p) return;
        var texto = '¿Eliminar la partida «' + p.codigo + ' · ' + p.descripcion + '»'
            + (p.hijos ? ' con sus subpartidas' : '') + ' y los conceptos que tiene?\nLos conceptos se quedan en el catálogo del presupuesto.';
        if (!(await AN.ui.confirmar({ titulo: 'Eliminar partida', mensaje: texto, aceptar: 'Eliminar', peligro: true }))) return;
        try {
            await H.post({ accion: 'partida_eliminar', partida_id: p.id });
            H.sel = null;
            pintar();
            H.emitir('partida', null);
            AN.ui.aviso('Partida eliminada.', 'ok');
        } catch (e) { AN.ui.aviso(e.message, 'error'); }
    }

    async function copiarPartida() {
        var p = H.partida();
        if (!p || H.edicion) return;
        if (H.renglonesPendientes()) { AN.ui.aviso('Guarda o cancela primero los cambios de los conceptos de la partida.', 'error'); return; }
        if (!(await AN.ui.confirmar({ titulo: 'Copiar partida', mensaje: '¿Copiar la partida «' + p.codigo + ' · ' + p.descripcion + '»'
            + (p.hijos ? ' con sus subpartidas' : '') + ' y sus conceptos?\nLa copia queda debajo de ella con el siguiente código libre.', aceptar: 'Copiar' }))) return;
        try {
            var r = await AN.api.post(H.url(), { accion: 'partida_duplicar', partida_id: p.id });
            H.aplicar(r);
            var nueva = H.partidas.find(function (x) { return x.id === r.partida_id; });
            await H.seleccionar(r.partida_id);
            AN.ui.aviso('Partida copiada como ' + (nueva ? nueva.codigo : '') + '.', 'ok');
        } catch (e) { AN.ui.aviso(e.message, 'error'); }
    }

    // ---------- Filtro de conceptos en todo el presupuesto ----------
    // Enter o el embudo lo aplica: los conceptos de la partida se filtran y, con «Todo el presupuesto», el árbol muestra solo
    // las partidas que tienen conceptos que coinciden. Vacío lo quita.
    async function aplicarFiltro() {
        var q = $('anFiltroQ').value.trim();
        H.filtro.q = q;
        H.filtro.ids = null;
        H.filtro.visibles = null;
        if (q && $('anFiltroTodo').checked) {
            try {
                var r = await AN.api.get(H.url({ recurso: 'filtrar', q: q }));
                if (H.filtro.q !== q) return;
                H.filtro.ids = new Set(r.partidas);
                calcularVisibles();
                if (!r.partidas.length) AN.ui.aviso('Ningún concepto del presupuesto coincide con «' + q + '».', 'info');
                else AN.ui.aviso(r.renglones + ' concepto' + (r.renglones === 1 ? '' : 's') + ' en ' + r.partidas.length + ' partida' + (r.partidas.length === 1 ? '' : 's') + '.', 'ok');
            } catch (e) { AN.ui.aviso(e.message, 'error'); return; }
        }
        $('anFiltroAplicar').setAttribute('aria-pressed', String(!!q));
        $('anFiltroAplicar').classList.toggle('an-primario', !!q);
        pintar();
        H.emitir('filtro', H.filtro);
        // Si la partida seleccionada no tiene coincidencias, se pasa a la primera que sí
        if (H.filtro.ids && H.filtro.ids.size && !H.filtro.ids.has(H.sel)) {
            var primera = H.partidas.find(function (p) { return H.filtro.ids.has(p.id); });
            if (primera) await H.seleccionar(primera.id);
        }
    }
    var refrescarFiltro = AN.ui.retrasar(async function () {
        if (!H.filtro.ids || !H.filtro.q) return;
        try {
            var r = await AN.api.get(H.url({ recurso: 'filtrar', q: H.filtro.q }));
            if (!H.filtro.ids) return;
            H.filtro.ids = new Set(r.partidas);
            calcularVisibles();
            pintar();
        } catch (e) { /* se queda el anterior */ }
    }, 300);

    async function mover(direccion) {
        var p = H.partida();
        if (!p) return;
        try { await H.post({ accion: 'partida_mover', partida_id: p.id, direccion: direccion }); }
        catch (e) { AN.ui.aviso(e.message, 'error'); }
    }

    // ---------- Eventos ----------
    tbody.addEventListener('click', function (e) {
        if (e.target.closest('[data-primera]')) { nueva(null); return; }
        if (e.target.id === 'anPEdAplicar') { aplicarEdicion(); return; }
        if (e.target.id === 'anPEdCancelar') { cancelar(); return; }
        var t = e.target.closest('[data-plegar]');
        if (t) { var id = +t.dataset.plegar; H.cerrados[id] = !H.cerrados[id]; pintar(); return; }
        var tr = e.target.closest('tr[data-id]');
        if (tr && !H.edicion) H.seleccionar(+tr.dataset.id);
    });
    tbody.addEventListener('dblclick', function (e) {
        var tr = e.target.closest('tr[data-id]');
        if (tr && puede && !H.edicion && +tr.dataset.id === H.sel) editar();
    });
    tbody.addEventListener('keydown', function (e) {
        if (e.target.id === 'anPEdCodigo' || e.target.id === 'anPEdDesc') {
            if (e.key === 'Enter') { e.preventDefault(); aplicarEdicion(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancelar(); }
            return;
        }
        var tr = e.target.closest('tr[data-id]');
        if (!tr || e.target !== tr) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            var sig = e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling;
            if (sig && sig.dataset.id) H.seleccionar(+sig.dataset.id).then(function () { var x = tbody.querySelector('tr[data-id="' + sig.dataset.id + '"]'); if (x) x.focus(); });
        } else if (e.key === 'F2' && puede) editar();
    });

    if (puede) {
        $('anPartidaNueva').addEventListener('click', function () { nueva(null); });
        $('anSubpartidaNueva').addEventListener('click', function () { if (H.sel) nueva(H.sel); });
        $('anPartidaEditar').addEventListener('click', editar);
        $('anPartidaEliminar').addEventListener('click', eliminar);
        $('anPartidaCopiar').addEventListener('click', copiarPartida);
        document.querySelectorAll('[data-mover]').forEach(function (b) { b.addEventListener('click', function () { mover(b.dataset.mover); }); });
    }

    $('anSobrecosto').addEventListener('change', async function () {
        var v = this.value.trim();
        try {
            await H.post({ accion: 'sobrecosto', sobrecosto_pct: v, partida_id: H.sel || 0 });
            AN.ui.aviso('% de sobrecosto guardado: los precios se recalcularon.', 'ok');
        } catch (e) {
            this.value = H.ctx.sobrecosto_pct;
            AN.ui.aviso((e.errores && e.errores.sobrecosto_pct) || e.message, 'error');
        }
    });

    $('anFiltroQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); aplicarFiltro(); } });
    $('anFiltroQ').addEventListener('input', function () { if (!this.value.trim() && H.filtro.q) aplicarFiltro(); });
    $('anFiltroAplicar').addEventListener('click', aplicarFiltro);
    $('anFiltroTodo').addEventListener('change', function () { if (H.filtro.q) aplicarFiltro(); });

    // Cuadrícula (arriba a la derecha): muestra u oculta el catálogo de conceptos de abajo
    function verCatalogo(si) {
        $('anPanelCatalogo').hidden = !si;
        $('anHojaDerecha').classList.toggle('sin-catalogo', !si);
        $('anVistaCatalogo').setAttribute('aria-pressed', String(si));
        $('anVistaCatalogo').classList.toggle('an-primario', si);
        $('anVistaCatalogo').title = si ? 'Ocultar el catálogo de conceptos' : 'Mostrar el catálogo de conceptos';
        try { localStorage.setItem('acrineo.hoja.catalogo', si ? '1' : '0'); } catch (e) { /* sin memoria */ }
    }
    var catalogoGuardado = null;
    try { catalogoGuardado = localStorage.getItem('acrineo.hoja.catalogo'); } catch (e) { /* sin memoria */ }
    verCatalogo(catalogoGuardado !== '0');
    $('anVistaCatalogo').addEventListener('click', function () { verCatalogo($('anPanelCatalogo').hidden); });

    // ⋮ del árbol de partidas
    if (AN.rejilla) AN.rejilla.opciones('partidas', {
        fijas: 1,
        archivo: function () { return 'Partidas ' + H.ctx.codigo; },
        extras: function () {
            var p = H.partida(), op = [
                { texto: 'Expandir todas', accion: function () { H.cerrados = {}; pintar(); } },
                { texto: 'Contraer todas', accion: function () { H.partidas.forEach(function (x) { if (x.hijos) H.cerrados[x.id] = true; }); pintar(); } }];
            if (puede) op.push(null,
                { texto: 'Nueva partida', accion: function () { nueva(null); }, desactivado: !!H.edicion },
                { texto: 'Nueva subpartida', accion: function () { if (H.sel) nueva(H.sel); }, desactivado: !!H.edicion || !p },
                { texto: 'Editar partida', accion: editar, desactivado: !!H.edicion || !p },
                { texto: 'Copiar partida', accion: copiarPartida, desactivado: !!H.edicion || !p });
            return op;
        }
    });
    H.editarPartida = editar;

    $('anHojaDetalle').addEventListener('click', function () {
        AN.detalle.abrir(H.id, { alGuardar: function () { H.recargar(); } });
    });

    // La ventana principal pregunta antes de cerrar la pestaña si hay cambios (js/principal.js)
    var anterior = window.acriHayCambios;
    var matrizSucia = function () { return !!(AN.hojaMatriz && AN.hojaMatriz.abierta()); };
    window.acriHayCambios = function () { return !!H.edicion || H.renglonesPendientes() || matrizSucia() || (anterior ? anterior() : false); };
    window.addEventListener('beforeunload', function (e) {
        if (H.edicion || H.renglonesPendientes() || matrizSucia()) { e.preventDefault(); e.returnValue = ''; }
    });

    // Carga inicial (después de que los otros módulos se registren)
    document.addEventListener('DOMContentLoaded', async function () {
        try {
            await H.recargar();
            if (H.partidas.length) await H.seleccionar(H.partidas[0].id);
            else H.emitir('partida', null);
        } catch (e) { AN.ui.aviso(e.message, 'error'); }
    });
})(window.AcriNeo = window.AcriNeo || {});
