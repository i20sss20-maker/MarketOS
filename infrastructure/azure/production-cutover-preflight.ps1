param(
  [string]$ResourceGroup = "rg-marketos-dev",
  [string]$StaticWebApp = "marketos-preview",
  [string]$GitHubRepo = "i20sss20-maker/MarketOS"
)

$ErrorActionPreference = "Stop"
$script:Blockers = New-Object System.Collections.Generic.List[string]

function Add-Check([bool]$Passed, [string]$Label, [string]$Failure) {
  if ($Passed) {
    Write-Host "[PASS] $Label" -ForegroundColor Green
  } else {
    Write-Host "[BLOCKER] $Failure" -ForegroundColor Red
    $script:Blockers.Add($Failure)
  }
}

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is not installed or not available in PATH."
  }
}

function Has-Text($Settings, [string]$Name) {
  if (-not $Settings.PSObject.Properties[$Name]) { return $false }
  return -not [string]::IsNullOrWhiteSpace([string]$Settings.$Name)
}

function Equals-Setting($Settings, [string]$Name, [string[]]$Allowed) {
  if (-not (Has-Text $Settings $Name)) { return $false }
  $value = ([string]$Settings.$Name).Trim().ToLowerInvariant()
  return $Allowed -contains $value
}

function Positive-Integer-Setting($Settings, [string]$Name) {
  if (-not (Has-Text $Settings $Name)) { return $false }
  $value = 0
  if (-not [int]::TryParse(([string]$Settings.$Name).Trim(), [ref]$value)) { return $false }
  return $value -gt 0
}

function GitHub-Environment-SecretNames([string]$Environment) {
  $endpoint = "repos/$GitHubRepo/environments/$Environment/secrets?per_page=100"
  $payload = gh api $endpoint 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $payload) {
    return $null
  }
  $parsed = $payload | ConvertFrom-Json
  return @($parsed.secrets | ForEach-Object { $_.name })
}

Require-Command "az"
Require-Command "gh"

az account show --output none
Add-Check ($LASTEXITCODE -eq 0) "Azure CLI authenticated" "Azure CLI is not signed in."

gh auth status --hostname github.com 1>$null 2>$null
Add-Check ($LASTEXITCODE -eq 0) "GitHub CLI authenticated" "GitHub CLI is not authenticated."

if ($script:Blockers.Count -gt 0) {
  throw "Production cutover preflight stopped before reading configuration."
}

$resourceGroupExists = az group exists --name $ResourceGroup --output tsv
Add-Check ($resourceGroupExists -eq "true") "MarketOS resource group exists" "Resource group '$ResourceGroup' does not exist."

$swaJson = az staticwebapp show --name $StaticWebApp --resource-group $ResourceGroup --output json 2>$null
$swa = $null
if ($LASTEXITCODE -eq 0 -and $swaJson) {
  $swa = $swaJson | ConvertFrom-Json
}
Add-Check ($null -ne $swa -and -not [string]::IsNullOrWhiteSpace([string]$swa.defaultHostname)) "MarketOS Static Web App exists" "Static Web App '$StaticWebApp' is missing."

if (-not $swa) {
  throw "Production cutover preflight cannot continue without the MarketOS Static Web App."
}

$settingsJson = az staticwebapp appsettings list --name $StaticWebApp --resource-group $ResourceGroup --output json 2>$null
$settings = $null
if ($LASTEXITCODE -eq 0 -and $settingsJson) {
  $settings = $settingsJson | ConvertFrom-Json
}
Add-Check ($null -ne $settings) "Static Web Apps backend settings are readable" "Could not read MarketOS backend settings."

if (-not $settings) {
  throw "Production cutover preflight cannot inspect backend settings."
}

Add-Check (Equals-Setting $settings "MARKETOS_ENVIRONMENT" @("production", "azure-production")) "Production environment declared" "MARKETOS_ENVIRONMENT is not production/azure-production."
Add-Check (Equals-Setting $settings "MARKETOS_REQUIRE_REAL_DATA" @("true")) "Strict real-data mode enabled" "MARKETOS_REQUIRE_REAL_DATA is not true."
Add-Check (Has-Text $settings "MARKETOS_WEB_ORIGIN") "HTTPS MarketOS origin configured" "MARKETOS_WEB_ORIGIN is missing."

$originValid = $false
if (Has-Text $settings "MARKETOS_WEB_ORIGIN") {
  try {
    $origin = [Uri]([string]$settings.MARKETOS_WEB_ORIGIN)
    $originValid = $origin.Scheme -eq "https" -and [string]::IsNullOrWhiteSpace($origin.Query) -and [string]::IsNullOrWhiteSpace($origin.Fragment)
  } catch {
    $originValid = $false
  }
}
Add-Check $originValid "MarketOS origin is a valid HTTPS origin" "MARKETOS_WEB_ORIGIN is not a valid HTTPS origin."

Add-Check (Equals-Setting $settings "MARKET_DATA_PROVIDER" @("twelvedata")) "Primary market provider selected" "MARKET_DATA_PROVIDER is not twelvedata."
Add-Check (Equals-Setting $settings "MARKET_EVENTS_PROVIDER" @("twelvedata")) "Market-events provider selected" "MARKET_EVENTS_PROVIDER is not twelvedata."
Add-Check (Equals-Setting $settings "MARKET_FEED_PROVIDER" @("twelvedata")) "Company-feed provider selected" "MARKET_FEED_PROVIDER is not twelvedata."
Add-Check (Has-Text $settings "TWELVE_DATA_API_KEY") "Provider credential present in Azure" "TWELVE_DATA_API_KEY is missing in Azure."

Add-Check (Equals-Setting $settings "MARKET_DATA_TIMING" @("realtime", "delayed", "end-of-day")) "Market-data timing declared" "MARKET_DATA_TIMING is missing or invalid."
if (Equals-Setting $settings "MARKET_DATA_TIMING" @("delayed")) {
  Add-Check (Positive-Integer-Setting $settings "MARKET_DATA_DELAY_MINUTES") "Delayed-data minutes declared" "MARKET_DATA_DELAY_MINUTES is missing or invalid."
}
Add-Check (Equals-Setting $settings "MARKET_DATA_USAGE_SCOPE" @("personal", "commercial")) "Market-data usage scope declared" "MARKET_DATA_USAGE_SCOPE is missing or invalid."
Add-Check (Equals-Setting $settings "MARKET_DATA_RIGHTS_CONFIRMED" @("true")) "Market-data rights declaration confirmed" "MARKET_DATA_RIGHTS_CONFIRMED is not true."
Add-Check (Has-Text $settings "MARKET_DATA_RIGHTS_CONFIRMED_AT") "Market-data rights confirmation date present" "MARKET_DATA_RIGHTS_CONFIRMED_AT is missing."

Add-Check (Equals-Setting $settings "USER_DATA_PROVIDER" @("cosmos")) "User data uses Cosmos" "USER_DATA_PROVIDER is not cosmos."
Add-Check (Equals-Setting $settings "ENTITLEMENT_DATA_PROVIDER" @("cosmos")) "Entitlements use Cosmos" "ENTITLEMENT_DATA_PROVIDER is not cosmos."
Add-Check (Has-Text $settings "COSMOS_CONNECTION_STRING") "Cosmos credential present" "COSMOS_CONNECTION_STRING is missing."
Add-Check (Has-Text $settings "COSMOS_DATABASE") "Cosmos database configured" "COSMOS_DATABASE is missing."
Add-Check (Has-Text $settings "COSMOS_CONTAINER") "User-state container configured" "COSMOS_CONTAINER is missing."
Add-Check (Has-Text $settings "COSMOS_ENTITLEMENTS_CONTAINER") "Entitlements container configured" "COSMOS_ENTITLEMENTS_CONTAINER is missing."
Add-Check (Equals-Setting $settings "FORECAST_JOURNAL_ENABLED" @("true")) "Forecast journal enabled" "FORECAST_JOURNAL_ENABLED is not true."
Add-Check (Has-Text $settings "FORECAST_JOURNAL_CONTAINER") "Forecast journal container configured" "FORECAST_JOURNAL_CONTAINER is missing."

Add-Check (Equals-Setting $settings "MARKETOS_COSMOS_BACKUP_VERIFIED" @("true")) "Cosmos backup policy verified" "MARKETOS_COSMOS_BACKUP_VERIFIED is not true."
Add-Check (Equals-Setting $settings "MARKETOS_COSMOS_BACKUP_MODE" @("periodic", "continuous")) "Cosmos backup mode recorded" "MARKETOS_COSMOS_BACKUP_MODE is missing or invalid."
$backupVerificationFresh = $false
if (Has-Text $settings "MARKETOS_COSMOS_BACKUP_VERIFIED_AT") {
  $verifiedAt = [datetime]::MinValue
  if ([datetime]::TryParseExact(([string]$settings.MARKETOS_COSMOS_BACKUP_VERIFIED_AT).Trim(), "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$verifiedAt)) {
    $ageDays = [math]::Floor(((Get-Date).ToUniversalTime().Date - $verifiedAt.ToUniversalTime().Date).TotalDays)
    $backupVerificationFresh = $ageDays -ge 0 -and $ageDays -le 30
  }
}
Add-Check $backupVerificationFresh "Cosmos backup verification is current" "MARKETOS_COSMOS_BACKUP_VERIFIED_AT is missing, future-dated, or older than 30 days."

Add-Check (Positive-Integer-Setting $settings "FORECAST_DAILY_HARD_CAP") "Forecast daily hard cap configured" "FORECAST_DAILY_HARD_CAP is missing or invalid."
Add-Check (Positive-Integer-Setting $settings "MARKET_DATA_DAILY_REQUEST_HARD_CAP") "Market-data daily hard cap configured" "MARKET_DATA_DAILY_REQUEST_HARD_CAP is missing or invalid."

Add-Check (Equals-Setting $settings "MARKETOS_METRIC_ALERTS_CONFIGURED" @("true")) "Metric alerts declared configured" "MARKETOS_METRIC_ALERTS_CONFIGURED is not true."
Add-Check (Equals-Setting $settings "MARKETOS_COST_BUDGET_CONFIGURED" @("true")) "Cost budget declared configured" "MARKETOS_COST_BUDGET_CONFIGURED is not true."
Add-Check (Has-Text $settings "APPLICATIONINSIGHTS_CONNECTION_STRING") "Application Insights linked" "APPLICATIONINSIGHTS_CONNECTION_STRING is missing."

Add-Check (Equals-Setting $settings "FORECAST_EVALUATION_ENABLED" @("true")) "Server forecast evaluation enabled" "FORECAST_EVALUATION_ENABLED is not true."
$workerSecretValid = (Has-Text $settings "MARKETOS_WORKER_SECRET") -and ([string]$settings.MARKETOS_WORKER_SECRET).Length -ge 32
Add-Check $workerSecretValid "Forecast evaluator worker credential present" "MARKETOS_WORKER_SECRET is missing or too short."

$productionSecrets = GitHub-Environment-SecretNames "azure-production"
Add-Check ($null -ne $productionSecrets) "GitHub azure-production environment readable" "GitHub environment 'azure-production' is missing or unreadable."
if ($productionSecrets) {
  Add-Check ($productionSecrets -contains "AZURE_STATIC_WEB_APPS_API_TOKEN") "Production deployment token secret exists" "AZURE_STATIC_WEB_APPS_API_TOKEN is missing from azure-production."
  Add-Check ($productionSecrets -contains "COSMOS_CONNECTION_STRING") "Live acceptance Cosmos secret exists" "COSMOS_CONNECTION_STRING is missing from azure-production; Cosmos persistence/quota/erasure and recovery-marker workflows cannot run."
  Add-Check ($productionSecrets -contains "MARKETOS_WORKER_SECRET") "Hosted evaluator worker secret exists" "MARKETOS_WORKER_SECRET is missing from azure-production; hosted forecast-evaluation acceptance cannot run."
  Add-Check ($productionSecrets -contains "AZURE_CREDENTIALS") "Telemetry Azure management credential exists" "AZURE_CREDENTIALS is missing from azure-production; Application Insights live acceptance cannot run."
}

$providerSecrets = GitHub-Environment-SecretNames "market-data-acceptance"
Add-Check ($null -ne $providerSecrets) "GitHub market-data-acceptance environment readable" "GitHub environment 'market-data-acceptance' is missing or unreadable."
if ($providerSecrets) {
  Add-Check ($providerSecrets -contains "TWELVE_DATA_API_KEY") "Provider acceptance secret exists" "TWELVE_DATA_API_KEY is missing from market-data-acceptance."
}

Write-Host ""
Write-Host "MarketOS production cutover preflight" -ForegroundColor Cyan
Write-Host "Static Web App: $StaticWebApp"
Write-Host "Default host: https://$($swa.defaultHostname)"
Write-Host "Blockers: $($script:Blockers.Count)"
Write-Host ""
Write-Host "No secret values were printed. This preflight checks configuration presence/shape only; live acceptance workflows are still required." -ForegroundColor Yellow
Write-Host "COSMOS_RESTORE_CONNECTION_STRING is intentionally not required here; create it only after restoring the exact release marker to a separate Cosmos account." -ForegroundColor Yellow

if ($script:Blockers.Count -gt 0) {
  exit 2
}

Write-Host "Configuration preflight passed. Continue with exact-SHA live acceptance and production deployment." -ForegroundColor Green
