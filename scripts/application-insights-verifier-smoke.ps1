$ErrorActionPreference = "Stop"
$verifier = Join-Path $PSScriptRoot "../infrastructure/azure/verify-application-insights.ps1"
$originalSha = $env:GITHUB_SHA
$global:marketosTelemetryTest = @{}
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("marketos-telemetry-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $testRoot | Out-Null

function Assert-Check($condition, [string]$message) {
  if (-not $condition) { throw $message }
}

# These mocks shadow Azure CLI, HTTP and sleeping for the actual verifier.
# No account, secret, network request or billed Azure resource is needed.
function az {
  $global:LASTEXITCODE = 0
  $command = $args -join " "
  if ($command -like "account show*") { return }
  if ($command -like "staticwebapp show*") { return '{"defaultHostname":"marketos-test.azurestaticapps.net"}' }
  if ($command -like "staticwebapp appsettings list*") {
    return '{"properties":{"APPLICATIONINSIGHTS_CONNECTION_STRING":"InstrumentationKey=INSTRUMENTATION-SECRET;IngestionEndpoint=https://example.invalid/"}}'
  }
  if ($command -like "monitor app-insights component show*") {
    if ($global:marketosTelemetryTest.scenario -eq "unlinked") { return '{"appId":"app","instrumentationKey":"different"}' }
    return '{"appId":"app","instrumentationKey":"INSTRUMENTATION-SECRET"}'
  }
  if ($command -like "monitor app-insights query*") {
    $global:marketosTelemetryTest.queryCount++
    $queryIndex = [array]::IndexOf($args, "--analytics-query")
    $query = $args[$queryIndex + 1]
    Assert-Check ($global:marketosTelemetryTest.probeId -match '^[0-9a-f]{32}$') "A fresh probe must precede the query."
    Assert-Check ($query.Contains("['marketos_probe']) == '$($global:marketosTelemetryTest.probeId)'")) "Query must isolate the current probe."
    Assert-Check ($query.Contains("timestamp >= datetime(")) "Query must use the probe timestamp."
    Assert-Check ($query.Contains("success == true and resultCode == '200'")) "Query must require successful HTTP 200 telemetry."
    if ($global:marketosTelemetryTest.scenario -eq "query-error") { $global:LASTEXITCODE = 1; return '{}' }
    if ($global:marketosTelemetryTest.scenario -eq "malformed") { return '{"tables":[{"rows":[]}]}' }
    if ($global:marketosTelemetryTest.scenario -eq "failed") { return '{"tables":[{"rows":[[1,1,0]]}]}' }
    if ($global:marketosTelemetryTest.scenario -eq "old-only" -or ($global:marketosTelemetryTest.scenario -eq "delayed" -and $global:marketosTelemetryTest.queryCount -lt 3)) {
      # Old traffic exists, but none matches the fresh probe's filter.
      return '{"tables":[{"rows":[[0,0,0]]}]}'
    }
    return '{"tables":[{"rows":[[1,0,1]]}]}'
  }
  throw "Unexpected Azure command in mock."
}

function Invoke-WebRequest {
  param([string]$Uri, $Method, $MaximumRedirection, $TimeoutSec)
  Assert-Check ($Uri -match '^https://marketos-test\.azurestaticapps\.net/api/health\?marketos_probe=([0-9a-f]{32})$') "Probe URL is invalid."
  $global:marketosTelemetryTest.probeId = $Matches[1]
  $global:marketosTelemetryTest.requestCount++
  $build = if ($global:marketosTelemetryTest.scenario -eq "wrong-build") { "bbbbbbbbbbbb" } else { $env:GITHUB_SHA.Substring(0, 12) }
  $environment = if ($global:marketosTelemetryTest.scenario -eq "preview") { "preview" } else { "production" }
  $service = if ($global:marketosTelemetryTest.scenario -eq "other-service") { "other-api" } else { "marketos-api" }
  return @{
    StatusCode = 200
    Content = (@{ ok = $true; service = $service; buildSha = $build; environment = $environment } | ConvertTo-Json)
  }
}

function Start-Sleep { param($Seconds) }

try {
  $env:GITHUB_SHA = "a" * 40
  foreach ($case in @("success", "delayed", "old-only", "failed", "malformed", "query-error", "wrong-build", "preview", "other-service", "unlinked")) {
    $global:marketosTelemetryTest.scenario = $case
    $global:marketosTelemetryTest.queryCount = 0
    $global:marketosTelemetryTest.requestCount = 0
    $global:marketosTelemetryTest.probeId = ""
    $path = Join-Path $testRoot "$case.json"
    $passed = $false
    $failure = ""
    try {
      & $verifier -ApplicationInsightsApp "marketos-test" -IngestionWaitSeconds 10 -EvidencePath $path
      $passed = $true
    } catch { $failure = $_.Exception.Message }
    $expectedSuccess = $case -in @("success", "delayed")
    Assert-Check ($passed -eq $expectedSuccess) "Unexpected telemetry result for ${case}: $failure"
    Assert-Check ((Test-Path $path) -eq $expectedSuccess) "A failed check must not produce successful evidence."
    if ($expectedSuccess) {
      $raw = Get-Content $path -Raw
      $evidence = $raw | ConvertFrom-Json
      Assert-Check ($evidence.releaseSha -eq $env:GITHUB_SHA) "Evidence must retain the full release SHA."
      Assert-Check ($evidence.probeId -eq $global:marketosTelemetryTest.probeId) "Evidence must identify this probe."
      Assert-Check ($evidence.telemetryFlowVerified -and -not $evidence.secretsIncluded) "Evidence flags are invalid."
      Assert-Check (-not $raw.Contains("INSTRUMENTATION-SECRET")) "Evidence leaked instrumentation credentials."
    }
    if ($case -in @("delayed", "old-only")) { Assert-Check ($global:marketosTelemetryTest.queryCount -eq 3) "Ingestion retries must be bounded to three queries." }
    if ($case -in @("wrong-build", "preview", "other-service", "unlinked")) { Assert-Check ($global:marketosTelemetryTest.queryCount -eq 0) "Invalid deployment must fail before querying telemetry." }
    Assert-Check ($global:marketosTelemetryTest.requestCount -le 1) "Ingestion retries must reuse one health probe."
  }
  Write-Host "Application Insights verifier runtime checks passed: fresh probe, exact build prefix, bounded ingestion retries, old/failing telemetry rejection and secret-free evidence."
} finally {
  $env:GITHUB_SHA = $originalSha
  Remove-Variable marketosTelemetryTest -Scope Global
  Remove-Item -Recurse -Force $testRoot
}
