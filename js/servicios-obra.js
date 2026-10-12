// Pantallas del menú Servicios (servicio-obra.php?m=…). window.SO trae la definición del apartado
// (includes/servicios-obra.php): columnas, totales, agrupar, campos de captura y si suma la cobranza de Microsip.
(function () {
    var SO = window.SO;
    var $ = function (id) { return document.getElementById(id); };
    var token = document.querySelector('meta[name="acri-token"]').content;
    var API = 'api/servicios-obra.php';
    var CLAVE = 'acri-servicios-' + SO.usuario;

    var datos = null;          // respuesta del servidor
    var filas = [];            // renglones que se muestran (con la cobranza ya aplicada)
    var orden = { campo: null, dir: 1 };
    var corrida = 0;           // descarta respuestas de una consulta anterior
    var cobrando = false;
    var obrasCaptura = null;

    // ================= Utilidades =================
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
    function dinero(n) { return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function numero(n) { return (+n).toLocaleString('es-MX', { maximumFractionDigits: 3 }); }
    function pct(n) { return (Math.round(n * 10) / 10).toLocaleString('es-MX') + ' %'; }
    function fecha(v) {
        return /^\d{4}-\d{2}-\d{2}/.test(v || '') ? v.substr(8, 2) + '/' + v.substr(5, 2) + '/' + v.substr(0, 4) : (v == null ? '' : v);
    }
    function hoyIso() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
    function diasDesde(f) {
        if (!/^\d{4}-\d{2}-\d{2}/.test(f || '')) return null;
        return Math.floor((new Date(hoyIso()) - new Date(f.substr(0, 10))) / 864e5);
    }
    function leer() { try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch (e) { return {}; } }
    function guardar(v) { try { localStorage.setItem(CLAVE, JSON.stringify(Object.assign(leer(), v))); } catch (e) {} }
    function estado(t) { $('estado').textContent = t || ''; }

    function pedir(url, op) {
        op = op || {};
        op.headers = Object.assign({ 'X-Acri-Token': token }, op.headers || {});
        return fetch(url, op).then(function (r) {
            if (r.status === 401) { (window.top || window).location.href = 'index.php'; throw new Error('Sesión expirada'); }
            return r.json().catch(function () { throw new Error('Respuesta no válida del servidor (HTTP ' + r.status + ').'); });
        }).then(function (j) {
            if (!j.ok) throw new Error(j.error || 'Error desconocido.');
            return j;
        });
    }

    // Abre una obra o un presupuesto en su pestaña del sistema
    function abrir(modulo, id, titulo) {
        if (!id || window.parent === window) return;
        window.parent.postMessage({ tipo: 'abrir', modulo: modulo, id: id, titulo: titulo }, location.origin);
    }

    // Color del chip según el estatus
    var VERDE = /^(aprobad[oa]|pagada|terminad[oa]|devuelta|para construcci|fin produccion|activo|vigente|avance|entrega|0-30)/i;
    var ROJO = /^(vencid[oa]|rechazad[oa]|cancelad[oa]|atrasada|incidencia|seguridad|repetir|\+90|61-90)/i;
    var AMBAR = /^(pendiente|parcial|en proceso|en revisi|en tr|ingresado|por liberar|produccion|rentada|31-60|en preparaci|en elaboraci|por iniciar|instrucci)/i;
    function chip(v) {
        if (v == null || v === '') return '';
        var c = VERDE.test(v) ? 'ok' : ROJO.test(v) ? 'error' : AMBAR.test(v) ? 'token' : '';
        return '<span class="chip ' + c + '">' + esc(v) + '</span>';
    }

    function celda(f, col) {
        var v = f[col[1]], t = col[2];
        switch (t) {
            case 'dinero': return v == null ? '<td class="der so-nulo">—</td>' : '<td class="der' + (num(v) < 0 ? ' so-neg' : '') + '">' + dinero(num(v)) + '</td>';
            case 'num':    return '<td class="der">' + (v == null || v === '' ? '' : numero(num(v))) + '</td>';
            case 'pct':    return v == null ? '<td class="der so-nulo">—</td>' : '<td class="der' + (num(v) < 0 ? ' so-neg' : '') + '">' + pct(num(v)) + '</td>';
            case 'dias':   return '<td class="der' + (num(v) > 0 ? ' so-neg' : '') + '">' + (v == null ? '' : v) + '</td>';
            case 'fecha':  return '<td>' + fecha(v) + '</td>';
            case 'estatus': return '<td>' + chip(v) + '</td>';
            case 'barra':
                if (v == null) return '<td class="so-nulo">—</td>';
                var p = Math.max(0, Math.min(100, num(v)));
                return '<td><div class="so-pct' + (num(v) > 100 ? ' sobre' : '') + '"><i style="width:' + p + '%"></i><span>' + pct(num(v)) + '</span></div></td>';
            case 'archivo':
                return '<td>' + (v ? '<a class="so-archivo" target="_blank" href="' + API + '?accion=archivo&id=' + encodeURIComponent(f.id) + '">📎 ' + esc(v) + '</a>' : '') + '</td>';
        }
        if (col[1] === 'nombre' && f.nivel) return '<td class="corta" style="padding-left:' + (12 + f.nivel * 18) + 'px">' + esc(v) + '</td>';
        return '<td class="corta" title="' + esc(v) + '">' + esc(v) + '</td>';
    }

    // Texto de una celda para filtrar y exportar
    function texto(f, col) {
        var v = f[col[1]];
        if (v == null) return '';
        return col[2] === 'fecha' ? fecha(v) : String(v);
    }

    // Los cancelados y las subtareas (ya incluidas en su tarea) no suman
    function suma(f) { return f.suma !== false && !/^cancelad/i.test(f.estatus || ''); }

    // ================= Filtros =================
    var previo = leer(), anioHoy = new Date().getFullYear();
    $('anio').innerHTML = '<option value="0">' + (SO.filtro === 'presupuesto' ? 'Pendientes y en seguimiento' : 'Obras en proceso') + '</option>' +
        Array.apply(null, Array(9)).map(function (_, i) { return '<option>' + (anioHoy - i) + '</option>'; }).join('');
    $('anio').value = previo.anio != null && $('anio').querySelector('option[value="' + previo.anio + '"]') ? previo.anio : anioHoy;
    if ($('agrupar')) $('agrupar').value = previo['agrupar_' + SO.id] != null ? previo['agrupar_' + SO.id] : (SO.agrupar_inicial || '');

    function llenarObras(obras, elegida) {
        var sel = $('obra');
        if (!sel) return;
        sel.innerHTML = '<option value="0">' + ($('anio').value === '0' ? 'Todas las obras en proceso' : 'Todas las obras del año') + ' (' + obras.length + ')</option>' +
            obras.map(function (o) { return '<option value="' + o.id + '">' + esc(o.nombre + ' · ' + (o.estatus || '')) + '</option>'; }).join('');
        // Una obra de otro año elegida antes se conserva
        if (+elegida && !obras.some(function (o) { return String(o.id) === String(elegida); })) {
            sel.insertAdjacentHTML('beforeend', '<option value="' + esc(elegida) + '">Obra ' + esc(elegida) + '</option>');
        }
        sel.value = elegida || '0';
    }

    // ================= Consulta =================
    function consultar() {
        var id = ++corrida;
        var anio = $('anio').value, obra = $('obra') ? $('obra').value || 0 : 0;
        if ($('obra') && previo.obra && !datos) obra = previo.obra;   // primera carga: la obra de la última vez
        guardar({ anio: anio, obra: obra });
        estado('⏳ Consultando AW-Management…');
        $('kpis').innerHTML = '';
        return pedir(API + '?accion=datos&m=' + SO.id + '&anio=' + anio + '&obra=' + obra).then(function (j) {
            if (id !== corrida) return;
            datos = j;
            llenarObras(j.obras, obra);
            filas = j.filas || [];
            numerar();
            var avisos = (j.avisos || []).slice();
            estado(avisos.length ? '⚠ ' + avisos.join(' · ') : '');
            if (!j.puede && $('btnNuevo')) $('btnNuevo').hidden = true;
            pintar();
            if (SO.cobranza) cobranza(id, j.ids, avisos);
        }).catch(function (err) {
            if (id !== corrida) return;
            estado('⚠ ' + err.message);
            datos = { filas: [], ids: [], obras: [] };
            filas = [];
            pintar();
        });
    }

    // ----- Facturación y cobranza de Microsip, obra por obra (de 4 en 4, como el tablero de Bienvenido) -----
    function cobranza(id, ids, avisos) {
        var porObra = {}, cola = ids.slice(), listos = 0, fallas = [];
        cobrando = ids.length > 0;
        function avance() {
            if (id !== corrida) return;
            var t = listos < ids.length ? '⏳ Leyendo la facturación de Microsip… ' + listos + ' de ' + ids.length + (ids.length === 1 ? ' obra' : ' obras') : '';
            if (listos >= ids.length && fallas.length) t = '⚠ No se pudo leer la facturación de ' + fallas.length + ' obra(s): ' + fallas.slice(0, 3).join(' · ');
            estado([t].concat(avisos.length ? ['⚠ ' + avisos.join(' · ')] : []).filter(Boolean).join('  '));
        }
        function siguiente() {
            if (id !== corrida || !cola.length) return Promise.resolve();
            var obra = cola.shift();
            return pedir('api/obras.php?accion=facturacion&id=' + obra).then(function (j) {
                porObra[obra] = j.filas;
            }).catch(function (err) {
                fallas.push('obra ' + obra + ': ' + err.message);
            }).then(function () {
                listos++;
                avance();
                return siguiente();
            });
        }
        avance();
        var hilos = [];
        for (var i = 0; i < Math.min(4, ids.length); i++) hilos.push(siguiente());
        Promise.all(hilos).then(function () {
            if (id !== corrida) return;
            cobrando = false;
            aplicarCobranza(porObra);
            numerar();
            pintar();
        });
    }

    // Suma de cargos, créditos y saldo de una obra (con IVA, como Microsip)
    function resumen(docs) {
        var r = { cargos: 0, creditos: 0, saldo: 0 };
        (docs || []).forEach(function (d) { r.cargos += num(d.cargos); r.creditos += num(d.creditos); r.saldo += num(d.saldo); });
        r.saldo = Math.max(0, r.saldo);
        return r;
    }

    function aplicarCobranza(porObra) {
        if (SO.id === 'ganancia') {
            filas.forEach(function (f) {
                if (!porObra[f.obra_id]) return;
                var r = resumen(porObra[f.obra_id]);
                f.facturado = r.cargos / 1.16;
                f.cobrado = r.creditos / 1.16;
                f.por_cobrar = r.saldo / 1.16;
            });
        } else if (SO.id === 'ordenes') {
            // Lo cobrado de la obra se aplica a sus órdenes de la más antigua a la más reciente
            var resto = {};
            Object.keys(porObra).forEach(function (o) { resto[o] = resumen(porObra[o]).creditos / 1.16; });
            filas.slice().sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); }).forEach(function (f) {
                if (resto[f.obra_id] == null) return;
                f.cobrado = Math.min(num(f.importe), resto[f.obra_id]);
                resto[f.obra_id] -= f.cobrado;
                f.por_cobrar = Math.round((num(f.importe) - f.cobrado) * 100) / 100;
            });
        } else if (SO.id === 'cxc') {
            var nombres = {};
            (datos.obras || []).forEach(function (o) { nombres[o.id] = o.nombre; });
            filas = [];
            Object.keys(porObra).forEach(function (o) {
                porObra[o].forEach(function (d) {
                    if (num(d.saldo) <= 0.5) return;
                    var dias = diasDesde(d.fecha);
                    filas.push({
                        obra_id: +o, obra: nombres[o] || 'Obra ' + o, folio: d.folio, tipo_docto: d.tipo_docto, cliente: d.cliente, fecha: d.fecha,
                        factura: d.factura, dias: dias, cargos: num(d.cargos), creditos: num(d.creditos), saldo: num(d.saldo),
                        antiguedad: dias == null ? '' : dias <= 30 ? '0-30 días' : dias <= 60 ? '31-60 días' : dias <= 90 ? '61-90 días' : '+90 días'
                    });
                });
            });
        } else if (SO.id === 'resultados') {
            var t = { cargos: 0, creditos: 0, saldo: 0 };
            Object.keys(porObra).forEach(function (o) {
                var r = resumen(porObra[o]);
                t.cargos += r.cargos; t.creditos += r.creditos; t.saldo += r.saldo;
            });
            datos.cobranza = t;
        }
    }

    // ================= Pintar =================
    function numerar() { filas.forEach(function (f, i) { f._i = i; }); }

    function pintar() {
        if (SO.tipo === 'resultados') return pintarResultados();
        if (SO.tipo === 'gantt') return pintarGantt();
        pintarTabla();
    }

    function visibles() {
        var q = $('buscar').value.trim().toLowerCase();
        var lista = !q ? filas.slice() : filas.filter(function (f) {
            return SO.columnas.some(function (c) { return texto(f, c).toLowerCase().indexOf(q) >= 0; });
        });
        if (orden.campo) {
            var col = SO.columnas.filter(function (c) { return c[1] === orden.campo; })[0];
            var numerica = col && /dinero|num|pct|barra|dias/.test(col[2]);
            lista.sort(function (a, b) {
                var x = a[orden.campo], y = b[orden.campo];
                if (numerica) return ((x == null ? -Infinity : num(x)) - (y == null ? -Infinity : num(y))) * orden.dir;
                return String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), 'es', { numeric: true }) * orden.dir;
            });
        }
        return lista;
    }

    function sumar(lista) {
        var t = {};
        SO.totales.forEach(function (k) { t[k] = 0; });
        lista.forEach(function (f) {
            if (!suma(f)) return;
            SO.totales.forEach(function (k) { t[k] += num(f[k]); });
        });
        return t;
    }

    function filaTotal(t, etiqueta, clase) {
        return '<tr class="' + clase + '">' + SO.columnas.map(function (c, i) {
            if (i === 0) return '<td>' + esc(etiqueta) + '</td>';
            if (!(c[1] in t)) return '<td></td>';
            return '<td class="der">' + (c[2] === 'dinero' ? dinero(t[c[1]]) : numero(t[c[1]])) + '</td>';
        }).join('') + '</tr>';
    }

    function pintarTabla() {
        var lista = visibles();
        var grupo = $('agrupar') ? $('agrupar').value : '';
        var cab = SO.columnas.map(function (c) {
            var der = /dinero|num|pct|dias/.test(c[2]) ? ' class="der"' : '';
            var flecha = orden.campo === c[1] ? (orden.dir > 0 ? ' ▲' : ' ▼') : '';
            return '<th' + der + ' data-campo="' + esc(c[1]) + '">' + esc(c[0]) + flecha + '</th>';
        }).join('');

        var cuerpo = '';
        if (!lista.length) {
            var msg = !datos ? 'Cargando…' : datos.disponible === false ? 'Falta crear la tabla de Servicios (ver el aviso de arriba).'
                : filas.length ? 'Nada coincide con el filtro.' : SO.id === 'cxc' && cobrando ? 'Leyendo la facturación…' : 'Sin registros.';
            cuerpo = '<tr class="c-vacio"><td colspan="' + SO.columnas.length + '">' + msg + '</td></tr>';
        } else if (grupo) {
            var grupos = {}, claves = [];
            lista.forEach(function (f) {
                var k = f[grupo] == null || f[grupo] === '' ? '(Sin valor)' : String(f[grupo]);
                if (!grupos[k]) { grupos[k] = []; claves.push(k); }
                grupos[k].push(f);
            });
            if (!orden.campo) claves.sort(function (a, b) { return a.localeCompare(b, 'es', { numeric: true }); });
            claves.forEach(function (k) {
                cuerpo += '<tr class="so-grupo"><td colspan="' + SO.columnas.length + '">' + esc(k) + ' <small>' + grupos[k].length + '</small></td></tr>';
                cuerpo += grupos[k].map(filaHtml).join('');
                if (SO.totales.length) cuerpo += filaTotal(sumar(grupos[k]), 'Subtotal', 'so-subtotal');
            });
        } else {
            cuerpo = lista.map(filaHtml).join('');
        }
        var pie = SO.totales.length && lista.length ? '<tfoot>' + filaTotal(sumar(lista), 'Total (' + lista.length + ')', 'so-total') + '</tfoot>' : '';

        $('vista').innerHTML = '<div class="c-tabla so-tabla"><table class="c-grid"><thead><tr>' + cab + '</tr></thead><tbody>' + cuerpo + '</tbody>' + pie + '</table></div>';
        pintarKpis(lista);
        $('pie').textContent = lista.length + ' de ' + filas.length + ' renglones' + (pistaDobleClic() ? ' · ' + pistaDobleClic() : '');
    }

    function filaHtml(f) {
        var clase = (/^cancelad/i.test(f.estatus || '') ? 'inactiva ' : '') + (f.suma === false ? 'so-sub' : '');
        return '<tr data-i="' + f._i + '" class="' + clase + '">' + SO.columnas.map(function (c) { return celda(f, c); }).join('') + '</tr>';
    }

    function pistaDobleClic() {
        if (SO.tipo === 'registro') return datos && datos.puede ? 'doble clic para modificar' : '';
        if (SO.id === 'presupuesto') return 'doble clic abre el presupuesto';
        return 'doble clic abre la obra';
    }

    function pintarKpis(lista) {
        if (!SO.totales.length) { $('kpis').innerHTML = ''; return; }
        var t = sumar(lista);
        var kp = SO.totales.filter(function (k) {
            var c = SO.columnas.filter(function (x) { return x[1] === k; })[0];
            return c && c[2] === 'dinero';
        }).slice(0, 5);
        $('kpis').innerHTML = kp.map(function (k) {
            var c = SO.columnas.filter(function (x) { return x[1] === k; })[0];
            var pendiente = cobrando && /facturado|cobrado|por_cobrar|saldo|cargos|creditos/.test(k);
            return '<div class="so-kpi"><h3>' + esc(c[0]) + '</h3><b' + (t[k] < 0 ? ' class="so-neg"' : '') + '>' + (pendiente ? '…' : dinero(t[k])) + '</b></div>';
        }).join('');
    }

    // ----- Estado de resultados -----
    function pintarResultados() {
        var c = datos && datos.costos;
        if (!c) { $('vista').innerHTML = '<p class="so-vacio">' + (datos ? 'Sin obras en el filtro.' : 'Cargando…') + '</p>'; return; }
        var cob = datos.cobranza;
        var ventasReal = cob ? cob.cargos / 1.16 : null;
        var generales = num(datos.generales);
        var directoP = c.pres_mp + c.pres_mo + c.pres_go;
        var directoR = c.materiales + c.mano_obra + c.gastos + c.renta + c.subcontratos + c.proveedores;
        var indirR = c.admin + c.indirectos + generales;
        var brutaR = ventasReal == null ? null : ventasReal - directoR;
        var operR = ventasReal == null ? null : ventasReal - directoR - indirR;
        var unaObra = datos.ids && datos.ids.length === 1;
        var pctAdmin = unaObra && datos.por_obra ? datos.por_obra[datos.ids[0]].pct_admin : null;

        // [concepto, presupuesto, real, clase]
        var L = [
            ['INGRESOS', null, null, 'titulo'],
            ['Ventas (sin IVA)', c.venta, ventasReal, ''],
            ['COSTO DIRECTO', null, null, 'titulo'],
            ['Materia prima (salidas de material)', c.pres_mp, c.materiales, ''],
            ['Mano de obra', c.pres_mo, c.mano_obra, ''],
            ['Gastos de operación de obra', c.pres_go, c.gastos, ''],
            ['Renta de maquinaria', 0, c.renta, ''],
            ['Subcontratos (devengado)', 0, c.subcontratos, ''],
            ['Proveedores (cuentas por pagar)', 0, c.proveedores, ''],
            ['Total costo directo', directoP, directoR, 'total'],
            ['UTILIDAD BRUTA', c.venta - directoP, brutaR, 'resultado'],
            ['GASTOS INDIRECTOS', null, null, 'titulo'],
            ['Gastos de administración de obra' + (pctAdmin != null ? ' (' + pct(pctAdmin) + ' s/ materiales y mano de obra)' : ' (% de cada obra)'), 0, c.admin, ''],
            ['Gastos indirectos de la obra', 0, c.indirectos, '']
        ];
        if (!unaObra && generales) L.push(['Gastos indirectos generales del año', 0, generales, '']);
        L.push(['Total gastos indirectos', 0, indirR, 'total']);
        L.push(['UTILIDAD DE OPERACIÓN', c.venta - directoP, operR, 'resultado']);

        var base = ventasReal || 0;
        var html = '<div class="c-tabla so-tabla so-er"><table class="c-grid"><thead><tr><th>Concepto</th><th class="der">Presupuesto</th>' +
            '<th class="der">Real</th><th class="der">Diferencia</th><th class="der">% de ventas</th></tr></thead><tbody>' +
            L.map(function (l) {
                if (l[3] === 'titulo') return '<tr class="so-grupo"><td colspan="5">' + esc(l[0]) + '</td></tr>';
                var p = l[1], r = l[2];
                var dif = r == null || p == null ? null : (l[3] === 'resultado' || l[0].indexOf('Ventas') === 0 ? r - p : p - r);
                return '<tr class="' + (l[3] ? 'so-' + l[3] : '') + '"><td>' + esc(l[0]) + '</td>' +
                    '<td class="der">' + (p == null ? '' : dinero(p)) + '</td>' +
                    '<td class="der' + (r < 0 ? ' so-neg' : '') + '">' + (r == null ? (cobrando ? '…' : '—') : dinero(r)) + '</td>' +
                    '<td class="der' + (dif < 0 ? ' so-neg' : '') + '">' + (dif == null ? '' : dinero(dif)) + '</td>' +
                    '<td class="der">' + (r == null || !base ? '' : pct(r / base * 100)) + '</td></tr>';
            }).join('') + '</tbody></table></div>';
        $('vista').innerHTML = html;
        $('kpis').innerHTML = [
            ['Ventas reales', ventasReal], ['Costo directo', directoR], ['Utilidad de operación', operR],
            ['Margen', ventasReal ? operR / ventasReal * 100 : null, true], ['Cobrado', cob ? cob.creditos : null], ['Por cobrar', cob ? cob.saldo : null]
        ].map(function (k) {
            var v = k[1] == null ? (cobrando ? '…' : '—') : k[2] ? pct(k[1]) : dinero(k[1]);
            return '<div class="so-kpi"><h3>' + esc(k[0]) + '</h3><b' + (k[1] < 0 ? ' class="so-neg"' : '') + '>' + v + '</b></div>';
        }).join('');
        $('pie').textContent = (unaObra ? 'Una obra' : (datos.ids || []).length + ' obras') +
            ' · Diferencia: presupuesto − real en costos (negativo = sobregiro), real − presupuesto en ventas y utilidad · Cobrado y por cobrar con IVA.';
    }

    // ----- Gantt de obras -----
    var abiertas = {};   // obra_id => tareas cargadas
    function pintarGantt() {
        var obras = visibles().filter(function (o) { return o.fecha_ini; });
        if (!obras.length) { $('vista').innerHTML = '<p class="so-vacio">' + (datos ? 'Sin obras con fecha de inicio en el filtro.' : 'Cargando…') + '</p>'; $('kpis').innerHTML = ''; return; }
        var dia = 864e5;
        function t(f) { return new Date(f.substr(0, 10) + 'T00:00:00').getTime(); }
        function finDe(o, ini) { return o.fecha_fin && t(o.fecha_fin) >= ini ? t(o.fecha_fin) : ini + 30 * dia; }
        var min = Infinity, max = -Infinity;
        obras.forEach(function (o) { var a = t(o.fecha_ini); min = Math.min(min, a); max = Math.max(max, finDe(o, a)); });
        var a0 = new Date(min); min = new Date(a0.getFullYear(), a0.getMonth(), 1).getTime();
        var a1 = new Date(max); max = new Date(a1.getFullYear(), a1.getMonth() + 1, 1).getTime();
        var span = max - min;
        function x(ms) { return Math.max(0, Math.min(100, (ms - min) / span * 100)); }

        var meses = '', m = new Date(min);
        while (m.getTime() < max) {
            var sig = new Date(m.getFullYear(), m.getMonth() + 1, 1);
            meses += '<span style="left:' + x(m.getTime()) + '%;width:' + (x(sig.getTime()) - x(m.getTime())) + '%">' +
                m.toLocaleDateString('es-MX', { month: 'short' }) + (m.getMonth() === 0 || meses === '' ? ' ' + m.getFullYear() : '') + '</span>';
            m = sig;
        }
        var hoy = Date.now(), lineaHoy = hoy > min && hoy < max ? '<i class="so-hoy" style="left:' + x(hoy) + '%"></i>' : '';
        function barra(ini, fin, avance, color, titulo) {
            return '<div class="so-g-barra" style="left:' + x(ini) + '%;width:' + Math.max(0.6, x(fin) - x(ini)) + '%;' + (color ? '--c:' + color : '') + '" title="' + esc(titulo) + '">' +
                '<i style="width:' + Math.max(0, Math.min(100, num(avance))) + '%"></i><span>' + pct(num(avance)) + '</span></div>';
        }
        var colorEstatus = { 'Planificacion': '#64748b', 'Ejecucion': '#3b82f6', 'Obra Terminada': '#22c55e', 'Finalizacion': '#0f766e' };
        var html = '<div class="so-gantt"><div class="so-g-fila so-g-cab"><div class="so-g-nombre">Obra</div><div class="so-g-pista so-g-meses">' + meses + '</div></div>';
        obras.forEach(function (o) {
            var ini = t(o.fecha_ini), fin = finDe(o, ini);
            html += '<div class="so-g-fila so-g-obra" data-obra="' + o.obra_id + '"><div class="so-g-nombre" title="' + esc(o.obra) + '">' +
                '<b>' + (abiertas[o.obra_id] ? '▾' : '▸') + '</b> ' + esc(o.obra) + ' ' + chip(o.estatus) + '</div><div class="so-g-pista">' + lineaHoy +
                barra(ini, fin, o.avance, colorEstatus[o.estatus], o.obra + ' · ' + fecha(o.fecha_ini) + ' al ' + fecha(o.fecha_fin)) + '</div></div>';
            var ts = abiertas[o.obra_id];
            if (ts && ts.cargando) html += '<div class="so-g-fila so-g-tarea"><div class="so-g-nombre">Cargando tareas…</div><div class="so-g-pista"></div></div>';
            else if (ts && ts.aviso) html += '<div class="so-g-fila so-g-tarea"><div class="so-g-nombre so-nulo">' + esc(ts.aviso) + '</div><div class="so-g-pista"></div></div>';
            else if (ts) ts.lista.forEach(function (k) {
                var i0 = k.ini_real ? t(k.ini_real) : ini, f0 = k.fin_real ? t(k.fin_real) : i0 + dia;
                html += '<div class="so-g-fila so-g-tarea"><div class="so-g-nombre" style="padding-left:' + (22 + (k.padre_uid ? 16 : 0)) + 'px" title="' + esc(k.nombre) + '">' +
                    esc((k.clave ? k.clave + ' · ' : '') + k.nombre) + '</div><div class="so-g-pista">' + lineaHoy +
                    barra(i0, Math.max(f0, i0 + dia), k.avance, k.color, k.nombre + ' · ' + fecha(k.ini_real) + ' al ' + fecha(k.fin_real) + (k.responsable ? ' · ' + k.responsable : '')) + '</div></div>';
            });
        });
        $('vista').innerHTML = html + '</div>';
        var prom = obras.reduce(function (s, o) { return s + num(o.avance); }, 0) / obras.length;
        var atras = obras.filter(function (o) { return o.fecha_fin && o.fecha_fin.substr(0, 10) < hoyIso() && num(o.avance) < 100 && o.estatus !== 'Finalizacion'; }).length;
        $('kpis').innerHTML = '<div class="so-kpi"><h3>Obras</h3><b>' + obras.length + '</b></div>' +
            '<div class="so-kpi"><h3>Avance promedio</h3><b>' + pct(prom) + '</b></div>' +
            '<div class="so-kpi"><h3>Con fecha fin vencida</h3><b' + (atras ? ' class="so-neg"' : '') + '>' + atras + '</b></div>';
        $('pie').textContent = 'Clic en una obra muestra sus Conceptos/Tareas · doble clic abre la obra · la línea marca hoy.';
    }

    function alternarObra(id) {
        if (abiertas[id]) { delete abiertas[id]; pintarGantt(); return; }
        abiertas[id] = { cargando: true };
        pintarGantt();
        pedir(API + '?accion=tareas&obra=' + id).then(function (j) {
            abiertas[id] = { lista: j.tareas, aviso: j.aviso };
        }).catch(function (err) {
            abiertas[id] = { lista: [], aviso: err.message };
        }).then(pintarGantt);
    }

    // ================= Exportar e imprimir =================
    function exportar() {
        var cols, rows;
        if (SO.tipo === 'resultados') {
            var trs = $('vista').querySelectorAll('tr');
            rows = Array.prototype.map.call(trs, function (tr) {
                return Array.prototype.map.call(tr.children, function (td) { return td.textContent; });
            });
        } else {
            var lista = visibles();
            if (!lista.length) { alert('No hay renglones para exportar.'); return; }
            cols = SO.columnas;
            rows = [cols.map(function (c) { return c[0]; })].concat(lista.map(function (f) {
                return cols.map(function (c) {
                    var v = f[c[1]];
                    if (v == null) return '';
                    return /dinero|num|pct|barra/.test(c[2]) ? (Math.round(num(v) * 100) / 100) : texto(f, c);
                });
            }));
        }
        var csv = rows.map(function (r) { return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
        a.download = SO.titulo.replace(/\s+/g, '_') + '_' + ($('anio').value === '0' ? 'en_proceso' : $('anio').value) + '.csv';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }

    function imprimir() {
        var sel = $('obra');
        $('impreso').textContent = ($('anio').value === '0' ? $('anio').options[0].text : 'Año ' + $('anio').value) +
            (sel && sel.value !== '0' ? ' · ' + sel.options[sel.selectedIndex].text : '') + ' · Impreso el ' + new Date().toLocaleString('es-MX') + ' por ' + SO.usuario;
        window.print();
    }

    // ================= Captura (apartados de registro) =================
    function cargarObrasCaptura() {
        if (obrasCaptura) return Promise.resolve(obrasCaptura);
        return pedir(API + '?accion=obras_captura').then(function (j) { obrasCaptura = j.obras; return obrasCaptura; });
    }

    function campoHtml(c, f) {
        var campo = c[0], etiqueta = c[1], tipo = c[2], ops = c[3] || [], req = c[4];
        var v = campo === 'estatus' && 'estatus_captura' in f ? f.estatus_captura : f[campo];
        if (v == null) v = '';
        var nom = ' name="' + campo + '" id="cp_' + campo + '"' + (req ? ' required' : '');
        var completo = tipo === 'texto' || tipo === 'archivo' || tipo === 'obra' || campo === 'concepto';
        var input;
        switch (tipo) {
            case 'obra':
                input = '<select' + nom + '><option value="">' + (SO.sin_obra ? '(General, sin obra)' : 'Elige la obra…') + '</option>' +
                    obrasCaptura.map(function (o) { return '<option value="' + o.id + '"' + (String(o.id) === String(v) ? ' selected' : '') + '>' + esc(o.nombre + ' · ' + o.estatus) + '</option>'; }).join('') +
                    (v && !obrasCaptura.some(function (o) { return String(o.id) === String(v); }) ? '<option value="' + esc(v) + '" selected>' + esc(f.obra || 'Obra ' + v) + '</option>' : '') + '</select>';
                break;
            case 'texto': input = '<textarea' + nom + ' rows="3">' + esc(v) + '</textarea>'; break;
            case 'fecha': input = '<input type="date"' + nom + ' value="' + esc(String(v).substr(0, 10)) + '">'; break;
            case 'num': case 'dinero': case 'pct':
                input = '<input type="number" min="0"' + (tipo === 'pct' ? ' max="100"' : '') + ' step="any"' + nom + ' value="' + esc(v === '' ? '' : num(v)) + '">';
                break;
            case 'lista':
                input = '<select' + nom + '>' + ops.map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
                break;
            case 'combo':
                input = '<input type="text" list="dl_' + campo + '"' + nom + ' value="' + esc(v) + '"><datalist id="dl_' + campo + '">' +
                    ops.map(function (o) { return '<option value="' + esc(o) + '">'; }).join('') + '</datalist>';
                break;
            case 'archivo':
                input = (f.archivo ? '<small>Actual: <a class="so-archivo" target="_blank" href="' + API + '?accion=archivo&id=' + f.id + '">📎 ' + esc(f.archivo) + '</a> ' +
                    '<label class="so-quitar"><input type="checkbox" name="quitar_archivo" value="1"> Quitar</label></small>' : '') +
                    '<input type="file" name="archivo" id="cp_archivo"><small>Hasta ' + SO.max_mb + ' MB' + (f.archivo ? '; uno nuevo reemplaza al actual' : '') + '.</small>';
                break;
            default: input = '<input type="text"' + nom + ' value="' + esc(v) + '">';
        }
        return '<label class="c-campo' + (completo ? ' completo' : '') + '"><span>' + esc(etiqueta) + (req ? ' *' : '') + '</span>' + input + '</label>';
    }

    function abrirDialogo(f) {
        var nuevo = !f;
        f = f || { fecha: hoyIso(), obra_id: $('obra') && $('obra').value !== '0' ? $('obra').value : '' };
        var puede = datos && datos.puede;
        cargarObrasCaptura().then(function () {
            $('dlgTitulo').textContent = (nuevo ? 'Nuevo · ' : (puede ? 'Modificar · ' : 'Consultar · ')) + SO.titulo + (f.folio && SO.id === 'bitacora' ? ' · Nota ' + f.folio : '');
            $('campos').innerHTML = SO.campos.map(function (c) { return campoHtml(c, f); }).join('') +
                (nuevo ? '' : '<p class="c-campo completo so-quien"><small>Modificado ' + esc(fecha(String(f.fecha_mod || '').substr(0, 10))) + ' por ' + esc(f.usuario_mod || f.usuario_creacion || '—') + '</small></p>');
            $('dlgResultado').textContent = '';
            $('dlgResultado').className = 'c-resultado';
            $('dlgEliminar').hidden = nuevo || !puede;
            $('dlgGuardar').hidden = !puede;
            $('campos').querySelectorAll('input, select, textarea').forEach(function (el) { el.disabled = !puede; });
            $('formulario').dataset.id = nuevo ? 0 : f.id;
            // Renta: importe = periodos × tarifa
            if (SO.id === 'renta') {
                ['cp_cantidad', 'cp_precio'].forEach(function (k) {
                    $(k).addEventListener('input', function () { $('cp_importe').value = Math.round(num($('cp_cantidad').value) * num($('cp_precio').value) * 100) / 100; });
                });
            }
            $('dialogo').showModal();
        }).catch(function (err) { estado('⚠ ' + err.message); });
    }

    function guardarDialogo(e) {
        e.preventDefault();
        var form = $('formulario');
        var fd = new FormData(form);
        fd.append('m', SO.id);
        fd.append('id', form.dataset.id || 0);
        var archivo = $('cp_archivo') && $('cp_archivo').files[0];
        if (archivo && archivo.size > SO.max_mb * 1048576) { mensajeDlg('El archivo pesa más de ' + SO.max_mb + ' MB.', 'error'); return; }
        $('dlgGuardar').disabled = true;
        mensajeDlg('Guardando…', '');
        pedir(API + '?accion=guardar', { method: 'POST', body: fd }).then(function () {
            $('dialogo').close();
            consultar();
        }).catch(function (err) {
            mensajeDlg(err.message, 'error');
        }).then(function () { $('dlgGuardar').disabled = false; });
    }

    function eliminar() {
        if (!confirm('¿Eliminar este registro de ' + SO.titulo + '? No se puede deshacer.')) return;
        pedir(API + '?accion=eliminar', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ m: SO.id, id: +$('formulario').dataset.id })
        }).then(function () {
            $('dialogo').close();
            consultar();
        }).catch(function (err) { mensajeDlg(err.message, 'error'); });
    }

    function mensajeDlg(t, clase) { $('dlgResultado').textContent = t; $('dlgResultado').className = 'c-resultado ' + clase; }

    // ================= Eventos =================
    $('anio').addEventListener('change', function () { if ($('obra')) $('obra').value = '0'; previo.obra = 0; consultar(); });
    if ($('obra')) $('obra').addEventListener('change', function () { abiertas = {}; consultar(); });
    if ($('agrupar')) $('agrupar').addEventListener('change', function () { var g = {}; g['agrupar_' + SO.id] = this.value; guardar(g); pintar(); });
    $('buscar').addEventListener('input', pintar);
    $('btnConsultar').addEventListener('click', consultar);
    $('btnExcel').addEventListener('click', exportar);
    $('btnImprimir').addEventListener('click', imprimir);

    $('vista').addEventListener('click', function (e) {
        var th = e.target.closest('th[data-campo]');
        if (th) {
            orden.dir = orden.campo === th.dataset.campo ? -orden.dir : 1;
            orden.campo = th.dataset.campo;
            pintar();
            return;
        }
        var g = e.target.closest('.so-g-obra');
        if (g) { alternarObra(+g.dataset.obra); return; }
        var tr = e.target.closest('tr[data-i]');
        if (tr) {
            $('vista').querySelectorAll('tr.sel').forEach(function (x) { x.classList.remove('sel'); });
            tr.classList.add('sel');
        }
    });
    $('vista').addEventListener('dblclick', function (e) {
        var g = e.target.closest('.so-g-obra');
        if (g) {
            var o = filas.filter(function (x) { return x.obra_id === +g.dataset.obra; })[0];
            abrir('Obras', +g.dataset.obra, o ? o.obra : 'Obra');
            return;
        }
        var tr = e.target.closest('tr[data-i]');
        if (!tr) return;
        var f = filas[+tr.dataset.i];
        if (!f) return;
        if (SO.tipo === 'registro' && f.editable !== false) { abrirDialogo(f); return; }
        if (SO.id === 'presupuesto') { abrir('Presupuestos de Obra', f.id, 'Presupuesto ' + f.folio); return; }
        if (f.obra_id) abrir('Obras', f.obra_id, f.obra || 'Obra');
    });

    if ($('btnNuevo')) {
        $('btnNuevo').addEventListener('click', function () { abrirDialogo(null); });
        $('formulario').addEventListener('submit', guardarDialogo);
        $('dlgCancelar').addEventListener('click', function () { $('dialogo').close(); });
        $('dlgEliminar').addEventListener('click', eliminar);
    }

    consultar();
})();
