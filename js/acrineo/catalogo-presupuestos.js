// ACRINEO · «Catálogo de presupuestos»: búsqueda general, filtros por columna (embudo), orden, paginación en el
// servidor (no se descargan todos los registros), selección de renglones y agrupación por Tipo.
// Doble clic o el botón de la columna URL abre el «Detalle del presupuesto».
(function (AN) {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    var cfg = window.ACRINEO || {};
    var puede = cfg.permisos || {};
    var tbody = $('anFilas');
    if (!tbody) return;
    var esc = AN.ui.esc;

    // Columnas: k (dato), t (título), orden, filtro (texto), num, media (se oculta en tableta)
    var COLUMNAS = [
        { k: 'sel' },
        { k: 'tipo', t: 'Tipo', orden: true, filtro: true, soloSinGrupo: true },
        { k: 'agrupador', t: 'Agrupador', orden: true, filtro: true, media: true },
        { k: 'organizacion', t: 'Organización', orden: true, filtro: true, media: true },
        { k: 'propietario', t: 'Propietario', orden: true, filtro: true, media: true },
        { k: 'url', t: 'URL' },
        { k: 'codigo', t: 'Código', orden: true, filtro: true },
        { k: 'nombre', t: 'Presupuesto', orden: true, filtro: true },
        { k: 'descripcion', t: 'Descripción', orden: true, filtro: true },
        { k: 'ciudad', t: 'Ciudad', orden: true, filtro: true, media: true },
        { k: 'sobrecosto_pct', t: '% Sobrecosto', orden: true, num: true, media: true },
        { k: 'costo_directo', t: 'Costo directo', orden: true, num: true },
        { k: 'precio_venta', t: 'Precio de venta', orden: true, num: true },
        { k: 'updated_at', t: 'Última modificación', orden: true },
        { k: 'estatus', t: 'Estatus', orden: true },
        { k: 'acciones', t: 'Acciones' }
    ];
    var ICONO = {
        arriba: '<svg class="i" viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
        abajo: '<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
        filtro: '<svg class="i" viewBox="0 0 24 24"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg>',
        chevron: '<svg class="i" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
        doc: '<svg class="i" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
        editar: '<svg class="i" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/></svg>',
        historial: '<svg class="i" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>',
        borrar: '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'
    };

    var st = {
        q: '', estatus: '', ciudad_id: '', filtros: {}, orden: 'updated_at', dir: 'desc', agrupar: true,
        pagina: 1, por_pagina: 50, filas: [], total: 0, paginas: 1, grupos: {}, cerrados: {},
        sel: new Set(), ancla: null, ctrl: null
    };

    // ---------- Datos ----------
    async function cargar(op) {
        op = op || {};
        if (st.ctrl) st.ctrl.abort();
        st.ctrl = new AbortController();
        $('anTablaCont').classList.add('an-cargando');
        var p = { q: st.q, estatus: st.estatus, ciudad_id: st.ciudad_id, orden: st.orden, dir: st.dir,
                  agrupar: st.agrupar ? 'tipo' : '', pagina: st.pagina, por_pagina: st.por_pagina };
        Object.keys(st.filtros).forEach(function (k) { p['f_' + k] = st.filtros[k]; });
        try {
            var r = await AN.api.get(AN.api.url(AN.api.PRESUPUESTOS, p), { signal: st.ctrl.signal });
            st.filas = r.filas;
            st.total = r.total;
            st.paginas = r.paginas;
            st.pagina = r.pagina;
            st.grupos = r.grupos || {};
            if (op.seleccionar) { st.sel = new Set([op.seleccionar]); st.ancla = op.seleccionar; }
            else {
                // La selección solo conserva lo que sigue en la página
                var ids = new Set(st.filas.map(function (f) { return f.id; }));
                st.sel = new Set(Array.from(st.sel).filter(function (id) { return ids.has(id); }));
            }
            pintar(op.seleccionar);
        } catch (e) {
            if (e.name === 'AbortError') return;
            tbody.innerHTML = '<tr class="an-vacio"><td colspan="' + COLUMNAS.length + '">' + esc(e.message) + '</td></tr>';
            AN.ui.aviso(e.message, 'error');
        } finally {
            $('anTablaCont').classList.remove('an-cargando');
        }
    }
    var cargarPronto = AN.ui.retrasar(function () { st.pagina = 1; cargar(); }, 300);

    // ---------- Pintar ----------
    function columnas() { return COLUMNAS.filter(function (c) { return !(c.soloSinGrupo && st.agrupar); }); }

    function pintarEncabezado() {
        $('anEncabezado').innerHTML = columnas().map(function (c) {
            if (c.k === 'sel') {
                var todas = st.filas.length && st.filas.every(function (f) { return st.sel.has(f.id); });
                return '<th class="an-col-sel" scope="col"><div class="an-th"><input type="checkbox" id="anSelTodas" aria-label="Seleccionar todos los de esta página"' + (todas ? ' checked' : '') + '></div></th>';
            }
            var activo = st.orden === c.k;
            var botones = '';
            if (c.orden) botones += '<button type="button" data-ordenar="' + c.k + '" class="' + (activo ? 'activo' : '') + '" title="Ordenar por ' + esc(c.t) + '" aria-label="Ordenar por ' + esc(c.t) + '">'
                + (activo && st.dir === 'asc' ? ICONO.arriba : activo ? ICONO.abajo : ICONO.arriba) + '</button>';
            if (c.filtro) botones += '<button type="button" data-filtrar="' + c.k + '" class="' + (st.filtros[c.k] ? 'activo' : '') + '" title="Filtrar ' + esc(c.t) + '" aria-label="Filtrar ' + esc(c.t) + '">' + ICONO.filtro + '</button>';
            var sort = activo ? ' aria-sort="' + (st.dir === 'asc' ? 'ascending' : 'descending') + '"' : '';
            return '<th scope="col" class="' + (c.num ? 'num ' : '') + (c.media ? 'an-col-media' : '') + '"' + sort + '><div class="an-th"><span>' + esc(c.t) + '</span>' + botones + '</div></th>';
        }).join('');
    }

    function celda(c, f) {
        switch (c.k) {
            case 'sel': return '<td class="an-col-sel"><input type="checkbox" data-sel="' + f.id + '" aria-label="Seleccionar ' + esc(f.nombre) + '"' + (st.sel.has(f.id) ? ' checked' : '') + '></td>';
            case 'url': return '<td><a class="an-btn-fila" href="acrineo-hoja.php?id=' + f.id + '" title="Abrir la hoja del presupuesto (partidas y conceptos)" aria-label="Abrir la hoja de ' + esc(f.nombre) + '">' + ICONO.doc + '</a></td>';
            case 'sobrecosto_pct': return '<td class="num an-col-media">' + AN.ui.pct(f.sobrecosto_pct) + '</td>';
            case 'costo_directo': case 'precio_venta': return '<td class="num">' + AN.ui.dinero(f[c.k]) + '</td>';
            case 'updated_at': return '<td>' + esc(AN.ui.fechaCorta(f.updated_at)) + '</td>';
            case 'estatus': return '<td><span class="an-estatus ' + esc(f.estatus) + '">' + esc(f.estatus_texto) + '</span></td>';
            case 'acciones':
                return '<td><span class="an-acciones">'
                    + '<button type="button" data-abrir="' + f.id + '" title="' + (puede['presupuestos.editar'] ? 'Editar el detalle' : 'Consultar el detalle') + '">' + ICONO.editar + '</button>'
                    + '<button type="button" data-historial="' + f.id + '" title="Historial">' + ICONO.historial + '</button>'
                    + (puede['presupuestos.eliminar'] ? '<button type="button" class="an-borrar" data-eliminar="' + f.id + '" title="Eliminar">' + ICONO.borrar + '</button>' : '')
                    + '</span></td>';
        }
        var v = f[c.k] == null ? '' : f[c.k];
        return '<td' + (c.media ? ' class="an-col-media"' : '') + ' title="' + esc(v) + '">' + esc(v) + '</td>';
    }

    function pintar(destacar) {
        pintarEncabezado();
        var cols = columnas();
        if (!st.filas.length) {
            var filtrado = st.q || st.estatus || st.ciudad_id || Object.keys(st.filtros).length;
            tbody.innerHTML = '<tr class="an-vacio"><td colspan="' + cols.length + '">'
                + (filtrado ? 'Ningún presupuesto coincide con los filtros.' : 'Todavía no hay presupuestos.' + (puede['presupuestos.crear'] ? ' Usa el botón NUEVO para crear el primero.' : ''))
                + '</td></tr>';
        } else {
            var html = '', grupo = null;
            st.filas.forEach(function (f) {
                if (st.agrupar && f.tipo !== grupo) {
                    grupo = f.tipo;
                    var cerrado = !!st.cerrados[grupo];
                    html += '<tr class="an-grupo' + (cerrado ? ' cerrado' : '') + '"><td colspan="' + cols.length + '"><button type="button" data-grupo="' + esc(grupo) + '" aria-expanded="' + !cerrado + '">'
                        + ICONO.chevron + ' Tipo: <b>' + esc(grupo) + '</b> <span class="an-cuenta">' + (st.grupos[grupo] || '') + '</span></button></td></tr>';
                }
                if (st.agrupar && st.cerrados[f.tipo]) return;
                html += '<tr class="an-fila' + (st.sel.has(f.id) ? ' sel' : '') + (destacar === f.id ? ' nuevo' : '') + '" data-id="' + f.id + '" tabindex="0" aria-selected="' + st.sel.has(f.id) + '">'
                    + cols.map(function (c) { return celda(c, f); }).join('') + '</tr>';
            });
            tbody.innerHTML = html;
        }
        if (destacar) {
            var tr = tbody.querySelector('tr[data-id="' + destacar + '"]');
            if (tr) tr.scrollIntoView({ block: 'center' });
        }
        pintarChips();
        pintarPie();
        actualizarBotones();
    }

    function pintarChips() {
        var html = '';
        html += st.agrupar
            ? '<span class="an-chip">Agrupar: <b>Tipo</b><button type="button" data-chip="agrupar" aria-label="Quitar agrupación" title="Quitar agrupación">×</button></span>'
            : '<button type="button" class="an-chip an-agregar" data-chip="agrupar">+ Agrupar por Tipo</button>';
        Object.keys(st.filtros).forEach(function (k) {
            var c = COLUMNAS.find(function (x) { return x.k === k; });
            html += '<span class="an-chip">' + esc(c ? c.t : k) + ': <b>' + esc(st.filtros[k]) + '</b><button type="button" data-chip="f:' + esc(k) + '" aria-label="Quitar filtro">×</button></span>';
        });
        $('anChips').innerHTML = html;
    }

    function pintarPie() {
        $('anConteo').innerHTML = '<b>' + st.total.toLocaleString('es-MX') + '</b> presupuesto' + (st.total === 1 ? '' : 's');
        $('anSeleccion').textContent = st.sel.size ? st.sel.size + ' seleccionado' + (st.sel.size === 1 ? '' : 's') : '';
        var p = st.pagina, n = st.paginas, html = '';
        function boton(num, texto, etiqueta, deshabilitado) {
            return '<button type="button" data-pagina="' + num + '"' + (num === p && !texto ? ' class="activa" aria-current="page"' : '')
                + (deshabilitado ? ' disabled' : '') + ' aria-label="' + etiqueta + '">' + (texto || num) + '</button>';
        }
        html += boton(1, '«', 'Primera página', p === 1) + boton(p - 1, '‹', 'Página anterior', p === 1);
        var desde = Math.max(1, p - 2), hasta = Math.min(n, desde + 4);
        desde = Math.max(1, hasta - 4);
        for (var i = desde; i <= hasta; i++) html += boton(i, '', 'Página ' + i, false);
        html += boton(p + 1, '›', 'Página siguiente', p === n) + boton(n, '»', 'Última página', p === n);
        $('anPaginas').innerHTML = html;
    }

    // Cambio de selección sin volver a dibujar la tabla (si se redibuja, el segundo clic de un doble clic cae
    // sobre otro renglón y el navegador ya no lo reconoce como doble clic)
    function pintarSeleccion() {
        tbody.querySelectorAll('tr[data-id]').forEach(function (tr) {
            var si = st.sel.has(+tr.dataset.id);
            tr.classList.toggle('sel', si);
            tr.setAttribute('aria-selected', String(si));
            var c = tr.querySelector('input[data-sel]');
            if (c) c.checked = si;
        });
        var todas = $('anSelTodas');
        if (todas) todas.checked = st.filas.length > 0 && st.filas.every(function (f) { return st.sel.has(f.id); });
        pintarPie();
        actualizarBotones();
    }

    function seleccionados() { return st.filas.filter(function (f) { return st.sel.has(f.id); }); }

    function actualizarBotones() {
        var n = st.sel.size;
        if ($('anCompartir')) $('anCompartir').disabled = n !== 1;
        if ($('anRespaldar')) $('anRespaldar').disabled = n === 0;
        var m = $('anMenuMas');
        m.querySelector('[data-menu="abrir"]').disabled = n !== 1;
        m.querySelector('[data-menu="historial"]').disabled = n !== 1;
        var el = m.querySelector('[data-menu="eliminar"]');
        if (el) el.disabled = n === 0;
    }

    // ---------- Acciones ----------
    function abrirDetalle(id) {
        AN.detalle.abrir(id, {
            alGuardar: function (nuevoId) { cargar({ seleccionar: nuevoId }); }
        });
    }

    async function eliminar(ids) {
        var filas = st.filas.filter(function (f) { return ids.indexOf(f.id) >= 0; });
        var texto = filas.length === 1 ? '¿Eliminar el presupuesto «' + filas[0].nombre + '»?' : '¿Eliminar los ' + ids.length + ' presupuestos seleccionados?';
        if (!(await AN.ui.confirmar({ titulo: 'Eliminar presupuesto', mensaje: texto + '\nQueda registrado en el historial.', aceptar: 'Eliminar', peligro: true }))) return;
        try {
            var r = await AN.api.del(AN.api.url(AN.api.PRESUPUESTOS, ids.length === 1 ? { id: ids[0] } : { ids: ids.join(',') }));
            AN.ui.aviso(r.eliminados === 1 ? 'Presupuesto eliminado.' : r.eliminados + ' presupuestos eliminados.', 'ok');
            ids.forEach(function (id) { st.sel.delete(id); });
            cargar();
        } catch (e) {
            AN.ui.aviso(e.message, 'error');
        }
    }

    async function historial(id) {
        var dlg = $('anHistorial');
        var f = st.filas.find(function (x) { return x.id === id; });
        $('anHistorialTitulo').textContent = 'Historial · ' + (f ? f.codigo + ' · ' + f.nombre : '#' + id);
        var filas = $('anHistorialFilas');
        filas.innerHTML = '<tr class="an-vacio"><td colspan="7">Cargando…</td></tr>';
        dlg.showModal();
        try {
            var r = await AN.api.get(AN.api.url(AN.api.PRESUPUESTOS, { id: id, recurso: 'historial' }));
            filas.innerHTML = r.historial.map(function (h) {
                return '<tr class="an-fila"><td>' + esc(AN.ui.fechaCorta(h.fecha)) + ' ' + esc((h.fecha || '').slice(16)) + '</td><td>' + esc(h.usuario) + '</td>'
                    + '<td>' + esc(h.accion_texto) + '</td><td>' + esc(h.campo) + '</td><td>' + esc(h.valor_anterior) + '</td>'
                    + '<td>' + esc(h.valor_nuevo) + '</td><td>' + esc(h.ip) + '</td></tr>';
            }).join('') || '<tr class="an-vacio"><td colspan="7">Sin movimientos.</td></tr>';
        } catch (e) {
            filas.innerHTML = '<tr class="an-vacio"><td colspan="7">' + esc(e.message) + '</td></tr>';
        }
    }

    function compartir() {
        var f = seleccionados()[0];
        if (!f) return;
        var dlg = $('anCompartirDlg');
        var url = new URL('acrineo-presupuestos.php?id=' + f.id, window.location.href).href;
        $('anCompartirNombre').textContent = f.codigo + ' · ' + f.nombre;
        $('anCompartirUrl').value = url;
        $('anCompartirEstado').textContent = '';
        dlg.showModal();
        $('anCompartirUrl').select();
    }

    async function respaldar() {
        var ids = Array.from(st.sel);
        if (!ids.length) return;
        try {
            var b = await AN.api.blob(AN.api.url(AN.api.PRESUPUESTOS, { recurso: 'respaldo', ids: ids.join(',') }));
            var a = document.createElement('a');
            a.href = URL.createObjectURL(b);
            a.download = 'acrineo-respaldo-' + AN.ui.hoy() + '.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
            AN.ui.aviso('Respaldo descargado (' + ids.length + ' presupuesto' + (ids.length === 1 ? '' : 's') + ').', 'ok');
        } catch (e) {
            AN.ui.aviso(e.message, 'error');
        }
    }

    function limpiarFiltros() {
        st.q = st.estatus = st.ciudad_id = '';
        st.filtros = {};
        $('anBuscar').value = '';
        $('anEstatus').value = '';
        $('anCiudad').value = '';
        st.pagina = 1;
        cargar();
    }

    // Filtro de una columna (embudo)
    var pop = null;
    function cerrarPop() { if (pop) { pop.remove(); pop = null; } }
    function abrirFiltro(k, boton) {
        cerrarPop();
        var c = COLUMNAS.find(function (x) { return x.k === k; });
        pop = document.createElement('form');
        pop.className = 'an-pop';
        pop.innerHTML = '<label for="anPopTxt">Filtrar «' + esc(c.t) + '» que contenga:</label><input id="anPopTxt" type="text" maxlength="100" value="' + esc(st.filtros[k] || '') + '">'
            + '<div class="an-pop-botones"><button type="button" class="an-btn an-mini" data-pop="quitar">Quitar</button><button type="submit" class="an-btn an-mini an-primario">Filtrar</button></div>';
        document.body.appendChild(pop);
        var r = boton.getBoundingClientRect();
        pop.style.top = Math.min(window.innerHeight - pop.offsetHeight - 8, r.bottom + 4) + 'px';
        pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left - 200)) + 'px';
        var txt = pop.querySelector('input');
        txt.focus();
        txt.select();
        pop.addEventListener('submit', function (e) {
            e.preventDefault();
            var v = txt.value.trim();
            if (v) st.filtros[k] = v; else delete st.filtros[k];
            cerrarPop();
            st.pagina = 1;
            cargar();
        });
        pop.querySelector('[data-pop="quitar"]').addEventListener('click', function () {
            delete st.filtros[k];
            cerrarPop();
            st.pagina = 1;
            cargar();
        });
        pop.addEventListener('keydown', function (e) { if (e.key === 'Escape') { cerrarPop(); boton.focus(); } });
    }
    document.addEventListener('mousedown', function (e) { if (pop && !pop.contains(e.target) && !e.target.closest('[data-filtrar]')) cerrarPop(); });

    // ---------- Eventos ----------
    $('anBuscar').addEventListener('input', function () { st.q = this.value.trim(); cargarPronto(); });
    $('anEstatus').addEventListener('change', function () { st.estatus = this.value; st.pagina = 1; cargar(); });
    $('anCiudad').addEventListener('change', function () { st.ciudad_id = this.value; st.pagina = 1; cargar(); });
    $('anPorPagina').addEventListener('change', function () { st.por_pagina = +this.value; st.pagina = 1; cargar(); });
    if ($('anNuevo')) $('anNuevo').addEventListener('click', function () { abrirDetalle(0); });
    if ($('anCompartir')) $('anCompartir').addEventListener('click', compartir);
    if ($('anRespaldar')) $('anRespaldar').addEventListener('click', respaldar);

    $('anCompartirCopiar').addEventListener('click', async function () {
        var txt = $('anCompartirUrl');
        try {
            await navigator.clipboard.writeText(txt.value);
            $('anCompartirEstado').textContent = 'Enlace copiado.';
            $('anCompartirEstado').className = 'an-estado ok';
        } catch (e) {
            txt.select();
            $('anCompartirEstado').textContent = 'Cópialo con Ctrl+C.';
            $('anCompartirEstado').className = 'an-estado info';
        }
    });
    ['anCompartirDlg', 'anHistorial'].forEach(function (id) { AN.ui.cerrables($(id)); });

    // Menú «más opciones»
    var btnMas = $('anMas'), menu = $('anMenuMas');
    function menuAbierto(si) { menu.hidden = !si; btnMas.setAttribute('aria-expanded', String(si)); }
    btnMas.addEventListener('click', function () { menuAbierto(menu.hidden); });
    document.addEventListener('click', function (e) { if (!e.target.closest('.an-menu-cont')) menuAbierto(false); });
    menu.addEventListener('click', function (e) {
        var b = e.target.closest('[data-menu]');
        if (!b || b.disabled) return;
        menuAbierto(false);
        var una = seleccionados()[0];
        switch (b.dataset.menu) {
            case 'abrir': if (una) abrirDetalle(una.id); break;
            case 'historial': if (una) historial(una.id); break;
            case 'eliminar': eliminar(Array.from(st.sel)); break;
            case 'limpiar': limpiarFiltros(); break;
            case 'refrescar': cargar(); break;
        }
    });

    $('anChips').addEventListener('click', function (e) {
        var b = e.target.closest('[data-chip]');
        if (!b) return;
        if (b.dataset.chip === 'agrupar') st.agrupar = !st.agrupar;
        else delete st.filtros[b.dataset.chip.slice(2)];
        st.pagina = 1;
        cargar();
    });

    $('anEncabezado').addEventListener('click', function (e) {
        var o = e.target.closest('[data-ordenar]');
        if (o) {
            var k = o.dataset.ordenar;
            if (st.orden === k) st.dir = st.dir === 'asc' ? 'desc' : 'asc';
            else { st.orden = k; st.dir = /^(sobrecosto_pct|costo_directo|precio_venta|updated_at)$/.test(k) ? 'desc' : 'asc'; }
            st.pagina = 1;
            cargar();
            return;
        }
        var f = e.target.closest('[data-filtrar]');
        if (f) abrirFiltro(f.dataset.filtrar, f);
    });
    $('anEncabezado').addEventListener('change', function (e) {
        if (e.target.id !== 'anSelTodas') return;
        st.filas.forEach(function (f) { if (e.target.checked) st.sel.add(f.id); else st.sel.delete(f.id); });
        pintarSeleccion();
    });
    $('anPaginas').addEventListener('click', function (e) {
        var b = e.target.closest('[data-pagina]');
        if (!b || b.disabled) return;
        st.pagina = Math.max(1, Math.min(st.paginas, +b.dataset.pagina));
        cargar();
    });

    tbody.addEventListener('click', function (e) {
        var g = e.target.closest('[data-grupo]');
        if (g) { st.cerrados[g.dataset.grupo] = !st.cerrados[g.dataset.grupo]; pintar(); return; }
        if (e.target.closest('a.an-btn-fila')) return;   // abre la hoja (enlace)
        var b = e.target.closest('[data-abrir], [data-historial], [data-eliminar]');
        if (b) {
            if (b.dataset.abrir) abrirDetalle(+b.dataset.abrir);
            else if (b.dataset.historial) historial(+b.dataset.historial);
            else eliminar([+b.dataset.eliminar]);
            return;
        }
        var tr = e.target.closest('tr[data-id]');
        if (!tr) return;
        var id = +tr.dataset.id;
        var check = e.target.matches('input[data-sel]');
        if (e.shiftKey && st.ancla != null) {
            // Rango desde el último seleccionado
            var ids = st.filas.map(function (f) { return f.id; });
            var a = ids.indexOf(st.ancla), z = ids.indexOf(id);
            if (a >= 0 && z >= 0) ids.slice(Math.min(a, z), Math.max(a, z) + 1).forEach(function (x) { st.sel.add(x); });
        } else if (check || e.ctrlKey || e.metaKey) {
            if (st.sel.has(id)) st.sel.delete(id); else st.sel.add(id);
            st.ancla = id;
        } else {
            st.sel = new Set([id]);
            st.ancla = id;
        }
        pintarSeleccion();
        if (!check) tr.focus();
    });
    tbody.addEventListener('dblclick', function (e) {
        var tr = e.target.closest('tr[data-id]');
        if (tr && !e.target.closest('button, input')) abrirDetalle(+tr.dataset.id);
    });
    tbody.addEventListener('keydown', function (e) {
        var tr = e.target.closest('tr[data-id]');
        if (!tr || e.target !== tr) return;
        if (e.key === 'Enter') { e.preventDefault(); abrirDetalle(+tr.dataset.id); }
        else if (e.key === ' ') { e.preventDefault(); tr.click(); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            var sig = e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling;
            while (sig && !sig.dataset.id) sig = e.key === 'ArrowDown' ? sig.nextElementSibling : sig.previousElementSibling;
            if (sig) sig.click();
        } else if (e.key === 'Delete' && puede['presupuestos.eliminar']) {
            eliminar([+tr.dataset.id]);
        }
    });

    // Ciudades del filtro (solo las del catálogo; carga una vez)
    (async function () {
        try {
            var r = await AN.api.get(AN.api.url(AN.api.CATALOGOS, { catalogo: 'ciudades', por_pagina: 500 }));
            $('anCiudad').insertAdjacentHTML('beforeend', r.items.map(function (c) {
                return '<option value="' + c.id + '">' + esc(c.nombre) + (c.extra ? ', ' + esc(c.extra) : '') + '</option>';
            }).join(''));
        } catch (e) { /* el filtro de ciudad queda vacío; el resto funciona */ }
    })();

    cargar().then(function () {
        if (cfg.abrir) abrirDetalle(cfg.abrir);
    });
})(window.AcriNeo = window.AcriNeo || {});
