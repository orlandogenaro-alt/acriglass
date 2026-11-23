// Administrador › Usuarios
(function () {
    // Permisos que ya da el rol elegido
    function deRol(cat, rolId) { return (cat.permisos_roles || {})[rolId] || []; }

    // ----- Foto del usuario (api/foto-usuario.php) -----
    var token = document.querySelector('meta[name="acri-token"]').content;
    var archivo = document.createElement('input');
    archivo.type = 'file'; archivo.accept = 'image/png,image/jpeg,image/webp'; archivo.hidden = true;
    document.body.appendChild(archivo);
    var ctxFoto = null, filaFoto = null;

    function enviarFoto(ctx, f, datos) {
        datos.append('usuario', f.login);
        ctx.mensaje('Guardando la foto de ' + f.login + '…', 'info');
        return fetch('api/foto-usuario.php', { method: 'POST', headers: { 'X-Acri-Token': token }, body: datos })
            .then(function (r) { return r.json(); })
            .then(function (r) {
                if (!r.ok) throw new Error(r.error || 'No se pudo guardar la foto.');
                return ctx.pedir('listar');
            })
            .then(function (j) {
                ctx.recibir(j);
                ctx.mensaje((datos.get('accion') === 'quitar' ? 'Se quitó la foto de ' : 'Se guardó la foto de ') + f.login + '.', 'ok');
            })
            .catch(function (e) { ctx.mensaje(e.message, 'error'); });
    }
    function elegirFoto(ctx, f) {
        if (!f) return;
        ctxFoto = ctx; filaFoto = f;
        archivo.click();
    }
    archivo.addEventListener('change', function () {
        var a = archivo.files[0];
        archivo.value = '';
        if (!a || !filaFoto) return;
        if (a.size > 3 * 1024 * 1024) { alert('La foto pesa más de 3 MB.'); return; }
        var datos = new FormData();
        datos.append('accion', 'subir');
        datos.append('archivo', a);
        enviarFoto(ctxFoto, filaFoto, datos);
    });
    // Clic en el círculo de la columna Foto: el catálogo ya seleccionó el renglón; se usa el botón 📷 Foto
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.us-foto')) return;
        var b = document.querySelector('.c-accion[data-accion="foto"]');
        if (b) b.click();
    });
    function circulo(f, h) {
        var ini = h.esc(String(f.login || '?').charAt(0).toUpperCase());
        var estilo = 'display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;' +
                     'overflow:hidden;background:linear-gradient(135deg,#3b82f6,#1c3566);color:#fff;font-weight:800;border:2px solid #fff;cursor:pointer;padding:0';
        return '<button type="button" class="us-foto" title="' + (f.foto ? 'Cambiar foto' : 'Subir foto') + '" style="' + estilo + '">' +
               (f.foto ? '<img src="' + h.esc(f.foto) + '" alt="" style="width:100%;height:100%;object-fit:cover">' : ini) + '</button>';
    }

    Catalogo({
        nombre: function (f) { return String(f.login || f.clave).toUpperCase(); },

        columnas: [
            { id: 'foto', titulo: 'Foto', clase: 'centro', html: circulo, texto: function (f) { return f.foto ? 'con foto' : 'sin foto'; } },
            { id: 'login', titulo: 'Usuario', fija: true, html: function (f, h) { return h.chip(f.login, 'clave'); } },
            { id: 'nombre', titulo: 'Nombre' },
            { id: 'correo', titulo: 'Correo' },
            { id: 'rol', titulo: 'Rol', html: function (f, h) { return f.rol ? h.esc(f.rol) : h.chip('Sin rol', 'falta'); } },
            { id: 'efectivos', titulo: 'Permisos', clase: 'corta',
              titulo_celda: function (f) { return f.efectivos.join(', '); },
              html: function (f, h) {
                  if (f.efectivos.indexOf('ADMIN_USER') >= 0) return h.chip('Administrador', 'token');
                  return f.efectivos.length ? h.esc(f.efectivos.length + ' permiso(s)') + (f.permisos.length ? h.chip('+' + f.permisos.length + ' sueltos') : '')
                                            : h.chip('Ninguno', 'falta');
              },
              texto: function (f) { return f.efectivos.join(' '); } },
            { id: 'estado', titulo: 'Estado', clase: 'centro',
              html: function (f, h) { return f.activa ? h.chip('Activo', 'ok') : h.chip('Baja'); },
              texto: function (f) { return f.activa ? 'activo' : 'baja'; } },
            { id: 'ultimo_acceso', titulo: 'Último acceso', clase: 'centro' },
            { id: 'fecha_creacion', titulo: 'Alta', clase: 'centro' }
        ],

        redibujanCon: ['rol_id'],

        acciones: {
            foto: function (ctx) { elegirFoto(ctx, ctx.seleccionada()); },
            quitarfoto: function (ctx) {
                var f = ctx.seleccionada();
                if (!f) return;
                if (!f.foto) { ctx.mensaje(f.login + ' no tiene foto.', 'info'); return; }
                if (!confirm('¿Quitar la foto de ' + f.login + '?')) return;
                var datos = new FormData();
                datos.append('accion', 'quitar');
                return enviarFoto(ctx, f, datos);
            }
        },

        valoresIniciales: function (f, cat) {
            var v = f ? { login: f.login, nombre: f.nombre, correo: f.correo, rol_id: f.rol_id, contrasena: '' }
                      : { login: '', nombre: '', correo: '', rol_id: '', contrasena: '' };
            Object.keys(cat.permisos || {}).forEach(function (p) { v['perm_' + p] = !!f && f.permisos.indexOf(p) >= 0; });
            return v;
        },

        formulario: function (f, v, cat) {
            var roles = { '': '(Sin rol)' };
            (cat.roles || []).forEach(function (r) { roles[String(r.rol_id)] = r.nombre; });
            var delRol = deRol(cat, v.rol_id);

            var campos = [
                { id: 'login', etiqueta: 'Usuario', placeholder: 'Ej. JPEREZ', ayuda: 'Con este nombre inicia sesión (sin espacios).' },
                { id: 'rol_id', etiqueta: 'Rol', tipo: 'select', opciones: roles },
                { id: 'nombre', etiqueta: 'Nombre completo' },
                { id: 'correo', etiqueta: 'Correo', tipo: 'email' },
                { id: 'contrasena', etiqueta: f ? 'Nueva contraseña' : 'Contraseña', tipo: 'password', completo: true,
                  placeholder: f ? 'Vacía = conservar la actual' : 'Mínimo 6 caracteres' },
                { tipo: 'titulo', etiqueta: 'Permisos',
                  ayuda: delRol.length ? 'Los marcados en gris ya los da el rol; marca aquí los permisos sueltos que necesite además.'
                                       : 'Sin rol: marca los permisos que tendrá el usuario.' }
            ];
            Object.keys(cat.permisos || {}).forEach(function (p) {
                var porRol = delRol.indexOf(p) >= 0;
                if (porRol) v['perm_' + p] = true;   // se dibuja marcado y deshabilitado
                campos.push({ id: 'perm_' + p, etiqueta: cat.permisos[p] + (porRol ? ' (por el rol)' : ''), tipo: 'check',
                              medio: true, soloLectura: porRol, titulo: p });
            });
            return { titulo: f ? 'Usuario ' + f.login : 'Nuevo usuario', campos: campos };
        }
    });
})();
