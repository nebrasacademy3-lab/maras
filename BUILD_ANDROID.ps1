$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location (Join-Path $root "mobile")
try {
  Write-Host "Installing exact mobile dependencies..." -ForegroundColor Cyan
  npm ci
  Write-Host "Running Expo Doctor..." -ForegroundColor Cyan
  npx expo-doctor
  Write-Host "Resolved API configuration:" -ForegroundColor Cyan
  npx expo config --type public
  if (-not (Test-Path ".\google-services.json")) {
    Write-Host "Warning: google-services.json is missing. The APK can build, but Android push notifications will not be fully configured." -ForegroundColor Yellow
  }
  Write-Host "Building a NEW Android APK with a cleared EAS cache..." -ForegroundColor Green
  npx eas-cli@latest build --platform android --profile preview --clear-cache
}
finally { Pop-Location }
