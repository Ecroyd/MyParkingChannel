# Supplier API BOOKING LIFECYCLE Test
# Tests full booking lifecycle: Create → Amend → Cancel

$baseUrl = "http://localhost:3002"
$apiKey  = "01dbc10fdde0338e12fee013b329c3f1802e84340c2f9493900524472c8e2ad4"
$productId = "ab6a2d39-2162-4d5b-936e-15aa92c33a63"

$today = (Get-Date).ToUniversalTime().Date.AddDays(7)
$startAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $today)
$endAt = ("{0:yyyy-MM-dd}T14:00:00Z" -f $today)

Write-Host "=== Supplier API BOOKING LIFECYCLE Test ==="
Write-Host "Tests: Create → Amend → Cancel"
Write-Host ""

# Step 1: Create booking
Write-Host "=== STEP 1: Create Booking ==="
Write-Host ""

try {
    # Check availability
    $availUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
    $availResp = Invoke-RestMethod -Uri $availUri -Headers @{ "X-API-Key" = $apiKey } -Method GET

    if ($availResp.availability_status -ne "available") {
        Write-Host "❌ Not available, cannot proceed" -ForegroundColor Red
        exit
    }

    $body = @{
        external_reference = "LIFECYCLE-TEST-$(Get-Date -Format 'yyyyMMddHHmmss')"
        product_id = $productId
        start_at = $startAt
        end_at = $endAt
        customer = @{
            first_name = "Lifecycle"
            last_name = "Test"
            email = "lifecycle.test@example.com"
            phone = "+447700900123"
        }
        vehicle = @{
            plate = "LIFE123"
            make = "Test"
            model = "Car"
            colour = "Black"
        }
        price = @{
            currency = "GBP"
            total = $availResp.pricing.total_price
        }
    } | ConvertTo-Json -Depth 10

    $createResp = Invoke-RestMethod -Uri "$baseUrl/api/supplier/v1/bookings" `
        -Headers @{ "X-API-Key" = $apiKey; "Content-Type" = "application/json" } `
        -Method POST -Body $body

    $reference = $createResp.reference
    Write-Host "✅ Booking created: $reference" -ForegroundColor Green
    Write-Host "   Status: $($createResp.status)"
    Write-Host "   Source: $($createResp.source)"
    Write-Host ""
} catch {
    Write-Host "❌ Failed to create booking: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# Step 2: GET booking
Write-Host "=== STEP 2: GET Booking ==="
Write-Host ""

try {
    $encodedRef = [uri]::EscapeDataString($reference)
    $getResp = Invoke-RestMethod -Uri "$baseUrl/api/supplier/v1/bookings/$encodedRef" `
        -Headers @{ "X-API-Key" = $apiKey } `
        -Method GET

    Write-Host "✅ Booking retrieved: $($getResp.reference)" -ForegroundColor Green
    Write-Host "   Customer: $($getResp.customer.name)"
    Write-Host "   Vehicle: $($getResp.vehicle.plate)"
    Write-Host "   Status: $($getResp.status)"
    Write-Host ""
} catch {
    Write-Host "❌ Failed to get booking: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 3: Amend booking
Write-Host "=== STEP 3: Amend Booking ==="
Write-Host ""

try {
    $amendBody = @{
        customer_name = "Lifecycle Test Updated"
        customer_email = "lifecycle.updated@example.com"
        customer_phone = "+447700900456"
        plate = "LIFE456"
        car_make = "Updated"
        car_model = "Vehicle"
        car_color = "White"
        flight_number = "BA123"
        notes = "Amended via lifecycle test"
    } | ConvertTo-Json

    $encodedRef = [uri]::EscapeDataString($reference)
    $amendResp = Invoke-RestMethod -Uri "$baseUrl/api/supplier/v1/bookings/$encodedRef" `
        -Headers @{ "X-API-Key" = $apiKey; "Content-Type" = "application/json" } `
        -Method PATCH -Body $amendBody

    Write-Host "✅ Booking amended successfully" -ForegroundColor Green
    Write-Host "   Customer: $($amendResp.customer.name)"
    Write-Host "   Vehicle: $($amendResp.vehicle.plate)"
    Write-Host "   Flight: $($amendResp.flight_number)"
    Write-Host ""
} catch {
    Write-Host "❌ Failed to amend booking: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response -ne $null) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        Write-Host "   Response: $body"
    }
}

# Step 4: Verify amendment
Write-Host "=== STEP 4: Verify Amendment ==="
Write-Host ""

try {
    $encodedRef = [uri]::EscapeDataString($reference)
    $getResp = Invoke-RestMethod -Uri "$baseUrl/api/supplier/v1/bookings/$encodedRef" `
        -Headers @{ "X-API-Key" = $apiKey } `
        -Method GET

    Write-Host "Current booking state:"
    Write-Host "   Customer: $($getResp.customer.name)"
    Write-Host "   Email: $($getResp.customer.email)"
    Write-Host "   Phone: $($getResp.customer.phone)"
    Write-Host "   Vehicle: $($getResp.vehicle.plate) - $($getResp.vehicle.make) $($getResp.vehicle.model)"
    Write-Host "   Flight: $($getResp.flight_number)"
    Write-Host "   Notes: $($getResp.notes)"
    Write-Host ""
} catch {
    Write-Host "❌ Failed to verify: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 5: Cancel booking
Write-Host "=== STEP 5: Cancel Booking ==="
Write-Host ""

try {
    $encodedRef = [uri]::EscapeDataString($reference)
    $cancelResp = Invoke-RestMethod -Uri "$baseUrl/api/supplier/v1/bookings/$encodedRef/cancel" `
        -Headers @{ "X-API-Key" = $apiKey; "Content-Type" = "application/json" } `
        -Method POST

    Write-Host "✅ Booking cancelled successfully" -ForegroundColor Green
    Write-Host "   Reference: $($cancelResp.reference)"
    Write-Host "   Status: $($cancelResp.status)"
    Write-Host ""
} catch {
    Write-Host "❌ Failed to cancel booking: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response -ne $null) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        Write-Host "   Response: $body"
    }
}

# Step 6: Verify cancellation
Write-Host "=== STEP 6: Verify Cancellation ==="
Write-Host ""

try {
    $encodedRef = [uri]::EscapeDataString($reference)
    $getResp = Invoke-RestMethod -Uri "$baseUrl/api/supplier/v1/bookings/$encodedRef" `
        -Headers @{ "X-API-Key" = $apiKey } `
        -Method GET

    if ($getResp.status -eq "cancelled") {
        Write-Host "✅ Booking is correctly marked as cancelled" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Booking status is: $($getResp.status) (expected: cancelled)" -ForegroundColor Yellow
    }
    Write-Host ""
} catch {
    Write-Host "❌ Failed to verify cancellation: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 7: Try to amend cancelled booking (should fail)
Write-Host "=== STEP 7: Try to Amend Cancelled Booking (should fail) ==="
Write-Host ""

try {
    $amendBody = @{
        customer_name = "Should Fail"
    } | ConvertTo-Json

    $encodedRef = [uri]::EscapeDataString($reference)
    $amendResp = Invoke-RestMethod -Uri "$baseUrl/api/supplier/v1/bookings/$encodedRef" `
        -Headers @{ "X-API-Key" = $apiKey; "Content-Type" = "application/json" } `
        -Method PATCH -Body $amendBody -ErrorAction Stop

    Write-Host "❌ Should have failed but didn't!" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 409) {
        Write-Host "✅ Correctly rejected amendment of cancelled booking (409 Conflict)" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Got status $($_.Exception.Response.StatusCode.value__) instead of 409" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== LIFECYCLE TEST COMPLETE ==="
Write-Host "Full booking lifecycle tested: Create → Get → Amend → Verify → Cancel → Verify"

