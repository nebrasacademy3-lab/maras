$ErrorActionPreference = "Stop"
$url = "https://marase.up.railway.app/api/health"
Write-Host "Checking $url ..."
$r = Invoke-RestMethod -Uri $url -Method GET -TimeoutSec 30
$r | ConvertTo-Json -Depth 5
if (-not $r.ok) { throw "Railway backend is not healthy." }
Write-Host "Railway backend is healthy." -ForegroundColor Green
