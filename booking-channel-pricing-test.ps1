# Supplier API CHANNEL PRICING Test
# Tests that different channels get different pricing

$baseUrl = "http://localhost:3002"
$apiKey  = "01dbc10fdde0338e12fee013b329c3f1802e84340c2f9493900524472c8e2ad4"
$productId = "ab6a2d39-2162-4d5b-936e-15aa92c33a63"

# Test configuration
$today = (Get-Date).ToUniversalTime().Date.AddDays(7)
$startAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $today)
$endAt = ("{0:yyyy-MM-dd}T14:00:00Z" -f $today)

# Channels to test
$channels = @("agent", "web", "cavu", "holiday_extras")

Write-Host "=== Supplier API CHANNEL PRICING Test ==="
Write-Host "Testing pricing for different channels"
Write-Host "Dates: $startAt → $endAt"
Write-Host ""

$pricingResults = @()

foreach ($channel in $channels) {
    Write-Host "Testing channel: $channel"
    
    try {
        $availUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP&channel_code=$channel"
        $availResp = Invoke-RestMethod -Uri $availUri -Headers @{ "X-API-Key" = $apiKey } -Method GET

        $pricingResults += @{
            channel = $channel
            available = $availResp.availability_status -eq "available"
            basePrice = $availResp.pricing.base_price
            totalPrice = $availResp.pricing.total_price
            days = $availResp.pricing.days
            remaining = $availResp.remaining_capacity
        }

        Write-Host "  ✅ Available: $($availResp.availability_status)" -ForegroundColor Green
        Write-Host "     Base: £$($availResp.pricing.base_price), Total: £$($availResp.pricing.total_price)"
        Write-Host "     Days: $($availResp.pricing.days), Remaining: $($availResp.remaining_capacity)"
    } catch {
        Write-Host "  ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
        $pricingResults += @{
            channel = $channel
            available = $false
            error = $_.Exception.Message
        }
    }
    Write-Host ""
}

# Summary
Write-Host "=== CHANNEL PRICING SUMMARY ==="
Write-Host ""
Write-Host ("{0,-20} {1,-12} {2,-12} {3,-12}" -f "Channel", "Available", "Base Price", "Total Price")
Write-Host ("-" * 60)

foreach ($result in $pricingResults) {
    if ($result.available) {
        Write-Host ("{0,-20} {1,-12} £{2,-11:F2} £{3,-11:F2}" -f 
            $result.channel, 
            "Yes", 
            $result.basePrice, 
            $result.totalPrice)
    } else {
        $errorMsg = if ($result.error) { $result.error.Substring(0, [Math]::Min(10, $result.error.Length)) } else { "No" }
        Write-Host ("{0,-20} {1,-12} {2,-12}" -f $result.channel, $errorMsg, "N/A")
    }
}

Write-Host ""

# Check for price differences
$availableResults = $pricingResults | Where-Object { $_.available -eq $true }
if ($availableResults.Count -gt 1) {
    $prices = $availableResults | Select-Object -ExpandProperty totalPrice
    $uniquePrices = ($prices | Select-Object -Unique).Count
    
    if ($uniquePrices -eq 1) {
        Write-Host "⚠️  All channels have the same price" -ForegroundColor Yellow
        Write-Host "   This might be expected if channel-specific pricing isn't configured"
    } else {
        Write-Host "✅ Different channels have different prices" -ForegroundColor Green
        Write-Host "   Found $uniquePrices different price points across $($availableResults.Count) channels"
    }
} else {
    Write-Host "⚠️  Not enough channels available to compare pricing" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Test Complete ==="

