param(
  [string]$ResourceGroup = "rg-marketos-dev",
  [string]$StaticWebApp = "marketos-preview",
  [string]$Location = "westeurope",
  [string]$Schedule = "0 */5 * * * *"
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is not installed or not available in PATH."
  }
}

Require-Command "az"
Require-Command "npx.cmd"
Require-Command "npm.cmd"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

Write-Host "Checking Azure sign-in..." -ForegroundColor Cyan
$subscriptionId = az account show --query id -o tsv
if (-not $subscriptionId) { throw "Azure account is not signed in." }

$suffix = $subscriptionId.Replace("-", "").Substring(0, 8).ToLower()
$StorageName = "marketos${suffix}wrk"
$FunctionApp = "marketos-alert-worker-$suffix"

Write-Host "Checking MarketOS cloud storage..." -ForegroundColor Cyan
$swaSettingsJson = az staticwebapp appsettings list --name $StaticWebApp --resource-group $ResourceGroup --output json
$swaSettings = $swaSettingsJson | ConvertFrom-Json
$userDataProvider = $swaSettings.properties.USER_DATA_PROVIDER
if ($userDataProvider -ne "cosmos") {
  throw "Persistent Cosmos storage is required. Run bootstrap-cosmos.ps1 before enabling the background alert worker."
}

$hostname = az staticwebapp show --name $StaticWebApp --resource-group $ResourceGroup --query "defaultHostname" --output tsv
if (-not $hostname) { throw "Could not resolve the MarketOS Static Web App hostname." }

Write-Host "Creating/confirming worker storage account..." -ForegroundColor Cyan
$storageExists = az storage account check-name --name $StorageName --query "nameAvailable" -o tsv
if ($storageExists -eq "true") {
  az storage account create --name $StorageName --resource-group $ResourceGroup --location $Location --sku Standard_LRS --kind StorageV2 --allow-blob-public-access false --tags project=MarketOS environment=dev managedBy=bootstrap-alert-worker --output none
}

$existingWorker = $null
try {
  $existingWorker = az functionapp show --name $FunctionApp --resource-group $ResourceGroup --output json 2>$null | ConvertFrom-Json
} catch {
  $existingWorker = $null
}

if (-not $existingWorker) {
  Write-Host "Creating Azure Functions Flex Consumption worker..." -ForegroundColor Cyan
  $createOutput = & az functionapp create --resource-group $ResourceGroup --name $FunctionApp --storage-account $StorageName --flexconsumption-location $Location --runtime node --runtime-version 22 --functions-version 4 --output json 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Alert worker creation failed." -ForegroundColor Red
    Write-Host "No paid fallback was created automatically." -ForegroundColor Yellow
    Write-Host "Azure for Students can restrict available Flex Consumption regions." -ForegroundColor Yellow
    Write-Host ""
    Write-Host $createOutput
    exit 2
  }
}

Write-Host "Generating a new worker credential..." -ForegroundColor Cyan
$secretBytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($secretBytes)
$workerSecret = [Convert]::ToBase64String($secretBytes)
$rng.Dispose()

$sweepUrl = "https://$hostname/api/internal/alerts/sweep"

Write-Host "Configuring MarketOS API worker credential..." -ForegroundColor Cyan
az staticwebapp appsettings set --name $StaticWebApp --resource-group $ResourceGroup --setting-names "MARKETOS_WORKER_SECRET=$workerSecret" "ALERT_WORKER_ENABLED=true" --output none

Write-Host "Configuring scheduled worker..." -ForegroundColor Cyan
az functionapp config appsettings set --name $FunctionApp --resource-group $ResourceGroup --settings "MARKETOS_INTERNAL_SWEEP_URL=$sweepUrl" "MARKETOS_WORKER_SECRET=$workerSecret" "ALERT_SWEEP_SCHEDULE=$Schedule" "ALERT_SWEEP_MAX_PAGES=5" "NODE_ENV=production" --output none

Write-Host "Building scheduled worker..." -ForegroundColor Cyan
Push-Location $RepoRoot
try {
  & npx.cmd -y pnpm@10.15.0 install --no-frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw "pnpm install failed." }

  & npx.cmd -y pnpm@10.15.0 --filter "@marketos/alert-worker" build
  if ($LASTEXITCODE -ne 0) { throw "Alert worker build failed." }

  & npx.cmd -y pnpm@10.15.0 prepare:alert-worker
  if ($LASTEXITCODE -ne 0) { throw "Alert worker staging failed." }

  & npm.cmd install --omit=dev --ignore-scripts --prefix "artifacts/alert-worker"
  if ($LASTEXITCODE -ne 0) { throw "Alert worker production dependency install failed." }

  $zipPath = Join-Path $RepoRoot "artifacts\marketos-alert-worker.zip"
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Compress-Archive -Path (Join-Path $RepoRoot "artifacts\alert-worker\*") -DestinationPath $zipPath -Force

  Write-Host "Deploying worker to Azure..." -ForegroundColor Cyan
  az functionapp deployment source config-zip --resource-group $ResourceGroup --name $FunctionApp --src $zipPath --output none
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "MarketOS background alert worker is ready." -ForegroundColor Green
Write-Host "Function App: $FunctionApp"
Write-Host "Runtime: Node 22 / Flex Consumption"
Write-Host "Schedule: $Schedule"
Write-Host "Sweep endpoint: $sweepUrl"
Write-Host "The worker credential was written directly to Azure app settings and was not printed." -ForegroundColor Green
