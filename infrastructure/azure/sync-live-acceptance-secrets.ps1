param(
  [string]$ResourceGroup = "rg-marketos-dev",
  [string]$StaticWebApp = "marketos-preview",
  [string]$GitHubRepo = "i20sss20-maker/MarketOS",
  [string]$GitHubEnvironment = "azure-production"
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is not installed or not available in PATH."
  }
}

function Require-SecretValue([object]$Settings, [string]$Name, [int]$MinimumLength) {
  if (-not $Settings.PSObject.Properties[$Name]) {
    throw "Azure Static Web App setting '$Name' is missing."
  }

  $value = [string]$Settings.$Name
  if ([string]::IsNullOrWhiteSpace($value) -or $value.Length -lt $MinimumLength) {
    throw "Azure Static Web App setting '$Name' is empty or too short."
  }

  return $value
}

Require-Command "az"
Require-Command "gh"

az account show --output none
if ($LASTEXITCODE -ne 0) {
  throw "Azure CLI is not signed in."
}

gh auth status --hostname github.com 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "GitHub CLI is not authenticated."
}

az staticwebapp show --name $StaticWebApp --resource-group $ResourceGroup --output none
if ($LASTEXITCODE -ne 0) {
  throw "Static Web App '$StaticWebApp' does not exist in '$ResourceGroup'."
}

gh api "repos/$GitHubRepo/environments/$GitHubEnvironment" 1>$null
if ($LASTEXITCODE -ne 0) {
  throw "GitHub environment '$GitHubEnvironment' does not exist in '$GitHubRepo'."
}

$settingsJson = $null
$settings = $null
$cosmosConnectionString = $null
$workerSecret = $null

try {
  $settingsJson = az staticwebapp appsettings list --name $StaticWebApp --resource-group $ResourceGroup --output json
  if ($LASTEXITCODE -ne 0 -or -not $settingsJson) {
    throw "Could not read Static Web Apps backend settings."
  }

  $settings = $settingsJson | ConvertFrom-Json
  $cosmosConnectionString = Require-SecretValue $settings "COSMOS_CONNECTION_STRING" 20
  $workerSecret = Require-SecretValue $settings "MARKETOS_WORKER_SECRET" 32

  Write-Host "Syncing the production Cosmos acceptance credential to GitHub through stdin..." -ForegroundColor Cyan
  $cosmosConnectionString | gh secret set COSMOS_CONNECTION_STRING --env $GitHubEnvironment --repo $GitHubRepo
  if ($LASTEXITCODE -ne 0) {
    throw "Could not store COSMOS_CONNECTION_STRING in GitHub environment '$GitHubEnvironment'."
  }

  Write-Host "Syncing the hosted evaluator credential to GitHub through stdin..." -ForegroundColor Cyan
  $workerSecret | gh secret set MARKETOS_WORKER_SECRET --env $GitHubEnvironment --repo $GitHubRepo
  if ($LASTEXITCODE -ne 0) {
    throw "Could not store MARKETOS_WORKER_SECRET in GitHub environment '$GitHubEnvironment'."
  }

  $secretNames = @(gh secret list --env $GitHubEnvironment --repo $GitHubRepo --json name --jq ".[].name")
  if ($LASTEXITCODE -ne 0) {
    throw "Could not verify GitHub environment secret names."
  }

  foreach ($requiredName in @("COSMOS_CONNECTION_STRING", "MARKETOS_WORKER_SECRET")) {
    if ($secretNames -notcontains $requiredName) {
      throw "GitHub did not confirm '$requiredName' in environment '$GitHubEnvironment'."
    }
  }

  Write-Host ""
  Write-Host "MarketOS live-acceptance credential sync completed." -ForegroundColor Green
  Write-Host "Azure Static Web App: $StaticWebApp"
  Write-Host "GitHub environment: $GitHubEnvironment"
  Write-Host "Cosmos and evaluator acceptance will now use the same credential values configured on the app." -ForegroundColor Green
  Write-Host "No secret value was printed, written to a file, committed, or passed as a command-line argument." -ForegroundColor Green
  Write-Host "AZURE_CREDENTIALS and COSMOS_RESTORE_CONNECTION_STRING are intentionally not managed by this helper." -ForegroundColor Yellow
}
finally {
  $cosmosConnectionString = $null
  $workerSecret = $null
  $settings = $null
  $settingsJson = $null
  [GC]::Collect()
}
