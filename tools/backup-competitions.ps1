param(
    [string]$Destination = '\\TRUENAS\Emulacion\Development\Backups\bcbd-wiki\competencias'
)
$ErrorActionPreference = 'Stop'
$remoteScript = Join-Path $PSScriptRoot 'gis\api\export_competitions.py'
$encoded = Get-Content -LiteralPath $remoteScript -Raw | & ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes bcbd-wiki 'docker exec -i bcbd-competitions python -'
if ($LASTEXITCODE -ne 0 -or -not $encoded) { throw 'No se pudo exportar la base de datos de competencias.' }
$bytes = [Convert]::FromBase64String(($encoded -join '').Trim())
if ($bytes.Length -lt 512 -or [Text.Encoding]::ASCII.GetString($bytes,0,15) -ne 'SQLite format 3') { throw 'La exportación no contiene una base SQLite válida.' }
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$target = Join-Path $Destination "competitions-$stamp.sqlite"
[IO.File]::WriteAllBytes($target, $bytes)
$hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
Set-Content -LiteralPath "$target.sha256" -Value $hash -Encoding ascii
Write-Output "Respaldo verificado guardado: $target"
