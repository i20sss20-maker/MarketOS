param(
  [string]$ResourceGroup = "rg-marketos-dev",
  [string]$StaticWebApp = "marketos-preview",
  [switch]$RotateKeys
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is not installed or available in PATH."
  }
}

Require-Command "az"
Require-Command "npx.cmd"

Write-Host "Checking Azure sign-in..." -ForegroundColor Cyan
az account show --output none

$hostname = az staticwebapp show --name $StaticWebApp --resource-group $ResourceGroup --query "defaultHostname" --output tsv
if (-not $hostname) {
  throw "Could not resolve the MarketOS Static Web App hostname."
}

$settingsJson = az staticwebapp appsettings list --name $StaticWebApp --resource-group $ResourceGroup --output json
$settings = $settingsJson | ConvertFrom-Json

if ($settings.properties.USER_DATA_PROVIDER -ne "cosmos") {
  throw "Persistent Cosmos storage is required before enabling Web Push. Run bootstrap-cosmos.ps1 first."
}

$publicKey = [string]$settings.properties.VAPID_PUBLIC_KEY
$privateKey = [string]$settings.properties.VAPID_PRIVATE_KEY

$needsKeys =
  $RotateKeys -or
  [string]::IsNullOrWhiteSpace($publicKey) -or
  [string]::IsNullOrWhiteSpace($privateKey)

if ($needsKeys) {
  Write-Host "Generating VAPID keys locally..." -ForegroundColor Cyan
  $raw = & npx.cmd -y web-push@3.6.7 generate-vapid-keys --json 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "VAPID key generation failed."
  }

  $keys = ($raw | Out-String) | ConvertFrom-Json
  $publicKey = [string]$keys.publicKey
  $privateKey = [string]$keys.privateKey

  if (
    [string]::IsNullOrWhiteSpace($publicKey) -or
    [string]::IsNullOrWhiteSpace($privateKey)
  ) {
    throw "Generated VAPID keys were invalid."
  }
} else {
  Write-Host "Existing VAPID keys found. Keeping them to preserve device subscriptions." -ForegroundColor Green
}

$vapidSubject = "https://$hostname"

Write-Host "Writing Web Push settings directly to Azure..." -ForegroundColor Cyan
az staticwebapp appsettings set --name $StaticWebApp --resource-group $ResourceGroup --setting-names "WEB_PUSH_ENABLED=true" "VAPID_PUBLIC_KEY=$publicKey" "VAPID_PRIVATE_KEY=$privateKey" "VAPID_SUBJECT=$vapidSubject" --output none

Write-Host ""
Write-Host "MarketOS Web Push is configured." -ForegroundColor Green
Write-Host "Static Web App: $StaticWebApp"
Write-Host "Origin: $vapidSubject"
Write-Host "No VAPID private key was printed." -ForegroundColor Green
if ($RotateKeys) {
  Write-Host "Keys were rotated. Existing browser subscriptions must be enabled again." -ForegroundColor Yellow
}
