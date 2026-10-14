(function () {
    var IVA = 0.16;
    var NOMBRES = { mp: 'Materia Prima', mo: 'Mano de Obra', go: 'Gastos de Operacion', ct: 'Conceptos/Tareas y Previsualización', pu: 'Análisis de Precios Unitarios' };
    var AYUDAS = {
        grid: 'Ctrl + I para agregar un nuevo Concepto',
        ct: 'Se generan en automático con los conceptos de Materia Prima, Mano de Obra y Gastos de Operacion',
        pu: 'Como Neodata, con lo capturado en el presupuesto: no cambia el Subtotal ni el Total'
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
    var SIGLAS = { mp: 'MP', mo: 'MO', go: 'GO' };
    function txt(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }

    // ---------- Rejilla ----------
    function render() {
        renderExtras();
        if (seccion === 'ct') { renderCt(); return; }
        if (seccion === 'pu') { renderPu(); return; }
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
        if (seccion === 'pu') { renderPu(); return; }
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
                      : r.calc === 'fijo' ? 'Se calcula con los empleados, comisiones o anexo de seguro'
                      : r.calc === 'pu' ? 'Se calcula con los conceptos de la pestaña Análisis P.U.' : '';
            tr.classList.toggle('calc', !!r.calc);
            if (r.calc && document.activeElement !== inp) inp.value = r.presupuesto;
            tr.querySelector('[data-calc="subtotal"]').textContent = fmt(imp);
            tr.querySelector('[data-calc="total"]').textContent = fmt(imp);
            // Igual que Form46: % del concepto respecto al subtotal del presupuesto
            tr.querySelector('[data-calc="pct"]').textContent = subtotal > 0 ? fmt(imp / subtotal * 100) + ' %' : '0.00 %';
        });
    }

    function agregarConcepto() {
        if (seccion === 'pu') { agregarConceptoPU(); return; }
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
            var ct = seccion === 'ct', pu = seccion === 'pu';
            $('secNombre').textContent = NOMBRES[seccion] + ':';
            $('secAyuda').textContent = AYUDAS[ct ? 'ct' : pu ? 'pu' : 'grid'];
            document.querySelector('.grid-caja').hidden = ct || pu;
            $('ctPanel').hidden = !ct;
            $('puPanel').hidden = !pu;
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
    function ponerFijo(sec, nombre, importe, tipo) {
        if (!clave(nombre)) return;
        var r = filaDe(sec, nombre);
        if (!r) {
            r = { id: ++consecutivo, concepto: nombre, presupuesto: 0, importar: false, folio: '' };
            datos[sec].push(r);
        }
        r.presupuesto = redondear(importe);
        r.calc = tipo || 'fijo';
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
        // Análisis P.U.: lo que llevan los conceptos analizados pasa a Materia Prima (materiales, equipo y herramienta)
        // y a Mano de Obra (sueldos × FSR)
        // Si el presupuesto no trae análisis (p. ej. se guardó sin la columna) sus renglones se respetan como están
        var a = totalesAnalisis();
        if (analisis.conceptos.length) huboAnalisis = true;
        if (a.mat + a.eq + a.hm || (huboAnalisis && filaDe('mp', FIJOS_PU.mp))) ponerFijo('mp', FIJOS_PU.mp, a.mat + a.eq + a.hm, 'pu');
        if (a.moReal || (huboAnalisis && filaDe('mo', FIJOS_PU.mo))) ponerFijo('mo', FIJOS_PU.mo, a.moReal, 'pu');
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

    // ---------- Análisis de Precios Unitarios (como Neodata) ----------
    // Cada concepto lleva unidad y cantidad, y su análisis: lo que lleva UNA unidad en materiales, mano de obra
    // (cantidad de jornales o lo que rinde por jornada) y equipo. Lo analizado pasa solo a dos renglones fijos de
    // Materia Prima y Mano de Obra, así que el Subtotal del Form46 lo incluye; lo capturado por importe se respeta.
    // El precio se integra en cascada sobre el costo directo, como Neodata:
    //   Costo directo = materiales + equipo + mano de obra × FSR + herramienta menor (% de la mano de obra)
    //   + Indirectos      = Gastos de Operacion (sin el anexo de seguro)
    //   + Financiamiento  = (CD + Ind) × %fin
    //   + Utilidad        = (CD + Ind + Fin) × %util
    //   + Cargos adicionales: % del precio de venta (comisiones y anexo de seguro, que el Form46 cobra sobre el subtotal)
    //   = Precio de venta; factor de sobrecosto = Precio de venta / CD; P.U. = CD por unidad × factor
    var FIJOS_PU = { mp: 'MATERIALES SEGUN ANALISIS P.U.', mo: 'MANO DE OBRA SEGUN ANALISIS P.U.' };
    var TIPOS_INSUMO = { MAT: 'Material', MO: 'Mano de obra', EQ: 'Equipo / herramienta' };
    var BIBLIOTECA = window.ACRI_BIBLIOTECA_PU || { conceptos: [], insumos: [] };
    var CAMPOS_PU = { fsr: 'puFsr', hm: 'puHm', fin: 'puFin', util: 'puUtil' };
    var analisis = { fsr: 1, hm: 0, fin: 0, util: null, conceptos: [] };   // util null = equivalente a la Utilidad Neta
    var uidPU = 0;
    var huboAnalisis = false;   // el presupuesto tuvo conceptos analizados: si se quitan todos, sus renglones quedan en cero
    var editandoPU = null;   // concepto abierto en la ventana de análisis
    var sugerencias = { MAT: {}, MO: {}, EQ: {} };

    function factorFsr() { return analisis.fsr > 0 ? analisis.fsr : 1; }
    function pad3(n) { return ('00' + n).slice(-3); }
    function siguienteClave() {
        var n = 0;
        analisis.conceptos.forEach(function (c) { var m = /^C-(\d+)$/.exec(c.clave); if (m) n = Math.max(n, +m[1]); });
        return 'C-' + pad3(n + 1);
    }
    function limpiarInsumo(i) {
        return { tipo: TIPOS_INSUMO[i.tipo] ? i.tipo : 'MAT', descripcion: String(i.descripcion || ''), unidad: String(i.unidad || ''),
                 cantidad: num(i.cantidad), rinde: num(i.rinde), costo: num(i.costo) };
    }
    function nuevoConcepto(c) {
        c = c || {};
        return { uid: ++uidPU, clave: String(c.clave || '') || siguienteClave(), partida: String(c.partida || ''),
                 descripcion: String(c.descripcion || ''), unidad: String(c.unidad || ''), cantidad: num(c.cantidad),
                 insumos: (c.insumos || []).map(limpiarInsumo) };
    }

    function ponerAnalisisPU(a) {
        a = a || {};
        analisis = {
            fsr: num(a.fsr) > 0 ? num(a.fsr) : 1, hm: num(a.hm), fin: num(a.fin),
            util: a.util === null || a.util === undefined || a.util === '' ? null : num(a.util),
            conceptos: []
        };
        (a.conceptos || []).forEach(function (c) { analisis.conceptos.push(nuevoConcepto(c)); });
        huboAnalisis = analisis.conceptos.length > 0;
        Object.keys(CAMPOS_PU).forEach(function (k) { $(CAMPOS_PU[k]).value = analisis[k] === null ? '' : analisis[k]; });
    }
    function exportarAnalisis() {
        return {
            fsr: analisis.fsr, hm: analisis.hm, fin: analisis.fin, util: analisis.util,
            conceptos: analisis.conceptos.map(function (c) {
                return { clave: c.clave, partida: c.partida, descripcion: c.descripcion, unidad: c.unidad, cantidad: c.cantidad,
                         insumos: c.insumos.map(function (i) { return limpiarInsumo(i); }) };
            })
        };
    }

    // Mano de obra: si se captura lo que rinde por jornada, la cantidad es 1 / rendimiento
    function cantidadInsumo(i) { return i.tipo === 'MO' && i.rinde > 0 ? 1 / i.rinde : i.cantidad; }
    // Costo de UNA unidad del concepto
    function costoUnitario(c) {
        var r = { mat: 0, mo: 0, eq: 0 };
        c.insumos.forEach(function (i) { r[i.tipo.toLowerCase()] += cantidadInsumo(i) * i.costo; });
        r.moReal = r.mo * factorFsr();
        r.hm = r.moReal * analisis.hm / 100;
        r.cd = r.mat + r.eq + r.moReal + r.hm;
        return r;
    }
    function totalesAnalisis() {
        var t = { mat: 0, mo: 0, eq: 0, moReal: 0, hm: 0, cd: 0 };
        analisis.conceptos.forEach(function (c) {
            var u = costoUnitario(c);
            Object.keys(t).forEach(function (k) { t[k] += u[k] * c.cantidad; });
        });
        return t;
    }
    // Qué le falta a un concepto (para que el usuario sepa qué capturar)
    function revisionConcepto(c) {
        if (!c.descripcion.trim()) return 'Falta el nombre';
        if (!c.unidad.trim()) return 'Falta la unidad';
        if (c.cantidad <= 0) return 'Falta la cantidad';
        if (!c.insumos.length) return 'Falta el análisis';
        if (c.insumos.some(function (i) { return !i.descripcion.trim() || cantidadInsumo(i) <= 0 || i.costo <= 0; })) return 'Insumo incompleto';
        return '';
    }

    function calcularPU() {
        var t = recalcular();
        var fsr = factorFsr(), hm = analisis.hm / 100, fin = analisis.fin / 100;
        var seguros = {};
        extras.seguros.forEach(function (s) { seguros[clave(s.concepto)] = true; });
        // Cargos adicionales como % del precio: los mismos porcentajes que el Form46 aplica al subtotal
        var ca = 0;
        extras.comisiones.forEach(function (c) { ca += num(c.porcentaje); });
        extras.seguros.forEach(function (s) { ca += num(s.porcentaje_1) * num(s.porcentaje_2) / 100; });
        ca = Math.min(ca, 99) / 100;

        // Conceptos capturados por importe en MP / MO (sin análisis)
        var r = { mp: 0, mo: 0, fsr: 0, hm: 0, ind: 0, ca: ca, otros: [] };
        ['mp', 'mo'].forEach(function (sec) {
            datos[sec].forEach(function (f) {
                var k = clave(f.concepto), base = num(f.presupuesto);
                if (k === clave(FIJOS_PU[sec])) return;                      // ya viene del análisis
                if (sec === 'mo' && k === clave(FIJOS.comisiones)) return;   // es cargo adicional
                if (!k && !base) return;
                var cd = base, ajuste = 0;
                if (sec === 'mo') {
                    // El FSR se aplica a los sueldos de los empleados (renglón de mano de obra interna)
                    if (extras.empleados.length && k === clave(FIJOS.mano_obra)) ajuste = base * (fsr - 1);
                    cd = (base + ajuste) * (1 + hm);
                    r.fsr += ajuste;
                    r.hm += (base + ajuste) * hm;
                }
                r[sec] += base;
                r.otros.push({ sec: sec, fila: f, cd: cd });
            });
        });
        var a = totalesAnalisis();
        r.mp += a.mat + a.eq;
        r.mo += a.mo;
        r.fsr += a.moReal - a.mo;
        r.hm += a.hm;
        datos.go.forEach(function (f) { if (!seguros[clave(f.concepto)]) r.ind += num(f.presupuesto); });

        r.cd = r.mp + r.mo + r.fsr + r.hm;
        r.fin = (r.cd + r.ind) * fin;
        // Utilidad equivalente: con FSR 1, sin herramienta ni financiamiento, da el mismo subtotal que el Form46
        var m = num($('pctUtilidad').value) / 100;
        r.utilAuto = 1 - m - ca > 0 ? m / (1 - m - ca) * 100 : 0;
        r.utilPct = analisis.util === null ? r.utilAuto : analisis.util;
        r.util = (r.cd + r.ind + r.fin) * r.utilPct / 100;
        r.pv = (r.cd + r.ind + r.fin + r.util) / (1 - ca);
        r.cargos = r.pv * ca;
        r.factor = r.cd > 0 ? r.pv / r.cd : 0;
        r.subtotal = t.subtotal;
        return r;
    }

    function pct(n) { return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %'; }
    function cant(n) { return n.toLocaleString('es-MX', { maximumFractionDigits: 4 }); }

    // Sugerencias para no teclear precios: lo ya capturado en este presupuesto, los artículos importados,
    // los empleados (sueldo diario por jornal) y lo usado en otros presupuestos. Gana lo primero.
    function construirSugerencias() {
        sugerencias = { MAT: {}, MO: {}, EQ: {} };
        function poner(tipo, descripcion, unidad, costo) {
            var k = clave(descripcion);
            if (!k || sugerencias[tipo][k] || !(num(costo) > 0)) return;
            sugerencias[tipo][k] = { descripcion: txt(descripcion), unidad: txt(unidad), costo: num(costo) };
        }
        analisis.conceptos.forEach(function (c) { c.insumos.forEach(function (i) { poner(i.tipo, i.descripcion, i.unidad, i.costo); }); });
        ['mp', 'mo', 'go'].forEach(function (sec) {
            datos[sec].forEach(function (f) {
                (f.articulos || []).forEach(function (a) { poner('MAT', txt(a.nom_articulo) || txt(a.clave_articulo), a.unid_medida, a.precio_unit); });
            });
        });
        EMPLEADOS.forEach(function (e) { poner('MO', e.nombre, 'jornal', e.sueldo_diario); });
        (BIBLIOTECA.insumos || []).forEach(function (i) { if (sugerencias[i.tipo]) poner(i.tipo, i.descripcion, i.unidad, i.costo); });
        Object.keys(sugerencias).forEach(function (tipo) {
            $('puSug' + tipo).innerHTML = Object.keys(sugerencias[tipo]).map(function (k) {
                var s = sugerencias[tipo][k];
                return '<option value="' + escapar(s.descripcion) + '">$' + fmt(s.costo) + (s.unidad ? ' / ' + escapar(s.unidad) : '') + '</option>';
            }).join('');
        });
        var partidas = {};
        analisis.conceptos.forEach(function (c) { if (txt(c.partida)) partidas[txt(c.partida)] = 1; });
        $('puPartidas').innerHTML = Object.keys(partidas).map(function (p) { return '<option value="' + escapar(p) + '">'; }).join('');
        $('puSugConceptos').innerHTML = (BIBLIOTECA.conceptos || []).map(function (c) {
            return '<option value="' + escapar(c.descripcion) + '">' + escapar(c.unidad) + ' · folio ' + c.folio + '</option>';
        }).join('');
    }

    // Un concepto ya analizado en otro presupuesto: se ofrece copiar su análisis (solo si este aún no tiene)
    function ofrecerBiblioteca(c) {
        if (c.insumos.length || soloLectura) return false;
        var k = clave(c.descripcion);
        var b = (BIBLIOTECA.conceptos || []).filter(function (x) { return clave(x.descripcion) === k; })[0];
        if (!b) return false;
        if (!confirm('«' + b.descripcion + '» ya se analizó en el presupuesto folio ' + b.folio + ' (' + b.insumos.length +
                     ' insumos, por ' + (b.unidad || 'unidad') + ').\n\n¿Copiar su análisis con sus precios? Después puedes ajustarlo.')) return false;
        c.insumos = b.insumos.map(limpiarInsumo);
        if (!txt(c.unidad)) c.unidad = b.unidad || '';
        if (!txt(c.partida)) c.partida = b.partida || '';
        return true;
    }

    // Catálogo para pintar e imprimir: conceptos analizados y los capturados por importe, con su P.U.
    function catalogoPU(r) {
        var lista = analisis.conceptos.map(function (c) {
            var u = costoUnitario(c);
            return { c: c, clave: c.clave, partida: txt(c.partida) || 'Sin partida', descripcion: c.descripcion, unidad: c.unidad,
                     cantidad: c.cantidad, cdU: u.cd, pu: u.cd * r.factor, importe: u.cd * c.cantidad * r.factor };
        });
        var tareas = {};
        if (r.otros.length) ct.exportar().tareas.forEach(function (x) { if (x.origen) tareas[x.origen] = x; });
        r.otros.forEach(function (o) {
            var tr = tareas[o.sec + ':' + o.fila.id] || {}, cantidad = num(tr.cantidad) || 1;
            lista.push({ otro: true, clave: tr.clave || SIGLAS[o.sec] + '-' + o.fila.id, partida: txt(tr.agrupador) || NOMBRES[o.sec],
                         descripcion: o.fila.concepto, unidad: tr.unidad || 'Lote', cantidad: cantidad, cdU: o.cd / cantidad,
                         pu: o.cd * r.factor / cantidad, importe: o.cd * r.factor, articulos: o.fila.articulos || [] });
        });
        return lista;
    }

    function renderPu() {
        construirSugerencias();
        var r = calcularPU(), dis = soloLectura ? ' disabled' : '';
        var lista = catalogoPU(r);
        var html = analisis.conceptos.length ? '' :
            '<tr class="vacio-fila"><td colspan="9">Aún no hay conceptos analizados. Presiona «+ Agregar concepto» (o Ctrl + I).</td></tr>';
        lista.forEach(function (x, i) {
            if (x.otro) {
                if (!lista[i - 1] || !lista[i - 1].otro) {
                    html += '<tr class="pu-partida"><td class="ro izq" colspan="9">Capturados por importe en Materia Prima / Mano de Obra (sin análisis)</td></tr>';
                }
                html += '<tr class="pu-otro"><td class="id">' + escapar(x.clave) + '</td><td class="ro izq">' + escapar(x.partida) + '</td>' +
                    '<td class="ro izq">' + escapar(x.descripcion) + '</td><td class="ro izq">' + escapar(x.unidad) + '</td>' +
                    '<td class="ro">' + cant(x.cantidad) + '</td><td class="ro">' + fmt(x.pu) + '</td><td class="ro">' + fmt(x.importe) + '</td>' +
                    '<td class="ro izq pu-rev">Por importe</td><td></td></tr>';
                return;
            }
            var c = x.c, falta = revisionConcepto(c);
            html += '<tr data-uid="' + c.uid + '"><td class="id">' + escapar(c.clave) + '</td>' +
                '<td><input type="text" data-pu="partida" list="puPartidas" maxlength="100" value="' + escapar(c.partida) + '" placeholder="Partida"' + dis + '></td>' +
                '<td><input type="text" data-pu="descripcion" list="puSugConceptos" maxlength="300" value="' + escapar(c.descripcion) + '" placeholder="¿Qué trabajo es?"' + dis + '></td>' +
                '<td><input type="text" data-pu="unidad" list="puUnidades" maxlength="20" value="' + escapar(c.unidad) + '" placeholder="m², pza…"' + dis + '></td>' +
                '<td><input type="number" class="num" data-pu="cantidad" step="0.01" min="0" value="' + (c.cantidad || '') + '"' + dis + '></td>' +
                '<td class="ro" data-pu-calc="pu">' + fmt(x.pu) + '</td><td class="ro" data-pu-calc="importe">' + fmt(x.importe) + '</td>' +
                '<td class="ro izq pu-rev' + (falta ? ' falta' : ' ok') + '" data-pu-calc="rev">' + (falta ? '⚠ ' + falta : '✓ Listo') + '</td>' +
                '<td class="pu-acciones"><button type="button" class="ct-btn" data-pu-accion="analizar" title="Capturar lo que lleva una unidad">Analizar</button>' +
                '<button type="button" class="pu-mini" data-pu-accion="duplicar" title="Duplicar el concepto con su análisis"' + dis + '>⧉</button>' +
                '<button type="button" class="pu-mini borrar" data-pu-accion="quitar" title="Quitar el concepto"' + dis + '>✕</button></td></tr>';
        });
        $('puConceptos').innerHTML = html;
        $('puAgregar').disabled = soloLectura;
        pintarPu(r, lista);
    }

    // Cifras sin volver a pintar los campos (para no perder el cursor mientras se escribe)
    function pintarPu(r, lista) {
        r = r || calcularPU();
        lista = lista || catalogoPU(r);
        $('puUtil').placeholder = r.utilAuto.toFixed(2) + ' (auto)';
        $('puInd').textContent = pct(r.cd > 0 ? r.ind / r.cd * 100 : 0);
        $('puCa').textContent = pct(r.ca * 100);
        var filas = [
            ['Materiales y equipo', r.mp],
            ['Mano de obra', r.mo],
            r.fsr ? ['Ajuste por FSR (× ' + cant(factorFsr()) + ')', r.fsr] : null,
            r.hm ? ['Herramienta menor (' + pct(analisis.hm) + ' de la M.O.)', r.hm] : null,
            ['Costo directo', r.cd, 'total'],
            ['Indirectos (' + pct(r.cd > 0 ? r.ind / r.cd * 100 : 0) + ' del CD)', r.ind],
            ['Financiamiento (' + pct(analisis.fin) + ')', r.fin],
            ['Utilidad (' + pct(r.utilPct) + ')', r.util],
            ['Cargos adicionales (' + pct(r.ca * 100) + ' del precio)', r.cargos],
            ['Precio de venta', r.pv, 'total'],
            ['Factor de sobrecosto', null, 'factor'],
            ['Subtotal del presupuesto', r.subtotal, 'ref'],
            ['Diferencia', r.pv - r.subtotal, Math.abs(r.pv - r.subtotal) >= 0.5 ? 'dif' : 'ref']
        ].filter(Boolean);
        $('puResumen').innerHTML = filas.map(function (f) {
            var v = f[2] === 'factor' ? cant(Math.round(r.factor * 10000) / 10000) : fmt(f[1]);
            return '<tr' + (f[2] ? ' class="pu-' + f[2] + '"' : '') + '><td class="ro izq">' + escapar(f[0]) + '</td><td class="ro">' + v + '</td></tr>';
        }).join('') + (Math.abs(r.pv - r.subtotal) >= 0.5
            ? '<tr class="pu-nota"><td colspan="2">La diferencia viene de los ajustes avanzados o de los conceptos con cálculo automático. El Total del presupuesto no cambia.</td></tr>' : '');

        var total = 0;
        lista.forEach(function (x) {
            total += x.importe;
            if (x.otro) return;
            var tr = $('puConceptos').querySelector('tr[data-uid="' + x.c.uid + '"]');
            if (!tr) return;
            var falta = revisionConcepto(x.c);
            tr.querySelector('[data-pu-calc="pu"]').textContent = fmt(x.pu);
            tr.querySelector('[data-pu-calc="importe"]').textContent = fmt(x.importe);
            var rev = tr.querySelector('[data-pu-calc="rev"]');
            rev.textContent = falta ? '⚠ ' + falta : '✓ Listo';
            rev.className = 'ro izq pu-rev' + (falta ? ' falta' : ' ok');
        });
        $('puTotalCat').textContent = fmt(total);
        pintarExplosion();
    }

    // Explosión de insumos: lo de los análisis (× cantidad del concepto) y los artículos importados, sumados
    function pintarExplosion() {
        var insumos = {}, lista = [];
        function sumar(tipo, descripcion, unidad, cantidad, importe) {
            var k = tipo + '|' + clave(descripcion) + '|' + clave(unidad);
            if (!insumos[k]) { insumos[k] = { tipo: tipo, nombre: txt(descripcion), um: txt(unidad), cantidad: 0, importe: 0 }; lista.push(insumos[k]); }
            insumos[k].cantidad += cantidad;
            insumos[k].importe += importe;
        }
        analisis.conceptos.forEach(function (c) {
            c.insumos.forEach(function (i) {
                var q = cantidadInsumo(i) * c.cantidad;
                if (q) sumar(TIPOS_INSUMO[i.tipo], i.descripcion, i.unidad, q, q * i.costo);
            });
        });
        ['mp', 'mo', 'go'].forEach(function (sec) {
            datos[sec].forEach(function (f) {
                (f.articulos || []).forEach(function (a) {
                    sumar('Importado (' + SIGLAS[sec] + ')', txt(a.nom_articulo) || txt(a.clave_articulo), a.unid_medida, num(a.unidades), num(a.precio_total));
                });
            });
        });
        lista.sort(function (a, b) { return b.importe - a.importe; });
        var total = lista.reduce(function (s, i) { return s + i.importe; }, 0);
        $('puInsumos').innerHTML = lista.length ? lista.map(function (i) {
            return '<tr><td class="ro izq">' + escapar(i.nombre) + '</td><td class="ro izq">' + escapar(i.tipo) + '</td>' +
                '<td class="ro izq">' + escapar(i.um) + '</td><td class="ro">' + cant(Math.round(i.cantidad * 10000) / 10000) + '</td>' +
                '<td class="ro">' + fmt(i.cantidad ? i.importe / i.cantidad : 0) + '</td><td class="ro">' + fmt(i.importe) + '</td>' +
                '<td class="ro">' + (total ? pct(i.importe / total * 100) : '') + '</td></tr>';
        }).join('') : '<tr class="vacio-fila"><td colspan="7">Aquí se suma todo lo que lleva la obra en cuanto analices conceptos o importes documentos.</td></tr>';
    }

    function conceptoPU(uid) { return analisis.conceptos.filter(function (c) { return c.uid === +uid; })[0]; }

    function agregarConceptoPU() {
        if (soloLectura) { avisoSoloLectura(); return; }
        var ultimo = analisis.conceptos[analisis.conceptos.length - 1];
        analisis.conceptos.push(nuevoConcepto({ partida: ultimo ? ultimo.partida : '' }));
        marcarCambio();
        renderPu();
        var f = $('puConceptos').querySelector('tr:last-child [data-pu="descripcion"]');
        if (f) f.focus();
    }
    $('puAgregar').addEventListener('click', agregarConceptoPU);

    $('puConceptos').addEventListener('input', function (e) {
        var campo = e.target.dataset.pu, tr = e.target.closest('tr[data-uid]');
        if (!campo || !tr) return;
        var c = conceptoPU(tr.dataset.uid);
        c[campo] = campo === 'cantidad' ? Math.max(0, num(e.target.value)) : e.target.value;
        marcarCambio();
        calcularTotales();
        pintarPu();
    });
    // Al elegir un concepto de la lista (o salir del campo) se ofrece copiar su análisis de otro presupuesto
    $('puConceptos').addEventListener('change', function (e) {
        var tr = e.target.closest('tr[data-uid]');
        if (!tr) return;
        if (e.target.dataset.pu === 'cantidad' && num(e.target.value) < 0) e.target.value = 0;
        var c = conceptoPU(tr.dataset.uid);
        if (e.target.dataset.pu === 'descripcion' && ofrecerBiblioteca(c)) {
            marcarCambio();
            calcularTotales();
            renderPu();
        }
    });
    $('puConceptos').addEventListener('click', function (e) {
        var b = e.target.closest('[data-pu-accion]');
        if (!b) return;
        var c = conceptoPU(b.closest('tr').dataset.uid), acc = b.dataset.puAccion;
        if (acc === 'analizar') { abrirAnalisis(c); return; }
        if (soloLectura) { avisoSoloLectura(); return; }
        if (acc === 'duplicar') {
            var copia = nuevoConcepto({ partida: c.partida, descripcion: c.descripcion + ' (copia)', unidad: c.unidad, cantidad: c.cantidad, insumos: c.insumos });
            analisis.conceptos.splice(analisis.conceptos.indexOf(c) + 1, 0, copia);
        } else if (acc === 'quitar') {
            if (!confirm('¿Quitar el concepto «' + (c.descripcion || c.clave) + '» con su análisis?')) return;
            analisis.conceptos.splice(analisis.conceptos.indexOf(c), 1);
        }
        marcarCambio();
        calcularTotales();
        renderPu();
    });

    // ----- Ventana de análisis de un concepto -----
    function abrirAnalisis(c) {
        editandoPU = c;
        var dis = soloLectura;
        $('puDConcepto').value = c.descripcion;
        $('puDUnidad').value = c.unidad;
        $('puDCantidad').value = c.cantidad || '';
        $('puDPartida').value = c.partida;
        ['puDConcepto', 'puDUnidad', 'puDCantidad', 'puDPartida'].forEach(function (id) { $(id).disabled = dis; });
        $('puDialogo').querySelectorAll('[data-pu-insumo]').forEach(function (b) { b.disabled = dis; });
        renderDialogo();
        $('puDialogo').showModal();
        if (!dis && !c.insumos.length) $('puDialogo').querySelector('[data-pu-insumo="MAT"]').focus();
    }

    function renderDialogo() {
        var c = editandoPU, dis = soloLectura ? ' disabled' : '', u = txt(c.unidad) || 'unidad';
        $('puDAyuda').innerHTML = 'Anota lo que lleva <b>1 ' + escapar(u) + '</b> de «' + escapar(c.descripcion || 'este concepto') + '». ' +
            'Ejemplo para 1 m² de cancel: 1.05 m² de vidrio (con desperdicio), 3.2 m de perfil, y la mano de obra con lo que hace un instalador en una jornada (8 m² → escribe 8 en «Rinde por jornada»).';
        $('puDColCant').textContent = 'Cantidad por ' + u;
        $('puDInsumos').innerHTML = c.insumos.length ? c.insumos.map(function (i, n) {
            var mo = i.tipo === 'MO', calc = mo && i.rinde > 0;
            return '<tr data-n="' + n + '">' +
                '<td><select data-ins="tipo"' + dis + '>' + Object.keys(TIPOS_INSUMO).map(function (t) {
                    return '<option value="' + t + '"' + (t === i.tipo ? ' selected' : '') + '>' + TIPOS_INSUMO[t] + '</option>';
                }).join('') + '</select></td>' +
                '<td><input type="text" data-ins="descripcion" list="puSug' + i.tipo + '" maxlength="200" value="' + escapar(i.descripcion) + '" placeholder="' +
                    (mo ? 'ej. Instalador + ayudante' : i.tipo === 'EQ' ? 'ej. Andamio, taladro' : 'ej. Vidrio claro 6 mm') + '"' + dis + '></td>' +
                '<td><input type="text" data-ins="unidad" list="puUnidades" maxlength="20" value="' + escapar(i.unidad) + '"' + dis + '></td>' +
                '<td><input type="number" class="num" data-ins="cantidad" step="0.0001" min="0" value="' + (calc ? (Math.round(1 / i.rinde * 10000) / 10000) : (i.cantidad || '')) + '"' +
                    (calc ? ' readonly title="Se calcula con lo que rinde por jornada"' : '') + dis + '></td>' +
                '<td>' + (mo ? '<input type="number" class="num" data-ins="rinde" step="0.01" min="0" value="' + (i.rinde || '') + '" placeholder="' + escapar(u) + '/día"' + dis + '>' : '<span class="pu-na">—</span>') + '</td>' +
                '<td><input type="number" class="num" data-ins="costo" step="0.01" min="0" value="' + (i.costo || '') + '"' + dis + '></td>' +
                '<td class="ro" data-ins-calc>' + fmt(cantidadInsumo(i) * i.costo) + '</td>' +
                '<td><button type="button" class="borrar" title="Quitar"' + dis + '>✕</button></td></tr>';
        }).join('') : '<tr class="vacio-fila"><td colspan="8">Agrega lo que lleva con los botones de arriba: Material, Mano de obra o Equipo.</td></tr>';
        pintarDialogo();
    }

    function pintarDialogo() {
        var c = editandoPU, u = costoUnitario(c), r = calcularPU(), unidad = escapar(txt(c.unidad) || 'unidad');
        $('puDInsumos').querySelectorAll('tr[data-n]').forEach(function (tr) {
            var i = c.insumos[tr.dataset.n];
            tr.querySelector('[data-ins-calc]').textContent = fmt(cantidadInsumo(i) * i.costo);
            if (i.tipo === 'MO' && i.rinde > 0) tr.querySelector('[data-ins="cantidad"]').value = Math.round(1 / i.rinde * 10000) / 10000;
        });
        var falta = revisionConcepto(c);
        $('puDTotales').innerHTML =
            '<span>Materiales <b>' + fmt(u.mat) + '</b></span>' +
            '<span>Mano de obra' + (factorFsr() !== 1 ? ' (× FSR ' + cant(factorFsr()) + ')' : '') + ' <b>' + fmt(u.moReal) + '</b></span>' +
            (u.hm ? '<span>Herramienta menor <b>' + fmt(u.hm) + '</b></span>' : '') +
            '<span>Equipo <b>' + fmt(u.eq) + '</b></span>' +
            '<span>= Costo directo por ' + unidad + ' <b>' + fmt(u.cd) + '</b></span>' +
            '<span>× Factor de sobrecosto <b>' + cant(Math.round(r.factor * 10000) / 10000) + '</b></span>' +
            '<span class="pu-pu">= Precio unitario <b>$' + fmt(u.cd * r.factor) + '</b> por ' + unidad + '</span>' +
            '<span class="pu-pu">Importe (× ' + cant(c.cantidad) + ') <b>$' + fmt(u.cd * r.factor * c.cantidad) + '</b></span>' +
            (falta ? '<span class="pu-falta">⚠ ' + falta + '</span>' : '');
    }

    function cambioDialogo(repintar) {
        marcarCambio();
        calcularTotales();
        if (repintar) renderDialogo(); else pintarDialogo();
    }

    [['puDConcepto', 'descripcion'], ['puDUnidad', 'unidad'], ['puDCantidad', 'cantidad'], ['puDPartida', 'partida']].forEach(function (p) {
        $(p[0]).addEventListener('input', function () {
            editandoPU[p[1]] = p[1] === 'cantidad' ? Math.max(0, num(this.value)) : this.value;
            cambioDialogo(p[1] === 'unidad');
            if (p[1] === 'unidad') $(p[0]).focus();
        });
    });
    $('puDConcepto').addEventListener('change', function () { if (ofrecerBiblioteca(editandoPU)) { construirSugerencias(); cambioDialogo(true); $('puDUnidad').value = editandoPU.unidad; $('puDPartida').value = editandoPU.partida; } });

    $('puDialogo').querySelectorAll('[data-pu-insumo]').forEach(function (b) {
        b.addEventListener('click', function () {
            var tipo = b.dataset.puInsumo;
            editandoPU.insumos.push(limpiarInsumo({ tipo: tipo, unidad: tipo === 'MO' ? 'jornal' : '' }));
            cambioDialogo(true);
            var f = $('puDInsumos').querySelector('tr:last-child [data-ins="descripcion"]');
            if (f) f.focus();
        });
    });
    $('puDInsumos').addEventListener('input', function (e) {
        var campo = e.target.dataset.ins, tr = e.target.closest('tr[data-n]');
        if (!campo || !tr) return;
        var i = editandoPU.insumos[tr.dataset.n];
        i[campo] = ['cantidad', 'rinde', 'costo'].indexOf(campo) >= 0 ? Math.max(0, num(e.target.value)) : e.target.value;
        if (campo === 'tipo') { cambioDialogo(true); return; }
        cambioDialogo(false);
    });
    // Al elegir un insumo de la lista se llenan su unidad y su costo (si aún no tienen)
    $('puDInsumos').addEventListener('change', function (e) {
        var tr = e.target.closest('tr[data-n]');
        if (!tr || e.target.dataset.ins !== 'descripcion') return;
        var i = editandoPU.insumos[tr.dataset.n], s = sugerencias[i.tipo][clave(i.descripcion)];
        if (!s) return;
        if (!txt(i.unidad)) i.unidad = s.unidad;
        if (!i.costo) i.costo = s.costo;
        cambioDialogo(true);
    });
    $('puDInsumos').addEventListener('click', function (e) {
        if (!e.target.classList.contains('borrar') || soloLectura) return;
        editandoPU.insumos.splice(e.target.closest('tr[data-n]').dataset.n, 1);
        cambioDialogo(true);
    });
    $('puDialogo').querySelectorAll('[data-pu-cerrar]').forEach(function (b) {
        b.addEventListener('click', function () { $('puDialogo').close(); });
    });
    $('puDialogo').addEventListener('close', function () {
        editandoPU = null;
        if (seccion === 'pu') renderPu();
    });

    Object.keys(CAMPOS_PU).forEach(function (k) {
        $(CAMPOS_PU[k]).addEventListener('input', function () {
            var v = this.value.trim();
            analisis[k] = k === 'util' && v === '' ? null : Math.max(0, num(v));
            if (k === 'fsr' && analisis.fsr <= 0) analisis.fsr = 1;
            marcarCambio();
            calcularTotales();
            pintarPu();
        });
    });

    // Conceptos del análisis incompletos (se avisa al guardar, no se impide)
    function conceptosIncompletosPU() {
        return analisis.conceptos.filter(function (c) { return revisionConcepto(c); });
    }

    // Formato impreso del catálogo con P.U. (y con el análisis de cada concepto en el detalle)
    function documentoPU(detalle) {
        var r = calcularPU(), partidas = [], porNombre = {};
        catalogoPU(r).forEach(function (x) {
            if (!porNombre[x.partida]) { porNombre[x.partida] = { nombre: x.partida, conceptos: [] }; partidas.push(porNombre[x.partida]); }
            var u = x.c ? costoUnitario(x.c) : null;
            porNombre[x.partida].conceptos.push({
                clave: x.clave, descripcion: x.descripcion, unidad: x.unidad, cantidad: x.cantidad, pu: x.pu, importe: x.importe,
                cd: x.cdU,
                insumos: !detalle ? [] : x.c ? x.c.insumos.map(function (i) {
                    var q = cantidadInsumo(i);
                    return { tipo: TIPOS_INSUMO[i.tipo], descripcion: i.descripcion, unidad: i.unidad, cantidad: q, costo: i.costo,
                             importe: q * i.costo * (i.tipo === 'MO' ? factorFsr() : 1) };
                }).concat(u && u.hm ? [{ tipo: 'Herramienta menor', descripcion: pct(analisis.hm) + ' de la mano de obra', unidad: '', cantidad: 0, costo: 0, importe: u.hm }] : [])
                : (x.articulos || []).map(function (a) {
                    return { tipo: 'Importado', descripcion: txt(a.nom_articulo) || txt(a.clave_articulo), unidad: txt(a.unid_medida),
                             cantidad: num(a.unidades), costo: num(a.precio_unit), importe: num(a.precio_total) };
                })
            });
        });
        return { r: r, subtotal: r.pv, catalogo: { partidas: partidas, factor: r.factor, detalle: detalle } };
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
        document.querySelectorAll('.encabezado input, .encabezado select, #descripcion, #pctUtilidad, #tSUB, #buscarHubspot, #puPanel input')
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
            obra_datos: datosObra(),
            analisis_pu: exportarAnalisis(),
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

    // Datos de la obra del encabezado (ventana Nueva obra): se guardan con el presupuesto y llenan la obra al registrarla
    var CAMPOS_OBRA = { nombre: 'obraNombre', descripcion: 'obraDescripcion', direccion: 'obraDireccion', colonia: 'obraColonia',
                        codigo_postal: 'obraCp', ciudad: 'obraCiudad', estado: 'obraEstado', telefono: 'obraTelefono',
                        mail: 'obraMail', observaciones: 'obraObservaciones' };
    function datosObra() {
        var d = {};
        Object.keys(CAMPOS_OBRA).forEach(function (k) { d[k] = $(CAMPOS_OBRA[k]).value; });
        d.bloqueada = $('obraBloqueada').checked;
        d.maestra = $('obraMaestra').checked;
        return d;
    }
    function ponerDatosObra(d) {
        Object.keys(CAMPOS_OBRA).forEach(function (k) {
            // Ciudad y Estado conservan su valor por omisión si el presupuesto no los trae
            if (d[k] !== null && d[k] !== undefined) $(CAMPOS_OBRA[k]).value = d[k];
            else if (k !== 'ciudad' && k !== 'estado') $(CAMPOS_OBRA[k]).value = '';
        });
        $('obraBloqueada').checked = !!d.bloqueada;
        $('obraMaestra').checked = !!d.maestra;
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
        var incompletos = conceptosIncompletosPU();
        if (incompletos.length && !confirm('Hay ' + incompletos.length + ' concepto(s) del Análisis P.U. sin terminar (' +
                incompletos.slice(0, 3).map(function (c) { return (c.descripcion || c.clave) + ': ' + revisionConcepto(c).toLowerCase(); }).join('; ') +
                (incompletos.length > 3 ? '…' : '') + ').\n\n¿Guardar de todos modos?')) return Promise.resolve(false);
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
    // modo: normal · detalle · pu (catálogo con precios unitarios) · pu-detalle (con el análisis de cada concepto)
    function prepararImpresion(modo) {
        var doc = documentoImpresion(), pu = modo === 'pu' || modo === 'pu-detalle';
        if (pu) {
            var x = documentoPU(modo === 'pu-detalle');
            doc.subtotal = x.subtotal;
            doc.catalogo = x.catalogo;
            doc.titulo = modo === 'pu' ? 'PRESUPUESTO POR PRECIOS UNITARIOS' : 'ANÁLISIS DE PRECIOS UNITARIOS';
        }
        $('formatoImpresion').innerHTML = FormatoPresupuesto(doc, window.ACRI_MEMBRETE || {}, modo === 'detalle' || modo === 'pu-detalle');
        impresionLista = true;
    }
    document.querySelectorAll('[data-imprimir]').forEach(function (b) {
        b.addEventListener('click', function () {
            var modo = b.dataset.imprimir;
            if (modo === 'pu' || modo === 'pu-detalle') {
                var r = calcularPU();
                if (!r.cd) { alert('No hay conceptos para imprimir. Captura conceptos en la pestaña Análisis P.U. (o en Materia Prima / Mano de Obra).'); return; }
                if (Math.abs(r.pv - r.subtotal) >= 0.5 && !confirm('El precio del Análisis P.U. ($' + fmt(r.pv) + ') es distinto al Subtotal del presupuesto ($' +
                        fmt(r.subtotal) + ') por los ajustes avanzados.\n\n¿Imprimir con el precio del análisis?')) return;
            }
            prepararImpresion(modo);
            window.print();
        });
    });
    // Ctrl + P imprime el formato normal
    window.addEventListener('beforeprint', function () { if (!impresionLista) prepararImpresion('normal'); });
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
            var nombre = prompt('Nombre de la obra:', $('obraNombre').value.trim() || $('proyecto').value.trim() || $('cliente').value.trim());
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

    // ---------- Prueba: llena todos los apartados con datos de PRUEBA y explica de dónde sale cada dato ----------
    // Usa los catálogos reales (conceptos, empleados, tipos de comisión) para que se vea de dónde se toman. No guarda.
    function cargarPrueba() {
        function primero(sec, filtro) { return (CATALOGO[sec] || []).filter(function (c) { return c.activo && filtro(c); })[0]; }
        var esFijo = function (c) { return [FIJOS.mano_obra, FIJOS.comisiones, FIJOS_PU.mp, FIJOS_PU.mo].map(clave).indexOf(clave(c.nombre)) >= 0; };
        var cMP = primero('mp', function (c) { return !c.auto && !esFijo(c); });
        var cGO = primero('go', function (c) { return !c.auto && !c.seguro; });
        var cSeg = primero('go', function (c) { return c.seguro; });
        var emp = EMPLEADOS[0], com = TIPOS_COMISION[0];
        var guia = [];

        // Encabezado y datos de la obra
        $('cliente').value = 'PRUEBA';
        $('email').value = 'prueba@prueba.com';
        $('proyecto').value = 'PRUEBA - Caseta de vigilancia';
        $('ubicacion').value = 'PRUEBA - Querétaro';
        ponerDatosObra({ nombre: 'PRUEBA', telefono: '4420000000', mail: 'prueba@prueba.com', direccion: 'Calle Prueba 123', colonia: 'Centro',
                         codigo_postal: '76000', ciudad: 'Querétaro', estado: 'Querétaro', descripcion: 'Obra de PRUEBA', observaciones: 'Generada con el botón Prueba' });
        $('descripcion').value = 'PRUEBA: presupuesto de ejemplo para ver cómo funciona cada apartado.';
        guia.push(['Encabezado', 'Cliente, Email, Proyecto y Ubicación «PRUEBA»',
            'Se capturan a mano. El correo, el cliente y el Id de Negocio normalmente se traen de HubSpot con el botón naranja junto a Email.']);
        guia.push(['Datos de la obra', 'Nombre, dirección, colonia, C.P., ciudad…',
            'Se capturan a mano y se guardan con el presupuesto; al «Registrar Obra» llenan el nombre, la dirección y las notas de la obra.']);
        guia.push(['Vendedor', $('vendedor').value,
            'Catálogo de vendedores de obra de AW-Management (vendedores_obras); si no hay, los vendedores activos de Easy-Glass.']);

        // Materia Prima / Gastos de Operacion: renglones capturados por importe
        datos = { mp: [], mo: [], go: [] };
        datos.mp.push({ id: ++consecutivo, concepto: cMP ? cMP.nombre : 'PRUEBA MATERIAL', presupuesto: 10000, importar: false, folio: '' });
        guia.push(['Materia Prima', (cMP ? cMP.nombre : 'PRUEBA MATERIAL') + ' por $10,000.00',
            'El concepto sale del catálogo Administrador › Conceptos de Materia Prima' + (cMP ? '' : ' (está vacío, por eso se usó un nombre de prueba)') +
            '. El importe se captura a mano, o con «Importar» desde un documento de Microsip (folio).']);
        datos.go.push({ id: ++consecutivo, concepto: cGO ? cGO.nombre : 'PRUEBA GASTO', presupuesto: 1500, importar: false, folio: '' });
        guia.push(['Gastos de Operacion', (cGO ? cGO.nombre : 'PRUEBA GASTO') + ' por $1,500.00',
            'Catálogo Administrador › Conceptos de Gastos de Operacion. Los marcados como cálculo automático se calculan solos con un % del subtotal.']);

        // Mano de Obra: empleados × días y comisiones
        extras = { empleados: [], comisiones: [], seguros: [], relacionados: [] };
        if (emp) {
            extras.empleados.push({ empleado_id: +emp.empleado_id, clave: emp.numero_empleado, nombre: emp.nombre, sueldo: num(emp.sueldo_diario), dias: 5, total: 0 });
            guia.push(['Mano de Obra · Empleados', emp.nombre + ' × 5 días × $' + fmt(num(emp.sueldo_diario)),
                'Empleados de obra activos de AW-Management (empleados_obra) con su sueldo diario. Sueldo × días pasa solo al renglón «' + FIJOS.mano_obra + '».']);
        } else {
            guia.push(['Mano de Obra · Empleados', 'Nada', 'No hay empleados de obra activos en AW-Management (empleados_obra).']);
        }
        if (com) {
            extras.comisiones.push({ tipo_id: +com.tipo_empleado_id, nombre: com.nombre, porcentaje: num(com.porcentaje), total: 0 });
            guia.push(['Mano de Obra · Comisiones', com.nombre + ' ' + num(com.porcentaje) + ' %',
                'Tipos de empleado con comisión de AW-Management (tipos_empleados_comisiones). El % se cobra sobre el Subtotal y pasa al renglón «' + FIJOS.comisiones + '».']);
        } else {
            guia.push(['Mano de Obra · Comisiones', 'Nada', 'No hay tipos de empleado con comisión en AW-Management (tipos_empleados_comisiones).']);
        }
        if (cSeg) {
            extras.seguros.push({ concepto: cSeg.nombre, porcentaje_1: 10, porcentaje_2: 5, total: 0 });
            guia.push(['Gastos de Operacion · Anexo de seguro', cSeg.nombre + ': 10 % × 5 %',
                'Conceptos de Gastos de Operacion marcados como seguro. Subtotal × %1 × %2 pasa a ese concepto en Gastos de Operacion.']);
        } else {
            guia.push(['Gastos de Operacion · Anexo de seguro', 'Nada', 'Ningún concepto de Gastos de Operacion está marcado como seguro.']);
        }

        // Análisis P.U.: dos conceptos con su análisis
        var mo = emp ? { tipo: 'MO', descripcion: emp.nombre, unidad: 'jornal', rinde: 8, costo: num(emp.sueldo_diario) || 800 }
                     : { tipo: 'MO', descripcion: 'PRUEBA Instalador', unidad: 'jornal', rinde: 8, costo: 800 };
        ponerAnalisisPU({
            fsr: 1, hm: 0, fin: 0, util: null,
            conceptos: [
                { clave: 'C-001', partida: 'PRUEBA Cancelería', descripcion: 'PRUEBA - Cancel de baño', unidad: 'm²', cantidad: 10, insumos: [
                    { tipo: 'MAT', descripcion: 'PRUEBA Vidrio templado 6 mm', unidad: 'm²', cantidad: 1.05, costo: 650 },
                    { tipo: 'MAT', descripcion: 'PRUEBA Perfil de aluminio', unidad: 'm', cantidad: 3.2, costo: 120 },
                    mo,
                    { tipo: 'EQ', descripcion: 'PRUEBA Andamio', unidad: 'día', cantidad: 0.1, costo: 150 }] },
                { clave: 'C-002', partida: 'PRUEBA Acabados', descripcion: 'PRUEBA - Muro de tablaroca', unidad: 'm²', cantidad: 20, insumos: [
                    { tipo: 'MAT', descripcion: 'PRUEBA Tablaroca', unidad: 'pza', cantidad: 0.35, costo: 220 },
                    { tipo: 'MO', descripcion: 'PRUEBA Tablarroquero', unidad: 'jornal', rinde: 12, costo: 750 }] }
            ]
        });
        guia.push(['Análisis P.U.', '«PRUEBA - Cancel de baño» 10 m² y «PRUEBA - Muro de tablaroca» 20 m², con sus insumos',
            'Se capturan en la pestaña Análisis P.U. con «Analizar». Los precios se sugieren de los empleados, de los artículos importados y de otros presupuestos. ' +
            'Lo analizado pasa solo a los renglones «' + FIJOS_PU.mp + '» (Materia Prima) y «' + FIJOS_PU.mo + '» (Mano de Obra).']);
        guia.push(['Conceptos/Tareas', 'Un Concepto/Tarea por cada renglón de MP / MO / GO',
            'Se generan solos con lo capturado en Materia Prima, Mano de Obra y Gastos de Operacion; ahí se les ponen fechas, responsable y avance (Gantt).']);
        guia.push(['Utilidad Neta', num($('pctUtilidad').value) + ' %',
            'Parámetro de costos 101 de AW-Management (parametros_costos_sug). Es margen sobre el precio: Subtotal = Costo ÷ (1 − %).']);
        guia.push(['Totales', 'Costo Primo, Gastos, Utilidad, Subtotal, IVA y Total',
            'Se calculan solos: MP + MO = Costo Primo; + Gastos de Operacion + Utilidad = Subtotal; + IVA 16 % = Total.']);
        guia.push(['Sugeridos relacionados e Id de Negocio', 'Nada',
            'Los sugeridos relacionados se ligan por folio después de guardar; el Id de Negocio se trae de HubSpot.']);
        guia.push(['Al presionar Guardar', 'Presupuesto PRUEBA con folio nuevo',
            'Se guarda en AW-Management: doctos_sugerido_obra (encabezado y datos de la obra), doctos_sugerido_obra_det (renglones), mano_obra_detalle, ' +
            'comisiones_obra_det, anexos_obra_seguro, conceptos_tareas y el Análisis P.U. en la columna ANALISIS_PU.']);

        ct.cargar([]);
        marcarCambio();
        calcularTotales();
        render();
        $('prGuia').innerHTML = guia.map(function (g) {
            return '<tr><td>' + escapar(g[0]) + '</td><td>' + escapar(g[1]) + '</td><td>' + escapar(g[2]) + '</td></tr>';
        }).join('');
        $('prDialogo').showModal();
    }
    document.querySelectorAll('[data-pr-cerrar]').forEach(function (b) {
        b.addEventListener('click', function () { $('prDialogo').close(); });
    });

    var acciones = {
        'prueba': function () {
            if (presupuestoId) { alert('La prueba se carga en un presupuesto nuevo, para no tocar este. Abre «Nuevo presupuesto» y presiona Prueba.'); return; }
            if (cambios && !confirm('Se reemplazará lo que capturaste en pantalla por los datos de PRUEBA. ¿Continuar?')) return;
            cargarPrueba();
        },
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
            ponerDatosObra(p.obra_datos || {});
            ponerAnalisisPU(p.analisis_pu);
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
