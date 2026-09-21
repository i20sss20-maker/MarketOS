param(
  [string]$ResourceGroup = "rg-marketos-dev",
  [string]$StaticWebApp = "marketos-preview",
  [string]$Location = "westeurope",
  [string]$Database = "marketos",
  [string]$UserStateContainer = "userState",
  [string]$EntitlementsContainer = "entitlements",
  [string]$ForecastJournalContainer = "forecastJournal",
  [ValidateRange(400, 1000)]
  [int]$SharedThroughput = 1000,
  [ValidateRange(1, 500)]
  [int]$ForecastDailyHardCap = 10,
  [ValidateRange(100, 100000)]
  [int]$MarketApiDailyHardCap = 1000
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is not installed or not available in PATH."
  }
}

function Run-AzJson([string[]]$Arguments) {
  $output = & az @Arguments --output json 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ($output -join [Environment]::NewLine)
  }
  return ($output -join [Environment]::NewLine) | ConvertFrom-Json
}

function Ensure-SharedContainer([string]$Account, [string]$Container) {
  $existing = $null
  try {
    $existing = Run-AzJson @("cosmosdb", "sql", "container", "show", "--account-name", $Account, "--resource-group", $ResourceGroup, "--database-name", $Database, "--name", $Container)
  } catch {
    $existing = $null
  }

  if (-not $existing) {
    Write-Host "Creating shared-throughput container $Container..." -ForegroundColor Cyan
    & az cosmosdb sql container create --account-name $Account --resource-group $ResourceGroup --database-name $Database --name $Container --partition-key-path "/userId" --output none
    if ($LASTEXITCODE -ne 0) {
      throw "Could not create container '$Container'."
    }
    $existing = Run-AzJson @("cosmosdb", "sql", "container", "show", "--account-name", $Account, "--resource-group", $ResourceGroup, "--database-name", $Database, "--name", $Container)
  }

  $partitionPath = $existing.resource.partitionKey.paths[0]
  if ($partitionPath -ne "/userId") {
    throw "Container '$Container' must use partition key /userId. Existing data was not modified."
  }

  # A shared-throughput container must not own dedicated throughput. If this
  # command succeeds, refuse to continue rather than silently retaining extra
  # provisioned RU/s that can exceed the Free Tier allowance.
  $dedicated = $null
  try {
    $dedicated = Run-AzJson @("cosmosdb", "sql", "container", "throughput", "show", "--account-name", $Account, "--resource-group", $ResourceGroup, "--database-name", $Database, "--name", $Container)
  } catch {
    $dedicated = $null
  }

  if ($dedicated) {
    throw "Container '$Container' has dedicated throughput. Automatic migration is intentionally disabled to avoid data loss or unexpected Azure charges."
  }
}

Require-Command "az"

Write-Host "Checking Azure sign-in..." -ForegroundColor Cyan
$subscriptionId = az account show --query id --output tsv
if (-not $subscriptionId) {
  throw "Azure account is not signed in."
}

$resourceGroupExists = az group exists --name $ResourceGroup --output tsv
if ($resourceGroupExists -ne "true") {
  throw "Resource group '$ResourceGroup' does not exist. Run bootstrap-preview.ps1 first; this script never creates an unexpected resource group."
}

try {
  $null = Run-AzJson @("staticwebapp", "show", "--name", $StaticWebApp, "--resource-group", $ResourceGroup)
} catch {
  throw "Static Web App '$StaticWebApp' does not exist in '$ResourceGroup'."
}

$suffix = $subscriptionId.Replace("-", "").Substring(0, 8).ToLower()
$CosmosAccount = "marketos-$suffix-dev"

$account = $null
try {
  $account = Run-AzJson @("cosmosdb", "show", "--name", $CosmosAccount, "--resource-group", $ResourceGroup)
} catch {
  $account = $null
}

if (-not $account) {
  Write-Host "Creating MarketOS Cosmos DB Free Tier account..." -ForegroundColor Cyan
  $createOutput = & az cosmosdb create --name $CosmosAccount --resource-group $ResourceGroup --locations "regionName=$Location" "failoverPriority=0" "isZoneRedundant=False" --default-consistency-level Session --enable-free-tier true --tags project=MarketOS environment=dev managedBy=bootstrap-production-storage --output json 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host ($createOutput -join [Environment]::NewLine)
    throw "Cosmos Free Tier creation failed. No paid fallback was created."
  }
  $account = Run-AzJson @("cosmosdb", "show", "--name", $CosmosAccount, "--resource-group", $ResourceGroup)
}

if ($account.enableFreeTier -ne $true) {
  throw "The existing Cosmos account is not Free Tier. This script refuses to add production storage automatically because it could create charges."
}

$databaseExists = $null
try {
  $databaseExists = Run-AzJson @("cosmosdb", "sql", "database", "show", "--account-name", $CosmosAccount, "--resource-group", $ResourceGroup, "--name", $Database)
} catch {
  $databaseExists = $null
}

if (-not $databaseExists) {
  Write-Host "Creating shared-throughput database $Database at $SharedThroughput RU/s..." -ForegroundColor Cyan
  & az cosmosdb sql database create --account-name $CosmosAccount --resource-group $ResourceGroup --name $Database --throughput $SharedThroughput --output none
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create the shared-throughput database."
  }
}

$databaseThroughput = $null
try {
  $databaseThroughput = Run-AzJson @("cosmosdb", "sql", "database", "throughput", "show", "--account-name", $CosmosAccount, "--resource-group", $ResourceGroup, "--name", $Database)
} catch {
  throw "Database '$Database' does not use shared throughput. Automatic migration is disabled because existing dedicated containers may contain data or incur charges."
}

$currentThroughput = [int]$databaseThroughput.resource.throughput
if ($currentThroughput -gt 1000) {
  throw "Shared database throughput is $currentThroughput RU/s, above the 1000 RU/s Cosmos Free Tier allowance. No settings were changed."
}

Ensure-SharedContainer -Account $CosmosAccount -Container $UserStateContainer
Ensure-SharedContainer -Account $CosmosAccount -Container $EntitlementsContainer
Ensure-SharedContainer -Account $CosmosAccount -Container $ForecastJournalContainer

Write-Host "Reading Cosmos connection string securely..." -ForegroundColor Cyan
$connectionString = az cosmosdb keys list --name $CosmosAccount --resource-group $ResourceGroup --type connection-strings --query "connectionStrings[0].connectionString" --output tsv
if (-not $connectionString) {
  throw "Could not read the Cosmos connection string."
}

Write-Host "Writing MarketOS storage and quota settings..." -ForegroundColor Cyan
& az staticwebapp appsettings set --name $StaticWebApp --resource-group $ResourceGroup --setting-names "USER_DATA_PROVIDER=cosmos" "ENTITLEMENT_DATA_PROVIDER=cosmos" "COSMOS_CONNECTION_STRING=$connectionString" "COSMOS_DATABASE=$Database" "COSMOS_CONTAINER=$UserStateContainer" "COSMOS_ENTITLEMENTS_CONTAINER=$EntitlementsContainer" "FORECAST_JOURNAL_ENABLED=true" "FORECAST_JOURNAL_CONTAINER=$ForecastJournalContainer" "FORECAST_DAILY_HARD_CAP=$ForecastDailyHardCap" "MARKET_API_DAILY_HARD_CAP=$MarketApiDailyHardCap" --output none
if ($LASTEXITCODE -ne 0) {
  throw "Could not write MarketOS Static Web App storage settings."
}

Write-Host ""
Write-Host "MarketOS production storage foundation is configured." -ForegroundColor Green
Write-Host "Resource group: $ResourceGroup"
Write-Host "Static Web App: $StaticWebApp"
Write-Host "Cosmos account: $CosmosAccount"
Write-Host "Database: $Database ($currentThroughput RU/s shared)"
Write-Host "Containers: $UserStateContainer, $EntitlementsContainer, $ForecastJournalContainer"
Write-Host "Partition key: /userId"
Write-Host "Forecast hard cap: $ForecastDailyHardCap per UTC day (operator ceiling)"
Write-Host "Market API hard cap: $MarketApiDailyHardCap weighted units per UTC day (operator ceiling)"
Write-Host ""
Write-Host "No market-data provider, paid subscription, production flag or provider API key was enabled by this script." -ForegroundColor Yellow
Write-Host "The Cosmos connection string was written directly to Azure app settings and was not printed." -ForegroundColor Green
