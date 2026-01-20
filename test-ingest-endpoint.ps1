# PowerShell script to test the email ingest endpoint
# Usage: .\test-ingest-endpoint.ps1

# Try to read from .env.local first, then env var, then default
$ingestSecret = "pc_ingest_change_me_to_long_random"
if (Test-Path .env.local) {
    $envContent = Get-Content .env.local
    $ingestLine = $envContent | Select-String -Pattern "^INGEST_SECRET=(.+)$"
    if ($ingestLine) {
        $ingestSecret = $ingestLine.Matches.Groups[1].Value.Trim()
        Write-Host "✅ Found INGEST_SECRET in .env.local" -ForegroundColor Green
    }
}
if ($env:INGEST_SECRET) {
    $ingestSecret = $env:INGEST_SECRET
    Write-Host "✅ Using INGEST_SECRET from environment variable" -ForegroundColor Green
}

$url = "http://localhost:3002/api/ingest/email"

$headers = @{
    "content-type" = "application/json"
    "x-ingest-secret" = $ingestSecret
}

# Create a minimal but valid RFC822 email in base64
# This is a simple test email that's long enough to pass validation
$testEmail = @"
From: supplier@example.com
To: bookings@myparkingchannel.app
Subject: TEST Email
Date: Mon, 20 Jan 2026 12:00:00 +0000

This is a test email for the ingest endpoint.
"@
$testEmailBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($testEmail))

$body = @{
    to = "bookings@myparkingchannel.app"
    from = "supplier@example.com"
    subject = "TEST"
    received_at = "2026-01-20T12:00:00Z"
    raw_rfc822_base64 = $testEmailBase64
} | ConvertTo-Json

Write-Host "Testing endpoint: $url" -ForegroundColor Cyan
Write-Host "Using secret: $ingestSecret" -ForegroundColor Gray
Write-Host "Secret length: $($ingestSecret.Length)" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -Body $body -ContentType "application/json"
    Write-Host "✅ Success!" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 10)
} catch {
    Write-Host "❌ Error:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body: $responseBody" -ForegroundColor Yellow
    }
}
