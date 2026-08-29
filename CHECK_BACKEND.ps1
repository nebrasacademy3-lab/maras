$ErrorActionPreference = "Continue"
$base = "https://marase.up.railway.app"
Write-Host "Checking $base" -ForegroundColor Cyan
foreach ($path in @('/api/ping','/api/health')) {
  $url = "$base$path"
  try {
    $r = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 20 -UseBasicParsing
    Write-Host "$url -> HTTP $($r.StatusCode)" -ForegroundColor Green
    Write-Host $r.Content
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    Write-Host "$url -> FAILED HTTP $status" -ForegroundColor Red
    Write-Host $_.Exception.Message
  }
}
