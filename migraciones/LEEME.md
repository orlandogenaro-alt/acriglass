# Migraciones de Supabase

Cada cambio a la base en línea es un archivo `NNN_nombre.sql` en esta carpeta, en orden. Un archivo ya aplicado no se modifica: el cambio va en una migración nueva.

El sistema corre en Vercel y su base es Supabase, así que las tablas nuevas existen solo ahí. El código revisa si cada tabla existe (`bd_tiene_tabla`): mientras no se apliquen las migraciones, el sistema sigue funcionando como antes.

Estos archivos se guardan en GitHub con el resto del código. `.vercelignore` solo evita que se publiquen en el sitio web.

Los scripts que están en `Consultas/` (como `supabase_acriglass.sql` o `supabase_presupuesto_utilidad_modo.sql`) son de antes de esta carpeta. Se siguen corriendo a mano en el editor SQL de Supabase.

## Ambientes

| Ambiente | Base | Publicación |
|---|---|---|
| Desarrollo | Proyecto de Supabase de pruebas | XAMPP en la máquina de desarrollo |
| Pruebas | Proyecto de Supabase **de pruebas**, con una copia de los catálogos y sin datos reales de clientes | Vercel Preview (cada rama), con las variables `DB_*` del proyecto de pruebas |
| Producción | Proyecto de Supabase de producción | Vercel Production (rama `main`) |

Una migración se corre primero en pruebas y, después de revisar el sistema, en producción.

## Cómo correrlas

1. Crea un archivo `.env.pruebas` o `.env.produccion`, fuera de Git, con `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` y `DB_SSLMODE`.
   - Para migraciones conviene el puerto 5432 (conexión directa o pooler de sesión).
2. Revisa qué falta. Esto no cambia nada en la base:

   ```
   php herramientas/migrar.php --env .env.pruebas
   ```

3. Aplica lo que falta. Cada migración corre completa o no corre:

   ```
   php herramientas/migrar.php --env .env.pruebas --aplicar
   ```

En XAMPP sin `php.ini` propio, agrega `-d extension=pdo_pgsql -d extension=mbstring` después de `php`.

## Pruebas automáticas

```
php pruebas/correr.php
```

Prueban los cálculos del presupuesto, el motor de costos, los parámetros y el freno de contraseñas. No usan ninguna base de datos.

El formato impreso (partidas, subpartidas y propuesta) y la ruta crítica del programa se prueban con Node:

```
node pruebas/formato-presupuesto.js
node pruebas/ruta-critica.js
node pruebas/presupuesto-calculo.js
```
