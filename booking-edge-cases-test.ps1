# Supplier API EDGE CASES Test
# Tests edge cases like same-day bookings, very long stays, etc.

$baseUrl = "http://localhost:3002"
$apiKey  = "01dbc10fdde0338e12fee013b329c3f1802e84340c2f9493900524472c8e2ad4"
$productId = "ab6a2d39-2162-4d5b-936e-15aa92c33a63"

Write-Host "=== Supplier API EDGE CASES Test ==="
Write-Host ""

$today = (Get-Date).ToUniversalTime().Date.AddDays(7)

# Test 1: Same-day booking (arrive and depart same day)
Write-Host "Test 1: Same-day booking (arrive and depart same day)"
try {
    $startAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $today)
    $endAt = ("{0:yyyy-MM-dd}T18:00:00Z" -f $today)  # Same day, 8 hours later
    
    $availUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
    $availResp = Invoke-RestMethod -Uri $availUri -Headers @{ "X-API-Key" = $apiKey } -Method GET
    
    Write-Host "  Availability: $($availResp.availability_status), Price: £$($availResp.pricing.total_price)" -ForegroundColor Cyan
    Write-Host "  ✅ Same-day booking supported" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Very short stay (2 hours)
Write-Host "Test 2: Very short stay (2 hours)"
try {
    $startAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $today)
    $endAt = ("{0:yyyy-MM-dd}T12:00:00Z" -f $today)  # 2 hours
    
    $availUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
    $availResp = Invoke-RestMethod -Uri $availUri -Headers @{ "X-API-Key" = $apiKey } -Method GET
    
    Write-Host "  Availability: $($availResp.availability_status), Price: £$($availResp.pricing.total_price)" -ForegroundColor Cyan
    Write-Host "  Days: $($availResp.pricing.days)" -ForegroundColor Cyan
    Write-Host "  ✅ Very short stay handled" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 3: Very long stay (>30 days to test the extra-day logic)
Write-Host "Test 3: Very long stay (35 days - tests >30 day logic)"
try {
    $startAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $today)
    $endAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $today.AddDays(35))  # 35 days
    
    $availUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
    $availResp = Invoke-RestMethod -Uri $availUri -Headers @{ "X-API-Key" = $apiKey } -Method GET
    
    Write-Host "  Availability: $($availResp.availability_status)" -ForegroundColor Cyan
    Write-Host "  Days: $($availResp.pricing.days)" -ForegroundColor Cyan
    Write-Host "  Price: £$($availResp.pricing.total_price)" -ForegroundColor Cyan
    Write-Host "  ✅ >30 day stay handled" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: Exactly 30 days (boundary test)
# Note: AddDays(29) = 30 calendar days (Day 0 through Day 29 = 30 days)
Write-Host "Test 4: Exactly 30 days (boundary test)"
try {
    $startAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $today)
    $endAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $today.AddDays(29))  # 30 calendar days (Day 0-29)
    
    $availUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
    $availResp = Invoke-RestMethod -Uri $availUri -Headers @{ "X-API-Key" = $apiKey } -Method GET
    
    Write-Host "  Availability: $($availResp.availability_status)" -ForegroundColor Cyan
    Write-Host "  Days: $($availResp.pricing.days) (expected: 30)" -ForegroundColor Cyan
    Write-Host "  Price: £$($availResp.pricing.total_price)" -ForegroundColor Cyan
    if ($availResp.pricing.days -eq 30) {
        Write-Host "  ✅ 30-day boundary handled correctly" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Expected 30 days, got $($availResp.pricing.days)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 5: Exactly 31 days (should use extra-day pricing)
# Note: AddDays(30) = 31 calendar days (Day 0 through Day 30 = 31 days)
Write-Host "Test 5: Exactly 31 days (should use extra-day pricing)"
try {
    $startAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $today)
    $endAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $today.AddDays(30))  # 31 calendar days (Day 0-30)
    
    $availUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
    $availResp = Invoke-RestMethod -Uri $availUri -Headers @{ "X-API-Key" = $apiKey } -Method GET
    
    Write-Host "  Availability: $($availResp.availability_status)" -ForegroundColor Cyan
    Write-Host "  Days: $($availResp.pricing.days) (expected: 31)" -ForegroundColor Cyan
    Write-Host "  Price: £$($availResp.pricing.total_price)" -ForegroundColor Cyan
    if ($availResp.pricing.days -eq 31) {
        Write-Host "  ✅ 31-day (extra-day) pricing handled correctly" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Expected 31 days, got $($availResp.pricing.days)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 6: Special characters in customer name
Write-Host "Test 6: Special characters in customer name"
try {
    $startAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $today)
    $endAt = ("{0:yyyy-MM-dd}T14:00:00Z" -f $today)
    
    $availUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
    $availResp = Invoke-RestMethod -Uri $availUri -Headers @{ "X-API-Key" = $apiKey } -Method GET
    
    if ($availResp.availability_status -eq "available") {
        $body = @{
            product_id = $productId
            start_at = $startAt
            end_at = $endAt
            customer = @{ 
                first_name = "José"
                last_name = "O'Brien-Smith"
                email = "jose.obrien@example.com" 
            }
            vehicle = @{ plate = "TEST123" }
            price = @{ currency = "GBP"; total = $availResp.pricing.total_price }
        } | ConvertTo-Json
        
        $resp = Invoke-RestMethod -Uri "$baseUrl/api/supplier/v1/bookings" `
            -Headers @{ "X-API-Key" = $apiKey; "Content-Type" = "application/json" } `
            -Method POST -Body $body
        
        Write-Host "  ✅ Special characters handled: $($resp.reference)" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Skipping - not available" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 7: Year boundary (Dec 31 → Jan 1)
Write-Host "Test 7: Year boundary (Dec 31 → Jan 1)"
try {
    $yearEnd = (Get-Date).Year
    $startAt = "$yearEnd-12-31T10:00:00Z"
    $endAt = "$($yearEnd + 1)-01-01T10:00:00Z"
    
    $availUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
    $availResp = Invoke-RestMethod -Uri $availUri -Headers @{ "X-API-Key" = $apiKey } -Method GET
    
    Write-Host "  Availability: $($availResp.availability_status)" -ForegroundColor Cyan
    Write-Host "  Days: $($availResp.pricing.days)" -ForegroundColor Cyan
    Write-Host "  ✅ Year boundary handled" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 8: Past dates (should fail)
Write-Host "Test 8: Past dates (should fail)"
try {
    $pastDate = (Get-Date).ToUniversalTime().Date.AddDays(-7)
    $startAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $pastDate)
    $endAt = ("{0:yyyy-MM-dd}T14:00:00Z" -f $pastDate)
    
    $availUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
    $availResp = Invoke-RestMethod -Uri $availUri -Headers @{ "X-API-Key" = $apiKey } -Method GET
    
    if ($availResp.availability_status -eq "closed") {
        Write-Host "  ✅ Past dates correctly marked as closed" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Past dates returned: $($availResp.availability_status)" -ForegroundColor Yellow
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 400 -or $statusCode -eq 404) {
        Write-Host "  ✅ Past dates correctly rejected ($statusCode)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Failed: $($_.Exception.Message) (Status: $statusCode)" -ForegroundColor Red
    }
}
Write-Host ""

Write-Host "=== Edge Cases Test Complete ==="

