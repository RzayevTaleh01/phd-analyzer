# Talvis -> Cloud Run (project trdesk-510213, service talvis-phd, region us-east4). Details: README "Deploying to Google Cloud Run".
# Run:  powershell -ExecutionPolicy Bypass -File deploy.ps1
# First run asks for the Postgres connection string and a login password and keeps them in Secret Manager.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
$project = 'trdesk-510213'
$sa = '50524487911-compute@developer.gserviceaccount.com'

function Ensure-Secret([string]$name, [string]$prompt, [bool]$hidden) {
  gcloud secrets describe $name --project $project --format 'value(name)' 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Host "secret $name var"; return }
  if ($hidden) {
    $secure = Read-Host $prompt -AsSecureString
    $value = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  } else {
    $value = Read-Host $prompt
  }
  # Written without a trailing newline or BOM, then removed.
  $tmp = [IO.Path]::GetTempFileName()
  [IO.File]::WriteAllText($tmp, $value.Trim())
  gcloud secrets create $name --project $project --replication-policy=automatic --data-file=$tmp
  $ok = $LASTEXITCODE
  Remove-Item $tmp -Force
  if ($ok -ne 0) { throw "secret $name yaradılmadı" }
  gcloud secrets add-iam-policy-binding $name --project $project --member="serviceAccount:$sa" --role=roles/secretmanager.secretAccessor --format 'value(etag)' | Out-Null
}

Ensure-Secret 'talvis-database-url' 'Postgres baglanti setri (postgresql://...)' $false
Ensure-Secret 'talvis-app-password' 'Talvis giris parolu' $true

gcloud run deploy talvis-phd --project $project --source . --region us-east4 `
  --memory 2Gi --cpu 1 --min-instances 0 --max-instances 1 --timeout 3600 --allow-unauthenticated `
  --set-secrets DATABASE_URL=talvis-database-url:latest,APP_PASSWORD=talvis-app-password:latest --quiet
if ($LASTEXITCODE -ne 0) { Write-Host 'XETA: deploy alinmadi (gcloud builds list --limit=1 ile son build-e bax)'; exit 1 }

$url = gcloud run services describe talvis-phd --project $project --region us-east4 --format 'value(status.url)'
Write-Host ''
Write-Host "HAZIRDIR: $url"
