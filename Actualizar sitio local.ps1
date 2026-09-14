param(
  [string]$Message
)

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
  if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo identificar la rama actual de Git.'
  }

  if ($branch -ne 'main') {
    throw "Esta publicacion solo se ejecuta desde main. Rama actual: $branch"
  }

  $changes = @(git status --porcelain)
  if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo leer el estado de Git.'
  }

  if ($changes.Count -gt 0) {
    if ([string]::IsNullOrWhiteSpace($Message)) {
      $Message = Read-Host 'Mensaje para esta version'
    }

    if ([string]::IsNullOrWhiteSpace($Message)) {
      throw 'Publicacion cancelada: el mensaje de la version no puede estar vacio.'
    }

    Write-Host 'Guardando esta version en Git...' -ForegroundColor Cyan
    Invoke-GitCommand @('add', '-A')
    Invoke-GitCommand @('commit', '-m', $Message)
  }
  else {
    Write-Host 'No habia cambios locales nuevos; se verificara la publicacion actual.' -ForegroundColor Yellow
  }

  Write-Host 'Enviando main directamente a la VM local...' -ForegroundColor Cyan
  Invoke-GitCommand @('push', 'vm', 'main')

  Write-Host 'Aplicando la version en la pagina local...' -ForegroundColor Cyan
  & ssh bcbd-wiki 'cd /srv/bcbd-wiki && git pull --ff-only vm main'
  if ($LASTEXITCODE -ne 0) {
    throw 'La VM recibio la version, pero no pudo aplicarla al sitio.'
  }

  $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://192.168.18.150/' -TimeoutSec 15
  if ($response.StatusCode -ne 200) {
    throw "La VM respondio HTTP $($response.StatusCode) despues de actualizar."
  }

  Write-Host 'Listo: la version Git local y la pagina de la VM estan actualizadas.' -ForegroundColor Green
  Write-Host 'GitHub y GitHub Pages no se modificaron.' -ForegroundColor Green
}
catch {
  Write-Host 'No se completo la publicacion.' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
