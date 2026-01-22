# PowerShell script to test parsing a specific file
# Usage: .\test-parse-file.ps1 -FileId "uuid" -TenantId "uuid"

param(
    [Parameter(Mandatory=$true)]
    [string]$FileId,
    
    [Parameter(Mandatory=$true)]
    [string]$TenantId
)

$url = "http://localhost:3002/api/admin/ingest/parse-file"

$body = @{
    fileId = $FileId
    tenantId = $TenantId
} | ConvertTo-Json

Write-Host "Parsing file: $FileId" -ForegroundColor Cyan
Write-Host "For tenant: $TenantId" -ForegroundColor Cyan
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $url -Method POST -Headers @{ "content-type" = "application/json" } -Body $body
    Write-Host "✅ Success!" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 10)
    
    Write-Host ""
    Write-Host "Summary:" -ForegroundColor Yellow
    Write-Host "  Rows parsed: $($response.rowsParsed)"
    Write-Host "  Bookings imported: $($response.importResult.successCount)"
    Write-Host "  Errors: $($response.importResult.errorCount)"
} catch {
    Write-Host "❌ Error:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Yellow
    }
}
