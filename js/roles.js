// Administrador › Roles
(function () {
    Catalogo({
        nombre: function (f) { return 'el rol ' + String(f.nombre || f.clave).toUpperCase(); },

        columnas: [
            { id: 'nombre', titulo: 'Rol', fija: true, html: function (f, h) { return h.chip(f.nombre, 'clave'); } },
            { id: 'descripcion', titulo: 'Descripción', clase: 'corta', titulo_celda: function (f) { return f.descripcion; } },
            { id: 'permisos', titulo: 'Permisos', clase: 'corta',
              titulo_celda: function (f) { return f.permisos.join(', '); },
              html: function (f, h) { return f.permisos.indexOf('ADMIN_USER') >= 0 ? h.chip('Administrador', 'token') : h.esc(f.permisos.join(', ')); },
              texto: function (f) { return f.permisos.join(' '); } },
            { id: 'usuarios', titulo: 'Usuarios', clase: 'centro' }
        ],

        valoresIniciales: function (f, cat) {
            var v = f ? { nombre: f.nombre, descripcion: f.descripcion } : { nombre: '', descripcion: '' };
            Object.keys(cat.permisos || {}).forEach(function (p) { v['perm_' + p] = !!f && f.permisos.indexOf(p) >= 0; });
            return v;
        },

        formulario: function (f, v, cat) {
            var campos = [
                { id: 'nombre', etiqueta: 'Nombre del rol', placeholder: 'Ej. VENDEDOR' },
                { id: 'descripcion', etiqueta: 'Descripción' },
                { tipo: 'titulo', etiqueta: 'Permisos del rol',
                  ayuda: f && f.usuarios ? 'Lo usan ' + f.usuarios + ' usuario(s): el cambio les aplica al volver a iniciar sesión.' : '' }
            ];
            Object.keys(cat.permisos || {}).forEach(function (p) {
                campos.push({ id: 'perm_' + p, etiqueta: cat.permisos[p], tipo: 'check', medio: true, titulo: p });
            });
            return { titulo: f ? 'Rol ' + f.nombre : 'Nuevo rol', campos: campos };
        }
    });
})();
