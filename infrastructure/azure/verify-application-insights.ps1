param(
  [string]$ResourceGroup = "rg-marketos-dev",
  [string]$StaticWebApp = "marketos-preview",
  [Parameter(Mandatory = $true)]
  [string]$ApplicationInsightsApp,
  [ValidateRange(1, 24)]
  [int]$LookbackHours = 1,
  [ValidateRange(10, 180)]
  [int]$IngestionWaitSeconds = 45
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command "az" -ErrorAction SilentlyContinue)) {
  throw "Azure CLI is required."
}

az account show --output none
if ($LASTEXITCODE -ne 0) {
  throw "Azure account is not signed in."
}

$swa = az staticwebapp show --name $StaticWebApp --resource-group $ResourceGroup --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $swa.defaultHostname) {
  throw "Static Web App '$StaticWebApp' does not exist in '$ResourceGroup'."
}

$appSettings = az staticwebapp appsettings list --name $StaticWebApp --resource-group $ResourceGroup --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {
  throw "Could not read Static Web App settings."
}

$connectionString = $null
if ($appSettings.properties) {
  $connectionString = $appSettings.properties.APPLICATIONINSIGHTS_CONNECTION_STRING
} elseif ($appSettings.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  $connectionString = $appSettings.APPLICATIONINSIGHTS_CONNECTION_STRING
}

if (-not $connectionString) {
  throw "APPLICATIONINSIGHTS_CONNECTION_STRING is not linked to the MarketOS Static Web App. Enable Application Insights on the Static Web App first."
}

$match = [regex]::Match($connectionString, "(?i)(?:^|;)InstrumentationKey=([^;]+)")
if (-not $match.Success) {
  throw "The linked Application Insights connection string has no instrumentation key."
}
$linkedInstrumentationKey = $match.Groups[1].Value

$component = az monitor app-insights component show --app $ApplicationInsightsApp --resource-group $ResourceGroup --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $component.appId -or -not $component.instrumentationKey) {
  throw "Could not read Application Insights component '$ApplicationInsightsApp'."
}

if ($component.instrumentationKey -ne $linkedInstrumentationKey) {
  throw "The requested Application Insights component is not the component linked to MarketOS."
}

$healthUrl = "https://$($swa.defaultHostname)/api/health"
Write-Host "Generating one safe health request for telemetry verification..." -ForegroundColor Cyan
$response = Invoke-WebRequest -Uri $healthUrl -Method Get -MaximumRedirection 0 -TimeoutSec 15
if ($response.StatusCode -ne 200) {
  throw "MarketOS health endpoint did not return HTTP 200."
}

Write-Host "Waiting $IngestionWaitSeconds seconds for telemetry ingestion..." -ForegroundColor Cyan
Start-Sleep -Seconds $IngestionWaitSeconds

$query = "requests | where timestamp > ago($($LookbackHours)h) | where url endswith '/api/health' | summarize total=count(), failed=countif(success == false)"
$queryResult = az monitor app-insights query --app $ApplicationInsightsApp --resource-group $ResourceGroup --analytics-query $query --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {
  throw "Application Insights query failed."
}

$rows = @($queryResult.tables[0].rows)
if ($rows.Count -lt 1 -or $rows[0].Count -lt 2) {
  throw "Application Insights returned no usable health-request telemetry."
}

$total = [int]$rows[0][0]
$failed = [int]$rows[0][1]
if ($total -lt 1) {
  throw "No /api/health request was visible in Application Insights during the lookback window."
}

Write-Host ""
Write-Host "Application Insights telemetry verification passed." -ForegroundColor Green
Write-Host "Component: $ApplicationInsightsApp"
Write-Host "Health requests in last $LookbackHours hour(s): $total"
Write-Host "Failed health requests in window: $failed"
Write-Host ""
Write-Host "No connection string or instrumentation key was printed." -ForegroundColor Green
Write-Host "This verifies telemetry flow, not absence of all production errors. Review Failures and Logs before launch." -ForegroundColor Yellow
