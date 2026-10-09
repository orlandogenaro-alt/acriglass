// Administrador › Usuarios
(function () {
    // Permisos que ya da el rol elegido
    function deRol(cat, rolId) { return (cat.permisos_roles || {})[rolId] || []; }

    Catalogo({
        nombre: function (f) { return String(f.login || f.clave).toUpperCase(); },

        columnas: [
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
