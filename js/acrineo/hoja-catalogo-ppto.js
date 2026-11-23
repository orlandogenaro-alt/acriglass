// ACRINEO · Catálogos del presupuesto (Opciones del presupuesto › Catálogos): Catálogo general (F9), Materiales, Mano de
// obra y Maquinaria. Son los insumos que participan en las matrices del presupuesto (el general también trae los
// conceptos). Cambiar un costo o un dato (Enter o salir de la celda) lo guarda en TODAS las matrices donde está el
// insumo y recalcula el presupuesto. «Factor» multiplica o divide el costo de los marcados (o de todos los que se ven).
// Servidor: includes/acrineo/opciones.php (recurso catalogo_ppto · acciones insumo_guardar e insumos_factor).
(function (AN) {
    'use strict';

    var H = AN.hoja;
    var $ = function (id) { return document.getElementById(id); };
    var dlg = $('anCatPptoDlg');
    if (!H || !dlg) return;
    var esc = AN.ui.esc;
    var fmtCant = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
    var fmtNum = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 4 });

    var TITULOS = { general: 'Catálogo general', MAT: 'Materiales', MO: 'Mano de obra', EQ: 'Maquinaria' };
    var BASE = [{ k: 'chk' }, { k: 'p', t: 'P', titulo: 'Participa en el presupuesto' }, { k: 'codigo', t: 'Código' }, { k: 'descripcion', t: 'Descripción completa' }, { k: 'unidad', t: 'Unidad' }];
    var COLUMNAS = {
        general: [{ k: 'chk' }, { k: 'n', t: 'N', titulo: 'Niveles de análisis debajo' }].concat(BASE.slice(1), [
            { k: 'tipo', t: 'Tipo' }, { k: 'costo', t: 'Costo', f: 'dinero', edit: 'costo' }, { k: 'cantidad', t: 'Cant. exp. ins.', f: 'cant' }, { k: 'importe', t: 'Importe', f: 'dinero' }]),
        MAT: BASE.concat([
            { k: 'costo_lab', t: 'Costo LAB', f: 'dinero', edit: 'dato' }, { k: 'fletes', t: 'Fletes', f: 'dinero', edit: 'dato' }, { k: 'maniobra', t: 'Maniobra', f: 'dinero', edit: 'dato' },
            { k: 'almacenaje', t: 'Almacenaje', f: 'dinero', edit: 'dato' }, { k: 'derechos', t: 'Derechos', f: 'dinero', edit: 'dato' }, { k: 'mermas', t: 'Mermas', f: 'dinero', edit: 'dato' },
            { k: 'costo', t: 'Costo', f: 'dinero', edit: 'costo' }, { k: 'cantidad', t: 'Cant. exp. ins.', f: 'cant' }, { k: 'fecha', t: 'Fecha' }]),
        MO: BASE.concat([
            { k: 'salario_base', t: 'Salario base', f: 'dinero', edit: 'dato' }, { k: 'fasar', t: 'FASAR', f: 'num', edit: 'dato', titulo: 'Vacío = el FASAR del presupuesto' },
            { k: 'salario_real', t: 'Salario real', f: 'dinero' }, { k: 'viaticos', t: 'Viáticos', f: 'dinero', edit: 'dato' },
            { k: 'alimentacion', t: 'Alimentación y hospedaje', f: 'dinero', edit: 'dato' }, { k: 'sepelio', t: 'Gastos de sepelio', f: 'dinero', edit: 'dato' },
            { k: 'otras', t: 'Otras prestaciones', f: 'dinero', edit: 'dato' }, { k: 'costo', t: 'Costo total', f: 'dinero', edit: 'costo' }, { k: 'cantidad', t: 'Cant. exp. ins.', f: 'cant' }]),
        EQ: BASE.concat([
            { k: 'costo', t: 'Costo', f: 'dinero', edit: 'costo' }, { k: 'vida_llantas', t: 'Vida económica llantas (h)', f: 'num', edit: 'dato' },
            { k: 'vida_piezas', t: 'Vida económica piezas (h)', f: 'num', edit: 'dato' }, { k: 'potencia', t: 'Potencia', f: 'texto', edit: 'dato' },
            { k: 'cantidad', t: 'Cant. exp. ins.', f: 'cant' }])
    };

    var st = { tipo: 'general', ver: 'todos', datos: null, marcados: new Set(), vistos: [], q: '', guardando: false };

    function estado(t, tipo) { var e = $('anCatPptoEstado'); e.textContent = t || ''; e.className = 'an-estado' + (tipo ? ' ' + tipo : ''); }

    function valor(c, f) {
        if (c.k === 'tipo') return f.clase === 'concepto' ? 'Concepto' : ((st.datos.tipos || {})[f.tipo] || f.tipo);
        if (c.k === 'p') return f.participa;
        if (c.edit === 'dato') return f.datos ? f.datos[c.k] : null;
        if (c.k === 'fasar') return f.fasar_efectivo;
        return f[c.k];
    }
    function texto(c, v) {
        if (v === null || v === undefined || v === '') return '';
        if (c.f === 'dinero') return AN.ui.dinero(v);
        if (c.f === 'cant') return fmtCant.format(Number(v) || 0);
        if (c.f === 'num') return fmtNum.format(Number(v) || 0);
        return String(v);
    }

    function visibles() {
        var d = st.datos, ins = d.insumos, con = d.conceptos || [];
        switch (st.ver) {
            case 'insumos': return ins;
            case 'conceptos': return con;
            case 'basicos': return ins.filter(function (i) { return i.n > 0 || i.tipo === 'BAS'; });
            case 'marcados': return ins.filter(function (i) { return st.marcados.has(i.clave); });
            default: return ins.concat(con);
        }
    }

    function pintar() {
        var cols = COLUMNAS[st.tipo];
        $('anCatPptoCab').innerHTML = '<tr>' + cols.map(function (c) {
            if (c.k === 'chk') return '<th scope="col" class="an-col-chk"><input type="checkbox" id="anCatPptoTodos" aria-label="Marcar todos"></th>';
            return '<th scope="col"' + (c.f && c.f !== 'texto' ? ' class="num"' : '') + (c.titulo ? ' title="' + esc(c.titulo) + '"' : '') + '><div class="an-th"><span>' + esc(c.t) + '</span></div></th>';
        }).join('') + '</tr>';
        st.vistos = visibles();
        var puede = H.puede && st.datos.disponible;
        var html = st.vistos.map(function (f, i) {
            var insumo = f.clase !== 'concepto';
            return '<tr class="an-fila' + (insumo ? '' : ' an-catppto-concepto') + '" data-i="' + i + '">' + cols.map(function (c) {
                if (c.k === 'chk') return '<td class="an-col-chk">' + (insumo ? '<input type="checkbox" data-marca="' + i + '"' + (st.marcados.has(f.clave) ? ' checked' : '') + ' aria-label="Marcar">' : '') + '</td>';
                if (c.k === 'p') return '<td class="an-col-p" title="' + (f.participa ? 'Participa' : 'No participa') + '">' + (f.participa ? '✔' : '✘') + '</td>';
                var v = valor(c, f), num = c.f && c.f !== 'texto';
                if (c.edit && insumo && puede && f.editable) {
                    var crudo = v === null || v === undefined ? '' : (num ? String(Math.round(Number(v) * 1e6) / 1e6) : String(v));
                    return '<td class="' + (num ? 'num ' : '') + 'an-catppto-edit"><input class="an-catppto-in' + (num ? ' num' : '') + '" data-k="' + c.k + '" data-edit="' + c.edit + '" data-i="' + i + '" value="' + esc(crudo) + '"'
                        + (c.k === 'fasar' && !crudo && f.fasar_efectivo ? ' placeholder="' + esc(fmtNum.format(f.fasar_efectivo)) + '"' : '') + ' aria-label="' + esc(c.t) + '"></td>';
                }
                return '<td' + (num ? ' class="num"' : '') + (c.k === 'descripcion' ? ' title="' + esc(v) + '"' : '') + '>' + esc(texto(c, v)) + '</td>';
            }).join('') + '</tr>';
        }).join('');
        if (!html) html = '<tr class="an-vacio"><td colspan="' + cols.length + '">' + (st.datos.insumos.length || (st.datos.conceptos || []).length ? 'Nada que mostrar con este filtro.' : 'Ningún insumo de este tipo participa en las matrices del presupuesto.') + '</td></tr>';
        $('anCatPptoFilas').innerHTML = html;
        var total = st.vistos.reduce(function (s, f) { return s + (f.clase === 'concepto' ? 0 : Number(f.importe) || 0); }, 0);
        $('anCatPptoTotal').textContent = st.vistos.length + ' registro' + (st.vistos.length === 1 ? '' : 's') + (st.marcados.size ? ' · ' + st.marcados.size + ' marcado' + (st.marcados.size === 1 ? '' : 's') : '')
            + (st.tipo !== 'general' || st.ver !== 'conceptos' ? ' · importe de insumos ' + AN.ui.dinero(total) : '');
        var todos = $('anCatPptoTodos');
        var marcables = st.vistos.filter(function (f) { return f.clase !== 'concepto'; });
        if (todos) todos.checked = marcables.length > 0 && marcables.every(function (f) { return st.marcados.has(f.clave); });
    }

    async function cargar() {
        estado('Cargando…', 'info');
        try {
            st.datos = await AN.api.get(H.url({ recurso: 'catalogo_ppto', tipo: st.tipo, q: st.q }));
            var claves = new Set(st.datos.insumos.map(function (i) { return i.clave; }));
            st.marcados.forEach(function (k) { if (!claves.has(k) && !st.q) st.marcados.delete(k); });
            pintar();
            estado(st.datos.disponible ? '' : 'Falta aplicar la migración 037 para guardar cambios en este catálogo.', st.datos.disponible ? '' : 'error');
        } catch (e) { estado(e.message, 'error'); }
    }
    var buscar = AN.ui.retrasar(function () { st.q = $('anCatPptoQ').value.trim(); cargar(); }, 300);

    function abrir(tipo) {
        st.tipo = TITULOS[tipo] ? tipo : 'general';
        st.ver = 'todos';
        st.q = '';
        st.marcados = new Set();
        st.datos = { insumos: [], conceptos: [], tipos: {}, disponible: true };
        $('anCatPptoTitulo').textContent = TITULOS[st.tipo] + ' del presupuesto';
        $('anCatPptoQ').value = '';
        $('anCatPptoVer').hidden = st.tipo !== 'general';
        $('anCatPptoDepurar').hidden = st.tipo !== 'general' || !H.puede;
        $('anCatPptoFactorCaja').hidden = !H.puede;
        marcarVer();
        pintar();
        if (!dlg.open) dlg.showModal();
        $('anCatPptoQ').focus();
        cargar();
    }
    function marcarVer() {
        $('anCatPptoVer').querySelectorAll('[data-ver]').forEach(function (b) {
            var si = b.dataset.ver === st.ver;
            b.setAttribute('aria-pressed', String(si));
            b.classList.toggle('an-primario', si);
        });
    }

    // Guarda una celda (costo o dato del insumo)
    async function guardarCelda(inp) {
        var f = st.vistos[+inp.dataset.i];
        if (!f || st.guardando) return;
        var v = inp.value.trim().replace(/[$,\s]/g, '');
        if (inp.dataset.k === 'potencia') v = inp.value.trim();
        else if (v !== '' && (!isFinite(Number(v)) || Number(v) < 0)) { inp.classList.add('invalido'); estado('Escribe un número de 0 en adelante.', 'error'); return; }
        inp.classList.remove('invalido');
        var cuerpo = { accion: 'insumo_guardar', clave: f.clave, partida_id: H.sel || 0 };
        if (inp.dataset.edit === 'costo') { if (v === '') { pintar(); return; } cuerpo.costo = v; }
        else { cuerpo.datos = {}; cuerpo.datos[inp.dataset.k] = v; }
        st.guardando = true;
        estado('Guardando y recalculando…', 'info');
        var scroll = dlg.querySelector('.an-catppto-cont').scrollTop;
        try {
            var r = await AN.api.post(H.url(), cuerpo);
            H.aplicar(r);
            await cargar();
            dlg.querySelector('.an-catppto-cont').scrollTop = scroll;
            var x = r.insumo || {};
            estado(x.renglones ? 'Costo actualizado en ' + x.renglones + ' renglón(es) de matriz; ' + x.recalculados + ' concepto(s) cambiaron de costo.' : 'Guardado.', 'ok');
        } catch (e) { inp.classList.add('invalido'); estado(e.message, 'error'); }
        finally { st.guardando = false; }
    }

    async function aplicarFactor() {
        var factor = $('anCatPptoFactor').value.trim();
        if (!(Number(factor) > 0)) { $('anCatPptoFactor').classList.add('invalido'); estado('Escribe un factor mayor que cero.', 'error'); return; }
        $('anCatPptoFactor').classList.remove('invalido');
        var claves = st.marcados.size ? Array.from(st.marcados)
            : st.vistos.filter(function (f) { return f.clase !== 'concepto' && f.editable; }).map(function (f) { return f.clave; });
        if (!claves.length) { estado('No hay insumos con costo propio para aplicar el factor.', 'error'); return; }
        var op = $('anCatPptoOperacion').value;
        if (!(await AN.ui.confirmar({ titulo: 'Aplicar factor', mensaje: '¿' + (op === 'dividir' ? 'Dividir' : 'Multiplicar') + ' entre ' + factor + ' el costo de '
            + claves.length + ' insumo(s)' + (st.marcados.size ? ' marcados' : ' que se ven') + '?\nSe cambia en todas las matrices del presupuesto y se recalcula.', aceptar: 'Aplicar' }))) return;
        estado('Aplicando…', 'info');
        try {
            var r = await AN.api.post(H.url(), { accion: 'insumos_factor', claves: claves, factor: factor, operacion: op, partida_id: H.sel || 0 });
            H.aplicar(r);
            await cargar();
            estado('Factor aplicado a ' + r.factor.insumos + ' insumo(s); ' + r.factor.recalculados + ' concepto(s) cambiaron de costo.', 'ok');
        } catch (e) { estado(e.message, 'error'); }
    }

    function exportar() {
        var cols = COLUMNAS[st.tipo].filter(function (c) { return c.k !== 'chk'; });
        var filas = [cols.map(function (c) { return c.t; })].concat(st.vistos.map(function (f) {
            return cols.map(function (c) {
                var v = valor(c, f);
                if (c.k === 'p') return v ? 'Sí' : 'No';
                if (c.f && c.f !== 'texto') return v === null || v === undefined || v === '' ? '' : Number(v);
                return v === null || v === undefined ? '' : String(v);
            });
        }));
        if (filas.length < 2) { AN.ui.aviso('No hay renglones para exportar.', 'error'); return; }
        var nombre = TITULOS[st.tipo] + ' ' + H.ctx.codigo;
        var blob = window.XlsxSimple.crear({ nombre: TITULOS[st.tipo], anchos: cols.map(function (c) { return c.k === 'descripcion' ? 60 : 14; }), filas: filas });
        window.XlsxSimple.descargar(blob, nombre + '.xlsx');
    }

    // ---------- Eventos ----------
    $('anCatPptoQ').addEventListener('input', buscar);
    $('anCatPptoVer').addEventListener('click', function (e) {
        var b = e.target.closest('[data-ver]');
        if (!b) return;
        st.ver = b.dataset.ver;
        marcarVer();
        pintar();
    });
    $('anCatPptoTabla').addEventListener('change', function (e) {
        if (e.target.id === 'anCatPptoTodos') {
            st.vistos.forEach(function (f) { if (f.clase !== 'concepto') { if (e.target.checked) st.marcados.add(f.clave); else st.marcados.delete(f.clave); } });
            pintar();
            return;
        }
        if (e.target.dataset.marca !== undefined) {
            var f = st.vistos[+e.target.dataset.marca];
            if (e.target.checked) st.marcados.add(f.clave); else st.marcados.delete(f.clave);
            pintar();
            return;
        }
        if (e.target.classList.contains('an-catppto-in')) guardarCelda(e.target);
    });
    $('anCatPptoTabla').addEventListener('keydown', function (e) {
        if (!e.target.classList.contains('an-catppto-in')) return;
        if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); pintar(); }
    });
    $('anCatPptoTabla').addEventListener('dblclick', function (e) {
        var tr = e.target.closest('tr[data-i]');
        if (!tr || e.target.closest('input')) return;
        var f = st.vistos[+tr.dataset.i];
        if (f && f.clase === 'concepto' && AN.hojaMatriz && AN.hojaMatriz.abrir) { dlg.close(); AN.hojaMatriz.abrir(f.id); }
    });
    $('anCatPptoAplicar').addEventListener('click', aplicarFactor);
    $('anCatPptoExcel').addEventListener('click', exportar);
    $('anCatPptoDepurar').addEventListener('click', async function () {
        if (AN.hojaProcesos && (await AN.hojaProcesos.depurar())) cargar();
    });
    dlg.querySelectorAll('[data-catppto-cerrar]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });

    AN.hojaCatalogo = { abrir: abrir };
})(window.AcriNeo = window.AcriNeo || {});
