param(
  [string]$ResourceGroup = "rg-marketos-dev",
  [string]$StaticWebApp = "marketos-preview",
  [Parameter(Mandatory = $true)]
  [string]$ApplicationInsightsApp,
  [ValidateRange(1, 24)]
  [int]$LookbackHours = 1,
  [ValidateRange(10, 180)]
  [int]$IngestionWaitSeconds = 45,
  [string]$EvidencePath = ""
)

$ErrorActionPreference = "Stop"

$releaseSha = "$env:GITHUB_SHA".Trim().ToLowerInvariant()
if (-not [string]::IsNullOrWhiteSpace($EvidencePath) -and $releaseSha -notmatch '^[0-9a-f]{40}$') {
  throw "Telemetry evidence requires the full release SHA in GITHUB_SHA."
}

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

$probeId = [guid]::NewGuid().ToString("N")
$probeStartedAt = (Get-Date).ToUniversalTime()
$healthUrl = "https://$($swa.defaultHostname)/api/health?marketos_probe=$probeId"
Write-Host "Generating one safe health request for telemetry verification..." -ForegroundColor Cyan
$response = Invoke-WebRequest -Uri $healthUrl -Method Get -MaximumRedirection 0 -TimeoutSec 15
if ($response.StatusCode -ne 200) {
  throw "MarketOS health endpoint did not return HTTP 200."
}

$health = $response.Content | ConvertFrom-Json
if ($health.service -ne "marketos-api" -or $health.ok -ne $true) {
  throw "The health response is not from a healthy MarketOS API."
}
if (-not [string]::IsNullOrWhiteSpace($EvidencePath) -and
    ($health.environment -ne "production" -or $health.buildSha -ne $releaseSha.Substring(0, 12))) {
  throw "The hosted production build does not match the telemetry evidence release."
}

# A fresh, unique query marker prevents old traffic or another application's
# health request from satisfying this run. Fail closed when telemetry is sampled
# out or query parameters are removed; never fall back to an aggregate count.
$queryStart = $probeStartedAt.AddSeconds(-30).ToString("o")
$query = "requests | where timestamp > ago($($LookbackHours)h) | where timestamp >= datetime($queryStart) | where tostring(parse_url(url).Path) == '/api/health' | where tostring(parse_url(url)['Query Parameters']['marketos_probe']) == '$probeId' | summarize total=count(), failed=countif(success == false), succeeded=countif(success == true and resultCode == '200')"
$total = 0
$failed = 0
$succeeded = 0
for ($attempt = 1; $attempt -le 3; $attempt++) {
  Write-Host "Waiting $IngestionWaitSeconds seconds for probe telemetry (attempt $attempt/3)..." -ForegroundColor Cyan
  Start-Sleep -Seconds $IngestionWaitSeconds
  $queryResult = az monitor app-insights query --app $ApplicationInsightsApp --resource-group $ResourceGroup --analytics-query $query --output json | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) {
    throw "Application Insights query failed."
  }
  $rows = @($queryResult.tables[0].rows)
  if ($rows.Count -ne 1 -or $rows[0].Count -ne 3) {
    throw "Application Insights returned no usable probe telemetry."
  }
  $total = [long]$rows[0][0]
  $failed = [long]$rows[0][1]
  $succeeded = [long]$rows[0][2]
  if ($failed -gt 0) {
    throw "The current health probe has failed request telemetry."
  }
  if ($total -ge 1 -and $succeeded -ge 1) { break }
}
if ($total -lt 1 -or $succeeded -lt 1) {
  throw "The current /api/health probe was not visible as a successful HTTP 200 request in Application Insights."
}

if (-not [string]::IsNullOrWhiteSpace($EvidencePath)) {
  $directory = Split-Path -Parent $EvidencePath
  if (-not [string]::IsNullOrWhiteSpace($directory)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }

  $evidence = [ordered]@{
    checkedAt = (Get-Date).ToUniversalTime().ToString("o")
    releaseSha = $releaseSha
    hostedBuildSha = $health.buildSha
    probeId = $probeId
    probeStartedAt = $probeStartedAt.ToString("o")
    resourceGroup = $ResourceGroup
    staticWebApp = $StaticWebApp
    applicationInsightsApp = $ApplicationInsightsApp
    host = $swa.defaultHostname
    lookbackHours = $LookbackHours
    healthRequests = $total
    failedHealthRequests = $failed
    telemetryFlowVerified = $true
    linkedComponentVerified = $true
    secretsIncluded = $false
  }

  $evidence | ConvertTo-Json -Depth 5 | Set-Content -Path $EvidencePath -Encoding UTF8
}

Write-Host ""
Write-Host "Application Insights telemetry verification passed." -ForegroundColor Green
Write-Host "Component: $ApplicationInsightsApp"
Write-Host "Matching current probe requests: $total"
Write-Host "Failed current probe requests: $failed"
Write-Host ""
Write-Host "No connection string or instrumentation key was printed." -ForegroundColor Green
Write-Host "This verifies telemetry flow, not absence of all production errors. Review Failures and Logs before launch." -ForegroundColor Yellow
