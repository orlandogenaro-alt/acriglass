<?php
require __DIR__ . '/includes/sistema.php';
sesionIniciar();
session_destroy();
header('Location: index.php');
exit;
