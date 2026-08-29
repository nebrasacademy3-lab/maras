$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "railway")
railway status
railway up
