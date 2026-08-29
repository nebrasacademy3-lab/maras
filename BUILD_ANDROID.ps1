$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "mobile")
npm ci
npx expo-doctor
$env:EXPO_PUBLIC_API_URL="https://marase.up.railway.app"
npx expo config --type public
npx eas-cli@latest build --platform android --profile preview
