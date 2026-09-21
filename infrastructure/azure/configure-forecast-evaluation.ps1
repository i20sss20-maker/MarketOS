param(
  [string]$ResourceGroup = "rg-marketos-dev",
  [string]$StaticWebApp = "marketos-preview",
  [string]$FunctionApp = "",
  [switch]$RunOneLiveEvaluation,
  [switch]$IUnderstandEvaluationConsumesMarketData
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command "az" -ErrorAction SilentlyContinue)) {
  throw "Azure CLI is required."
}

az account show --output none
if ($LASTEXITCODE -ne 0) {
  throw "Azure CLI is not signed in."
}

$subscriptionId = az account show --query id --output tsv
if (-not $subscriptionId) {
  throw "Could not resolve the active Azure subscription."
}

if (-not $FunctionApp) {
  $suffix = $subscriptionId.Replace("-", "").Substring(0, 8).ToLower()
  $FunctionApp = "marketos-alert-worker-$suffix"
}

$swa = az staticwebapp show --name $StaticWebApp --resource-group $ResourceGroup --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $swa.defaultHostname) {
  throw "Static Web App '$StaticWebApp' does not exist in '$ResourceGroup'."
}

$worker = az functionapp show --name $FunctionApp --resource-group $ResourceGroup --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $worker.id) {
  throw "Function App '$FunctionApp' does not exist. Deploy the current MarketOS alert worker before enabling evaluation."
}

$swaSettings = az staticwebapp appsettings list --name $StaticWebApp --resource-group $ResourceGroup --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {
  throw "Could not read MarketOS API settings."
}

if ($swaSettings.properties.MARKETOS_REQUIRE_REAL_DATA -ne "true" -and $swaSettings.properties.MARKETOS_ENVIRONMENT -notin @("production", "azure-production")) {
  throw "Real-data mode must be configured before enabling server forecast evaluation."
}

if ($swaSettings.properties.USER_DATA_PROVIDER -ne "cosmos" -or $swaSettings.properties.FORECAST_JOURNAL_ENABLED -ne "true") {
  throw "Persistent Cosmos forecast storage must be configured before enabling evaluation."
}

$workerSecret = [string]$swaSettings.properties.MARKETOS_WORKER_SECRET
if ($workerSecret.Trim().Length -lt 32) {
  throw "The MarketOS API worker credential is missing or too short. Configure the existing background worker first."
}

$endpoint = "https://$($swa.defaultHostname)/api/internal/forecasts/evaluate"

try {
  Write-Host "Configuring the existing MarketOS worker for forecast evaluation..." -ForegroundColor Cyan
  az functionapp config appsettings set --name $FunctionApp --resource-group $ResourceGroup --settings "MARKETOS_WORKER_SECRET=$workerSecret" "MARKETOS_FORECAST_EVALUATION_URL=$endpoint" "FORECAST_EVALUATION_ENABLED=true" --output none
  if ($LASTEXITCODE -ne 0) {
    throw "Could not configure the existing worker."
  }

  az functionapp restart --name $FunctionApp --resource-group $ResourceGroup --output none
  if ($LASTEXITCODE -ne 0) {
    throw "Could not restart the existing worker."
  }

  $timerName = ""
  for ($attempt = 0; $attempt -lt 12; $attempt++) {
    Start-Sleep -Seconds 5
    $timerName = az functionapp function list --name $FunctionApp --resource-group $ResourceGroup --query "[?contains(name, 'forecastEvaluationTimer')].name | [0]" --output tsv
    if ($LASTEXITCODE -eq 0 -and $timerName) {
      break
    }
  }

  if (-not $timerName) {
    throw "The deployed worker does not expose forecastEvaluationTimer. Redeploy the current MarketOS worker before enabling the API flag."
  }

  Write-Host "Timer indexed: $timerName" -ForegroundColor Green

  # Enable the API only after the worker has restarted and indexed the timer.
  az staticwebapp appsettings set --name $StaticWebApp --resource-group $ResourceGroup --setting-names "FORECAST_EVALUATION_ENABLED=true" --output none
  if ($LASTEXITCODE -ne 0) {
    throw "Worker is configured, but the MarketOS API evaluation flag could not be enabled."
  }

  if ($RunOneLiveEvaluation) {
    if (-not $IUnderstandEvaluationConsumesMarketData) {
      throw "Live evaluation can consume market-data/provider quota. Re-run with -IUnderstandEvaluationConsumesMarketData to authorize one bounded sweep."
    }

    Write-Host "Running one bounded live evaluation sweep..." -ForegroundColor Cyan
    $headers = @{
      "x-marketos-worker-secret" = $workerSecret
      "content-type" = "application/json"
    }

    $response = Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -Body "{}" -TimeoutSec 95
    if (-not $response.ok -or $response.enabled -ne $true) {
      throw "The live forecast evaluation endpoint did not confirm an enabled bounded sweep."
    }

    Write-Host "Live sweep accepted. checked=$($response.checked) resolved=$($response.resolved) pending=$($response.pending) failed=$($response.failed)" -ForegroundColor Green
  }

  Write-Host ""
  Write-Host "MarketOS server forecast evaluation is configured." -ForegroundColor Green
  Write-Host "Function App: $FunctionApp"
  Write-Host "Timer: forecastEvaluationTimer / every 15 minutes"
  Write-Host "Endpoint: $endpoint"
  Write-Host "The worker credential was reused in memory and was never printed." -ForegroundColor Green
  Write-Host "A configured timer is not proof of predictive accuracy; hosted outcome evidence must still be reviewed." -ForegroundColor Yellow
} finally {
  $workerSecret = $null
  [GC]::Collect()
}
