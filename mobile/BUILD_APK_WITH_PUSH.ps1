$ErrorActionPreference = "Stop"
if (-not (Test-Path -Path ".\google-services.json")) {
  Write-Host "google-services.json غير موجود." -ForegroundColor Red
  Write-Host "ضع ملف Firebase الخاص بالحزمة sa.merasalelm.app في هذا المجلد أولاً حتى تعمل Push بالخلفية/عند إغلاق التطبيق." -ForegroundColor Yellow
  exit 2
}
Write-Host "Installing exact dependencies..." -ForegroundColor Cyan
npm ci
Write-Host "Checking EAS project..." -ForegroundColor Cyan
npx eas-cli@latest project:info
Write-Host "Starting Android preview APK build..." -ForegroundColor Green
npx eas-cli@latest build --platform android --profile preview
