param(
  [string]$ResourceGroup = "rg-marketos-dev",
  [string]$StaticWebApp = "marketos-preview",
  [string]$Repository = "i20sss20-maker/MarketOS",
  [ValidateSet("azure-preview", "azure-production", "both")]
  [string]$Target = "both"
)

$ErrorActionPreference = "Stop"

foreach ($command in @("az", "gh")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "Required command '$command' is not installed or not available in PATH."
  }
}

az account show --output none
if ($LASTEXITCODE -ne 0) {
  throw "Azure CLI is not signed in."
}

gh auth status --hostname github.com 1>$null
if ($LASTEXITCODE -ne 0) {
  throw "GitHub CLI is not signed in to github.com."
}

az staticwebapp show --name $StaticWebApp --resource-group $ResourceGroup --output none
if ($LASTEXITCODE -ne 0) {
  throw "Static Web App '$StaticWebApp' does not exist in '$ResourceGroup'."
}

$token = az staticwebapp secrets list --name $StaticWebApp --resource-group $ResourceGroup --query "properties.apiKey" --output tsv
if ($LASTEXITCODE -ne 0 -or -not $token) {
  throw "Could not retrieve the Static Web Apps deployment token."
}

$environments = if ($Target -eq "both") {
  @("azure-preview", "azure-production")
} else {
  @($Target)
}

try {
  foreach ($environment in $environments) {
    gh api "repos/$Repository/environments/$environment" 1>$null
    if ($LASTEXITCODE -ne 0) {
      throw "GitHub environment '$environment' does not exist in '$Repository'. Create/review it before storing deployment credentials."
    }

    Write-Host "Writing deployment token to GitHub environment '$environment'..." -ForegroundColor Cyan
    $token | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --env $environment --repo $Repository
    if ($LASTEXITCODE -ne 0) {
      throw "Could not store the deployment token in GitHub environment '$environment'."
    }

    $secretNames = @(gh secret list --env $environment --repo $Repository --json name --jq ".[].name")
    if ($LASTEXITCODE -ne 0 -or $secretNames -notcontains "AZURE_STATIC_WEB_APPS_API_TOKEN") {
      throw "GitHub did not confirm AZURE_STATIC_WEB_APPS_API_TOKEN in environment '$environment'."
    }
  }
} finally {
  $token = $null
  [GC]::Collect()
}

Write-Host ""
Write-Host "MarketOS deployment credential sync completed." -ForegroundColor Green
Write-Host "Repository: $Repository"
Write-Host "Environments: $($environments -join ', ')"
Write-Host "The deployment token value was never printed." -ForegroundColor Green
Write-Host "This only authorizes deployment; it does not configure market data, Cosmos, or production readiness." -ForegroundColor Yellow
