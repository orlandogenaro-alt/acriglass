// ACRINEO · Pestaña «Matriz» de la hoja: matriz de precio unitario de un concepto, con sus insumos por unidad del
// concepto (materiales, mano de obra, equipo, herramienta, básicos u otros) y, abajo, el catálogo de insumos del
// sistema (con su costo vigente; la mano de obra ya con su FSR). «% de M.O.» / «% de materiales» para herramienta
// menor, seguridad, etc. GUARDAR pone el costo directo del concepto = total de la matriz (en todas sus partidas).
// El cálculo en pantalla es el mismo que acrineoCalcularMatriz() del servidor, que vuelve a calcular al guardar.
// Se abre con doble clic en un concepto de la partida o con su botón P.U.; la × de la pestaña la cierra.
// Lápiz = edición (igual que los conceptos de la partida): ↶ / ↷ (Ctrl+Z / Ctrl+Y), GUARDAR, CANCELAR y quitar los
// marcados. Copiar del catálogo o agregar un renglón libre entran solos a edición.
(function (AN) {
    'use strict';

    var H = AN.hoja;
    var panel = document.getElementById('anMatriz');
    if (!H || !panel) return;
    var $ = function (id) { return document.getElementById(id); };
    var esc = AN.ui.esc;
    var tbody = $('anMatrizFilas');
    var cuerpoCat = $('anInsumosFilas');
    var COLS = 11;
    var ETIQUETAS = { tipo: 'Tipo', codigo: 'Código', descripcion: 'Descripción completa', unidad: 'Unidad', costo: 'Costo', cantidad: 'Cantidad', desperdicio_pct: '% Desp.' };
    var TIPOS = { MAT: 'Materiales', MO: 'Mano de obra', EQ: 'Equipo y maquinaria', HER: 'Herramienta', BAS: 'Básicos', OTR: 'Otros' };
    var BASES = { '': 'Por unidad', pct_mo: '% de M.O.', pct_mat: '% de materiales' };
    var CAMPOS = ['tipo', 'codigo', 'descripcion', 'unidad', 'base', 'cantidad', 'desperdicio_pct', 'costo'];
    // Tipos con número, como en Neodata (1 materiales, 2 mano de obra, 3 equipo y herramienta, 4 básicos, 5 otros).
    // Solo en pantalla: por dentro se siguen guardando MAT, MO, EQ, HER, BAS y OTR (los comparte el catálogo de insumos).
    var NUM_TIPO = { MAT: '1', MO: '2', EQ: '3', HER: '3', BAS: '4', OTR: '5' };
    var TIPO_NUM = { 1: 'MAT', 2: 'MO', 3: 'EQ', 4: 'BAS', 5: 'OTR' };
    function tipoTexto(t) { return NUM_TIPO[t] || t || ''; }
    function tipoDe(v) { v = String(v || '').trim().toUpperCase(); return TIPO_NUM[v] || v; }
    function tipoCelda(t) { return '<span class="an-tipo an-tipo-' + esc(t) + '" title="' + esc(TIPOS[t] || t) + '">' + esc(tipoTexto(t)) + '</span>'; }
    var ICONO_URL = '<svg class="i" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
    var LUPA = '<svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

    var st = { concepto: null, filas: [], guardadas: '[]', original: '', sec: 0, marcados: new Set(), guardando: false, abierta: false,
               editando: false, deshacer: [], rehacer: [], fotoPendiente: null, padre: null, ruta: [] };
    // Portapapeles de renglones de matriz de ACRINEO (Copiar / Pegar renglones entre conceptos)
    var PORTA = 'acrineo.matriz.renglones';
    function portapapeles() { try { return JSON.parse(localStorage.getItem(PORTA)) || null; } catch (e) { return null; } }
    var cat = { items: [], total: 0, pagina: 1, marcados: new Map(), cargado: false, ctrl: null, fuente: 'catalogo' };
    try { if (localStorage.getItem('acrineo.matriz.fuente') === 'explosion') cat.fuente = 'explosion'; } catch (e) { /* sin memoria */ }
    // Clave de un insumo del panel de abajo: del catálogo, su insumo_id; de la explosión, la que manda el servidor
    function claveIns(i) { return i.clave || String(i.insumo_id); }

    function nueva(datos) {
        var f = { clave: 'm' + (++st.sec), insumo_id: null, tipo: 'MAT', codigo: '', descripcion: '', unidad: '', base: '', cantidad: '1', desperdicio_pct: '0', costo: '0' };
        Object.keys(datos || {}).forEach(function (k) { if (datos[k] !== null && datos[k] !== undefined) f[k] = typeof datos[k] === 'number' ? String(datos[k]) : datos[k]; });
        return f;
    }
    function limpia(f) { var o = { insumo_id: f.insumo_id, matriz_id: f.matriz_id || null }; CAMPOS.forEach(function (k) { o[k] = String(f[k] == null ? '' : f[k]).trim(); }); return o; }
    function huella() { return JSON.stringify(st.filas.map(limpia)); }
    function sucio() { return H.puede && st.abierta && huella() !== st.original; }
    function editable() { return H.puede && st.editando; }

    // ---------- Pestañas Presupuesto / Matriz ----------
    function verPestana(matriz) {
        $('anHoja').hidden = matriz;
        panel.hidden = !matriz;
        $('anTabPresupuesto').setAttribute('aria-selected', String(!matriz));
        $('anTabMatriz').setAttribute('aria-selected', String(matriz));
        if (matriz && !cat.cargado) cargarCatalogo();
    }
    function mostrarMatriz() {
        st.abierta = true;
        $('anTabMatrizCont').hidden = false;
        verPestana(true);
    }
    function ocultarMatriz() {
        st.abierta = false;
        st.editando = false;
        st.concepto = null;
        st.filas = [];
        st.original = huella();
        panel.classList.remove('con-cambios');
        $('anTabMatriz').classList.remove('con-cambios');
        $('anTabMatrizCont').hidden = true;
        verPestana(false);
    }

    // ---------- Cálculo (igual que acrineoCalcularMatriz()) ----------
    function calcular() {
        var d = H.ctx.dec_costos, base = { MO: 0, MAT: 0 }, tot = {}, total = 0;
        Object.keys(TIPOS).forEach(function (t) { tot[t] = 0; });
        st.filas.forEach(function (f) {
            if (f.base) return;
            f._importe = H.redondear(Number(f.cantidad) * (1 + Number(f.desperdicio_pct || 0) / 100) * Number(f.costo), d);
            if (base[f.tipo] !== undefined) base[f.tipo] += f._importe;
        });
        st.filas.forEach(function (f) {
            if (f.base) {
                var sobre = f.base === 'pct_mo' ? base.MO : base.MAT;
                f._base = H.redondear(sobre, d);
                f._importe = H.redondear(Number(f.cantidad) / 100 * sobre, d);
            }
            tot[f.tipo] = (tot[f.tipo] || 0) + (f._importe || 0);
        });
        Object.keys(tot).forEach(function (t) { tot[t] = H.redondear(tot[t], d); total += tot[t]; });
        return { totales: tot, total: H.redondear(total, d) };
    }

    // ---------- Deshacer / rehacer ----------
    function foto() { return JSON.stringify({ f: st.filas, s: st.sec }); }
    function guardarFoto(f) {
        st.deshacer.push(f || foto());
        if (st.deshacer.length > 100) st.deshacer.shift();
        st.rehacer = [];
        botones();
    }
    function restaurar(f) {
        var o = JSON.parse(f);
        st.filas = o.f;
        st.sec = o.s;
        st.marcados.clear();
        st.fotoPendiente = null;
        calcular();
        pintar();
    }
    function deshacer() { if (!st.deshacer.length) return; st.rehacer.push(foto()); restaurar(st.deshacer.pop()); }
    function rehacer() { if (!st.rehacer.length) return; st.deshacer.push(foto()); restaurar(st.rehacer.pop()); }

    // ---------- Pintar la matriz ----------
    function coincide(f, q) {
        if (!q) return true;
        return AN.ui.coincide([f.codigo, f.descripcion, f.unidad, TIPOS[f.tipo]], q, AN.ui.modo($('anMatrizQ')));
    }
    function cantidadTexto(n) { return (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 6 }); }

    function pintar() {
        var ed = editable();
        var q = $('anMatrizQ').value.trim().toLowerCase();
        var html = '';
        st.filas.forEach(function (f, n) {
            if (!coincide(f, q)) return;
            var celdas;
            if (ed) {
                var sel = function (k, opciones) {
                    return '<select class="an-celda-in" data-k="' + k + '" aria-label="' + k + '">' + Object.keys(opciones).map(function (o) {
                        return '<option value="' + o + '"' + (String(f[k] || '') === o ? ' selected' : '') + '>' + esc(opciones[o]) + '</option>';
                    }).join('') + '</select>';
                };
                var inp = function (k, tipo, extra, cls) { return '<input class="an-celda-in' + (tipo === 'number' ? ' num' : '') + (cls ? ' ' + cls : '') + '" type="' + tipo + '" data-k="' + k + '" value="' + esc(f[k]) + '"' + (extra || '') + ' placeholder="' + ETIQUETAS[k] + '" aria-label="' + ETIQUETAS[k] + '">'; };
                celdas = '<td>' + inp('codigo', 'text', ' maxlength="30"') + '</td>'
                    + '<td class="an-desc">' + inp('descripcion', 'text', ' maxlength="250"') + '</td>'
                    + '<td><span class="an-celda-unidad"><input class="an-celda-in' + (TIPOS[f.tipo] ? '' : ' invalido') + '" type="text" data-k="tipo" value="' + esc(tipoTexto(f.tipo)) + '" maxlength="3" title="' + esc(TIPOS[f.tipo] || 'Tipo no válido') + '" placeholder="Tipo" aria-label="Tipo">'
                    + '<button type="button" class="an-btn-buscar" data-tipo-insumo title="Catálogo Tipos de insumos" aria-label="Buscar en el catálogo de tipos de insumos">' + LUPA + '</button></span></td>'
                    + '<td><span class="an-celda-unidad">' + inp('unidad', 'text', ' maxlength="20"')
                    + '<button type="button" class="an-btn-buscar" data-unidad title="Catálogo Unidades" aria-label="Buscar en el catálogo de unidades">' + LUPA + '</button></span></td>'
                    + '<td>' + (f.base ? '<span class="an-ayuda" title="Base sobre la que se aplica el %">' + AN.ui.dinero(f._base) + '</span>'
                        : f.hijos ? '<span class="an-ayuda" title="Sale de su matriz (doble clic en el renglón)">' + AN.ui.dinero(f.costo) + '</span>'
                        : inp('costo', 'number', ' min="0" step="any"')) + '</td>'
                    + '<td>' + sel('base', BASES) + '</td>'
                    + '<td>' + inp('cantidad', 'number', ' min="0" step="any"' + (f.base ? ' title="Porcentaje"' : '')) + '</td>'
                    + '<td>' + inp('desperdicio_pct', 'number', ' min="0" max="99.9999" step="any"' + (f.base ? ' readonly tabindex="-1"' : '')) + '</td>';
            } else {
                celdas = '<td>' + esc(f.codigo) + '</td><td class="an-desc">' + esc(f.descripcion) + '</td>'
                    + '<td>' + tipoCelda(f.tipo) + '</td><td>' + esc(f.unidad) + '</td>'
                    + '<td class="num">' + AN.ui.dinero(f.base ? f._base : f.costo) + '</td><td>' + esc(BASES[f.base || '']) + '</td>'
                    + '<td class="num">' + cantidadTexto(f.cantidad) + (f.base ? ' %' : '') + '</td><td class="num">' + cantidadTexto(f.desperdicio_pct) + '</td>';
            }
            html += '<tr class="an-fila' + (f.insumo_id ? '' : ' an-libre') + '" data-clave="' + f.clave + '">'
                + '<td class="an-col-sel">' + (ed ? '<input type="checkbox" data-marcar="' + f.clave + '"' + (st.marcados.has(f.clave) ? ' checked' : '') + ' aria-label="Marcar">' : '') + '</td>'
                + '<td class="num an-col-n">' + (n + 1) + (f.insumo_id ? '' : '<span class="an-insignia" title="Renglón libre (no está en el catálogo)">L</span>')
                + (f.hijos ? '<span class="an-insignia an-insignia-m" title="Tiene su propia matriz (doble clic para abrirla)">M</span>' : '') + '</td>'
                + celdas + '<td class="num" data-importe>' + AN.ui.dinero(f._importe) + '</td></tr>';
        });
        if (html && ed) {
            html += '<tr class="an-matriz-acciones"><td colspan="' + COLS + '">'
                + '<button type="button" class="an-btn-texto" data-cancelar>Cancelar</button>'
                + '<button type="button" class="an-btn-texto" data-aplicar' + (sucio() && !st.guardando ? '' : ' disabled') + '>Aplicar</button></td></tr>';
        }
        if (!html) {
            html = '<tr class="an-vacio' + (ed && !st.filas.length ? ' an-vacio-grande' : '') + '"><td colspan="' + COLS + '">' + (st.filas.length ? 'Ningún insumo coincide con el filtro.'
                : ed ? 'La cuadrícula no tiene datos.<br><button type="button" class="an-btn an-mini an-primario an-agregar-registro" data-agregar-registro title="Alt+N">Agregar registro</button>'
                : 'La cuadrícula no tiene datos: el costo del concepto es el que se captura en la hoja.'
                  + (H.puede ? '<br><small class="an-ayuda">Copia insumos del catálogo de abajo (marca y pon la «Cantidad a copiar», luego ➤) o agrega un renglón libre; al guardar, el costo directo saldrá de la matriz.</small>' : '')) + '</td></tr>';
        }
        tbody.innerHTML = html;
        $('anMatrizConteo').textContent = st.filas.length;
        if ($('anMatrizTodos')) { $('anMatrizTodos').disabled = !ed; $('anMatrizTodos').checked = false; }
        pintarTotales();
    }

    function pintarTotales() {
        var c = calcular();
        var partes = Object.keys(TIPOS).filter(function (t) { return c.totales[t]; }).map(function (t) { return TIPOS[t] + ' <b>' + AN.ui.dinero(c.totales[t]) + '</b>'; });
        var precio = st.concepto && st.concepto.precio_alzado ? 'P.A. (precio fijo)' : 'Precio <b>' + AN.ui.dinero(H.precio(c.total)) + '</b>';
        $('anMatrizTotales').innerHTML = (partes.length ? '<span>' + partes.join(' · ') + '</span>' : '')
            + '<span class="an-cd">Σ Costo directo <b>' + AN.ui.dinero(c.total) + '</b> · ' + precio + '</span>';
        st.filas.forEach(function (f) {
            var tr = tbody.querySelector('tr[data-clave="' + f.clave + '"]');
            if (tr) tr.querySelector('[data-importe]').textContent = AN.ui.dinero(f._importe);
        });
        botones();
    }

    function botones() {
        var s = sucio(), ed = editable();
        panel.classList.toggle('con-cambios', s);
        $('anTabMatriz').classList.toggle('con-cambios', s);
        $('anMatrizCopiarRen').disabled = !st.filas.length;
        $('anMatrizCopiarRen').querySelector('span').textContent = st.marcados.size ? 'Copiar marcados (' + st.marcados.size + ')' : 'Copiar renglones';
        if (!H.puede) return;
        var pp = ((portapapeles() || {}).filas || []).length;
        $('anMatrizPegarRen').disabled = !st.concepto || !pp;
        $('anMatrizPegarRen').querySelector('span').textContent = 'Pegar renglones' + (pp ? ' (' + pp + ')' : '');
        $('anMatrizEditar').setAttribute('aria-pressed', String(ed));
        $('anMatrizEditar').title = ed ? 'Salir de la edición' : 'Editar la matriz';
        $('anMatrizGuardar').disabled = $('anMatrizGuardarCab').disabled = st.guardando || !s;
        var aplicar = tbody.querySelector('[data-aplicar]');
        if (aplicar) aplicar.disabled = st.guardando || !s;
        $('anMatrizCancelar').disabled = !ed;
        $('anMatrizQuitar').disabled = !ed || !st.marcados.size;
        $('anMatrizDeshacer').disabled = !ed || !st.deshacer.length;
        $('anMatrizRehacer').disabled = !ed || !st.rehacer.length;
        $('anMatrizEditar').disabled = !st.concepto;
        $('anMatrizLibre').disabled = $('anMatrizActualizar').disabled = $('anMatrizAjustar').disabled = !st.concepto;
        var b = $('anInsumosCopiar');
        b.disabled = !st.concepto || !cat.marcados.size;
        b.lastChild.textContent = ' Copiar a la matriz' + (cat.marcados.size ? ' (' + cat.marcados.size + ')' : '');
    }

    function estado(t, tipo) { var e = $('anMatrizEstado'); e.textContent = t || ''; e.className = 'an-estado' + (tipo ? ' ' + tipo : ''); }

    // ---------- Cargar / editar / guardar ----------
    function cargar(r) {
        if (r.tipos) TIPOS = r.tipos;
        st.concepto = r.concepto;
        st.filas = r.filas.map(function (f) {
            return nueva({ matriz_id: f.matriz_id, hijos: f.hijos || null, insumo_id: f.insumo_id, tipo: f.tipo, codigo: f.codigo || '', descripcion: f.descripcion, unidad: f.unidad || '', base: f.base || '',
                           cantidad: f.cantidad, desperdicio_pct: f.desperdicio_pct, costo: f.base ? 0 : f.costo });
        });
        st.marcados.clear();
        st.editando = false;
        st.deshacer = [];
        st.rehacer = [];
        calcular();
        st.original = huella();
        st.guardadas = JSON.stringify(st.filas);
        var c = r.concepto;
        $('anMatrizPendiente').checked = !!c.pendiente_analizar;
        $('anMatrizPendiente').disabled = !H.puede;
        st.padre = r.padre_id || null;
        st.ruta = r.ruta || [];
        st.submatriz = !!r.submatriz;
        var ult = st.ruta[st.ruta.length - 1];
        $('anMatrizTitulo').textContent = 'Código: ' + [c.codigo].concat(st.ruta.map(function (x) { return x.codigo || x.descripcion; })).join(' -> ')
            + ' | Unidad: ' + ((ult ? ult.unidad : c.unidad) || '—');
        $('anMatrizDesc').textContent = ult ? ult.descripcion : c.descripcion;
        $('anMatrizConcepto').textContent = ult
            ? 'Insumos por unidad de ' + (ult.codigo || ult.descripcion) + (ult.unidad ? ' (' + ult.unidad + ')' : '') + ' · su costo en la matriz de arriba sale de esta'
            : 'Insumos por unidad del concepto' + (c.unidad ? ' (' + c.unidad + ')' : '')
              + (c.matriz ? ' · su costo directo sale de esta matriz' : ' · hoy su costo es capturado: ' + AN.ui.dinero(c.costo));
        $('anMatrizUrl').innerHTML = /^https?:\/\/\S+$/i.test(String(c.url || '').trim())
            ? '<a class="an-btn-cab an-icono" href="' + esc(c.url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(c.url) + '" aria-label="Abrir el enlace del concepto">' + ICONO_URL + '</a>'
            : '<span class="an-btn-cab an-icono vacia" title="El concepto no tiene enlace">' + ICONO_URL + '</span>';
        $('anTabMatriz').textContent = 'Matriz · ' + c.codigo;
        $('anTabMatriz').title = c.codigo + ' · ' + c.descripcion;
        pintar();
        navBotones();
    }
    // Anterior / Siguiente: deshabilitados en los extremos de la partida
    // En la matriz de un insumo solo se puede REGRESAR (a la de arriba)
    function navBotones() {
        var ids = H.conceptosPartida ? H.conceptosPartida() : [], i = st.concepto ? ids.indexOf(st.concepto.concepto_id) : -1;
        $('anMatrizAnterior').disabled = !!st.padre || i <= 0;
        $('anMatrizSiguiente').disabled = !!st.padre || i < 0 || i >= ids.length - 1;
        $('anMatrizRegresar').classList.toggle('an-riel-primario', !!st.padre);
        $('anMatrizRegresar').title = st.padre ? 'Regresar a la matriz de arriba' : 'Regresar al presupuesto';
    }

    // Abre la matriz de un renglón (padreId) o la del concepto (null), del concepto que ya está abierto
    async function abrirNivel(padreId) {
        if (!st.concepto || st.guardando) return;
        if (sucio() && !(await AN.ui.confirmar({ titulo: 'Cambios sin guardar', mensaje: 'Existen cambios sin guardar en esta matriz.\n¿Deseas salir de ella sin guardarlos?', aceptar: 'Salir sin guardar', peligro: true }))) return;
        estado('Cargando…', 'info');
        var p = { recurso: 'matriz', concepto: st.concepto.concepto_id };
        if (padreId) p.padre = padreId;
        try {
            $('anMatrizQ').value = '';
            cargar(await AN.api.get(H.url(p)));
            estado('');
        } catch (e) { estado(e.message, 'error'); }
    }
    function regresar() {
        if (!st.padre) { verPestana(false); return; }
        abrirNivel(st.ruta.length > 1 ? st.ruta[st.ruta.length - 2].matriz_id : null);
    }

    function entrarEdicion() {
        if (!H.puede || !st.concepto || st.editando) return;
        st.editando = true;
        st.deshacer = [];
        st.rehacer = [];
        st.marcados.clear();
        pintar();
    }
    async function cancelarEdicion() {
        if (!st.editando) return;
        if (sucio() && !(await AN.ui.confirmar({ titulo: 'Cancelar cambios', mensaje: 'Se descartarán los cambios de la matriz.\n¿Deseas continuar?', aceptar: 'Descartar cambios', peligro: true }))) return;
        st.filas = JSON.parse(st.guardadas);
        st.editando = false;
        st.marcados.clear();
        estado('');
        calcular();
        pintar();
    }

    async function abrir(conceptoId) {
        if (H.renglonesPendientes()) { AN.ui.aviso('Guarda o cancela primero los cambios de los conceptos de la partida.', 'error'); return; }
        if (st.guardando) return;
        // Ya está abierta la matriz de este concepto: solo se muestra la pestaña (sin perder lo capturado)
        if (st.abierta && st.concepto && st.concepto.concepto_id === conceptoId) { mostrarMatriz(); return; }
        if (sucio()) {
            mostrarMatriz();
            if (!(await AN.ui.confirmar({ titulo: 'Cambios sin guardar', mensaje: 'Existen cambios sin guardar en la matriz de ' + st.concepto.codigo + '.\n¿Deseas abrir otra sin guardarlos?', aceptar: 'Abrir sin guardar', peligro: true }))) return;
        }
        st.concepto = null;
        st.filas = [];
        st.editando = false;
        estado('Cargando…', 'info');
        $('anMatrizTitulo').textContent = 'Matriz de precio unitario';
        $('anMatrizDesc').textContent = '';
        $('anMatrizConcepto').textContent = '';
        $('anMatrizUrl').innerHTML = '';
        $('anMatrizTotales').innerHTML = '';
        $('anMatrizQ').value = '';
        tbody.innerHTML = '<tr class="an-vacio"><td colspan="' + COLS + '">Cargando…</td></tr>';
        mostrarMatriz();
        try {
            cargar(await AN.api.get(H.url({ recurso: 'matriz', concepto: conceptoId })));
            estado(H.puede ? '' : 'Solo consulta: no tienes permiso para modificar presupuestos.');
        } catch (e) {
            ocultarMatriz();
            AN.ui.aviso(e.message, 'error');
        }
    }

    async function cerrar() {
        if (st.guardando) return;
        if (sucio() && !(await AN.ui.confirmar({ titulo: 'Cambios sin guardar', mensaje: 'Existen cambios sin guardar en la matriz.\n¿Deseas cerrar?', aceptar: 'Cerrar sin guardar', peligro: true }))) return;
        ocultarMatriz();
    }

    // Regresa true si quedó guardada (o no había nada que guardar)
    async function guardar() {
        if (st.guardando) return false;
        if (!sucio()) return true;
        tbody.querySelectorAll('.invalido').forEach(function (i) { i.classList.remove('invalido'); });
        var malos = st.filas.filter(function (f) { return !String(f.descripcion).trim(); });
        if (malos.length) {
            if (!st.editando) entrarEdicion();
            $('anMatrizQ').value = '';
            pintar();
            malos.forEach(function (f) { var i = tbody.querySelector('tr[data-clave="' + f.clave + '"] [data-k="descripcion"]'); if (i) i.classList.add('invalido'); });
            estado('Cada insumo necesita descripción.', 'error');
            return false;
        }
        st.guardando = true;
        estado('Guardando…', 'info');
        botones();
        try {
            var r = await AN.api.post(H.url(), { accion: 'matriz_guardar', concepto_id: st.concepto.concepto_id, padre_id: st.padre, partida_id: H.sel || 0, filas: st.filas.map(limpia) });
            st.guardando = false;
            cargar(r.matriz);
            H.aplicar(r);
            estado('Guardado correctamente', 'ok');
            if (cat.fuente === 'explosion' && cat.cargado) cargarCatalogo(false);   // la explosión cambió
            var ruta = [r.matriz.concepto.codigo].concat((r.matriz.ruta || []).map(function (x) { return x.codigo || x.descripcion; })).join(' -> ');
            AN.ui.aviso('Matriz de ' + ruta + ' guardada: ' + (r.matriz.padre_id ? 'total ' : 'costo directo ') + AN.ui.dinero(r.matriz.total) + '.', 'ok');
            return true;
        } catch (e) {
            st.guardando = false;
            if (!st.editando) { st.editando = true; }
            $('anMatrizQ').value = '';
            pintar();
            Object.keys(e.errores || {}).forEach(function (k) {
                var m = /^filas\.(\d+)\.(\w+)$/.exec(k);
                if (!m || !st.filas[+m[1]]) return;
                var i = tbody.querySelector('tr[data-clave="' + st.filas[+m[1]].clave + '"] [data-k="' + m[2] + '"]');
                if (i) { i.classList.add('invalido'); i.title = e.errores[k]; }
            });
            estado(e.message, 'error');
            botones();
            return false;
        }
    }

    function agregarFilas(nuevas) {
        if (!nuevas.length) return;
        if (!st.editando) entrarEdicion();
        guardarFoto();
        nuevas.forEach(function (d) { st.filas.push(nueva(d)); });
        $('anMatrizQ').value = '';
        calcular();
        pintar();
        var ult = [].slice.call(tbody.querySelectorAll('tr[data-clave]')).pop();
        if (ult) ult.scrollIntoView({ block: 'nearest' });
    }

    // ---------- Catálogo de insumos (abajo) ----------
    async function cargarCatalogo(mas) {
        if (cat.ctrl) cat.ctrl.abort();
        cat.ctrl = new AbortController();
        var pagina = mas ? cat.pagina + 1 : 1;
        if (!mas) cuerpoCat.innerHTML = '<tr class="an-vacio"><td colspan="11">Cargando…</td></tr>';
        try {
            var r;
            if (cat.fuente === 'explosion') {
                var x = await AN.api.get(H.url({ recurso: 'explosion_acoplada', ver: 'insumos', q: $('anInsumosQ').value.trim(), modo: AN.ui.modo($('anInsumosQ')) }), { signal: cat.ctrl.signal });
                r = { pagina: 1, total: x.insumos.length, items: x.insumos };
                mas = false;
            } else {
                r = await AN.api.get(H.url({ recurso: 'insumos_tabla', q: $('anInsumosQ').value.trim(), modo: AN.ui.modo($('anInsumosQ')), pagina: pagina, por_pagina: 100 }), { signal: cat.ctrl.signal });
            }
            cat.cargado = true;
            cat.pagina = r.pagina;
            cat.total = r.total;
            cat.items = mas ? cat.items.concat(r.items) : r.items;
            pintarCatalogo();
        } catch (e) {
            if (e.name === 'AbortError') return;
            cuerpoCat.innerHTML = '<tr class="an-vacio"><td colspan="11">' + esc(e.message) + '</td></tr>';
        }
    }
    var cargarCatalogoPronto = AN.ui.retrasar(function () { cargarCatalogo(false); }, 250);

    function pintarCatalogo() {
        var puede = H.puede;
        var exp = cat.fuente === 'explosion';
        document.querySelectorAll('.an-insumos-tabla [data-cat]').forEach(function (s) { s.textContent = exp ? s.dataset.exp : s.dataset.cat; });
        cuerpoCat.innerHTML = cat.items.map(function (i) {
            var k = claveIns(i), m = cat.marcados.has(k), copiable = puede && !i.pct;
            return '<tr class="an-fila' + (m ? ' marcado' : '') + '" data-insumo="' + esc(k) + '">'
                + '<td class="an-col-sel">' + (copiable ? '<input type="checkbox" data-marcar-ins' + (m ? ' checked' : '') + ' aria-label="Marcar ' + esc(i.codigo) + '">' : '') + '</td>'
                + '<td class="an-cat-codigo">' + esc(i.codigo) + '</td>'
                + '<td class="num">' + (copiable ? '<input class="an-catalogo-cant" type="number" min="0" step="any" inputmode="decimal" data-cant value="' + esc(m ? cat.marcados.get(k).cantidad : '') + '" placeholder="1" aria-label="Cantidad a copiar de ' + esc(i.codigo) + '">' : '') + '</td>'
                + '<td class="an-desc">' + esc(i.descripcion) + '</td><td>' + esc(i.unidad) + '</td>'
                + '<td>' + tipoCelda(i.tipo) + '</td>'
                + '<td class="num">' + (i.pct ? '—' : i.costo === null ? '<span class="an-ayuda">sin precio</span>' : AN.ui.dinero(i.costo)) + '</td>'
                + (exp
                    ? '<td class="num">' + i.n + '</td><td class="num">' + (i.pct ? '—' : cantidadTexto(i.cantidad)) + '</td><td class="num">' + AN.ui.dinero(i.importe) + '</td><td class="num">' + i.matrices + '</td></tr>'
                    : '<td>' + esc(i.familia || '') + '</td><td>' + esc(i.proveedor || '') + '</td>'
                      + '<td>' + esc(AN.ui.fechaCorta(i.fecha)) + (i.moneda && i.moneda !== 'MXN' ? ' <small class="an-ayuda">' + esc(i.moneda) + '</small>' : '') + '</td>'
                      + '<td>' + esc(i.clave_microsip || '') + '</td></tr>');
        }).join('') || '<tr class="an-vacio"><td colspan="11">' + ($('anInsumosQ').value.trim() ? 'Ningún insumo coincide con el filtro.'
            : exp ? 'Las matrices de este presupuesto todavía no tienen insumos: tómalos del «Catálogo de insumos».' : 'El catálogo de insumos está vacío.') + '</td></tr>';
        $('anInsumosConteo').textContent = cat.total ? (cat.items.length < cat.total ? cat.items.length + ' de ' : '') + cat.total + ' insumo(s)' : '';
        $('anInsumosPie').hidden = cat.items.length >= cat.total;
        botones();
    }

    function marcarInsumo(id, si, cantidad) {
        var item = cat.items.find(function (i) { return claveIns(i) === id; });
        if (si && item) cat.marcados.set(id, { item: item, cantidad: cantidad == null ? (cat.marcados.has(id) ? cat.marcados.get(id).cantidad : '') : cantidad });
        else cat.marcados.delete(id);
        var tr = cuerpoCat.querySelector('tr[data-insumo="' + id + '"]');
        if (tr) { tr.classList.toggle('marcado', si); var c = tr.querySelector('[data-marcar-ins]'); if (c) c.checked = si; }
        botones();
    }

    function filaDeInsumo(i, cantidad) {
        return { insumo_id: i.insumo_id, tipo: i.tipo, codigo: i.codigo, descripcion: i.descripcion, unidad: i.unidad,
                 costo: i.costo === null ? 0 : i.costo, cantidad: String(cantidad) };
    }
    function copiar() {
        if (!st.concepto || !cat.marcados.size) return;
        var sinPrecio = [];
        var nuevas = Array.from(cat.marcados.values()).map(function (m) {
            var cant = Number(m.cantidad);
            if (m.item.costo === null) sinPrecio.push(m.item.codigo);
            return filaDeInsumo(m.item, m.cantidad !== '' && cant >= 0 ? m.cantidad : 1);
        });
        agregarFilas(nuevas);
        cat.marcados.clear();
        pintarCatalogo();
        estado(nuevas.length + ' insumo(s) copiados a la matriz' + (sinPrecio.length ? ' · sin precio vigente, captura su costo: ' + sinPrecio.join(', ') : '') + '. Revisa y GUARDA.', sinPrecio.length ? 'error' : 'info');
    }

    // ---------- Llenar el renglón con su código ----------
    // Al escribir un código que ya se usó (en otro renglón de esta matriz, en la matriz de otro concepto o en el catálogo
    // de insumos), el renglón se llena con su tipo, descripción, unidad, cálculo, cantidad, % desp. y costo. Ctrl+Z lo deshace.
    var LLENAR = ['insumo_id', 'tipo', 'codigo', 'descripcion', 'unidad', 'base', 'cantidad', 'desperdicio_pct', 'costo'];
    function mismoCodigo(a, b) { return String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase(); }
    async function llenarPorCodigo(f) {
        var codigo = String(f.codigo || '').trim();
        if (!codigo || f.hijos || !editable()) return;
        var origen = null, datos = null;
        var otra = st.filas.find(function (x) { return x !== f && mismoCodigo(x.codigo, codigo) && String(x.descripcion || '').trim(); });
        if (otra) { datos = otra; origen = 'el renglón ' + (st.filas.indexOf(otra) + 1) + ' de esta matriz'; }
        else {
            try {
                var r = await AN.api.get(H.url({ recurso: 'renglon_codigo', codigo: codigo }));
                if (r.renglon) { datos = r.renglon; origen = r.origen; }
            } catch (e) { return; }
        }
        // El usuario siguió escribiendo o ya salió de edición: no se toca
        if (!datos || !editable() || st.filas.indexOf(f) < 0 || !mismoCodigo(f.codigo, codigo)) return;
        if (String(f.descripcion).trim() === String(datos.descripcion).trim() && String(f.unidad).trim() === String(datos.unidad || '').trim()
            && Number(f.costo) === Number(datos.costo)) return;
        guardarFoto();
        LLENAR.forEach(function (k) {
            var v = datos[k];
            f[k] = k === 'insumo_id' ? (v || null) : String(v == null ? '' : v);
        });
        calcular();
        pintar();
        var c = tbody.querySelector('tr[data-clave="' + f.clave + '"] [data-k="cantidad"]');
        if (c) { c.focus(); c.select(); }
        estado('Renglón llenado con el código ' + codigo + ' de ' + origen + '. Revisa la cantidad (Ctrl+Z lo deshace).', 'info');
    }

    // ---------- Copiar y pegar renglones entre matrices ----------
    // «Copiar renglones» (Ctrl+C) guarda los marcados (o el renglón del clic derecho) en el portapapeles de ACRINEO de este
    // navegador; en la matriz de otro concepto (aunque sea de otro presupuesto) «Pegar renglones» (Ctrl+V) los agrega
    // como si se capturaran: quedan en edición hasta GUARDAR. Un renglón con submatriz se pega con su costo, sin la submatriz.
    function copiarRenglones(filas) {
        if (!filas.length) return;
        var datos = filas.map(function (f) {
            var o = { conMatriz: !!f.hijos };
            LLENAR.forEach(function (k) { o[k] = k === 'insumo_id' ? (f.insumo_id || null) : String(f[k] == null ? '' : f[k]); });
            return o;
        });
        try { localStorage.setItem(PORTA, JSON.stringify({ concepto: st.concepto ? st.concepto.codigo : '', presupuesto: H.ctx.codigo, filas: datos })); }
        catch (e) { AN.ui.aviso('El navegador no dejó guardar la copia.', 'error'); return; }
        // También como texto, para pegarlo en Excel
        var txt = datos.map(function (d) { return [d.codigo, d.descripcion, tipoTexto(d.tipo), d.unidad, d.costo, BASES[d.base || ''], d.cantidad, d.desperdicio_pct].join('\t'); }).join('\r\n');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).catch(function () { /* solo el de ACRINEO */ });
        AN.ui.aviso(datos.length + ' renglón(es) copiados. Abre la matriz de otro concepto y usa «Pegar renglones» (Ctrl+V).', 'ok', 5000);
        botones();
    }
    function aCopiar(f) {
        if (st.marcados.size) return st.filas.filter(function (x) { return st.marcados.has(x.clave); });
        return f ? [f] : [];
    }
    function pegarRenglones() {
        var p = portapapeles();
        if (!H.puede || !st.concepto || !p || !p.filas || !p.filas.length) return;
        var conMatriz = p.filas.filter(function (d) { return d.conMatriz; }).length;
        agregarFilas(p.filas.map(function (d) {
            var o = {};
            LLENAR.forEach(function (k) { o[k] = d[k]; });
            return o;
        }));
        estado(p.filas.length + ' renglón(es) pegados de ' + (p.concepto || 'otra matriz') + (p.presupuesto && p.presupuesto !== H.ctx.codigo ? ' (' + p.presupuesto + ')' : '')
            + (conMatriz ? ' · ' + conMatriz + ' tenía(n) submatriz: se pegaron con su costo, sin la submatriz' : '') + '. Revisa y GUARDA.', 'info');
    }

    $('anMatrizCopiarRen').addEventListener('click', function () { copiarRenglones(st.marcados.size ? aCopiar(null) : st.filas.slice()); });
    if ($('anMatrizPegarRen')) $('anMatrizPegarRen').addEventListener('click', pegarRenglones);
    // Lo copiado en otra pestaña del navegador también se puede pegar aquí
    window.addEventListener('storage', function (e) { if (e.key === PORTA) botones(); });

    // ---------- Eventos de la matriz ----------
    tbody.addEventListener('focusin', function (e) { if (e.target.dataset.k && st.editando) st.fotoPendiente = foto(); });
    tbody.addEventListener('input', function (e) {
        var k = e.target.dataset.k;
        if (!k || e.target.tagName === 'SELECT') return;
        if (st.fotoPendiente) { guardarFoto(st.fotoPendiente); st.fotoPendiente = null; }
        var f = st.filas.find(function (x) { return x.clave === e.target.closest('tr').dataset.clave; });
        if (k === 'tipo') {
            var pos = e.target.selectionStart;
            e.target.value = e.target.value.toUpperCase();
            e.target.setSelectionRange(pos, pos);
        }
        f[k] = k === 'tipo' ? tipoDe(e.target.value) : e.target.value;
        e.target.classList.toggle('invalido', k === 'tipo' && !TIPOS[f.tipo]);
        if (k === 'tipo') e.target.title = TIPOS[f.tipo] ? tipoTexto(f.tipo) + ' · ' + TIPOS[f.tipo] : 'Tipo no válido (1 materiales, 2 mano de obra, 3 equipo y herramienta, 4 básicos, 5 otros)';
        pintarTotales();
    });
    // Lupas de Unidad («Catálogo Unidades») y de Tipo («Catálogo Tipos de insumos»)
    tbody.addEventListener('click', function (e) {
        var lupa = e.target.closest('[data-unidad], [data-tipo-insumo]');
        if (!lupa) return;
        var k = lupa.hasAttribute('data-unidad') ? 'unidad' : 'tipo';
        var cat = k === 'unidad' ? AN.unidades : AN.tiposInsumo;
        if (!cat) return;
        var f = st.filas.find(function (x) { return x.clave === lupa.closest('tr').dataset.clave; });
        cat.elegir(f[k]).then(function (v) {
            if (k === 'tipo') cat.items().forEach(function (t) { TIPOS[t.tipo] = t.descripcion || t.tipo; });
            if (v === null || v === f[k]) return;
            guardarFoto();
            f[k] = v;
            if (k === 'tipo') { calcular(); pintar(); return; }
            var i = tbody.querySelector('tr[data-clave="' + f.clave + '"] [data-k="unidad"]');
            if (i) i.value = v;
            pintarTotales();
        });
    });
    tbody.addEventListener('change', function (e) {
        var tr = e.target.closest('tr[data-clave]');
        if (!tr) return;
        var f = st.filas.find(function (x) { return x.clave === tr.dataset.clave; });
        if (e.target.dataset.marcar) {
            if (e.target.checked) st.marcados.add(f.clave); else st.marcados.delete(f.clave);
            botones();
            return;
        }
        if (e.target.dataset.k === 'codigo') { llenarPorCodigo(f); return; }
        if (e.target.tagName === 'SELECT') {
            guardarFoto(st.fotoPendiente || undefined);
            st.fotoPendiente = null;
            f[e.target.dataset.k] = e.target.value;
            if (e.target.dataset.k === 'base' && f.base) { f.desperdicio_pct = '0'; if (f.unidad === '') f.unidad = '%'; }
            calcular();
            pintar();
        }
    });
    // Doble clic en un insumo (fuera de edición) entra a editar
    tbody.addEventListener('dblclick', function (e) {
        if (!H.puede || st.editando || !e.target.closest('tr[data-clave]')) return;
        entrarEdicion();
    });
    $('anMatrizQ').addEventListener('input', pintar);
    $('anMatrizQ').addEventListener('modo', pintar);
    if ($('anMatrizTodos')) $('anMatrizTodos').addEventListener('change', function () {
        var si = this.checked;
        st.marcados.clear();
        if (si) st.filas.forEach(function (f) { st.marcados.add(f.clave); });
        tbody.querySelectorAll('input[data-marcar]').forEach(function (c) { c.checked = si; });
        botones();
    });

    // ---------- Eventos del catálogo ----------
    $('anInsumosQ').addEventListener('input', cargarCatalogoPronto);
    // Origen de los insumos de abajo: «Explosión del presupuesto» o «Catálogo de insumos» (se recuerda)
    function pintarFuente() {
        document.querySelectorAll('.an-matriz-catalogo [data-fuente]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.fuente === cat.fuente)); });
        $('anInsumosQ').placeholder = cat.fuente === 'explosion' ? 'Filtrar los insumos del presupuesto por código, descripción, unidad…' : 'Filtrar por código, descripción, unidad, familia…';
    }
    pintarFuente();
    document.querySelectorAll('.an-matriz-catalogo [data-fuente]').forEach(function (b) {
        b.addEventListener('click', function () {
            if (cat.fuente === b.dataset.fuente) return;
            cat.fuente = b.dataset.fuente;
            cat.marcados.clear();
            try { localStorage.setItem('acrineo.matriz.fuente', cat.fuente); } catch (e) { /* sin memoria */ }
            pintarFuente();
            cargarCatalogo(false);
        });
    });
    $('anInsumosQ').addEventListener('modo', cargarCatalogoPronto);
    $('anInsumosMas').addEventListener('click', function () { cargarCatalogo(true); });
    cuerpoCat.addEventListener('change', function (e) {
        var tr = e.target.closest('tr[data-insumo]');
        if (tr && e.target.matches('[data-marcar-ins]')) marcarInsumo(tr.dataset.insumo, e.target.checked);
    });
    cuerpoCat.addEventListener('input', function (e) {
        var tr = e.target.closest('tr[data-insumo]');
        if (!tr || !e.target.matches('[data-cant]')) return;
        var v = e.target.value.trim();
        marcarInsumo(tr.dataset.insumo, v !== '' && Number(v) > 0, v);
    });
    cuerpoCat.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target.matches('[data-cant]')) { e.preventDefault(); copiar(); }
    });
    // Doble clic en un insumo del catálogo: lo copia a la matriz (con su «Cantidad a copiar», o 1)
    cuerpoCat.addEventListener('dblclick', function (e) {
        if (!H.puede || !st.concepto || e.target.closest('input, button, a')) return;
        var tr = e.target.closest('tr[data-insumo]');
        if (!tr) return;
        var id = tr.dataset.insumo;
        if (!tr.querySelector('[data-cant]')) return;   // un % no se copia
        if (!cat.marcados.has(id)) marcarInsumo(id, true, tr.querySelector('[data-cant]').value.trim());
        copiar();
    });

    // ---------- Encabezado y barra ----------
    function ocultarTexto(si) {
        $('anMatrizTexto').hidden = si;
        $('anMatrizOcultarTexto').setAttribute('aria-pressed', String(si));
        $('anMatrizOcultarTexto').textContent = si ? 'Mostrar texto' : 'Ocultar texto';
    }
    try { ocultarTexto(localStorage.getItem('acrineo.matriz.ocultarTexto') === '1'); } catch (e) { /* sin almacenamiento */ }
    $('anMatrizOcultarTexto').addEventListener('click', function () {
        var si = !$('anMatrizTexto').hidden;
        ocultarTexto(si);
        try { localStorage.setItem('acrineo.matriz.ocultarTexto', si ? '1' : '0'); } catch (e) { /* sin almacenamiento */ }
    });

    if (H.puede) {
        $('anMatrizEditar').addEventListener('click', function () { if (st.editando) cancelarEdicion(); else entrarEdicion(); });
        $('anMatrizCancelar').addEventListener('click', cancelarEdicion);
        $('anMatrizGuardar').addEventListener('click', guardar);
        $('anMatrizGuardarCab').addEventListener('click', guardar);
        $('anMatrizDeshacer').addEventListener('click', deshacer);
        $('anMatrizRehacer').addEventListener('click', rehacer);
        function agregarLibre() {
            agregarFilas([{}]);
            AN.ui.aviso('Fila agregada', 'ok');
            var i = [].slice.call(tbody.querySelectorAll('tr[data-clave] [data-k="descripcion"]')).pop();
            if (i) i.focus();
        }
        $('anMatrizLibre').addEventListener('click', agregarLibre);
        // Alt+N en la pestaña Matriz: agrega un renglón (entra al modo edición si hace falta)
        document.addEventListener('keydown', function (e) {
            if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.key.toLowerCase() !== 'n') return;
            if (panel.hidden || !st.concepto || document.querySelector('dialog[open]')) return;
            e.preventDefault();
            agregarLibre();
        });
        tbody.addEventListener('click', function (e) {
            if (e.target.closest('[data-agregar-registro]')) agregarLibre();
            else if (e.target.closest('[data-aplicar]')) guardar();
            else if (e.target.closest('[data-cancelar]')) cancelarEdicion();
        });
        $('anMatrizQuitar').addEventListener('click', async function () {
            if (!st.marcados.size) return;
            var conMatriz = st.filas.filter(function (f) { return st.marcados.has(f.clave) && f.hijos; }).length;
            if (conMatriz && !(await AN.ui.confirmar({ titulo: 'Quitar insumos', mensaje: conMatriz + ' de los insumos marcados tiene(n) su propia matriz; al GUARDAR se borrará también.\n¿Deseas continuar?', aceptar: 'Quitar', peligro: true }))) return;
            guardarFoto();
            st.filas = st.filas.filter(function (f) { return !st.marcados.has(f.clave); });
            st.marcados.clear();
            calcular();
            pintar();
        });
        $('anMatrizActualizar').addEventListener('click', async function () {
            var conCatalogo = st.filas.filter(function (f) { return f.insumo_id && !f.base && !f.hijos; });
            if (!conCatalogo.length) { estado('Ningún insumo de la matriz viene del catálogo.', 'info'); return; }
            try {
                // El servidor da el costo de catálogo de los insumos de la matriz guardada (los recién copiados ya lo traen)
                var pm = { recurso: 'matriz', concepto: st.concepto.concepto_id, actualizar: 1 };
                if (st.padre) pm.padre = st.padre;
                var m = await AN.api.get(H.url(pm));
                var costos = {};
                m.filas.forEach(function (f) { if (f.insumo_id && !f.base) costos[f.insumo_id] = f.costo; });
                var cambian = conCatalogo.filter(function (f) { return costos[f.insumo_id] !== undefined && Number(costos[f.insumo_id]) !== Number(f.costo); });
                if (cambian.length) {
                    if (!st.editando) entrarEdicion();
                    guardarFoto();
                    cambian.forEach(function (f) { f.costo = String(costos[f.insumo_id]); });
                }
                calcular();
                pintar();
                estado(cambian.length + ' costo(s) actualizado(s) del catálogo' + (m.avisos.length ? ' · ' + m.avisos.join('; ') : '') + (cambian.length ? '. Revisa y GUARDA.' : '.'), m.avisos.length ? 'error' : 'info');
            } catch (e) { estado(e.message, 'error'); }
        });
        $('anInsumosCopiar').addEventListener('click', copiar);

        // ---------- Ajuste del precio unitario ----------
        // Lleva el costo directo al deseado multiplicando por un mismo factor las cantidades de los insumos de los
        // tipos marcados (los costos no cambian). Los renglones «% de M.O. / materiales» se recalculan solos, así que
        // el total es lineal en el factor: total(f) = t0 + (t1 − t0)·f.
        var MONEDAS = (window.ACRINEO && window.ACRINEO.hoja && window.ACRINEO.hoja.monedas) || [{ numero: 1, descripcion: 'PESOS', tipo_cambio: 1 }];
        var dlgAjuste = $('anAjuste');
        function ajusteTc() { var m = MONEDAS.find(function (x) { return String(x.numero) === $('anAjusteMoneda').value; }); return m ? Number(m.tipo_cambio) || 1 : 1; }
        function ajusteEstado(t, tipo) { var e = $('anAjusteEstado'); e.textContent = t || ''; e.className = 'an-estado' + (tipo ? ' ' + tipo : ''); }
        function ajusteMostrar() {
            var tc = ajusteTc(), d = H.ctx.dec_costos;
            var actual = H.redondear(calcular().total / tc, d);
            $('anAjusteActual').textContent = AN.ui.dinero(actual);
            $('anAjusteDeseado').value = actual.toFixed(d);
        }
        function ajusteTodos() {
            var cs = [].slice.call($('anAjusteTipos').querySelectorAll('input[type=checkbox]'));
            var n = cs.filter(function (c) { return c.checked; }).length;
            $('anAjusteTodos').checked = cs.length > 0 && n === cs.length;
            $('anAjusteTodos').indeterminate = n > 0 && n < cs.length;
        }
        function abrirAjuste() {
            if (!st.concepto) return;
            $('anAjusteMoneda').innerHTML = MONEDAS.map(function (m) { return '<option value="' + m.numero + '">' + esc(m.descripcion) + '</option>'; }).join('');
            var c = calcular(), tipos = [];
            st.filas.forEach(function (f) { if (!f.base && tipos.indexOf(f.tipo) < 0) tipos.push(f.tipo); });
            tipos.sort(function (a, b) { var k = Object.keys(TIPOS); return k.indexOf(a) - k.indexOf(b); });
            $('anAjusteTipos').innerHTML = tipos.map(function (t) {
                return '<label><input type="checkbox" value="' + esc(t) + '" checked> ' + esc(TIPOS[t] || t)
                    + ' <span class="an-ayuda">' + AN.ui.dinero(c.totales[t] || 0) + '</span></label>';
            }).join('');
            $('anAjusteTodos').checked = true;
            $('anAjusteTodos').indeterminate = false;
            $('anAjusteTodos').disabled = !tipos.length;
            ajusteEstado(tipos.length ? '' : 'La matriz no tiene insumos para ajustar.', tipos.length ? '' : 'info');
            ajusteMostrar();
            dlgAjuste.showModal();
            $('anAjusteDeseado').focus();
            $('anAjusteDeseado').select();
        }
        function aceptarAjuste() {
            var tc = ajusteTc(), d = H.ctx.dec_costos;
            var txtDeseado = $('anAjusteDeseado').value.trim(), deseado = Number(txtDeseado) * tc;
            if (txtDeseado === '' || !isFinite(deseado) || deseado < 0) { $('anAjusteDeseado').classList.add('invalido'); ajusteEstado('Escribe un costo directo deseado válido.', 'error'); return; }
            var marcados = [].slice.call($('anAjusteTipos').querySelectorAll('input:checked')).map(function (c) { return c.value; });
            var aj = st.filas.filter(function (f) { return !f.base && marcados.indexOf(f.tipo) >= 0 && Number(f.cantidad) > 0 && Number(f.costo) > 0; });
            if (!aj.length) { ajusteEstado('No hay insumos con importe en los tipos marcados.', 'error'); return; }
            var orig = aj.map(function (f) { return f.cantidad; });
            var totalCon = function (fac) { aj.forEach(function (f, i) { f.cantidad = Number(orig[i]) * fac; }); return calcular().total; };
            var t0 = totalCon(0), t1 = totalCon(1);
            aj.forEach(function (f, i) { f.cantidad = orig[i]; });
            calcular();
            var fac = (deseado - t0) / (t1 - t0);
            if (!(t1 - t0 > 0)) { ajusteEstado('Los tipos marcados no tienen importe que ajustar.', 'error'); return; }
            if (fac < 0) { ajusteEstado('El deseado es menor que lo que no se ajusta (' + AN.ui.dinero(H.redondear(t0 / tc, d)) + ').', 'error'); return; }
            if (!st.editando) entrarEdicion();
            guardarFoto();
            aj.forEach(function (f, i) { f.cantidad = String(H.redondear(Number(orig[i]) * fac, 6)); });
            calcular();
            pintar();
            dlgAjuste.close();
            estado('Cantidades de ' + aj.length + ' insumo(s) × ' + H.redondear(fac, 6) + '. Revisa y GUARDA.', 'info');
        }
        $('anMatrizAjustar').addEventListener('click', abrirAjuste);
        $('anAjusteMoneda').addEventListener('change', ajusteMostrar);
        $('anAjusteDeseado').addEventListener('input', function () { this.classList.remove('invalido'); ajusteEstado(''); });
        $('anAjusteDeseado').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); aceptarAjuste(); } });
        $('anAjusteTodos').addEventListener('change', function () {
            var si = this.checked;
            $('anAjusteTipos').querySelectorAll('input[type=checkbox]').forEach(function (c) { c.checked = si; });
            ajusteEstado('');
        });
        $('anAjusteTipos').addEventListener('change', function () { ajusteTodos(); ajusteEstado(''); });
        $('anAjusteAceptar').addEventListener('click', aceptarAjuste);
        dlgAjuste.querySelectorAll('[data-ajuste-cerrar]').forEach(function (b) { b.addEventListener('click', function () { dlgAjuste.close(); }); });
    }
    $('anMatrizCerrar').addEventListener('click', cerrar);

    // ---------- Riel de acciones (hamburguesa) ----------
    function rielAbierto(si) {
        $('anMatrizRiel').classList.toggle('abierto', si);
        $('anMatrizMenu').setAttribute('aria-expanded', String(si));
        $('anMatrizMenu').setAttribute('aria-pressed', String(si));
        $('anMatrizMenu').title = si ? 'Ocultar los nombres de las acciones' : 'Mostrar las acciones';
    }
    try { rielAbierto(localStorage.getItem('acrineo.matriz.riel') === '1'); } catch (e) { /* sin almacenamiento */ }
    $('anMatrizMenu').addEventListener('click', function () {
        var si = !$('anMatrizRiel').classList.contains('abierto');
        rielAbierto(si);
        try { localStorage.setItem('acrineo.matriz.riel', si ? '1' : '0'); } catch (e) { /* sin almacenamiento */ }
    });
    function vecino(paso) {
        if (!st.concepto || !H.conceptosPartida) return;
        var ids = H.conceptosPartida(), i = ids.indexOf(st.concepto.concepto_id), j = i + paso;
        if (i < 0 || j < 0 || j >= ids.length) { estado(paso < 0 ? 'Es el primer concepto de la partida.' : 'Es el último concepto de la partida.', 'info'); return; }
        abrir(ids[j]);
    }
    $('anMatrizAnterior').addEventListener('click', function () { vecino(-1); });
    $('anMatrizSiguiente').addEventListener('click', function () { vecino(1); });
    $('anMatrizRegresar').addEventListener('click', regresar);
    // «Desacoplar exp. ins.»: oculta (o vuelve a mostrar) el catálogo de insumos de abajo; se recuerda
    function acoplar(si) {
        document.querySelector('.an-matriz-catalogo').hidden = !si;
        $('anMatriz').classList.toggle('desacoplada', !si);
        $('anMatrizDesacoplar').setAttribute('aria-pressed', String(!si));
        $('anMatrizDesacoplar').querySelector('span').textContent = si ? 'Desacoplar exp. ins.' : 'Acoplar exp. ins.';
        $('anMatrizDesacoplar').title = si ? 'Oculta el catálogo de insumos de abajo' : 'Vuelve a mostrar el catálogo de insumos de abajo';
        try { localStorage.setItem('acrineo.matriz.acoplada', si ? '1' : '0'); } catch (e) { /* sin memoria */ }
    }
    var acopladaGuardada = null;
    try { acopladaGuardada = localStorage.getItem('acrineo.matriz.acoplada'); } catch (e) { /* sin memoria */ }
    if (acopladaGuardada === '0') acoplar(false);
    $('anMatrizDesacoplar').addEventListener('click', function () { acoplar(document.querySelector('.an-matriz-catalogo').hidden); });
    // «Pendiente de analizar» del concepto (la misma P.A. de la cuadrícula de conceptos)
    $('anMatrizPendiente').addEventListener('change', async function () {
        if (!st.concepto) return;
        var si = this.checked, caja = this;
        try {
            H.aplicar(await AN.api.post(H.url(), { accion: 'concepto_pendiente', concepto_id: st.concepto.concepto_id, pendiente: si, partida_id: H.sel || 0 }));
            st.concepto.pendiente_analizar = si;
            AN.ui.aviso(st.concepto.codigo + (si ? ' quedó pendiente de analizar.' : ' ya no está pendiente de analizar.'), 'ok');
        } catch (e) { caja.checked = !si; AN.ui.aviso(e.message, 'error'); }
    });
    // Gráfica de la matriz abierta: importe de sus insumos por tipo (los marcados, si hay)
    $('anMatrizGrafica').addEventListener('click', function () {
        if (!AN.grafica || !st.concepto) return;
        calcular();
        var filas = st.marcados.size ? st.filas.filter(function (f) { return st.marcados.has(f.clave); }) : st.filas;
        AN.grafica.abrir({
            titulo: 'Explosión de insumos · ' + $('anMatrizTitulo').textContent.replace(/ \| Unidad.*$/, ''),
            nota: (st.marcados.size ? st.marcados.size + ' insumo(s) marcado(s)' : 'Todos los insumos de esta matriz') + ' · importe por unidad del concepto.',
            nombreTipo: function (t) { return TIPOS[t] || t; },
            filas: filas.map(function (f) { return { tipo: f.tipo, codigo: f.codigo, descripcion: f.descripcion, unidad: f.unidad, importe: f._importe || 0 }; })
        });
    });
    // Doble clic en cualquier parte del renglón (también en sus celdas al editar): abre su propia matriz («Código: 50450 -> B12»).
    // Si la matriz tiene cambios (p. ej. el insumo se acaba de agregar y aún no tiene matriz_id) se guarda sola antes de
    // entrar, como en Neodata; los renglones regresan en el mismo orden, así que se ubica el insumo por su posición.
    tbody.addEventListener('dblclick', async function (e) {
        if (e.target.closest('select, textarea, button, a, input[type=checkbox]')) return;
        var tr = e.target.closest('tr[data-clave]');
        if (!tr) return;
        var f = st.filas.find(function (x) { return x.clave === tr.dataset.clave; });
        if (!f) return;
        var sel = window.getSelection && window.getSelection();
        if (sel && sel.removeAllRanges) sel.removeAllRanges();
        verMatrizDe(f);
    });
    // «Ver matriz» de un renglón: su propia matriz (la crea guardando antes si hace falta)
    async function verMatrizDe(f) {
        if (!f) return;
        if (!st.submatriz) { estado('Falta aplicar la migración 029 para abrir la matriz de un insumo.', 'error'); return; }
        if (f.base) { estado('Un renglón de porcentaje no tiene matriz propia.', 'info'); return; }
        if (sucio() || !f.matriz_id) {
            var pos = st.filas.indexOf(f);
            if (!(await guardar())) return;
            f = st.filas[pos];
            if (!f || !f.matriz_id) { estado('No se pudo ubicar el insumo después de guardar; vuelve a darle doble clic.', 'error'); return; }
        }
        abrirNivel(f.matriz_id);
    }
    $('anTabPresupuesto').addEventListener('click', function () { verPestana(false); });
    $('anTabMatriz').addEventListener('click', function () { verPestana(true); });

    // Ctrl+Z / Ctrl+Y y Ctrl+S en la pestaña Matriz
    document.addEventListener('keydown', function (e) {
        if (panel.hidden || !(e.ctrlKey || e.metaKey) || document.querySelector('dialog[open]')) return;
        var k = e.key.toLowerCase();
        if (k === 's') { e.preventDefault(); guardar(); return; }
        if (!st.editando) return;
        var a = document.activeElement;
        if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !tbody.contains(a)) return;
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); st.fotoPendiente = null; deshacer(); }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); rehacer(); }
    });

    // ---------- Menús de las cuadrículas (clic derecho y ⋮), como en Neodata ----------
    // La misma clave con la que la explosión junta un insumo (acrineoClaveInsumo en el servidor)
    function claveExplosion(f) {
        return f.insumo_id ? 'i' + f.insumo_id
            : 'l' + [f.codigo, f.descripcion, f.unidad, f.tipo].map(function (v) { return String(v == null ? '' : v).trim(); }).join('|').toUpperCase();
    }
    var ultimo = { donde: null, clave: null };   // el último renglón tocado (para Ctrl+M y Ctrl+C)
    tbody.addEventListener('mousedown', function (e) { var tr = e.target.closest('tr[data-clave]'); if (tr) ultimo = { donde: 'matriz', clave: tr.dataset.clave }; });
    cuerpoCat.addEventListener('mousedown', function (e) { var tr = e.target.closest('tr[data-insumo]'); if (tr) ultimo = { donde: 'insumos', clave: tr.dataset.insumo }; });
    function insumoAbajo(k) { return cat.items.find(function (i) { return claveIns(i) === k; }) || null; }
    function claveAbajo(i) { return i.clave || 'i' + i.insumo_id; }

    function marcarTodo(si) {
        if (!H.puede || !st.concepto) return;
        if (!st.editando) entrarEdicion();
        st.marcados.clear();
        if (si) st.filas.forEach(function (f) { st.marcados.add(f.clave); });
        tbody.querySelectorAll('input[data-marcar]').forEach(function (c) { c.checked = si; });
        if ($('anMatrizTodos')) $('anMatrizTodos').checked = si && st.filas.length > 0;
        botones();
    }

    // «Participa»: los conceptos (y la matriz o submatriz) donde se usa el insumo
    var dlgPart = $('anParticipa'), partUsos = [];
    async function participa(clave, nombre, irDirecto) {
        if (!st.concepto) return;
        var r;
        try { r = await AN.api.get(H.url({ recurso: 'participa', clave: clave })); } catch (e) { AN.ui.aviso(e.message, 'error'); return; }
        partUsos = r.usos;
        if (irDirecto) {
            if (!r.usos.length) { AN.ui.aviso('El insumo no está en ninguna matriz del presupuesto.', 'info'); return; }
            if (r.usos.length === 1) { verUso(r.usos[0]); return; }
        }
        var ins = r.insumo || {};
        $('anParticipaTitulo').textContent = 'Participa · ' + (ins.codigo || nombre || '');
        $('anParticipaInsumo').textContent = ins.descripcion ? ins.descripcion + (ins.unidad ? ' (' + ins.unidad + ')' : '') + ' · está en ' + r.usos.length + ' matriz(ces)' + (r.total ? ' · cantidad total en el presupuesto ' + cantidadTexto(r.total) : '') : '';
        $('anParticipaFilas').innerHTML = r.usos.map(function (u, n) {
            var ruta = [u.codigo].concat(u.ruta.map(function (x) { return x.codigo; })).join(' -> ');
            return '<tr class="an-fila" data-uso="' + n + '"><td>' + esc(u.codigo) + '</td><td class="an-desc">' + esc(u.descripcion) + '</td><td>' + esc(ruta) + '</td>'
                + '<td class="num">' + cantidadTexto(u.cantidad) + (u.pct ? ' %' : '') + '</td><td class="num">' + (u.pct ? '—' : cantidadTexto(u.total)) + '</td>'
                + '<td><button type="button" class="an-btn an-mini" data-ver-uso="' + n + '">Ver matriz</button></td></tr>';
        }).join('') || '<tr class="an-vacio"><td colspan="6">El insumo no está en ninguna matriz del presupuesto.</td></tr>';
        $('anParticipaEstado').textContent = '';
        if (!dlgPart.open) dlgPart.showModal();
    }
    // Abre la matriz donde está el insumo (o la suya propia, si tiene análisis)
    async function verUso(u) {
        if (dlgPart.open) dlgPart.close();
        if (st.concepto.concepto_id !== u.concepto_id) await abrir(u.concepto_id);
        if (!st.concepto || st.concepto.concepto_id !== u.concepto_id) return;
        var destino = u.hijos ? u.matriz_id : u.padre;
        if (destino || st.padre) await abrirNivel(destino);
    }
    dlgPart.addEventListener('click', function (e) {
        var b = e.target.closest('[data-ver-uso]');
        if (b) verUso(partUsos[+b.dataset.verUso]);
        else if (e.target.closest('[data-participa-cerrar]')) dlgPart.close();
    });
    dlgPart.addEventListener('dblclick', function (e) { var tr = e.target.closest('tr[data-uso]'); if (tr) verUso(partUsos[+tr.dataset.uso]); });

    // Copia renglones del panel de abajo (los marcados, o el del clic) como texto separado por tabuladores
    function copiarAbajo(claves) {
        var items = claves.map(insumoAbajo).filter(Boolean);
        if (!items.length) return;
        var exp = cat.fuente === 'explosion';
        var cab = ['Código', 'Descripción', 'Unidad', 'Tipo', 'Costo'].concat(exp ? ['N', 'Cant. exp. ins.', 'Importe'] : ['Familia', 'Proveedor']);
        var txt = [cab].concat(items.map(function (i) {
            return [i.codigo, i.descripcion, i.unidad, tipoTexto(i.tipo), i.pct ? '' : i.costo == null ? '' : i.costo]
                .concat(exp ? [i.n, i.pct ? '' : i.cantidad, i.importe] : [i.familia || '', i.proveedor || '']);
        })).map(function (r) { return r.map(function (v) { return String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' '); }).join('\t'); }).join('\r\n');
        var listo = function () { AN.ui.aviso(items.length + ' insumo(s) copiados al portapapeles.', 'ok'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(listo, function () { AN.ui.aviso('El navegador no dejó copiar al portapapeles.', 'error'); });
    }
    function clavesAbajo(k) { return cat.marcados.size && cat.marcados.has(k) ? Array.from(cat.marcados.keys()) : [k]; }

    tbody.addEventListener('contextmenu', function (e) {
        if (e.target.closest('input:not([type=checkbox]), select, textarea')) return;
        var tr = e.target.closest('tr[data-clave]');
        var f = tr ? st.filas.find(function (x) { return x.clave === tr.dataset.clave; }) : null;
        if (f) ultimo = { donde: 'matriz', clave: f.clave };
        AN.rejilla.contextual('matriz', e, [
            { texto: 'Ver matriz', atajo: 'Ctrl+M', desactivado: !f || !!f.base, accion: function () { verMatrizDe(f); } },
            { texto: 'Participa', desactivado: !f, accion: function () { participa(claveExplosion(f), f.codigo || f.descripcion); } },
            null,
            { texto: st.marcados.size ? 'Copiar renglones marcados (' + st.marcados.size + ')' : 'Copiar renglón', atajo: 'Ctrl+C',
              desactivado: !aCopiar(f).length, accion: function () { copiarRenglones(aCopiar(f)); } },
            { texto: 'Copiar todos los renglones', desactivado: !st.filas.length, accion: function () { copiarRenglones(st.filas.slice()); } },
            { texto: 'Pegar renglones' + ((portapapeles() || {}).filas ? ' (' + portapapeles().filas.length + ')' : ''), atajo: 'Ctrl+V',
              desactivado: !H.puede || !st.concepto || !((portapapeles() || {}).filas || []).length, accion: pegarRenglones },
            null,
            { texto: 'Marcar todo', desactivado: !H.puede || !st.filas.length, accion: function () { marcarTodo(true); } },
            { texto: 'Desmarcar todo', desactivado: !H.puede || !st.marcados.size, accion: function () { marcarTodo(false); } }
        ]);
    });
    cuerpoCat.addEventListener('contextmenu', function (e) {
        if (e.target.closest('input:not([type=checkbox])')) return;
        var tr = e.target.closest('tr[data-insumo]');
        var i = tr ? insumoAbajo(tr.dataset.insumo) : null;
        if (i) ultimo = { donde: 'insumos', clave: tr.dataset.insumo };
        AN.rejilla.contextual('insumos', e, [
            { texto: 'Participa', desactivado: !i, accion: function () { participa(claveAbajo(i), i.codigo); } },
            { texto: 'Ver matriz', atajo: 'Ctrl+M', desactivado: !i, accion: function () { participa(claveAbajo(i), i.codigo, true); } },
            { texto: 'Copiar', atajo: 'Ctrl+C', desactivado: !i, accion: function () { copiarAbajo(clavesAbajo(claveIns(i))); } }
        ]);
    });
    // Ctrl+M (ver matriz) y Ctrl+C (copiar del panel de abajo) sobre el último renglón tocado
    document.addEventListener('keydown', function (e) {
        if (panel.hidden || !(e.ctrlKey || e.metaKey) || e.shiftKey || document.querySelector('dialog[open]')) return;
        var k = e.key.toLowerCase(), a = document.activeElement;
        if (k === 'm' && ultimo.clave) {
            e.preventDefault();
            if (ultimo.donde === 'matriz') { var f = st.filas.find(function (x) { return x.clave === ultimo.clave; }); if (f && !f.base) verMatrizDe(f); }
            else { var i = insumoAbajo(ultimo.clave); if (i) participa(claveAbajo(i), i.codigo, true); }
        } else if (k === 'c' && ultimo.donde === 'insumos' && ultimo.clave && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))
                   && !(window.getSelection && String(window.getSelection()))) {
            e.preventDefault();
            copiarAbajo(clavesAbajo(ultimo.clave));
        } else if (k === 'c' && ultimo.donde === 'matriz' && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox')
                   && !(window.getSelection && String(window.getSelection()))) {
            var fc = st.filas.find(function (x) { return x.clave === ultimo.clave; });
            if (aCopiar(fc).length) { e.preventDefault(); copiarRenglones(aCopiar(fc)); }
        } else if (k === 'v' && ultimo.donde !== 'insumos' && H.puede && st.concepto && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox')
                   && ((portapapeles() || {}).filas || []).length) {
            e.preventDefault();
            pegarRenglones();
        }
    });
    if (AN.rejilla) {
        AN.rejilla.opciones('matriz', {
            archivo: function () { return 'Matriz ' + $('anMatrizTitulo').textContent.replace(/^Código:\s*/, '').replace(/ \| .*$/, '').replace(/ -> /g, ' - '); },
            limpiarFiltro: function () { $('anMatrizQ').value = ''; pintar(); },
            hayFiltro: function () { return !!$('anMatrizQ').value.trim(); }
        });
        AN.rejilla.opciones('insumos', {
            archivo: function () { return cat.fuente === 'explosion' ? 'Explosión de insumos ' + H.ctx.codigo : 'Catálogo de insumos'; },
            limpiarFiltro: function () { $('anInsumosQ').value = ''; cargarCatalogo(false); },
            hayFiltro: function () { return !!$('anInsumosQ').value.trim(); }
        });
    }

    // abierta() = la matriz tiene cambios sin guardar (la hoja pregunta antes de cerrar la pestaña del navegador)
    AN.hojaMatriz = { abrir: abrir, abierta: function () { return sucio(); } };
})(window.AcriNeo = window.AcriNeo || {});
