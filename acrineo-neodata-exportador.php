<?php
// ACRINEO · Descarga «ACRINEO-Exportar-Neodata.bat»: un .bat que corre el exportador de PowerShell
// (includes/acrineo/neodata-exportar.ps1) en la computadora del usuario. Lee sus bases de Neodata (solo lectura)
// y deja un archivo por obra en C:\NEODATAWinPlus\Archivos Intercambio\ACRINEO para «Importar mis presupuestos de Neodata».
require __DIR__ . '/includes/sesion.php';
require __DIR__ . '/includes/acrineo/permisos.php';
if (!acrineoPuede('presupuestos.crear')) { http_response_code(403); exit('No tienes permiso para importar presupuestos.'); }
session_write_close();

$ps = (string) file_get_contents(__DIR__ . '/includes/acrineo/neodata-exportar.ps1');
$ps = preg_replace("/\r?\n/", "\r\n", ltrim($ps, "\xEF\xBB\xBF"));
// Las primeras líneas son de cmd (solo ASCII); PowerShell lee el mismo archivo desde la marca <#PS#> en adelante
$bat = "@echo off\r\n"
     . "title ACRINEO - Exportar presupuestos de Neodata\r\n"
     . "powershell -NoProfile -ExecutionPolicy Bypass -Command \"\$t=[IO.File]::ReadAllText('%~f0',[Text.Encoding]::UTF8); \$i=\$t.LastIndexOf('<#P'+'S#>'); Invoke-Expression \$t.Substring(\$i)\"\r\n"
     . "echo.\r\n"
     . "pause\r\n"
     . "exit /b\r\n"
     . $ps;

header('Content-Type: application/octet-stream');
header('Content-Disposition: attachment; filename="ACRINEO-Exportar-Neodata.bat"');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
echo $bat;
