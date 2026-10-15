// Catalogos › Importar insumos (api/importar-insumos.php)
(function () {
    var $ = function (id) { return document.getElementById(id); };
    var token = document.querySelector('meta[name="acri-token"]').content;
    var CAMPOS = [
        ['clave', 'Clave', /^(clave|c[oó]digo|cve|id)/i],
        ['descripcion', 'Descripción', /^(descrip|nombre|concepto|insumo)/i],
        ['tipo', 'Tipo', /^(tipo|clase|categor)/i],
        ['unidad', 'Unidad', /^(unidad|u\.?m|um)/i],
        ['familia', 'Familia', /^(familia|grupo|famil|l[ií]nea)/i],
        ['precio', 'Precio (sin IVA)', /^(precio|costo|importe|p\.?u)/i],
        ['moneda', 'Moneda', /^(moneda|divisa)/i]
    ];
    var tabla = [], encabezado = [], filasEnviar = [];

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function aviso(texto, tipo) { var a = $('aviso'); a.textContent = texto || ''; a.className = 'aviso ' + (tipo || ''); a.hidden = !texto; }
    function paso(n) {
        [1, 2, 3, 4].forEach(function (i) { $('paso' + i).hidden = i !== n; });
        document.querySelectorAll('.pasos span').forEach(function (s) { s.classList.toggle('activo', +s.dataset.paso === n); });
        aviso('');
    }
    function pedir(accion, cuerpo) {
        return fetch('api/importar-insumos.php?accion=' + accion, {
            method: 'POST', headers: { 'X-Acri-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo)
        }).then(function (r) {
            if (r.status === 401) { (window.top || window).location.href = 'index.php'; throw new Error('Sesión expirada'); }
            return r.json().catch(function () { throw new Error('Respuesta no válida del servidor (HTTP ' + r.status + ').'); });
        }).then(function (j) { if (!j.ok) throw new Error(j.error); return j; });
    }

    // Texto de Excel (tabuladores) o CSV (coma o punto y coma, con comillas)
    function separar(texto) {
        var lineas = texto.replace(/\r\n?/g, '\n').split('\n').filter(function (l) { return l.trim() !== ''; });
        if (!lineas.length) return [];
        var sep = lineas[0].indexOf('\t') >= 0 ? '\t' : (lineas[0].split(';').length > lineas[0].split(',').length ? ';' : ',');
        return lineas.map(function (l) {
            if (sep === '\t') return l.split('\t').map(function (x) { return x.trim(); });
            var out = [], actual = '', comillas = false;
            for (var i = 0; i < l.length; i++) {
                var ch = l[i];
                if (ch === '"') { if (comillas && l[i + 1] === '"') { actual += '"'; i++; } else comillas = !comillas; }
                else if (ch === sep && !comillas) { out.push(actual.trim()); actual = ''; }
                else actual += ch;
            }
            out.push(actual.trim());
            return out;
        });
    }

    $('archivo').addEventListener('change', function () {
        var f = this.files[0];
        if (!f) return;
        var lector = new FileReader();
        lector.onload = function () { $('pegar').value = lector.result; };
        lector.readAsText(f, 'UTF-8');
    });

    $('leer').addEventListener('click', function () {
        var datos = separar($('pegar').value);
        if (!datos.length) { aviso('Pega los renglones o elige un archivo.', 'error'); return; }
        var conEnc = $('encabezados').checked;
        var columnas = Math.max.apply(null, datos.map(function (r) { return r.length; }));
        encabezado = conEnc ? datos[0] : datos[0].map(function (_, i) { return 'Columna ' + (i + 1); });
        tabla = conEnc ? datos.slice(1) : datos;
        if (!tabla.length) { aviso('Solo hay encabezados: faltan los renglones.', 'error'); return; }
        $('leidos').textContent = tabla.length + ' renglones y ' + columnas + ' columnas. Elige qué columna trae cada dato (se proponen por el encabezado).';
        var ops = '<option value="">— No viene —</option>' + Array.apply(null, Array(columnas)).map(function (_, i) {
            return '<option value="' + i + '">' + esc(encabezado[i] || 'Columna ' + (i + 1)) + '</option>';
        }).join('');
        $('mapa').innerHTML = CAMPOS.map(function (c) {
            return '<label class="campo"><span>' + esc(c[1]) + '</span><select data-campo="' + c[0] + '">' + ops + '</select></label>';
        }).join('');
        CAMPOS.forEach(function (c) {
            var i = encabezado.findIndex(function (h) { return c[2].test(String(h).trim()); });
            if (i >= 0) document.querySelector('[data-campo="' + c[0] + '"]').value = String(i);
        });
        $('opDesde').value = new Date().toISOString().slice(0, 10);
        if (document.body.dataset.precios !== '1') { $('opPrecios').checked = false; $('opPrecios').disabled = true; }
        paso(2);
    });

    function opciones() {
        return { actualizar: $('opActualizar').checked, crear_unidades: $('opUnidades').checked, precios: $('opPrecios').checked, vigente_desde: $('opDesde').value };
    }

    $('validar').addEventListener('click', function () {
        var mapa = {};
        document.querySelectorAll('#mapa [data-campo]').forEach(function (s) { if (s.value !== '') mapa[s.dataset.campo] = +s.value; });
        var falta = ['clave', 'descripcion', 'tipo', 'unidad'].filter(function (k) { return !(k in mapa); });
        if (falta.length) { aviso('Indica la columna de: ' + falta.join(', ') + '.', 'error'); return; }
        filasEnviar = tabla.map(function (r) {
            var f = {};
            Object.keys(mapa).forEach(function (k) { f[k] = r[mapa[k]] == null ? '' : r[mapa[k]]; });
            return f;
        });
        $('validar').disabled = true;
        pedir('validar', { filas: filasEnviar, opciones: opciones() }).then(function (j) {
            var s = j.resumen;
            $('resumen').innerHTML = '<b>' + s.nuevos + ' nuevos</b><b>' + s.actualizar + ' a actualizar</b><b>' + s.sin_cambios + ' sin cambios</b><b>' +
                s.precios + ' precios a registrar</b>' + (s.errores ? '<b style="color:#fca5a5">' + s.errores + ' con errores</b>' : '') +
                (s.unidades_nuevas.length ? '<br>Unidades nuevas: ' + esc(s.unidades_nuevas.join(', ')) : '');
            var nombres = { nuevo: 'Nuevo', actualizar: 'Actualizar', sin_cambios: 'Sin cambios', error: 'Error' };
            $('revision').innerHTML = j.filas.map(function (r) {
                return '<tr class="' + r.accion + '"><td>' + r.n + '</td><td><span class="etiqueta">' + nombres[r.accion] + '</span></td><td>' + esc(r.clave) +
                    '</td><td>' + esc(r.descripcion) + '</td><td>' + esc(r.tipo || '') + '</td><td>' + esc(r.unidad) + '</td><td>' + esc(r.familia) +
                    '</td><td class="num">' + (r.precio == null ? '' : esc(Number(r.precio).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) + ' ' + r.moneda)) +
                    (r.registrar_precio ? ' ✔' : '') + '</td><td>' + r.errores.map(function (e) { return '<small class="error-fila">' + esc(e) + '</small>'; }).join('') +
                    r.avisos.map(function (a) { return '<small class="aviso-fila">' + esc(a) + '</small>'; }).join('') + '</td></tr>';
            }).join('');
            $('importar').disabled = s.errores > 0 || (s.nuevos + s.actualizar + s.precios) === 0;
            $('importar').title = s.errores ? 'Corrige en el archivo los renglones con error y vuelve a cargarlo' : '';
            paso(3);
            if (s.errores) aviso('Hay ' + s.errores + ' renglones con error: corrígelos en el archivo (o quítalos) y vuelve a cargarlo. No se importa nada mientras haya errores.', 'error');
        }).catch(function (err) { aviso(err.message, 'error'); }).then(function () { $('validar').disabled = false; });
    });

    $('importar').addEventListener('click', function () {
        if (!confirm('¿Importar? Se guarda todo junto: si algo falla no se importa nada.')) return;
        $('importar').disabled = true;
        pedir('importar', { filas: filasEnviar, opciones: opciones() }).then(function (j) {
            var s = j.resumen;
            $('resultado').innerHTML = '<b>' + s.nuevos + ' insumos nuevos</b><b>' + s.actualizar + ' actualizados</b><b>' + s.precios + ' precios registrados</b>' +
                (s.unidades_nuevas.length ? '<b>' + s.unidades_nuevas.length + ' unidades nuevas</b>' : '') +
                '<br>Revísalos en Catalogos › Insumos. Los básicos importados necesitan sus componentes en la ficha.';
            paso(4);
        }).catch(function (err) { aviso(err.message, 'error'); $('importar').disabled = false; });
    });

    $('volver1').addEventListener('click', function () { paso(1); });
    $('volver2').addEventListener('click', function () { paso(2); });
    $('otra').addEventListener('click', function () { $('pegar').value = ''; $('archivo').value = ''; paso(1); });
})();
