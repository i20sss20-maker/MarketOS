param(
  [string]$ResourceGroup = "rg-marketos-dev",
  [string]$StaticWebApp = "marketos-preview",
  [string]$GitHubRepo = "i20sss20-maker/MarketOS",
  [string]$GitHubEnvironment = "market-data-acceptance"
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is not installed or not available in PATH."
  }
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

$subscriptionId = az account show --query id --output tsv
if (-not $subscriptionId) {
  throw "Could not resolve the active Azure subscription."
}

$resourceId = az staticwebapp show --name $StaticWebApp --resource-group $ResourceGroup --query id --output tsv
if ($LASTEXITCODE -ne 0 -or -not $resourceId) {
  throw "Static Web App '$StaticWebApp' was not found in '$ResourceGroup'."
}

$secureKey = Read-Host "Enter the Twelve Data API key (input is hidden)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
$apiKey = $null

try {
  $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if (-not $apiKey -or $apiKey.Trim().Length -lt 8 -or $apiKey.Length -gt 512) {
    throw "The provider key is empty or has an unexpected length."
  }

  $token = az account get-access-token --resource https://management.azure.com/ --query accessToken --output tsv
  if ($LASTEXITCODE -ne 0 -or -not $token) {
    throw "Could not obtain an Azure management access token."
  }

  $headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
  }

  $baseUri = "https://management.azure.com/subscriptions/$subscriptionId/resourceGroups/$ResourceGroup/providers/Microsoft.Web/staticSites/$StaticWebApp"
  $listUri = "$baseUri/listAppSettings?api-version=2025-05-01"
  $updateUri = "$baseUri/config/appsettings?api-version=2025-05-01"

  Write-Host "Reading existing Static Web Apps settings into memory..." -ForegroundColor Cyan
  $current = Invoke-RestMethod -Method Post -Uri $listUri -Headers $headers
  $properties = @{}

  if ($current.properties) {
    foreach ($property in $current.properties.PSObject.Properties) {
      $properties[$property.Name] = [string]$property.Value
    }
  }

  $properties["TWELVE_DATA_API_KEY"] = $apiKey

  $payload = @{
    properties = $properties
  } | ConvertTo-Json -Depth 8 -Compress

  Write-Host "Updating the provider key in Azure without placing it in Azure CLI arguments..." -ForegroundColor Cyan
  Invoke-RestMethod -Method Put -Uri $updateUri -Headers $headers -Body $payload | Out-Null

  Write-Host "Syncing the same key to the GitHub market-data acceptance environment through stdin..." -ForegroundColor Cyan
  $apiKey | gh secret set TWELVE_DATA_API_KEY --env $GitHubEnvironment --repo $GitHubRepo
  if ($LASTEXITCODE -ne 0) {
    throw "Azure was updated, but the GitHub environment secret could not be written. Re-run this script after fixing GitHub environment access."
  }

  $verify = Invoke-RestMethod -Method Post -Uri $listUri -Headers $headers
  $azureConfigured = $false
  if ($verify.properties) {
    $keyProperty = $verify.properties.PSObject.Properties["TWELVE_DATA_API_KEY"]
    $azureConfigured = $null -ne $keyProperty -and -not [string]::IsNullOrWhiteSpace([string]$keyProperty.Value)
  }

  if (-not $azureConfigured) {
    throw "Azure did not report the provider key as configured after the update."
  }

  Write-Host ""
  Write-Host "Twelve Data credential sync completed." -ForegroundColor Green
  Write-Host "Azure Static Web App: $StaticWebApp"
  Write-Host "GitHub environment: $GitHubEnvironment"
  Write-Host ""
  Write-Host "No provider key value was printed, written to a file, committed, or passed as a command-line argument." -ForegroundColor Green
  Write-Host "This does NOT enable production market data or confirm commercial rights. Run configure-market-data-policy.ps1 and live provider acceptance separately." -ForegroundColor Yellow
}
finally {
  if ($bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  $apiKey = $null
  $secureKey = $null
}
