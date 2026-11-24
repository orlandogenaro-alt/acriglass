// Tablero de Bienvenido con los presupuestos de ACRINEO: llena las tarjetas de General y el de Proyectos
// (costo directo, precio de venta, sobrecosto, facturado y por facturar), por año, estatus y presupuesto.
// Todo llega en una sola consulta: api/acrineo/presupuestos.php?recurso=tablero (includes/acrineo/tablero.php).
(function () {
    var raiz = document.getElementById('tablero');
    if (!raiz) return;
    var $ = function (id) { return document.getElementById(id); };
    var NS = 'http://www.w3.org/2000/svg';
    var COLOR = { pagado: '#c98500', cobrado: '#199e70', otros: '#d95926', utilidad: '#3987e5', presupuesto: '#3987e5', ejercido: '#d95926', disponible: '#3a4660' };
    var CLAVE = 'acri-tablero';
    var corrida = 0;   // descarta respuestas de un filtro anterior

    function pedir(url) {
        return fetch(url).then(function (r) {
            if (r.status === 401) { location.href = 'index.php'; throw new Error('Sesión expirada'); }
            return r.json().catch(function () { throw new Error('Respuesta no válida del servidor (HTTP ' + r.status + ').'); });
        }).then(function (j) {
            if (!j.ok) throw new Error(j.error);
            return j;
        });
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function dinero(n) { return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function corto(n) {
        var a = Math.abs(n), s = n < 0 ? '-' : '';
        if (a >= 1e6) return s + (+(a / 1e6).toFixed(1)) + 'M';
        if (a >= 1e3) return s + (+(a / 1e3).toFixed(0)) + 'k';
        return s + Math.round(a);
    }
    function pct(n) { return (Math.round(n * 1000) / 10).toLocaleString('es-MX') + ' %'; }
    function guardar(v) { try { localStorage.setItem(CLAVE, JSON.stringify(v)); } catch (e) {} }
    function leer() { try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch (e) { return {}; } }

    function el(nombre, attrs, padre) {
        var n = document.createElementNS(NS, nombre);
        for (var k in attrs) n.setAttribute(k, attrs[k]);
        if (padre) padre.appendChild(n);
        return n;
    }
    function texto(padre, x, y, t, attrs) {
        var n = el('text', Object.assign({ x: x, y: y }, attrs || {}), padre);
        n.textContent = t;
        return n;
    }

    // ----- Tooltip compartido -----
    var tip = document.createElement('div');
    tip.className = 'tb-tip';
    tip.hidden = true;
    document.body.appendChild(tip);
    function conTip(nodo, html) {
        nodo.addEventListener('mousemove', function (e) {
            tip.innerHTML = html;
            tip.hidden = false;
            var x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
            tip.style.left = x + 'px';
            tip.style.top = (e.clientY + 14) + 'px';
        });
        nodo.addEventListener('mouseleave', function () { tip.hidden = true; });
    }

    // Escala "bonita" de 0 (o el mínimo negativo) al máximo
    function escala(min, max) {
        var rango = (max - min) || 1, paso = Math.pow(10, Math.floor(Math.log10(rango / 4)));
        [1, 2, 2.5, 5, 10].some(function (m) { if (rango / (paso * m) <= 5) { paso *= m; return true; } });
        return { min: Math.floor(min / paso) * paso, max: Math.ceil(max / paso) * paso || paso, paso: paso };
    }

    // Barra con la punta de datos redondeada (4px) y la base recta sobre el cero
    function barra(g, x, y0, y1, ancho, color) {
        var r = Math.min(4, Math.abs(y1 - y0), ancho / 2), arriba = y1 < y0;
        var d = arriba
            ? 'M' + x + ',' + y0 + 'V' + (y1 + r) + 'Q' + x + ',' + y1 + ' ' + (x + r) + ',' + y1 + 'H' + (x + ancho - r) + 'Q' + (x + ancho) + ',' + y1 + ' ' + (x + ancho) + ',' + (y1 + r) + 'V' + y0 + 'Z'
            : 'M' + x + ',' + y0 + 'V' + (y1 - r) + 'Q' + x + ',' + y1 + ' ' + (x + r) + ',' + y1 + 'H' + (x + ancho - r) + 'Q' + (x + ancho) + ',' + y1 + ' ' + (x + ancho) + ',' + (y1 - r) + 'V' + y0 + 'Z';
        return el('path', { d: d, fill: color }, g);
    }

    // grupos: [{ etiqueta, barras: [{ serie, nombre, valor }] }] · series: { clave: nombre } (leyenda si hay más de una)
    function graficaBarras(cont, grupos, series) {
        cont.innerHTML = '';
        var W = 560, H = 270, m = { t: 26, r: 10, b: 34, l: 46 };
        var valores = [0];
        grupos.forEach(function (g) { g.barras.forEach(function (b) { valores.push(b.valor); }); });
        var e = escala(Math.min.apply(null, valores), Math.max.apply(null, valores));
        var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'tb-svg', role: 'img' }, cont);
        var alto = H - m.t - m.b;
        function y(v) { return m.t + alto - (v - e.min) / (e.max - e.min) * alto; }

        for (var v = e.min; v <= e.max + e.paso / 2; v += e.paso) {
            el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'tb-cero' : 'tb-rejilla' }, svg);
            texto(svg, m.l - 6, y(v) + 4, corto(v), { class: 'tb-eje', 'text-anchor': 'end' });
        }
        var anchoGrupo = (W - m.l - m.r) / grupos.length;
        var porGrupo = grupos[0] ? grupos[0].barras.length : 1;
        var ancho = Math.min(56, anchoGrupo * 0.62 / porGrupo);
        grupos.forEach(function (g, i) {
            var x0 = m.l + anchoGrupo * i + (anchoGrupo - ancho * porGrupo - 2 * (porGrupo - 1)) / 2;
            g.barras.forEach(function (b, k) {
                var x = x0 + k * (ancho + 2);   // 2px entre barras vecinas
                if (b.valor) barra(svg, x, y(0), y(b.valor), ancho, COLOR[b.serie]);
                // Etiqueta directa del valor arriba (o abajo si es negativo)
                texto(svg, x + ancho / 2, b.valor < 0 ? y(b.valor) + 13 : y(b.valor) - 6, porGrupo > 1 ? corto(b.valor) : dinero(b.valor),
                      { class: 'tb-valor', 'text-anchor': 'middle' });
                var zona = el('rect', { x: x - 1, y: m.t, width: ancho + 2, height: alto, fill: 'transparent' }, svg);
                conTip(zona, '<b>' + esc(g.etiqueta) + '</b><br><i style="background:' + COLOR[b.serie] + '"></i>' + esc(b.nombre) + ': ' + dinero(b.valor));
            });
            texto(svg, m.l + anchoGrupo * (i + 0.5), H - m.b + 18, g.etiqueta, { class: 'tb-eje tb-eje-x', 'text-anchor': 'middle' });
        });
        if (Object.keys(series).length > 1) leyenda(cont, Object.keys(series).map(function (k) { return [k, series[k]]; }), true);
    }

    function leyenda(cont, items, arriba) {
        var l = document.createElement('div');
        l.className = 'tb-leyenda';
        l.innerHTML = items.map(function (it) {
            return '<span><i style="background:' + COLOR[it[0]] + '"></i>' + esc(it[1]) + (it[2] != null ? ' <b>' + it[2] + '</b>' : '') + '</span>';
        }).join('');
        if (arriba) cont.insertBefore(l, cont.firstChild); else cont.appendChild(l);
    }

    // partes: [{ serie, nombre, valor }] · centro: [número, texto]
    function graficaDona(cont, partes, centro, vacio) {
        cont.innerHTML = '';
        var total = partes.reduce(function (s, p) { return s + Math.max(0, p.valor); }, 0);
        var caja = document.createElement('div');
        caja.className = 'tb-dona';
        cont.appendChild(caja);
        var svg = el('svg', { viewBox: '0 0 200 200', class: 'tb-svg', role: 'img' }, caja);
        var R = 92, r = 60, cx = 100, cy = 100;
        if (!total) {
            el('circle', { cx: cx, cy: cy, r: (R + r) / 2, fill: 'none', stroke: COLOR.disponible, 'stroke-width': R - r }, svg);
            texto(svg, cx, cy + 5, vacio, { class: 'tb-centro-txt', 'text-anchor': 'middle' });
            return;
        }
        var a = -Math.PI / 2;
        function punto(rad, ang) { return (cx + rad * Math.cos(ang)).toFixed(2) + ',' + (cy + rad * Math.sin(ang)).toFixed(2); }
        partes.forEach(function (p) {
            if (p.valor <= 0) return;
            var f = p.valor / total, b = a + f * 2 * Math.PI;
            var nodo;
            if (f >= 0.9999) {
                nodo = el('circle', { cx: cx, cy: cy, r: (R + r) / 2, fill: 'none', stroke: COLOR[p.serie], 'stroke-width': R - r }, svg);
            } else {
                var g = b - a > Math.PI ? 1 : 0;
                nodo = el('path', { d: 'M' + punto(R, a) + 'A' + R + ',' + R + ' 0 ' + g + ' 1 ' + punto(R, b) +
                                        'L' + punto(r, b) + 'A' + r + ',' + r + ' 0 ' + g + ' 0 ' + punto(r, a) + 'Z',
                                    fill: COLOR[p.serie], class: 'tb-rebanada' }, svg);
            }
            conTip(nodo, '<i style="background:' + COLOR[p.serie] + '"></i>' + esc(p.nombre) + ': ' + dinero(p.valor) + ' · ' + pct(f));
            a = b;
        });
        texto(svg, cx, cy - 2, centro[0], { class: 'tb-centro', 'text-anchor': 'middle' });
        texto(svg, cx, cy + 18, centro[1], { class: 'tb-centro-txt', 'text-anchor': 'middle' });
        leyenda(caja, partes.map(function (p) { return [p.serie, p.nombre, pct(Math.max(0, p.valor) / total)]; }));
    }

    function kpi(clave, valor) {
        var b = raiz.querySelector('[data-kpi="' + clave + '"]');
        if (valor == null) { b.textContent = '—'; return; }
        b.textContent = dinero(valor);
        if (clave === 'utilidad') b.textContent = (valor < 0 ? '▼ ' : '▲ ') + b.textContent;
    }

    // ----- Tarjetas de General -----
    function pintarGeneral(g) {
        document.querySelectorAll('.tarjeta[data-indicador]').forEach(function (t) {
            var v = g[t.dataset.indicador];
            t.querySelector('.t-valor').textContent = /importe|facturado|por_facturar/.test(t.dataset.indicador) ? dinero(v) : v;
            t.querySelector('.t-nota').textContent = t.dataset.nota;
        });
    }
    function errorGeneral(msg) {
        document.querySelectorAll('.tarjeta[data-indicador]').forEach(function (t) { t.querySelector('.t-nota').textContent = '⚠ ' + msg; });
    }

    // ----- Proyectos -----
    // Suma de los presupuestos elegidos; lo facturado trae IVA y se compara sin IVA con el IVA de cada presupuesto
    function totales(lista) {
        var t = { costo: 0, venta: 0, con_iva: 0, facturado: 0, facturado_neto: 0, pedidos: 0 };
        lista.forEach(function (p) {
            var f = 1 + p.iva / 100;
            t.costo += p.costo_directo; t.venta += p.precio_venta; t.con_iva += p.precio_venta * f;
            t.facturado += p.facturado; t.facturado_neto += p.facturado / f; t.pedidos += p.pedidos;
        });
        t.sobrecosto = t.venta - t.costo;
        t.por_facturar = Math.max(0, t.con_iva - t.facturado);
        return t;
    }

    function pintar(lista) {
        var t = totales(lista);
        kpi('costo', t.costo);
        kpi('venta', t.venta);
        kpi('facturado', t.facturado);
        kpi('utilidad', t.sobrecosto);
        kpi('por_facturar', t.por_facturar);
        kpi('pedidos', t.pedidos);
        raiz.querySelector('[data-serie="utilidad"]').classList.toggle('perdida', t.sobrecosto < 0);

        graficaBarras($('grfFinanciero'), [
            ['Costo directo', 'pagado', t.costo], ['Precio de venta', 'cobrado', t.venta],
            ['Facturado sin IVA', 'otros', t.facturado_neto], ['Sobrecosto', 'utilidad', t.sobrecosto]
        ].map(function (b) { return { etiqueta: b[0], barras: [{ serie: b[1], nombre: b[0], valor: b[2] }] }; }), { uno: '' });

        // De qué se compone el precio de venta: costo directo y sobrecosto
        graficaDona($('grfFinPct'), [
            { serie: 'pagado', nombre: 'Costo directo', valor: t.costo },
            { serie: 'utilidad', nombre: 'Sobrecosto', valor: Math.max(0, t.sobrecosto) }
        ], t.venta ? [pct(t.sobrecosto / t.venta), 'de sobrecosto'] : ['—', 'sin precio'], 'Sin importes');

        // Los presupuestos con mayor precio de venta (hasta 6): presupuestado contra facturado, sin IVA
        var top = lista.filter(function (p) { return p.precio_venta || p.facturado; }).slice(0, 6);
        if (top.length) {
            graficaBarras($('grfPresupuesto'), top.map(function (p) {
                return { etiqueta: p.codigo || ('#' + p.id), barras: [
                    { serie: 'presupuesto', nombre: 'Precio de venta', valor: p.precio_venta },
                    { serie: 'ejercido', nombre: 'Facturado sin IVA', valor: p.facturado / (1 + p.iva / 100) }
                ] };
            }), { presupuesto: 'Precio de venta', ejercido: 'Facturado sin IVA' });
        } else {
            $('grfPresupuesto').innerHTML = '<p class="tb-estado">Sin presupuestos con importes.</p>';
        }

        graficaDona($('grfPresPct'), [
            { serie: 'ejercido', nombre: 'Facturado', valor: Math.min(t.facturado, t.con_iva) },
            { serie: 'disponible', nombre: 'Por facturar', valor: t.por_facturar }
        ], t.con_iva ? [pct(t.facturado / t.con_iva), 'facturado'] : ['—', 'sin precio'], 'Sin importes');
    }

    var datos = null;
    function mesActual() {
        var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; };
        var fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        return [d.getFullYear() + '-' + z(d.getMonth() + 1) + '-01', fin.getFullYear() + '-' + z(fin.getMonth() + 1) + '-' + z(fin.getDate())];
    }

    function consultar() {
        var id = ++corrida;
        var anio = $('tbAnio').value, estatus = $('tbEstatus').value, mes = mesActual();
        $('tbEstado').textContent = '⏳ Consultando ACRINEO…';
        pedir('api/acrineo/presupuestos.php?recurso=tablero&anio=' + encodeURIComponent(anio) + '&estatus=' + encodeURIComponent(estatus) +
              '&ini=' + mes[0] + '&fin=' + mes[1]).then(function (d) {
            if (id !== corrida) return;
            datos = d;
            pintarGeneral(d.general);
            llenarAnios(d.anios);
            llenarPresupuestos(d.presupuestos, leer().obra);
            $('tbEstado').textContent = d.avisos.length ? '⚠ ' + d.avisos.join(' · ')
                : (d.presupuestos.length ? '' : 'No hay presupuestos de ACRINEO de ese año con ese estatus.');
            elegir();
        }).catch(function (err) {
            if (id !== corrida) return;
            $('tbEstado').textContent = '⚠ ' + err.message;
            errorGeneral(err.message);
        });
    }

    function elegir() {
        if (!datos) return;
        var obra = $('tbObra').value;
        guardar({ anio: $('tbAnio').value, estatus: $('tbEstatus').value, obra: obra });
        pintar(obra === '0' ? datos.presupuestos : datos.presupuestos.filter(function (p) { return String(p.id) === obra; }));
    }

    function opcionAnio(a) {
        var sel = $('tbAnio');
        if (sel.querySelector('option[value="' + a + '"]')) return;
        sel.insertAdjacentHTML('beforeend', '<option value="' + a + '">' + a + '</option>');
        Array.prototype.slice.call(sel.options).sort(function (x, y) { return y.value - x.value; })
            .forEach(function (o) { sel.appendChild(o); });
    }
    function llenarAnios(anios) {
        var actual = $('tbAnio').value;
        anios.forEach(opcionAnio);
        $('tbAnio').value = actual;
    }

    function llenarPresupuestos(lista, elegida) {
        var sel = $('tbObra');
        sel.innerHTML = '<option value="0">Todos los presupuestos (' + lista.length + ')</option>' + lista.map(function (p) {
            return '<option value="' + p.id + '">' + esc((p.codigo ? p.codigo + ' · ' : '') + p.nombre + ' · ' + p.estatus_texto) + '</option>';
        }).join('');
        sel.value = lista.some(function (p) { return String(p.id) === String(elegida); }) ? elegida : '0';
    }

    // ----- Filtros -----
    var previo = leer(), hoy = new Date().getFullYear();
    opcionAnio(hoy);
    if (/^\d{4}$/.test(previo.anio || '')) opcionAnio(previo.anio);
    $('tbAnio').value = previo.anio || hoy;
    if (previo.estatus && $('tbEstatus').querySelector('option[value="' + previo.estatus + '"]')) $('tbEstatus').value = previo.estatus;
    $('tbAnio').addEventListener('change', consultar);
    $('tbEstatus').addEventListener('change', consultar);
    $('tbObra').addEventListener('change', elegir);
    consultar();
})();
