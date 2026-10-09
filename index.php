<?php
require_once __DIR__ . '/includes/sistema.php';
$cfg   = sistemaConfig();
$fondo = imagenSistema('fondo', $cfg);

$errores = [
    'vacio'  => 'Escribe tu usuario y contraseña.',
    'datos'  => 'Usuario o contraseña incorrectos.',
    'baja'   => 'Tu usuario está dado de baja.',
    'bd'     => 'No se pudo conectar con la base de datos de usuarios (AW). Avisa al administrador.',
    'config' => 'El sistema aún no está configurado. Entra desde el servidor para capturar la conexión a la base de datos.',
];
$error = $errores[$_GET['e'] ?? ''] ?? null;
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AcriGlass · Iniciar sesión</title>
    <link rel="icon" href="<?= e(imagenSistema('favicon', $cfg)) ?>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@700;800&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= recurso('css/login.css') ?>">
    <?php if ($fondo): ?>
    <!-- Fondo configurado en Administrador › Imagen del Sistema -->
    <style>
        .fondo {
            background:
                linear-gradient(90deg, rgba(10, 22, 48, 0.92) 0%, rgba(14, 32, 66, 0.70) 45%, rgba(40, 70, 120, 0.35) 100%),
                url('<?= e($fondo) ?>') center / cover no-repeat, #1a2f57;
        }
        .fachada { display: none; }
        @media (max-width: 600px) {
            .fondo { background: linear-gradient(rgba(10, 22, 48, 0.85), rgba(10, 22, 48, 0.85)), url('<?= e($fondo) ?>') center / cover no-repeat; }
        }
    </style>
    <?php endif; ?>
</head>
<body>
    <div class="fondo" aria-hidden="true">
        <div class="fachada"></div>
    </div>

    <main class="login">
        <h1 class="marca">
            <span class="marca-acri">ACRI</span><span class="marca-glass">GLASS</span>
        </h1>
        <p class="marca-sub">Vidrio y Aluminio</p>

        <h2 class="bienvenida">Bienvenido a AcriGlass<br>Vidrio y Aluminio</h2>

        <?php if ($error): ?>
        <p class="error-login" role="alert"><?= e($error) ?></p>
        <?php endif; ?>

        <form method="post" action="login.php" autocomplete="on">
            <div class="campo">
                <input type="text" name="usuario" id="usuario" placeholder="Usuario" required>
                <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-9 2.2-9 5v3h18v-3c0-2.8-4.6-5-9-5z"/></svg>
            </div>

            <div class="campo">
                <input type="password" name="contrasena" id="contrasena" placeholder="Contraseña" required>
                <svg class="icono candado" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 9V7A5 5 0 0 0 7 7v2H5v13h14V9h-2zM9 7a3 3 0 0 1 6 0v2H9V7zm4 9.7V19h-2v-2.3a2 2 0 1 1 2 0z"/></svg>
            </div>

            <label class="recordar">
                <input type="checkbox" name="recordar" id="recordar" checked>
                Recordar usuario
            </label>

            <button type="submit" class="btn-login">Iniciar sesión</button>
        </form>

        <a href="#" class="olvido">¿Olvidó su contraseña?</a>

        <p class="legal">Al hacer clic en Iniciar Sesión, aceptas las condiciones del servicio.</p>
        <p class="version">AcriGlass · Versión <?php echo date('d.m.Y'); ?></p>
    </main>

    <script>
        // Recordar usuario en este navegador
        (function () {
            var u = document.getElementById('usuario');
            var r = document.getElementById('recordar');
            try {
                var guardado = localStorage.getItem('acriglass_usuario');
                if (guardado) u.value = guardado;
            } catch (e) {}
            document.querySelector('form').addEventListener('submit', function () {
                try {
                    if (r.checked) localStorage.setItem('acriglass_usuario', u.value);
                    else localStorage.removeItem('acriglass_usuario');
                } catch (e) {}
            });
        })();
    </script>
</body>
</html>
