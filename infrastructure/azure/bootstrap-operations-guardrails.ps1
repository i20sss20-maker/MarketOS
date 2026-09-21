param(
  [string]$ResourceGroup = "rg-marketos-dev",
  [string]$StaticWebApp = "marketos-preview",
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[^@\s]+@[^@\s]+\.[^@\s]+$")]
  [string]$ContactEmail,
  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 10000)]
  [decimal]$MonthlyBudgetAmount,
  [string]$BudgetName = "marketos-rg-monthly",
  [string]$ActionGroupName = "marketos-ops",
  [switch]$IUnderstandAzureMonitorMayCharge
)

$ErrorActionPreference = "Stop"

if (-not $IUnderstandAzureMonitorMayCharge) {
  throw "Pass -IUnderstandAzureMonitorMayCharge only after reviewing Azure Monitor and Cost Management pricing. This script will not create monitoring resources without explicit acknowledgement."
}

if (-not (Get-Command "az" -ErrorAction SilentlyContinue)) {
  throw "Azure CLI is required."
}

az account show --output none
if ($LASTEXITCODE -ne 0) {
  throw "Azure account is not signed in."
}

$resourceGroupExists = az group exists --name $ResourceGroup --output tsv
if ($resourceGroupExists -ne "true") {
  throw "Resource group '$ResourceGroup' does not exist."
}

$swa = az staticwebapp show --name $StaticWebApp --resource-group $ResourceGroup --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $swa.id) {
  throw "Static Web App '$StaticWebApp' does not exist in '$ResourceGroup'."
}
$swaId = $swa.id

$metricNames = @(az monitor metrics list-definitions --resource $swaId --query "[].name.value" --output tsv)
if ($LASTEXITCODE -ne 0) {
  throw "Could not read Static Web Apps metric definitions."
}

foreach ($requiredMetric in @("FunctionErrors", "SiteErrors")) {
  if ($metricNames -notcontains $requiredMetric) {
    throw "Required Static Web Apps metric '$requiredMetric' is unavailable. No alert readiness flag was written."
  }
}

$actionGroup = $null
try {
  $actionGroup = az monitor action-group show --name $ActionGroupName --resource-group $ResourceGroup --output json 2>$null | ConvertFrom-Json
} catch {
  $actionGroup = $null
}

if (-not $actionGroup) {
  Write-Host "Creating MarketOS operations action group..." -ForegroundColor Cyan
  $actionGroup = az monitor action-group create --name $ActionGroupName --resource-group $ResourceGroup --short-name "MarketOSOps" --action email MarketOSOps $ContactEmail usecommonalertschema --output json | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or -not $actionGroup.id) {
    throw "Could not create the MarketOS action group."
  }
} else {
  $matchingEmail = @($actionGroup.emailReceivers | Where-Object { $_.emailAddress -eq $ContactEmail })
  if ($matchingEmail.Count -eq 0) {
    throw "Existing action group '$ActionGroupName' does not contain the requested contact email. It was not modified automatically."
  }
}

$actionGroupId = $actionGroup.id

function Ensure-MetricAlert(
  [string]$Name,
  [string]$Condition,
  [int]$Severity,
  [string]$Description
) {
  $existing = $null
  try {
    $existing = az monitor metrics alert show --name $Name --resource-group $ResourceGroup --output json 2>$null | ConvertFrom-Json
  } catch {
    $existing = $null
  }

  if (-not $existing) {
    Write-Host "Creating metric alert $Name..." -ForegroundColor Cyan
    az monitor metrics alert create --name $Name --resource-group $ResourceGroup --scopes $swaId --condition $Condition --window-size 5m --evaluation-frequency 1m --severity $Severity --action $actionGroupId --description $Description --output none
    if ($LASTEXITCODE -ne 0) {
      throw "Could not create metric alert '$Name'."
    }
    $existing = az monitor metrics alert show --name $Name --resource-group $ResourceGroup --output json | ConvertFrom-Json
  }

  if (-not $existing.enabled) {
    throw "Metric alert '$Name' exists but is disabled."
  }

  if (@($existing.scopes) -notcontains $swaId) {
    throw "Metric alert '$Name' does not target the MarketOS Static Web App."
  }
}

Ensure-MetricAlert -Name "marketos-function-errors" -Condition "total FunctionErrors > 0" -Severity 1 -Description "MarketOS managed API function errors detected."
Ensure-MetricAlert -Name "marketos-site-errors" -Condition "total SiteErrors > 5" -Severity 2 -Description "MarketOS site errors exceeded five in a five-minute window."

$budget = $null
try {
  $budget = az consumption budget show-with-rg --budget-name $BudgetName --resource-group $ResourceGroup --output json 2>$null | ConvertFrom-Json
} catch {
  $budget = $null
}

if (-not $budget) {
  $start = [datetime]::new((Get-Date).Year, (Get-Date).Month, 1, 0, 0, 0, [DateTimeKind]::Utc)
  $end = $start.AddYears(5)

  $timePeriod = @{
    "start-date" = $start.ToString("yyyy-MM-dd")
    "end-date" = $end.ToString("yyyy-MM-dd")
  } | ConvertTo-Json -Compress

  $notifications = @{
    Actual80 = @{
      enabled = "true"
      operator = "GreaterThanOrEqualTo"
      "contact-emails" = @($ContactEmail)
      threshold = 80.0
      "contact-groups" = @()
    }
    Actual100 = @{
      enabled = "true"
      operator = "GreaterThanOrEqualTo"
      "contact-emails" = @($ContactEmail)
      threshold = 100.0
      "contact-groups" = @($actionGroupId)
    }
  } | ConvertTo-Json -Depth 6 -Compress

  Write-Host "Creating resource-group monthly cost budget..." -ForegroundColor Cyan
  az consumption budget create-with-rg --amount $MonthlyBudgetAmount --budget-name $BudgetName --resource-group $ResourceGroup --category Cost --time-grain Monthly --time-period $timePeriod --notifications $notifications --output none
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create the MarketOS resource-group cost budget."
  }

  $budget = az consumption budget show-with-rg --budget-name $BudgetName --resource-group $ResourceGroup --output json | ConvertFrom-Json
}

if ([decimal]$budget.amount -ne $MonthlyBudgetAmount) {
  throw "Existing budget '$BudgetName' amount does not match the requested amount. It was not modified automatically."
}

Write-Host "Writing non-secret operations readiness flags..." -ForegroundColor Cyan
az staticwebapp appsettings set --name $StaticWebApp --resource-group $ResourceGroup --setting-names "MARKETOS_METRIC_ALERTS_CONFIGURED=true" "MARKETOS_COST_BUDGET_CONFIGURED=true" --output none
if ($LASTEXITCODE -ne 0) {
  throw "Guardrails exist, but MarketOS readiness flags could not be written."
}

Write-Host ""
Write-Host "MarketOS Azure operations guardrails are configured." -ForegroundColor Green
Write-Host "Action group: $ActionGroupName -> $ContactEmail"
Write-Host "Metric alerts: FunctionErrors > 0; SiteErrors > 5 / 5 minutes"
Write-Host "Monthly resource-group budget: $MonthlyBudgetAmount"
Write-Host ""
Write-Host "IMPORTANT: Azure budgets send notifications; they do not stop resources or spending automatically." -ForegroundColor Yellow
Write-Host "Application Insights detailed logs are still a separate production acceptance step." -ForegroundColor Yellow
