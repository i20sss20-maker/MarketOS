param(
  [string]$ResourceGroup = "rg-marketos-dev",
  [string]$StaticWebApp = "marketos-preview",
  [Parameter(Mandatory = $true)]
  [ValidateSet("realtime", "delayed", "end-of-day")]
  [string]$Timing,
  [ValidateRange(1, 1440)]
  [int]$DelayMinutes = 15,
  [Parameter(Mandatory = $true)]
  [ValidateSet("personal", "commercial")]
  [string]$UsageScope,
  [Parameter(Mandatory = $true)]
  [datetime]$RightsConfirmedAt,
  [datetime]$RightsExpiresAt
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command "az" -ErrorAction SilentlyContinue)) {
  throw "Azure CLI is required."
}

az account show --output none
if ($LASTEXITCODE -ne 0) {
  throw "Azure account is not signed in."
}

$exists = az group exists --name $ResourceGroup --output tsv
if ($exists -ne "true") {
  throw "Resource group '$ResourceGroup' does not exist."
}

az staticwebapp show --name $StaticWebApp --resource-group $ResourceGroup --output none
if ($LASTEXITCODE -ne 0) {
  throw "Static Web App '$StaticWebApp' does not exist in '$ResourceGroup'."
}

$today = (Get-Date).ToUniversalTime().Date
$confirmed = $RightsConfirmedAt.ToUniversalTime().Date

if ($confirmed -gt $today) {
  throw "RightsConfirmedAt cannot be in the future."
}

if ($PSBoundParameters.ContainsKey("RightsExpiresAt")) {
  $expires = $RightsExpiresAt.ToUniversalTime().Date
  if ($expires -lt $today) {
    throw "RightsExpiresAt is already expired."
  }
  if ($expires -lt $confirmed) {
    throw "RightsExpiresAt cannot be earlier than RightsConfirmedAt."
  }
}

$settings = @(
  "MARKET_DATA_TIMING=$Timing",
  "MARKET_DATA_USAGE_SCOPE=$UsageScope",
  "MARKET_DATA_RIGHTS_CONFIRMED=true",
  "MARKET_DATA_RIGHTS_CONFIRMED_AT=$($confirmed.ToString('yyyy-MM-dd'))"
)

if ($Timing -eq "delayed") {
  $settings += "MARKET_DATA_DELAY_MINUTES=$DelayMinutes"
}

if ($PSBoundParameters.ContainsKey("RightsExpiresAt")) {
  $settings += "MARKET_DATA_RIGHTS_EXPIRES_AT=$($expires.ToString('yyyy-MM-dd'))"
}

Write-Host "Writing non-secret market-data provenance settings..." -ForegroundColor Cyan
az staticwebapp appsettings set --name $StaticWebApp --resource-group $ResourceGroup --setting-names $settings --output none
if ($LASTEXITCODE -ne 0) {
  throw "Could not write MarketOS market-data provenance settings."
}

if ($Timing -ne "delayed") {
  az staticwebapp appsettings delete --name $StaticWebApp --resource-group $ResourceGroup --setting-names MARKET_DATA_DELAY_MINUTES --output none 2>$null
}

if (-not $PSBoundParameters.ContainsKey("RightsExpiresAt")) {
  az staticwebapp appsettings delete --name $StaticWebApp --resource-group $ResourceGroup --setting-names MARKET_DATA_RIGHTS_EXPIRES_AT --output none 2>$null
}

Write-Host ""
Write-Host "MarketOS market-data provenance is declared." -ForegroundColor Green
Write-Host "Timing: $Timing"
if ($Timing -eq "delayed") {
  Write-Host "Delay: $DelayMinutes minutes"
}
Write-Host "Usage scope: $UsageScope"
Write-Host "Rights confirmed at: $($confirmed.ToString('yyyy-MM-dd'))"
if ($PSBoundParameters.ContainsKey("RightsExpiresAt")) {
  Write-Host "Rights expire at: $($expires.ToString('yyyy-MM-dd'))"
}
Write-Host ""
Write-Host "This records your deployment declaration only. It does not buy, verify, or expand provider/exchange rights." -ForegroundColor Yellow
Write-Host "No provider API key or paid subscription was changed." -ForegroundColor Yellow
