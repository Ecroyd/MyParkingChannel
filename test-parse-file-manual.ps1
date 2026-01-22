# Manual file parser - triggers parsing for a specific file
# Usage: .\test-parse-file-manual.ps1 -FileId "file-uuid" -TenantId "tenant-uuid"

param(
    [Parameter(Mandatory=$true)]
    [string]$FileId,
    
    [Parameter(Mandatory=$true)]
    [string]$TenantId,
    
    [string]$BaseUrl = "http://localhost:3002"
)

# Read INGEST_SECRET from .env.local
$envPath = ".env.local"
if (Test-Path $envPath) {
    $envContent = Get-Content $envPath -Raw
    if ($envContent -match "INGEST_SECRET=(.+)") {
        $secret = $matches[1].Trim()
    } else {
        Write-Host "⚠️  INGEST_SECRET not found in .env.local" -ForegroundColor Yellow
        $secret = Read-Host "Enter INGEST_SECRET manually"
    }
} else {
    Write-Host "⚠️  .env.local not found" -ForegroundColor Yellow
    $secret = Read-Host "Enter INGEST_SECRET manually"
}

Write-Host "`n🔍 Manual Parse Request" -ForegroundColor Cyan
Write-Host "File ID: $FileId"
Write-Host "Tenant ID: $TenantId"
Write-Host "Base URL: $BaseUrl"
Write-Host ""

$body = @{
    fileId = $FileId
    tenantId = $TenantId
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/admin/ingest/parse-file" `
        -Method POST `
        -Headers @{
            "Content-Type" = "application/json"
            "x-ingest-secret" = $secret
        } `
        -Body $body `
        -ErrorAction Stop

    Write-Host "✅ Parse completed successfully!" -ForegroundColor Green
    Write-Host "`nResponse:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 10 | Write-Host
    
    if ($response.ok) {
        Write-Host "`n📊 Summary:" -ForegroundColor Cyan
        Write-Host "  Rows parsed: $($response.rowsParsed)"
        Write-Host "  Staged: $($response.stagedCount)"
        if ($response.importResult) {
            Write-Host "  Bookings created: $($response.importResult.successCount)"
            Write-Host "  Errors: $($response.importResult.errorCount)"
        }
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
    }
    exit 1
}
