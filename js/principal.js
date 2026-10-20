(function () {
    var $ = function (id) { return document.getElementById(id); };
    var barra = $('pestanas');
    var paneles = $('paneles');
    var menu = $('menu');
    var movil = window.matchMedia('(max-width: 800px)');

    // Módulos que ya tienen formulario de captura
    var formularios = {
        'Presupuestos de Obra': { url: 'presupuesto.php', titulo: 'Presupuesto de Obra' },
        'Obras':                { url: 'obra.php',        titulo: 'Registro de Obra' },
        'Contrato de Obra':     { url: 'contrato-obra.php', titulo: 'Contrato de Obra' },
        'Estimaciones de Obra': { url: 'estimaciones-obra.php', titulo: 'Estimaciones de Obra' }
    };

    // Módulos que ya leen datos reales
    //   api: listado · fecha: se consulta por periodo · filtros: columnas con filtro de valores
    //   ficha: tipo de ficha (js/fichas.js) que abren «Nuevo» y el doble clic
    var fuentes = {
        'Presupuestos de Obra': { api: 'api/obras.php?accion=presupuestos', fecha: true, origen: 'AW-Management' },
        'Obras':                { api: 'api/obras.php?accion=obras',        fecha: true, origen: 'AW-Management' },
        'Clientes':             { api: 'api/clientes.php?accion=listar', ficha: 'clientes', filtros: ['CIUDAD', 'VENDEDOR'], origen: 'Supabase' },
        'Vendedores de Obra':   { api: 'api/catalogos.php?tipo=vendedores&accion=listar', ficha: 'vendedores', filtros: ['ESTATUS'], origen: 'AW-Management' },
        'Empleados':            { api: 'api/catalogos.php?tipo=empleados&accion=listar', ficha: 'empleados', filtros: ['TIPO_EMPLEADO', 'ESTATUS'], origen: 'AW-Management' },
        'Tipos de Empleados':   { api: 'api/catalogos.php?tipo=tipos&accion=listar', ficha: 'tipos', filtros: [], origen: 'AW-Management' },
        'Insumos':              { api: 'api/insumos.php?accion=listar', ficha: 'insumos', filtros: ['TIPO', 'UNIDAD', 'FAMILIA', 'ESTATUS'], origen: 'Supabase' },
        'Conceptos P.U.':       { api: 'api/conceptos-pu.php?accion=listar', ficha: 'conceptos_pu', filtros: ['UNIDAD', 'FAMILIA', 'ESTATUS'], origen: 'Supabase' },
        'Plantillas de presupuesto': { api: 'api/plantillas.php?accion=listar', ficha: 'plantillas', filtros: ['ESTATUS'], origen: 'Supabase' }
    };

    function pendiente() { alert('Función pendiente: se activará al conectar la base de datos.'); }

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function pedirDatos(accion, ini, fin) {
        return pedirUrl('api/obras.php?accion=' + accion + '&ini=' + ini + '&fin=' + fin);
    }
    function pedirUrl(url) {
        return fetch(url).then(function (r) {
            if (r.status === 401) { location.href = 'index.php'; throw new Error('Sesión expirada'); }
            return r.json().catch(function () { throw new Error('Respuesta no válida del servidor (HTTP ' + r.status + ').'); });
        }).then(function (j) {
            if (!j.ok) throw new Error(j.error);
            return j;
        });
    }

    function guardarLocal(clave, valor) { try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) {} }
    function leerLocal(clave, defecto) {
        try { var v = JSON.parse(localStorage.getItem(clave)); return v === null ? defecto : v; } catch (e) { return defecto; }
    }

    function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
    function dmy(s) { var p = s.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }

    // ----- Periodos de los filtros de fecha -----
    var PERIODOS = [
        ['hoy', 'Hoy'], ['ayer', 'Ayer'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['mes_ant', 'Mes pasado'],
        ['d30', 'Últimos 30 días'], ['d90', 'Últimos 90 días'], ['anio', 'Este año'], ['anio_ant', 'Año pasado'],
        ['todo', 'Cualquier fecha'], ['rango', 'Personalizado…']
    ];
    function rangoPeriodo(clave, ini, fin) {
        var h = new Date(), y = h.getFullYear(), m = h.getMonth(), d = h.getDate();
        function f(a, b, c) { return iso(new Date(a, b, c)); }
        switch (clave) {
            case 'hoy':      return [f(y, m, d), f(y, m, d)];
            case 'ayer':     return [f(y, m, d - 1), f(y, m, d - 1)];
            case 'semana':   return [f(y, m, d - (h.getDay() + 6) % 7), f(y, m, d)];
            case 'mes_ant':  return [f(y, m - 1, 1), f(y, m, 0)];
            case 'd30':      return [f(y, m, d - 29), f(y, m, d)];
            case 'd90':      return [f(y, m, d - 89), f(y, m, d)];
            case 'anio':     return [f(y, 0, 1), f(y, m, d)];
            case 'anio_ant': return [f(y - 1, 0, 1), f(y - 1, 11, 31)];
            case 'todo':     return ['1900-01-01', '2999-12-31'];
            case 'rango':    if (ini && fin) return [ini, fin];
        }
        return [f(y, m, 1), f(y, m, d)];   // este mes
    }
    function nombrePeriodo(clave, ini, fin) {
        if (clave === 'rango' && ini && fin) return dmy(ini) + ' – ' + dmy(fin);
        for (var i = 0; i < PERIODOS.length; i++) if (PERIODOS[i][0] === clave) return PERIODOS[i][1];
        return 'Este mes';
    }

    // ----- Desplegable de los filtros (uno solo para toda la página) -----
    var pop = document.createElement('div');
    pop.className = 'fx-pop';
    pop.hidden = true;
    document.body.appendChild(pop);
    var popChip = null;

    function abrirPop(chip, llenar) {
        if (popChip === chip) { cerrarPop(); return; }
        cerrarPop();
        popChip = chip;
        chip.classList.add('abierto');
        pop.innerHTML = '';
        llenar(pop);
        pop.hidden = false;
        var r = chip.getBoundingClientRect();
        pop.style.top = (r.bottom + 4) + 'px';
        pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
        var buscar = pop.querySelector('.fx-buscar');
        if (buscar) buscar.focus();
    }
    function cerrarPop() {
        pop.hidden = true;
        if (popChip) popChip.classList.remove('abierto');
        popChip = null;
    }
    document.addEventListener('mousedown', function (e) {
        if (popChip && !pop.contains(e.target) && !popChip.contains(e.target)) cerrarPop();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarPop(); });
    window.addEventListener('resize', cerrarPop);

    // ================= Pestañas internas =================
    var pestanas = {};   // id => { boton, panel, iframe, item, recargar }
    var orden = [];
    var activa = null;
    var consecutivoDoc = 0;

    function abrirPestana(id, titulo, op) {
        if (pestanas[id]) { activar(id); return pestanas[id]; }
        op = op || {};

        var boton = document.createElement('div');
        boton.className = 'pestana';
        boton.innerHTML = '<span class="p-titulo"></span>' +
            '<button class="p-btn p-recargar" title="Recargar">↻</button>' +
            '<button class="p-btn p-cerrar" title="Cerrar">✕</button>';
        boton.querySelector('.p-titulo').textContent = titulo;
        barra.appendChild(boton);

        var panel = op.panel;
        if (!panel) {
            panel = document.createElement('section');
            panel.className = 'panel';
            paneles.appendChild(panel);
        }

        var p = { id: id, boton: boton, panel: panel, item: op.item || null, recargar: op.recargar || null };

        if (op.url) {
            panel.classList.add('con-iframe');
            p.iframe = document.createElement('iframe');
            if (op.oscuro) p.iframe.className = 'oscuro';
            p.iframe.src = op.url;
            panel.appendChild(p.iframe);
            p.recargar = function () { p.iframe.contentWindow.location.reload(); };
        } else if (p.recargar) {
            p.recargar(p);
        }

        boton.addEventListener('click', function (e) {
            if (e.target.closest('.p-cerrar')) return cerrarPestana(id);
            if (e.target.closest('.p-recargar')) { if (p.recargar) p.recargar(p); return; }
            activar(id);
        });
        boton.addEventListener('auxclick', function (e) { if (e.button === 1) cerrarPestana(id); });

        pestanas[id] = p;
        orden.push(id);
        activar(id);
        return p;
    }

    function activar(id) {
        cerrarPop();
        orden.forEach(function (k) {
            pestanas[k].boton.classList.toggle('activa', k === id);
            pestanas[k].panel.classList.toggle('activo', k === id);
        });
        activa = id;
        var p = pestanas[id];
        p.boton.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        document.querySelectorAll('.item[data-id]').forEach(function (it) {
            it.classList.toggle('activo', !!p.item && it.dataset.id === p.item);
        });
    }

    function cerrarPestana(id, sinPreguntar) {
        var p = pestanas[id];
        if (!p) return;
        cerrarPop();
        if (!sinPreguntar && p.iframe) {
            var w = p.iframe.contentWindow;
            if (w && w.acriHayCambios && w.acriHayCambios() &&
                !confirm('Hay cambios sin guardar en "' + p.boton.querySelector('.p-titulo').textContent + '". ¿Cerrar de todos modos?')) {
                return;
            }
        }
        var pos = orden.indexOf(id);
        orden.splice(pos, 1);
        p.boton.remove();
        if (id === 'bienvenido') p.panel.classList.remove('activo');   // el panel de inicio se conserva
        else p.panel.remove();
        delete pestanas[id];

        if (activa === id) {
            activa = null;
            var sig = orden[pos] || orden[pos - 1];
            if (sig) activar(sig);
            else document.querySelectorAll('.item.activo').forEach(function (it) { it.classList.remove('activo'); });
        }
    }

    function renombrar(id, titulo) {
        if (pestanas[id]) pestanas[id].boton.querySelector('.p-titulo').textContent = titulo;
    }

    function abrirBienvenido() {
        abrirPestana('bienvenido', 'Bienvenido', { panel: $('panel-bienvenido') });
    }
    abrirBienvenido();
    // La marca de la barra superior vuelve a Bienvenido
    document.querySelector('.marca').addEventListener('click', abrirBienvenido);

    // ================= Abrir opciones del menú =================
    function itemPorId(id) { return menu.querySelector('.grupo[data-grupo] .item[data-id="' + id + '"], .item.suelto[data-id="' + id + '"]'); }

    function abrirItem(it) {
        var d = it.dataset;
        if (d.tipo === 'modulo') {
            var p = abrirPestana('mod-' + d.id, d.nombre, {
                item: d.id,
                recargar: function (p) { dibujarListado(p.panel, d.nombre, JSON.parse(d.columnas || '[]')); }
            });
        } else if (d.tipo === 'pagina') {
            abrirPestana('pag-' + d.id, d.nombre, { item: d.id, url: d.url, oscuro: true });
        } else {
            pendiente();
        }
        if (movil.matches) document.body.classList.remove('sb-movil');
    }

    function fechaDMY(v) {
        return /^\d{4}-\d{2}-\d{2}/.test(v || '') ? v.substr(8, 2) + '/' + v.substr(5, 2) + '/' + v.substr(0, 4) : (v == null ? '' : v);
    }

    function dibujarListado(panel, nombre, columnas) {
        if (!columnas.length) columnas = ['ID', 'FOLIO', 'FECHA', 'DESCRIPCION'];
        var f = formularios[nombre];
        var fuente = fuentes[nombre];
        var ficha = fuente && fuente.ficha;
        var conFecha = !!(fuente && fuente.fecha);
        var datos = [];   // filas recibidas del servidor

        // Filtros: fecha (se consulta al servidor) y valores de columna (se filtran aquí)
        var filtrables = fuente && fuente.filtros ? fuente.filtros
            : columnas.filter(function (c) { return c !== 'FOLIO' && c !== 'FECHA' && !/_ID$|^(IMPORTE|COSTO)$/.test(c); });
        var claveF = 'acri_filtros_' + window.ACRI.usuario + '_' + nombre;
        var est = leerLocal(claveF, {});
        if (!est.fecha) est.fecha = 'mes';
        if (!est.sel) est.sel = {};
        function guardarFiltros() { guardarLocal(claveF, est); }
        function rango() { return rangoPeriodo(est.fecha, est.ini, est.fin); }
        function nombreCol(c) { return c.charAt(0) + c.slice(1).toLowerCase(); }

        cerrarPop();
        var encabezado = columnas.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('');
        panel.innerHTML =
            '<div class="listado">' +
            '<h1 class="l-titulo"></h1>' +
            '<div class="l-barra">' +
            '<button class="btn-borde" data-l="excel">📗 Exportar a Excel</button>' +
            '<button class="btn-borde" data-l="excel-sel">📗 Exportar seleccionados</button>' +
            '<button class="btn-borde" data-l="consultar">🔎 Consultar</button>' +
            (f || ficha ? '<button class="btn-azul" data-l="nuevo">＋ Nuevo</button>' : '') +
            (fuente ? '<div class="l-filtros">' +
                (conFecha ? '<button class="chip" data-f="FECHA"><span></span><i>▼</i></button>' : '') +
                filtrables.map(function (c) { return '<button class="chip" data-f="' + esc(c) + '"><span></span><i>▼</i></button>'; }).join('') +
                '<button class="l-limpiar" data-l="limpiar" hidden>Limpiar filtros</button>' +
                '</div>' : '') +
            '<input type="search" placeholder="Filtrar…" data-l="filtro">' +
            '</div>' +
            '<div class="l-tabla"><table class="grid"><thead><tr>' + encabezado + '</tr></thead><tbody></tbody></table></div>' +
            '<p class="nota"></p>' +
            '</div>';
        panel.querySelector('.l-titulo').textContent = nombre;
        var tbody = panel.querySelector('tbody');
        var filtro = panel.querySelector('[data-l="filtro"]');
        var nota = panel.querySelector('.nota');

        function valor(fila, col) {
            var v = fila[col.toLowerCase()];
            return col === 'FECHA' ? fechaDMY(v) : (v == null ? '' : v);
        }
        function visibles() {
            var q = filtro.value.trim().toLowerCase();
            return datos.filter(function (r) {
                return filtrables.every(function (c) {
                    var s = est.sel[c];
                    return !s || !s.length || s.indexOf(String(valor(r, c))) >= 0;
                }) && (!q || columnas.some(function (c) { return String(valor(r, c)).toLowerCase().indexOf(q) >= 0; }));
            });
        }
        function pintarFiltros() {
            if (!fuente) return;
            var hay = conFecha && est.fecha !== 'mes';
            panel.querySelectorAll('.chip').forEach(function (ch) {
                var c = ch.dataset.f, texto, activo;
                if (c === 'FECHA') {
                    texto = 'Fecha: ' + nombrePeriodo(est.fecha, est.ini, est.fin);
                    activo = est.fecha !== 'mes';
                } else {
                    var s = est.sel[c] || [];
                    activo = s.length > 0;
                    texto = nombreCol(c) + (!activo ? '' : ': ' + (s.length === 1 ? (s[0] || '(Sin valor)') : s.length + ' seleccionados'));
                }
                if (activo) hay = true;
                ch.querySelector('span').textContent = texto;
                ch.title = texto;
                ch.classList.toggle('activo', activo);
            });
            panel.querySelector('[data-l="limpiar"]').hidden = !hay;
        }
        function pintar() {
            pintarFiltros();
            var filas = visibles();
            if (!fuente) {
                var vacia = '<tr>' + columnas.map(function () { return '<td>&nbsp;</td>'; }).join('') + '</tr>';
                tbody.innerHTML = new Array(15).join(vacia);
                nota.innerHTML = 'Boceto · sin datos todavía.' + (f ? ' Presiona <b>Nuevo</b> para capturar uno.' : '');
                return;
            }
            tbody.innerHTML = filas.length ? filas.map(function (r) {
                return '<tr data-i="' + datos.indexOf(r) + '">' + columnas.map(function (c) {
                    return '<td>' + esc(valor(r, c)) + '</td>';
                }).join('') + '</tr>';
            }).join('') : '<tr><td colspan="' + columnas.length + '">' + (datos.length ? 'Nada coincide con el filtro.' : 'Sin registros en el periodo.') + '</td></tr>';
            var r = rango();
            nota.textContent = filas.length + ' de ' + datos.length + ' registros · ' +
                (!conFecha ? '' : (est.fecha === 'todo' ? 'cualquier fecha' : 'periodo ' + dmy(r[0]) + ' al ' + dmy(r[1])) + ' · ') + fuente.origen +
                (ficha && filas.length ? ' · doble clic para abrir la ficha' : '');
        }
        function consultar() {
            if (!fuente) { pintar(); return; }
            pintarFiltros();
            nota.textContent = 'Consultando…';
            var r = rango();
            pedirUrl(fuente.api + (conFecha ? '&ini=' + r[0] + '&fin=' + r[1] : '')).then(function (j) { datos = j.filas; pintar(); })
                .catch(function (err) { datos = []; pintar(); nota.textContent = '⚠ ' + err.message; });
        }
        // Para refrescar el listado cuando se guarda algo en otra pestaña
        panel.acriConsultar = consultar;

        // Desplegable de fecha: periodos rápidos o rango personalizado
        function popFecha(chip) {
            abrirPop(chip, function (pop) {
                var r = rango();
                pop.innerHTML = '<div class="fx-lista">' + PERIODOS.map(function (p) {
                    return '<label class="fx-op"><input type="radio" name="fx-fecha" value="' + p[0] + '"' +
                        (est.fecha === p[0] ? ' checked' : '') + '><span>' + esc(p[1]) + '</span></label>';
                }).join('') + '</div>' +
                    '<div class="fx-rango"' + (est.fecha === 'rango' ? '' : ' hidden') + '>' +
                    '<input type="date" data-x="ini" value="' + (est.fecha === 'todo' ? '' : r[0]) + '">' +
                    '<span>al</span>' +
                    '<input type="date" data-x="fin" value="' + (est.fecha === 'todo' ? '' : r[1]) + '">' +
                    '<button class="btn-azul" data-x="aplicar">Aplicar</button></div>';
                var caja = pop.querySelector('.fx-rango');
                pop.querySelector('.fx-lista').addEventListener('change', function (e) {
                    if (e.target.value === 'rango') { caja.hidden = false; caja.querySelector('input').focus(); return; }
                    est.fecha = e.target.value;
                    guardarFiltros();
                    cerrarPop();
                    consultar();
                });
                pop.querySelector('[data-x="aplicar"]').addEventListener('click', function () {
                    var ini = caja.querySelector('[data-x="ini"]').value, fin = caja.querySelector('[data-x="fin"]').value;
                    if (!ini || !fin) { alert('Captura la fecha inicial y la final.'); return; }
                    if (ini > fin) { alert('La fecha inicial no puede ser mayor que la final.'); return; }
                    est.fecha = 'rango'; est.ini = ini; est.fin = fin;
                    guardarFiltros();
                    cerrarPop();
                    consultar();
                });
            });
        }

        // Desplegable de valores de una columna: selección múltiple con buscador
        function popValores(chip, col) {
            abrirPop(chip, function (pop) {
                var sel = est.sel[col] || [];
                var cuenta = {};
                sel.forEach(function (v) { cuenta[v] = 0; });   // lo seleccionado se muestra aunque no venga en el periodo
                datos.forEach(function (r) { var v = String(valor(r, col)); cuenta[v] = (cuenta[v] || 0) + 1; });
                var vals = Object.keys(cuenta).sort(function (a, b) { return a.localeCompare(b, 'es'); });
                pop.innerHTML = '<input type="search" class="fx-buscar" placeholder="Buscar ' + esc(nombreCol(col).toLowerCase()) + '…">' +
                    '<div class="fx-lista">' + (vals.length ? vals.map(function (v) {
                        return '<label class="fx-op"><input type="checkbox" value="' + esc(v) + '"' + (sel.indexOf(v) >= 0 ? ' checked' : '') + '>' +
                            '<span>' + esc(v || '(Sin valor)') + '</span><small>' + cuenta[v] + '</small></label>';
                    }).join('') : '<div class="fx-vacio">Sin valores en el periodo.</div>') + '</div>' +
                    '<div class="fx-pie"><button data-x="quitar">Quitar selección</button></div>';
                var lista = pop.querySelector('.fx-lista');
                function aplicar() {
                    est.sel[col] = Array.prototype.map.call(lista.querySelectorAll('input:checked'), function (i) { return i.value; });
                    guardarFiltros();
                    pintar();
                }
                lista.addEventListener('change', aplicar);
                pop.querySelector('.fx-buscar').addEventListener('input', function () {
                    var q = normalizar(this.value.trim());
                    lista.querySelectorAll('.fx-op').forEach(function (l) { l.hidden = normalizar(l.querySelector('span').textContent).indexOf(q) < 0; });
                });
                pop.querySelector('[data-x="quitar"]').addEventListener('click', function () {
                    lista.querySelectorAll('input:checked').forEach(function (i) { i.checked = false; });
                    aplicar();
                });
            });
        }

        function limpiarFiltros() {
            var cambiaFecha = conFecha && est.fecha !== 'mes';
            est = { fecha: 'mes', sel: {} };
            guardarFiltros();
            if (cambiaFecha) consultar(); else pintar();
        }

        // Exporta a CSV (Excel lo abre directo)
        function exportar(soloSel) {
            if (!fuente) { pendiente(); return; }
            var filas = soloSel
                ? Array.prototype.map.call(tbody.querySelectorAll('tr.sel[data-i]'), function (tr) { return datos[tr.dataset.i]; })
                : visibles();
            if (!filas.length) { alert(soloSel ? 'Selecciona primero los renglones a exportar.' : 'No hay registros para exportar.'); return; }
            var csv = [columnas].concat(filas.map(function (r) { return columnas.map(function (c) { return valor(r, c); }); }))
                .map(function (fila) { return fila.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); })
                .join('\r\n');
            var a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
            var r = rango();
            a.download = nombre.replace(/\s+/g, '_') + (!conFecha || est.fecha === 'todo' ? '' : '_' + r[0] + '_' + r[1]) + '.csv';
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        }

        panel.querySelector('.l-barra').addEventListener('click', function (e) {
            var b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.f) { if (b.dataset.f === 'FECHA') popFecha(b); else popValores(b, b.dataset.f); return; }
            var accion = b.dataset.l;
            if (accion === 'limpiar') limpiarFiltros();
            else if (accion === 'nuevo') { if (ficha) Fichas.abrir(ficha, 0, consultar); else abrirFormulario(nombre); }
            else if (accion === 'consultar') consultar();
            else if (accion === 'excel') exportar(false);
            else if (accion === 'excel-sel') exportar(true);
        });
        filtro.addEventListener('input', pintar);
        tbody.addEventListener('click', function (e) {
            var tr = e.target.closest('tr[data-i]') || (!fuente && e.target.closest('tr'));
            if (tr) tr.classList.toggle('sel');
        });
        tbody.addEventListener('dblclick', function (e) {
            var tr = e.target.closest('tr[data-i]');
            if (ficha) { if (tr) Fichas.abrir(ficha, datos[tr.dataset.i].id, consultar); return; }
            if (!f) return;
            if (!fuente) { abrirFormulario(nombre); return; }
            if (!tr) return;
            var r = datos[tr.dataset.i];
            if (nombre === 'Obras') abrirFormulario(nombre, r.obra_id, 'Obra ' + (r.folio || r.obra_id));
            else abrirFormulario(nombre, r.docto_sugerido_obra_id, 'Presupuesto ' + (r.folio || r.docto_sugerido_obra_id));
        });

        consultar();
    }

    // id = registro existente; sin id = nuevo
    function abrirFormulario(modulo, id, titulo) {
        var f = formularios[modulo];
        if (!f) return;
        var pid;
        if (id) {
            pid = 'doc-' + f.url + '-' + id;
        } else {
            consecutivoDoc++;
            pid = 'doc-' + consecutivoDoc;
            titulo = f.titulo + ' (Nuevo ' + consecutivoDoc + ')';
        }
        var it = menu.querySelector('.grupo[data-grupo] .item[data-nombre="' + modulo + '"]');
        abrirPestana(pid, titulo, {
            url: f.url + '?pestana=' + encodeURIComponent(pid) + (id ? '&id=' + encodeURIComponent(id) : ''),
            item: it ? it.dataset.id : null
        });
    }

    // ----- Indicadores de Bienvenido -----
    function cargarIndicadores() {
        var tarjetas = document.querySelectorAll('.tarjeta[data-indicador]');
        if (!tarjetas.length) return;
        var r = rangoPeriodo('mes');
        pedirDatos('resumen', r[0], r[1]).then(function (j) {
            tarjetas.forEach(function (t) {
                t.querySelector('.t-valor').textContent = j[t.dataset.indicador];
                t.querySelector('.t-nota').textContent = t.dataset.indicador === 'obras_en_proceso' ? 'En planificación o ejecución' : 'En el mes actual';
            });
        }).catch(function (err) {
            tarjetas.forEach(function (t) { t.querySelector('.t-nota').textContent = '⚠ ' + err.message; });
        });
    }

    // Enlaces de las tarjetas de Bienvenido
    document.querySelectorAll('[data-abrir]').forEach(function (a) {
        a.addEventListener('click', function (e) {
            e.preventDefault();
            var it = itemPorId(a.dataset.abrir);
            if (it) abrirItem(it);
        });
    });

    // ================= Menú lateral =================
    menu.addEventListener('click', function (e) {
        var titulo = e.target.closest('.grupo-titulo');
        if (titulo) { titulo.parentElement.classList.toggle('abierto'); return; }

        var estrella = e.target.closest('.i-estrella');
        var it = e.target.closest('.item');
        if (!it) return;
        // Los accesos de Favoritos apuntan al original
        if (it.dataset.ref) it = itemPorId(it.dataset.ref);

        if (estrella) { alternarFavorito(it.dataset.id); return; }
        abrirItem(it);
    });
    menu.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target.classList.contains('item')) e.target.click();
    });

    // ----- Favoritos -----
    var claveFav = 'acri_favoritos_' + window.ACRI.usuario;
    var favoritos = leerLocal(claveFav, ['presupuestos-de-obra']);

    function alternarFavorito(id) {
        var i = favoritos.indexOf(id);
        if (i >= 0) favoritos.splice(i, 1); else favoritos.push(id);
        guardarLocal(claveFav, favoritos);
        pintarFavoritos();
    }

    function pintarFavoritos() {
        var cont = $('itemsFavoritos');
        cont.innerHTML = '';
        menu.querySelectorAll('.grupo[data-grupo] .item').forEach(function (it) {
            it.classList.toggle('favorito', favoritos.indexOf(it.dataset.id) >= 0);
        });
        favoritos.forEach(function (id) {
            var orig = itemPorId(id);
            if (!orig) return;
            var copia = orig.cloneNode(true);
            copia.removeAttribute('data-id');
            copia.dataset.ref = id;
            copia.classList.remove('activo');
            copia.querySelector('.i-estrella').title = 'Quitar de favoritos';
            cont.appendChild(copia);
        });
        $('grupoFavoritos').hidden = !cont.children.length;
    }
    pintarFavoritos();

    $('btnFavoritos').addEventListener('click', function () {
        if (!favoritos.length) { alert('Marca con ★ las opciones del menú que más uses.'); return; }
        document.body.classList.remove('sb-oculto');
        if (movil.matches) document.body.classList.add('sb-movil');
        $('grupoFavoritos').classList.add('abierto');
        menu.scrollTop = 0;
    });

    // ----- Buscador del menú -----
    var buscador = $('buscador'), txtBuscar = $('txtBuscar');
    $('btnBuscar').addEventListener('click', function () {
        buscador.classList.toggle('abierto');
        if (buscador.classList.contains('abierto')) txtBuscar.focus();
        else { txtBuscar.value = ''; filtrarMenu(''); }
    });
    txtBuscar.addEventListener('input', function () { filtrarMenu(this.value); });
    txtBuscar.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            var primero = menu.querySelector('.grupo[data-grupo] .item:not(.oculto)');
            if (primero) abrirItem(primero);
        }
        if (e.key === 'Escape') { this.value = ''; filtrarMenu(''); buscador.classList.remove('abierto'); }
    });

    function normalizar(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
    function filtrarMenu(texto) {
        var q = normalizar(texto.trim());
        menu.classList.toggle('buscando', q !== '');
        menu.querySelectorAll('.grupo').forEach(function (g) {
            var visibles = 0;
            g.querySelectorAll('.item').forEach(function (it) {
                var ok = normalizar(it.dataset.nombre).indexOf(q) >= 0;
                it.classList.toggle('oculto', !ok);
                if (ok) visibles++;
            });
            g.classList.toggle('oculto', !visibles);
        });
        if (q) {
            document.body.classList.remove('sb-oculto');
            if (movil.matches) document.body.classList.add('sb-movil');
        }
    }

    // ----- Mostrar / ocultar menú -----
    $('btnMenu').addEventListener('click', function () {
        if (movil.matches) document.body.classList.toggle('sb-movil');
        else document.body.classList.toggle('sb-oculto');
    });
    $('velo').addEventListener('click', function () { document.body.classList.remove('sb-movil'); });

    // ================= Barra superior =================
    var mes = rangoPeriodo('mes');
    $('txtPeriodo').textContent = 'Periodo: este mes (' + dmy(mes[0]) + ' al ' + dmy(mes[1]) + ')';
    cargarIndicadores();

    $('btnPantalla').addEventListener('click', function () {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    });
    $('btnAvisos').addEventListener('click', pendiente);

    // ----- Panel de usuario -----
    var panelU = $('panelUsuario');
    $('btnUsuario').addEventListener('click', function (e) {
        e.stopPropagation();
        panelU.hidden = !panelU.hidden;
    });
    document.addEventListener('click', function (e) {
        if (!panelU.hidden && !panelU.contains(e.target)) panelU.hidden = true;
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') panelU.hidden = true; });

    // Ctrl + I: agregar en la pestaña activa (como el KeyDown de los grids en VB)
    document.addEventListener('keydown', function (e) {
        if (!e.ctrlKey || (e.key !== 'i' && e.key !== 'I')) return;
        var p = activa && pestanas[activa];
        var w = p && p.iframe && p.iframe.contentWindow;
        if (!w || !w.acriAgregar) return;
        e.preventDefault();
        p.iframe.focus();
        w.acriAgregar();
    });
    $('btnEditarUsuario').addEventListener('click', pendiente);

    // Cuenta regresiva de la sesión
    var fin = Date.now() + parseInt($('reloj').dataset.restante, 10) * 1000;
    function tic() {
        var s = Math.max(0, Math.round((fin - Date.now()) / 1000));
        $('rH').textContent = Math.floor(s / 3600);
        $('rM').textContent = Math.floor(s % 3600 / 60);
        $('rS').textContent = s % 60;
        $('reloj').classList.toggle('poco', s < 600);
        if (s === 0) { location.href = 'logout.php'; return; }
        setTimeout(tic, 1000);
    }
    tic();

    // ================= Mensajes desde las pestañas (iframes) =================
    window.addEventListener('message', function (e) {
        if (e.origin !== location.origin || !e.data) return;
        var id = null;
        orden.forEach(function (k) {
            if (pestanas[k].iframe && pestanas[k].iframe.contentWindow === e.source) id = k;
        });
        if (!id) return;

        if (e.data.tipo === 'cerrar') cerrarPestana(id, true);
        // Presupuesto u obra guardados: se refrescan los listados abiertos
        if (e.data.tipo === 'guardado') refrescarListados(['Presupuestos de Obra', 'Obras']);
        // Abrir otro documento desde una pestaña (p. ej. la obra recién registrada desde el presupuesto)
        if (e.data.tipo === 'abrir' && formularios[e.data.modulo] && e.data.id) {
            refrescarListados(['Presupuestos de Obra', 'Obras']);
            abrirFormulario(e.data.modulo, e.data.id, e.data.titulo);
        }
        if (e.data.tipo === 'titulo') renombrar(id, e.data.texto);
        if (e.data.tipo === 'imagenes') aplicarImagenes(e.data.imagenes);
    });

    function refrescarListados(modulos) {
        modulos.forEach(function (m) {
            var it = menu.querySelector('.grupo[data-grupo] .item[data-nombre="' + m + '"]');
            var p = it && pestanas['mod-' + it.dataset.id];
            if (p && p.panel.acriConsultar) p.panel.acriConsultar();
        });
    }

    // Actualiza logo y favicon al momento cuando se cambian en Imagen del Sistema
    function aplicarImagenes(img) {
        if (!img) return;
        if (img.logo) $('logoSistema').src = img.logo.url;
        if (img.favicon) $('favicon').href = img.favicon.url;
    }

    window.addEventListener('beforeunload', function (e) {
        var hay = orden.some(function (k) {
            var w = pestanas[k].iframe && pestanas[k].iframe.contentWindow;
            return w && w.acriHayCambios && w.acriHayCambios();
        });
        if (hay) { e.preventDefault(); e.returnValue = ''; }
    });
})();
