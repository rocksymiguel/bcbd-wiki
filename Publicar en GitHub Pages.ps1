$ErrorActionPreference = 'Stop'

function Invoke-GitCommand {
  param([string[]]$Arguments)

  & git @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Git no pudo ejecutar: git $($Arguments -join ' ')"
  }
}

$repository = Split-Path -Parent $PSCommandPath
Set-Location -LiteralPath $repository

try {
  $branch = (& git branch --show-current).Trim()
  if ($branch -ne 'main') {
    throw "Esta publicacion solo se ejecuta desde main. Rama actual: $branch"
  }

  $changes = @(git status --porcelain)
  if ($changes.Count -gt 0) {
    throw 'Hay cambios sin publicar localmente. Primero ejecuta Actualizar sitio local.bat y prueba la VM.'
  }

  $localCommit = (& git rev-parse HEAD).Trim()
  $vmCommit = (& git rev-parse vm/main).Trim()
  if ($localCommit -ne $vmCommit) {
    throw 'La VM no tiene esta version. Primero ejecuta Actualizar sitio local.bat y revisa la pagina local.'
  }

  $localResponse = Invoke-WebRequest -UseBasicParsing -Uri 'http://192.168.18.150/' -TimeoutSec 15
  if ($localResponse.StatusCode -ne 200) {
    throw "La pagina local respondio HTTP $($localResponse.StatusCode). No se publicara en GitHub Pages."
  }

  Write-Host 'La version local fue comprobada. Publicando en GitHub...' -ForegroundColor Cyan
  Invoke-GitCommand @('push', 'origin', 'main:main', 'main:gh-pages')

  Write-Host 'GitHub recibio main y gh-pages con el mismo commit.' -ForegroundColor Green
  Write-Host 'GitHub Pages puede tardar unos minutos en reflejar el cambio.' -ForegroundColor Yellow
  Write-Host 'URL publica: https://rocksymiguel.github.io/bcbd-wiki/' -ForegroundColor Green
}
catch {
  Write-Host 'No se publico GitHub Pages.' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
