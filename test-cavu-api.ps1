# CAVU API Test Script for PowerShell
# This script tests the partner API availability endpoint

# ============================================
# CONFIGURATION - UPDATE THESE VALUES
# ============================================
$apiKey = "Ced529985232efefae56dd53703e17025c4446fd34f21c9ebf4797a61838994e"
$baseUrl = "https://myparkingchannel.app"  # Change to your domain
$productId = "tenant_pool"
$startAt = "2026-01-10T08:00:00Z"
$endAt = "2026-01-15T18:00:00Z"
$currency = "GBP"
$channelCode = "agent"  # Optional

# ============================================
# VALIDATION
# ============================================
if ($apiKey -eq "YOUR_64_CHARACTER_API_KEY_HERE" -or $apiKey.Length -ne 64) {
    Write-Host "ERROR: Please set a valid 64-character API key in the script" -ForegroundColor Red
    Write-Host "Current key length: $($apiKey.Length)" -ForegroundColor Yellow
    exit 1
}

Write-Host "Testing CAVU Partner API..." -ForegroundColor Cyan
Write-Host "API Key: $($apiKey.Substring(0, 8))...$($apiKey.Substring(56))" -ForegroundColor Gray
Write-Host ""

# ============================================
# BUILD URL
# ============================================
$endpoint = "/api/supplier/v1/availability"
$queryParams = @(
    "product_id=$productId",
    "start_at=$startAt",
    "end_at=$endAt",
    "currency=$currency"
)

if ($channelCode) {
    $queryParams += "channel_code=$channelCode"
}

$queryString = $queryParams -join "&"
$fullUrl = "$baseUrl$endpoint" + "?" + $queryString

Write-Host "Base URL: $baseUrl" -ForegroundColor Gray
Write-Host "Full URL: $fullUrl" -ForegroundColor Gray
Write-Host ""

# ============================================
# CREATE HEADERS
# ============================================
$headers = @{
    "X-API-Key" = $apiKey
    "Content-Type" = "application/json"
}

# ============================================
# MAKE REQUEST
# ============================================
try {
    Write-Host "Making request..." -ForegroundColor Yellow
    
    $response = Invoke-WebRequest -Uri $fullUrl -Headers $headers -Method GET -ErrorAction Stop
    
    Write-Host "✅ SUCCESS!" -ForegroundColor Green
    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Cyan
    
    # Parse and pretty-print JSON
    $json = $response.Content | ConvertFrom-Json
    $json | ConvertTo-Json -Depth 10
    
} catch {
    Write-Host "❌ ERROR!" -ForegroundColor Red
    Write-Host "Error Message: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    
    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
        Write-Host "Status Code: $statusCode" -ForegroundColor Red
        
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        $reader.Close()
        
        Write-Host "Response Body:" -ForegroundColor Yellow
        try {
            $errorJson = $responseBody | ConvertFrom-Json
            $errorJson | ConvertTo-Json -Depth 10
        } catch {
            Write-Host $responseBody
        }
    }
    
    exit 1
}

Write-Host ""
Write-Host "Test completed!" -ForegroundColor Green
