param(
  [string]$ResourceGroup = "rg-marketos-dev",
  [string]$StaticWebApp = "marketos-preview",
  [string]$CosmosAccount = ""
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command "az" -ErrorAction SilentlyContinue)) {
  throw "Azure CLI is required."
}

$subscriptionId = az account show --query id --output tsv
if ($LASTEXITCODE -ne 0 -or -not $subscriptionId) {
  throw "Azure account is not signed in."
}

if ([string]::IsNullOrWhiteSpace($CosmosAccount)) {
  $suffix = $subscriptionId.Replace("-", "").Substring(0, 8).ToLowerInvariant()
  $CosmosAccount = "marketos-$suffix-dev"
}

az staticwebapp show --name $StaticWebApp --resource-group $ResourceGroup --output none
if ($LASTEXITCODE -ne 0) {
  throw "Static Web App '$StaticWebApp' does not exist in '$ResourceGroup'."
}

$accountJson = az cosmosdb show --name $CosmosAccount --resource-group $ResourceGroup --output json
if ($LASTEXITCODE -ne 0 -or -not $accountJson) {
  throw "Cosmos account '$CosmosAccount' does not exist or is unreadable."
}

$account = $accountJson | ConvertFrom-Json
$backup = $account.backupPolicy
if (-not $backup -and $account.properties) {
  $backup = $account.properties.backupPolicy
}
if (-not $backup) {
  throw "Azure did not return a Cosmos backup policy. Readiness was not changed."
}

$rawType = ([string]$backup.type).Trim()
$mode = switch -Regex ($rawType) {
  "^Continuous$" { "continuous"; break }
  "^Periodic$" { "periodic"; break }
  default { "" }
}

if (-not $mode) {
  throw "Unsupported or unknown Cosmos backup policy '$rawType'. Readiness was not changed."
}

$settings = @(
  "MARKETOS_COSMOS_BACKUP_VERIFIED=true",
  "MARKETOS_COSMOS_BACKUP_MODE=$mode",
  "MARKETOS_COSMOS_BACKUP_VERIFIED_AT=$((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd'))"
)

if ($mode -eq "periodic") {
  $periodic = $backup.periodicModeProperties
  if (-not $periodic) {
    throw "Periodic backup details were not returned by Azure. Readiness was not changed."
  }

  $interval = [int]$periodic.backupIntervalInMinutes
  $retention = [int]$periodic.backupRetentionIntervalInHours
  $redundancy = ([string]$periodic.backupStorageRedundancy).Trim()

  if ($interval -le 0 -or $retention -le 0 -or [string]::IsNullOrWhiteSpace($redundancy)) {
    throw "Periodic backup interval, retention, or redundancy is invalid. Readiness was not changed."
  }

  $settings += "MARKETOS_COSMOS_BACKUP_INTERVAL_MINUTES=$interval"
  $settings += "MARKETOS_COSMOS_BACKUP_RETENTION_HOURS=$retention"
  $settings += "MARKETOS_COSMOS_BACKUP_REDUNDANCY=$redundancy"

  Write-Host "Verified Cosmos periodic backup policy." -ForegroundColor Green
  Write-Host "Interval: $interval minutes"
  Write-Host "Retention: $retention hours"
  Write-Host "Redundancy: $redundancy"
} else {
  $continuous = $backup.continuousModeProperties
  $tier = ([string]$continuous.tier).Trim()

  if ([string]::IsNullOrWhiteSpace($tier)) {
    throw "Continuous backup tier was not returned by Azure. Readiness was not changed."
  }

  $settings += "MARKETOS_COSMOS_CONTINUOUS_TIER=$tier"

  Write-Host "Verified Cosmos continuous backup policy." -ForegroundColor Green
  Write-Host "Tier: $tier"
}

az staticwebapp appsettings set --name $StaticWebApp --resource-group $ResourceGroup --setting-names $settings --output none
if ($LASTEXITCODE -ne 0) {
  throw "Backup policy was read successfully, but MarketOS verification flags could not be written."
}

Write-Host ""
Write-Host "MarketOS backup verification recorded for $CosmosAccount." -ForegroundColor Green
Write-Host "Mode: $mode"
Write-Host "Verification expires after 30 days and must be refreshed."
Write-Host ""
Write-Host "This script is read-only for the Cosmos backup policy: it does not change backup mode, retention, redundancy, throughput, data, or restore anything." -ForegroundColor Yellow
Write-Host "A successful verification proves policy visibility only; a restore drill remains a separate acceptance gate." -ForegroundColor Yellow
