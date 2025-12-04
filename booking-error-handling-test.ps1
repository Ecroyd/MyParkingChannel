# Supplier API ERROR HANDLING Test
# Tests various error scenarios and edge cases

$baseUrl = "http://localhost:3002"
$apiKey  = "01dbc10fdde0338e12fee013b329c3f1802e84340c2f9493900524472c8e2ad4"
$productId = "ab6a2d39-2162-4d5b-936e-15aa92c33a63"

Write-Host "=== Supplier API ERROR HANDLING Test ==="
Write-Host ""

$testResults = @()

# Test 1: Missing required fields
Write-Host "Test 1: Missing required fields"
try {
    $body = @{
        product_id = $productId
        # Missing start_at, end_at, customer
    } | ConvertTo-Json
    
    $resp = Invoke-RestMethod -Uri "$baseUrl/api/supplier/v1/bookings" `
        -Headers @{ "X-API-Key" = $apiKey; "Content-Type" = "application/json" } `
        -Method POST -Body $body -ErrorAction Stop
    
    Write-Host "  ❌ Should have failed but didn't" -ForegroundColor Red
    $testResults += @{ test = "Missing fields"; result = "FAILED"; expected = "400 Bad Request" }
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 400) {
        Write-Host "  ✅ Correctly rejected (400 Bad Request)" -ForegroundColor Green
        $testResults += @{ test = "Missing fields"; result = "PASSED"; expected = "400 Bad Request" }
    } else {
        Write-Host "  ⚠️  Got $($_.Exception.Response.StatusCode.value__) instead of 400" -ForegroundColor Yellow
        $testResults += @{ test = "Missing fields"; result = "PARTIAL"; expected = "400 Bad Request" }
    }
}
Write-Host ""

# Test 2: Invalid dates (end before start)
Write-Host "Test 2: Invalid dates (end before start)"
try {
    $body = @{
        product_id = $productId
        start_at = "2025-12-15T10:00:00Z"
        end_at = "2025-12-10T10:00:00Z"  # Before start
        customer = @{ first_name = "Test"; last_name = "User"; email = "test@example.com" }
        vehicle = @{ plate = "TEST123" }
        price = @{ currency = "GBP"; total = 10 }
    } | ConvertTo-Json
    
    $resp = Invoke-RestMethod -Uri "$baseUrl/api/supplier/v1/bookings" `
        -Headers @{ "X-API-Key" = $apiKey; "Content-Type" = "application/json" } `
        -Method POST -Body $body -ErrorAction Stop
    
    Write-Host "  ❌ Should have failed but didn't" -ForegroundColor Red
    $testResults += @{ test = "End before start"; result = "FAILED"; expected = "400 Bad Request" }
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 400) {
        Write-Host "  ✅ Correctly rejected (400 Bad Request)" -ForegroundColor Green
        $testResults += @{ test = "End before start"; result = "PASSED"; expected = "400 Bad Request" }
    } else {
        Write-Host "  ⚠️  Got $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
        $testResults += @{ test = "End before start"; result = "PARTIAL"; expected = "400 Bad Request" }
    }
}
Write-Host ""

# Test 3: Invalid product_id
Write-Host "Test 3: Invalid product_id"
try {
    $body = @{
        product_id = "00000000-0000-0000-0000-000000000000"  # Non-existent
        start_at = "2025-12-15T10:00:00Z"
        end_at = "2025-12-16T10:00:00Z"
        customer = @{ first_name = "Test"; last_name = "User"; email = "test@example.com" }
        vehicle = @{ plate = "TEST123" }
        price = @{ currency = "GBP"; total = 10 }
    } | ConvertTo-Json
    
    $resp = Invoke-RestMethod -Uri "$baseUrl/api/supplier/v1/bookings" `
        -Headers @{ "X-API-Key" = $apiKey; "Content-Type" = "application/json" } `
        -Method POST -Body $body -ErrorAction Stop
    
    Write-Host "  ❌ Should have failed but didn't" -ForegroundColor Red
    $testResults += @{ test = "Invalid product_id"; result = "FAILED"; expected = "404 Not Found" }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 404 -or $statusCode -eq 400) {
        Write-Host "  ✅ Correctly rejected ($statusCode)" -ForegroundColor Green
        $testResults += @{ test = "Invalid product_id"; result = "PASSED"; expected = "404/400" }
    } else {
        Write-Host "  ⚠️  Got $statusCode" -ForegroundColor Yellow
        $testResults += @{ test = "Invalid product_id"; result = "PARTIAL"; expected = "404/400" }
    }
}
Write-Host ""

# Test 4: Invalid API key
Write-Host "Test 4: Invalid API key"
try {
    $body = @{
        product_id = $productId
        start_at = "2025-12-15T10:00:00Z"
        end_at = "2025-12-16T10:00:00Z"
        customer = @{ first_name = "Test"; last_name = "User"; email = "test@example.com" }
        vehicle = @{ plate = "TEST123" }
        price = @{ currency = "GBP"; total = 10 }
    } | ConvertTo-Json
    
    $resp = Invoke-RestMethod -Uri "$baseUrl/api/supplier/v1/bookings" `
        -Headers @{ "X-API-Key" = "invalid-key-12345"; "Content-Type" = "application/json" } `
        -Method POST -Body $body -ErrorAction Stop
    
    Write-Host "  ❌ Should have failed but didn't" -ForegroundColor Red
    $testResults += @{ test = "Invalid API key"; result = "FAILED"; expected = "401 Unauthorized" }
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 401) {
        Write-Host "  ✅ Correctly rejected (401 Unauthorized)" -ForegroundColor Green
        $testResults += @{ test = "Invalid API key"; result = "PASSED"; expected = "401 Unauthorized" }
    } else {
        Write-Host "  ⚠️  Got $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
        $testResults += @{ test = "Invalid API key"; result = "PARTIAL"; expected = "401 Unauthorized" }
    }
}
Write-Host ""

# Test 5: Negative price
Write-Host "Test 5: Negative price"
try {
    $body = @{
        product_id = $productId
        start_at = "2025-12-15T10:00:00Z"
        end_at = "2025-12-16T10:00:00Z"
        customer = @{ first_name = "Test"; last_name = "User"; email = "test@example.com" }
        vehicle = @{ plate = "TEST123" }
        price = @{ currency = "GBP"; total = -10 }  # Negative
    } | ConvertTo-Json
    
    $resp = Invoke-RestMethod -Uri "$baseUrl/api/supplier/v1/bookings" `
        -Headers @{ "X-API-Key" = $apiKey; "Content-Type" = "application/json" } `
        -Method POST -Body $body -ErrorAction Stop
    
    Write-Host "  ❌ Should have failed but didn't" -ForegroundColor Red
    $testResults += @{ test = "Negative price"; result = "FAILED"; expected = "400 Bad Request" }
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 400) {
        Write-Host "  ✅ Correctly rejected (400 Bad Request)" -ForegroundColor Green
        $testResults += @{ test = "Negative price"; result = "PASSED"; expected = "400 Bad Request" }
    } else {
        Write-Host "  ⚠️  Got $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
        $testResults += @{ test = "Negative price"; result = "PARTIAL"; expected = "400 Bad Request" }
    }
}
Write-Host ""

# Test 6: Duplicate external_reference (idempotency)
Write-Host "Test 6: Duplicate external_reference (idempotency)"
try {
    $externalRef = "IDEMPOTENCY-TEST-$(Get-Date -Format 'yyyyMMddHHmmss')"
    $today = (Get-Date).ToUniversalTime().Date.AddDays(7)
    $startAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $today)
    $endAt = ("{0:yyyy-MM-dd}T14:00:00Z" -f $today)
    
    # Check availability
    $availUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
    $availResp = Invoke-RestMethod -Uri $availUri -Headers @{ "X-API-Key" = $apiKey } -Method GET
    
    if ($availResp.availability_status -ne "available") {
        Write-Host "  ⚠️  Skipping - not available" -ForegroundColor Yellow
    } else {
        $body = @{
            external_reference = $externalRef
            product_id = $productId
            start_at = $startAt
            end_at = $endAt
            customer = @{ first_name = "Test"; last_name = "User"; email = "test@example.com" }
            vehicle = @{ plate = "TEST123" }
            price = @{ currency = "GBP"; total = $availResp.pricing.total_price }
        } | ConvertTo-Json
        
        # First request
        $resp1 = Invoke-RestMethod -Uri "$baseUrl/api/supplier/v1/bookings" `
            -Headers @{ "X-API-Key" = $apiKey; "Content-Type" = "application/json" } `
            -Method POST -Body $body
        
        Write-Host "  First booking created: $($resp1.reference)" -ForegroundColor Cyan
        
        # Second request with same external_reference
        $resp2 = Invoke-RestMethod -Uri "$baseUrl/api/supplier/v1/bookings" `
            -Headers @{ "X-API-Key" = $apiKey; "Content-Type" = "application/json" } `
            -Method POST -Body $body
        
        if ($resp1.reference -eq $resp2.reference) {
            Write-Host "  ✅ Idempotency working - same reference returned" -ForegroundColor Green
            $testResults += @{ test = "Idempotency"; result = "PASSED"; expected = "Same reference" }
        } else {
            Write-Host "  ⚠️  Different references returned" -ForegroundColor Yellow
            $testResults += @{ test = "Idempotency"; result = "PARTIAL"; expected = "Same reference" }
        }
    }
} catch {
    Write-Host "  ❌ Test failed: $($_.Exception.Message)" -ForegroundColor Red
    $testResults += @{ test = "Idempotency"; result = "FAILED"; expected = "Same reference" }
}
Write-Host ""

# Test 7: GET booking by reference
Write-Host "Test 7: GET booking by reference"
try {
    # First create a booking
    $today = (Get-Date).ToUniversalTime().Date.AddDays(7)
    $startAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $today)
    $endAt = ("{0:yyyy-MM-dd}T14:00:00Z" -f $today)
    
    $availUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
    $availResp = Invoke-RestMethod -Uri $availUri -Headers @{ "X-API-Key" = $apiKey } -Method GET
    
    if ($availResp.availability_status -eq "available") {
        $body = @{
            product_id = $productId
            start_at = $startAt
            end_at = $endAt
            customer = @{ first_name = "Get"; last_name = "Test"; email = "gettest@example.com" }
            vehicle = @{ plate = "GET123" }
            price = @{ currency = "GBP"; total = $availResp.pricing.total_price }
        } | ConvertTo-Json
        
        $createResp = Invoke-RestMethod -Uri "$baseUrl/api/supplier/v1/bookings" `
            -Headers @{ "X-API-Key" = $apiKey; "Content-Type" = "application/json" } `
            -Method POST -Body $body
        
        $reference = $createResp.reference
        Write-Host "  Created booking: $reference" -ForegroundColor Cyan
        
        # Now try to GET it
        $encodedRef = [uri]::EscapeDataString($reference)
        $getResp = Invoke-RestMethod -Uri "$baseUrl/api/supplier/v1/bookings/$encodedRef" `
            -Headers @{ "X-API-Key" = $apiKey } `
            -Method GET
        
        if ($getResp.reference -eq $reference) {
            Write-Host "  ✅ Successfully retrieved booking" -ForegroundColor Green
            $testResults += @{ test = "GET booking"; result = "PASSED"; expected = "200 OK" }
        } else {
            Write-Host "  ⚠️  Retrieved but reference mismatch" -ForegroundColor Yellow
            $testResults += @{ test = "GET booking"; result = "PARTIAL"; expected = "200 OK" }
        }
    } else {
        Write-Host "  ⚠️  Skipping - not available" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ❌ Test failed: $($_.Exception.Message)" -ForegroundColor Red
    $testResults += @{ test = "GET booking"; result = "FAILED"; expected = "200 OK" }
}
Write-Host ""

# Test 8: GET non-existent booking
Write-Host "Test 8: GET non-existent booking"
try {
    $fakeRef = "NONEXISTENT-REF-12345"
    $encodedRef = [uri]::EscapeDataString($fakeRef)
    
    $resp = Invoke-RestMethod -Uri "$baseUrl/api/supplier/v1/bookings/$encodedRef" `
        -Headers @{ "X-API-Key" = $apiKey } `
        -Method GET -ErrorAction Stop
    
    Write-Host "  ❌ Should have failed but didn't" -ForegroundColor Red
    $testResults += @{ test = "GET non-existent"; result = "FAILED"; expected = "404 Not Found" }
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) {
        Write-Host "  ✅ Correctly rejected (404 Not Found)" -ForegroundColor Green
        $testResults += @{ test = "GET non-existent"; result = "PASSED"; expected = "404 Not Found" }
    } else {
        Write-Host "  ⚠️  Got $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
        $testResults += @{ test = "GET non-existent"; result = "PARTIAL"; expected = "404 Not Found" }
    }
}
Write-Host ""

# Summary
Write-Host "=== TEST SUMMARY ==="
Write-Host ""
$passed = ($testResults | Where-Object { $_.result -eq "PASSED" }).Count
$partial = ($testResults | Where-Object { $_.result -eq "PARTIAL" }).Count
$failed = ($testResults | Where-Object { $_.result -eq "FAILED" }).Count

foreach ($result in $testResults) {
    $color = if ($result.result -eq "PASSED") { "Green" } 
             elseif ($result.result -eq "PARTIAL") { "Yellow" } 
             else { "Red" }
    Write-Host "  $($result.result): $($result.test)" -ForegroundColor $color
}

Write-Host ""
Write-Host "Total: $passed passed, $partial partial, $failed failed"
Write-Host ""

