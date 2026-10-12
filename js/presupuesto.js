(function () {
    var IVA = 0.16;
    var NOMBRES = { mp: 'Materia Prima', mo: 'Mano de Obra', go: 'Gastos de Operacion', ct: 'Conceptos/Tareas y Previsualización' };
    var AYUDAS = {
        grid: 'Ctrl + I para agregar un nuevo Concepto',
        ct: 'Se generan en automático con los conceptos de Materia Prima, Mano de Obra y Gastos de Operacion'
    };

    // Conceptos por sección (en memoria hasta tener base de datos)
    var datos = { mp: [], mo: [], go: [] };
    // Catálogos de conceptos (Administrador › Conceptos de …): { mp: [{nombre, activo}], … }
    var CATALOGO = window.ACRI_CONCEPTOS || {};
    var consecutivo = 0;
    var seccion = 'mp';
    var subtotalManual = false;
    var cambios = false;
    // Un presupuesto guardado se abre en solo lectura hasta presionar «Modificar»
    var soloLectura = false;
    var creador = '';   // usuario que capturó el presupuesto («Elaboro» en la impresión)

    var $ = function (id) { return document.getElementById(id); };
    var tbody = document.querySelector('#grid tbody');

    function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
    function fmt(n) {
        return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function suma(lista) { return lista.reduce(function (s, r) { return s + num(r.presupuesto); }, 0); }
    function marcarCambio() { cambios = true; }

    // ---------- Rejilla ----------
    function render() {
        renderExtras();
        if (seccion === 'ct') { renderCt(); return; }
        var filas = datos[seccion];
        if (!filas.length) {
            tbody.innerHTML = '<tr class="vacio-fila"><td colspan="10">Sin conceptos. Presiona Ctrl + I para agregar uno.</td></tr>';
            calcularTotales();
            // Los cálculos pudieron agregar un renglón fijo a esta sección
            if (datos[seccion].length) render();
            return;
        }
        var dis = soloLectura ? ' disabled' : '';
        tbody.innerHTML = filas.map(function (r, i) {
            return '<tr data-i="' + i + '">' +
                '<td class="sel-col"></td>' +
                '<td class="id">' + r.id + '</td>' +
                '<td>' + campoConcepto(r.concepto) + '</td>' +
                '<td><input type="number" step="0.01" class="num" data-campo="presupuesto" value="' + (r.presupuesto || '') + '"' + dis + '></td>' +
                '<td class="ro" data-calc="subtotal"></td>' +
                '<td class="ro" data-calc="total"></td>' +
                '<td class="ro" data-calc="pct"></td>' +
                '<td class="chk"><input type="checkbox" data-campo="importar"' + (r.importar ? ' checked' : '') + dis + '></td>' +
                '<td><input type="text" data-campo="folio" value="' + escapar(r.folio) + '"' + dis + '></td>' +
                '<td><button class="borrar" title="Quitar concepto">✕</button></td>' +
                '</tr>';
        }).join('');
        refrescarCalculados();
    }

    // Lista desplegable con el catálogo de la sección; sin catálogo, texto libre.
    // Un concepto dado de baja (o que ya no está en el catálogo) se conserva en los presupuestos que lo usan.
    function campoConcepto(actual) {
        var lista = CATALOGO[seccion] || [];
        var dis = soloLectura ? ' disabled' : '';
        if (!lista.length) return '<input type="text" data-campo="concepto" value="' + escapar(actual) + '"' + dis + '>';
        var hay = false;
        var opciones = lista.map(function (c) {
            var es = c.nombre.trim().toUpperCase() === String(actual || '').trim().toUpperCase();
            if (es) hay = true;
            if (!c.activo && !es) return '';
            return '<option' + (es ? ' selected' : '') + '>' + escapar(c.nombre) + '</option>';
        }).join('');
        if (actual && !hay) opciones = '<option selected>' + escapar(actual) + '</option>' + opciones;
        return '<select data-campo="concepto"' + dis + '><option value=""' + (actual ? '' : ' selected') + '>— Selecciona —</option>' + opciones + '</select>';
    }

    function escapar(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function refrescarCalculados() {
        var subtotal = calcularTotales();
        if (seccion === 'ct') return;
        var filas = datos[seccion];
        // Los cálculos agregaron un renglón fijo (mano de obra, comisiones, seguro): se vuelve a pintar
        if (tbody.querySelectorAll('tr[data-i]').length !== filas.length) { render(); return; }
        tbody.querySelectorAll('tr[data-i]').forEach(function (tr) {
            var r = filas[tr.dataset.i];
            var imp = num(r.presupuesto);
            // Conceptos de cálculo automático y renglones fijos: el importe no se captura
            var inp = tr.querySelector('[data-campo="presupuesto"]');
            inp.readOnly = !!r.calc;
            inp.title = r.calc === 'auto' ? 'Cálculo automático (porcentaje del catálogo de conceptos)'
                      : r.calc === 'fijo' ? 'Se calcula con los empleados, comisiones o anexo de seguro' : '';
            tr.classList.toggle('calc', !!r.calc);
            if (r.calc && document.activeElement !== inp) inp.value = r.presupuesto;
            tr.querySelector('[data-calc="subtotal"]').textContent = fmt(imp);
            tr.querySelector('[data-calc="total"]').textContent = fmt(imp);
            // Igual que Form46: % del concepto respecto al subtotal del presupuesto
            tr.querySelector('[data-calc="pct"]').textContent = subtotal > 0 ? fmt(imp / subtotal * 100) + ' %' : '0.00 %';
        });
    }

    function agregarConcepto() {
        if (soloLectura) { avisoSoloLectura(); return; }
        if (seccion === 'ct') { ct.abrirNuevo(); return; }
        datos[seccion].push({ id: ++consecutivo, concepto: '', presupuesto: 0, importar: false, folio: '' });
        marcarCambio();
        render();
        var ultimo = tbody.querySelector('tr:last-child [data-campo="concepto"]');
        if (ultimo) ultimo.focus();
    }

    tbody.addEventListener('input', function (e) {
        var campo = e.target.dataset.campo;
        if (!campo) return;
        var r = datos[seccion][e.target.closest('tr').dataset.i];
        r[campo] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        marcarCambio();
        if (campo === 'presupuesto' || campo === 'concepto') refrescarCalculados();
    });

    tbody.addEventListener('click', function (e) {
        if (!e.target.classList.contains('borrar')) return;
        datos[seccion].splice(e.target.closest('tr').dataset.i, 1);
        marcarCambio();
        render();
    });

    tbody.addEventListener('focusin', function (e) {
        tbody.querySelectorAll('tr.actual').forEach(function (t) { t.classList.remove('actual'); });
        var tr = e.target.closest('tr[data-i]');
        if (tr) tr.classList.add('actual');
    });

    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey && (e.key === 'i' || e.key === 'I')) {
            e.preventDefault();
            agregarConcepto();
        }
    });

    // Pestañas de sección (Materia Prima / Mano de Obra / Gastos de Operacion)
    document.querySelectorAll('.sec-tab').forEach(function (t) {
        t.addEventListener('click', function () {
            document.querySelectorAll('.sec-tab').forEach(function (x) { x.classList.remove('activo'); });
            t.classList.add('activo');
            seccion = t.dataset.sec;
            var ct = seccion === 'ct';
            $('secNombre').textContent = NOMBRES[seccion] + ':';
            $('secAyuda').textContent = AYUDAS[ct ? 'ct' : 'grid'];
            document.querySelector('.grid-caja').hidden = ct;
            $('ctPanel').hidden = !ct;
            render();
        });
    });

    // ---------- Conceptos/Tareas (js/conceptos-tareas.js, se guardan con el presupuesto) ----------
    // Los adjuntos se guardan por presupuesto (P<id>); si aún no se guarda, en una carpeta temporal
    var adjCarpeta = (function () {
        var id = parseInt(document.body.dataset.presupuesto, 10) || 0;
        if (id) return 'P' + id;
        var b = new Uint8Array(8);
        (window.crypto || window.msCrypto).getRandomValues(b);
        return 'T' + Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    })();
    var ct = AcriTareas({
        datos: function () { return datos; },
        contexto: function () { return { proyecto: $('proyecto').value, ubicacion: $('ubicacion').value, fecha: $('fecha').value }; },
        soloLectura: function () { return soloLectura; },
        avisoSoloLectura: function () { avisoSoloLectura(); },
        visible: function () { return seccion === 'ct'; },
        carpeta: function () { return adjCarpeta; },
        alCambiar: marcarCambio
    });
    function renderCt() { ct.render(); }
    ct.contarAdjuntos();

    // ---------- Cálculos del Form46 ----------
    // Empleados × días (grid_man_obra), comisiones (grid_comisiones), anexo de seguro (grid_anexo7)
    // y sugeridos relacionados (grid_sug_rel)
    var extras = { empleados: [], comisiones: [], seguros: [], relacionados: [] };
    var FIJOS = window.ACRI_FIJOS || {};   // { mano_obra, comisiones }: renglones de Mano de Obra que se llenan solos

    function clave(s) { return String(s || '').trim().toUpperCase(); }
    function redondear(n) { return Math.round(n * 100) / 100; }
    function infoConcepto(sec, nombre) {
        var k = clave(nombre);
        if (!k) return null;
        return (CATALOGO[sec] || []).filter(function (c) { return clave(c.nombre) === k; })[0] || null;
    }
    function filaDe(sec, nombre) {
        return datos[sec].filter(function (r) { return clave(r.concepto) === clave(nombre); })[0];
    }
    // Pone el importe en el renglón del concepto; si no existe lo agrega (calcula_total_mano_obra, anexo7)
    function ponerFijo(sec, nombre, importe) {
        if (!clave(nombre)) return;
        var r = filaDe(sec, nombre);
        if (!r) {
            r = { id: ++consecutivo, concepto: nombre, presupuesto: 0, importar: false, folio: '' };
            datos[sec].push(r);
        }
        r.presupuesto = redondear(importe);
        r.calc = 'fijo';
    }

    // retorna_base_para_calculo_gasto_administrativo_matprima: MP × afecta_gasto_oper + Mano de Obra (sin comisiones)
    function baseGastoAdministrativo() {
        var b = 0;
        datos.mp.forEach(function (r) {
            var i = infoConcepto('mp', r.concepto);
            if (i) b += num(i.afecta) * num(r.presupuesto);
        });
        datos.mo.forEach(function (r) {
            var i = infoConcepto('mo', r.concepto);
            if (i ? i.base : clave(r.concepto) !== clave(FIJOS.comisiones)) b += num(r.presupuesto);
        });
        return b;
    }

    // Una pasada con el subtotal dado: empleados, comisiones, conceptos automáticos y anexo de seguro
    function aplicarCalculos(subtotal) {
        ['mp', 'mo', 'go'].forEach(function (s) { datos[s].forEach(function (r) { delete r.calc; }); });

        if (extras.empleados.length) {
            var totEmp = 0;
            extras.empleados.forEach(function (e) { e.total = redondear(num(e.sueldo) * num(e.dias)); totEmp += e.total; });
            ponerFijo('mo', FIJOS.mano_obra, totEmp);
        }
        if (extras.comisiones.length) {
            var totCom = 0;
            extras.comisiones.forEach(function (c) { c.total = redondear(subtotal * num(c.porcentaje) * 0.01); totCom += c.total; });
            ponerFijo('mo', FIJOS.comisiones, totCom);
        }
        // calcula_conceptos_calc_automatico: % del subtotal; los gastos base_mp, % de la base de MP + MO
        datos.mp.forEach(function (r) {
            var i = infoConcepto('mp', r.concepto);
            if (!i || !i.auto || num(i.pct) <= 0) return;
            r.presupuesto = redondear(subtotal * num(i.pct) / 100);
            r.calc = 'auto';
        });
        var base = null;
        datos.go.forEach(function (r) {
            var i = infoConcepto('go', r.concepto);
            if (!i || !i.auto || num(i.pct) <= 0) return;
            if (i.base_mp && base === null) base = baseGastoAdministrativo();
            r.presupuesto = redondear((i.base_mp ? base : subtotal) * num(i.pct) / 100);
            r.calc = 'auto';
        });
        // calcula_conceptos_anexo7: subtotal × %1 × %2 al concepto de Gastos de Operacion
        extras.seguros.forEach(function (s) {
            s.total = redondear(subtotal * num(s.porcentaje_1) * 0.01 * num(s.porcentaje_2) * 0.01);
            ponerFijo('go', s.concepto, s.total);
        });
    }

    function firma() {
        return ['mp', 'mo', 'go'].map(function (s) { return datos[s].map(function (r) { return num(r.presupuesto); }).join(','); }).join('|');
    }

    // La utilidad es margen sobre el precio de venta, no sobre el costo (Form46):
    // subtotal = costo / ((100 - %util) / 100)
    function subtotalPorUtilidad(costo) {
        var pct = num($('pctUtilidad').value);
        return pct < 100 ? costo / ((100 - pct) * 0.01) : costo;
    }

    // calcula_totales_grid: el subtotal depende de los conceptos automáticos y de las comisiones y ellos del
    // subtotal; el escritorio lo recalcula en cada celda, aquí se repite hasta que las cifras ya no cambian.
    // Con el subtotal fijo (lápiz) es calcula_conceptos_calc_automatico_subtotal_fijo + recalcula_por_cambio_subtotal.
    // En solo lectura (BAN_MOD del Form46) se muestran las cifras guardadas sin recalcular.
    function recalcular() {
        var subtotal = 0;
        for (var n = 0; n < 60 && !soloLectura; n++) {
            subtotal = subtotalManual ? num($('tSUB').value.replace(/,/g, '')) : subtotalPorUtilidad(suma(datos.mp) + suma(datos.mo) + suma(datos.go));
            var antes = firma();
            aplicarCalculos(subtotal);
            if (firma() === antes) break;
        }
        var t = { mp: suma(datos.mp), mo: suma(datos.mo), go: suma(datos.go) };
        t.costo = t.mp + t.mo + t.go;
        t.subtotal = subtotalManual ? subtotal : subtotalPorUtilidad(t.costo);
        return t;
    }

    // ---------- Totales ----------
    function calcularTotales() {
        var t = recalcular();
        var subtotal = t.subtotal;
        var utilidad = subtotal - t.costo;
        if (subtotalManual) $('pctUtilidad').value = subtotal ? (100 - t.costo / (subtotal * 0.01)).toFixed(4) : 0;
        else $('tSUB').value = fmt(subtotal);
        var iva = subtotal * IVA;

        $('tMP').textContent = fmt(t.mp);
        $('tMO').textContent = fmt(t.mo);
        $('tCP').textContent = fmt(t.mp + t.mo);
        $('tGO').textContent = fmt(t.go);
        $('tUT').textContent = fmt(utilidad);
        $('tIVA').textContent = fmt(iva);
        $('tTOT').textContent = fmt(subtotal + iva);
        pintarTotalesExtras();
        return subtotal;
    }

    // ---------- Empleados, comisiones y anexo de seguro (debajo de Mano de Obra / Gastos de Operacion) ----------
    var EMPLEADOS = window.ACRI_EMPLEADOS || [];
    var TIPOS_COMISION = window.ACRI_TIPOS_COMISION || [];
    var EXTRAS = {
        empleados: {
            tbody: 'tbEmpleados', vacio: 'Agrega los empleados que trabajarán en la obra.',
            celdas: function (e, dis) {
                return '<td class="id">' + escapar(e.clave || '') + '</td><td class="ro izq">' + escapar(e.nombre) + '</td>' +
                    '<td><input type="number" step="0.01" min="0" class="num" data-campo="sueldo" value="' + num(e.sueldo) + '"' + dis + '></td>' +
                    '<td><input type="number" step="0.5" min="0" class="num" data-campo="dias" value="' + (num(e.dias) || '') + '"' + dis + '></td>';
            }
        },
        comisiones: {
            tbody: 'tbComisiones', vacio: 'Agrega los tipos de empleado que cobran comisión sobre el subtotal.',
            celdas: function (c, dis) {
                return '<td class="ro izq">' + escapar(c.nombre) + '</td>' +
                    '<td><input type="number" step="0.0001" min="0" class="num" data-campo="porcentaje" value="' + num(c.porcentaje) + '"' + dis + '></td>';
            }
        },
        seguros: {
            tbody: 'tbSeguros', vacio: 'Agrega los conceptos de seguro de la obra.',
            celdas: function (s, dis) {
                return '<td class="ro izq">' + escapar(s.concepto) + '</td>' +
                    '<td><input type="number" step="0.01" min="0" class="num" data-campo="porcentaje_1" value="' + num(s.porcentaje_1) + '"' + dis + '></td>' +
                    '<td><input type="number" step="0.01" min="0" class="num" data-campo="porcentaje_2" value="' + num(s.porcentaje_2) + '"' + dis + '></td>';
            }
        }
    };

    function renderExtras() {
        $('extrasMO').hidden = seccion !== 'mo';
        $('extrasGO').hidden = seccion !== 'go';
        var dis = soloLectura ? ' disabled' : '';
        Object.keys(EXTRAS).forEach(function (k) {
            var x = EXTRAS[k], lista = extras[k];
            $(x.tbody).innerHTML = lista.length ? lista.map(function (o, i) {
                return '<tr data-i="' + i + '">' + x.celdas(o, dis) + '<td class="ro" data-total></td>' +
                    '<td><button class="borrar" title="Quitar"' + dis + '>✕</button></td></tr>';
            }).join('') : '<tr class="vacio-fila"><td colspan="6">' + escapar(x.vacio) + '</td></tr>';
        });
        $('fijoMO').textContent = FIJOS.mano_obra || '';
        $('fijoCOM').textContent = FIJOS.comisiones || '';
        [['addEmpleado', 'selEmpleado'], ['addComision', 'selTipoComision'], ['addSeguro', 'selSeguro']].forEach(function (p) {
            $(p[0]).disabled = $(p[1]).disabled = soloLectura || !$(p[1]).options.length;
        });
        renderRelacionados();
        pintarTotalesExtras();
    }

    function pintarTotalesExtras() {
        var tot = { empleados: 0, comisiones: 0 };
        Object.keys(EXTRAS).forEach(function (k) {
            $(EXTRAS[k].tbody).querySelectorAll('tr[data-i]').forEach(function (tr) {
                var o = extras[k][tr.dataset.i];
                if (!o) return;
                tr.querySelector('[data-total]').textContent = fmt(num(o.total));
                if (k in tot) tot[k] += num(o.total);
            });
        });
        $('totEmpleados').textContent = fmt(tot.empleados);
        $('totComisiones').textContent = fmt(tot.comisiones);
    }

    // Conceptos de Gastos de Operacion marcados como seguro (retorna_conceptos_seguro)
    $('selSeguro').innerHTML = (CATALOGO.go || []).filter(function (c) { return c.seguro && c.activo; })
        .map(function (c) { return '<option>' + escapar(c.nombre) + '</option>'; }).join('');

    Object.keys(EXTRAS).forEach(function (k) {
        var tb = $(EXTRAS[k].tbody);
        tb.addEventListener('input', function (e) {
            var campo = e.target.dataset.campo;
            if (!campo) return;
            extras[k][e.target.closest('tr').dataset.i][campo] = e.target.value;
            marcarCambio();
            refrescarCalculados();
        });
        tb.addEventListener('click', function (e) {
            if (!e.target.classList.contains('borrar') || soloLectura) return;
            var o = extras[k][e.target.closest('tr').dataset.i];
            if (!confirm('¿Deseas eliminar del presupuesto ' + (k === 'empleados' ? 'el empleado' : 'el concepto') + ' seleccionado?')) return;
            extras[k].splice(e.target.closest('tr').dataset.i, 1);
            // Sin renglones el concepto fijo queda en cero (o deja de ser del anexo de seguro)
            if (k === 'empleados' && !extras.empleados.length) ponerFijo('mo', FIJOS.mano_obra, 0);
            if (k === 'comisiones' && !extras.comisiones.length) ponerFijo('mo', FIJOS.comisiones, 0);
            if (k === 'seguros') ponerFijo('go', o.concepto, 0);
            marcarCambio();
            render();
        });
    });

    $('addEmpleado').addEventListener('click', function () {
        var id = +$('selEmpleado').value;
        var em = EMPLEADOS.filter(function (x) { return +x.empleado_id === id; })[0];
        if (!em) return;
        // valida_empledo_no_exista
        if (extras.empleados.some(function (x) { return +x.empleado_id === id; })) {
            alert('El empleado seleccionado ya se encuentra asignado en el presupuesto.');
            return;
        }
        extras.empleados.push({ empleado_id: id, clave: em.numero_empleado, nombre: em.nombre, sueldo: num(em.sueldo_diario), dias: 0, total: 0 });
        marcarCambio();
        render();
        var ult = $('tbEmpleados').querySelector('tr:last-child [data-campo="dias"]');
        if (ult) ult.focus();
    });
    $('addComision').addEventListener('click', function () {
        var id = +$('selTipoComision').value;
        var t = TIPOS_COMISION.filter(function (x) { return +x.tipo_empleado_id === id; })[0];
        if (!t) return;
        extras.comisiones.push({ tipo_id: id, nombre: t.nombre, porcentaje: num(t.porcentaje), total: 0 });
        marcarCambio();
        render();
    });
    $('addSeguro').addEventListener('click', function () {
        var nombre = $('selSeguro').value;
        if (!nombre) return;
        if (extras.seguros.some(function (x) { return clave(x.concepto) === clave(nombre); })) {
            alert('El concepto ya está en el anexo de seguro.');
            return;
        }
        extras.seguros.push({ concepto: nombre, porcentaje_1: 0, porcentaje_2: 0, total: 0 });
        marcarCambio();
        render();
    });

    // ---------- Sugeridos relacionados (Form46.Button5 / Button6) ----------
    function renderRelacionados() {
        var dis = soloLectura ? ' disabled' : '';
        $('tbRelacionados').innerHTML = extras.relacionados.length ? extras.relacionados.map(function (r, i) {
            return '<tr data-i="' + i + '"><td class="id">' + escapar(r.folio) + '</td><td class="ro izq">' + escapar(r.cliente) + '</td>' +
                '<td class="ro izq">' + escapar(r.proyecto) + '</td><td class="ro izq">' + escapar(r.estatus) + '</td>' +
                '<td class="ro">' + fmt(num(r.total)) + '</td><td><button class="borrar" title="Quitar de la lista"' + dis + '>✕</button></td></tr>';
        }).join('') : '<tr class="vacio-fila"><td colspan="6">Sin sugeridos relacionados.</td></tr>';
        $('addRelacionado').disabled = soloLectura;
    }
    $('addRelacionado').addEventListener('click', function () {
        if (!presupuestoId) { alert('Es necesario guardar el presupuesto para relacionarlo con otros presupuestos del sistema.'); return; }
        var folio = prompt('Ingresa el folio del presupuesto a relacionar:');
        if (!folio || !folio.trim()) return;
        fetch('api/obras.php?accion=presupuesto_folio&folio=' + encodeURIComponent(folio.trim())).then(function (r) {
            if (r.status === 401) { (window.top || window).location.href = 'index.php'; throw new Error('Sesión expirada'); }
            return r.json().catch(function () { throw new Error('Respuesta no válida del servidor (HTTP ' + r.status + ').'); });
        }).then(function (j) {
            if (!j.ok) throw new Error(j.error);
            var p = j.presupuesto;
            if (+p.sugerido_id === presupuestoId) throw new Error('El presupuesto que intentas relacionar es este mismo; no es posible agregarlo.');
            if (extras.relacionados.some(function (x) { return +x.sugerido_id === +p.sugerido_id; })) throw new Error('El presupuesto ya está relacionado.');
            extras.relacionados.push(p);
            marcarCambio();
            renderRelacionados();
        }).catch(function (err) { alert(err.message); });
    });
    $('tbRelacionados').addEventListener('click', function (e) {
        if (!e.target.classList.contains('borrar') || soloLectura) return;
        if (!confirm('¿Deseas eliminar de la lista el presupuesto seleccionado?')) return;
        extras.relacionados.splice(e.target.closest('tr').dataset.i, 1);
        marcarCambio();
        renderRelacionados();
    });

    $('pctIvaTxt').textContent = IVA * 100;
    $('pctUtilidad').addEventListener('input', function () {
        if (subtotalManual) return;
        marcarCambio();
        refrescarCalculados();
    });
    $('tSUB').addEventListener('input', function () { marcarCambio(); refrescarCalculados(); });

    // Lápiz: capturar el subtotal a mano y recalcular la utilidad
    $('editarSubtotal').addEventListener('click', function () {
        subtotalManual = !subtotalManual;
        this.classList.toggle('activo', subtotalManual);
        $('tSUB').readOnly = !subtotalManual;
        $('pctUtilidad').readOnly = subtotalManual;
        if (subtotalManual) {
            $('tSUB').value = $('tSUB').value.replace(/,/g, '');
            $('tSUB').select();
        }
        refrescarCalculados();
    });

    // ---------- Encabezado ----------
    document.querySelectorAll('.encabezado input, .encabezado select, #descripcion').forEach(function (el) {
        el.addEventListener('input', marcarCambio);
    });
    // ---------- HubSpot: rastrear el contacto por correo y ligar el negocio ----------
    var hs = { contactos: [], negocios: [], contacto: null, negocio: null, urlNegocio: null };

    function hsPedir(q) {
        return fetch('api/hubspot.php?' + q).then(function (r) {
            if (r.status === 401) { (window.top || window).location.href = 'index.php'; throw new Error('Sesión expirada'); }
            return r.json().catch(function () { throw new Error('Respuesta no válida del servidor (HTTP ' + r.status + ').'); });
        }).then(function (j) {
            if (!j.ok) throw new Error(j.error);
            return j;
        });
    }
    function hsEstado(texto, error) {
        $('hsEstado').textContent = texto || '';
        $('hsEstado').className = 'hs-estado' + (error ? ' error' : '');
    }
    function hsFecha(v) { return /^\d{4}-\d{2}-\d{2}/.test(v || '') ? v.substr(8, 2) + '/' + v.substr(5, 2) + '/' + v.substr(0, 4) : ''; }
    function hsLiga(url) { return url ? '<a href="' + escapar(url) + '" target="_blank" rel="noopener" title="Abrir en HubSpot">↗</a>' : ''; }
    function hsVacio(tbody, cols, texto) { $(tbody).innerHTML = '<tr><td colspan="' + cols + '" class="hs-vacio">' + escapar(texto) + '</td></tr>'; }

    function hsPintarSeleccion() {
        var t = [];
        if (hs.contacto) t.push('Contacto: ' + (hs.contacto.nombre || hs.contacto.correo));
        if (hs.negocio) t.push('Negocio: ' + hs.negocio.id + ' · ' + hs.negocio.nombre);
        $('hsSeleccion').textContent = t.join('   ·   ');
        $('hsUsar').disabled = !hs.contacto;
    }

    function hsBuscar() {
        var q = $('hsTexto').value.trim();
        if (q.length < 3) { hsEstado('Escribe al menos 3 letras del correo, nombre o teléfono.', true); return; }
        hs.contacto = hs.negocio = null;
        hsPintarSeleccion();
        hsEstado('Buscando en HubSpot…');
        hsVacio('hsNegocios', 7, 'Selecciona un contacto.');
        hsPedir('accion=contactos&q=' + encodeURIComponent(q)).then(function (j) {
            hs.contactos = j.contactos;
            hsEstado(j.contactos.length ? j.total + ' contacto(s) encontrado(s)' + (j.total > j.contactos.length ? '; se muestran los primeros ' + j.contactos.length + '.' : '.')
                                       : 'No se encontró ningún contacto con "' + q + '".');
            if (!j.contactos.length) { hsVacio('hsContactos', 5, 'Sin resultados.'); return; }
            $('hsContactos').innerHTML = j.contactos.map(function (c, i) {
                return '<tr data-i="' + i + '"><td title="' + escapar(c.nombre) + '">' + escapar(c.nombre) + '</td><td>' + escapar(c.correo) + '</td>' +
                    '<td>' + escapar(c.telefono) + '</td><td title="' + escapar(c.empresa) + '">' + escapar(c.empresa) + '</td><td>' + hsLiga(c.url) + '</td></tr>';
            }).join('');
            if (j.contactos.length === 1) elegirContacto(0);
        }).catch(function (err) { hsEstado(err.message, true); hsVacio('hsContactos', 5, 'No se pudo buscar.'); });
    }

    function elegirContacto(i) {
        hs.contacto = hs.contactos[i];
        hs.negocio = null;
        marcarFila('hsContactos', i);
        hsPintarSeleccion();
        hsVacio('hsNegocios', 7, 'Cargando negocios…');
        hsPedir('accion=negocios&contacto=' + encodeURIComponent(hs.contacto.id)).then(function (j) {
            hs.negocios = j.negocios;
            if (!j.negocios.length) { hsVacio('hsNegocios', 7, 'El contacto no tiene negocios en HubSpot.'); return; }
            $('hsNegocios').innerHTML = j.negocios.map(function (n, k) {
                var monto = n.monto ? '$' + parseFloat(n.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '';
                return '<tr data-i="' + k + '"><td>' + escapar(n.id) + '</td><td title="' + escapar(n.nombre) + '">' + escapar(n.nombre) + '</td>' +
                    '<td>' + escapar(n.etapa) + '</td><td class="num">' + monto + '</td><td>' + hsFecha(n.creado) + '</td><td>' + hsFecha(n.cierre) + '</td>' +
                    '<td>' + hsLiga(n.url) + '</td></tr>';
            }).join('');
            if (j.negocios.length === 1) elegirNegocio(0);
        }).catch(function (err) { hsVacio('hsNegocios', 7, err.message); });
    }

    function elegirNegocio(i) {
        hs.negocio = hs.negocios[i];
        marcarFila('hsNegocios', i);
        hsPintarSeleccion();
    }

    function marcarFila(tbody, i) {
        $(tbody).querySelectorAll('tr').forEach(function (tr) { tr.classList.toggle('sel', tr.dataset.i === String(i)); });
    }

    $('hsContactos').addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        var tr = e.target.closest('tr[data-i]');
        if (tr) elegirContacto(+tr.dataset.i);
    });
    $('hsNegocios').addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        var tr = e.target.closest('tr[data-i]');
        if (tr) elegirNegocio(+tr.dataset.i);
    });
    $('hsNegocios').addEventListener('dblclick', function (e) {
        if (e.target.closest('tr[data-i]')) $('hsUsar').click();
    });

    $('buscarHubspot').addEventListener('click', function () {
        // Busca con el correo capturado; si no hay, con el cliente
        $('hsTexto').value = $('email').value.trim() || $('cliente').value.trim();
        $('hsDialogo').showModal();
        if ($('hsTexto').value.length >= 3) hsBuscar(); else $('hsTexto').focus();
    });
    $('hsForm').addEventListener('submit', function (e) { e.preventDefault(); hsBuscar(); });
    $('hsCerrar').addEventListener('click', function () { $('hsDialogo').close(); });
    $('hsCancelar').addEventListener('click', function () { $('hsDialogo').close(); });

    // Pasa al presupuesto: correo, cliente (empresa o contacto), proyecto e Id de Negocio
    $('hsUsar').addEventListener('click', function () {
        var c = hs.contacto, n = hs.negocio;
        if (!c) return;
        if (c.correo) $('email').value = c.correo;
        var cliente = c.empresa || c.nombre;
        if (cliente && (!$('cliente').value.trim() || confirm('¿Reemplazar el cliente "' + $('cliente').value + '" por "' + cliente + '"?'))) {
            $('cliente').value = cliente;
            $('cliente').dispatchEvent(new Event('change'));
        }
        if (n) {
            if (!$('proyecto').value.trim() && n.nombre) $('proyecto').value = n.nombre;
            ponerNegocio(n.id, n.url);
        } else if (!$('idNegocio').textContent || $('idNegocio').textContent === '0') {
            alert('Se tomó el contacto, pero no se eligió un negocio: el Id de Negocio queda en 0.');
        }
        marcarCambio();
        $('hsDialogo').close();
    });

    function ponerNegocio(id, url) {
        $('idNegocio').textContent = id || '0';
        $('idNegocio').classList.toggle('ligado', !!id && id !== '0');
        hs.urlNegocio = url || null;
    }

    // Clic en el Id de Negocio: abre el negocio en HubSpot
    $('idNegocio').addEventListener('click', function (e) {
        e.preventDefault();
        var id = this.textContent.trim();
        if (!id || id === '0') { if (!soloLectura) $('buscarHubspot').click(); return; }
        if (hs.urlNegocio) { window.open(hs.urlNegocio, '_blank', 'noopener'); return; }
        hsPedir('accion=liga&deal=' + encodeURIComponent(id)).then(function (j) {
            if (j.url) window.open(j.url, '_blank', 'noopener');
        }).catch(function (err) { alert(err.message); });
    });

    // ---------- Pestañas del documento ----------
    document.querySelectorAll('.doc-tab').forEach(function (t) {
        t.addEventListener('click', function () {
            document.querySelectorAll('.doc-tab').forEach(function (x) { x.classList.remove('activo'); });
            document.querySelectorAll('.vista').forEach(function (v) { v.classList.remove('visible'); });
            t.classList.add('activo');
            document.querySelector('.vista[data-vista="' + t.dataset.vista + '"]').classList.add('visible');
        });
    });

    // ---------- Barra de herramientas ----------
    // Color del estatus según Administrador › Estatus de Presupuestos
    function pintarEstatus(e) {
        $('estatus').textContent = e;
        $('estatus').className = 'estatus c-' + ((window.ACRI_ESTATUS || {})[e] || 'gris');
    }
    // Reglas del Form46 (mismas que estatusTransicion() en includes/estatus.php)
    function motivoEstatus(antes, despues) {
        var a = antes.toUpperCase(), d = despues.toUpperCase();
        if (a === d) return '';
        var bloquean = { ACEPTADO: ['ACEPTADO', 'CANCELADO', 'RECHAZADO'], CANCELADO: ['ACEPTADO', 'CANCELADO', 'RECHAZADO'], RECHAZADO: ['ACEPTADO', 'CANCELADO'] }[d]
            || ['CANCELADO', 'RECHAZADO'];
        return bloquean.indexOf(a) >= 0 ? 'En el estatus actual del presupuesto (' + antes + ') ya no es posible pasarlo a ' + despues + '.' : '';
    }
    function estatusFinal(e) { return ['ACEPTADO', 'CANCELADO'].indexOf(String(e).toUpperCase()) >= 0; }

    // El cambio de estatus se guarda al momento (actualiza_estatus_sugerido_obra); requiere el permiso
    // «Modificar presupuestos» o que otro usuario lo autorice
    function ponerEstatus(e, autoriza) {
        var antes = $('estatus').textContent.trim();
        if (e === antes) return;
        if (!presupuestoId) { alert('Es necesario guardar el presupuesto antes de cambiar su estatus.'); return; }
        var motivo = motivoEstatus(antes, e);
        if (motivo) { alert(motivo); return; }
        if (autoriza === undefined) {
            if (/^(Aceptado|Cancelado|Rechazado)$/i.test(e)
                && !confirm('Se actualizará el estatus del presupuesto a ' + e + ' y ya no será posible realizar modificaciones. ¿Deseas continuar?')) return;
            if (!window.ACRI_PUEDE_MODIFICAR) {
                if (!confirm('No tienes el permiso para Modificar presupuestos. ¿Deseas que lo autorice otro usuario?')) return;
                pedirAutorizacion('Cambiar el estatus requiere el permiso «Modificar presupuestos».').then(function (a) { if (a) ponerEstatus(e, a); });
                return;
            }
        }
        // Si hay cambios sin guardar, primero se guardan
        var listo = cambios && !soloLectura ? guardar() : Promise.resolve(true);
        listo.then(function (ok) {
            if (!ok) return;
            return pedirPresupuestos('estatus', { id: presupuestoId, estatus: e, autoriza: autoriza }).then(function (j) {
                pintarEstatus(j.estatus);
                if (estatusFinal(j.estatus) && !soloLectura) { soloLectura = true; aplicarModo(); }
                if (enPestana) window.parent.postMessage({ tipo: 'guardado', id: presupuestoId }, location.origin);
            });
        }).catch(function (err) {
            if (err.autorizar && !autoriza) {
                pedirAutorizacion(err.message).then(function (a) { if (a) ponerEstatus(e, a); });
                return;
            }
            alert('No se pudo cambiar el estatus: ' + err.message);
        });
    }

    // ---------- Solo lectura / Modificar ----------
    function avisoSoloLectura() {
        alert(window.ACRI_PUEDE_MODIFICAR
            ? 'El presupuesto está en solo lectura. Presiona «Modificar» para cambiarlo.'
            : 'El presupuesto está en solo lectura: no tienes permiso para modificar presupuestos.');
    }

    function aplicarModo() {
        document.body.classList.toggle('solo-lectura', soloLectura);
        document.querySelectorAll('.encabezado input, .encabezado select, #descripcion, #pctUtilidad, #tSUB, #buscarHubspot')
            .forEach(function (el) { el.disabled = soloLectura; });
        $('modo').hidden = !soloLectura;
        var b = document.querySelector('.tb[data-accion="modificar"]');
        if (b) b.classList.toggle('activo', !soloLectura && !!presupuestoId);
        render();
    }

    var enPestana = window.parent !== window;

    function cerrarVentana() {
        if (enPestana) {
            window.parent.postMessage({ tipo: 'cerrar' }, location.origin);
            return;
        }
        window.close();
        // Si el navegador no permite cerrar la pestaña, regresa al menú
        setTimeout(function () { location.href = 'principal.php'; }, 200);
    }

    // La pestaña de la pantalla principal consulta esto antes de cerrar
    window.acriHayCambios = function () { return cambios; };
    // Ctrl + I reenviado desde principal cuando el foco está fuera del iframe
    window.acriAgregar = agregarConcepto;

    // El nombre del cliente se muestra en la pestaña
    if (enPestana) {
        $('cliente').addEventListener('change', function () {
            var c = this.value.trim();
            window.parent.postMessage({
                tipo: 'titulo',
                texto: c ? 'Presupuesto · ' + c : 'Presupuesto de Obra'
            }, location.origin);
        });
    }

    // ---------- Guardar en AW-Management (api/presupuestos.php) ----------
    var presupuestoId = parseInt(document.body.dataset.presupuesto, 10) || 0;
    var guardando = false;
    var token = (document.querySelector('meta[name="acri-token"]') || {}).content || '';

    function pedirPresupuestos(accion, cuerpo) {
        return fetch('api/presupuestos.php?accion=' + accion, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Acri-Token': token },
            body: JSON.stringify(cuerpo)
        }).then(function (r) {
            if (r.status === 401) { (window.top || window).location.href = 'index.php'; throw new Error('Sesión expirada'); }
            return r.json().catch(function () { throw new Error('Respuesta no válida del servidor (HTTP ' + r.status + ').'); });
        }).then(function (j) {
            if (!j.ok) {
                var err = new Error(j.error || 'Error desconocido.');
                err.autorizar = !!j.autorizar;   // falta un permiso: lo puede autorizar otro usuario
                throw err;
            }
            return j;
        });
    }

    // Autorización de otro usuario (Dialog225 del escritorio): resuelve con { usuario, contrasena } o null si se cancela
    function pedirAutorizacion(mensaje) {
        return new Promise(function (resolver) {
            var dlg = $('auDialogo'), form = $('auForm'), hecho = false;
            function terminar(v) {
                if (hecho) return;
                hecho = true;
                form.onsubmit = null;
                dlg.onclose = null;
                if (dlg.open) dlg.close();
                $('auContrasena').value = '';
                resolver(v);
            }
            $('auMensaje').textContent = mensaje + ' Puede autorizarlo otro usuario que tenga el permiso.';
            $('auUsuario').value = '';
            $('auContrasena').value = '';
            form.onsubmit = function (e) {
                e.preventDefault();
                terminar({ usuario: $('auUsuario').value.trim(), contrasena: $('auContrasena').value });
            };
            dlg.onclose = function () { terminar(null); };
            dlg.showModal();
            $('auUsuario').focus();
        });
    }
    document.querySelectorAll('[data-au-cerrar]').forEach(function (b) {
        b.addEventListener('click', function () { $('auDialogo').close(); });
    });

    function documentoActual() {
        // recalcula_sugerido_por_cambios antes de guardar
        var subtotal = calcularTotales();
        var mp = suma(datos.mp), mo = suma(datos.mo), go = suma(datos.go);
        var conceptos = [];
        ['mp', 'mo', 'go'].forEach(function (sec) {
            datos[sec].forEach(function (r) {
                conceptos.push({
                    tipo: SIGLAS[sec],
                    concepto: r.concepto,
                    presupuesto: num(r.presupuesto),
                    porcentaje: subtotal > 0 ? num(r.presupuesto) / subtotal * 100 : 0,
                    importar: !!r.importar,
                    docto_imp_id: r.docto_imp_id || 0,
                    folio: r.folio || '',
                    notas: r.notas || '',
                    articulos: r.articulos || []
                });
            });
        });
        return {
            id: presupuestoId,
            fecha: $('fecha').value,
            cliente: $('cliente').value,
            email: $('email').value,
            proyecto: $('proyecto').value,
            ubicacion: $('ubicacion').value,
            vendedor: $('vendedor').value,
            estatus: $('estatus').textContent.trim(),
            id_hs: $('idNegocio').textContent.trim(),
            notas: $('descripcion').value,
            utilidad_por: num($('pctUtilidad').value),
            totales: {
                cos_primo: mp + mo,
                gas_operacion: go,
                utilidad_neta: subtotal - (mp + mo + go),
                subtotal: subtotal,
                iva: subtotal * IVA,
                total: subtotal * (1 + IVA)
            },
            conceptos: conceptos,
            empleados: extras.empleados,
            comisiones: extras.comisiones,
            seguros: extras.seguros,
            relacionados: extras.relacionados.map(function (r) { return { sugerido_id: r.sugerido_id }; }),
            tareas: ct.exportar().tareas
        };
    }

    // Regresa una promesa que se resuelve con true si se guardó
    function guardar() {
        if (guardando) return Promise.resolve(false);
        if (!$('cliente').value.trim()) {
            alert('Captura el cliente antes de guardar.');
            $('cliente').focus();
            return Promise.resolve(false);
        }
        // Form46: el correo del contacto en HubSpot y el proyecto son obligatorios
        var correo = $('email').value.trim();
        if (correo.length <= 10 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || !$('proyecto').value.trim()) {
            alert('Es necesario colocar el correo del contacto con el que se registró en HubSpot y un nombre de Proyecto para guardar el presupuesto.');
            $(correo.length <= 10 ? 'email' : 'proyecto').focus();
            return Promise.resolve(false);
        }
        guardando = true;
        document.body.classList.add('guardando');
        return pedirPresupuestos('guardar', documentoActual()).then(function (j) {
            var nuevo = !presupuestoId;
            presupuestoId = j.id;
            document.body.dataset.presupuesto = j.id;
            $('folio').value = j.folio;
            cambios = false;
            // Ya guardado vuelve a solo lectura: para otro cambio se presiona «Modificar»
            soloLectura = true;
            aplicarModo();
            if (nuevo && !enPestana && history.replaceState) history.replaceState(null, '', 'presupuesto.php?id=' + j.id);
            if (enPestana) window.parent.postMessage({ tipo: 'guardado', id: j.id, folio: j.folio }, location.origin);
            return true;
        }).catch(function (err) {
            alert('No se pudo guardar el presupuesto: ' + err.message);
            return false;
        }).then(function (ok) {
            guardando = false;
            document.body.classList.remove('guardando');
            return ok;
        });
    }

    // Menús desplegables: al abrirse pasan al <body> (la barra de herramientas tiene overflow y los
    // recortaría) y se colocan bajo su botón sin salirse de la ventana; al cerrarse regresan a su lugar
    var menus = [];
    document.querySelectorAll('.tb-drop').forEach(function (drop) {
        menus.push({ drop: drop, menu: drop.querySelector('.menu') });
    });
    function cerrarMenus() {
        menus.forEach(function (x) {
            if (!x.menu.classList.contains('abierto')) return;
            x.menu.classList.remove('abierto');
            x.drop.classList.remove('abierto');
            x.drop.appendChild(x.menu);
        });
    }
    menus.forEach(function (x) {
        var b = x.drop.querySelector('.tb'), menu = x.menu;
        b.addEventListener('click', function (e) {
            e.stopPropagation();
            var abierto = menu.classList.contains('abierto');
            cerrarMenus();
            if (abierto) return;
            var actual = $('estatus').textContent.trim();
            menu.querySelectorAll('[data-estatus]').forEach(function (o) { o.classList.toggle('actual', o.dataset.estatus === actual); });
            document.body.appendChild(menu);
            menu.classList.add('abierto');
            x.drop.classList.add('abierto');
            var r = b.getBoundingClientRect();
            var izq = Math.min(r.left, window.innerWidth - menu.offsetWidth - 8);
            var arriba = r.bottom + 4;
            if (arriba + menu.offsetHeight > window.innerHeight - 8) arriba = Math.max(8, r.top - menu.offsetHeight - 4);
            menu.style.left = Math.max(8, izq) + 'px';
            menu.style.top = arriba + 'px';
        });
    });
    document.addEventListener('click', cerrarMenus);
    window.addEventListener('resize', cerrarMenus);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarMenus(); });
    // Si la barra se desplaza de lado, el menú se quedaría flotando fuera de su botón
    document.querySelector('.toolbar').addEventListener('scroll', cerrarMenus);

    document.querySelectorAll('[data-estatus]').forEach(function (b) {
        b.addEventListener('click', function () { ponerEstatus(b.dataset.estatus); });
    });
    // ---------- Imprimir / Imprimir Detalle (hoja membretada, js/formato-presupuesto.js) ----------
    function documentoImpresion() {
        var subtotal = calcularTotales();
        return {
            folio: $('folio').value,
            fecha: $('fecha').value,
            estatus: $('estatus').textContent.trim(),
            cliente: $('cliente').value,
            proyecto: $('proyecto').value,
            ubicacion: $('ubicacion').value,
            vendedor: $('vendedor').value,
            elaboro: creador || window.ACRI_USUARIO || '',
            notas: $('descripcion').value,
            utilidad_pct: num($('pctUtilidad').value),
            subtotal: subtotal,
            iva_pct: IVA * 100,
            secciones: ['mp', 'mo', 'go'].map(function (sec) {
                return {
                    titulo: NOMBRES[sec].toUpperCase(),
                    conceptos: datos[sec].filter(function (r) { return String(r.concepto || '').trim() || num(r.presupuesto); })
                        .map(function (r) {
                            return {
                                concepto: r.concepto, importe: num(r.presupuesto), folio: r.folio || '',
                                articulos: (r.articulos || []).map(function (a) {
                                    return { nombre: txt(a.nom_articulo) || txt(a.clave_articulo), unidades: a.unidades, um: a.unid_medida, total: a.precio_total };
                                })
                            };
                        })
                };
            })
        };
    }
    var impresionLista = false;
    function prepararImpresion(detalle) {
        $('formatoImpresion').innerHTML = FormatoPresupuesto(documentoImpresion(), window.ACRI_MEMBRETE || {}, detalle);
        impresionLista = true;
    }
    document.querySelectorAll('[data-imprimir]').forEach(function (b) {
        b.addEventListener('click', function () {
            prepararImpresion(b.dataset.imprimir === 'detalle');
            window.print();
        });
    });
    // Ctrl + P imprime el formato normal
    window.addEventListener('beforeprint', function () { if (!impresionLista) prepararImpresion(false); });
    window.addEventListener('afterprint', function () { impresionLista = false; });

    // Obra registrada del presupuesto (doctos_sugerido_obra.obra_id)
    var obraId = 0;
    function abrirObra(id, nombre) {
        if (enPestana) window.parent.postMessage({ tipo: 'abrir', modulo: 'Obras', id: id, titulo: 'Obra · ' + (nombre || id) }, location.origin);
        else window.open('obra.php?id=' + encodeURIComponent(id), '_blank');
    }

    // Form46.registrar_obra: el presupuesto debe estar guardado y pasa a Aceptado.
    // autoriza: { usuario, contrasena } de quien autoriza si no se tiene el permiso NUEVO_OBRA
    function registrarObra(autoriza) {
        if (!presupuestoId) { alert('Es necesario guardar el presupuesto para registrar la obra.'); return; }
        if (!confirm('El presupuesto se actualizará a estatus Aceptado y ya no será posible hacerle cambios. ¿Deseas continuar?')) return;
        // Si tiene cambios sin guardar, primero se guardan
        var listo = cambios ? guardar() : Promise.resolve(true);
        listo.then(function (ok) {
            if (!ok) return;
            var nombre = prompt('Nombre de la obra:', $('proyecto').value.trim() || $('cliente').value.trim());
            if (nombre === null) return;
            return pedirPresupuestos('registrar_obra', { id: presupuestoId, nom_obra: nombre.trim(), autoriza: autoriza }).then(function (j) {
                obraId = j.obra_id;
                $('obra').textContent = j.nom_obra || 'Obra ' + j.obra_id;
                if (j.estatus) pintarEstatus(j.estatus);
                soloLectura = true;
                aplicarModo();
                if (enPestana) window.parent.postMessage({ tipo: 'guardado', id: presupuestoId }, location.origin);
                if (j.nueva) alert('Obra «' + $('obra').textContent + '» registrada. Se abrirá en Obras.');
                abrirObra(j.obra_id, $('obra').textContent);
            });
        }).catch(function (err) {
            // El permiso cambió desde que se abrió la pantalla: se pide la autorización y se reintenta
            if (err.autorizar && !autoriza) {
                pedirAutorizacion(err.message).then(function (a) { if (a) registrarObra(a); });
                return;
            }
            alert('No se pudo registrar la obra: ' + err.message);
        });
    }

    var acciones = {
        'guardar': function () {
            if (soloLectura && !cambios) { alert('No hay cambios que guardar. Presiona «Modificar» para cambiar el presupuesto.'); return; }
            guardar().then(function (ok) { if (ok) alert('Presupuesto guardado con folio ' + $('folio').value + '.'); });
        },
        'guardar-cerrar': function () {
            if (soloLectura && !cambios) { cerrarVentana(); return; }
            // Solo se cierra si se guardó; si falla, lo capturado sigue en pantalla
            guardar().then(function (ok) { if (ok) cerrarVentana(); });
        },
        'modificar': function () {
            if (!presupuestoId) { alert('El presupuesto todavía no se guarda: ya puedes capturarlo.'); return; }
            if (soloLectura) {
                var est = $('estatus').textContent.trim();
                if (estatusFinal(est)) {
                    alert('En el estatus actual del presupuesto (' + est + ') ya no es posible hacer modificaciones.');
                    return;
                }
                var habilitar = function () {
                    soloLectura = false;
                    aplicarModo();
                    $('cliente').focus();
                };
                if (window.ACRI_PUEDE_MODIFICAR) { habilitar(); return; }
                // Sin el permiso, otro usuario lo autoriza (Dialog225 del escritorio)
                if (!confirm('No tienes el permiso para Modificar presupuestos. ¿Deseas que lo autorice otro usuario?')) return;
                pedirAutorizacion('Modificar el presupuesto requiere el permiso «Modificar presupuestos».').then(function (a) {
                    if (!a) return;
                    pedirPresupuestos('autorizar', { autoriza: a }).then(habilitar)
                        .catch(function (err) { alert('No se autorizó: ' + err.message); });
                });
                return;
            }
            // Dejar de modificar: si hay cambios se descartan volviendo a abrir el presupuesto
            if (cambios) {
                if (confirm('¿Descartar los cambios sin guardar?')) cargarPresupuesto(presupuestoId);
                return;
            }
            soloLectura = true;
            aplicarModo();
        },
        'duplicar': function () {
            if (!presupuestoId) { alert('Este presupuesto todavía no se ha guardado.'); return; }
            if (cambios && !confirm('Hay cambios sin guardar; la copia los incluirá. ¿Continuar?')) return;
            // La copia se queda en pantalla como presupuesto nuevo hasta que se guarde
            presupuestoId = 0;
            document.body.dataset.presupuesto = 0;
            $('folio').value = 0;
            obraId = 0;
            $('obra').textContent = '';
            pintarEstatus('Pendiente');
            creador = '';
            soloLectura = false;
            aplicarModo();
            marcarCambio();
            alert('Se creó una copia. Presiona Guardar para asignarle folio.');
        },
        'registrar-obra': function () {
            if (obraId) { abrirObra(obraId, $('obra').textContent); return; }
            if (guardando) return;
            var est = $('estatus').textContent.trim();
            if (est === 'Cancelado' || est === 'Rechazado') { alert('El presupuesto está ' + est + ': no se puede registrar la obra.'); return; }
            // Sin el permiso NUEVO_OBRA, otro usuario lo autoriza (como en el escritorio)
            var autoriza = Promise.resolve(undefined);
            if (!window.ACRI_PUEDE_REGISTRAR_OBRA) {
                if (!confirm('No tienes el permiso para Registrar obras. ¿Deseas que lo autorice otro usuario?')) return;
                autoriza = pedirAutorizacion('Registrar la obra requiere el permiso «Registrar obras».');
            }
            autoriza.then(function (a) {
                if (a === null) return;
                registrarObra(a);
            });
        },
        'cancelar': function () {
            // ponerEstatus pide la confirmación y valida que el estatus actual lo permita
            ponerEstatus('Cancelado');
        },
        'eliminar': function () {
            if (!presupuestoId) {
                if (confirm('Este presupuesto no se ha guardado. ¿Descartarlo?')) { cambios = false; cerrarVentana(); }
                return;
            }
            // Form46: solo se elimina un presupuesto Cancelado
            if ($('estatus').textContent.trim().toUpperCase() !== 'CANCELADO') {
                alert('Solo se puede eliminar un presupuesto Cancelado. Cancélalo primero.');
                return;
            }
            if (!confirm('¿Eliminar el presupuesto folio ' + $('folio').value + '? No se puede deshacer.')) return;
            var eliminar = function (autoriza) {
                pedirPresupuestos('eliminar', { id: presupuestoId, autoriza: autoriza }).then(function () {
                    cambios = false;
                    cerrarVentana();
                }).catch(function (err) {
                    if (err.autorizar && !autoriza) {
                        pedirAutorizacion(err.message).then(function (a) { if (a) eliminar(a); });
                        return;
                    }
                    alert('No se pudo eliminar el presupuesto: ' + err.message);
                });
            };
            eliminar();
        },
        'cerrar': function () {
            if (!cambios || confirm('Hay cambios sin guardar. ¿Cerrar de todos modos?')) {
                cambios = false;
                cerrarVentana();
            }
        }
    };
    Object.keys(acciones).forEach(function (a) {
        var b = document.querySelector('.tb[data-accion="' + a + '"]');
        if (b) b.addEventListener('click', acciones[a]);
    });
    // El nombre de la obra registrada abre la obra
    $('obra').addEventListener('click', function () { if (obraId) abrirObra(obraId, this.textContent); });

    window.addEventListener('beforeunload', function (e) {
        if (cambios) { e.preventDefault(); e.returnValue = ''; }
    });

    // ---------- Abrir un presupuesto existente ----------
    function cargarPresupuesto(id) {
        fetch('api/obras.php?accion=presupuesto&id=' + encodeURIComponent(id)).then(function (r) {
            if (r.status === 401) { (window.top || window).location.href = 'index.php'; throw new Error('Sesión expirada'); }
            return r.json().catch(function () { throw new Error('Respuesta no válida del servidor (HTTP ' + r.status + ').'); });
        }).then(function (j) {
            if (!j.ok) throw new Error(j.error);
            var p = j.presupuesto;
            $('cliente').value = p.cliente || '';
            $('proyecto').value = p.proyecto || '';
            $('ubicacion').value = p.ubicacion || '';
            if (p.correo) $('email').value = p.correo;
            $('folio').value = p.folio || 0;
            if (p.fecha) $('fecha').value = String(p.fecha).substr(0, 10);
            if (p.vendedor) {
                var sel = $('vendedor');
                if (!Array.prototype.some.call(sel.options, function (o) { return o.value === p.vendedor; })) {
                    sel.add(new Option(p.vendedor, p.vendedor));
                }
                sel.value = p.vendedor;
            }
            obraId = parseInt(p.obra_id, 10) || 0;
            $('obra').textContent = obraId ? (p.nom_obra || 'Obra ' + obraId) : '';
            $('descripcion').value = p.notas || '';
            ponerNegocio(p.id_hs && p.id_hs !== '0' ? p.id_hs : '0');
            if (p.estatus) pintarEstatus(String(p.estatus).trim());
            if (p.utilidad_neta_por !== null && p.utilidad_neta_por !== undefined) $('pctUtilidad').value = num(p.utilidad_neta_por);

            ct.aviso(p.aviso_descripciones || '');
            datos = { mp: [], mo: [], go: [] };
            p.conceptos.forEach(function (c) {
                var sec = String(c.tipo_concepto || '').trim().toLowerCase();
                if (!datos[sec]) return;
                datos[sec].push({
                    id: ++consecutivo,
                    concepto: c.concepto || '',
                    presupuesto: num(c.presupuesto),
                    importar: !!c.docto_imp_id,
                    docto_imp_id: parseInt(c.docto_imp_id, 10) || 0,
                    folio: c.folio || '',
                    notas: c.notas || '',
                    articulos: c.articulos || []
                });
            });
            extras = {
                empleados: (p.empleados || []).map(function (e) {
                    return { empleado_id: parseInt(e.empleado_id, 10) || 0, clave: e.clave, nombre: e.nombre || '', sueldo: num(e.sueldo), dias: num(e.dias), total: num(e.total) };
                }),
                comisiones: (p.comisiones || []).map(function (c) {
                    return { tipo_id: parseInt(c.tipo_id, 10) || 0, nombre: c.nombre || '', porcentaje: num(c.porcentaje), total: num(c.total) };
                }),
                seguros: (p.seguros || []).map(function (s) {
                    return { concepto: s.concepto || '', porcentaje_1: num(s.porcentaje_1), porcentaje_2: num(s.porcentaje_2), total: num(s.total) };
                }),
                relacionados: p.relacionados || []
            };
            // Conceptos/Tareas guardados (fechas, responsable, avance…); los conceptos de MP/MO/GO se sincronizan al pintar
            ct.cargar(p.tareas || []);
            creador = String(p.usuario_creador || '').trim();
            if (enPestana && p.cliente) {
                window.parent.postMessage({ tipo: 'titulo', texto: 'Presupuesto · ' + p.cliente }, location.origin);
            }
            cambios = false;
            soloLectura = true;
            aplicarModo();
        }).catch(function (err) { alert('No se pudo abrir el presupuesto: ' + err.message); });
    }

    render();
    var idInicial = parseInt(document.body.dataset.presupuesto, 10) || 0;
    if (idInicial) {
        // Bloqueado desde el inicio para que no se capture nada mientras carga
        soloLectura = true;
        aplicarModo();
        cargarPresupuesto(idInicial);
    }
})();
