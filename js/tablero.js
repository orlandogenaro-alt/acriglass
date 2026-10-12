// Tablero de los proyectos en Bienvenido: financiero (pagado, cobrado, otros gastos, utilidad,
// por cobrar / por pagar) y presupuesto contra lo ejercido, por año y por obra.
// Lo de AW llega en una sola consulta (?accion=tablero); la cobranza se suma obra por obra con
// ?accion=facturacion porque cada folio se cruza con Microsip.
(function () {
    var raiz = document.getElementById('tablero');
    if (!raiz) return;
    var $ = function (id) { return document.getElementById(id); };
    var NS = 'http://www.w3.org/2000/svg';
    var COLOR = { pagado: '#c98500', cobrado: '#199e70', otros: '#d95926', utilidad: '#3987e5', presupuesto: '#3987e5', ejercido: '#c98500', disponible: '#3a4660' };
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

    // ----- Pintado -----
    function pintarPresupuesto(d) {
        var p = d.presupuesto, ppto = p.MP + p.MO + p.GO;
        var ejer = d.materiales + d.mano_obra + d.gastos;
        var nombres = { presupuesto: 'Presupuesto', ejercido: 'Ejercido' };
        graficaBarras($('grfPresupuesto'), [
            ['Materia prima', p.MP, d.materiales], ['Mano de obra', p.MO, d.mano_obra],
            ['Gastos de operación', p.GO, d.gastos], ['Total', ppto, ejer]
        ].map(function (g) {
            return { etiqueta: g[0], barras: [{ serie: 'presupuesto', nombre: 'Presupuesto', valor: g[1] }, { serie: 'ejercido', nombre: 'Ejercido', valor: g[2] }] };
        }), nombres);
        var sobre = ejer - ppto;
        graficaDona($('grfPresPct'), [
            { serie: 'ejercido', nombre: 'Ejercido', valor: ejer },
            { serie: 'disponible', nombre: sobre > 0 ? 'Sobregiro' : 'Disponible', valor: sobre > 0 ? 0 : ppto - ejer }
        ], ppto ? [pct(ejer / ppto), sobre > 0 ? 'sobregiro ' + corto(sobre) : 'ejercido'] : [corto(ejer), 'sin presupuesto'],
        'Sin presupuesto');
    }

    function pintarFinanciero(d, cob) {
        var pagado = d.materiales + d.mano_obra, otros = d.gastos;
        var cobrado = cob ? cob.cobrado : null;
        var utilidad = cob ? cobrado - pagado - otros : null;
        kpi('pagado', pagado);
        kpi('otros', otros);
        kpi('por_pagar', d.por_pagar);
        kpi('cobrado', cobrado);
        kpi('por_cobrar', cob ? cob.por_cobrar : null);
        kpi('utilidad', utilidad);
        raiz.querySelector('[data-serie="utilidad"]').classList.toggle('perdida', utilidad < 0);

        graficaBarras($('grfFinanciero'), [
            ['Pagado', 'pagado', pagado], ['Cobrado', 'cobrado', cobrado || 0],
            ['Otros gastos', 'otros', otros], [utilidad < 0 ? 'Pérdida' : 'Utilidad', 'utilidad', utilidad || 0]
        ].map(function (b) { return { etiqueta: b[0], barras: [{ serie: b[1], nombre: b[0], valor: b[2] }] }; }), { uno: '' });

        // A dónde se fue lo cobrado: pagado, otros gastos y lo que queda de utilidad
        graficaDona($('grfFinPct'), [
            { serie: 'pagado', nombre: 'Pagado', valor: pagado },
            { serie: 'otros', nombre: 'Otros gastos', valor: otros },
            { serie: 'utilidad', nombre: 'Utilidad', valor: Math.max(0, utilidad || 0) }
        ], cobrado ? [pct(utilidad / cobrado), utilidad < 0 ? 'de pérdida' : 'de margen'] : ['—', cob ? 'sin cobranza' : 'calculando cobranza…'],
        'Sin movimientos');
    }

    // ----- Cobranza: facturación de cada obra, de 4 en 4 -----
    function cobranza(ids, id, d) {
        var acum = { cobrado: 0, por_cobrar: 0 }, listos = 0, fallas = [], cola = ids.slice();
        if (!ids.length) { pintarFinanciero(d, acum); return; }
        function estado() {
            if (id !== corrida) return;
            $('tbEstado').textContent = listos < ids.length
                ? '⏳ Calculando cobranza con Microsip… ' + listos + ' de ' + ids.length + (ids.length === 1 ? ' obra' : ' obras')
                : (fallas.length ? '⚠ No se pudo leer la facturación de ' + fallas.length + ' obra(s): ' + fallas.slice(0, 3).join(' · ') : '');
            raiz.classList.toggle('cargando-cobranza', listos < ids.length);
        }
        function siguiente() {
            if (id !== corrida || !cola.length) return Promise.resolve();
            var obra = cola.shift();
            return pedir('api/obras.php?accion=facturacion&id=' + obra).then(function (j) {
                var saldo = 0;
                j.filas.forEach(function (f) { acum.cobrado += +f.creditos || 0; saldo += +f.saldo || 0; });
                acum.por_cobrar += Math.max(0, saldo);
            }).catch(function (err) {
                fallas.push('obra ' + obra + ': ' + err.message);
            }).then(function () {
                listos++;
                estado();
                return siguiente();
            });
        }
        estado();
        var hilos = [];
        for (var i = 0; i < Math.min(4, ids.length); i++) hilos.push(siguiente());
        Promise.all(hilos).then(function () { if (id === corrida) pintarFinanciero(d, acum); });
    }

    function consultar() {
        var id = ++corrida;
        var anio = $('tbAnio').value, obra = $('tbObra').value;
        guardar({ anio: anio, obra: obra });
        $('tbEstado').textContent = '⏳ Consultando AW-Management…';
        pedir('api/obras.php?accion=tablero&anio=' + anio + '&obra=' + obra).then(function (d) {
            if (id !== corrida) return;
            llenarObras(d.obras, obra);
            if (d.avisos.length) $('tbEstado').textContent = '⚠ ' + d.avisos.join(' · ');
            pintarPresupuesto(d);
            pintarFinanciero(d, null);
            cobranza(d.ids, id, d);
        }).catch(function (err) {
            if (id === corrida) $('tbEstado').textContent = '⚠ ' + err.message;
        });
    }

    function llenarObras(obras, elegida) {
        var sel = $('tbObra');
        sel.innerHTML = '<option value="0">Todas las obras del año (' + obras.length + ')</option>' + obras.map(function (o) {
            var t = (o.folio ? 'Folio ' + o.folio + ' · ' : '') + (o.nom_obra || o.proyecto || 'Obra ' + o.obra_id) + ' · ' + (o.estatus || '');
            return '<option value="' + o.obra_id + '">' + esc(t) + '</option>';
        }).join('');
        sel.value = obras.some(function (o) { return String(o.obra_id) === String(elegida); }) ? elegida : '0';
    }

    // ----- Filtros -----
    var previo = leer(), hoy = new Date().getFullYear();
    for (var a = hoy; a >= hoy - 8; a--) $('tbAnio').insertAdjacentHTML('beforeend', '<option>' + a + '</option>');
    $('tbAnio').value = previo.anio && +previo.anio >= hoy - 8 ? previo.anio : hoy;
    $('tbObra').innerHTML = '<option value="' + esc(previo.obra || 0) + '">…</option>';
    $('tbAnio').addEventListener('change', function () { $('tbObra').innerHTML = '<option value="0"></option>'; consultar(); });
    $('tbObra').addEventListener('change', consultar);
    consultar();
})();
