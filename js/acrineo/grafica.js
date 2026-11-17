// ACRINEO · Ventana «Explosión de insumos» (gráfica), como en Neodata: importes agrupados por tipo de insumo (o por
// insumo / unidad), en columnas o barras, con la serie de la moneda 1 y, si el presupuesto tiene tipo de cambio para la
// moneda 2, también la de la moneda 2. La usan el catálogo de conceptos de la hoja y la matriz (icono de gráfica).
//   AN.grafica.abrir({ titulo, filas: [{ tipo, codigo, descripcion, unidad, importe }], nombreTipo: fn(tipo) → texto, nota })
(function (AN) {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    var esc = AN.ui.esc;
    var NS = 'http://www.w3.org/2000/svg';
    var st = null;

    function monedas() {
        var m = ((window.ACRINEO || {}).hoja || {}).monedas || [];
        var m1 = m.find(function (x) { return x.numero === 1; }) || { descripcion: 'Moneda 1' };
        var m2 = m.find(function (x) { return x.numero === 2; });
        return { m1: m1, m2: m2 && Number(m2.tipo_cambio) > 0 && Number(m2.tipo_cambio) !== 1 ? m2 : null };
    }

    // Grupos según «Agrupar por»: [{ clave, etiqueta, detalle, v1, v2 }] de mayor a menor (los tipos en su orden)
    function grupos() {
        var por = $('anGraficaPor').value, mon = monedas(), mapa = {}, lista = [];
        st.filas.forEach(function (f) {
            var k = por === 'tipo' ? String(f.tipo) : por === 'unidad' ? (f.unidad || '(sin unidad)') : (f.codigo || f.descripcion);
            if (!mapa[k]) {
                mapa[k] = { clave: k, v1: 0, n: 0,
                    etiqueta: por === 'tipo' ? (st.nombreTipo ? st.nombreTipo(f.tipo) : 'Tipo ' + f.tipo) : k,
                    detalle: por === 'insumo' ? f.descripcion : '' };
                lista.push(mapa[k]);
            }
            mapa[k].v1 += Number(f.importe) || 0;
            mapa[k].n++;
        });
        lista.forEach(function (g) {
            g.v1 = Math.round(g.v1 * 100) / 100;
            g.v2 = mon.m2 ? Math.round(g.v1 / Number(mon.m2.tipo_cambio) * 100) / 100 : null;
        });
        if (por === 'tipo') lista.sort(function (a, b) { return String(a.clave).localeCompare(String(b.clave), 'es', { numeric: true }); });
        else lista.sort(function (a, b) { return b.v1 - a.v1; });
        if (lista.length > 12) {   // el resto se junta en «Otros»
            var resto = lista.splice(11);
            lista.push({ clave: '_otros', etiqueta: 'Otros (' + resto.length + ')', detalle: '', otros: true,
                v1: resto.reduce(function (t, g) { return t + g.v1; }, 0), v2: mon.m2 ? resto.reduce(function (t, g) { return t + g.v2; }, 0) : null });
        }
        return lista;
    }

    function el(nombre, attrs, texto) {
        var e = document.createElementNS(NS, nombre);
        Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
        if (texto != null) e.textContent = texto;
        return e;
    }
    // Tope «redondo» del eje y sus marcas
    function escala(max) {
        if (max <= 0) return { tope: 1, paso: 0.2 };
        var bruto = max / 5, mag = Math.pow(10, Math.floor(Math.log10(bruto))), n = bruto / mag;
        var paso = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
        return { tope: Math.ceil(max / paso) * paso, paso: paso };
    }
    function corto(n) {
        var a = Math.abs(n);
        return a >= 1e6 ? (n / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 1 }) + ' M'
            : a >= 1e3 ? (n / 1e3).toLocaleString('es-MX', { maximumFractionDigits: 1 }) + ' mil'
            : n.toLocaleString('es-MX', { maximumFractionDigits: 2 });
    }

    function pintar() {
        var g = grupos(), mon = monedas(), barras = $('anGraficaForma').value === 'barras';
        var cont = $('anGraficaLienzo'), tabla = $('anGraficaTabla');
        var series = [{ k: 'v1', nombre: 'Importe ' + (mon.m1.descripcion || 'moneda 1'), clase: 's1' }];
        if (mon.m2) series.push({ k: 'v2', nombre: 'Importe ' + mon.m2.descripcion, clase: 's2' });
        $('anGraficaLeyenda').innerHTML = series.map(function (s) { return '<span class="an-leyenda ' + s.clase + '"><i></i>' + esc(s.nombre) + '</span>'; }).join('')
            + (series.length < 2 ? '<small class="an-ayuda">Moneda 2: captura su tipo de cambio en Detalle › Otros para verla.</small>' : '');
        cont.innerHTML = '';
        tabla.innerHTML = '';
        if (!g.length) { cont.innerHTML = '<p class="an-vacio-texto">No hay importes que graficar.</p>'; return; }

        var max = Math.max.apply(null, g.map(function (x) { return Math.max(x.v1, x.v2 || 0); }));
        var esc2 = escala(max);
        var ancho = Math.max(cont.clientWidth || 800, 320), alto = barras ? Math.max(220, g.length * 34 * series.length / 1.4 + 60) : 360;
        var m = barras ? { iz: Math.min(220, ancho * 0.3), de: 70, ar: 10, ab: 30 } : { iz: 64, de: 16, ar: 24, ab: 54 };
        var w = ancho - m.iz - m.de, h = alto - m.ar - m.ab;
        var svg = el('svg', { width: ancho, height: alto, viewBox: '0 0 ' + ancho + ' ' + alto, role: 'img', 'aria-label': 'Gráfica de importes por ' + $('anGraficaPor').selectedOptions[0].text.toLowerCase() });
        var grid = el('g', { class: 'an-g-grid' }), marcas = el('g', { class: 'an-g-eje' });
        for (var v = 0; v <= esc2.tope + 1e-9; v += esc2.paso) {
            var p = v / esc2.tope;
            if (barras) {
                var x = m.iz + p * w;
                grid.appendChild(el('line', { x1: x, x2: x, y1: m.ar, y2: m.ar + h }));
                marcas.appendChild(el('text', { x: x, y: alto - 8, 'text-anchor': 'middle' }, corto(v)));
            } else {
                var y = m.ar + h - p * h;
                grid.appendChild(el('line', { x1: m.iz, x2: m.iz + w, y1: y, y2: y }));
                marcas.appendChild(el('text', { x: m.iz - 8, y: y + 4, 'text-anchor': 'end' }, corto(v)));
            }
        }
        svg.appendChild(grid);
        svg.appendChild(marcas);

        var banda = (barras ? h : w) / g.length, hueco = 2;
        var grueso = Math.min(barras ? 26 : 56, (banda * 0.7 - hueco * (series.length - 1)) / series.length);
        var etiquetas = g.length <= 12;
        g.forEach(function (gr, i) {
            var inicio = i * banda + (banda - (grueso * series.length + hueco * (series.length - 1))) / 2;
            series.forEach(function (s, j) {
                var val = gr[s.k] || 0, largo = val / esc2.tope * (barras ? w : h), pos = inicio + j * (grueso + hueco), r = Math.min(4, grueso / 2, largo);
                var d = barras
                    ? 'M' + m.iz + ' ' + (m.ar + pos) + 'h' + Math.max(0, largo - r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r + 'v' + Math.max(0, grueso - 2 * r) + 'a' + r + ' ' + r + ' 0 0 1 ' + (-r) + ' ' + r + 'h' + (-Math.max(0, largo - r)) + 'z'
                    : 'M' + (m.iz + pos) + ' ' + (m.ar + h) + 'v' + (-Math.max(0, largo - r)) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + (-r) + 'h' + Math.max(0, grueso - 2 * r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r + 'v' + Math.max(0, largo - r) + 'z';
                var barra = el('path', { d: d, class: 'an-g-barra ' + s.clase + (gr.otros ? ' otros' : '') });
                barra.dataset.tip = gr.etiqueta + (gr.detalle ? ' · ' + gr.detalle : '') + '\n' + s.nombre + ': ' + AN.ui.dinero(val);
                svg.appendChild(barra);
                // Zona de toque más grande que la barra
                var zona = barras ? el('rect', { x: m.iz, y: m.ar + pos - 1, width: Math.max(largo, 8), height: grueso + 2, class: 'an-g-zona' })
                                  : el('rect', { x: m.iz + pos - 1, y: m.ar + h - Math.max(largo, 8), width: grueso + 2, height: Math.max(largo, 8), class: 'an-g-zona' });
                zona.dataset.tip = barra.dataset.tip;
                svg.appendChild(zona);
                if (etiquetas && val > 0) {
                    svg.appendChild(barras ? el('text', { x: m.iz + largo + 6, y: m.ar + pos + grueso / 2 + 4, class: 'an-g-valor' }, corto(val))
                                           : el('text', { x: m.iz + pos + grueso / 2, y: m.ar + h - largo - 6, 'text-anchor': 'middle', class: 'an-g-valor' }, corto(val)));
                }
            });
            var txt = gr.etiqueta.length > 22 ? gr.etiqueta.slice(0, 21) + '…' : gr.etiqueta;
            svg.appendChild(barras ? el('text', { x: m.iz - 8, y: m.ar + i * banda + banda / 2 + 4, 'text-anchor': 'end', class: 'an-g-cat' }, txt)
                                   : el('text', { x: m.iz + i * banda + banda / 2, y: m.ar + h + 18, 'text-anchor': 'middle', class: 'an-g-cat' }, g.length > 8 && txt.length > 10 ? txt.slice(0, 9) + '…' : txt));
        });
        svg.appendChild(el('line', barras ? { x1: m.iz, x2: m.iz, y1: m.ar, y2: m.ar + h, class: 'an-g-base' } : { x1: m.iz, x2: m.iz + w, y1: m.ar + h, y2: m.ar + h, class: 'an-g-base' }));
        cont.appendChild(svg);

        // Vista en tabla (los mismos datos)
        var total1 = g.reduce(function (t, x) { return t + x.v1; }, 0);
        tabla.innerHTML = '<table class="an-tabla"><thead><tr><th><div class="an-th"><span>' + esc($('anGraficaPor').selectedOptions[0].text) + '</span></div></th>'
            + series.map(function (s) { return '<th class="num"><div class="an-th"><span>' + esc(s.nombre) + '</span></div></th>'; }).join('')
            + '<th class="num"><div class="an-th"><span>%</span></div></th></tr></thead><tbody>'
            + g.map(function (x) {
                return '<tr class="an-fila"><td>' + esc(x.etiqueta) + (x.detalle ? ' <small class="an-ayuda">' + esc(x.detalle) + '</small>' : '') + '</td>'
                    + series.map(function (s) { return '<td class="num">' + AN.ui.dinero(x[s.k]) + '</td>'; }).join('')
                    + '<td class="num">' + (total1 ? (x.v1 / total1 * 100).toFixed(1) : '0.0') + ' %</td></tr>';
            }).join('') + '</tbody><tfoot><tr><td><b>Total</b></td>'
            + series.map(function (s) { return '<td class="num"><b>' + AN.ui.dinero(g.reduce(function (t, x) { return t + (x[s.k] || 0); }, 0)) + '</b></td>'; }).join('')
            + '<td class="num">100 %</td></tr></tfoot></table>';
    }

    // Tooltip de la barra (sigue al puntero)
    function tooltip(e) {
        var t = $('anGraficaTip'), z = e.target.closest && e.target.closest('[data-tip]');
        if (!z) { t.hidden = true; return; }
        t.textContent = z.dataset.tip;
        t.hidden = false;
        var caja = $('anGrafica').getBoundingClientRect();
        t.style.left = Math.min(e.clientX - caja.left + 14, caja.width - t.offsetWidth - 8) + 'px';
        t.style.top = (e.clientY - caja.top + 14) + 'px';
    }

    AN.grafica = {
        abrir: function (op) {
            st = op;
            $('anGraficaTitulo').textContent = op.titulo || 'Explosión de insumos';
            $('anGraficaNota').textContent = op.nota || '';
            $('anGraficaPor').value = 'tipo';
            if (!$('anGrafica').open) $('anGrafica').showModal();
            pintar();
        },
        cargando: function (titulo) {
            st = { filas: [] };
            $('anGraficaTitulo').textContent = titulo || 'Explosión de insumos';
            $('anGraficaNota').textContent = 'Cargando…';
            $('anGraficaLienzo').innerHTML = '';
            $('anGraficaTabla').innerHTML = '';
            $('anGraficaLeyenda').innerHTML = '';
            $('anGrafica').showModal();
        }
    };

    $('anGraficaPor').addEventListener('change', pintar);
    $('anGraficaForma').addEventListener('change', pintar);
    $('anGraficaVerTabla').addEventListener('change', function () { $('anGraficaTabla').hidden = !this.checked; });
    $('anGraficaLienzo').addEventListener('mousemove', tooltip);
    $('anGraficaLienzo').addEventListener('mouseleave', function () { $('anGraficaTip').hidden = true; });
    document.querySelectorAll('[data-grafica-cerrar]').forEach(function (b) { b.addEventListener('click', function () { $('anGrafica').close(); }); });
    $('anGrafica').addEventListener('click', function (e) { if (e.target === this) this.close(); });
    window.addEventListener('resize', AN.ui.retrasar(function () { if ($('anGrafica').open && st) pintar(); }, 150));
})(window.AcriNeo = window.AcriNeo || {});
