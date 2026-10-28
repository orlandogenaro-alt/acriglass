(function () {
    // Tasa de IVA del presupuesto (select ivaTasa; las tasas salen de Administrador › Parámetros de presupuesto)
    var PARAMETROS = window.ACRI_PARAMETROS_PRES || { iva_defecto: 16, iva_tasas: [], indirectos: [], financiamiento_pct: 0 };
    var IVA = (PARAMETROS.iva_defecto != null ? Number(PARAMETROS.iva_defecto) : 16) / 100;
    var NOMBRES = { mp: 'Materia Prima', mo: 'Mano de Obra', go: 'Gastos de Operacion', cc: 'Catálogo de Conceptos', pu: 'Análisis de Precios Unitarios', ex: 'Explosión de insumos', an: 'Análisis' };
    var AYUDAS = {
        grid: 'Ctrl + I para agregar un nuevo Concepto',
        cc: 'Como Neodata: partidas, subpartidas y conceptos con su P.U. (el análisis de cada uno está en Análisis P.U.)',
        an: 'Como la hoja de Excel: se llena solo con Materia Prima, Mano de Obra y Gastos de Operacion (clic en un renglón para ir a capturarlo)',
        ex: 'Como Neodata: todo lo que llevan los conceptos, sumado; las matrices dentro de matrices se desarman hasta sus insumos básicos',
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
        if (seccion === 'cc') { renderCc(); return; }
        if (seccion === 'pu') { renderPu(); return; }
        if (seccion === 'an') { renderResumenCc(); return; }
        if (seccion === 'ex') { renderExplosion(); return; }
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
                '<td' + (seccion === 'go' ? ' class="go-td"' : '') + '><input type="number" step="0.01" class="num" data-campo="presupuesto" value="' + (r.presupuesto || '') + '"' + dis + '>' +
                    (seccion === 'go' ? '<button type="button" class="go-calc" data-go-calc title="Cómo se calcula este gasto: fijo, por unidad, hora, jornada o % de la mano de obra">ƒx</button>' : '') + '</td>' +
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
        if (seccion === 'cc') { pintarCc(); return; }
        if (seccion === 'pu') { renderPu(); return; }
        if (seccion === 'an') { renderResumenCc(); return; }
        if (seccion === 'ex') { renderExplosion(); return; }
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
                      : r.calc === 'pu' ? 'Se calcula con los conceptos de la pestaña Análisis P.U.'
                      : r.calc === 'gasto' ? 'Se calcula: ' + descripcionGasto(r.gasto) + ' (botón ƒx)' : '';
            // Solo un gasto capturado o calculado se puede calcular (no los automáticos, los fijos ni los del análisis)
            var fx = tr.querySelector('[data-go-calc]');
            if (fx) { fx.hidden = !!r.calc && r.calc !== 'gasto'; fx.classList.toggle('activo', r.calc === 'gasto'); }
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
        if (seccion === 'cc') { agregarConceptoCc(); return; }
        if (seccion === 'an' || seccion === 'ex') return;
        if (soloLectura) { avisoSoloLectura(); return; }
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

    function eliminarConcepto(i) {
        if (!confirm('¿Deseas eliminar del presupuesto el concepto seleccionado ?')) return;   // Form46
        datos[seccion].splice(i, 1);
        marcarCambio();
        render();
    }

    // Sube (d = -1) o baja (d = 1) el concepto; los demás se recorren. Se guarda en ese orden.
    function moverConcepto(i, d) {
        var filas = datos[seccion], j = i + d;
        if (j < 0 || j >= filas.length) return;
        var r = filas.splice(i, 1)[0];
        filas.splice(j, 0, r);
        marcarCambio();
        render();
        var tr = tbody.querySelector('tr[data-i="' + j + '"]');
        if (tr) tr.classList.add('actual');
    }

    tbody.addEventListener('click', function (e) {
        if (e.target.closest('[data-go-calc]')) { abrirGasto(+e.target.closest('tr').dataset.i); return; }
        if (!e.target.classList.contains('borrar')) return;
        eliminarConcepto(+e.target.closest('tr').dataset.i);
    });

    // Materia Prima / Mano de Obra / Gastos de Operacion: clic derecho en un renglón → Eliminar, Subir o Bajar posición
    var menuFila = document.createElement('div');
    menuFila.className = 'menu';
    document.body.appendChild(menuFila);
    function cerrarMenuFila() { menuFila.classList.remove('abierto'); }
    document.addEventListener('click', cerrarMenuFila);
    document.addEventListener('scroll', cerrarMenuFila, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarMenuFila(); });
    tbody.addEventListener('contextmenu', function (e) {
        if (!datos[seccion]) return;
        var tr = e.target.closest('tr[data-i]');
        if (!tr) return;
        e.preventDefault();
        var i = +tr.dataset.i, n = datos[seccion].length, dis = soloLectura;
        tbody.querySelectorAll('tr.actual').forEach(function (t) { t.classList.remove('actual'); });
        tr.classList.add('actual');
        menuFila.innerHTML = '';
        [
            ['▲ Subir posición', !dis && i > 0, function () { moverConcepto(i, -1); }],
            ['▼ Bajar posición', !dis && i < n - 1, function () { moverConcepto(i, 1); }],
            ['🗑 Eliminar', !dis, function () { eliminarConcepto(i); }]
        ].forEach(function (o) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = o[0];
            b.disabled = !o[1];
            b.addEventListener('click', function () { cerrarMenuFila(); o[2](); });
            menuFila.appendChild(b);
        });
        if (dis) {
            var aviso = document.createElement('div');
            aviso.className = 'menu-aviso';
            aviso.textContent = '🔒 Presiona «Modificar» para habilitarlo';
            menuFila.appendChild(aviso);
        }
        menuFila.classList.add('abierto');
        menuFila.style.left = Math.min(e.clientX, window.innerWidth - menuFila.offsetWidth - 8) + 'px';
        menuFila.style.top = Math.min(e.clientY, window.innerHeight - menuFila.offsetHeight - 8) + 'px';
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
            var cc = seccion === 'cc', pu = seccion === 'pu', an = seccion === 'an', ex = seccion === 'ex';
            $('secNombre').textContent = NOMBRES[seccion] + ':';
            $('secAyuda').textContent = AYUDAS[cc ? 'cc' : pu ? 'pu' : an ? 'an' : ex ? 'ex' : 'grid'];
            document.querySelector('.grid-caja').hidden = cc || pu || an || ex;
            $('exPanel').hidden = !ex;
            $('ccPanel').hidden = !cc;
            $('puPanel').hidden = !pu;
            $('anPanel').hidden = !an;
            render();
        });
    });

    // ---------- Conceptos/Tareas (js/conceptos-tareas.js, se guardan con el presupuesto) ----------
    // Ya no tienen pestaña en el presupuesto (la ocupa el Catálogo de Conceptos): se siguen generando y guardando
    // para el programa de la Obra, y dan la unidad y cantidad de lo capturado por importe
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
        visible: function () { return false; },
        carpeta: function () { return adjCarpeta; },
        alCambiar: marcarCambio
    });
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
    // Base de los indirectos: costo directo completo (toda la Materia Prima y la Mano de Obra sin las comisiones)
    function baseCostoDirecto() {
        var b = baseManoObra();
        datos.mp.forEach(function (r) { b += num(r.presupuesto); });
        datos.go.forEach(function (r) { if (r.calc === 'pu') b += num(r.presupuesto); });   // maquinaria, herramienta y otros de los análisis
        return b;
    }
    // Mano de obra del presupuesto sin las comisiones: base de los gastos «% de la mano de obra»
    function baseManoObra() {
        var b = 0;
        datos.mo.forEach(function (r) { if (clave(r.concepto) !== clave(FIJOS.comisiones)) b += num(r.presupuesto); });
        return b;
    }
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
        datos.go.forEach(function (r) { if (r.calc === 'pu') b += num(r.presupuesto); });
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
        ponerInsumosPU();
        // Gastos de Operación calculados (botón ƒx): por unidad / hora / jornada o % de la mano de obra
        var moBase = null;
        datos.go.forEach(function (r) {
            if (!r.gasto || r.calc) return;
            if (moBase === null) moBase = baseManoObra();
            var imp = CALC.gastoOperacion(r.gasto, moBase);
            if (imp === null) return;
            r.presupuesto = redondear(imp);
            r.calc = 'gasto';
        });
        // calcula_conceptos_calc_automatico: % del subtotal; los gastos base_mp, % de la base de MP + MO
        datos.mp.forEach(function (r) {
            var i = infoConcepto('mp', r.concepto);
            if (!i || !i.auto || num(i.pct) <= 0) return;
            r.presupuesto = redondear(subtotal * num(i.pct) / 100);
            r.calc = 'auto';
        });
        var base = null, baseCd = null;
        datos.go.forEach(function (r) {
            var i = infoConcepto('go', r.concepto);
            if (!i || !i.auto || num(i.pct) <= 0) return;
            if (i.base_mp && base === null) base = baseGastoAdministrativo();
            if (i.indirecto && baseCd === null) baseCd = baseCostoDirecto();
            r.presupuesto = redondear((i.indirecto ? baseCd : i.base_mp ? base : subtotal) * num(i.pct) / 100);
            r.calc = 'auto';
        });
        // calcula_conceptos_anexo7: subtotal × %1 × %2 al concepto de Gastos de Operacion
        extras.seguros.forEach(function (s) {
            s.total = redondear(subtotal * num(s.porcentaje_1) * 0.01 * num(s.porcentaje_2) * 0.01);
            ponerFijo('go', s.concepto, s.total);
        });
    }

    // Análisis P.U.: cada insumo de los conceptos analizados es un renglón de Materia Prima (materiales, equipo y herramienta)
    // o de Mano de Obra (sueldos × FSR), sumado en toda la obra como la explosión de insumos de Neodata.
    // Los renglones que ya no lleva ningún análisis se quitan (y el renglón único de antes, «MATERIALES SEGUN ANALISIS P.U.»).
    // Si el presupuesto no trae análisis (p. ej. se guardó sin la columna) sus renglones se respetan como están
    var filasPU = { mp: {}, mo: {}, go: {} };
    // Sección de un insumo del análisis: la mano de obra a Mano de Obra; maquinaria, herramienta y otros (fletes, servicios)
    // a Gastos de Operación; materiales y equipo a Materia Prima (el equipo ahí, como siempre, para no mover lo ya guardado)
    function seccionInsumo(tipo) { return tipo === 'MO' ? 'mo' : ['MAQ', 'HER', 'OTRO'].indexOf(tipo) >= 0 ? 'go' : 'mp'; }
    function ponerInsumosPU() {
        if (analisis.conceptos.length) huboAnalisis = true;
        if (!huboAnalisis) return;
        var nuevos = { mp: {}, mo: {}, go: {} }, lista = { mp: [], mo: [], go: [] }, moReal = 0;
        function sumar(sec, nombre, importe) {
            var k = clave(nombre);
            if (!nuevos[sec][k]) { nuevos[sec][k] = { nombre: txt(nombre), importe: 0 }; lista[sec].push(nuevos[sec][k]); }
            nuevos[sec][k].importe += importe;
        }
        analisis.conceptos.forEach(function (c) {
            if (!alCosto(c)) return;
            var imps = importesInsumos(c);
            c.insumos.forEach(function (i, n) {
                var sec = seccionInsumo(i.tipo), imp = imps[n].importe * c.cantidad;
                if (!imp) return;
                sumar(sec, txt(i.descripcion) || TIPOS_INSUMO[i.tipo], imp);
                if (sec === 'mo') moReal += imp;
            });
        });
        if (moReal * analisis.hm) sumar('mp', 'HERRAMIENTA MENOR (% DE LA MANO DE OBRA)', moReal * analisis.hm / 100);
        ['mp', 'mo', 'go'].forEach(function (sec) {
            for (var n = datos[sec].length - 1; n >= 0; n--) {
                var k = clave(datos[sec][n].concepto);
                if (!nuevos[sec][k] && (filasPU[sec][k] || (FIJOS_PU[sec] && k === clave(FIJOS_PU[sec])))) datos[sec].splice(n, 1);
            }
            lista[sec].forEach(function (x) { ponerFijo(sec, x.nombre, x.importe, 'pu'); });
        });
        filasPU = nuevos;
    }

    function firma() {
        return ['mp', 'mo', 'go'].map(function (s) { return datos[s].map(function (r) { return num(r.presupuesto); }).join(','); }).join('|');
    }

    // Utilidad Neta, según el selector del presupuesto:
    //   costo  → se suma al costo:            subtotal = costo × (1 + %util / 100)   (20 % de 1,000 = 1,200)
    //   margen → margen sobre el precio (Form46): subtotal = costo / (1 − %util / 100)   (20 % de 1,000 = 1,250)
    // Los presupuestos nuevos usan «costo»; uno guardado conserva la forma con la que se calculó.
    function modoUtilidad() { return $('modoUtilidad').value === 'margen' ? 'margen' : 'costo'; }
    function subtotalPorUtilidad(costo) {
        var pct = num($('pctUtilidad').value);
        if (modoUtilidad() === 'costo') return costo * (1 + pct / 100);
        return pct < 100 ? costo / ((100 - pct) * 0.01) : costo;
    }
    // % de utilidad que corresponde a un subtotal capturado a mano (lápiz)
    function utilidadPorSubtotal(costo, subtotal) {
        if (!subtotal) return 0;
        if (modoUtilidad() === 'costo') return costo ? (subtotal / costo - 1) * 100 : 0;
        return 100 - costo / (subtotal * 0.01);
    }
    function ponerModoUtilidad(m) {
        $('modoUtilidad').value = $('puModoVis').value = m === 'margen' ? 'margen' : 'costo';
        $('pctUtilidad').max = m === 'margen' ? 99.9999 : 1000;
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
        if (subtotalManual) $('pctUtilidad').value = utilidadPorSubtotal(t.costo, subtotal).toFixed(4);
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
    var TIPOS_INSUMO = { MAT: 'Material', MO: 'Mano de obra', EQ: 'Equipo', MAQ: 'Maquinaria', HER: 'Herramienta', OTRO: 'Otro (flete, servicio)' };
    // Fórmulas por insumo y por concepto, y el sobrecosto: js/presupuesto-calculo.js (gemelo de includes/presupuesto-calculo.php)
    var CALC = window.AcriCalculoPU;
    // Campos opcionales del insumo (tipo de cálculo, merma, FSR propio, viáticos, proveedor…): se guardan solo si se capturan
    var CAMPOS_INSUMO = { tipo_calculo: 'texto', base: 'texto', factor: 'num', merma_pct: 'num', fsr: 'num', viaticos: 'num',
                          alimentacion: 'num', hospedaje: 'num', proveedor: 'texto', fecha_costo: 'texto', fasar_id: 'num' };
    // FASAR activos del catálogo (Catalogos › Parámetros de costos): { fasar_id, nombre, dias_calendario, dias_pagados, … fsr }
    var FASAR = window.ACRI_FASAR || [];
    function fasarPorId(id) { return FASAR.filter(function (f) { return f.fasar_id === +id; })[0] || null; }
    var BIBLIOTECA = window.ACRI_BIBLIOTECA_PU || { conceptos: [], insumos: [] };
    var CATALOGO_PU = window.ACRI_CATALOGO_PU || [];   // Catalogos › Insumos (precio vigente; mano de obra sin FSR)
    var CONCEPTOS_PU = window.ACRI_CONCEPTOS_PU || [];  // Catalogos › Conceptos P.U. con su matriz desarmada (mano de obra sin FSR)
    var CAMPOS_PU = { fsr: 'puFsr', hm: 'puHm', fin: 'puFin' };
    var analisis = { fsr: 1, hm: 0, fin: Number(PARAMETROS.financiamiento_pct) || 0, util: null, conceptos: [] };   // util null = equivalente a la Utilidad Neta
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
        var r = { tipo: TIPOS_INSUMO[i.tipo] ? i.tipo : 'MAT', codigo: String(i.codigo || ''), descripcion: String(i.descripcion || ''), unidad: String(i.unidad || ''),
                  cantidad: num(i.cantidad), rinde: num(i.rinde), costo: num(i.costo) };
        Object.keys(CAMPOS_INSUMO).forEach(function (k) {
            var v = i[k];
            if (v === undefined || v === null || v === '') return;
            r[k] = CAMPOS_INSUMO[k] === 'num' ? num(v) : String(v);
        });
        // Matriz dentro de matriz: sus componentes (p. ej. la cuadrilla = 1 aluminero + 1 ayudante)
        if (Array.isArray(i.componentes) && i.componentes.length) r.componentes = i.componentes.map(limpiarInsumo);
        return r;
    }
    function nuevoConcepto(c) {
        c = c || {};
        // id: el renglón del concepto en la base (presupuesto_conceptos, migraciones/017); 0 = aún no se guarda
        return { uid: ++uidPU, id: Math.max(0, parseInt(c.id, 10) || 0), clave: String(c.clave || '') || siguienteClave(), partida: String(c.partida || ''),
                 descripcion: String(c.descripcion || ''), unidad: String(c.unidad || ''), cantidad: num(c.cantidad),
                 especificacion: String(c.especificacion || ''), venta: Math.max(0, num(c.venta)), insumos: (c.insumos || []).map(limpiarInsumo) };
    }
    // Precio fijo para el cliente (importado del Catálogo junto con el Análisis): su P.U. es el del archivo y no suma al costo,
    // porque el costo ya está en Materia Prima, Mano de Obra y Gastos de Operacion
    function esVenta(c) { return c.venta > 0; }
    var TITULO_FIJO = 'Precio importado del Catálogo: el costo viene de Materia Prima, Mano de Obra y Gastos de Operacion. ' +
                      'Ver o capturar su matriz (informativa: no suma al costo)';
    function hayVenta() { return analisis.conceptos.some(esVenta); }
    // Con «La matriz de los precios fijos es el costo» (presupuestos traídos de Neodata: el Catálogo da el precio y la matriz
    // el costo) la matriz de un precio fijo suma a Materia Prima y Mano de Obra; sin ella es informativa
    function alCosto(c) { return !esVenta(c) || analisis.matrizCosto; }

    function ponerAnalisisPU(a) {
        a = a || {};
        analisis = {
            fsr: num(a.fsr) > 0 ? num(a.fsr) : 1, hm: num(a.hm), fin: num(a.fin),
            util: a.util === null || a.util === undefined || a.util === '' ? null : num(a.util),
            matrizCosto: !!a.matriz_costo, fasarId: parseInt(a.fasar_id, 10) || 0, conceptos: []
        };
        (a.conceptos || []).forEach(function (c) { analisis.conceptos.push(nuevoConcepto(c)); });
        huboAnalisis = analisis.conceptos.length > 0;
        filasPU = { mp: {}, mo: {}, go: {} };
        Object.keys(CAMPOS_PU).forEach(function (k) { $(CAMPOS_PU[k]).value = analisis[k]; });
        $('puMatrizCosto').checked = analisis.matrizCosto;
    }
    function exportarAnalisis() {
        return {
            fsr: analisis.fsr, hm: analisis.hm, fin: analisis.fin, util: null, matriz_costo: !!analisis.matrizCosto, fasar_id: analisis.fasarId || 0,
            conceptos: analisis.conceptos.map(function (c) {
                return { id: c.id || 0, uid: c.uid, clave: c.clave, partida: c.partida, descripcion: c.descripcion, unidad: c.unidad, cantidad: c.cantidad,
                         especificacion: c.especificacion || '', venta: esVenta(c) ? c.venta : 0,
                         insumos: c.insumos.map(function (i) { return limpiarInsumo(i); }) };
            })
        };
    }

    // Cantidad del insumo por unidad del concepto: cantidad directa o 1 / rendimiento, con factor y merma (en pct_mo es el %)
    function cantidadInsumo(i, c) { return CALC.cantidad(i, c ? c.cantidad : 0); }
    // Importe del insumo por unidad del concepto (mano de obra con FSR y viáticos; pct_mo sobre la mano de obra)
    function importesInsumos(c) { return CALC.concepto(c, analisis).insumos; }
    var SIN_COSTO = { mat: 0, mo: 0, moReal: 0, eq: 0, maq: 0, her: 0, otro: 0, hm: 0, cd: 0 };
    // Costo de UNA unidad del concepto. Uno de precio fijo no suma al costo: su matriz es informativa, salvo con «La matriz
    // de los precios fijos es el costo» (informativa = true la calcula igual, para mostrarla en la ventana del análisis)
    function costoUnitario(c, informativa) {
        return informativa || alCosto(c) ? CALC.concepto(c, analisis).totales : Object.assign({}, SIN_COSTO);
    }
    function totalesAnalisis() {
        var t = Object.assign({}, SIN_COSTO);
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
        if (esVenta(c)) return '';
        if (!c.insumos.length) return 'Falta el análisis';
        if (c.insumos.some(function (i) { return !i.descripcion.trim() || cantidadInsumo(i, c) <= 0 || (CALC.costoReal(i, factorFsr()) <= 0 && i.base !== 'pct_mo'); })) return 'Insumo incompleto';
        return '';
    }

    function calcularPU() {
        var t = recalcular();
        var fsr = factorFsr(), hm = analisis.hm / 100;
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
                if (f.calc === 'pu' || k === clave(FIJOS_PU[sec])) return;   // ya viene del análisis
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
        r.mp += a.mat + a.eq + a.maq + a.her + a.otro;
        r.mo += a.mo;
        r.fsr += a.moReal - a.mo;   // FSR y viáticos de la mano de obra analizada
        r.hm += a.hm;
        datos.go.forEach(function (f) { if (!seguros[clave(f.concepto)] && f.calc !== 'pu') r.ind += num(f.presupuesto); });

        r.cd = r.mp + r.mo + r.fsr + r.hm;
        // Financiamiento, utilidad equivalente a la del presupuesto, cargos adicionales y factor de sobrecosto
        var s = CALC.sobrecosto(r.cd, r.ind, analisis.fin, num($('pctUtilidad').value), modoUtilidad(), ca);
        r.fin = s.fin;
        r.utilPct = s.util_pct;
        r.util = s.util;
        r.pv = s.pv;
        r.cargos = s.cargos;
        r.factor = s.factor;
        r.subtotal = t.subtotal;
        return r;
    }

    function pct(n) { return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %'; }
    function cant(n) { return n.toLocaleString('es-MX', { maximumFractionDigits: 4 }); }

    // Sugerencias para no teclear precios: lo ya capturado en este presupuesto, el catálogo de insumos,
    // los artículos importados, los empleados (sueldo diario por jornal) y lo usado en otros presupuestos. Gana lo primero.
    // Maquinaria, herramienta y otros comparten las sugerencias del equipo
    function grupoSugerencia(tipo) { return tipo === 'MAT' || tipo === 'MO' ? tipo : 'EQ'; }
    function construirSugerencias() {
        sugerencias = { MAT: {}, MO: {}, EQ: {} };
        function poner(tipo, descripcion, unidad, costo) {
            var k = clave(descripcion);
            tipo = grupoSugerencia(tipo);
            if (!k || sugerencias[tipo][k] || !(num(costo) > 0)) return;
            sugerencias[tipo][k] = { descripcion: txt(descripcion), unidad: txt(unidad), costo: num(costo) };
        }
        analisis.conceptos.forEach(function (c) { c.insumos.forEach(function (i) { poner(i.tipo, i.descripcion, i.unidad, i.costo); }); });
        CATALOGO_PU.forEach(function (i) { poner(i.tipo, i.descripcion, i.unidad, i.costo); });
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
        $('puSugConceptos').innerHTML = CONCEPTOS_PU.map(function (c) {
            return '<option value="' + escapar(c.descripcion) + '">' + escapar(c.unidad) + ' · catálogo ' + escapar(c.codigo) + '</option>';
        }).join('') + (BIBLIOTECA.conceptos || []).map(function (c) {
            return '<option value="' + escapar(c.descripcion) + '">' + escapar(c.unidad) + ' · folio ' + c.folio + '</option>';
        }).join('');
    }

    // Un concepto ya analizado en otro presupuesto: se ofrece copiar su análisis (solo si este aún no tiene)
    function ofrecerBiblioteca(c) {
        if (c.insumos.length || soloLectura) return false;
        var k = clave(c.descripcion);
        // Primero el catálogo de conceptos (precios vigentes del catálogo de insumos)
        var cat = CONCEPTOS_PU.filter(function (x) { return clave(x.descripcion) === k; })[0];
        if (cat && confirm('«' + cat.descripcion + '» está en el catálogo de conceptos (' + cat.codigo + ', ' + cat.insumos.length + ' insumos por ' +
                           (cat.unidad || 'unidad') + ').' + (cat.faltan.length ? '\n\nOjo: sin precio en el catálogo: ' + cat.faltan.join(', ') + '.' : '') +
                           '\n\n¿Copiar su análisis con los precios vigentes del catálogo? Después puedes ajustarlo.')) {
            c.insumos = cat.insumos.map(limpiarInsumo);
            if (!txt(c.unidad)) c.unidad = cat.unidad || '';
            if (!txt(c.partida)) c.partida = cat.partida || '';
            if (!txt(c.especificacion)) c.especificacion = cat.especificacion || '';
            return true;
        }
        var b = (BIBLIOTECA.conceptos || []).filter(function (x) { return clave(x.descripcion) === k; })[0];
        if (!b) return false;
        if (!confirm('«' + b.descripcion + '» ya se analizó en el presupuesto folio ' + b.folio + ' (' + b.insumos.length +
                     ' insumos, por ' + (b.unidad || 'unidad') + ').\n\n¿Copiar su análisis con sus precios? Después puedes ajustarlo.')) return false;
        c.insumos = b.insumos.map(limpiarInsumo);
        if (!txt(c.unidad)) c.unidad = b.unidad || '';
        if (!txt(c.partida)) c.partida = b.partida || '';
        if (!txt(c.especificacion)) c.especificacion = b.especificacion || '';
        return true;
    }

    // Catálogo para pintar e imprimir: conceptos analizados y los capturados por importe, con su P.U.
    function catalogoPU(r) {
        var lista = analisis.conceptos.map(function (c) {
            var u = costoUnitario(c), pu = esVenta(c) ? c.venta : u.cd * r.factor;
            return { c: c, clave: c.clave, partida: txt(c.partida) || 'Sin partida', descripcion: c.descripcion, unidad: c.unidad,
                     cantidad: c.cantidad, cdU: u.cd, pu: pu, importe: pu * c.cantidad, venta: esVenta(c) };
        });
        var tareas = {};
        if (r.otros.length) ct.exportar().tareas.forEach(function (x) { if (x.origen) tareas[x.origen] = x; });
        r.otros.forEach(function (o) {
            var tr = tareas[o.sec + ':' + o.fila.id] || {}, cantidad = num(tr.cantidad) || 1;
            lista.push({ otro: true, sec: o.sec, fila: o.fila, clave: tr.clave || SIGLAS[o.sec] + '-' + o.fila.id, partida: txt(tr.agrupador) || NOMBRES[o.sec],
                         descripcion: o.fila.concepto, unidad: tr.unidad || 'Lote', cantidad: cantidad, cdU: o.cd / cantidad,
                         pu: o.cd * r.factor / cantidad, importe: o.cd * r.factor, articulos: o.fila.articulos || [] });
        });
        return lista;
    }
    // Lo que ve el cliente (Catálogo de Conceptos e impresos): con precios fijos importados, lo capturado por importe
    // en MP / MO ya está dentro de esos precios y no se lista aparte
    function catalogoCliente(r) {
        var venta = hayVenta();
        return catalogoPU(r).filter(function (x) { return !(venta && x.otro); });
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
                    '<td class="ro izq pu-rev">Por importe</td><td class="pu-acciones">' + (x.fila.calc ? '' :
                    '<button type="button" class="ct-btn" data-pu-accion="analizar-importe" data-sec="' + x.sec + '" data-id="' + x.fila.id + '"' +
                    ' title="Pasarlo al análisis con lo que ya tiene capturado"' + dis + '>Analizar</button>') + '</td></tr>';
                return;
            }
            var c = x.c, falta = revisionConcepto(c);
            html += '<tr data-uid="' + c.uid + '"' + (c.id ? ' data-id="' + c.id + '"' : '') + ' title="Doble clic: abrir su análisis"><td class="id">' + escapar(c.clave) + '</td>' +
                '<td><input type="text" data-pu="partida" list="puPartidas" maxlength="100" value="' + escapar(c.partida) + '" placeholder="Partida"' + dis + '></td>' +
                '<td><input type="text" data-pu="descripcion" list="puSugConceptos" maxlength="300" value="' + escapar(c.descripcion) + '" placeholder="¿Qué trabajo es?"' + dis + '></td>' +
                '<td><input type="text" data-pu="unidad" list="puUnidades" maxlength="20" value="' + escapar(c.unidad) + '" placeholder="m², pza…"' + dis + '></td>' +
                '<td><input type="number" class="num" data-pu="cantidad" step="0.01" min="0" value="' + (c.cantidad || '') + '"' + dis + '></td>' +
                '<td class="ro" data-pu-calc="pu">' + fmt(x.pu) + '</td><td class="ro" data-pu-calc="importe">' + fmt(x.importe) + '</td>' +
                '<td class="ro izq pu-rev' + (falta ? ' falta' : ' ok') + '" data-pu-calc="rev">' + (falta ? '⚠ ' + falta : '✓ Listo') + '</td>' +
                '<td class="pu-acciones">' + (esVenta(c) ? '<button type="button" class="ct-btn" data-pu-accion="analizar" title="' + TITULO_FIJO + '">Precio fijo</button>'
                    : '<button type="button" class="ct-btn" data-pu-accion="analizar" title="Capturar lo que lleva una unidad">Analizar</button>') +
                '<button type="button" class="pu-mini" data-pu-accion="duplicar" title="Duplicar el concepto con su análisis"' + dis + '>⧉</button>' +
                '<button type="button" class="pu-mini borrar" data-pu-accion="quitar" title="Quitar el concepto"' + dis + '>✕</button></td></tr>';
        });
        $('puConceptos').innerHTML = html;
        $('puAgregar').disabled = soloLectura;
        if ($('puPlantilla')) $('puPlantilla').disabled = soloLectura;
        pintarPu(r, lista);
    }

    // Cifras sin volver a pintar los campos (para no perder el cursor mientras se escribe)
    function pintarPu(r, lista) {
        r = r || calcularPU();
        lista = lista || catalogoPU(r);
        if (document.activeElement !== $('puUtilVis')) $('puUtilVis').value = num($('pctUtilidad').value);
        $('puUtilVis').disabled = soloLectura || subtotalManual;
        $('puModoVis').disabled = soloLectura;
        $('puModoVis').value = modoUtilidad();
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

    // Explosión de insumos con el motor (js/presupuesto-calculo.js): los conceptos que suman al costo (la matriz de un
    // precio fijo es informativa, salvo con «La matriz de los precios fijos es el costo») o uno solo, y en toda la obra
    // los artículos importados de Materia Prima, Mano de Obra y Gastos de Operacion
    function explosionPU(conceptos, desglosar, importados) {
        var e = CALC.explosion({ fsr: analisis.fsr, hm: analisis.hm, conceptos: conceptos }, desglosar);
        var lista = e.insumos.map(function (i) { return { tipo: TIPOS_INSUMO[i.tipo], codigo: i.codigo, nombre: i.descripcion, um: i.unidad, cantidad: i.cantidad, importe: i.importe }; });
        if (e.totales.hm) lista.push({ tipo: 'Herramienta', codigo: '', nombre: 'HERRAMIENTA MENOR (' + pct(analisis.hm) + ' DE LA MANO DE OBRA)', um: '%', cantidad: 0, importe: e.totales.hm });
        if (importados) {
            var porClave = {};
            ['mp', 'mo', 'go'].forEach(function (sec) {
                datos[sec].forEach(function (f) {
                    (f.articulos || []).forEach(function (a) {
                        var nombre = txt(a.nom_articulo) || txt(a.clave_articulo), k = sec + '|' + clave(nombre) + '|' + clave(a.unid_medida);
                        if (!porClave[k]) { porClave[k] = { tipo: 'Importado (' + SIGLAS[sec] + ')', codigo: txt(a.clave_articulo), nombre: nombre, um: txt(a.unid_medida), cantidad: 0, importe: 0 }; lista.push(porClave[k]); }
                        porClave[k].cantidad += num(a.unidades);
                        porClave[k].importe += num(a.precio_total);
                    });
                });
            });
        }
        return lista;
    }
    function filasExplosion(lista, codigo) {
        var total = lista.reduce(function (s, i) { return s + i.importe; }, 0);
        return lista.map(function (i) {
            return '<tr>' + (codigo ? '<td class="id">' + escapar(i.codigo) + '</td>' : '') + '<td class="ro izq">' + escapar(i.nombre) + '</td><td class="ro izq">' + escapar(i.tipo) + '</td>' +
                '<td class="ro izq">' + escapar(i.um) + '</td><td class="ro">' + (i.cantidad ? cant(Math.round(i.cantidad * 10000) / 10000) : '') + '</td>' +
                '<td class="ro">' + (i.cantidad ? fmt(i.importe / i.cantidad) : '') + '</td><td class="ro">' + fmt(i.importe) + '</td>' +
                '<td class="ro">' + (total ? pct(i.importe / total * 100) : '') + '</td></tr>';
        }).join('');
    }
    // Panel del Análisis P.U.: toda la obra, ordenada por importe
    function pintarExplosion() {
        var lista = explosionPU(analisis.conceptos.filter(alCosto), true, true).sort(function (a, b) { return b.importe - a.importe; });
        $('puInsumos').innerHTML = lista.length ? filasExplosion(lista, false)
            : '<tr class="vacio-fila"><td colspan="7">Aquí se suma todo lo que lleva la obra en cuanto analices conceptos o importes documentos.</td></tr>';
    }
    // Pestaña Explosión: toda la obra o un concepto, con las matrices dentro de matrices desarmadas o no
    var exLista = [];
    function renderExplosion() {
        var sel = $('exConcepto'), actual = sel.value;
        sel.innerHTML = '<option value="">Toda la obra</option>' + analisis.conceptos.map(function (c) {
            return '<option value="' + c.uid + '">' + escapar((c.clave ? c.clave + ' · ' : '') + (c.descripcion || '(sin descripción)')) + '</option>';
        }).join('');
        sel.value = conceptoPU(actual) ? actual : '';
        var c = sel.value ? conceptoPU(sel.value) : null, desglosar = $('exDesglosar').checked;
        exLista = explosionPU(c ? [c] : analisis.conceptos.filter(alCosto), desglosar, !c);
        var total = exLista.reduce(function (s, i) { return s + i.importe; }, 0), porTipo = {};
        exLista.forEach(function (i) { porTipo[i.tipo] = (porTipo[i.tipo] || 0) + i.importe; });
        $('exNota').textContent = c ? 'Concepto: ' + cant(c.cantidad) + ' ' + (txt(c.unidad) || 'unidad') + (esVenta(c) && !alCosto(c) ? ' · precio fijo: su matriz es informativa' : '')
                                    : analisis.conceptos.length + ' conceptos analizados';
        $('exCuerpo').innerHTML = exLista.length ? filasExplosion(exLista, true)
            : '<tr class="vacio-fila"><td colspan="8">Aún no hay insumos: analiza los conceptos en el Catálogo de Conceptos o en Análisis P.U.</td></tr>';
        $('exPie').innerHTML = Object.keys(porTipo).map(function (t) {
            return '<tr class="ex-tipo"><td colspan="6" class="ro">' + escapar(t) + '</td><td class="ro">' + fmt(porTipo[t]) + '</td><td class="ro">' + (total ? pct(porTipo[t] / total * 100) : '') + '</td></tr>';
        }).join('') + '<tr class="pu-total"><td colspan="6" class="ro">Total' + (c ? ' del concepto (costo directo)' : ' de la obra') + '</td><td class="ro">' + fmt(total) + '</td><td></td></tr>';
    }
    $('exConcepto').addEventListener('change', renderExplosion);
    $('exDesglosar').addEventListener('change', renderExplosion);
    $('exExportar').addEventListener('click', function () {
        var filas = [['Código', 'Insumo', 'Tipo', 'Unidad', 'Cantidad', 'Costo prom.', 'Importe'].map(function (t) { return { v: t, e: 'titulo' }; })];
        exLista.forEach(function (i) {
            filas.push([i.codigo, { v: i.nombre, e: 'texto' }, i.tipo, i.um, i.cantidad ? { v: Math.round(i.cantidad * 10000) / 10000, e: 'cantidad' } : null,
                        i.cantidad ? { v: redondear(i.importe / i.cantidad), e: 'dinero' } : null, { v: redondear(i.importe), e: 'dinero' }]);
        });
        if (filas.length < 2) { alert('No hay insumos que exportar.'); return; }
        XlsxSimple.descargar(XlsxSimple.crear({ nombre: 'Explosion', anchos: [16, 50, 18, 9, 12, 14, 14], fijarFila: 1, filas: filas }),
                             'Explosion ' + (txt($('proyecto').value) || 'presupuesto'));
    });

    function conceptoPU(uid) { return analisis.conceptos.filter(function (c) { return c.uid === +uid; })[0]; }
    // Concepto de un renglón: por su id de la base si ya está guardado (data-id), si no por el de la pantalla
    function conceptoDeFila(tr) {
        var id = parseInt(tr.dataset.id, 10) || 0;
        return (id && analisis.conceptos.filter(function (c) { return c.id === id; })[0]) || conceptoPU(tr.dataset.uid);
    }

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
    // Doble clic en un concepto del Análisis P.U. (fuera de sus campos): abre su análisis, por su id de la base
    $('puConceptos').addEventListener('dblclick', function (e) {
        if (e.target.closest('button, input, select')) return;
        var tr = e.target.closest('tr[data-uid]');
        if (tr) abrirAnalisis(conceptoDeFila(tr));
    });

    // Plantilla de presupuesto: agrega sus conceptos con la matriz y los precios vigentes del catálogo
    function agregarPlantilla(sel, partida) {
        var pl = (window.ACRI_PLANTILLAS_PU || [])[sel.value];
        sel.value = '';
        if (!pl || soloLectura) return;
        var porCodigo = {};
        CONCEPTOS_PU.forEach(function (c) { porCodigo[clave(c.codigo)] = c; });
        var faltan = [], sinPrecio = [];
        pl.conceptos.forEach(function (x) {
            var c = porCodigo[clave(x.codigo)];
            if (!c) { faltan.push(x.codigo); return; }
            if (c.faltan.length) sinPrecio.push(c.codigo);
        });
        if (!confirm('Agregar los ' + (pl.conceptos.length - faltan.length) + ' conceptos de la plantilla «' + pl.nombre + '» con los precios vigentes del catálogo?' +
                     (faltan.length ? '\n\nNo se agregan (dados de baja o sin matriz): ' + faltan.join(', ') + '.' : '') +
                     (sinPrecio.length ? '\n\nCon insumos sin precio: ' + sinPrecio.join(', ') + '.' : ''))) return;
        pl.conceptos.forEach(function (x) {
            var c = porCodigo[clave(x.codigo)];
            if (!c) return;
            analisis.conceptos.push(nuevoConcepto({ descripcion: c.descripcion, unidad: c.unidad, partida: x.partida || partida || c.partida || '',
                                                    cantidad: x.cantidad, especificacion: c.especificacion || '', insumos: c.insumos }));
        });
        marcarCambio();
        calcularTotales();
        render();
    }
    if ($('puPlantilla')) $('puPlantilla').addEventListener('change', function () { agregarPlantilla(this, ''); });

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
        if (b.dataset.puAccion === 'analizar-importe') { analizarImporte(b.dataset.sec, b.dataset.id); return; }
        var c = conceptoPU(b.closest('tr').dataset.uid), acc = b.dataset.puAccion;
        if (acc === 'analizar') { abrirAnalisis(c); return; }
        if (soloLectura) { avisoSoloLectura(); return; }
        if (acc === 'duplicar') {
            var copia = nuevoConcepto({ partida: c.partida, descripcion: c.descripcion + ' (copia)', unidad: c.unidad, cantidad: c.cantidad, venta: c.venta, insumos: c.insumos });
            analisis.conceptos.splice(analisis.conceptos.indexOf(c) + 1, 0, copia);
        } else if (acc === 'quitar') {
            if (!confirm('¿Quitar el concepto «' + (c.descripcion || c.clave) + '» con su análisis?')) return;
            analisis.conceptos.splice(analisis.conceptos.indexOf(c), 1);
        }
        marcarCambio();
        calcularTotales();
        renderPu();
    });

    // Un renglón capturado por importe en MP / MO pasa a concepto analizado con lo que ya tiene: sus artículos
    // importados (si cuadran con el importe) o un solo insumo por el importe. Sale de su sección y su costo
    // entra por el renglón fijo del análisis, así no se cuenta dos veces.
    function analizarImporte(sec, id) {
        if (soloLectura) { avisoSoloLectura(); return; }
        var x = catalogoPU(calcularPU()).filter(function (o) { return o.otro && o.sec === sec && String(o.fila.id) === String(id); })[0];
        if (!x || x.fila.calc) return;
        var f = x.fila, base = num(f.presupuesto), cantidad = x.cantidad > 0 ? x.cantidad : 1, tipo = sec === 'mo' ? 'MO' : 'MAT';
        if (!confirm('«' + f.concepto + '» pasará al Análisis de Precios Unitarios con lo que ya tiene capturado y saldrá de ' + NOMBRES[sec] +
                     '; sus insumos quedarán como renglones calculados de ' + NOMBRES[sec] + '.' +
                     (tipo === 'MO' && factorFsr() !== 1 ? '\n\nOjo: como mano de obra analizada se le aplica el FSR (× ' + cant(factorFsr()) + ').' : '') +
                     '\n\n¿Continuar?')) return;
        var arts = f.articulos || [], sumaArt = 0;
        arts.forEach(function (a) { sumaArt += num(a.precio_total); });
        var insumos = arts.length && Math.abs(sumaArt - base) < 0.5 && arts.every(function (a) { return num(a.unidades) > 0; })
            ? arts.map(function (a) {
                return limpiarInsumo({ tipo: tipo, descripcion: txt(a.nom_articulo) || txt(a.clave_articulo), unidad: txt(a.unid_medida),
                                       cantidad: num(a.unidades) / cantidad, costo: num(a.precio_total) / num(a.unidades) });
            })
            : [limpiarInsumo({ tipo: tipo, descripcion: f.concepto, unidad: x.unidad, cantidad: 1, costo: base / cantidad })];
        var c = nuevoConcepto({ descripcion: f.concepto, unidad: x.unidad, cantidad: cantidad, partida: x.partida, insumos: insumos });
        analisis.conceptos.push(c);
        datos[sec].splice(datos[sec].indexOf(f), 1);
        huboAnalisis = true;
        marcarCambio();
        calcularTotales();
        renderPu();
        abrirAnalisis(c);
    }

    // ----- Matrices de todos los conceptos con Excel (botones de la ventana de análisis) -----
    // Un renglón por insumo con el código y el concepto; un concepto sin matriz sale en un renglón para llenarlo
    var COLUMNAS_MATRIZ = [
        ['codigo', /^(c[oó]digo|clave|cve)\s+(del\s+)?insumo/i],
        ['clave', /^(c[oó]digo|clave|cve)(?!.*insumo)/i],
        ['concepto', /^concepto/i],
        ['tipo', /^tipo/i],
        ['insumo', /^(insumo|descripci[oó]n)/i],
        ['unidad', /^(unidad|u\.?m\.?$|um$)/i],
        ['cantidad', /^(cantidad|cant)/i],
        ['rinde', /^rinde/i],
        ['costo', /^(costo|precio|p\.?\s*unit)/i]
    ];
    function exportarMatrices() {
        var filas = [['Código', 'Concepto', 'Código insumo', 'Tipo', 'Insumo', 'Unidad', 'Cantidad', 'Rinde por jornada', 'Costo unitario', 'Importe']
            .map(function (t) { return { v: t, e: 'titulo' }; })];
        analisis.conceptos.forEach(function (c) {
            var concepto = { v: c.descripcion, e: 'texto' };
            if (!c.insumos.length) { filas.push([c.clave, concepto]); return; }
            var imps = importesInsumos(c);
            c.insumos.forEach(function (i, n) {
                filas.push([c.clave, concepto, i.codigo, TIPOS_INSUMO[i.tipo], { v: i.descripcion, e: 'texto' }, i.unidad, { v: num(i.cantidad), e: 'cantidad' },
                            i.tipo === 'MO' && i.rinde > 0 ? { v: i.rinde, e: 'cantidad' } : null, { v: num(i.costo), e: 'dinero' },
                            { v: redondear(imps[n].importe), e: 'dinero' }]);
            });
        });
        if (filas.length < 2) { alert('El catálogo está vacío: no hay matrices que exportar.'); return; }
        XlsxSimple.descargar(XlsxSimple.crear({ nombre: 'Matrices', anchos: [10, 45, 16, 18, 40, 9, 11, 11, 14, 14], fijarFila: 1, filas: filas }),
                             'Matrices ' + (txt($('proyecto').value) || 'presupuesto'));
    }
    function tipoInsumo(t) {
        t = clave(t);
        // También el Tipo de Neodata: 1 material, 2 mano de obra, 3 equipo / herramienta (%)
        return /^(MO|MANO|2$)/.test(t) ? 'MO' : /^MAQ/.test(t) ? 'MAQ' : /^HER/.test(t) ? 'HER' : /^(OTRO|FLETE|SERV)/.test(t) ? 'OTRO'
             : /^(EQ|3$)/.test(t) ? 'EQ' : 'MAT';
    }
    function importarMatrices(celdas) {
        var col = null, inicio = 0;
        for (var n = 0; n < Math.min(celdas.length, 10) && !col; n++) {
            var c = {};
            celdas[n].forEach(function (t, k) {
                COLUMNAS_MATRIZ.forEach(function (p) { if (c[p[0]] === undefined && p[1].test(txt(t))) c[p[0]] = k; });
            });
            if (c.insumo !== undefined && (c.cantidad !== undefined || c.costo !== undefined || c.clave !== undefined || c.concepto !== undefined)) { col = c; inicio = n + 1; }
        }
        if (!col) return;
        // Sin columna Concepto es la matriz de UN concepto (como la de Neodata: Renglón, Código, Descripción completa, Tipo…):
        // su Código es el del insumo y va al concepto abierto en la ventana
        var suelta = col.concepto === undefined;
        if (suelta) { if (col.codigo === undefined) col.codigo = col.clave; delete col.clave; }
        var v = function (f, campo) { return col[campo] === undefined ? '' : f[col[campo]]; };
        // El código y el concepto se repiten en cada insumo; si vienen vacíos se toma el del renglón de arriba
        var matrices = [], porLlave = {}, ultClave = '', ultConcepto = '';
        celdas.slice(inicio).forEach(function (f) {
            var cve = txt(v(f, 'clave')), con = txt(v(f, 'concepto'));
            if (cve || con) { ultClave = cve; ultConcepto = con; }
            var llave = clave(ultClave) + '|' + clave(ultConcepto);
            if (!porLlave[llave]) { porLlave[llave] = { clave: ultClave, concepto: ultConcepto, insumos: [] }; matrices.push(porLlave[llave]); }
            // Se sube tal cual, sin revisar (para ir juntando datos): basta con que el renglón traiga algo del insumo
            var ins = { tipo: tipoInsumo(v(f, 'tipo')), codigo: txt(v(f, 'codigo')), descripcion: txt(v(f, 'insumo')), unidad: txt(v(f, 'unidad')),
                        cantidad: numeroCelda(v(f, 'cantidad')), rinde: numeroCelda(v(f, 'rinde')), costo: numeroCelda(v(f, 'costo')) };
            if (!ins.codigo && !ins.descripcion && !ins.unidad && !ins.cantidad && !ins.costo) return;
            porLlave[llave].insumos.push(limpiarInsumo(ins));
        });
        var aplicar = [], sinConcepto = [];
        matrices.forEach(function (m) {
            if (!m.insumos.length) return;
            var c = !suelta && (analisis.conceptos.filter(function (x) { return m.clave && clave(x.clave) === clave(m.clave); })[0] ||
                    analisis.conceptos.filter(function (x) { return m.concepto && clave(x.descripcion) === clave(m.concepto); })[0]);
            if (c) aplicar.push({ c: c, insumos: m.insumos }); else sinConcepto = sinConcepto.concat(m.insumos);
        });
        // Lo que no es de ningún concepto del catálogo (o una matriz suelta) va al concepto abierto
        if (sinConcepto.length && editandoPU && !aplicar.some(function (x) { return x.c === editandoPU; })) aplicar.push({ c: editandoPU, insumos: sinConcepto });
        aplicar.forEach(function (x) { x.c.insumos = x.insumos; });
        // Sin avisos: si el archivo no trae insumos simplemente no cambia nada
        if (!aplicar.length) return;
        // Matrices de precios fijos sin importes capturados a mano en MP / MO (como al traer un presupuesto de Neodata):
        // la matriz es el costo y sus insumos van a Materia Prima y Mano de Obra
        if (!analisis.matrizCosto && aplicar.some(function (x) { return esVenta(x.c); }) &&
            !['mp', 'mo'].some(function (s) { return datos[s].some(function (r) { return !r.calc && num(r.presupuesto) > 0; }); })) {
            analisis.matrizCosto = $('puMatrizCosto').checked = true;
        }
        marcarCambio();
        calcularTotales();
        render();
        if (editandoPU) renderDialogo();
    }
    $('puDExportar').addEventListener('click', exportarMatrices);
    $('puDImportar').addEventListener('click', function () {
        if (soloLectura) { avisoSoloLectura(); return; }
        $('puDArchivo').value = '';
        $('puDArchivo').click();
    });
    $('puDArchivo').addEventListener('change', function () {
        var f = this.files[0];
        if (!f) return;
        if (/\.xlsx$/i.test(f.name)) {
            XlsxSimple.leer(f).then(function (filas) { importarMatrices(filas); }).catch(function (e) { alert('No se pudo leer el archivo de Excel: ' + (e && e.message || e)); });
        } else if (/\.xls$/i.test(f.name)) {
            alert('Ese archivo es de Excel antiguo (.xls): en Excel guárdalo como .xlsx.');
        } else {
            var lector = new FileReader();
            lector.onload = function () { importarMatrices(separarCeldas(lector.result)); };
            lector.readAsText(f, 'UTF-8');
        }
    });

    // ----- Ventana de análisis de un concepto -----
    // Ruta dentro de la matriz: los insumos compuestos abiertos (vacía = la matriz del concepto)
    var rutaPU = [];
    function listaPU() { return rutaPU.length ? rutaPU[rutaPU.length - 1].componentes : editandoPU.insumos; }
    function abrirAnalisis(c) {
        editandoPU = c;
        rutaPU = [];
        var dis = soloLectura;
        $('puDConcepto').value = c.descripcion;
        $('puDUnidad').value = c.unidad;
        $('puDCantidad').value = c.cantidad || '';
        $('puDPartida').value = c.partida;
        $('puDEspecificacion').value = c.especificacion || '';
        ['puDConcepto', 'puDUnidad', 'puDCantidad', 'puDPartida', 'puDEspecificacion'].forEach(function (id) { $(id).disabled = dis; });
        $('puDialogo').querySelectorAll('[data-pu-insumo]').forEach(function (b) { b.disabled = dis; });
        $('puDImportar').disabled = dis;
        $('puDNota').textContent = 'Los cambios se aplican al momento.';
        renderDialogo();
        $('puDialogo').showModal();
        if (!dis && !c.insumos.length) $('puDialogo').querySelector('[data-pu-insumo="MAT"]').focus();
    }

    function renderDialogo() {
        var c = editandoPU, dis = soloLectura ? ' disabled' : '', u = txt(c.unidad) || 'unidad';
        $('puDAyuda').innerHTML = 'Anota lo que lleva <b>1 ' + escapar(u) + '</b> de «' + escapar(c.descripcion || 'este concepto') + '». ' +
            'Ejemplo para 1 m² de cancel: 1.05 m² de vidrio (con desperdicio), 3.2 m de perfil, y la mano de obra con lo que hace un instalador en una jornada (8 m² → escribe 8 en «Rinde por jornada»).' +
            (!esVenta(c) ? '' : alCosto(c)
                ? '<br><b>Precio fijo para el cliente:</b> esta matriz no cambia el P. Unitario; es el costo: sus insumos van a Materia Prima y Mano de Obra. ' +
                  '<button type="button" class="ct-btn" data-matriz-costo="0"' + dis + '>Dejar las matrices como informativas</button>'
                : '<br><b>Precio fijo para el cliente:</b> esta matriz es informativa; no cambia el P. Unitario ni suma al costo, que ya viene de Materia Prima, Mano de Obra y Gastos de Operacion. ' +
                  '<button type="button" class="ct-btn" data-matriz-costo="1"' + dis + '>Pasar los insumos a Materia Prima y Mano de Obra</button>');
        var padre = rutaPU[rutaPU.length - 1], lista = listaPU(), uPadre = padre ? txt(padre.unidad) || 'unidad' : u;
        // Matriz dentro de matriz: la ruta (Concepto › Cuadrilla › …) y lo que lleva 1 unidad del compuesto
        $('puDRuta').hidden = !padre;
        $('puDRuta').innerHTML = padre ? '<button type="button" class="ct-btn" data-ruta="0">' + escapar(c.descripcion || 'Concepto') + '</button>' +
            rutaPU.map(function (x, k) {
                return ' › ' + (k < rutaPU.length - 1 ? '<button type="button" class="ct-btn" data-ruta="' + (k + 1) + '">' + escapar(x.descripcion || 'Compuesto') + '</button>'
                                                    : '<b>' + escapar(x.descripcion || 'Compuesto') + '</b>');
            }).join('') + '<span>Componentes de <b>1 ' + escapar(uPadre) + '</b>: su costo es la suma de lo que lleva (cada mano de obra con su FSR). ' +
            'Ej. 1 jornal de cuadrilla = 1 aluminero + 1 ayudante.</span>' : '';
        $('puDColCant').textContent = 'Cantidad por ' + uPadre;
        $('puDInsumos').innerHTML = lista.length ? lista.map(function (i, n) {
            var mo = i.tipo === 'MO', modo = modoCalculo(i), rend = modo === 'rendimiento', pctMo = modo === 'pct_mo';
            var comp = CALC.componentes(i).length;
            function numero(campo, valor, paso, extra) {
                return '<input type="number" class="num" data-ins="' + campo + '" step="' + paso + '" min="0" value="' + valor + '"' + (extra || '') + dis + '>';
            }
            // Columnas como la matriz de Neodata, más cómo se calcula la cantidad (cantidad directa, rendimiento, costo fijo
            // por concepto o % de la mano de obra), factor, merma, cantidad resultante, % del costo directo, proveedor y fecha
            return '<tr data-n="' + n + '">' +
                '<td class="ro">' + (n + 1) + '</td>' +
                '<td><input type="text" data-ins="codigo" maxlength="30" value="' + escapar(i.codigo) + '" placeholder="Clave"' + dis + '></td>' +
                '<td><input type="text" data-ins="descripcion" list="puSug' + grupoSugerencia(i.tipo) + '" maxlength="200" value="' + escapar(i.descripcion) + '" placeholder="' +
                    escapar(EJEMPLOS_INSUMO[i.tipo]) + '"' + dis + '></td>' +
                '<td><select data-ins="tipo"' + dis + '>' + Object.keys(TIPOS_INSUMO).map(function (t) {
                    return '<option value="' + t + '"' + (t === i.tipo ? ' selected' : '') + '>' + TIPOS_INSUMO[t] + '</option>';
                }).join('') + '</select></td>' +
                '<td><input type="text" data-ins="unidad" list="puUnidades" maxlength="20" value="' + escapar(pctMo ? '%' : i.unidad) + '"' + (pctMo ? ' readonly' : '') + dis + '></td>' +
                '<td><select data-ins="modo" title="Cómo se calcula la cantidad"' + dis + '>' + Object.keys(CALCULOS_INSUMO).map(function (m) {
                    // Dentro de un compuesto todo es por unidad del compuesto
                    if (padre && (m === 'fijo' || m === 'pct_mo')) return '';
                    return '<option value="' + m + '"' + (m === modo ? ' selected' : '') + '>' + CALCULOS_INSUMO[m] + '</option>';
                }).join('') + '</select></td>' +
                '<td>' + (pctMo ? '<span class="pu-na">—</span>' : comp ? '<input type="number" class="num" data-ins-calc="costo-comp" readonly title="Suma de sus componentes">'
                    : numero('costo', i.costo || '', '0.01', mo ? ' title="Mano de obra: salario base por jornada (se le aplica el FSR)"' : '')) + '</td>' +
                '<td>' + numero('cantidad', rend ? (i.rinde > 0 ? Math.round(1 / i.rinde * 10000) / 10000 : '') : (i.cantidad || ''), '0.0001',
                    rend ? ' readonly title="Se calcula con el rendimiento"' : pctMo ? ' title="% sobre la mano de obra de este concepto (ej. 3)"'
                         : modo === 'fijo' ? ' title="Cantidad para todo el concepto: se reparte entre su cantidad"' : '') + '</td>' +
                '<td>' + (rend ? numero('rinde', i.rinde || '', '0.01', ' placeholder="' + escapar(u) + ' por ' + escapar(txt(i.unidad) || 'unidad') + '"')
                               : '<span class="pu-na">—</span>') + '</td>' +
                '<td>' + (pctMo ? '<span class="pu-na">—</span>' : numero('factor', i.factor != null ? i.factor : '', '0.0001', ' placeholder="1"')) + '</td>' +
                '<td>' + (pctMo ? '<span class="pu-na">—</span>' : numero('merma_pct', i.merma_pct != null ? i.merma_pct : '', '0.01', ' placeholder="0"')) + '</td>' +
                '<td class="ro" data-ins-calc="cantidad"></td>' +
                '<td class="ro" data-ins-calc="importe"></td>' +
                '<td class="ro" data-ins-calc="pct"></td>' +
                '<td><input type="text" data-ins="proveedor" maxlength="150" value="' + escapar(i.proveedor) + '"' + dis + '></td>' +
                '<td><input type="date" data-ins="fecha_costo" value="' + escapar(i.fecha_costo) + '"' + dis + '></td>' +
                '<td class="pu-c-acc">' + (pctMo ? '' : '<button type="button" class="pu-mini' + (comp ? ' activo' : '') + '" data-ins-comp title="Componentes: arma este insumo con lo que lleva (matriz dentro de matriz), p. ej. la cuadrilla = 1 aluminero + 1 ayudante">⊞' + (comp ? ' ' + comp : '') + '</button>') +
                    '<button type="button" class="borrar" title="Quitar"' + dis + '>✕</button></td></tr>' +
                (mo && !pctMo && !comp ? detalleManoObra(i, n, dis) : '');
        }).join('') : '<tr class="vacio-fila"><td colspan="17">' + (padre ? 'Agrega sus componentes con los botones de arriba (p. ej. + Mano de obra: aluminero y ayudante).'
                                                                           : 'Agrega lo que lleva con los botones de arriba: Material, Mano de obra, Equipo u Otro.') + '</td></tr>';
        pintarDialogo();
    }

    function pintarDialogo() {
        var c = editandoPU, fijo = esVenta(c), u = costoUnitario(c, true), r = calcularPU(), unidad = escapar(txt(c.unidad) || 'unidad');
        // En un compuesto: sus componentes por 1 unidad de él; el % es sobre su costo
        var padre = rutaPU[rutaPU.length - 1], lista = listaPU();
        var imps = padre ? CALC.desgloseCompuesto(padre, factorFsr()) : importesInsumos(c);
        var base = padre ? CALC.costoReal(padre, factorFsr()) : u.cd;
        $('puDInsumos').querySelectorAll('tr.pu-mo-det').forEach(function (tr) {
            var i = lista[tr.dataset.n], d = imps[tr.dataset.n];
            tr.querySelector('[data-ins-calc="base-fsr"]').textContent = fmt(num(i.costo) * d.fsr);
            tr.querySelector('[data-ins-calc="real"]').textContent = fmt(d.costo);
            if (i.fasar_id || !(num(i.fsr) > 0)) tr.querySelector('[data-ins="fsr"]').value = d.fsr;
        });
        $('puDInsumos').querySelectorAll('tr[data-n]:not(.pu-mo-det)').forEach(function (tr) {
            var i = lista[tr.dataset.n], d = imps[tr.dataset.n], modo = modoCalculo(i);
            tr.querySelector('[data-ins-calc="cantidad"]').textContent = modo === 'pct_mo' ? cant(d.cantidad) + ' %' : cant(Math.round(d.cantidad * 10000) / 10000);
            tr.querySelector('[data-ins-calc="importe"]').textContent = fmt(d.importe);
            tr.querySelector('[data-ins-calc="pct"]').textContent = base > 0 ? pct(d.importe / base * 100) : '';
            var cc = tr.querySelector('[data-ins-calc="costo-comp"]');
            if (cc) cc.value = Math.round(d.costo * 100) / 100;
            if (modo === 'rendimiento') tr.querySelector('[data-ins="cantidad"]').value = i.rinde > 0 ? Math.round(1 / i.rinde * 10000) / 10000 : '';
        });
        var falta = revisionConcepto(c), res = CALC.resumen(u), p = CALC.precioConcepto(u.cd, r);
        function fila(nombre, valor, clase) {
            return '<tr' + (clase ? ' class="' + clase + '"' : '') + '><td class="ro izq">' + nombre + '</td><td class="ro">' + valor + '</td></tr>';
        }
        // Resumen del análisis como Neodata: costo directo por tipo de insumo y la integración del precio unitario
        var costo = fila('Materiales', fmt(res.materiales)) +
            fila('Mano de obra' + (factorFsr() !== 1 ? ' (× FSR ' + cant(factorFsr()) + ')' : ''), fmt(res.mano_obra)) +
            fila('Maquinaria / equipo', fmt(res.maquinaria_equipo)) +
            fila('Gastos de operación' + (u.hm ? ' (incluye herramienta menor ' + fmt(u.hm) + ')' : ''), fmt(res.gastos_operacion)) +
            fila('Otros (fletes, servicios)', fmt(res.otros)) +
            fila('Costo directo por ' + unidad, fmt(res.costo_directo), 'pu-total');
        var precio = fijo
            ? fila('Precio fijo para el cliente', '$' + fmt(c.venta), 'pu-total') +
              fila('Cantidad', cant(c.cantidad) + ' ' + unidad) +
              fila('Importe', '$' + fmt(c.venta * c.cantidad), 'pu-total')
            : fila('Indirectos', fmt(p.ind)) +
              fila('Financiamiento', fmt(p.fin)) +
              fila('Utilidad', fmt(p.util)) +
              fila('Cargos adicionales', fmt(p.cargos)) +
              fila('Precio unitario por ' + unidad + ' <small>(factor ' + cant(Math.round(r.factor * 10000) / 10000) + ')</small>', '$' + fmt(p.pu), 'pu-total') +
              fila('Cantidad', cant(c.cantidad) + ' ' + unidad) +
              fila('Importe', '$' + fmt(p.pu * c.cantidad), 'pu-total');
        $('puDTotales').innerHTML = '<table class="grid mini-grid pu-dlg-resumen"><tbody>' + costo + '</tbody></table>' +
            '<table class="grid mini-grid pu-dlg-resumen"><tbody>' + precio + '</tbody></table>' +
            (falta ? '<span class="pu-falta">⚠ ' + falta + '</span>' : '');
    }

    var CALCULOS_INSUMO = { cantidad: 'Cantidad', rendimiento: 'Rendimiento', fijo: 'Fijo por concepto', pct_mo: '% de la M.O.' };
    var EJEMPLOS_INSUMO = { MAT: 'ej. Vidrio claro 6 mm', MO: 'ej. Cuadrilla: 1 aluminero + 1 ayudante', EQ: 'ej. Andamio, equipo de seguridad',
                            MAQ: 'ej. Grúa, plataforma', HER: 'ej. Herramienta menor', OTRO: 'ej. Flete local' };
    // Cómo se calcula la cantidad del insumo (sin capturarlo: mano de obra con rinde = rendimiento, lo demás cantidad)
    function modoCalculo(i) { var x = CALC.insumo(i); return x.base === 'unidad' ? x.tipo_calculo : x.base; }

    // FSR de una mano de obra: 'f<id>' de un FASAR del catálogo, 'manual' capturado, '' el del presupuesto
    function eleccionFsr(i) { return i.fasar_id ? 'f' + i.fasar_id : num(i.fsr) > 0 ? 'manual' : ''; }
    function opcionesFasar(actual, delPresupuesto) {
        var hay = false, html = (delPresupuesto ? '<option value="">' + escapar(delPresupuesto) + '</option>' : '') +
            FASAR.map(function (f) {
                var v = 'f' + f.fasar_id;
                if (v === actual) hay = true;
                return '<option value="' + v + '"' + (v === actual ? ' selected' : '') + '>' + escapar(f.nombre) + ' (× ' + cant(f.fsr) + ')</option>';
            }).join('');
        // Un FASAR que ya no está activo se conserva con el FSR guardado
        if (/^f/.test(actual) && !hay) html += '<option value="' + actual + '" selected>FASAR ' + actual.slice(1) + ' (ya no está activo)</option>';
        return html;
    }
    function nombreFasar(i) {
        var f = i.fasar_id && fasarPorId(i.fasar_id);
        if (i.fasar_id) return f ? f.nombre : 'FASAR ' + i.fasar_id;
        if (num(i.fsr) > 0) return 'Capturado';
        f = analisis.fasarId && fasarPorId(analisis.fasarId);
        return f ? f.nombre + ' (del presupuesto)' : 'Del presupuesto';
    }
    // Debajo de cada mano de obra: su FASAR, salario real y viáticos, alimentación y hospedaje por jornada
    function detalleManoObra(i, n, dis) {
        var el = eleccionFsr(i), x = CALC.insumo(i);
        function dinero(campo, titulo) {
            return '<label title="' + titulo + '">' + titulo.split(' ')[0] + ' <input type="number" class="num" data-ins="' + campo + '" step="0.01" min="0" value="' +
                (x[campo] || '') + '" placeholder="0"' + dis + '></label>';
        }
        return '<tr class="pu-mo-det" data-n="' + n + '"><td></td><td colspan="16"><div class="pu-mo-campos">' +
            '<label>FSR <select data-ins="fasar"' + dis + '>' + opcionesFasar(el, 'Del presupuesto (× ' + cant(factorFsr()) + ')') +
                '<option value="manual"' + (el === 'manual' ? ' selected' : '') + '>Otro FSR (capturado)</option></select></label>' +
            '<label>× <input type="number" class="num" data-ins="fsr" step="0.0001" min="0" value="' + CALC.fsrInsumo(i, factorFsr()) + '"' +
                (el === 'manual' ? '' : ' readonly title="Sale del FASAR"') + dis + '></label>' +
            '<span>Salario base × FSR <b data-ins-calc="base-fsr"></b></span>' +
            dinero('viaticos', 'Viáticos por jornada') + dinero('alimentacion', 'Alimentación por jornada') + dinero('hospedaje', 'Hospedaje por jornada') +
            '<span>= Salario real <b data-ins-calc="real"></b> por jornada</span></div></td></tr>';
    }

    // Mano de obra de todos los análisis, junta por trabajador o cuadrilla con el mismo salario, FSR y viáticos:
    // jornadas (cantidad total en la obra) e importe. La usan la pestaña Mano de Obra y la ventana FASAR.
    function manoObraAnalisis() {
        var grupos = {}, lista = [];
        analisis.conceptos.forEach(function (c) {
            if (!alCosto(c)) return;
            var imps = importesInsumos(c);
            c.insumos.forEach(function (i, n) {
                if (i.tipo !== 'MO' || i.base === 'pct_mo') return;
                // Una cuadrilla compuesta: su salario base y su FSR salen de sus componentes
                var d = imps[n], x = CALC.insumo(i), extras = d.compuesto ? 0 : x.viaticos + x.alimentacion + x.hospedaje;
                var fasar = d.compuesto ? 'Según sus componentes' : nombreFasar(i);
                var k = [clave(i.codigo), clave(i.descripcion), clave(i.unidad), d.base, d.fsr, extras, fasar].join('|');
                var g = grupos[k];
                if (!g) {
                    g = grupos[k] = { codigo: i.codigo, descripcion: txt(i.descripcion) || '(sin descripción)', unidad: i.unidad, base: d.base, fsr: d.fsr,
                                      fasar: fasar, extras: extras, real: d.costo, jornadas: 0, importe: 0, conceptos: [], fecha: i.fecha_costo || '' };
                    lista.push(g);
                }
                g.jornadas += d.cantidad * c.cantidad;
                g.importe += d.importe * c.cantidad;
                if (g.conceptos.indexOf(c) < 0) g.conceptos.push(c);
            });
        });
        return lista;
    }
    function htmlManoObra(lista, vacio) {
        if (!lista.length) return '<tr class="vacio-fila"><td colspan="11">' + vacio + '</td></tr>';
        var total = 0;
        return lista.map(function (g, n) {
            total += g.importe;
            return '<tr data-mo="' + n + '" title="Doble clic: abrir el análisis de ' + escapar(g.conceptos.map(function (c) { return c.descripcion || c.clave; }).join(', ')) + '">' +
                '<td class="id">' + escapar(g.codigo) + '</td><td class="ro izq">' + escapar(g.descripcion) + '</td><td class="ro izq">' + escapar(g.unidad) + '</td>' +
                '<td class="ro">' + fmt(g.base) + '</td><td class="ro izq">' + escapar(g.fasar) + '</td><td class="ro">' + cant(g.fsr) + '</td>' +
                '<td class="ro">' + fmt(g.real) + '</td><td class="ro">' + (g.extras ? fmt(g.extras) : '') + '</td>' +
                '<td class="ro">' + cant(Math.round(g.jornadas * 10000) / 10000) + '</td><td class="ro">' + fmt(g.importe) + '</td>' +
                '<td class="ro">' + g.conceptos.length + '</td></tr>';
        }).join('') + '<tr class="pu-total"><td colspan="9" class="ro">Total de la mano de obra analizada</td><td class="ro">' + fmt(total) + '</td><td></td></tr>';
    }
    var manoObraLista = [];
    function pintarManoObraPU() {
        manoObraLista = manoObraAnalisis();
        $('tbManoObraPU').innerHTML = htmlManoObra(manoObraLista, 'Aquí aparece la mano de obra en cuanto la agregues al análisis de un concepto (Análisis P.U. o doble clic en el Catálogo).');
    }
    ['tbManoObraPU', 'fsManoObra'].forEach(function (id) {
        $(id).addEventListener('dblclick', function (e) {
            var tr = e.target.closest('tr[data-mo]');
            if (!tr) return;
            if ($('fsDialogo').open) $('fsDialogo').close();
            abrirAnalisis(manoObraLista[tr.dataset.mo].conceptos[0]);
        });
    });

    // ---------- FASAR (botón de la barra): el FSR del presupuesto y la mano de obra de los análisis ----------
    function abrirFasar() {
        pintarFasar();
        $('fsDialogo').showModal();
    }
    function pintarFasar() {
        var f = analisis.fasarId && fasarPorId(analisis.fasarId);
        $('fsElegir').innerHTML = '<option value="">FSR capturado a mano</option>' + opcionesFasar(analisis.fasarId ? 'f' + analisis.fasarId : '', '');
        $('fsElegir').disabled = soloLectura;
        $('fsFsr').value = factorFsr();
        $('fsFsr').readOnly = !!analisis.fasarId;
        $('fsFsr').disabled = soloLectura;
        $('fsTodos').disabled = soloLectura;
        $('fsNota').textContent = FASAR.length ? '' : 'Aún no hay FASAR en el catálogo: captúralos en Parámetros de costos.';
        var filas = [];
        function fila(clase, nombre, valor) { filas.push('<tr' + (clase ? ' class="' + clase + '"' : '') + '><td class="ro izq">' + nombre + '</td><td class="ro">' + valor + '</td></tr>'); }
        if (f) {
            // Fsr = Ps × (Tp / Tl) + Tp / Tl (Reglamento de la LOPSRM; includes/pu.php puFsr)
            fila('', 'Días calendario', cant(f.dias_calendario));
            f.dias_pagados.forEach(function (d) { fila('', '+ ' + escapar(d.concepto) + ' (días pagados)', cant(num(d.dias))); });
            fila('pu-total', 'Tp = días pagados', cant(f.tp));
            fila('', 'Días calendario', cant(f.dias_calendario));
            f.dias_no_laborados.forEach(function (d) { fila('', '− ' + escapar(d.concepto) + ' (no laborados)', cant(num(d.dias))); });
            fila('pu-total', 'Tl = días laborados', cant(f.tl));
            f.obligaciones.forEach(function (o) { fila('', escapar(o.concepto), pct(num(o.pct))); });
            fila('pu-total', 'Ps = obligaciones obrero-patronales', cant(f.ps));
            fila('pu-total', 'FSR = Ps × (Tp / Tl) + Tp / Tl', cant(f.fsr));
        } else {
            fila('', 'El FSR del presupuesto está capturado a mano.<br>Elige un FASAR del catálogo para ver su desglose: días pagados (aguinaldo, prima vacacional…), no laborados (domingos, festivos, vacaciones…) y obligaciones (IMSS, INFONAVIT…).', '');
        }
        $('fsDesglose').innerHTML = filas.join('');
        manoObraLista = manoObraAnalisis();
        $('fsManoObra').innerHTML = htmlManoObra(manoObraLista, 'Ningún concepto analizado lleva mano de obra todavía.');
    }
    function cambioFasar() {
        $('puFsr').value = analisis.fsr;
        marcarCambio();
        calcularTotales();
        pintarFasar();
        render();
    }
    $('fsElegir').addEventListener('change', function () {
        var f = this.value && fasarPorId(this.value.slice(1));
        analisis.fasarId = f ? f.fasar_id : 0;
        if (f) analisis.fsr = f.fsr;
        cambioFasar();
    });
    $('fsFsr').addEventListener('change', function () {
        if (analisis.fasarId) return;
        analisis.fsr = num(this.value) > 0 ? num(this.value) : 1;
        cambioFasar();
    });
    $('fsTodos').addEventListener('click', function () {
        if (!confirm('¿Que toda la mano de obra de los análisis tome el FSR del presupuesto (× ' + cant(factorFsr()) + ')? Se quitan los FASAR y FSR propios de cada una.')) return;
        analisis.conceptos.forEach(function (c) { c.insumos.forEach(function (i) { if (i.tipo === 'MO') { delete i.fsr; delete i.fasar_id; } }); });
        cambioFasar();
    });
    document.querySelectorAll('[data-fs-cerrar]').forEach(function (b) { b.addEventListener('click', function () { $('fsDialogo').close(); }); });
    $('moFasar').addEventListener('click', abrirFasar);

    function cambioDialogo(repintar) {
        marcarCambio();
        calcularTotales();
        if (repintar) renderDialogo(); else pintarDialogo();
    }

    [['puDConcepto', 'descripcion'], ['puDUnidad', 'unidad'], ['puDCantidad', 'cantidad'], ['puDPartida', 'partida'], ['puDEspecificacion', 'especificacion']].forEach(function (p) {
        $(p[0]).addEventListener('input', function () {
            editandoPU[p[1]] = p[1] === 'cantidad' ? Math.max(0, num(this.value)) : this.value;
            cambioDialogo(p[1] === 'unidad');
            if (p[1] === 'unidad') $(p[0]).focus();
        });
    });
    $('puDConcepto').addEventListener('change', function () {
        if (!ofrecerBiblioteca(editandoPU)) return;
        construirSugerencias();
        cambioDialogo(true);
        $('puDUnidad').value = editandoPU.unidad;
        $('puDPartida').value = editandoPU.partida;
        $('puDEspecificacion').value = editandoPU.especificacion || '';
    });

    $('puDialogo').querySelectorAll('[data-pu-insumo]').forEach(function (b) {
        b.addEventListener('click', function () {
            var tipo = b.dataset.puInsumo;
            listaPU().push(limpiarInsumo({ tipo: tipo, unidad: tipo === 'MO' ? 'jornal' : '' }));
            cambioDialogo(true);
            var f = $('puDInsumos').querySelector('tr:last-child [data-ins="descripcion"]');
            if (f) f.focus();
        });
    });
    $('puDInsumos').addEventListener('input', function (e) {
        var campo = e.target.dataset.ins, tr = e.target.closest('tr[data-n]');
        if (!campo || !tr) return;
        var i = listaPU()[tr.dataset.n];
        if (campo === 'fasar') {
            // FSR de esta mano de obra: el del presupuesto, el de un FASAR del catálogo o uno capturado
            var f = e.target.value;
            if (f === 'manual') { i.fsr = CALC.fsrInsumo(i, factorFsr()); delete i.fasar_id; }
            else if (f) { var fa = fasarPorId(f.slice(1)); i.fasar_id = fa.fasar_id; i.fsr = fa.fsr; }
            else { delete i.fsr; delete i.fasar_id; }
            cambioDialogo(true);
            return;
        }
        if (campo === 'modo') {
            // Cantidad directa / rendimiento; o costo fijo por concepto / % de la mano de obra (con cantidad directa)
            var v = e.target.value;
            if (v === 'fijo' || v === 'pct_mo') { i.base = v; i.tipo_calculo = 'cantidad'; } else { delete i.base; i.tipo_calculo = v; }
            cambioDialogo(true);
            return;
        }
        if (CAMPOS_INSUMO[campo] && e.target.value.trim() === '') delete i[campo];   // vacío = su valor por omisión (factor 1, merma 0…)
        else i[campo] = ['cantidad', 'rinde', 'costo', 'factor', 'merma_pct', 'fsr', 'viaticos', 'alimentacion', 'hospedaje'].indexOf(campo) >= 0
            ? Math.max(0, num(e.target.value)) : e.target.value;
        if (campo === 'tipo') { cambioDialogo(true); return; }
        cambioDialogo(false);
    });
    // Al elegir un insumo de la lista se llenan su unidad y su costo (si aún no tienen)
    $('puDInsumos').addEventListener('change', function (e) {
        var tr = e.target.closest('tr[data-n]');
        if (!tr || e.target.dataset.ins !== 'descripcion') return;
        var i = listaPU()[tr.dataset.n], s = sugerencias[grupoSugerencia(i.tipo)][clave(i.descripcion)];
        if (!s) return;
        if (!txt(i.unidad)) i.unidad = s.unidad;
        if (!i.costo) i.costo = s.costo;
        cambioDialogo(true);
    });
    $('puDInsumos').addEventListener('click', function (e) {
        var comp = e.target.closest('[data-ins-comp]');
        if (comp) {
            // Abre los componentes del insumo (uno sin componentes empieza vacío)
            var x = listaPU()[comp.closest('tr[data-n]').dataset.n];
            if (!Array.isArray(x.componentes)) { if (soloLectura) return; x.componentes = []; }
            rutaPU.push(x);
            renderDialogo();
            return;
        }
        if (!e.target.classList.contains('borrar') || soloLectura) return;
        listaPU().splice(e.target.closest('tr[data-n]').dataset.n, 1);
        cambioDialogo(true);
    });
    // Ruta de la matriz: regresa al concepto o a un compuesto de más arriba
    $('puDRuta').addEventListener('click', function (e) {
        var b = e.target.closest('[data-ruta]');
        if (!b) return;
        rutaPU = rutaPU.slice(0, +b.dataset.ruta);
        renderDialogo();
    });
    $('puDialogo').querySelectorAll('[data-pu-cerrar]').forEach(function (b) {
        b.addEventListener('click', function () { $('puDialogo').close(); });
    });
    $('puDialogo').addEventListener('close', function () {
        editandoPU = null;
        if (seccion === 'pu') renderPu();
        if (seccion === 'cc') renderCc();
        if (seccion === 'an') renderResumenCc();
        if (seccion === 'ex') renderExplosion();
    });

    Object.keys(CAMPOS_PU).forEach(function (k) {
        $(CAMPOS_PU[k]).addEventListener('input', function () {
            var v = this.value.trim();
            analisis[k] = Math.max(0, num(v));
            if (k === 'fsr' && analisis.fsr <= 0) analisis.fsr = 1;
            if (k === 'fsr') analisis.fasarId = 0;
            marcarCambio();
            calcularTotales();
            pintarPu();
        });
    });
    function ponerMatrizCosto(si) {
        analisis.matrizCosto = $('puMatrizCosto').checked = si;
        marcarCambio();
        calcularTotales();
        render();
        if (editandoPU) renderDialogo();
    }
    $('puMatrizCosto').addEventListener('change', function () { ponerMatrizCosto(this.checked); });
    // Botón de la ventana del análisis de un precio fijo: la misma opción (vale para todos los conceptos de precio fijo)
    $('puDAyuda').addEventListener('click', function (e) {
        var b = e.target.closest('[data-matriz-costo]');
        if (!b) return;
        if (soloLectura) { avisoSoloLectura(); return; }
        ponerMatrizCosto(b.dataset.matrizCosto === '1');
    });

    // Conceptos del análisis incompletos (se avisa al guardar, no se impide)
    function conceptosIncompletosPU() {
        return analisis.conceptos.filter(function (c) { return revisionConcepto(c); });
    }

    // Formato impreso del catálogo con P.U. (y con el análisis de cada concepto en el detalle)
    // Partidas y subpartidas: la partida se escribe «Partida / Subpartida» (dos niveles); cada una lleva número (1, 1.1)
    function documentoPU(detalle) {
        var r = calcularPU(), partidas = [], porNombre = {};
        catalogoCliente(r).forEach(function (x) {
            var partes = String(x.partida || '').split('/').map(function (s) { return s.trim(); }).filter(Boolean);
            var nomP = partes[0] || 'Sin partida', nomS = partes.slice(1).join(' / ');
            var p = porNombre[nomP.toUpperCase()];
            if (!p) {
                p = porNombre[nomP.toUpperCase()] = { nombre: nomP, numero: String(partidas.length + 1), conceptos: [], subpartidas: [], porNombre: {} };
                partidas.push(p);
            }
            var destino = p;
            if (nomS) {
                destino = p.porNombre[nomS.toUpperCase()];
                if (!destino) {
                    destino = p.porNombre[nomS.toUpperCase()] = { nombre: nomS, numero: p.numero + '.' + (p.subpartidas.length + 1), conceptos: [] };
                    p.subpartidas.push(destino);
                }
            }
            var u = x.c ? costoUnitario(x.c) : null;
            destino.conceptos.push({
                clave: x.clave, descripcion: x.descripcion, unidad: x.unidad, cantidad: x.cantidad, pu: x.pu, importe: x.importe,
                cd: x.cdU, especificacion: x.c ? x.c.especificacion || '' : '',
                insumos: !detalle || (x.c && esVenta(x.c)) ? [] : x.c ? importesInsumos(x.c).map(function (d, n) {
                    var i = x.c.insumos[n];
                    return { tipo: TIPOS_INSUMO[i.tipo], descripcion: i.descripcion, unidad: i.base === 'pct_mo' ? '%' : i.unidad, cantidad: d.cantidad,
                             costo: d.compuesto ? d.base : i.costo, importe: d.importe };
                }).concat(u && u.hm ? [{ tipo: 'Herramienta menor', descripcion: pct(analisis.hm) + ' de la mano de obra', unidad: '', cantidad: 0, costo: 0, importe: u.hm }] : [])
                : (x.articulos || []).map(function (a) {
                    return { tipo: 'Importado', descripcion: txt(a.nom_articulo) || txt(a.clave_articulo), unidad: txt(a.unid_medida),
                             cantidad: num(a.unidades), costo: num(a.precio_unit), importe: num(a.precio_total) };
                })
            });
        });
        partidas.forEach(function (p) { delete p.porNombre; });
        return { r: r, subtotal: r.pv, catalogo: { partidas: partidas, factor: r.factor, detalle: detalle } };
    }

    // ---------- Catálogo de Conceptos (como Neodata) ----------
    // Los mismos conceptos del Análisis P.U., acomodados en partidas y subpartidas (la partida se escribe
    // «Partida / Subpartida», igual que en la impresión) con clave, unidad, cantidad, P.U., importe y % del total.
    // Lo capturado por importe en Materia Prima / Mano de Obra aparece en su partida, sin editar.
    var ccPartidaSel = null;   // partida del renglón seleccionado: ahí se agregan conceptos y subpartidas

    function partesPartida(p) {
        var x = String(p || '').split('/').map(function (s) { return txt(s); }).filter(Boolean);
        return { p: x[0] || '', s: x.slice(1).join(' / ') };
    }
    function unirPartida(p, s) { return p && s ? p + ' / ' + s : p || s || ''; }
    function clavePartida(p) { var x = partesPartida(p); return clave(unirPartida(x.p, x.s)); }

    // Partidas con sus conceptos directos y sus subpartidas, en el orden en que aparecen
    function arbolCc(r) {
        var lista = catalogoCliente(r), partidas = [], porNombre = {}, total = 0;
        lista.forEach(function (x) {
            var pp = partesPartida(x.c ? x.c.partida : x.partida), kp = clave(pp.p);
            var p = porNombre[kp];
            if (!p) {
                p = porNombre[kp] = { nombre: pp.p, numero: partidas.length + 1, conceptos: [], subs: [], porNombre: {}, importe: 0 };
                partidas.push(p);
            }
            var destino = p;
            if (pp.s) {
                destino = p.porNombre[clave(pp.s)];
                if (!destino) {
                    destino = p.porNombre[clave(pp.s)] = { nombre: pp.s, padre: p, numero: p.numero + '.' + (p.subs.length + 1), conceptos: [], importe: 0 };
                    p.subs.push(destino);
                }
                destino.importe += x.importe;
            }
            p.importe += x.importe;
            destino.conceptos.push(x);
            total += x.importe;
        });
        return { partidas: partidas, total: total };
    }

    // ---------- Análisis (resumen como la hoja de Excel) ----------
    // Materia Prima → Total MP; Mano de Obra → Total MO → Costo Primo; Margen de utilidad bruta (Subtotal − Costo Primo);
    // Gastos de Operacion → Utilidad Neta (Margen bruto − GO); Subtotal, IVA, Total y Total en dólares.
    // Los % son sobre el Subtotal, igual que en las pestañas. Los renglones del Análisis P.U. se abren por concepto.
    var TC_USD = Number(PARAMETROS.tipo_cambio_usd) || 0;

    // Renglones del resumen: los usa la pestaña y el formato impreso Análisis de Cancelería (js/formato-analisis.js).
    // Cada renglón: { clase, anexo, nombre, extra, pres, sub, tot, p, ir, como } con importes en número (null = vacío);
    // como: 'pct' (tot es un %), 'usd' (tot en dólares) o 'fijo' (se muestra aunque sea 0).
    function filasResumenCc() {
        var subtotal = calcularTotales();
        var t = { mp: suma(datos.mp), mo: suma(datos.mo), go: suma(datos.go) };
        var primo = t.mp + t.mo, bruta = subtotal - primo, neta = bruta - t.go, iva = subtotal * IVA;
        var porc = function (n) { return subtotal > 0 ? n / subtotal * 100 : null; };
        var filas = [], n = 0;
        function fila(clase, anexo, nombre, pres, sub, tot, p, ir, extra) {
            filas.push({ clase: clase, anexo: anexo, nombre: nombre, pres: pres, sub: sub, tot: tot, p: p, ir: ir || '', extra: extra || '' });
            return filas[filas.length - 1];
        }
        // Los insumos del Análisis P.U. ya vienen uno por renglón en Materia Prima y Mano de Obra
        function seccionCc(sec) {
            fila('ccr-titulo', '', NOMBRES[sec].toUpperCase(), null, null, null, null, sec);
            if (!datos[sec].length) fila('ccr-vacio', '', 'Sin conceptos capturados', null, null, null, null, sec);
            datos[sec].forEach(function (r) {
                var imp = num(r.presupuesto);
                fila(r.calc ? 'ccr-calc' : '', ++n, r.concepto || '(sin concepto)', imp, null, null, porc(imp), sec);
            });
        }
        seccionCc('mp');
        fila('ccr-total', '(=)', 'TOTAL MATERIA PRIMA', null, null, t.mp, porc(t.mp));
        seccionCc('mo');
        fila('ccr-total', '(+)', 'TOTAL MANO DE OBRA', null, t.mo, t.mo, porc(t.mo));
        fila('ccr-total ccr-fuerte', '(=)', 'TOTAL COSTO PRIMO', null, null, primo, porc(primo));
        fila('ccr-total ccr-centro', '(−)(=)', 'MARGEN DE UTILIDAD BRUTA', null, null, bruta, porc(bruta));
        seccionCc('go');
        fila('ccr-total', '(−)', 'TOTAL GASTOS DE OPERACION', null, null, t.go, porc(t.go));
        fila('ccr-total ccr-fuerte ccr-centro', '(=)', 'UTILIDAD NETA', null, null, neta, porc(neta));
        fila('ccr-nota', '', 'PORCENTAJE DE GANANCIA SOBRE PRECIO DE VENTA', null, null, porc(neta), null).como = 'pct';
        fila('ccr-final', '', 'SUBTOTAL', null, null, subtotal, subtotal > 0 ? 100 : null).como = 'fijo';
        fila('ccr-final', '', 'IVA ' + pct(IVA * 100), null, null, iva, null).como = 'fijo';
        fila('ccr-final ccr-fuerte', '', 'TOTAL', null, null, subtotal + iva, null).como = 'fijo';
        if (TC_USD > 0) fila('ccr-final', '', 'TOTAL EN DÓLARES IVA INCLUIDO', null, null, (subtotal + iva) / TC_USD, null, '', 'T.C. ' + fmt(TC_USD)).como = 'usd';
        return { filas: filas, subtotal: subtotal, iva: iva, total: subtotal + iva, letra: importeConLetra(subtotal + iva) };
    }

    function renderResumenCc() {
        var r = filasResumenCc();
        var dinero = function (n) { return n == null ? '' : Math.abs(n) < 0.005 ? '-' : fmt(n); };
        var html = r.filas.map(function (f) {
            var tot = f.tot == null ? '' : f.como === 'pct' ? pct(f.tot) : f.como === 'usd' ? 'US$ ' + fmt(f.tot) : f.como === 'fijo' ? fmt(f.tot) : dinero(f.tot);
            return '<tr class="' + f.clase + '"' + (f.ir ? ' data-ccr-ir="' + f.ir + '" title="Ir a ' + escapar(NOMBRES[f.ir]) + '"' : '') + '>' +
                '<td class="ccr-anexo">' + escapar(f.anexo) + '</td><td class="izq">' + escapar(f.nombre) + (f.extra ? ' <small>(' + escapar(f.extra) + ')</small>' : '') + '</td>' +
                '<td class="ro">' + dinero(f.pres) + '</td><td class="ro">' + dinero(f.sub) + '</td><td class="ro">' + tot + '</td>' +
                '<td class="ro">' + (f.p == null ? '' : pct(f.p)) + '</td></tr>';
        }).join('');
        html += '<tr class="ccr-letra"><td colspan="6">' + escapar(r.letra) + '</td></tr>';
        $('ccrCuerpo').innerHTML = html;
        $('anImportar').disabled = soloLectura;
    }
    // Un clic en un renglón lleva a la pestaña donde se captura
    $('ccrCuerpo').addEventListener('click', function (e) {
        var tr = e.target.closest('tr[data-ccr-ir]');
        var tab = tr && document.querySelector('.sec-tab[data-sec="' + tr.dataset.ccrIr + '"]');
        if (tab) tab.click();
    });

    // ---------- Exportar / importar el Análisis con Excel ----------
    // Exportar: CSV con las mismas columnas de la pestaña (Anexos, Partidas, Presupuesto sugerido, Subtotal, Total, %)
    // Exportar: Excel (.xlsx) con las mismas columnas de la pestaña (Anexos, Partidas, Presupuesto sugerido, Subtotal, Total, %)
    function exportarAn() {
        var r = filasResumenCc();
        var dinero = function (n, fuerte) { return n == null ? null : { v: redondear(n), e: fuerte ? 'total' : 'dinero' }; };
        var porc = function (n) { return n == null ? null : { v: Math.round(n * 100) / 10000, e: 'pct' }; };
        var filas = [['Anexos', 'Partidas', 'Presupuesto sugerido', 'Subtotal', 'Total', '%'].map(function (t) { return { v: t, e: 'titulo' }; })];
        r.filas.forEach(function (f) {
            var fuerte = /ccr-(titulo|total|final)/.test(f.clase);
            filas.push([f.anexo, { v: f.nombre + (f.extra ? ' (' + f.extra + ')' : ''), e: fuerte ? 'negrita' : 'texto' }, dinero(f.pres), dinero(f.sub),
                        f.como === 'pct' ? porc(f.tot) : dinero(f.tot, fuerte), porc(f.p)]);
        });
        filas.push(['', { v: r.letra, e: 'negrita' }]);
        XlsxSimple.descargar(XlsxSimple.crear({ nombre: 'Análisis', anchos: [9, 52, 18, 16, 18, 10], fijarFila: 1, filas: filas }),
                             'Analisis ' + (txt($('proyecto').value) || 'presupuesto'));
    }
    $('anExportar').addEventListener('click', exportarAn);

    // Importar: la hoja del Análisis (copiada de Excel o el CSV exportado). Los títulos MATERIA PRIMA / MANO DE OBRA /
    // GASTOS DE OPERACION marcan la sección; cada renglón con anexo y partida pone su importe en el concepto del mismo nombre.
    // Un anexo con sub-anexos (5 → 5.1, 5.2…) se toma por sus sub-anexos; los renglones automáticos no se tocan.
    var anFilas = [], anSubtotal = 0;
    var SECCION_AN = [['mp', /^MATERIA PRIMA$/], ['mo', /^MANO DE OBRA$/], ['go', /^GASTOS DE OPERACI[OÓ]N$/]];

    function leerImportacionAn() {
        var celdas = separarCeldas($('aniPegar').value);
        anFilas = [];
        anSubtotal = 0;
        var col = { anexo: 0, nombre: 1, pres: 2, sub: 3, tot: 4 }, inicio = 0;
        for (var i = 0; i < Math.min(celdas.length, 10); i++) {
            var j = -1;
            celdas[i].forEach(function (t, k) { if (j < 0 && /^(partidas?|conceptos?)$/i.test(txt(t))) j = k; });
            if (j < 0) continue;
            col = { anexo: -1, nombre: j, pres: j + 1, sub: j + 2, tot: j + 3 };
            celdas[i].forEach(function (t, k) {
                t = txt(t);
                if (/^anexo/i.test(t)) col.anexo = k;
                else if (/^presupuesto/i.test(t)) col.pres = k;
                else if (/^subtotal/i.test(t)) col.sub = k;
                else if (/^total$/i.test(t)) col.tot = k;
            });
            inicio = i + 1;
            break;
        }
        calcularTotales();   // marca los renglones automáticos
        var sec = null, candidatos = [];
        celdas.slice(inicio).forEach(function (f) {
            var anexo = col.anexo < 0 ? '' : txt(f[col.anexo]), nombre = txt(f[col.nombre]), k = clave(nombre);
            if (/^(TOTAL|MARGEN|UTILIDAD|PORCENTAJE|SUBTOTAL|IVA)\b/.test(k)) {
                // El Subtotal del archivo (precio de venta sin IVA) ajusta la Utilidad Neta para que el presupuesto quede igual
                if (/^SUBTOTAL$/.test(k)) { sec = null; anSubtotal = anSubtotal || numeroCelda(f[col.tot]) || numeroCelda(f[col.sub]); }
                return;
            }
            for (var s = 0; s < SECCION_AN.length; s++) if (SECCION_AN[s][1].test(k)) { sec = SECCION_AN[s][0]; return; }
            // Anexo como número (5, 5.1) o como porcentaje (0.25%, 3%), igual que en la hoja de Excel
            if (!sec || !nombre || (col.anexo >= 0 && !/^\d+(\.\d+)*%?$/.test(anexo))) return;
            var pres = numeroCelda(f[col.pres]);
            candidatos.push({ sec: sec, anexo: anexo, nombre: nombre, pres: pres, importe: pres || numeroCelda(f[col.sub]) });
        });
        var padreCalc = {};
        candidatos.forEach(function (x) {
            var padre = /^\d+\.\d+$/.test(x.anexo) ? x.anexo.split('.')[0] : '';
            // Grupo: sin importe propio en Presupuesto sugerido y con sub-anexos (5 → 5.1, 5.2); el 6 con su 6.1 suman los dos
            var hijos = /^\d+$/.test(x.anexo) && !x.pres &&
                candidatos.some(function (y) { return y.sec === x.sec && y.anexo.indexOf(x.anexo + '.') === 0 && y.importe; });
            var r = filaDe(x.sec, x.nombre);
            x.actual = r ? num(r.presupuesto) : null;
            if (padre && padreCalc[x.sec + padre]) x.accion = 'Es del análisis automático';
            else if (r && r.calc) { x.accion = 'Automático, no se cambia'; padreCalc[x.sec + x.anexo] = true; }
            else if (hijos) x.accion = 'Se toman sus sub-anexos';
            else if (!(x.importe > 0)) x.accion = 'Sin importe';
            else if (r && Math.abs(x.actual - x.importe) < 0.005) x.accion = 'Ya está, sin cambio';
            else { x.aplica = true; x.accion = r ? 'Actualiza el importe' : 'Concepto nuevo'; }
            anFilas.push(x);
        });
        pintarImportacionAn(anFilas.length ? '' : 'No encontré renglones bajo Materia Prima, Mano de Obra o Gastos de Operacion.');
    }

    function pintarImportacionAn(error) {
        var html = anFilas.map(function (x) {
            return '<tr class="' + (!x.aplica ? 'ani-omite' : x.actual == null ? 'ani-nuevo' : '') + '"><td>' + escapar(SIGLAS[x.sec]) + '</td><td>' + escapar(x.anexo) + '</td>' +
                '<td class="izq">' + escapar(x.nombre) + '</td><td class="ro">' + (x.actual == null ? '' : fmt(x.actual)) + '</td>' +
                '<td class="ro">' + (x.importe ? fmt(x.importe) : '') + '</td><td>' + escapar(x.accion) + '</td></tr>';
        }).join('');
        var validos = anFilas.filter(function (x) { return x.aplica; }).length;
        $('aniVista').innerHTML = html || '<tr class="vacio-fila"><td colspan="6">' + escapar(error || 'Pega las celdas y presiona Revisar.') + '</td></tr>';
        $('aniResumen').textContent = !anFilas.length ? '' : validos + ' de ' + anFilas.length + ' renglones se aplicarán' +
            (validos < anFilas.length ? ' (los tachados se omiten)' : '');
        $('aniSubtotalCaja').hidden = !(anSubtotal > 0);
        $('aniSubtotalTxt').textContent = 'Usar el Subtotal del archivo (' + fmt(anSubtotal) + '): ajusta la Utilidad Neta para que el presupuesto quede igual';
        $('aniVentaCaja').hidden = !analisis.conceptos.some(function (c) { return !esVenta(c); });
        $('aniAplicar').disabled = !validos;
    }

    function aplicarImportacionAn() {
        if (soloLectura) { avisoSoloLectura(); return; }
        calcularTotales();
        // Los conceptos del Catálogo ya están dentro del Análisis: quedan con su P.U. actual como precio fijo y dejan de sumar al costo
        if (!$('aniVentaCaja').hidden && $('aniVenta').checked) {
            catalogoPU(calcularPU()).forEach(function (x) {
                if (x.otro || esVenta(x.c)) return;
                x.c.venta = Math.max(0.01, redondear(x.pu));
                x.c.insumos = sinPrecioPlano(x.c.insumos);   // su análisis queda como matriz informativa
            });
        }
        var vistos = { mp: {}, mo: {}, go: {} }, n = 0;
        anFilas.forEach(function (x) {
            if (!x.aplica) return;
            var r = filaDe(x.sec, x.nombre);
            if (r && r.calc) return;
            if (!r) {
                r = { id: ++consecutivo, concepto: x.nombre, presupuesto: 0, importar: false, folio: '' };
                datos[x.sec].push(r);
            }
            r.presupuesto = redondear(x.importe);
            vistos[x.sec][clave(x.nombre)] = true;
            n++;
        });
        // Reemplazar: en las secciones que vienen en el archivo se quitan los conceptos capturados que no vienen
        if ($('aniQuitar').checked) {
            ['mp', 'mo', 'go'].forEach(function (s) {
                if (!Object.keys(vistos[s]).length) return;
                datos[s] = datos[s].filter(function (r) { return r.calc || vistos[s][clave(r.concepto)]; });
            });
        }
        if (!$('aniSubtotalCaja').hidden && $('aniSubtotal').checked) {
            // Los renglones automáticos (comisiones, % del subtotal) dependen del subtotal: se repite hasta que coincide
            for (var vuelta = 0; vuelta < 8; vuelta++) {
                if (subtotalManual) $('tSUB').value = anSubtotal.toFixed(2);
                else $('pctUtilidad').value = utilidadPorSubtotal(recalcular().costo, anSubtotal).toFixed(4);
            }
        }
        $('anImpDialogo').close();
        marcarCambio();
        render();
        alert('Se aplicaron ' + n + ' importes a Materia Prima, Mano de Obra y Gastos de Operacion.');
    }

    $('anImportar').addEventListener('click', function () {
        if (soloLectura) { avisoSoloLectura(); return; }
        $('aniPegar').value = '';
        $('aniArchivo').value = '';
        anFilas = [];
        pintarImportacionAn('');
        $('anImpDialogo').showModal();
        $('aniPegar').focus();
    });
    $('aniArchivo').addEventListener('change', function () {
        var f = this.files[0];
        if (!f) return;
        leerArchivoImportar(f, 'aniPegar', leerImportacionAn);
    });
    $('aniLeer').addEventListener('click', leerImportacionAn);
    $('aniAplicar').addEventListener('click', aplicarImportacionAn);
    document.querySelectorAll('[data-ani-cerrar]').forEach(function (b) { b.addEventListener('click', function () { $('anImpDialogo').close(); }); });

    function renderCc() {
        construirSugerencias();
        var r = calcularPU(), a = arbolCc(r), dis = soloLectura ? ' disabled' : '', html = '';
        function filaGrupo(g, sub) {
            var partida = sub ? unirPartida(g.padre.nombre, g.nombre) : g.nombre;
            // Solo los grupos con conceptos analizados se editan; los de lo capturado por importe se ven nada más
            var analizado = function (x) { return !x.otro; };
            var editable = g.conceptos.some(analizado) || (!sub && g.subs.some(function (s) { return s.conceptos.some(analizado); }));
            return '<tr class="' + (sub ? 'cc-sub' : 'cc-partida') + '" data-partida="' + escapar(partida) + '">' +
                '<td class="id">' + (sub ? g.numero : g.numero + '.') + '</td>' +
                '<td colspan="4">' + (editable
                    ? '<input type="text" data-cc-grupo="' + (sub ? 's' : 'p') + '" maxlength="100" value="' + escapar(g.nombre) + '" placeholder="' + (sub ? 'Subpartida' : 'Sin partida') + '"' + dis + '>'
                    : '<span class="cc-nombre">' + escapar(g.nombre || 'Sin partida') + '</span>') + '</td>' +
                '<td class="ro" data-cc-calc="importe">' + fmt(g.importe) + '</td>' +
                '<td class="ro" data-cc-calc="pct">' + (a.total ? pct(g.importe / a.total * 100) : '') + '</td>' +
                '<td class="pu-acciones">' + (editable ?
                    '<button type="button" class="pu-mini" data-cc-accion="agregar" title="Agregar un concepto a esta ' + (sub ? 'subpartida' : 'partida') + '"' + dis + '>+</button>' +
                    (sub ? '' : '<button type="button" class="pu-mini" data-cc-accion="subir-partida" title="Subir la partida"' + dis + '>↑</button>' +
                                '<button type="button" class="pu-mini" data-cc-accion="bajar-partida" title="Bajar la partida"' + dis + '>↓</button>') +
                    '<button type="button" class="pu-mini borrar" data-cc-accion="quitar-grupo" title="Quitar la ' + (sub ? 'subpartida' : 'partida') + ' con sus conceptos"' + dis + '>✕</button>' : '') +
                '</td></tr>';
        }
        function filaConcepto(x) {
            var p = a.total ? pct(x.importe / a.total * 100) : '';
            if (x.otro) {
                return '<tr class="cc-otro" data-ir-sec="' + x.sec + '" data-ir-id="' + x.fila.id + '" data-buscar="' + escapar(clave(x.clave + ' ' + x.descripcion)) + '"><td class="id">' + escapar(x.clave) + '</td>' +
                    '<td class="ro izq">' + escapar(x.descripcion) + '</td><td class="ro izq">' + escapar(x.unidad) + '</td>' +
                    '<td class="ro">' + cant(x.cantidad) + '</td><td class="ro">' + fmt(x.pu) + '</td><td class="ro">' + fmt(x.importe) + '</td>' +
                    '<td class="ro">' + p + '</td><td class="pu-acciones">' + (x.fila.calc ? '<span class="cc-nota">Automático</span>' :
                    '<button type="button" class="ct-btn" data-cc-accion="analizar-importe" data-sec="' + x.sec + '" data-id="' + x.fila.id + '"' +
                    ' title="Capturado por importe en ' + escapar(NOMBRES[x.sec]) + ': pasarlo al análisis con lo que ya tiene"' + dis + '>Analizar</button>') + '</td></tr>';
            }
            var c = x.c, falta = revisionConcepto(c);
            return '<tr data-uid="' + c.uid + '"' + (c.id ? ' data-id="' + c.id + '"' : '') + ' data-buscar="' + escapar(clave(c.clave + ' ' + c.descripcion)) + '">' +
                '<td><input type="text" data-cc="clave" maxlength="20" value="' + escapar(c.clave) + '"' + dis + '></td>' +
                '<td><textarea class="cc-desc" data-cc="descripcion" maxlength="4300" rows="1" placeholder="¿Qué trabajo es? Materiales, acabados, dimensiones, lo que incluye…"' + dis + '>' +
                    escapar(descripcionCompleta(c)) + '</textarea></td>' +
                '<td><input type="text" data-cc="unidad" list="puUnidades" maxlength="20" value="' + escapar(c.unidad) + '" placeholder="m², pza…"' + dis + '></td>' +
                '<td><input type="number" class="num" data-cc="cantidad" step="0.01" min="0" value="' + (c.cantidad || '') + '"' + dis + '></td>' +
                (esVenta(c)
                    ? '<td><input type="number" class="num" data-cc="venta" step="0.01" min="0" value="' + c.venta + '" title="Precio fijo para el cliente (importado): no suma al costo"' + dis + '></td>'
                    : '<td class="ro" data-cc-calc="pu">' + fmt(x.pu) + '</td>') +
                '<td class="ro" data-cc-calc="importe">' + fmt(x.importe) + '</td>' +
                '<td class="ro" data-cc-calc="pct">' + p + '</td>' +
                '<td class="pu-acciones">' + (esVenta(c)
                    ? '<button type="button" class="ct-btn" data-cc-accion="analizar" title="' + TITULO_FIJO + '">Precio fijo</button>'
                    : '<button type="button" class="ct-btn' + (falta ? ' cc-falta' : '') + '" data-cc-accion="analizar" title="' +
                    (falta ? '⚠ ' + falta : 'Ver o cambiar el análisis de una unidad') + '">' + (falta ? '⚠ ' : '') + 'Análisis</button>') +
                '<button type="button" class="pu-mini" data-cc-accion="subir" title="Subir"' + dis + '>↑</button>' +
                '<button type="button" class="pu-mini" data-cc-accion="bajar" title="Bajar"' + dis + '>↓</button>' +
                '<button type="button" class="pu-mini" data-cc-accion="duplicar" title="Duplicar el concepto con su análisis"' + dis + '>⧉</button>' +
                '<button type="button" class="pu-mini borrar" data-cc-accion="quitar" title="Quitar el concepto"' + dis + '>✕</button></td></tr>';
        }
        a.partidas.forEach(function (p) {
            html += filaGrupo(p, false);
            p.conceptos.forEach(function (x) { html += filaConcepto(x); });
            p.subs.forEach(function (s) {
                html += filaGrupo(s, true);
                s.conceptos.forEach(function (x) { html += filaConcepto(x); });
            });
        });
        $('ccCuerpo').innerHTML = html ||
            '<tr class="vacio-fila"><td colspan="8">El catálogo está vacío. Empieza con «+ Partida» (ej. Cancelería) y agrega sus conceptos con su unidad y cantidad.</td></tr>';
        ['ccPartida', 'ccSubpartida', 'ccConcepto', 'ccRenumerar', 'ccPlantilla', 'ccImportar'].forEach(function (id) { if ($(id)) $(id).disabled = soloLectura; });
        $('ccCuerpo').querySelectorAll('textarea.cc-desc').forEach(ajustarEspec);
        filtrarCc();
        pintarCc(r, a);
    }

    // Cifras sin volver a pintar los campos (para no perder el cursor mientras se escribe)
    function pintarCc(r, a) {
        r = r || calcularPU();
        a = a || arbolCc(r);
        var porPartida = {}, porUid = {};
        a.partidas.forEach(function (p) {
            porPartida[clave(p.nombre)] = p;
            p.conceptos.forEach(function (x) { if (x.c) porUid[x.c.uid] = x; });
            p.subs.forEach(function (s) {
                porPartida[clave(unirPartida(p.nombre, s.nombre))] = s;
                s.conceptos.forEach(function (x) { if (x.c) porUid[x.c.uid] = x; });
            });
        });
        var porc = function (n) { return a.total ? pct(n / a.total * 100) : ''; };
        $('ccCuerpo').querySelectorAll('tr[data-partida]').forEach(function (tr) {
            var g = porPartida[clave(tr.dataset.partida)];
            if (!g) return;
            tr.querySelector('[data-cc-calc="importe"]').textContent = fmt(g.importe);
            tr.querySelector('[data-cc-calc="pct"]').textContent = porc(g.importe);
        });
        $('ccCuerpo').querySelectorAll('tr[data-uid]').forEach(function (tr) {
            var x = porUid[tr.dataset.uid];
            if (!x) return;
            if (tr.querySelector('[data-cc-calc="pu"]')) tr.querySelector('[data-cc-calc="pu"]').textContent = fmt(x.pu);
            tr.querySelector('[data-cc-calc="importe"]').textContent = fmt(x.importe);
            tr.querySelector('[data-cc-calc="pct"]').textContent = porc(x.importe);
        });
        var dif = Math.abs(a.total - r.subtotal) >= 0.5;
        $('ccPie').innerHTML =
            '<tr><td colspan="5" class="ro">Total del catálogo (sin IVA)</td><td class="ro">' + fmt(a.total) + '</td><td colspan="2"></td></tr>' +
            '<tr><td colspan="5" class="ro">IVA ' + pct(IVA * 100) + '</td><td class="ro">' + fmt(a.total * IVA) + '</td><td colspan="2"></td></tr>' +
            '<tr class="cc-total"><td colspan="5" class="ro">Total</td><td class="ro">' + fmt(a.total * (1 + IVA)) + '</td><td colspan="2"></td></tr>' +
            '<tr class="cc-letra"><td colspan="8">' + escapar(importeConLetra(a.total * (1 + IVA))) +
                (dif ? '<br><small>El Subtotal del presupuesto es ' + fmt(r.subtotal) + (hayVenta()
                    ? ': sale de Materia Prima, Mano de Obra y Gastos de Operacion; los conceptos de precio fijo son lo que ve el cliente.'
                    : ': la diferencia viene de los ajustes avanzados del Análisis P.U. o de los conceptos con cálculo automático.') + '</small>' : '') +
            '</td></tr>';
    }

    // Importe con letra, como en los presupuestos: «(MIL DOSCIENTOS PESOS 50/100 M.N.)»
    function numeroConLetra(n) {
        var U = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
                 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUN', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO',
                 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
        var D = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
        var C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
        function menorMil(x) {
            if (x === 100) return 'CIEN';
            var c = Math.floor(x / 100), r = x % 100, t = C[c];
            if (r) t += (t ? ' ' : '') + (r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' Y ' + U[r % 10] : ''));
            return t;
        }
        if (n === 0) return 'CERO';
        var partes = [], mill = Math.floor(n / 1e6), miles = Math.floor(n / 1000) % 1000, resto = n % 1000;
        if (mill) partes.push(mill === 1 ? 'UN MILLON' : numeroConLetra(mill) + ' MILLONES');
        if (miles) partes.push(miles === 1 ? 'MIL' : menorMil(miles) + ' MIL');
        if (resto) partes.push(menorMil(resto));
        return partes.join(' ');
    }
    function importeConLetra(n) {
        var centavos = Math.round(Math.max(0, n) * 100), entero = Math.floor(centavos / 100);
        var letra = numeroConLetra(entero);
        return '(' + letra + (entero && entero % 1e6 === 0 ? ' DE' : '') + (entero === 1 ? ' PESO ' : ' PESOS ') + ('0' + centavos % 100).slice(-2) + '/100 M.N.)';
    }

    // Descripción completa en un solo campo, como en Neodata: la primera línea es el nombre del concepto (con el que se
    // busca en el catálogo y la biblioteca) y lo demás su especificación
    function descripcionCompleta(c) {
        return c.descripcion + (txt(c.especificacion) ? '\n' + c.especificacion : '');
    }
    function partirDescripcion(c, texto) {
        var i = texto.indexOf('\n'), desc = i < 0 ? texto : texto.slice(0, i), espec = i < 0 ? '' : texto.slice(i + 1);
        // El nombre guarda hasta 300 letras: si la primera línea es más larga, lo que sobra pasa a la especificación
        if (desc.length > 300) {
            var corte = desc.lastIndexOf(' ', 300);
            if (corte < 1) corte = 300;
            espec = desc.slice(corte).replace(/^ /, '') + (espec ? '\n' + espec : '');
            desc = desc.slice(0, corte);
        }
        c.descripcion = desc;
        c.especificacion = espec;
    }

    // La descripción crece con su texto, como el renglón del PDF
    function ajustarEspec(t) {
        t.style.height = 'auto';
        t.style.height = t.scrollHeight + 'px';
    }

    // ---------- Exportar / importar el catálogo con Excel ----------
    // Exportar: CSV que abre Excel (como Exportar a Excel de la Obra), una fila por concepto y los totales al final
    // Exportar: Excel (.xlsx) como el PDF, con el concepto y su especificación completos en la misma celda (ajustar texto)
    function exportarCc() {
        var r = calcularPU(), a = arbolCc(r);
        var dinero = function (n, fuerte) { return { v: redondear(n), e: fuerte ? 'total' : 'dinero' }; };
        var filas = [['Partida', 'Código', 'Concepto', 'Unidad', 'Cantidad', 'P. Unitario', 'Importe'].map(function (t) { return { v: t, e: 'titulo' }; })];
        a.partidas.forEach(function (p) {
            var poner = function (lista, partida) {
                lista.forEach(function (x) {
                    var espec = x.c ? String(x.c.especificacion || '').trim() : '';
                    filas.push([{ v: partida, e: 'texto' }, x.clave, { v: x.descripcion + (espec ? '\n' + espec : ''), e: 'texto' }, x.unidad,
                                { v: num(x.cantidad), e: 'cantidad' }, dinero(x.pu), dinero(x.importe)]);
                });
            };
            poner(p.conceptos, p.nombre);
            p.subs.forEach(function (s) { poner(s.conceptos, unirPartida(p.nombre, s.nombre)); });
        });
        if (filas.length < 2) { alert('El catálogo está vacío: no hay nada que exportar.'); return; }
        filas.push([]);
        filas.push(['', '', { v: 'TOTAL SIN IVA', e: 'negrita' }, '', '', '', dinero(a.total, true)]);
        filas.push(['', '', { v: 'IVA ' + pct(IVA * 100), e: 'negrita' }, '', '', '', dinero(a.total * IVA, true)]);
        filas.push(['', '', { v: 'TOTAL', e: 'negrita' }, '', '', '', dinero(a.total * (1 + IVA), true)]);
        filas.push(['', '', { v: importeConLetra(a.total * (1 + IVA)), e: 'texto' }]);
        XlsxSimple.descargar(XlsxSimple.crear({ nombre: 'Catálogo de Conceptos', anchos: [18, 10, 70, 8, 11, 15, 16], fijarFila: 1, filas: filas }),
                             'Catalogo de conceptos ' + (txt($('proyecto').value) || 'presupuesto'));
    }
    $('ccExportar').addEventListener('click', exportarCc);

    // Archivo para importar: Excel (.xlsx) o CSV; queda en la caja de texto como si se hubiera pegado
    function leerArchivoImportar(f, caja, listo) {
        if (/\.xlsx$/i.test(f.name)) {
            XlsxSimple.leer(f).then(function (filas) { $(caja).value = XlsxSimple.aTexto(filas); listo(); })
                .catch(function (e) { alert('No se pudo leer el archivo de Excel: ' + (e && e.message || e)); });
            return;
        }
        if (/\.xls$/i.test(f.name)) { alert('Ese archivo es de Excel antiguo (.xls): en Excel guárdalo como .xlsx, o copia las celdas y pégalas.'); return; }
        var lector = new FileReader();
        lector.onload = function () { $(caja).value = lector.result; listo(); };
        lector.readAsText(f, 'UTF-8');
    }

    // Importar: celdas copiadas de Excel (tabuladores) o CSV (coma o punto y coma), con comillas y saltos de línea dentro de la celda
    var COLUMNAS_CCI = [
        ['partida', /^(partida|agrupador|grupo|familia)/i],
        ['clave', /^(c[oó]digo|clave|cve)/i],
        ['especificacion', /^(especific|descripci[oó]n t[eé]cnica|detalle)/i],
        ['descripcion', /^(concepto|descripci[oó]n|nombre)/i],
        ['unidad', /^(unidad|u\.?m\.?$|um$)/i],
        ['cantidad', /^(cantidad|cant)/i],
        ['pu', /^(p\.?\s*unit|precio unit|p\.?u\.?$|precio$)/i],
        ['importe', /^(importe|total)/i]
    ];
    var cciFilas = [];

    function separarCeldas(texto) {
        texto = texto.replace(/\r\n?/g, '\n');
        var primera = texto.split('\n')[0];
        var sep = primera.indexOf('\t') >= 0 ? '\t' : (primera.split(';').length > primera.split(',').length ? ';' : ',');
        var filas = [], fila = [], actual = '', comillas = false;
        for (var i = 0; i < texto.length; i++) {
            var ch = texto[i];
            if (comillas) {
                if (ch === '"' && texto[i + 1] === '"') { actual += '"'; i++; }
                else if (ch === '"') comillas = false;
                else actual += ch;
            } else if (ch === '"' && actual === '') comillas = true;
            else if (ch === sep) { fila.push(actual.trim()); actual = ''; }
            else if (ch === '\n') { fila.push(actual.trim()); filas.push(fila); fila = []; actual = ''; }
            else actual += ch;
        }
        if (actual !== '' || fila.length) { fila.push(actual.trim()); filas.push(fila); }
        return filas.filter(function (f) { return f.some(function (x) { return x !== ''; }); });
    }
    // Importes como «$37,553.03» o «1.0000»
    function numeroCelda(v) { return num(String(v || '').replace(/[$\s,]/g, '')); }

    function leerImportacion() {
        var celdas = separarCeldas($('cciPegar').value);
        cciFilas = [];
        if (celdas.length < 2) { pintarImportacion('Pega el encabezado y al menos un renglón.'); return; }
        var col = {};
        celdas[0].forEach(function (titulo, i) {
            for (var k = 0; k < COLUMNAS_CCI.length; k++) {
                if (col[COLUMNAS_CCI[k][0]] === undefined && COLUMNAS_CCI[k][1].test(txt(titulo))) { col[COLUMNAS_CCI[k][0]] = i; return; }
            }
        });
        if (col.descripcion === undefined && col.clave === undefined) {
            pintarImportacion('No encontré la columna Concepto ni la de Código en el encabezado: ' + celdas[0].join(' · '));
            return;
        }
        var porCodigo = {};
        CONCEPTOS_PU.forEach(function (c) { porCodigo[clave(c.codigo)] = c; });
        var usarCat = $('cciCatalogo').checked, venta = $('cciVenta').checked;
        // Lo que ya está en el catálogo (analizados y capturados por importe en MP / MO), para no sumarlo dos veces
        var yaPorClave = {}, yaPorDesc = {}, enArchivo = {}, contTexto = true;
        catalogoPU(calcularPU()).forEach(function (x) {
            if (clave(x.clave)) yaPorClave[clave(x.clave)] = yaPorClave[clave(x.clave)] || x;
            if (clave(x.descripcion)) yaPorDesc[clave(x.descripcion)] = yaPorDesc[clave(x.descripcion)] || x;
        });
        celdas.slice(1).forEach(function (f) {
            var v = function (k) { return col[k] === undefined ? '' : f[col[k]] || ''; };
            var desc = v('descripcion'), codigo = txt(v('clave')), espec = v('especificacion');
            var cantidad = numeroCelda(v('cantidad')), pu = numeroCelda(v('pu'));
            if (!pu && cantidad > 0 && numeroCelda(v('importe'))) pu = numeroCelda(v('importe')) / cantidad;
            // Encabezado repetido en cada hoja del PDF (Código, Concepto, Unidad…)
            if (/^c[oó]digo$/i.test(codigo) || (!codigo && /^concepto$/i.test(txt(desc)))) return;
            if (!codigo && !pu && !cantidad) {
                // Renglón sin código ni importes: es el texto que sigue del concepto de arriba (en el PDF se pasa a la hoja
                // siguiente o va en otro renglón al convertirlo a Excel); los títulos, totales y pies de página se ignoran
                var resto = String(desc || espec).trim(), anterior = cciFilas[cciFilas.length - 1];
                if (/^(total|iva\b|\(\*|subtotal)/i.test(resto)) { contTexto = false; return; }
                if (!resto || !anterior || !contTexto || /^(presupuesto de obra|gerente general|p[aá]gina \d|fecha:|cotizaci[oó]n:|empresa:|en atenci[oó]n|obra:|lugar:)/i.test(resto)) return;
                var antes = anterior.especificacion || '', ultimaLinea = (antes || anterior.descripcion).split('\n').pop();
                // Como en el PDF: los renglones que terminan en punto o dos puntos, o empiezan con viñeta, van en línea aparte
                var corte = /[.:]\s*$/.test(ultimaLinea) || /^[*•\-]/.test(resto) ? '\n' : ' ';
                anterior.especificacion = antes ? antes.replace(/\s+$/, '') + corte + resto : resto;
                return;
            }
            contTexto = true;
            // Como en el PDF: la primera línea es el concepto y lo demás su especificación
            if (!espec && desc.indexOf('\n') >= 0) {
                espec = desc.slice(desc.indexOf('\n') + 1);
                desc = desc.slice(0, desc.indexOf('\n'));
            }
            var cat = usarCat && codigo ? porCodigo[clave(codigo)] : null;
            var x = { clave: codigo, partida: txt(v('partida')).replace(/\s*\/\s*/g, ' / '), descripcion: txt(desc) || (cat ? cat.descripcion : ''),
                      especificacion: espec.trim() || (cat ? cat.especificacion || '' : ''), unidad: txt(v('unidad')) || (cat ? cat.unidad : ''),
                      cantidad: cantidad || 1, pu: pu, cat: cat };
            // El mismo código (o, sin código, la misma descripción) ya está: se compara en lugar de agregarlo otra vez
            var llave = clave(codigo) || clave(x.descripcion);
            x.existe = codigo ? yaPorClave[clave(codigo)] : yaPorDesc[clave(x.descripcion)];
            if (llave && enArchivo[llave]) x.accion = 'Repetido en el archivo';
            else if (x.existe) {
                var e = x.existe, mismaCant = Math.abs(num(e.cantidad) - x.cantidad) < 0.005, mismoPU = !pu || Math.abs(e.pu - pu) < 0.01;
                if (e.otro) x.accion = 'Ya está en ' + NOMBRES[e.sec] + (mismaCant && mismoPU ? '' : ' (su importe se cambia allá)');
                else if (venta && pu > 0 && (!e.venta || !mismaCant || !mismoPU)) {
                    // Precio fijo: toma el P. Unitario del archivo y deja de sumar al costo
                    x.actualiza = true;
                    x.venta = pu;
                    x.accion = e.venta ? 'Actualiza ' + [mismaCant ? '' : 'la cantidad', mismoPU ? '' : 'el precio fijo'].filter(Boolean).join(' y ') : 'Pasa a precio fijo';
                }
                else if (mismaCant && mismoPU) x.accion = 'Ya está, sin cambio';
                else {
                    // Solo se cambia el P.U. de un concepto sin análisis propio (importado) o con el análisis del catálogo
                    var plano = e.c.insumos.length === 1 && e.c.insumos[0].descripcion === 'Precio unitario importado';
                    x.ponerPU = !mismoPU && (plano || !!cat);
                    x.actualiza = !mismaCant || x.ponerPU;
                    x.accion = (x.actualiza ? 'Actualiza ' + [mismaCant ? '' : 'la cantidad', x.ponerPU ? 'el P. Unitario' : ''].filter(Boolean).join(' y ') : 'Ya está') +
                               (!mismoPU && !x.ponerPU ? ' (el P. Unitario sale de su análisis)' : '');
                }
            }
            else if (venta && x.descripcion && pu > 0) { x.aplica = true; x.venta = pu; x.accion = 'Nuevo, precio fijo para el cliente'; }
            else if (importable(x)) { x.aplica = true; x.accion = cat ? 'Nuevo, con el análisis del catálogo' : 'Nuevo, con el P. Unitario del archivo'; }
            else x.accion = x.descripcion ? 'Sin precio' : 'Sin concepto';
            if (x.actualiza) x.aplica = true;
            if (llave) enArchivo[llave] = true;
            cciFilas.push(x);
        });
        // Un concepto que ya está pero con la especificación incompleta (importado antes sin el texto que seguía en otra hoja)
        cciFilas.forEach(function (x) {
            if (!x.existe || x.existe.otro || x.aplica || !x.especificacion) return;
            if (txt(x.especificacion) === txt(x.existe.c.especificacion)) return;
            x.actualiza = x.aplica = true;
            x.accion = 'Completa la especificación';
        });
        pintarImportacion(cciFilas.length ? '' : 'No hay renglones con concepto para agregar.');
    }

    // Sin el insumo «Precio unitario importado» (el P.U. del archivo sin análisis propio): no es una matriz real
    function sinPrecioPlano(insumos) {
        return insumos.filter(function (i) { return i.descripcion !== 'Precio unitario importado'; });
    }
    function importable(x) { return !!x.descripcion && (!!x.cat || x.pu > 0); }
    function pintarImportacion(error) {
        var html = cciFilas.map(function (x) {
            return '<tr class="' + (!x.aplica ? 'cci-error' : x.cat ? 'cci-cat' : '') + '"><td>' + escapar(x.clave) + '</td><td class="izq">' + escapar(x.descripcion) + '</td>' +
                '<td>' + escapar(x.partida) + '</td><td>' + escapar(x.unidad) + '</td><td class="ro">' + cant(x.cantidad) + '</td>' +
                '<td class="ro">' + (x.pu ? fmt(x.pu) : '') + '</td><td>' + escapar(x.accion) + '</td></tr>';
        }).join('');
        var nuevos = cciFilas.filter(function (x) { return x.aplica && !x.actualiza; }).length;
        var cambian = cciFilas.filter(function (x) { return x.actualiza; }).length;
        var ya = cciFilas.filter(function (x) { return x.existe && !x.actualiza; }).length;
        $('cciVista').innerHTML = html || '<tr class="vacio-fila"><td colspan="7">' + escapar(error || 'Pega las celdas y presiona Revisar.') + '</td></tr>';
        $('cciResumen').textContent = !cciFilas.length ? '' : nuevos + ' nuevos, ' + cambian + ' se actualizan y ' + ya + ' ya están en el presupuesto' +
            (ya ? ' (no se vuelven a sumar)' : '');
        $('cciAgregar').disabled = !(nuevos + cambian);
    }

    function agregarImportacion() {
        if (soloLectura) { avisoSoloLectura(); return; }
        var ajustar = [], nuevos = 0, cambiados = 0;
        cciFilas.forEach(function (x) {
            if (!x.aplica) return;
            if (x.actualiza) {
                var e = x.existe.c;
                e.cantidad = x.cantidad;
                if (x.unidad) e.unidad = x.unidad;
                if (x.especificacion) e.especificacion = x.especificacion;
                if (x.venta) { e.venta = x.venta; e.insumos = x.cat ? x.cat.insumos.map(limpiarInsumo) : sinPrecioPlano(e.insumos); }
                else if (x.ponerPU && x.cat) e.insumos = x.cat.insumos.map(limpiarInsumo);
                else if (x.ponerPU) ajustar.push({ c: e, pu: x.pu });
                cambiados++;
                return;
            }
            var c = nuevoConcepto({ clave: x.clave, partida: x.partida || (x.cat ? x.cat.partida : '') || 'Importados', descripcion: x.descripcion,
                                    especificacion: x.especificacion, unidad: x.unidad, cantidad: x.cantidad, venta: x.venta || 0,
                                    insumos: x.cat ? x.cat.insumos : x.venta ? [] : [{ tipo: 'MAT', descripcion: 'Precio unitario importado', unidad: x.unidad, cantidad: 1, costo: x.pu }] });
            analisis.conceptos.push(c);
            if (!x.cat && !x.venta) ajustar.push({ c: c, pu: x.pu });
            nuevos++;
        });
        // El P. Unitario del archivo es el precio de venta: el costo se ajusta con el factor del presupuesto para que quede igual
        for (var vuelta = 0; vuelta < 8; vuelta++) {
            var r = calcularPU();
            if (!(r.factor > 0)) break;
            ajustar.forEach(function (n) { n.c.insumos[0].costo = n.pu / r.factor; });
        }
        huboAnalisis = huboAnalisis || nuevos > 0;
        $('ccImpDialogo').close();
        marcarCambio();
        calcularTotales();
        renderCc();
        alert('Se agregaron ' + nuevos + ' conceptos y se actualizaron ' + cambiados + '.');
    }

    $('ccImportar').addEventListener('click', function () {
        if (soloLectura) { avisoSoloLectura(); return; }
        $('cciPegar').value = '';
        $('cciArchivo').value = '';
        // Si el costo ya está capturado (o importado del Análisis), el catálogo entra como precio fijo para no sumarlo dos veces
        calcularTotales();
        $('cciVenta').checked = hayVenta() || ['mp', 'mo', 'go'].some(function (s) {
            return datos[s].some(function (r) { return !r.calc && num(r.presupuesto) > 0; });
        });
        cciFilas = [];
        pintarImportacion('');
        $('ccImpDialogo').showModal();
        $('cciPegar').focus();
    });
    $('cciArchivo').addEventListener('change', function () {
        var f = this.files[0];
        if (!f) return;
        leerArchivoImportar(f, 'cciPegar', leerImportacion);
    });
    $('cciLeer').addEventListener('click', leerImportacion);
    $('cciCatalogo').addEventListener('change', function () { if (cciFilas.length) leerImportacion(); });
    $('cciVenta').addEventListener('change', function () { if (cciFilas.length) leerImportacion(); });
    $('cciAgregar').addEventListener('click', agregarImportacion);
    document.querySelectorAll('[data-cci-cerrar]').forEach(function (b) { b.addEventListener('click', function () { $('ccImpDialogo').close(); }); });

    function filtrarCc() {
        var q = clave($('ccBuscar').value);
        $('ccCuerpo').querySelectorAll('tr[data-buscar]').forEach(function (tr) { tr.hidden = !!q && tr.dataset.buscar.indexOf(q) < 0; });
    }
    $('ccBuscar').addEventListener('input', filtrarCc);

    function agregarConceptoCc(partida) {
        if (soloLectura) { avisoSoloLectura(); return; }
        if (partida === undefined) {
            var ultimo = analisis.conceptos[analisis.conceptos.length - 1];
            partida = ccPartidaSel !== null ? ccPartidaSel : ultimo ? ultimo.partida : '';
        }
        // Va después del último concepto de la misma partida, para que quede junto a ellos
        var k = clavePartida(partida), pos = analisis.conceptos.length;
        analisis.conceptos.forEach(function (c, i) { if (clavePartida(c.partida) === k) pos = i + 1; });
        var c = nuevoConcepto({ partida: partida });
        analisis.conceptos.splice(pos, 0, c);
        ccPartidaSel = partida;
        marcarCambio();
        renderCc();
        var f = $('ccCuerpo').querySelector('tr[data-uid="' + c.uid + '"] [data-cc="descripcion"]');
        if (f) f.focus();
    }

    $('ccPartida').addEventListener('click', function () {
        if (soloLectura) { avisoSoloLectura(); return; }
        var nombre = txt(prompt('Nombre de la nueva partida (ej. Cancelería, Barandales, Fachada):') || '').replace(/\//g, '-');
        if (!nombre) return;
        var existe = analisis.conceptos.some(function (c) { return clave(partesPartida(c.partida).p) === clave(nombre); });
        if (existe) { alert('La partida «' + nombre + '» ya está en el catálogo.'); return; }
        agregarConceptoCc(nombre);
    });
    $('ccSubpartida').addEventListener('click', function () {
        if (soloLectura) { avisoSoloLectura(); return; }
        var p = partesPartida(ccPartidaSel !== null ? ccPartidaSel : (analisis.conceptos[analisis.conceptos.length - 1] || {}).partida).p;
        if (!p) { alert('Primero selecciona (o crea) la partida donde va la subpartida.'); return; }
        var nombre = txt(prompt('Nombre de la subpartida dentro de «' + p + '»:') || '').replace(/\//g, '-');
        if (nombre) agregarConceptoCc(unirPartida(p, nombre));
    });
    $('ccConcepto').addEventListener('click', function () { agregarConceptoCc(); });
    if ($('ccPlantilla')) $('ccPlantilla').addEventListener('change', function () { agregarPlantilla(this, ccPartidaSel || ''); });

    // Claves en orden, como Neodata: partida 01 → 01-001, 01-002; subpartida 01.02 → 01.02-001
    $('ccRenumerar').addEventListener('click', function () {
        if (soloLectura) { avisoSoloLectura(); return; }
        if (!analisis.conceptos.length) return;
        if (!confirm('¿Cambiar las claves de todos los conceptos por su número de partida (01-001, 01.01-001…)?')) return;
        var dos = function (n) { return ('0' + n).slice(-2); };
        arbolCc(calcularPU()).partidas.forEach(function (p) {
            var poner = function (lista, prefijo) {
                var n = 0;
                lista.forEach(function (x) { if (x.c) x.c.clave = prefijo + '-' + pad3(++n); });
            };
            poner(p.conceptos, dos(p.numero));
            p.subs.forEach(function (s, i) { poner(s.conceptos, dos(p.numero) + '.' + dos(i + 1)); });
        });
        marcarCambio();
        renderCc();
    });

    // Cambia el nombre de una partida (o subpartida) en todos sus conceptos
    function renombrarGrupo(anterior, nivel, nombre) {
        var a = partesPartida(anterior);
        nombre = txt(nombre).replace(/\//g, '-');
        analisis.conceptos.forEach(function (c) {
            var x = partesPartida(c.partida);
            if (clave(x.p) !== clave(a.p)) return;
            if (nivel === 'p') c.partida = unirPartida(nombre, x.s);
            else if (clave(x.s) === clave(a.s)) c.partida = unirPartida(x.p, nombre);
        });
        ccPartidaSel = nivel === 'p' ? nombre : unirPartida(a.p, nombre);
    }

    // Mueve una partida completa (con sus subpartidas) antes o después de la vecina
    function moverPartida(nombre, d) {
        var orden = [], grupos = {};
        analisis.conceptos.forEach(function (c) {
            var k = clave(partesPartida(c.partida).p);
            if (!grupos[k]) { grupos[k] = []; orden.push(k); }
            grupos[k].push(c);
        });
        var i = orden.indexOf(clave(nombre)), j = i + d;
        if (i < 0 || j < 0 || j >= orden.length) return false;
        orden[i] = orden[j];
        orden[j] = clave(nombre);
        analisis.conceptos = [].concat.apply([], orden.map(function (k) { return grupos[k]; }));
        return true;
    }
    // Mueve un concepto dentro de su partida
    function moverConcepto(c, d) {
        var l = analisis.conceptos, k = clavePartida(c.partida), i = l.indexOf(c), j = i + d;
        while (j >= 0 && j < l.length && clavePartida(l[j].partida) !== k) j += d;
        if (j < 0 || j >= l.length) return false;
        l[i] = l[j];
        l[j] = c;
        return true;
    }

    $('ccCuerpo').addEventListener('focusin', function (e) {
        var tr = e.target.closest('tr');
        if (!tr) return;
        $('ccCuerpo').querySelectorAll('tr.actual').forEach(function (t) { t.classList.remove('actual'); });
        tr.classList.add('actual');
        if (tr.dataset.partida !== undefined) ccPartidaSel = tr.dataset.partida;
        else if (tr.dataset.uid) ccPartidaSel = conceptoPU(tr.dataset.uid).partida;
    });
    $('ccCuerpo').addEventListener('input', function (e) {
        var campo = e.target.dataset.cc, tr = e.target.closest('tr[data-uid]');
        if (!campo || !tr) return;
        var c = conceptoPU(tr.dataset.uid);
        // El precio fijo no baja de un centavo: en cero el concepto dejaría de ser de precio fijo
        if (campo === 'descripcion') partirDescripcion(c, e.target.value);
        else c[campo] = campo === 'cantidad' ? Math.max(0, num(e.target.value)) : campo === 'venta' ? Math.max(0.01, num(e.target.value)) : e.target.value;
        marcarCambio();
        if (campo === 'descripcion') ajustarEspec(e.target);
        if (campo === 'cantidad' || campo === 'venta') { calcularTotales(); pintarCc(); }
    });
    $('ccCuerpo').addEventListener('change', function (e) {
        var tr = e.target.closest('tr');
        if (!tr) return;
        if (e.target.dataset.ccGrupo) {
            renombrarGrupo(tr.dataset.partida, e.target.dataset.ccGrupo, e.target.value);
            marcarCambio();
            renderCc();
            return;
        }
        if (!tr.dataset.uid) return;
        if (e.target.dataset.cc === 'cantidad' && num(e.target.value) < 0) e.target.value = 0;
        var c = conceptoPU(tr.dataset.uid);
        if (e.target.dataset.cc === 'descripcion' && ofrecerBiblioteca(c)) {
            marcarCambio();
            calcularTotales();
            renderCc();
        }
    });
    // Lleva al renglón de Materia Prima, Mano de Obra o Gastos de Operacion y lo resalta
    function irARenglon(sec, id) {
        document.querySelector('.sec-tab[data-sec="' + sec + '"]').click();
        tbody.querySelectorAll('tr[data-i]').forEach(function (tr) {
            if (datos[sec][tr.dataset.i].id !== id) return;
            tr.classList.add('ir-resaltado');
            setTimeout(function () { tr.classList.remove('ir-resaltado'); }, 2500);
            tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
    }
    // Doble clic en un concepto (como en Neodata): abre su análisis, la matriz con sus insumos (en uno de precio fijo es
    // informativa). Uno capturado por importe no tiene análisis: lleva a su renglón en Materia Prima, Mano de Obra o Gastos
    $('ccCuerpo').addEventListener('dblclick', function (e) {
        if (e.target.closest('button')) return;
        var tr = e.target.closest('tr[data-uid], tr[data-ir-sec]');
        if (!tr) return;
        if (tr.dataset.irSec) irARenglon(tr.dataset.irSec, num(tr.dataset.irId));
        else abrirAnalisis(conceptoDeFila(tr));
    });
    $('ccCuerpo').addEventListener('click', function (e) {
        var b = e.target.closest('[data-cc-accion]');
        if (!b) return;
        var acc = b.dataset.ccAccion, tr = b.closest('tr');
        if (acc === 'analizar-importe') { analizarImporte(b.dataset.sec, b.dataset.id); return; }
        if (acc === 'analizar') { abrirAnalisis(conceptoPU(tr.dataset.uid)); return; }
        if (soloLectura) { avisoSoloLectura(); return; }
        if (acc === 'agregar') { agregarConceptoCc(tr.dataset.partida); return; }
        if (acc === 'subir-partida' || acc === 'bajar-partida') {
            if (!moverPartida(tr.dataset.partida, acc === 'subir-partida' ? -1 : 1)) return;
        } else if (acc === 'quitar-grupo') {
            var g = partesPartida(tr.dataset.partida), sub = tr.classList.contains('cc-sub');
            var quitar = analisis.conceptos.filter(function (c) {
                var x = partesPartida(c.partida);
                return clave(x.p) === clave(g.p) && (!sub || clave(x.s) === clave(g.s));
            });
            if (!confirm('¿Quitar la ' + (sub ? 'subpartida' : 'partida') + ' «' + (tr.dataset.partida || 'Sin partida') + '» con sus ' +
                         quitar.length + ' conceptos y su análisis?')) return;
            analisis.conceptos = analisis.conceptos.filter(function (c) { return quitar.indexOf(c) < 0; });
            ccPartidaSel = null;
        } else {
            var c = conceptoPU(tr.dataset.uid);
            if (acc === 'subir' || acc === 'bajar') {
                if (!moverConcepto(c, acc === 'subir' ? -1 : 1)) return;
            } else if (acc === 'duplicar') {
                analisis.conceptos.splice(analisis.conceptos.indexOf(c) + 1, 0, nuevoConcepto({ partida: c.partida, descripcion: c.descripcion + ' (copia)',
                    unidad: c.unidad, cantidad: c.cantidad, especificacion: c.especificacion, venta: c.venta, insumos: c.insumos }));
            } else if (acc === 'quitar') {
                if (!confirm('¿Quitar el concepto «' + (c.descripcion || c.clave) + '» con su análisis?')) return;
                analisis.conceptos.splice(analisis.conceptos.indexOf(c), 1);
            }
        }
        marcarCambio();
        calcularTotales();
        renderCc();
    });

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

    // ---------- Cálculo de un Gasto de Operación (botón ƒx del renglón) ----------
    var GASTO_POR = { unidad: 'unidad', hora: 'hora', jornada: 'jornada' };
    var gastoFila = null;
    function descripcionGasto(g) {
        if (!g) return '';
        return g.base === 'pct_mo' ? num(g.pct) + ' % de la mano de obra'
             : cant(num(g.cantidad)) + ' ' + (txt(g.unidad) || GASTO_POR[g.base]) + ' × $' + fmt(num(g.costo));
    }
    function abrirGasto(i) {
        gastoFila = datos.go[i];
        var g = gastoFila.gasto || {};
        $('goConcepto').textContent = gastoFila.concepto || '(sin concepto)';
        $('goBase').value = g.base || '';
        $('goCantidad').value = g.cantidad || '';
        $('goUnidad').value = g.unidad || '';
        $('goCosto').value = g.costo || '';
        $('goPct').value = g.pct || '';
        ['goBase', 'goCantidad', 'goUnidad', 'goCosto', 'goPct', 'goAplicar'].forEach(function (id) { $(id).disabled = soloLectura; });
        pintarGasto();
        $('goDialogo').showModal();
    }
    function gastoCapturado() {
        var b = $('goBase').value;
        if (!b) return null;
        return b === 'pct_mo' ? { base: b, pct: num($('goPct').value) }
             : { base: b, cantidad: num($('goCantidad').value), unidad: txt($('goUnidad').value), costo: num($('goCosto').value) };
    }
    function pintarGasto() {
        var g = gastoCapturado(), b = g ? g.base : '', mo = baseManoObra();
        $('goDialogo').querySelectorAll('[data-go]').forEach(function (el) { el.hidden = !b || (el.dataset.go === 'pct') !== (b === 'pct_mo'); });
        $('goPor').textContent = txt($('goUnidad').value) || GASTO_POR[b] || 'unidad';
        $('goBaseMo').textContent = '$' + fmt(mo);
        var imp = g ? CALC.gastoOperacion(g, mo) : null;
        $('goImporte').textContent = imp === null ? 'se captura en la pestaña ($' + fmt(num(gastoFila.presupuesto)) + ')' : '$' + fmt(imp);
    }
    ['goCantidad', 'goUnidad', 'goCosto', 'goPct'].forEach(function (id) { $(id).addEventListener('input', pintarGasto); });
    $('goBase').addEventListener('change', function () {
        // Por hora o jornada: su unidad si aún no tiene
        if (!txt($('goUnidad').value) && (this.value === 'hora' || this.value === 'jornada')) $('goUnidad').value = this.value === 'hora' ? 'hr' : 'jornal';
        pintarGasto();
    });
    $('goAplicar').addEventListener('click', function () {
        if (soloLectura || !gastoFila) return;
        var g = gastoCapturado();
        if (g) gastoFila.gasto = g; else delete gastoFila.gasto;
        marcarCambio();
        $('goDialogo').close();
        render();
    });
    document.querySelectorAll('[data-go-cerrar]').forEach(function (b) { b.addEventListener('click', function () { $('goDialogo').close(); }); });

    function renderExtras() {
        $('extrasMO').hidden = seccion !== 'mo';
        if (seccion === 'mo') pintarManoObraPU();
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
    // Utilidad visible en Análisis P.U.: es la misma del presupuesto
    $('puUtilVis').addEventListener('input', function () {
        $('pctUtilidad').value = this.value;
        $('pctUtilidad').dispatchEvent(new Event('input'));
    });
    $('puModoVis').addEventListener('change', function () {
        $('modoUtilidad').value = this.value;
        $('modoUtilidad').dispatchEvent(new Event('change'));
    });
    $('modoUtilidad').addEventListener('change', function () {
        ponerModoUtilidad(this.value);
        marcarCambio();
        refrescarCalculados();
    });
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
        aplicarBarra();
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
        document.querySelectorAll('.encabezado input, .encabezado select, #descripcion, #pctUtilidad, #modoUtilidad, #ivaTasa, #tSUB, #buscarHubspot, #puPanel input')
            .forEach(function (el) { el.disabled = soloLectura; });
        $('modo').hidden = !soloLectura;
        var b = document.querySelector('.tb[data-accion="modificar"]');
        if (b) b.classList.toggle('activo', !soloLectura && !!presupuestoId);
        aplicarBarra();
        render();
    }

    // En solo lectura los botones que cambian el presupuesto se deshabilitan hasta presionar «Modificar».
    // Se quedan los que solo consultan (Imprimir, Duplicar, Bitácora, Cerrar, Tour) y los que se usan en un
    // estatus que ya no se puede modificar: Registrar Obra de un Aceptado (o abrir su obra) y Eliminar un Cancelado.
    function aplicarBarra() {
        var est = $('estatus').textContent.trim().toUpperCase();
        var bloqueo = {
            'guardar': true, 'guardar-cerrar': true, 'prueba': true, 'estatus': true, 'cancelar': true,
            'registrar-obra': !obraId && est !== 'ACEPTADO',
            'eliminar': est !== 'CANCELADO'
        };
        Object.keys(bloqueo).forEach(function (a) {
            var b = document.querySelector('.tb[data-accion="' + a + '"]');
            if (!b) return;
            if (b.dataset.titulo === undefined) b.dataset.titulo = b.title;
            b.disabled = soloLectura && bloqueo[a];
            b.title = b.disabled ? 'Presiona «Modificar» para habilitarlo' : (b.dataset.titulo || '');
        });
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
    var autorizaModificar = null;   // { usuario, contrasena } de quien autorizó «Modificar» (se revisa otra vez al guardar)
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
                    tipo_docto: r.tipo_docto || '',
                    notas: r.notas || '',
                    articulos: r.articulos || [],
                    gasto: r.gasto || null
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
            autoriza: presupuestoId ? autorizaModificar : null,
            analisis_pu: exportarAnalisis(),
            utilidad_por: num($('pctUtilidad').value),
            modo_utilidad: modoUtilidad(),
            iva_pct: Math.round(IVA * 100000) / 1000,
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
        var util = num($('pctUtilidad').value), maxUtil = modoUtilidad() === 'margen' ? 100 : 1000.0001;
        if (util < 0 || util >= maxUtil) {
            alert(modoUtilidad() === 'margen' ? 'Con utilidad de margen, la Utilidad Neta debe ser de 0 a 99.99 %.' : 'La Utilidad Neta debe ser de 0 a 1000 %.');
            $('pctUtilidad').focus();
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
            // Ids que la base dio a los conceptos del Análisis P.U. (uid de la pantalla → id)
            analisis.conceptos.forEach(function (c) { if (j.conceptos_pu && j.conceptos_pu[c.uid]) c.id = +j.conceptos_pu[c.uid]; });
            $('folio').value = j.folio;
            cambios = false;
            autorizaModificar = null;
            // Ya guardado vuelve a solo lectura: para otro cambio se presiona «Modificar»
            soloLectura = true;
            aplicarModo();
            if (nuevo && !enPestana && history.replaceState) history.replaceState(null, '', 'presupuesto.php?id=' + j.id);
            if (enPestana) window.parent.postMessage({ tipo: 'guardado', id: j.id, folio: j.folio }, location.origin);
            if (j.avisos && j.avisos.length) alert(j.avisos.join('\n'));
            if (j.hubspot) sincronizarHubSpot();
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

    // guarda_o_actualiza_sugerido_hs (Form46): ya guardado, crea o actualiza el negocio en HubSpot con el formato impreso
    // adjunto (en el escritorio era un PDF; aquí el mismo formato de «Imprimir» como página HTML)
    var cssFormato = null;
    function formatoParaHubSpot() {
        var css = cssFormato ? Promise.resolve(cssFormato) : fetch('css/formato-presupuesto.css').then(function (r) { return r.ok ? r.text() : ''; })
            .catch(function () { return ''; }).then(function (t) { cssFormato = t; return t; });
        return css.then(function (t) {
            prepararImpresion('normal');
            impresionLista = false;
            var cont = $('formatoImpresion').cloneNode(true);
            cont.querySelectorAll('img').forEach(function (img) { img.setAttribute('src', img.src); });   // rutas completas
            return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Presupuesto de Obra ' + escapar($('folio').value) +
                '</title><style>' + t + '</style></head><body>' + cont.innerHTML + '</body></html>';
        });
    }
    function sincronizarHubSpot() {
        return formatoParaHubSpot().then(function (html) {
            return pedirPresupuestos('hubspot', { id: presupuestoId, email: $('email').value.trim(), formato_html: html });
        }).then(function (j) {
            if (j.id_hs) ponerNegocio(String(j.id_hs), hs.urlNegocio);
            if (j.avisos && j.avisos.length) alert(j.avisos.join('\n'));
            else notificarHubSpot('Negocio ' + j.id_hs + ' actualizado en HubSpot.');
        }).catch(function (err) {
            alert('El presupuesto se guardó, pero no se pudo actualizar HubSpot: ' + err.message);
        });
    }
    function notificarHubSpot(texto) {
        var t = document.createElement('div');
        t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;padding:8px 16px;' +
            'border-radius:6px;background:#1f7a3a;color:#fff;font-weight:600;box-shadow:0 4px 14px rgba(0,0,0,.25)';
        t.setAttribute('role', 'status');
        t.textContent = texto;
        document.body.appendChild(t);
        setTimeout(function () { t.remove(); }, 3000);
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
            iva_pct: Math.round(IVA * 100000) / 1000,
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
    var impresionLista = false, atencionCatalogo = '';
    // modo: normal · detalle · pu (catálogo con precios unitarios) · pu-detalle (con el análisis de cada concepto)
    //       propuesta (para el cliente: especificación técnica, P.U. e importes, sin costos internos)
    function esModoPU(modo) { return modo === 'pu' || modo === 'pu-detalle' || modo === 'propuesta'; }
    function prepararImpresion(modo) {
        if (modo === 'analisis') {
            // Análisis de Cancelería: el resumen del Catálogo de Conceptos en el formato de la hoja de Excel
            var r = filasResumenCc();
            $('formatoImpresion').innerHTML = FormatoAnalisis({
                folio: $('folio').value, fecha: $('fecha').value, cliente: $('cliente').value,
                proyecto: $('proyecto').value, ubicacion: $('ubicacion').value, tc: TC_USD,
                subtotal: r.subtotal, iva: r.iva, total: r.total, letra: r.letra, filas: r.filas
            }, window.ACRI_MEMBRETE || {});
            impresionLista = true;
            return;
        }
        if (modo === 'catalogo') {
            // Catálogo de Conceptos en el formato del PDF PRESUPUESTO DE OBRA: los conceptos en el orden del catálogo
            var a = arbolCc(calcularPU()), conceptos = [];
            var poner = function (lista) {
                lista.forEach(function (x) {
                    conceptos.push({ clave: x.clave, descripcion: x.descripcion, especificacion: x.c ? x.c.especificacion : '',
                                     unidad: x.unidad, cantidad: x.cantidad, pu: x.pu, importe: x.importe });
                });
            };
            a.partidas.forEach(function (p) { poner(p.conceptos); p.subs.forEach(function (s) { poner(s.conceptos); }); });
            $('formatoImpresion').innerHTML = FormatoCatalogo({
                fecha: $('fecha').value, cotizacion: $('proyecto').value, empresa: $('cliente').value, atencion: atencionCatalogo,
                obra: txt($('obraNombre').value) || $('proyecto').value, lugar: $('ubicacion').value,
                iva_pct: Math.round(IVA * 100000) / 1000, subtotal: a.total, letra: importeConLetra(a.total * (1 + IVA)), conceptos: conceptos
            }, window.ACRI_MEMBRETE || {});
            impresionLista = true;
            return;
        }
        var doc = documentoImpresion(), pu = esModoPU(modo);
        if (pu) {
            var x = documentoPU(modo === 'pu-detalle');
            doc.subtotal = x.subtotal;
            doc.catalogo = x.catalogo;
            doc.propuesta = modo === 'propuesta';
            doc.titulo = { pu: 'PRESUPUESTO POR PRECIOS UNITARIOS', 'pu-detalle': 'ANÁLISIS DE PRECIOS UNITARIOS', propuesta: 'PROPUESTA ECONÓMICA' }[modo];
        }
        $('formatoImpresion').innerHTML = FormatoPresupuesto(doc, window.ACRI_MEMBRETE || {}, modo === 'detalle' || modo === 'pu-detalle');
        impresionLista = true;
    }
    document.querySelectorAll('[data-imprimir]').forEach(function (b) {
        b.addEventListener('click', function () {
            var modo = b.dataset.imprimir;
            if (modo === 'catalogo') {
                if (!arbolCc(calcularPU()).partidas.length) { alert('El Catálogo de Conceptos está vacío: no hay nada que imprimir.'); return; }
                // «En atención a» no es un campo del presupuesto: se pregunta y se recuerda en este equipo por folio
                var llave = 'acri-atencion-' + ($('folio').value || 0), previo = '';
                try { previo = localStorage.getItem(llave) || ''; } catch (e) { /* sin almacenamiento */ }
                var r = prompt('En atención a (persona que recibe la cotización):', previo);
                if (r === null) return;
                atencionCatalogo = r.trim();
                try { localStorage.setItem(llave, atencionCatalogo); } catch (e) { /* sin almacenamiento */ }
            }
            if (esModoPU(modo)) {
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
            'Lo analizado pasa solo a Materia Prima (un renglón por material y equipo) y a Mano de Obra (un renglón por mano de obra).']);
        guia.push(['Catálogo de Conceptos', 'Las partidas «PRUEBA Cancelería» y «PRUEBA Acabados» con sus conceptos',
            'Son los mismos conceptos del Análisis P.U., acomodados por partida como Neodata: clave, unidad, cantidad, P.U., importe, % de cada partida y el total con letra. ' +
            'Los Conceptos/Tareas (fechas, responsable, avance) se siguen generando con MP / MO / GO y se manejan en la Obra.']);
        guia.push(['Utilidad Neta', num($('pctUtilidad').value) + ' % ' + (modoUtilidad() === 'costo' ? 'sobre el costo' : 'de margen'),
            'El % por omisión es el parámetro de costos 101 de AW-Management (parametros_costos_sug). Con «+ % sobre el costo»: Subtotal = Costo + %. ' +
            'Con «% de margen (Form46)»: Subtotal = Costo ÷ (1 − %).']);
        guia.push(['Totales', 'Costo Primo, Gastos, Utilidad, Subtotal, IVA y Total',
            'Se calculan solos: MP + MO = Costo Primo; + Gastos de Operacion + Utilidad = Subtotal; + IVA (' + Math.round(IVA * 100000) / 1000 + ' %) = Total.']);
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
                    pedirPresupuestos('autorizar', { autoriza: a }).then(function () { autorizaModificar = a; habilitar(); })
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
        'bitacora': verBitacora,
        'fasar': abrirFasar,
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
                    tipo_docto: String(c.tipo_docto || '').trim(),
                    notas: c.notas || '',
                    articulos: c.articulos || [],
                    gasto: c.calculo_base ? { base: String(c.calculo_base).trim(), cantidad: num(c.calculo_cantidad), unidad: c.calculo_unidad || '',
                                              costo: num(c.calculo_costo), pct: num(c.calculo_pct) } : null
                });
            });
            // Forma de la utilidad con la que se guardó; en los guardados antes de esa columna, la que reproduce su subtotal
            var costoG = suma(datos.mp) + suma(datos.mo) + suma(datos.go), uG = num(p.utilidad_neta_por) / 100, sG = num(p.subtotal);
            ponerIva(p.iva_pct != null && p.iva_pct !== '' ? p.iva_pct : 16);
            ponerModoUtilidad(p.utilidad_modo === 'margen' || p.utilidad_modo === 'costo' ? p.utilidad_modo
                : uG > 0 && uG < 1 && Math.abs(sG - costoG / (1 - uG)) < Math.abs(sG - costoG * (1 + uG)) ? 'margen' : 'costo');
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

    // Tasa de IVA: se elige por presupuesto; una guardada que ya no está en la lista se conserva como opción
    function ponerIva(pct) {
        pct = Number(pct);
        var sel = $('ivaTasa');
        if (sel && !Array.prototype.some.call(sel.options, function (o) { return Number(o.value) === pct; })) {
            sel.insertAdjacentHTML('beforeend', '<option value="' + pct + '">IVA ' + pct + ' %</option>');
        }
        if (sel) sel.value = String(Array.prototype.filter.call(sel.options, function (o) { return Number(o.value) === pct; })[0].value);
        IVA = pct / 100;
        $('pctIvaTxt').textContent = pct;
    }
    if ($('ivaTasa')) $('ivaTasa').addEventListener('change', function () {
        IVA = Number(this.value) / 100;
        $('pctIvaTxt').textContent = Number(this.value);
        marcarCambio();
        refrescarCalculados();
    });

    // Presupuesto nuevo: los indirectos configurados en Administrador › Parámetros de presupuesto
    function ponerIndirectos() {
        (PARAMETROS.indirectos || []).forEach(function (nombre) {
            if (!datos.go.some(function (r) { return clave(r.concepto) === clave(nombre); })) {
                datos.go.push({ id: ++consecutivo, concepto: nombre, presupuesto: 0, importar: false, folio: '' });
            }
        });
    }

    // Versiones congeladas del presupuesto (api/obras.php?accion=versiones)
    var botonVersiones = document.querySelector('[data-versiones]');
    if (botonVersiones) botonVersiones.addEventListener('click', function () {
        if (!presupuestoId) { alert('Las versiones existen cuando el presupuesto guardado se acepta o se registra su obra.'); return; }
        var tb = $('verLista');
        tb.innerHTML = '<tr><td colspan="7">Consultando…</td></tr>';
        $('verDialogo').showModal();
        fetch('api/obras.php?accion=versiones&id=' + presupuestoId).then(function (r) { return r.json(); }).then(function (j) {
            if (!j.ok) throw new Error(j.error);
            var motivos = { aceptado: 'Aceptado', obra: 'Registro de obra', manual: 'Manual' };
            tb.innerHTML = j.versiones.length ? j.versiones.map(function (v) {
                return '<tr><td>' + v.version + '</td><td>' + escapar(motivos[v.motivo] || v.motivo) + (v.obra_id ? ' (obra ' + escapar(v.obra_id) + ')' : '') + '</td>' +
                    '<td>' + escapar(String(v.fecha).slice(0, 16).replace('T', ' ')) + '</td><td>' + escapar(v.usuario || '') + '</td>' +
                    '<td class="num">' + fmt(num(v.total)) + '</td><td>' + (v.integra ? '✔ Sí' : '⚠ NO') + '</td>' +
                    '<td><a href="api/obras.php?accion=version&id=' + presupuestoId + '&v=' + v.version + '">Descargar</a></td></tr>';
            }).join('') : '<tr><td colspan="7">' + (j.sin_tabla ? 'Falta aplicar la migración 006 en la base.' : 'Este presupuesto aún no tiene versiones.') + '</td></tr>';
        }).catch(function (err) { tb.innerHTML = '<tr><td colspan="7">⚠ ' + escapar(err.message) + '</td></tr>'; });
    });
    document.querySelectorAll('[data-ver-cerrar]').forEach(function (b) { b.addEventListener('click', function () { $('verDialogo').close(); }); });

    // Bitácora de cambios (api/obras.php?accion=bitacora_presupuesto): solo consulta, nadie la puede cambiar
    function verBitacora() {
        if (!presupuestoId) { alert('La bitácora existe cuando el presupuesto ya está guardado.'); return; }
        var tb = $('bitLista');
        tb.innerHTML = '<tr><td colspan="4">Consultando…</td></tr>';
        $('bitTotal').textContent = '';
        $('bitDialogo').showModal();
        fetch('api/obras.php?accion=bitacora_presupuesto&id=' + presupuestoId).then(function (r) { return r.json(); }).then(function (j) {
            if (!j.ok) throw new Error(j.error);
            $('bitTotal').textContent = '$' + fmt(num(j.total));
            var dondes = { web: '🌐 Sistema web', base: '🗄 Directo en la base' };
            tb.innerHTML = j.movimientos.length ? j.movimientos.map(function (m) {
                var f = String(m.fecha);   // AAAA-MM-DD HH:MM:SS → DD/MM/AAAA HH:MM
                return '<tr><td>' + escapar(f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4) + ' ' + f.slice(11, 16)) + '</td>' +
                    '<td>' + escapar(m.usuario || '—') + '</td><td>' + escapar(dondes[m.donde] || '—') + '</td>' +
                    '<td>' + escapar(m.movimiento) + '</td></tr>';
            }).join('') : '<tr><td colspan="4">' + (j.sin_tabla ? 'Falta aplicar la migración 001 (auditoría) en la base.' : 'Este presupuesto aún no tiene movimientos.') + '</td></tr>';
        }).catch(function (err) { tb.innerHTML = '<tr><td colspan="4">⚠ ' + escapar(err.message) + '</td></tr>'; });
    }
    document.querySelectorAll('[data-bit-cerrar]').forEach(function (b) { b.addEventListener('click', function () { $('bitDialogo').close(); }); });

    // Triángulo del encabezado: lo oculta o lo muestra, como la cinta de Excel (se recuerda en este navegador)
    (function () {
        var enc = document.querySelector('.encabezado'), btn = $('encPlegar'), llave = 'acri.presupuesto.encPlegado';
        function poner(plegado) {
            enc.classList.toggle('plegado', plegado);
            btn.title = plegado ? 'Mostrar el encabezado' : 'Ocultar el encabezado';
            btn.setAttribute('aria-expanded', plegado ? 'false' : 'true');
        }
        try { poner(localStorage.getItem(llave) === '1'); } catch (e) { /* sin almacenamiento */ }
        btn.addEventListener('click', function () {
            var plegado = !enc.classList.contains('plegado');
            poner(plegado);
            try { localStorage.setItem(llave, plegado ? '1' : '0'); } catch (e) { /* sin almacenamiento */ }
        });
        // El Tour señala los campos del encabezado: se muestra para recorrerlo
        if ($('btnTour')) $('btnTour').addEventListener('click', function () { poner(false); });
    })();

    var idInicial = parseInt(document.body.dataset.presupuesto, 10) || 0;
    if (!idInicial) ponerIndirectos();
    render();
    if (idInicial) {
        // Bloqueado desde el inicio para que no se capture nada mientras carga
        soloLectura = true;
        aplicarModo();
        cargarPresupuesto(idInicial);
    }
})();
