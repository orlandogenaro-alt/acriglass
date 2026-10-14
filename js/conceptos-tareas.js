// Conceptos/Tareas de un presupuesto de obra: lista, Gantt, ventana Ver/Modificar y archivos adjuntos.
// Los usan el presupuesto (js/presupuesto.js) y la obra (js/obra.js) con el marcado de includes/conceptos-tareas.php.
// Se guardan en la tabla conceptos_tareas (api/tareas.php); cada concepto de MP / MO / GO tiene su
// Concepto/Tarea y cada partida importada es una subtarea. Las tareas, subtareas e hitos se agregan a mano.
//
//   var ct = AcriTareas({
//       datos:      function () { return { mp: [...], mo: [...], go: [...] }; },   renglones del presupuesto
//       contexto:   function () { return { proyecto, ubicacion, fecha }; },
//       soloLectura: function () { return bool; },  avisoSoloLectura: function () {},
//       visible:    function () { return bool; },   el panel está a la vista
//       carpeta:    function () { return 'P123'; }, carpeta de los adjuntos (api/adjuntos.php)
//       alCambiar:  function () {}                  se agregó, modificó, movió o quitó algo
//   });
//   ct.render() · ct.cargar(filas) · ct.exportar() · ct.sincronizar(restaurar) · ct.abrirNuevo() · ct.contarAdjuntos()
window.AcriTareas = function (op) {
    var $ = function (id) { return document.getElementById(id); };
    var NOMBRES = { mp: 'Materia Prima', mo: 'Mano de Obra', go: 'Gastos de Operacion' };
    var SIGLAS = { mp: 'MP', mo: 'MO', go: 'GO' };
    var COLOR_BASE = '#a7d7c5';
    var tareas = [];        // { uid, origen ('mp:3' o null si es manual), tipo, nombre, clave, agrupador, fechas, padre, monto, avance, ... }
    var excluidos = {};     // conceptos que el usuario quitó de la lista (Importar Conceptos los regresa)
    var uidTarea = 0, consecutivoTarea = 0;
    var vistaCt = 'lista';
    var editando = null, padreNuevo = null;
    var avisoDescripciones = '';   // Microsip no respondió: las partidas usan la descripción redactada
    var CAMPOS = {
        tipo: 'ctTipo', nombre: 'ctNombre', agrupador: 'ctAgrupador', responsable: 'ctResponsable',
        iniReal: 'ctIniReal', finReal: 'ctFinReal', iniCli: 'ctIniCli', finCli: 'ctFinCli',
        jornada: 'ctJornada', empleados: 'ctEmpleados', color: 'ctColor',
        cantidad: 'ctCantidad', unidad: 'ctUnidad', descripcion: 'ctDescripcion', avance: 'ctAvance'
    };
    // Campos que se generan en automático; si el usuario los cambia ya no se sobrescriben
    var AUTOMATICOS = ['nombre', 'cantidad', 'unidad', 'descripcion'];

    function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
    function fmt(n) { return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function escapar(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
    function cambio() { if (op.alCambiar) op.alCambiar(); }
    function bloqueado() {
        if (!op.soloLectura()) return false;
        if (op.avisoSoloLectura) op.avisoSoloLectura();
        return true;
    }

    function mesFolio() {
        var f = op.contexto().fecha;
        return f ? String(f).substr(5, 2) : ('0' + (new Date().getMonth() + 1)).slice(-2);
    }
    function pad3(n) { return ('00' + n).slice(-3); }
    function claveManual() { return 'TA-' + mesFolio() + '-' + pad3(++consecutivoTarea); }
    function buscarTarea(uid) { return tareas.filter(function (t) { return t.uid === +uid; })[0]; }

    function nuevaTarea(campos) {
        var t = {
            uid: ++uidTarea, origen: null, tipo: 'Tarea', nombre: '', clave: '', agrupador: '',
            responsable: '', iniReal: '', finReal: '', iniCli: '', finCli: '', jornada: '', empleados: '',
            cantidad: '', unidad: '', descripcion: '', manual: {},
            color: COLOR_BASE, padre: null, monto: 0, avance: 0
        };
        Object.keys(campos || {}).forEach(function (k) { t[k] = campos[k]; });
        return t;
    }

    // Estatus de la tarea según su avance y su fecha de fin (base para automatizar el seguimiento)
    function estatusTarea(t) {
        var a = num(t.avance);
        if (a >= 100) return 'Terminada';
        if (t.finReal && new Date(t.finReal) < new Date()) return 'Atrasada';
        return a > 0 ? 'En proceso' : 'Pendiente';
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
        var c = op.contexto(), proyecto = txt(c.proyecto), ubicacion = txt(c.ubicacion);
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
            if (!t.manual.monto) t.monto = num(a.precio_total);
        });
    }

    // Cada concepto con nombre en MP / MO / GO tiene su Concepto/Tarea; las fechas,
    // responsable, etc. que se le capturen se conservan al volver a sincronizar.
    function sincronizarTareas(restaurar) {
        if (restaurar) excluidos = {};
        var datos = op.datos(), vivos = {}, nuevos = 0;
        ['mp', 'mo', 'go'].forEach(function (sec) {
            (datos[sec] || []).forEach(function (r) {
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
                if (!t.manual.monto) t.monto = num(r.presupuesto);
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

    // Avance de un grupo de tareas: promedio ponderado por su costo (si ninguna tiene costo, todas pesan igual).
    // El de una tarea con subtareas es el de sus subtareas si alguna tiene avance; si no, el suyo.
    // (Misma regla que avanceTareas() de includes/tareas.php)
    function avanceDe(lista) {
        if (!lista.length) return 0;
        var conCosto = lista.some(function (t) { return num(t.monto) > 0; });
        var peso = 0, suma = 0;
        lista.forEach(function (t) {
            var p = conCosto ? num(t.monto) : 1;
            peso += p;
            suma += p * avanceTarea(t);
        });
        return peso ? suma / peso : 0;
    }
    function avanceTarea(t) {
        var hijas = tareas.filter(function (x) { return x.padre === t.uid; });
        var conAvance = hijas.some(function (x) { return avanceTarea(x) > 0; });
        return Math.min(100, conAvance ? avanceDe(hijas) : num(t.avance));
    }
    function avanceGeneral() {
        return Math.round(avanceDe(tareas.filter(function (t) { return !t.padre; })));
    }

    function render() {
        sincronizarTareas();
        var sinFechas = tareas.filter(function (t) { return !t.iniReal || !t.finReal; }).length;
        var atrasadas = tareas.filter(function (t) { return estatusTarea({ avance: avanceTarea(t), finReal: t.finReal }) === 'Atrasada'; }).length;
        $('ctResumen').textContent = tareas.length
            ? tareas.length + ' concepto(s)/tarea(s) · avance ' + avanceGeneral() + ' %' +
              (sinFechas ? ' · ' + sinFechas + ' sin fechas' : '') + (atrasadas ? ' · ' + atrasadas + ' atrasada(s)' : '')
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
            var t = f.t, av = Math.round(avanceTarea(t)), est = estatusTarea({ avance: av, finReal: t.finReal });
            var fechas = t.iniReal && t.finReal
                ? fechaTxt(t.iniReal) + ' → ' + fechaTxt(t.finReal)
                : '<em>Sin fechas</em>';
            return '<div class="ct-fila" data-uid="' + t.uid + '" title="Doble clic para ver el Concepto/Tarea">' +
                '<span class="ct-orden" style="padding-left:' + (f.nivel * 22) + 'px">' +
                    '<button type="button" data-ct-acc="subir" title="Subir">↑</button>' +
                    '<button type="button" data-ct-acc="bajar" title="Bajar">↓</button>' +
                    '<b>' + f.n + '</b></span>' +
                '<span class="ct-color" style="background:' + escapar(t.color) + '"></span>' +
                '<span class="ct-nombre" title="' + escapar(t.tipo) + '">' + escapar(t.nombre) + ' <small>' + escapar(t.clave) + '</small></span>' +
                '<span class="ct-info" title="' + escapar(t.descripcion) + '">' + (t.cantidad ? escapar(t.cantidad + ' ' + t.unidad) + ' · ' : '') +
                    escapar(t.agrupador) + (t.monto ? ' · $' + fmt(t.monto) : '') + (t.responsable ? ' · ' + escapar(t.responsable) : '') + '</span>' +
                '<span class="ct-fechas">' + fechas + '</span>' +
                '<span class="ct-avance ct-est-' + est.replace(/ /g, '-') + '" title="' + est + '"><i style="width:' + av + '%"></i><b>' + av + ' %</b></span>' +
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
                    var info = escapar(t.nombre) + ': ' + fechaTxt(t.iniReal) + ' → ' + fechaTxt(t.finReal) + ' (' + duracion(t.iniReal, t.finReal) + ') · avance ' + Math.round(num(t.avance)) + ' %';
                    barra = t.tipo === 'Hito'
                        ? '<i class="ct-g-hito" style="left:' + izq + '%;background:' + escapar(t.color) + '" title="' + info + '"></i>'
                        : '<i class="ct-g-barra" style="left:' + izq + '%;width:' + ancho + '%;background:' + escapar(t.color) + '" title="' + info + '">' +
                          '<i class="ct-g-avance" style="width:' + Math.min(100, num(t.avance)) + '%"></i></i>';
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
            '<p class="ct-g-ley"><i class="ct-g-barra"></i> Real &nbsp; <i class="ct-g-cli"></i> Cliente &nbsp; <i class="ct-g-barra"><i class="ct-g-avance" style="width:100%"></i></i> Avance</p>';
    }

    function mover(t, d) {
        var hermanos = tareas.filter(function (x) { return x.padre === t.padre; });
        var otro = hermanos[hermanos.indexOf(t) + d];
        if (!otro) return;
        var i = tareas.indexOf(t), j = tareas.indexOf(otro);
        tareas[i] = otro;
        tareas[j] = t;
        cambio();
        render();
    }

    function llenarListas() {
        var agr = {}, cat = {}, datos = op.datos();
        ['mp', 'mo', 'go'].forEach(function (s) {
            agr[NOMBRES[s]] = 1;
            (datos[s] || []).forEach(function (r) { if (String(r.concepto || '').trim()) cat[r.concepto.trim()] = 1; });
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
        var t = { avance: $('ctAvance').value, finReal: $('ctFinReal').value };
        $('ctEstatus').value = estatusTarea(t);
    }

    function abrirDialogo(t, soloVer, padre) {
        editando = t || null;
        padreNuevo = padre || null;
        var d = t || { tipo: padre ? 'Tarea' : '', agrupador: padre ? padre.agrupador : '', color: padre ? padre.color : COLOR_BASE, avance: 0 };
        $('ctDlgTitulo').textContent = soloVer ? 'Ver Concepto/Tarea'
            : t ? 'Modificar Concepto/Tarea'
            : padre ? 'Agregar Subtarea a “' + padre.nombre + '”'
            : 'Agregar Concepto/Tarea';
        llenarListas();
        Object.keys(CAMPOS).forEach(function (k) {
            var v = d[k];
            $(CAMPOS[k]).value = v === undefined || v === null || v === '' ? (k === 'color' ? COLOR_BASE : k === 'avance' ? 0 : '') : v;
        });
        $('ctMonto').value = t && t.monto ? fmt(t.monto) : '';
        $('ctClave').value = t ? t.clave : '';
        // En "Ver" se muestran Modificar y Guardar; Guardar se habilita al pulsar Modificar
        $('ctCampos').disabled = !!soloVer;
        $('ctModificar').hidden = !soloVer;
        $('ctModificar').disabled = false;
        $('ctGuardar').disabled = !!soloVer;
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
    // Se guardan por presupuesto (P<id>); si aún no se guarda, en una carpeta temporal
    var adjConteo = {}, adjTarea = null;

    function adjPedir(params, cuerpo) {
        var url = 'api/adjuntos.php' + (cuerpo ? '' : '?' + params);
        var token = (document.querySelector('meta[name="acri-token"]') || {}).content || '';
        return fetch(url, cuerpo ? { method: 'POST', body: cuerpo, headers: { 'X-Acri-Token': token } } : {}).then(function (r) {
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
        f.append('carpeta', op.carpeta());
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
            var base = 'api/adjuntos.php?accion=descargar&carpeta=' + op.carpeta() + '&tarea=' + encodeURIComponent(adjTarea.clave) + '&archivo=';
            $('adjLista').innerHTML = archivos.map(function (a) {
                return '<li><a href="' + base + encodeURIComponent(a.nombre) + '" target="_blank" rel="noopener" title="' + escapar(a.nombre) + '">📄 ' +
                    escapar(a.nombre) + '</a><small>' + tamTxt(a.tamano) + ' · ' + escapar(a.fecha) + '</small>' +
                    '<button type="button" data-adj-quitar="' + escapar(a.nombre) + '" title="Quitar archivo">🗑</button></li>';
            }).join('');
        }
        if (op.visible()) render();
    }

    function abrirAdjuntos(t) {
        adjTarea = t;
        $('adjTitulo').textContent = t.nombre + ' (' + t.clave + ')';
        $('adjLista').innerHTML = '<li class="vacio">Cargando…</li>';
        adjEstado('');
        $('adjDialogo').showModal();
        adjPedir('accion=lista&carpeta=' + op.carpeta() + '&tarea=' + encodeURIComponent(t.clave))
            .then(function (j) { adjPintar(j.archivos); })
            .catch(function (err) { $('adjLista').innerHTML = ''; adjEstado(err.message, true); });
    }

    // En el servidor local los archivos viajan al PHP (accion=subir). En la nube (Vercel) el PHP solo da
    // URLs firmadas: el navegador sube directo a Supabase Storage y luego se confirma (accion=confirmar)
    function adjSubir(lista) {
        if (!lista || !lista.length) return;
        var archivos = Array.prototype.slice.call(lista);
        adjEstado('Subiendo ' + archivos.length + ' archivo(s)…');
        var info = archivos.map(function (a) { return { nombre: a.name, tamano: a.size }; });
        adjPedir(null, adjForm('preparar', { archivos: JSON.stringify(info) })).then(function (p) {
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
                    : adjPedir('accion=lista&carpeta=' + op.carpeta() + '&tarea=' + encodeURIComponent(adjTarea.clave)).then(function (j) { j.errores = []; return j; });
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
    function contarAdjuntos() {
        if (op.carpeta().charAt(0) !== 'P') return;
        adjPedir('accion=conteo&carpeta=' + op.carpeta()).then(function (j) {
            adjConteo = j.conteo || {};
            if (op.visible()) render();
        }).catch(function () {});
    }

    $('ctForm').addEventListener('input', refrescarDialogo);
    $('ctForm').addEventListener('submit', function (e) {
        e.preventDefault();
        if (bloqueado()) return;
        var v = {};
        Object.keys(CAMPOS).forEach(function (k) { v[k] = String($(CAMPOS[k]).value).trim(); });
        if (v.finReal < v.iniReal || v.finCli < v.iniCli) { alert('La fecha de Fin no puede ser anterior a la de Inicio.'); return; }
        v.avance = Math.max(0, Math.min(100, Math.round(num(v.avance))));
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
        // Costo: si se captura a mano ya no se toma de su sección; si se borra, vuelve a ser automático
        var monto = $('ctMonto').value.trim();
        if (monto !== (t.monto ? fmt(t.monto) : '')) {
            if (t.origen) t.manual.monto = monto !== '';
            if (!(t.origen && monto === '')) t.monto = num(monto.replace(/[^\d.-]/g, ''));
        }
        if (!t.origen) completarManual(t);
        cambio();
        $('ctDialogo').close();
        render();
    });
    $('ctModificar').addEventListener('click', function () {
        if (bloqueado()) return;
        $('ctDlgTitulo').textContent = 'Modificar Concepto/Tarea';
        $('ctCampos').disabled = false;
        $('ctGuardar').disabled = false;
        this.disabled = true;
        $('ctNombre').focus();
    });
    document.querySelectorAll('[data-ct-cerrar]').forEach(function (b) {
        b.addEventListener('click', function () { $('ctDialogo').close(); });
    });

    $('ctLista').addEventListener('click', function (e) {
        var b = e.target.closest('[data-ct-acc]');
        if (!b) return;
        var t = buscarTarea(b.closest('.ct-fila').dataset.uid);
        if (b.dataset.ctAcc !== 'ver' && b.dataset.ctAcc !== 'adjuntar' && bloqueado()) return;
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
                copia.avance = 0;
                copia.nombre = t.nombre + ' (copia)';
                copia.clave = claveManual();
                tareas.splice(tareas.indexOf(t) + 1, 0, copia);
                cambio();
                render();
                break;
            case 'eliminar':
                if (!confirm('¿Quitar "' + t.nombre + '" de Conceptos/Tareas' + (tareas.some(function (x) { return x.padre === t.uid; }) ? ' junto con sus subtareas' : '') + '?')) return;
                if (t.origen) excluidos[t.origen] = true;
                quitarTarea(t);
                cambio();
                render();
                break;
        }
    });
    // Doble clic en un renglón: Ver Concepto/Tarea
    $('ctLista').addEventListener('dblclick', function (e) {
        var fila = e.target.closest('.ct-fila');
        if (!fila || e.target.closest('button')) return;
        abrirDialogo(buscarTarea(fila.dataset.uid), true);
    });

    document.querySelectorAll('.ct-tab').forEach(function (b) {
        b.addEventListener('click', function () {
            document.querySelectorAll('.ct-tab').forEach(function (x) { x.classList.remove('activo'); });
            b.classList.add('activo');
            vistaCt = b.dataset.ct;
            render();
        });
    });
    $('ctAgregar').addEventListener('click', function () { if (!bloqueado()) abrirDialogo(null); });
    $('ctImportar').addEventListener('click', function () {
        if (bloqueado()) return;
        var nuevos = sincronizarTareas(true);
        cambio();
        render();
        alert(nuevos ? nuevos + ' concepto(s) importado(s) de Materia Prima, Mano de Obra y Gastos de Operacion.'
                     : 'Todos los conceptos capturados ya están en la lista.');
    });

    // ---------- Guardar / cargar (tabla conceptos_tareas) ----------
    // Renglones para api/tareas.php: las tareas en orden y los conceptos quitados (tipo 'Excluido')
    function exportar() {
        sincronizarTareas();
        var filas = tareas.map(function (t, i) {
            return {
                uid: t.uid, padre_uid: t.padre || null, orden: i + 1, origen: t.origen, tipo: t.tipo, clave: t.clave, nombre: t.nombre,
                agrupador: t.agrupador, descripcion: t.descripcion, cantidad: num(t.cantidad), unidad: t.unidad, monto: num(t.monto),
                ini_real: t.iniReal, fin_real: t.finReal, ini_cli: t.iniCli, fin_cli: t.finCli, jornada: t.jornada,
                responsable: t.responsable, empleados: t.empleados, color: t.color, avance: num(t.avance), estatus: estatusTarea({ avance: avanceTarea(t), finReal: t.finReal }),
                manual: Object.keys(t.manual).filter(function (k) { return t.manual[k]; }).join(',')
            };
        });
        Object.keys(excluidos).forEach(function (o) {
            if (excluidos[o]) filas.push({ uid: ++uidTarea, origen: o, tipo: 'Excluido', nombre: o, orden: filas.length + 1 });
        });
        return { tareas: filas, avance: avanceGeneral() };
    }

    function fechaHora(v) { return v ? String(v).replace(' ', 'T').substr(0, 16) : ''; }

    function cargar(filas) {
        tareas = [];
        excluidos = {};
        uidTarea = 0;
        consecutivoTarea = 0;
        (filas || []).slice().sort(function (a, b) { return num(a.orden) - num(b.orden); }).forEach(function (r) {
            var uid = parseInt(r.uid, 10) || 0;
            uidTarea = Math.max(uidTarea, uid);
            if (r.tipo === 'Excluido') { if (r.origen) excluidos[r.origen] = true; return; }
            var m = /^TA-\d{2}-(\d+)$/.exec(r.clave || '');
            if (m) consecutivoTarea = Math.max(consecutivoTarea, parseInt(m[1], 10));
            var manual = {};
            String(r.manual || '').split(',').filter(Boolean).forEach(function (k) { manual[k] = true; });
            tareas.push({
                uid: uid, origen: r.origen || null, tipo: r.tipo || 'Tarea', nombre: r.nombre || '', clave: r.clave || '',
                agrupador: r.agrupador || '', responsable: r.responsable || '',
                iniReal: fechaHora(r.ini_real), finReal: fechaHora(r.fin_real), iniCli: fechaHora(r.ini_cli), finCli: fechaHora(r.fin_cli),
                jornada: r.jornada || '', empleados: r.empleados || '',
                cantidad: r.cantidad == null ? '' : cantTxt(r.cantidad), unidad: r.unidad || '', descripcion: r.descripcion || '',
                manual: manual, color: r.color || COLOR_BASE, padre: parseInt(r.padre_uid, 10) || null,
                monto: num(r.monto), avance: num(r.avance)
            });
        });
    }

    return {
        render: render,
        cargar: cargar,
        exportar: exportar,
        sincronizar: sincronizarTareas,
        avance: avanceGeneral,
        contarAdjuntos: contarAdjuntos,
        aviso: function (t) { avisoDescripciones = t || ''; },
        abrirNuevo: function () { if (!$('ctDialogo').open && !bloqueado()) abrirDialogo(null); },
        hayTareas: function () { return tareas.length > 0; }
    };
};

// Renglones de MP / MO / GO de un presupuesto (api/obras.php?accion=presupuesto) con el mismo id
// consecutivo que les da el presupuesto al abrirlo: así las claves (MP-10-001…) coinciden
window.AcriTareas.datosDePresupuesto = function (p) {
    var datos = { mp: [], mo: [], go: [] }, consecutivo = 0;
    (p.conceptos || []).forEach(function (c) {
        var sec = String(c.tipo_concepto || '').trim().toLowerCase();
        if (!datos[sec]) return;
        datos[sec].push({
            id: ++consecutivo, concepto: c.concepto || '', presupuesto: parseFloat(c.presupuesto) || 0,
            folio: c.folio || '', notas: c.notas || '', articulos: c.articulos || []
        });
    });
    return datos;
};
