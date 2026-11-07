# PhD Analyzer -> Google Cloud Run. Details: README "Deploy to Google Cloud Run" and docs/GUIDE.md.
# Run:  powershell -ExecutionPolicy Bypass -File deploy.ps1 -Project <your-gcp-project> [-Region us-east4] [-Service phd-analyzer]
# The first run asks for the Postgres connection string and keeps it in Secret Manager. Accounts are created in the app.
param(
  [Parameter(Mandatory = $true)][string]$Project,
  [string]$Region = 'us-east4',
  [string]$Service = 'phd-analyzer'
)
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

# Cloud Run runs as the project's default compute service account, which must be able to read the secrets.
$number = gcloud projects describe $Project --format 'value(projectNumber)'
if (-not $number) { Write-Host "ERROR: project $Project not found (gcloud auth login, then check the project id)"; exit 1 }
$sa = "$number-compute@developer.gserviceaccount.com"

function Ensure-Secret([string]$name, [string]$prompt, [bool]$hidden) {
  gcloud secrets describe $name --project $Project --format 'value(name)' 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Host "secret $name exists"; return }
  if ($hidden) {
    $secure = Read-Host $prompt -AsSecureString
    $value = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  } else {
    $value = Read-Host $prompt
  }
  # Written without a trailing newline or BOM, then removed.
  $tmp = [IO.Path]::GetTempFileName()
  [IO.File]::WriteAllText($tmp, $value.Trim())
  gcloud secrets create $name --project $Project --replication-policy=automatic --data-file=$tmp
  $ok = $LASTEXITCODE
  Remove-Item $tmp -Force
  if ($ok -ne 0) { throw "could not create secret $name" }
  gcloud secrets add-iam-policy-binding $name --project $Project --member="serviceAccount:$sa" --role=roles/secretmanager.secretAccessor --format 'value(etag)' | Out-Null
}

Ensure-Secret "$Service-database-url" 'Postgres connection string (postgresql://...)' $false

gcloud run deploy $Service --project $Project --source . --region $Region `
  --memory 2Gi --cpu 1 --min-instances 0 --max-instances 1 --timeout 3600 --allow-unauthenticated `
  --set-secrets "DATABASE_URL=$Service-database-url:latest" --quiet
if ($LASTEXITCODE -ne 0) { Write-Host 'ERROR: deploy failed (see the last build with: gcloud builds list --limit=1)'; exit 1 }

$url = gcloud run services describe $Service --project $Project --region $Region --format 'value(status.url)'
Write-Host ''
Write-Host "READY: $url"
