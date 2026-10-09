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
        if (seccion === 'ct') { renderCt(); return; }
        var filas = datos[seccion];
        if (!filas.length) {
            tbody.innerHTML = '<tr class="vacio-fila"><td colspan="10">Sin conceptos. Presiona Ctrl + I para agregar uno.</td></tr>';
            calcularTotales();
            return;
        }
        tbody.innerHTML = filas.map(function (r, i) {
            return '<tr data-i="' + i + '">' +
                '<td class="sel-col"></td>' +
                '<td class="id">' + r.id + '</td>' +
                '<td>' + campoConcepto(r.concepto) + '</td>' +
                '<td><input type="number" step="0.01" class="num" data-campo="presupuesto" value="' + (r.presupuesto || '') + '"></td>' +
                '<td class="ro" data-calc="subtotal"></td>' +
                '<td class="ro" data-calc="total"></td>' +
                '<td class="ro" data-calc="pct"></td>' +
                '<td class="chk"><input type="checkbox" data-campo="importar"' + (r.importar ? ' checked' : '') + '></td>' +
                '<td><input type="text" data-campo="folio" value="' + escapar(r.folio) + '"></td>' +
                '<td><button class="borrar" title="Quitar concepto">✕</button></td>' +
                '</tr>';
        }).join('');
        refrescarCalculados();
    }

    // Lista desplegable con el catálogo de la sección; sin catálogo, texto libre.
    // Un concepto dado de baja (o que ya no está en el catálogo) se conserva en los presupuestos que lo usan.
    function campoConcepto(actual) {
        var lista = CATALOGO[seccion] || [];
        if (!lista.length) return '<input type="text" data-campo="concepto" value="' + escapar(actual) + '">';
        var hay = false;
        var opciones = lista.map(function (c) {
            var es = c.nombre.trim().toUpperCase() === String(actual || '').trim().toUpperCase();
            if (es) hay = true;
            if (!c.activo && !es) return '';
            return '<option' + (es ? ' selected' : '') + '>' + escapar(c.nombre) + '</option>';
        }).join('');
        if (actual && !hay) opciones = '<option selected>' + escapar(actual) + '</option>' + opciones;
        return '<select data-campo="concepto"><option value=""' + (actual ? '' : ' selected') + '>— Selecciona —</option>' + opciones + '</select>';
    }

    function escapar(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function refrescarCalculados() {
        var filas = datos[seccion];
        var subtotal = calcularTotales();
        tbody.querySelectorAll('tr[data-i]').forEach(function (tr) {
            var r = filas[tr.dataset.i];
            var imp = num(r.presupuesto);
            tr.querySelector('[data-calc="subtotal"]').textContent = fmt(imp);
            tr.querySelector('[data-calc="total"]').textContent = fmt(imp);
            // Igual que Form46: % del concepto respecto al subtotal del presupuesto
            tr.querySelector('[data-calc="pct"]').textContent = subtotal > 0 ? fmt(imp / subtotal * 100) + ' %' : '0.00 %';
        });
    }

    function agregarConcepto() {
        if (seccion === 'ct') { if (!$('ctDialogo').open) abrirDialogo(null); return; }
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
        if (campo === 'presupuesto') refrescarCalculados();
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

    // ---------- Conceptos/Tareas (catálogo generado con lo capturado en MP / MO / GO) ----------
    var SIGLAS = { mp: 'MP', mo: 'MO', go: 'GO' };
    var COLOR_BASE = '#a7d7c5';
    var tareas = [];        // { uid, origen ('mp:3' o null si es manual), tipo, nombre, clave, agrupador, fechas, padre, monto, ... }
    var excluidos = {};     // conceptos que el usuario quitó de la lista (Importar Conceptos los regresa)
    var uidTarea = 0, consecutivoTarea = 0;
    var vistaCt = 'lista';
    var editando = null, padreNuevo = null;
    var avisoDescripciones = '';   // Microsip no respondió: las partidas usan la descripción redactada
    var CAMPOS = {
        tipo: 'ctTipo', nombre: 'ctNombre', agrupador: 'ctAgrupador', responsable: 'ctResponsable',
        iniReal: 'ctIniReal', finReal: 'ctFinReal', iniCli: 'ctIniCli', finCli: 'ctFinCli',
        jornada: 'ctJornada', empleados: 'ctEmpleados', color: 'ctColor',
        cantidad: 'ctCantidad', unidad: 'ctUnidad', descripcion: 'ctDescripcion'
    };
    // Campos que se generan en automático; si el usuario los cambia ya no se sobrescriben
    var AUTOMATICOS = ['nombre', 'cantidad', 'unidad', 'descripcion'];

    function mesFolio() {
        var f = $('fecha').value;
        return f ? f.substr(5, 2) : ('0' + (new Date().getMonth() + 1)).slice(-2);
    }
    function pad3(n) { return ('00' + n).slice(-3); }
    function claveManual() { return 'TA-' + mesFolio() + '-' + pad3(++consecutivoTarea); }
    function buscarTarea(uid) { return tareas.filter(function (t) { return t.uid === +uid; })[0]; }

    function nuevaTarea(campos) {
        var t = {
            uid: ++uidTarea, origen: null, tipo: 'Tarea', nombre: '', clave: '', agrupador: '',
            responsable: '', iniReal: '', finReal: '', iniCli: '', finCli: '', jornada: '', empleados: '',
            cantidad: '', unidad: '', descripcion: '', manual: {},
            color: COLOR_BASE, padre: null, monto: 0
        };
        Object.keys(campos || {}).forEach(function (k) { t[k] = campos[k]; });
        return t;
    }

    function cantTxt(n) { return String(Math.round(num(n) * 100) / 100); }

    // ----- Descripciones automáticas -----
    var NOTA_ALCANCE = 'Nota: no se consideran trabajos de albañilería, carpintería, herrería u otro ajeno a la obra.';

    function txt(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
    // "HERRAJES" → "herrajes" (los nombres del catálogo vienen en mayúsculas)
    function minus(s) { s = txt(s); return s === s.toUpperCase() ? s.toLowerCase() : s; }
    function punto(s) { s = txt(s); return s && !/[.!?:]$/.test(s) ? s + '.' : s; }
    function cantUnidad(c, u) { return cantTxt(c) + ' ' + (txt(u) || 'Pieza'); }

    // "para la obra «Torre Norte», ubicada en Monterrey, N.L."
    function enLaObra() {
        var proyecto = txt($('proyecto').value), ubicacion = txt($('ubicacion').value);
        return (proyecto ? ' para la obra «' + proyecto + '»' : ' para la obra') + (ubicacion ? ', ubicada en ' + ubicacion : '');
    }

    // Partida de la cotización importada: su descripción extensa viene de Microsip;
    // si no tiene, se redacta con el artículo, la cantidad y el documento.
    function descripcionArticulo(a, folio) {
        if (txt(a.descripcion_larga)) return String(a.descripcion_larga).trim();
        return 'Suministro de ' + minus(a.nom_articulo) + (txt(a.clave_articulo) ? ' (clave ' + txt(a.clave_articulo) + ')' : '') +
            ', ' + cantUnidad(a.unidades, a.unid_medida) + enLaObra() +
            (folio || a.folio ? ', conforme al documento ' + txt(folio || a.folio) : '') + '. ' +
            'El costo incluye cargo directo por el costo de los materiales que intervengan en su elaboración, fletes, ' +
            'maniobras de carga y descarga, limpieza gruesa y todo lo necesario para su correcta ejecución. ' + NOTA_ALCANCE;
    }

    // Descripción, cantidad y unidad de un concepto de MP / MO / GO: se redacta con el concepto,
    // la obra, sus notas y las partidas del documento importado.
    function detalleAuto(sec, r, nombre) {
        var arts = r.articulos || [];
        var obra = enLaObra();
        var doc = r.folio ? ', conforme al documento ' + txt(r.folio) : '';
        var importe = num(r.presupuesto) ? ' Importe presupuestado: $' + fmt(num(r.presupuesto)) + '.' : '';
        var partes = [];

        if (sec === 'mp') {
            partes.push('Suministro de ' + minus(nombre) + obra + doc + '. Comprende la adquisición, habilitado y entrega en obra ' +
                'de los materiales de este concepto, en las cantidades, medidas y especificaciones del proyecto.');
        } else if (sec === 'mo') {
            partes.push('Mano de obra especializada de ' + minus(nombre) + obra + doc + '. Realizada por personal calificado con ' +
                'herramienta y equipo de seguridad; incluye trazo, nivelación, fijación, ajuste y sellado de los elementos, ' +
                'pruebas de funcionamiento, limpieza gruesa del área de trabajo y retiro de sobrantes al terminar.');
        } else {
            partes.push('Gastos de operación por concepto de ' + minus(nombre) + obra + doc + ', necesarios para la correcta ' +
                'ejecución de los trabajos y considerados como cargo indirecto del presupuesto.');
        }
        if (txt(r.notas)) partes.push(punto(r.notas));
        if (arts.length) {
            partes.push('Partidas incluidas:\n' + arts.map(function (a) {
                var d = txt(a.descripcion_larga) || minus(a.nom_articulo);
                return '• ' + cantUnidad(a.unidades, a.unid_medida) + ' — ' + (txt(a.clave_articulo) ? txt(a.clave_articulo) + ': ' : '') +
                    (d.length > 160 ? d.substr(0, 157).replace(/\s+\S*$/, '') + '…' : d);
            }).join('\n'));
        }
        if (sec !== 'go') {
            partes.push('El costo incluye cargo directo por el costo de los materiales que intervengan en su elaboración, fletes, ' +
                'maniobras de carga y descarga, limpieza gruesa y todo lo necesario para su correcta ejecución.' + importe + ' ' + NOTA_ALCANCE);
        } else if (importe) {
            partes.push(importe.trim());
        }

        var cantidad = 1, unidad = sec === 'mo' ? 'Servicio' : 'Lote';
        var unidades = arts.map(function (a) { return txt(a.unid_medida); });
        if (arts.length && unidades.every(function (u) { return u && u === unidades[0]; })) {
            cantidad = arts.reduce(function (s, a) { return s + num(a.unidades); }, 0);
            unidad = unidades[0];
        }
        return { nombre: nombre, descripcion: partes.join('\n\n'), cantidad: cantTxt(cantidad), unidad: unidad };
    }

    // Tareas, subtareas e hitos capturados a mano: si se dejan vacíos se llenan con su contexto
    function completarManual(t) {
        var padre = t.padre ? buscarTarea(t.padre) : null;
        if (!t.cantidad) t.cantidad = '1';
        if (!t.unidad) t.unidad = t.tipo === 'Hito' ? 'Hito' : 'Servicio';
        if (!t.descripcion) {
            var obra = enLaObra();
            t.descripcion = t.tipo === 'Hito'
                ? 'Hito de control: ' + minus(t.nombre) + obra + '. Marca el cumplimiento de esta etapa' +
                  (padre ? ' dentro de «' + padre.nombre + '»' : '') + ' y sirve de referencia para el seguimiento del programa de obra.'
                : 'Ejecución de ' + minus(t.nombre) + obra + (padre ? ', como parte de «' + padre.nombre + '»' : '') + '. ' +
                  'Incluye la coordinación con el responsable' + (t.responsable ? ' (' + t.responsable + ')' : '') +
                  ', el personal asignado, la herramienta y el equipo necesarios, así como la limpieza del área al terminar, ' +
                  'para dejar el trabajo completo y en condiciones de recepción. ' + NOTA_ALCANCE;
        }
    }

    // Cada partida importada (H4, H-5…) es una subtarea de su concepto, como en el sistema anterior
    function sincronizarPartidas(sec, r, padre, vivos) {
        (r.articulos || []).forEach(function (a, i) {
            var origen = sec + ':' + r.id + ':' + i;
            vivos[origen] = true;
            if (excluidos[origen]) return;
            var t = tareas.filter(function (x) { return x.origen === origen; })[0];
            if (!t) {
                t = nuevaTarea({ origen: origen, tipo: 'Tarea', padre: padre.uid, clave: padre.clave + '.' + (i + 1),
                                 agrupador: padre.agrupador, color: padre.color });
                tareas.push(t);
            }
            var auto = {
                nombre: txt(a.clave_articulo) || txt(a.nom_articulo),
                descripcion: descripcionArticulo(a, r.folio),
                cantidad: cantTxt(a.unidades),
                unidad: txt(a.unid_medida) || 'Pieza'
            };
            AUTOMATICOS.forEach(function (k) { if (!t.manual[k]) t[k] = auto[k]; });
            t.monto = num(a.precio_total);
        });
    }

    // Cada concepto con nombre en MP / MO / GO tiene su Concepto/Tarea; las fechas,
    // responsable, etc. que se le capturen se conservan al volver a sincronizar.
    function sincronizarTareas(restaurar) {
        if (restaurar) excluidos = {};
        var vivos = {}, nuevos = 0;
        ['mp', 'mo', 'go'].forEach(function (sec) {
            datos[sec].forEach(function (r) {
                var nombre = String(r.concepto || '').trim();
                if (!nombre) return;
                var origen = sec + ':' + r.id;
                vivos[origen] = true;
                if (excluidos[origen]) return;
                var t = tareas.filter(function (x) { return x.origen === origen; })[0];
                if (!t) {
                    t = nuevaTarea({ origen: origen, tipo: 'Concepto', clave: SIGLAS[sec] + '-' + mesFolio() + '-' + pad3(r.id), agrupador: NOMBRES[sec] });
                    tareas.push(t);
                    nuevos++;
                }
                var auto = detalleAuto(sec, r, nombre);
                AUTOMATICOS.forEach(function (k) { if (!t.manual[k]) t[k] = auto[k]; });
                t.monto = num(r.presupuesto);
                sincronizarPartidas(sec, r, t, vivos);
            });
        });
        // El concepto se borró (o se vació) en su sección: se quita con sus subtareas
        tareas.filter(function (t) { return t.origen && !vivos[t.origen]; }).forEach(quitarTarea);
        return nuevos;
    }

    function quitarTarea(t) {
        tareas.filter(function (x) { return x.padre === t.uid; }).forEach(quitarTarea);
        var i = tareas.indexOf(t);
        if (i >= 0) tareas.splice(i, 1);
    }

    // Lista en orden de árbol con su numeración (1, 1.1, 2…)
    function arbol(padre, prefijo, nivel, salida) {
        tareas.filter(function (t) { return t.padre === padre; }).forEach(function (t, i) {
            var n = prefijo + (i + 1);
            salida.push({ t: t, n: n, nivel: nivel });
            arbol(t.uid, n + '.', nivel + 1, salida);
        });
        return salida;
    }

    function fechaTxt(v) {
        return v ? v.substr(8, 2) + '/' + v.substr(5, 2) + '/' + v.substr(0, 4) + ' ' + v.substr(11, 5) : '';
    }

    function duracion(a, b) {
        if (!a || !b) return '';
        var min = (new Date(b) - new Date(a)) / 60000;
        if (min < 0) return 'Fin anterior al inicio';
        var d = Math.floor(min / 1440), h = Math.floor(min % 1440 / 60), m = Math.round(min % 60);
        return [d ? d + (d > 1 ? ' días' : ' día') : '', h ? h + ' h' : '', m ? m + ' min' : ''].filter(Boolean).join(' ') || '0 min';
    }

    function renderCt() {
        sincronizarTareas();
        var sinFechas = tareas.filter(function (t) { return !t.iniReal || !t.finReal; }).length;
        $('ctResumen').textContent = tareas.length
            ? tareas.length + ' concepto(s)/tarea(s)' + (sinFechas ? ' · ' + sinFechas + ' sin fechas' : '')
            : '';
        if (avisoDescripciones) $('ctResumen').textContent += ' · ⚠ ' + avisoDescripciones;
        $('ctLista').hidden = vistaCt !== 'lista';
        $('ctGantt').hidden = vistaCt !== 'gantt';
        if (vistaCt === 'lista') renderLista(); else renderGantt();
    }

    function renderLista() {
        var filas = arbol(null, '', 0, []);
        if (!filas.length) {
            $('ctLista').innerHTML = '<p class="ct-vacio">Aún no hay conceptos. Captura conceptos en Materia Prima, Mano de Obra o Gastos de Operacion ' +
                'y aparecerán aquí en automático, o usa “Agregar Concepto/Tarea”.</p>';
            return;
        }
        $('ctLista').innerHTML = filas.map(function (f) {
            var t = f.t;
            var fechas = t.iniReal && t.finReal
                ? fechaTxt(t.iniReal) + ' → ' + fechaTxt(t.finReal)
                : '<em>Sin fechas</em>';
            return '<div class="ct-fila" data-uid="' + t.uid + '">' +
                '<span class="ct-orden" style="padding-left:' + (f.nivel * 22) + 'px">' +
                    '<button type="button" data-ct-acc="subir" title="Subir">↑</button>' +
                    '<button type="button" data-ct-acc="bajar" title="Bajar">↓</button>' +
                    '<b>' + f.n + '</b></span>' +
                '<span class="ct-color" style="background:' + escapar(t.color) + '"></span>' +
                '<span class="ct-nombre" title="' + escapar(t.tipo) + '">' + escapar(t.nombre) + ' <small>' + escapar(t.clave) + '</small></span>' +
                '<span class="ct-info" title="' + escapar(t.descripcion) + '">' + (t.cantidad ? escapar(t.cantidad + ' ' + t.unidad) + ' · ' : '') +
                    escapar(t.agrupador) + (t.monto ? ' · $' + fmt(t.monto) : '') + '</span>' +
                '<span class="ct-fechas">' + fechas + '</span>' +
                '<span class="ct-acciones">' +
                    '<button type="button" class="b-ver" data-ct-acc="ver" title="Ver">👁</button>' +
                    '<button type="button" class="b-sub" data-ct-acc="sub" title="Agregar subtarea">+</button>' +
                    '<button type="button" class="b-edit" data-ct-acc="editar" title="Modificar">✎</button>' +
                    '<button type="button" class="b-dup" data-ct-acc="duplicar" title="Duplicar">⧉</button>' +
                    '<button type="button" class="b-adj" data-ct-acc="adjuntar" title="Adjuntar Archivos">📂' +
                        (adjConteo[t.clave] ? '<b>' + adjConteo[t.clave] + '</b>' : '') + '</button>' +
                    '<button type="button" class="b-del" data-ct-acc="eliminar" title="Quitar">🗑</button>' +
                '</span></div>';
        }).join('');
    }

    function renderGantt() {
        var filas = arbol(null, '', 0, []);
        var con = filas.filter(function (f) { return f.t.iniReal && f.t.finReal; });
        if (!con.length) {
            $('ctGantt').innerHTML = '<p class="ct-vacio">' + (filas.length
                ? 'Captura las fechas de Inicio y Fin (Real) de los conceptos/tareas para ver el diagrama de Gantt.'
                : 'Aún no hay conceptos/tareas.') + '</p>';
            return;
        }
        var ini = Math.min.apply(null, con.map(function (f) { return +new Date(f.t.iniReal); }));
        var fin = Math.max.apply(null, con.map(function (f) { return +new Date(f.t.finReal); }));
        var d0 = new Date(ini); d0.setHours(0, 0, 0, 0);
        var d1 = new Date(fin); d1.setHours(24, 0, 0, 0);
        var total = d1 - d0;
        var dias = Math.round(total / 864e5);
        var paso = dias > 120 ? 30 : dias > 45 ? 7 : 1;
        var pos = function (v) { return (new Date(v) - d0) / total * 100; };

        var marcas = '';
        for (var k = 0; k < dias; k += paso) {
            var f = new Date(d0); f.setDate(d0.getDate() + k);
            marcas += '<span style="left:' + ((f - d0) / total * 100) + '%">' + ('0' + f.getDate()).slice(-2) + '/' + ('0' + (f.getMonth() + 1)).slice(-2) + '</span>';
        }
        var rejilla = 'background-size:' + (100 * paso / dias) + '% 100%';

        $('ctGantt').innerHTML = '<div class="ct-g">' +
            '<div class="ct-g-nom ct-g-cab">Concepto/Tarea</div><div class="ct-g-pista ct-g-cab">' + marcas + '</div>' +
            filas.map(function (f) {
                var t = f.t, barra = '';
                if (t.iniReal && t.finReal) {
                    var izq = pos(t.iniReal), ancho = Math.max(pos(t.finReal) - izq, 0.4);
                    var info = escapar(t.nombre) + ': ' + fechaTxt(t.iniReal) + ' → ' + fechaTxt(t.finReal) + ' (' + duracion(t.iniReal, t.finReal) + ')';
                    barra = t.tipo === 'Hito'
                        ? '<i class="ct-g-hito" style="left:' + izq + '%;background:' + escapar(t.color) + '" title="' + info + '"></i>'
                        : '<i class="ct-g-barra" style="left:' + izq + '%;width:' + ancho + '%;background:' + escapar(t.color) + '" title="' + info + '"></i>';
                    if (t.iniCli && t.finCli) {
                        var ic = pos(t.iniCli);
                        barra += '<i class="ct-g-cli" style="left:' + ic + '%;width:' + Math.max(pos(t.finCli) - ic, 0.4) + '%" title="Cliente: ' +
                            fechaTxt(t.iniCli) + ' → ' + fechaTxt(t.finCli) + '"></i>';
                    }
                } else {
                    barra = '<em class="ct-g-sin">Sin fechas</em>';
                }
                return '<div class="ct-g-nom" style="padding-left:' + (6 + f.nivel * 16) + 'px" title="' + escapar(t.nombre) + '"><b>' + f.n + '</b> ' + escapar(t.nombre) + '</div>' +
                    '<div class="ct-g-pista" style="' + rejilla + '">' + barra + '</div>';
            }).join('') + '</div>' +
            '<p class="ct-g-ley"><i class="ct-g-barra"></i> Real &nbsp; <i class="ct-g-cli"></i> Cliente</p>';
    }

    function mover(t, d) {
        var hermanos = tareas.filter(function (x) { return x.padre === t.padre; });
        var otro = hermanos[hermanos.indexOf(t) + d];
        if (!otro) return;
        var i = tareas.indexOf(t), j = tareas.indexOf(otro);
        tareas[i] = otro;
        tareas[j] = t;
        marcarCambio();
        renderCt();
    }

    function llenarListas() {
        var agr = {}, cat = {};
        ['mp', 'mo', 'go'].forEach(function (s) {
            agr[NOMBRES[s]] = 1;
            datos[s].forEach(function (r) { if (String(r.concepto || '').trim()) cat[r.concepto.trim()] = 1; });
        });
        tareas.forEach(function (t) { if (t.agrupador) agr[t.agrupador] = 1; });
        var opciones = function (o) { return Object.keys(o).map(function (v) { return '<option value="' + escapar(v) + '">'; }).join(''); };
        $('ctAgrupadores').innerHTML = opciones(agr);
        $('ctCatalogo').innerHTML = opciones(cat);
    }

    function refrescarDialogo() {
        $('ctDurReal').value = duracion($('ctIniReal').value, $('ctFinReal').value);
        $('ctDurCli').value = duracion($('ctIniCli').value, $('ctFinCli').value);
        $('ctMuestra').style.background = $('ctColor').value;
    }

    function abrirDialogo(t, soloVer, padre) {
        editando = t || null;
        padreNuevo = padre || null;
        var d = t || { tipo: padre ? 'Tarea' : '', agrupador: padre ? padre.agrupador : '', color: padre ? padre.color : COLOR_BASE };
        $('ctDlgTitulo').textContent = soloVer ? 'Ver Concepto/Tarea'
            : t ? 'Modificar Concepto/Tarea'
            : padre ? 'Agregar Subtarea a “' + padre.nombre + '”'
            : 'Agregar Concepto/Tarea';
        llenarListas();
        Object.keys(CAMPOS).forEach(function (k) { $(CAMPOS[k]).value = d[k] || (k === 'color' ? COLOR_BASE : ''); });
        $('ctMonto').value = t && t.monto ? fmt(t.monto) : '';
        $('ctClave').value = t ? t.clave : '';
        $('ctCampos').disabled = !!soloVer;
        $('ctGuardar').hidden = !!soloVer;
        refrescarDialogo();
        $('ctDialogo').showModal();
        ajustarAlto($('ctDescripcion'));
    }

    // La descripción extensa se muestra completa, sin barra de desplazamiento
    function ajustarAlto(el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight + 2, 360) + 'px';
    }
    $('ctDescripcion').addEventListener('input', function () { ajustarAlto(this); });

    // ---------- Adjuntar archivos a un Concepto/Tarea ----------
    // Los archivos se guardan en el servidor por presupuesto (P<id>); si aún no se guarda, en una carpeta temporal
    var adjCarpeta = (function () {
        var id = parseInt(document.body.dataset.presupuesto, 10) || 0;
        if (id) return 'P' + id;
        var b = new Uint8Array(8);
        (window.crypto || window.msCrypto).getRandomValues(b);
        return 'T' + Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    })();
    var adjConteo = {}, adjTarea = null;

    function adjPedir(params, cuerpo) {
        var url = 'api/adjuntos.php' + (cuerpo ? '' : '?' + params);
        return fetch(url, cuerpo ? { method: 'POST', body: cuerpo } : {}).then(function (r) {
            if (r.status === 401) { (window.top || window).location.href = 'index.php'; throw new Error('Sesión expirada'); }
            return r.json().catch(function () { throw new Error('Respuesta no válida del servidor (HTTP ' + r.status + ').'); });
        }).then(function (j) {
            if (!j.ok) throw new Error(j.error);
            return j;
        });
    }
    function adjForm(accion, extra) {
        var f = new FormData();
        f.append('accion', accion);
        f.append('carpeta', adjCarpeta);
        f.append('tarea', adjTarea.clave);
        Object.keys(extra || {}).forEach(function (k) { f.append(k, extra[k]); });
        return f;
    }
    function adjEstado(texto, error) {
        $('adjEstado').textContent = texto || '';
        $('adjEstado').className = 'adj-estado' + (error ? ' error' : '');
    }
    function tamTxt(b) {
        return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
    }

    function adjPintar(archivos) {
        adjConteo[adjTarea.clave] = archivos.length;
        if (!archivos.length) {
            $('adjLista').innerHTML = '<li class="vacio">Este Concepto/Tarea aún no tiene archivos.</li>';
        } else {
            var base = 'api/adjuntos.php?accion=descargar&carpeta=' + adjCarpeta + '&tarea=' + encodeURIComponent(adjTarea.clave) + '&archivo=';
            $('adjLista').innerHTML = archivos.map(function (a) {
                return '<li><a href="' + base + encodeURIComponent(a.nombre) + '" target="_blank" rel="noopener" title="' + escapar(a.nombre) + '">📄 ' +
                    escapar(a.nombre) + '</a><small>' + tamTxt(a.tamano) + ' · ' + escapar(a.fecha) + '</small>' +
                    '<button type="button" data-adj-quitar="' + escapar(a.nombre) + '" title="Quitar archivo">🗑</button></li>';
            }).join('');
        }
        if (seccion === 'ct') renderCt();
    }

    function abrirAdjuntos(t) {
        adjTarea = t;
        $('adjTitulo').textContent = t.nombre + ' (' + t.clave + ')';
        $('adjLista').innerHTML = '<li class="vacio">Cargando…</li>';
        adjEstado('');
        $('adjDialogo').showModal();
        adjPedir('accion=lista&carpeta=' + adjCarpeta + '&tarea=' + encodeURIComponent(t.clave))
            .then(function (j) { adjPintar(j.archivos); })
            .catch(function (err) { $('adjLista').innerHTML = ''; adjEstado(err.message, true); });
    }

    // En el servidor local los archivos viajan al PHP (accion=subir). En la nube (Vercel) el PHP solo da
    // URLs firmadas: el navegador sube directo a Supabase Storage y luego se confirma (accion=confirmar)
    function adjSubir(lista) {
        if (!lista || !lista.length) return;
        var archivos = Array.prototype.slice.call(lista);
        adjEstado('Subiendo ' + archivos.length + ' archivo(s)…');
        var datos = archivos.map(function (a) { return { nombre: a.name, tamano: a.size }; });
        adjPedir(null, adjForm('preparar', { archivos: JSON.stringify(datos) })).then(function (p) {
            if (!p.directo) {
                var f = adjForm('subir');
                archivos.forEach(function (a) { f.append('archivos[]', a, a.name); });
                return adjPedir(null, f);
            }
            var errores = p.errores.slice();
            return Promise.all(p.subidas.map(function (s) {
                var a = archivos[s.indice];
                return fetch(s.url, { method: 'PUT', headers: { 'Content-Type': a.type || 'application/octet-stream', 'x-upsert': 'false' }, body: a })
                    .then(function (r) {
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return { ruta: s.ruta, nombre: a.name };
                    })
                    .catch(function (err) { errores.push(a.name + ': no se pudo subir (' + err.message + ').'); return null; });
            })).then(function (hechas) {
                hechas = hechas.filter(Boolean);
                var fin = hechas.length
                    ? adjPedir(null, adjForm('confirmar', { archivos: JSON.stringify(hechas) }))
                    : adjPedir('accion=lista&carpeta=' + adjCarpeta + '&tarea=' + encodeURIComponent(adjTarea.clave)).then(function (j) { j.errores = []; return j; });
                return fin.then(function (j) { j.errores = errores.concat(j.errores); return j; });
            });
        }).then(function (j) {
            adjPintar(j.archivos);
            adjEstado(j.errores.length ? 'Algunos archivos no se subieron:\n' + j.errores.join('\n') : 'Archivo(s) adjuntado(s).', j.errores.length > 0);
        }).catch(function (err) { adjEstado(err.message, true); });
        $('adjArchivos').value = '';
    }

    $('adjArchivos').addEventListener('change', function () { adjSubir(this.files); });
    ['dragenter', 'dragover'].forEach(function (ev) {
        $('adjZona').addEventListener(ev, function (e) { e.preventDefault(); this.classList.add('encima'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        $('adjZona').addEventListener(ev, function (e) { e.preventDefault(); this.classList.remove('encima'); });
    });
    $('adjZona').addEventListener('drop', function (e) { adjSubir(e.dataTransfer.files); });
    $('adjLista').addEventListener('click', function (e) {
        var b = e.target.closest('[data-adj-quitar]');
        if (!b || !confirm('¿Quitar el archivo "' + b.dataset.adjQuitar + '"?')) return;
        adjPedir(null, adjForm('quitar', { archivo: b.dataset.adjQuitar }))
            .then(function (j) { adjPintar(j.archivos); adjEstado('Archivo quitado.'); })
            .catch(function (err) { adjEstado(err.message, true); });
    });
    document.querySelectorAll('[data-adj-cerrar]').forEach(function (b) {
        b.addEventListener('click', function () { $('adjDialogo').close(); });
    });
    // Cuántos archivos tiene cada Concepto/Tarea (para el número en el botón)
    if (adjCarpeta.charAt(0) === 'P') {
        adjPedir('accion=conteo&carpeta=' + adjCarpeta).then(function (j) {
            adjConteo = j.conteo || {};
            if (seccion === 'ct') renderCt();
        }).catch(function () {});
    }

    $('ctForm').addEventListener('input', refrescarDialogo);
    $('ctForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var v = {};
        Object.keys(CAMPOS).forEach(function (k) { v[k] = $(CAMPOS[k]).value.trim(); });
        if (v.finReal < v.iniReal || v.finCli < v.iniCli) { alert('La fecha de Fin no puede ser anterior a la de Inicio.'); return; }
        var t = editando;
        if (!t) {
            t = nuevaTarea({ clave: claveManual(), padre: padreNuevo ? padreNuevo.uid : null });
            tareas.push(t);
        }
        // Si se cambia un dato generado, ya no se toma de su sección; si se borra, vuelve a ser automático
        if (t.origen) AUTOMATICOS.forEach(function (k) {
            if (v[k] !== t[k]) t.manual[k] = v[k] !== '';
        });
        Object.keys(v).forEach(function (k) {
            if (!(t.origen && v[k] === '' && AUTOMATICOS.indexOf(k) >= 0)) t[k] = v[k];
        });
        if (!t.origen) completarManual(t);
        marcarCambio();
        $('ctDialogo').close();
        renderCt();
    });
    document.querySelectorAll('[data-ct-cerrar]').forEach(function (b) {
        b.addEventListener('click', function () { $('ctDialogo').close(); });
    });

    $('ctLista').addEventListener('click', function (e) {
        var b = e.target.closest('[data-ct-acc]');
        if (!b) return;
        var t = buscarTarea(b.closest('.ct-fila').dataset.uid);
        switch (b.dataset.ctAcc) {
            case 'subir':  mover(t, -1); break;
            case 'bajar':  mover(t, 1); break;
            case 'ver':    abrirDialogo(t, true); break;
            case 'adjuntar': abrirAdjuntos(t); break;
            case 'editar': abrirDialogo(t); break;
            case 'sub':    abrirDialogo(null, false, t); break;
            case 'duplicar':
                var copia = nuevaTarea({});
                Object.keys(t).forEach(function (k) { if (k !== 'uid') copia[k] = t[k]; });
                copia.origen = null;
                copia.manual = {};
                copia.monto = 0;
                copia.nombre = t.nombre + ' (copia)';
                copia.clave = claveManual();
                tareas.splice(tareas.indexOf(t) + 1, 0, copia);
                marcarCambio();
                renderCt();
                break;
            case 'eliminar':
                if (!confirm('¿Quitar "' + t.nombre + '" de Conceptos/Tareas' + (tareas.some(function (x) { return x.padre === t.uid; }) ? ' junto con sus subtareas' : '') + '?')) return;
                if (t.origen) excluidos[t.origen] = true;
                quitarTarea(t);
                marcarCambio();
                renderCt();
                break;
        }
    });

    document.querySelectorAll('.ct-tab').forEach(function (b) {
        b.addEventListener('click', function () {
            document.querySelectorAll('.ct-tab').forEach(function (x) { x.classList.remove('activo'); });
            b.classList.add('activo');
            vistaCt = b.dataset.ct;
            renderCt();
        });
    });
    $('ctAgregar').addEventListener('click', function () { abrirDialogo(null); });
    $('ctImportar').addEventListener('click', function () {
        var nuevos = sincronizarTareas(true);
        marcarCambio();
        renderCt();
        alert(nuevos ? nuevos + ' concepto(s) importado(s) de Materia Prima, Mano de Obra y Gastos de Operacion.'
                     : 'Todos los conceptos capturados ya están en la lista.');
    });

    // ---------- Totales ----------
    function calcularTotales() {
        var mp = suma(datos.mp), mo = suma(datos.mo), go = suma(datos.go);
        var primo = mp + mo;
        var base = primo + go;
        var utilidad, subtotal;

        // La utilidad es margen sobre el precio de venta, no sobre el costo (Form46):
        // subtotal = costo / ((100 - %util) / 100)
        if (subtotalManual) {
            subtotal = num($('tSUB').value.replace(/,/g, ''));
            utilidad = subtotal - base;
            $('pctUtilidad').value = subtotal ? (100 - base / (subtotal * 0.01)).toFixed(4) : 0;
        } else {
            var pct = num($('pctUtilidad').value);
            subtotal = pct < 100 ? base / ((100 - pct) * 0.01) : base;
            utilidad = subtotal - base;
            $('tSUB').value = fmt(subtotal);
        }
        var iva = subtotal * IVA;

        $('tMP').textContent = fmt(mp);
        $('tMO').textContent = fmt(mo);
        $('tCP').textContent = fmt(primo);
        $('tGO').textContent = fmt(go);
        $('tUT').textContent = fmt(utilidad);
        $('tIVA').textContent = fmt(iva);
        $('tTOT').textContent = fmt(subtotal + iva);
        return subtotal;
    }

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
        if (!id || id === '0') { $('buscarHubspot').click(); return; }
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
    function ponerEstatus(e) {
        pintarEstatus(e);
        marcarCambio();
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

    function pendiente() { alert('Función pendiente: se activará al conectar la base de datos.'); }

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
            if (!j.ok) throw new Error(j.error || 'Error desconocido.');
            return j;
        });
    }

    function documentoActual() {
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
            conceptos: conceptos
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
        guardando = true;
        document.body.classList.add('guardando');
        return pedirPresupuestos('guardar', documentoActual()).then(function (j) {
            var nuevo = !presupuestoId;
            presupuestoId = j.id;
            document.body.dataset.presupuesto = j.id;
            $('folio').value = j.folio;
            cambios = false;
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

    // Menús desplegables (position: fixed bajo su botón, sin salirse de la ventana)
    function cerrarMenus() {
        document.querySelectorAll('.tb-drop').forEach(function (d) { d.classList.remove('abierto'); });
    }
    document.querySelectorAll('.tb-drop > .tb').forEach(function (b) {
        b.addEventListener('click', function (e) {
            e.stopPropagation();
            var drop = b.parentElement;
            var abierto = drop.classList.contains('abierto');
            cerrarMenus();
            if (abierto) return;
            var menu = drop.querySelector('.menu');
            var actual = $('estatus').textContent.trim();
            menu.querySelectorAll('[data-estatus]').forEach(function (o) { o.classList.toggle('actual', o.dataset.estatus === actual); });
            drop.classList.add('abierto');
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
    document.querySelectorAll('[data-imprimir]').forEach(function (b) {
        b.addEventListener('click', function () { window.print(); });
    });

    var acciones = {
        'guardar': function () {
            guardar().then(function (ok) { if (ok) alert('Presupuesto guardado con folio ' + $('folio').value + '.'); });
        },
        'guardar-cerrar': function () {
            // Solo se cierra si se guardó; si falla, lo capturado sigue en pantalla
            guardar().then(function (ok) { if (ok) cerrarVentana(); });
        },
        'modificar': pendiente,
        'duplicar': function () {
            if (!presupuestoId) { alert('Este presupuesto todavía no se ha guardado.'); return; }
            if (cambios && !confirm('Hay cambios sin guardar; la copia los incluirá. ¿Continuar?')) return;
            // La copia se queda en pantalla como presupuesto nuevo hasta que se guarde
            presupuestoId = 0;
            document.body.dataset.presupuesto = 0;
            $('folio').value = 0;
            $('obra').textContent = '';
            pintarEstatus('Pendiente');
            marcarCambio();
            alert('Se creó una copia. Presiona Guardar para asignarle folio.');
        },
        'registrar-obra': function () {
            var nombre = prompt('Nombre de la obra:', $('proyecto').value);
            if (nombre) { $('obra').textContent = nombre; marcarCambio(); }
        },
        'cancelar': function () {
            if (confirm('¿Cancelar este presupuesto?')) ponerEstatus('Cancelado');
        },
        'eliminar': function () {
            if (!presupuestoId) {
                if (confirm('Este presupuesto no se ha guardado. ¿Descartarlo?')) { cambios = false; cerrarVentana(); }
                return;
            }
            if (!confirm('¿Eliminar el presupuesto folio ' + $('folio').value + '? No se puede deshacer.')) return;
            pedirPresupuestos('eliminar', { id: presupuestoId }).then(function () {
                cambios = false;
                cerrarVentana();
            }).catch(function (err) { alert('No se pudo eliminar el presupuesto: ' + err.message); });
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
            $('obra').textContent = p.obra_id ? (p.nom_obra || 'Obra ' + p.obra_id) : '';
            $('descripcion').value = p.notas || '';
            ponerNegocio(p.id_hs && p.id_hs !== '0' ? p.id_hs : '0');
            if (p.estatus) pintarEstatus(String(p.estatus).trim());
            if (p.utilidad_neta_por !== null && p.utilidad_neta_por !== undefined) $('pctUtilidad').value = num(p.utilidad_neta_por);

            avisoDescripciones = p.aviso_descripciones || '';
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
            if (enPestana && p.cliente) {
                window.parent.postMessage({ tipo: 'titulo', texto: 'Presupuesto · ' + p.cliente }, location.origin);
            }
            cambios = false;
            render();
        }).catch(function (err) { alert('No se pudo abrir el presupuesto: ' + err.message); });
    }

    render();
    var idInicial = parseInt(document.body.dataset.presupuesto, 10) || 0;
    if (idInicial) cargarPresupuesto(idInicial);
})();
