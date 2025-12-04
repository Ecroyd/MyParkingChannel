# Test a single booking creation (reproduce one failed test)

$baseUrl = "http://localhost:3002"
$apiKey  = "01dbc10fdde0338e12fee013b329c3f1802e84340c2f9493900524472c8e2ad4"
$productId = "ab6a2d39-2162-4d5b-936e-15aa92c33a63"

# Example from your failed test (line 950-956)
$startAt = "2025-12-31T10:00:00Z"
$endAt   = "2026-01-01T10:00:00Z"

# Or use a different failed test - uncomment one:
# $startAt = "2025-12-24T10:00:00Z"
# $endAt   = "2026-01-21T10:00:00Z"

Write-Host "=== Testing Single Booking Creation ==="
Write-Host ""

# Step 1: Check availability
Write-Host "Step 1: Checking availability..."
$availabilityUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
Write-Host "GET $availabilityUri"

try {
    $availabilityResp = Invoke-RestMethod `
        -Uri $availabilityUri `
        -Headers @{ "X-API-Key" = $apiKey } `
        -Method GET

    $status = $availabilityResp.availability_status
    $totalPrice = $availabilityResp.pricing.total_price
    $days = $availabilityResp.pricing.days

    Write-Host "✅ Availability: status=$status days=$days total_price=$totalPrice" -ForegroundColor Green
    Write-Host ""

    if ($status -ne "available") {
        Write-Host "❌ Not available, cannot create booking" -ForegroundColor Red
        exit
    }

    # Step 2: Create booking
    Write-Host "Step 2: Creating booking..."
    $bookingUri = "$baseUrl/api/supplier/v1/bookings"

    # Test data (matching your failed test structure)
    $bookingBody = @{
        external_reference = "TEST-SINGLE-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        product_id = $productId
        start_at = $startAt
        end_at = $endAt
        customer = @{
            first_name = "Test"
            last_name = "User"
            email = "test.user@example.com"
            phone = "+447700900123"
        }
        vehicle = @{
            plate = "AB12 CDE"
            make = "Test"
            model = "Car"
            colour = "Black"
        }
        price = @{
            currency = "GBP"
            total = $totalPrice
        }
    } | ConvertTo-Json -Depth 10

    Write-Host "POST $bookingUri"
    Write-Host "Body:"
    Write-Host ($bookingBody | ConvertFrom-Json | ConvertTo-Json -Depth 10)
    Write-Host ""

    try {
        $bookingResp = Invoke-RestMethod `
            -Uri $bookingUri `
            -Headers @{ 
                "X-API-Key" = $apiKey
                "Content-Type" = "application/json"
            } `
            -Method POST `
            -Body $bookingBody

        Write-Host "✅ BOOKING CREATED SUCCESSFULLY!" -ForegroundColor Green
        Write-Host ($bookingResp | ConvertTo-Json -Depth 10)
    }
    catch {
        Write-Host "❌ BOOKING CREATION FAILED" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)"
        
        if ($_.Exception.Response -ne $null) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $body = $reader.ReadToEnd()
            Write-Host ""
            Write-Host "Response body:"
            Write-Host $body
        }
    }
}
catch {
    Write-Host "❌ AVAILABILITY CHECK FAILED" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)"
    
    if ($_.Exception.Response -ne $null) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        Write-Host ""
        Write-Host "Response body:"
        Write-Host $body
    }
}

Write-Host ""
Write-Host "=== Test Complete ==="
Write-Host ""
Write-Host "💡 Check your server logs for the detailed error message with [SUPPLIER_BOOKING] prefix"

