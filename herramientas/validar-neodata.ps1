# Validación contra Neodata: saca de la base de una obra de Neodata WinPlus (SQL Server LocalDB) un presupuesto
# con todo lo que Neodata calculó (costo directo y precio de cada concepto, totales) y las matrices completas
# (con los básicos dentro de básicos), y lo deja en un JSON que compara herramientas/validar-neodata.js con el
# motor de cálculo del sistema. Solo lee la base, no cambia nada en Neodata.
#
# Uso (PowerShell):
#   .\validar-neodata.ps1                                        lista las obras
#   .\validar-neodata.ps1 -Obra ACRISTALA                        lista los presupuestos con su costo y precio
#   .\validar-neodata.ps1 -Obra ACRISTALA -Presupuesto 5         genera el JSON (Id o nombre; * = todos los calculados)
#   node .\validar-neodata.js                                    compara todos los JSON generados
param(
    [string]$Obra,
    [string]$Presupuesto,
    [string]$Salida = (Join-Path $PSScriptRoot 'validacion-neodata'),
    [string]$Servidor = '(localdb)\MSSQLLocalDB'
)
$ErrorActionPreference = 'Stop'

function Consultar([string]$base, [string]$sql, [hashtable]$parametros = @{}) {
    $cn = New-Object System.Data.SqlClient.SqlConnection("Server=$Servidor;Integrated Security=true;Database=$base;Connect Timeout=60")
    $cn.Open()
    try {
        $cmd = $cn.CreateCommand()
        $cmd.CommandText = $sql
        $cmd.CommandTimeout = 300
        foreach ($k in $parametros.Keys) { [void]$cmd.Parameters.AddWithValue($k, $parametros[$k]) }
        $t = New-Object System.Data.DataTable
        $t.Load($cmd.ExecuteReader())
        return , $t
    } finally { $cn.Close() }
}
# Renglones de la tabla como objetos simples (DBNull -> $null) para ConvertTo-Json
function Lista($t) {
    $cols = @($t.Columns | ForEach-Object { $_.ColumnName })
    return @(foreach ($r in $t.Rows) {
        $o = [ordered]@{}
        foreach ($c in $cols) {
            $v = $r[$c]
            $o[$c] = if ($v -is [DBNull]) { $null } elseif ($v -is [string]) { $v.Trim() } elseif ($v -is [decimal] -or $v -is [double]) { [double]$v } else { $v }
        }
        [pscustomobject]$o
    })
}

$obras = Consultar 'master' "SELECT d.name base, f.physical_name archivo FROM sys.databases d JOIN sys.master_files f ON f.database_id = d.database_id AND f.type = 0 WHERE d.database_id > 4 AND d.state_desc = 'ONLINE' ORDER BY f.physical_name"
if (-not $Obra) {
    'Obras de Neodata en ' + $Servidor + ':'
    $obras | ForEach-Object { '  ' + [IO.Path]::GetFileNameWithoutExtension($_.archivo) }
    ''
    'Siguiente paso: .\validar-neodata.ps1 -Obra <nombre>'
    return
}
$fila = $obras | Where-Object { [IO.Path]::GetFileNameWithoutExtension($_.archivo) -eq $Obra } | Select-Object -First 1
if (-not $fila) { throw "No encontre la obra '$Obra'. Ejecuta el script sin parametros para ver la lista." }
$base = $fila.base

$presupuestos = Consultar $base @"
SELECT p.IdPresupuesto, p.Presupuesto, (SELECT COUNT(*) FROM PuPresupuestosConceptos c WHERE c.IdPresupuesto = p.IdPresupuesto) Conceptos,
       pr.CostoTotal, pr.PrecioTotal
FROM PuPresupuestos p LEFT JOIN PuPresupuestosPrecios pr ON pr.IdPresupuesto = p.IdPresupuesto AND pr.IdMoneda = 1
ORDER BY p.IdPresupuesto
"@
if (-not $Presupuesto) {
    $presupuestos | Format-Table -AutoSize | Out-String -Width 200
    "Siguiente paso: .\validar-neodata.ps1 -Obra '$Obra' -Presupuesto <IdPresupuesto o nombre>   (* = todos los que tienen precio)"
    return
}
$elegidos = @($presupuestos | Where-Object {
    ($Presupuesto -eq '*' -and -not ($_.PrecioTotal -is [DBNull]) -and $_.Conceptos -gt 0) -or
    [string]$_.IdPresupuesto -eq $Presupuesto -or ([string]$_.Presupuesto).Trim() -eq $Presupuesto.Trim() })
if (-not $elegidos.Count) { throw "No encontre el presupuesto '$Presupuesto' en la obra $Obra." }

# Conceptos del presupuesto con lo que calculó Neodata: costo directo (el costo del concepto) y precio unitario
$sqlConceptos = @"
SELECT pc.IdPresupuestoConcepto, pc.IdExpIns, cat.Codigo, LEFT(cat.Descripcion, 120) Descripcion, u.Unidad, pc.Cantidad,
       pc.IndirectoEspecial, pc.PorcentajeIndirectoEspecial,
       (SELECT TOP 1 pr.Precio FROM PuPresupuestosConceptosPrecios pr WHERE pr.IdPresupuestoConcepto = pc.IdPresupuestoConcepto AND pr.IdMoneda = 1) Precio,
       (SELECT TOP 1 x.Costo FROM PuExpInsCostos x WHERE x.IdExpIns = pc.IdExpIns AND x.IdMoneda = 1 ORDER BY x.Fecha DESC) Costo
FROM PuPresupuestosConceptos pc
JOIN PuExpIns e ON e.IdExpIns = pc.IdExpIns
JOIN PuCatalogo cat ON cat.IdCodigo = e.IdCodigo
LEFT JOIN PuUnidades u ON u.IdUnidad = cat.IdUnidad
WHERE pc.IdPresupuesto = @p
ORDER BY pc.Renglon
"@
# Todos los renglones de matriz que cuelgan de los conceptos, a cualquier nivel (básicos dentro de básicos)
$sqlMatrices = @"
WITH arbol AS (
    SELECT DISTINCT pc.IdExpIns FROM PuPresupuestosConceptos pc WHERE pc.IdPresupuesto = @p
    UNION ALL
    SELECT m.IdCodigoInsumo FROM PuMatrices m JOIN arbol a ON a.IdExpIns = m.IdCodigoMatriz
)
SELECT DISTINCT m.IdMatriz, m.IdCodigoMatriz, m.Renglon, m.IdCodigoInsumo, m.Dividir, m.Volumen, m.Expresion
FROM PuMatrices m WHERE m.IdCodigoMatriz IN (SELECT IdExpIns FROM arbol)
ORDER BY m.IdCodigoMatriz, m.Renglon
OPTION (MAXRECURSION 50)
"@
# Cada insumo (o matriz) que aparece: tipo, unidad, costo en pesos y en dólares, y los datos de la mano de obra
$sqlInsumos = @"
WITH arbol AS (
    SELECT DISTINCT pc.IdExpIns FROM PuPresupuestosConceptos pc WHERE pc.IdPresupuesto = @p
    UNION ALL
    SELECT m.IdCodigoInsumo FROM PuMatrices m JOIN arbol a ON a.IdExpIns = m.IdCodigoMatriz
)
SELECT e.IdExpIns, c.Codigo, LEFT(c.Descripcion, 120) Descripcion, c.IdTipo, c.EsPorcentaje, u.Unidad, e.EsCostoHorario,
       (SELECT TOP 1 x.Costo FROM PuExpInsCostos x WHERE x.IdExpIns = e.IdExpIns AND x.IdMoneda = 1 ORDER BY x.Fecha DESC) CostoMXN,
       (SELECT TOP 1 x.Costo FROM PuExpInsCostos x WHERE x.IdExpIns = e.IdExpIns AND x.IdMoneda = 2 ORDER BY x.Fecha DESC) CostoUSD,
       mo.SalarioBase, mo.Fasar, mo.SalarioReal
FROM (SELECT DISTINCT IdExpIns FROM arbol) a
JOIN PuExpIns e ON e.IdExpIns = a.IdExpIns
JOIN PuCatalogo c ON c.IdCodigo = e.IdCodigo
LEFT JOIN PuUnidades u ON u.IdUnidad = c.IdUnidad
OUTER APPLY (SELECT TOP 1 m.SalarioBase, m.Fasar, m.SalarioReal FROM PuExpInsCostos x JOIN PuExpInsMO m ON m.IdExpInsCosto = x.IdExpInsCosto
             WHERE x.IdExpIns = e.IdExpIns ORDER BY CASE WHEN x.IdMoneda = 1 THEN 0 ELSE 1 END, x.Fecha DESC) mo
OPTION (MAXRECURSION 50)
"@

if (-not (Test-Path $Salida)) { New-Item -ItemType Directory -Path $Salida | Out-Null }
foreach ($p in $elegidos) {
    $id = [int]$p.IdPresupuesto
    $nombre = ([string]$p.Presupuesto).Trim() -replace '[\\/:*?"<>|]', '-'
    $datos = [ordered]@{
        obra = $Obra; id = $id; presupuesto = $nombre
        totales = @(Lista (Consultar $base "SELECT IdMoneda, PrecioTotal, CostoTotal, CostoMO, CostoMA, CostoEQ, CostoOtros FROM PuPresupuestosPrecios WHERE IdPresupuesto = @p" @{ '@p' = $id }))
        monedas = @(Lista (Consultar $base "SELECT IdMoneda, Paridad, Fecha FROM PuPresupuestosMonedas WHERE IdPresupuesto = @p" @{ '@p' = $id }))
        conceptos = @(Lista (Consultar $base $sqlConceptos @{ '@p' = $id }))
        matrices = @(Lista (Consultar $base $sqlMatrices @{ '@p' = $id }))
        insumos = @(Lista (Consultar $base $sqlInsumos @{ '@p' = $id }))
    }
    $archivo = Join-Path $Salida ("{0} - {1} {2}.json" -f $Obra, $id, $nombre)
    [IO.File]::WriteAllText($archivo, ($datos | ConvertTo-Json -Depth 6 -Compress), (New-Object Text.UTF8Encoding $false))
    '{0} ({1}): {2} conceptos, {3} renglones de matriz, {4} insumos -> {5}' -f $nombre, $id, $datos.conceptos.Count, $datos.matrices.Count, $datos.insumos.Count, $archivo
}
