param(
  [string]$ResourceGroup = "rg-marketos-dev",
  [string]$StaticWebApp = "marketos-preview",
  [string]$Location = "westeurope",
  [string]$Database = "marketos",
  [string]$Container = "userState",
  [string]$EntitlementsContainer = "entitlements"
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is not installed or not available in PATH."
  }
}

Require-Command "az"

Write-Host "Checking Azure sign-in..." -ForegroundColor Cyan
$subscriptionId = az account show --query id -o tsv
if (-not $subscriptionId) { throw "Azure account is not signed in." }

$suffix = $subscriptionId.Replace("-", "").Substring(0, 8).ToLower()
$CosmosAccount = "marketos-$suffix-dev"

Write-Host "Using Cosmos account: $CosmosAccount" -ForegroundColor Cyan

$existing = $null
try {
  $existing = az cosmosdb show --name $CosmosAccount --resource-group $ResourceGroup --output json 2>$null | ConvertFrom-Json
} catch {
  $existing = $null
}

if (-not $existing) {
  Write-Host "Creating Cosmos DB Free Tier account..." -ForegroundColor Cyan
  $createOutput = & az cosmosdb create --name $CosmosAccount --resource-group $ResourceGroup --locations "regionName=$Location" "failoverPriority=0" "isZoneRedundant=False" --default-consistency-level Session --enable-free-tier true --tags project=MarketOS environment=dev managedBy=bootstrap-cosmos --output json 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Cosmos DB creation failed." -ForegroundColor Red
    Write-Host "No paid fallback was created automatically." -ForegroundColor Yellow
    Write-Host "This can happen if the subscription already uses its Cosmos Free Tier account or Azure for Students blocks the selected region." -ForegroundColor Yellow
    Write-Host ""
    Write-Host $createOutput
    exit 2
  }
}

Write-Host "Creating/confirming SQL database..." -ForegroundColor Cyan
az cosmosdb sql database create --account-name $CosmosAccount --resource-group $ResourceGroup --name $Database --output none

Write-Host "Creating/confirming userState container..." -ForegroundColor Cyan
az cosmosdb sql container create --account-name $CosmosAccount --resource-group $ResourceGroup --database-name $Database --name $Container --partition-key-path "/userId" --throughput 400 --output none

Write-Host "Creating/confirming entitlements container..." -ForegroundColor Cyan
az cosmosdb sql container create --account-name $CosmosAccount --resource-group $ResourceGroup --database-name $Database --name $EntitlementsContainer --partition-key-path "/userId" --throughput 400 --output none

Write-Host "Reading Cosmos connection string securely..." -ForegroundColor Cyan
$connectionString = az cosmosdb keys list --name $CosmosAccount --resource-group $ResourceGroup --type connection-strings --query "connectionStrings[0].connectionString" --output tsv
if (-not $connectionString) { throw "Could not read Cosmos DB connection string." }

Write-Host "Connecting Cosmos DB to MarketOS Static Web App..." -ForegroundColor Cyan
az staticwebapp appsettings set --name $StaticWebApp --resource-group $ResourceGroup --setting-names "USER_DATA_PROVIDER=cosmos" "ENTITLEMENT_DATA_PROVIDER=cosmos" "COSMOS_CONNECTION_STRING=$connectionString" "COSMOS_DATABASE=$Database" "COSMOS_CONTAINER=$Container" "COSMOS_ENTITLEMENTS_CONTAINER=$EntitlementsContainer" --output none

Write-Host ""
Write-Host "MarketOS persistent cloud storage is ready." -ForegroundColor Green
Write-Host "Resource group: $ResourceGroup"
Write-Host "Cosmos account: $CosmosAccount"
Write-Host "Database: $Database"
Write-Host "User state container: $Container"
Write-Host "Entitlements container: $EntitlementsContainer"
Write-Host "Partition key: /userId"
Write-Host "Static Web App: $StaticWebApp"
Write-Host ""
Write-Host "The Cosmos connection string was written directly to Azure app settings and was not printed." -ForegroundColor Green
