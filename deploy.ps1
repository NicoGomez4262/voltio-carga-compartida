# Redespliega Voltio a Firebase Hosting usando la cuenta de servicio.
# Uso:  powershell -ExecutionPolicy Bypass -File deploy.ps1
#
# Usa la clave de servicio (fuera del repo) y aísla la config de firebase-tools
# para NO usar el login de otra cuenta que pueda estar activo en el equipo.

$ErrorActionPreference = "Stop"

$key = if ($env:VOLTIO_FIREBASE_KEY) { $env:VOLTIO_FIREBASE_KEY } else { "$env:USERPROFILE\voltio-firebase-key.json" }
if (-not (Test-Path $key)) {
  Write-Error "No encuentro la clave de servicio en '$key'. Define la variable VOLTIO_FIREBASE_KEY o coloca el archivo .json ahí."
  exit 1
}

$env:GOOGLE_APPLICATION_CREDENTIALS = $key
$env:XDG_CONFIG_HOME = "$env:TEMP\fbclean"     # config aislada -> usa la cuenta de servicio
New-Item -ItemType Directory -Force -Path $env:XDG_CONFIG_HOME | Out-Null

Write-Host "Desplegando Voltio a https://voltio-aec23.web.app ..." -ForegroundColor Cyan
firebase deploy --only hosting --project voltio-aec23 --non-interactive
