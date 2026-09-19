param(
  [string]$ResourceGroup = "rg-marketos-dev",
  [string]$AppName = "marketos-preview",
  [string]$Location = "westeurope",
  [string]$GitHubRepo = "i20sss20-maker/MarketOS"
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is not installed or not available in PATH."
  }
}

Require-Command "az"

Write-Host "Checking Azure sign-in..." -ForegroundColor Cyan
az account show --output none

Write-Host "Creating/confirming resource group $ResourceGroup..." -ForegroundColor Cyan
az group create --name $ResourceGroup --location $Location --tags project=MarketOS environment=dev managedBy=bootstrap-preview --output none

$existing = $null
try {
  $existing = az staticwebapp show --name $AppName --resource-group $ResourceGroup --output json 2>$null | ConvertFrom-Json
} catch {
  $existing = $null
}

if (-not $existing) {
  Write-Host "Creating Azure Static Web App $AppName (Free)..." -ForegroundColor Cyan
  $createOutput = & az staticwebapp create --name $AppName --resource-group $ResourceGroup --location $Location --sku Free --output json 2>&1

  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Azure Static Web Apps creation failed." -ForegroundColor Red
    Write-Host "Azure for Students can restrict deployment regions by policy." -ForegroundColor Yellow
    Write-Host "Static Web Apps commonly requires one of: centralus, eastus2, westus2, westeurope, eastasia." -ForegroundColor Yellow
    Write-Host "Nothing outside $ResourceGroup was modified." -ForegroundColor Yellow
    Write-Host ""
    Write-Host $createOutput
    exit 2
  }
}

Write-Host "Configuring safe development app settings..." -ForegroundColor Cyan
az staticwebapp appsettings set --name $AppName --resource-group $ResourceGroup --setting-names MARKET_DATA_PROVIDER=demo MARKET_EVENTS_PROVIDER=demo MARKET_FEED_PROVIDER=demo AI_PROVIDER=local-chart-engine MARKETOS_ENVIRONMENT=azure-preview --output none

$hostname = az staticwebapp show --name $AppName --resource-group $ResourceGroup --query "defaultHostname" --output tsv
$token = az staticwebapp secrets list --name $AppName --resource-group $ResourceGroup --query "properties.apiKey" --output tsv

Write-Host ""
Write-Host "MarketOS Azure preview resource is ready." -ForegroundColor Green
Write-Host "Resource group: $ResourceGroup"
Write-Host "Static Web App: $AppName"
if ($hostname) {
  Write-Host "URL: https://$hostname" -ForegroundColor Green
}

if (Get-Command "gh" -ErrorAction SilentlyContinue) {
  Write-Host "GitHub CLI detected. Saving deployment token as repository secret..." -ForegroundColor Cyan
  $token | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --repo $GitHubRepo
  if ($LASTEXITCODE -eq 0) {
    Write-Host "GitHub secret AZURE_STATIC_WEB_APPS_API_TOKEN saved." -ForegroundColor Green
  } else {
    Write-Host "Could not save the GitHub secret automatically. Add it manually in GitHub Settings > Secrets and variables > Actions." -ForegroundColor Yellow
  }
} else {
  Write-Host ""
  Write-Host "GitHub CLI is not installed, so the deployment token was NOT written anywhere." -ForegroundColor Yellow
  Write-Host "Add this token manually as GitHub Actions secret AZURE_STATIC_WEB_APPS_API_TOKEN:" -ForegroundColor Yellow
  Write-Host $token
}

Write-Host ""
Write-Host "Then run GitHub Actions > Azure Preview Deploy > Run workflow." -ForegroundColor Cyan
