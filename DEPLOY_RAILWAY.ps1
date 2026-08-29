$ErrorActionPreference = "Stop"
Write-Host "Meras Al-Elm - Railway deploy (project root)" -ForegroundColor Cyan
if (-not (Test-Path ".\Dockerfile")) { throw "Run this script from the extracted project root." }
npx --yes @railway/cli@latest status
npx --yes @railway/cli@latest up
