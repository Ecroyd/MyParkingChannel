# Supplier BOOKING AMENDMENTS & CANCELLATIONS Test
# Creates bookings, then amends 10 and cancels 10

$baseUrl = "http://localhost:3002"
$apiKey  = "01dbc10fdde0338e12fee013b329c3f1802e84340c2f9493900524472c8e2ad4"
$productId = "ab6a2d39-2162-4d5b-936e-15aa92c33a63"

# How many bookings to create initially
$totalBookings = 20
$amendmentsCount = 10
$cancellationsCount = 10

$today = (Get-Date).ToUniversalTime().Date

# Sample data pools
$firstNames = @("James", "Sarah", "Michael", "Emma", "David", "Olivia", "Robert", "Sophia", "William", "Isabella", "Richard", "Charlotte", "Joseph", "Amelia", "Thomas", "Mia", "Daniel", "Harper", "Matthew", "Evelyn")
$lastNames = @("Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "White", "Harris")
$carMakes = @("Audi", "BMW", "Mercedes", "Ford", "Toyota", "Volkswagen", "Nissan", "Honda", "Hyundai", "Kia", "Volvo", "Jaguar", "Land Rover", "Porsche", "Tesla", "Mini")
$carModels = @("A3", "3 Series", "C-Class", "Focus", "Corolla", "Golf", "Qashqai", "Civic", "i30", "Sportage", "XC60", "XF", "Discovery", "911", "Model 3", "Cooper")
$carColours = @("Black", "White", "Silver", "Grey", "Blue", "Red", "Green", "Navy")

Write-Host "=== Supplier BOOKING AMENDMENTS & CANCELLATIONS Test ==="
Write-Host "Creating $totalBookings bookings, then amending $amendmentsCount and cancelling $cancellationsCount"
Write-Host ""

$createdBookings = @()
$amendedBookings = @()
$cancelledBookings = @()

# Step 1: Create initial bookings
Write-Host "=== STEP 1: Creating $totalBookings bookings ==="
Write-Host ""

for ($i = 1; $i -le $totalBookings; $i++) {
    # Random offset within next 14 days
    $offsetDays = Get-Random -Minimum 0 -Maximum 14
    $lengthDays = Get-Random -Minimum 1 -Maximum 8

    $startDate = $today.AddDays($offsetDays)
    $endDate = $startDate.AddDays($lengthDays)

    $startAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $startDate)
    $endAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $endDate)

    # Check availability
    $availabilityUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
    
    try {
        $availabilityResp = Invoke-RestMethod `
            -Uri $availabilityUri `
            -Headers @{ "X-API-Key" = $apiKey } `
            -Method GET

        if ($availabilityResp.availability_status -ne "available") {
            Write-Host "[$i/$totalBookings] ⚠️  Skipping (not available)" -ForegroundColor Yellow
            continue
        }

        $totalPrice = $availabilityResp.pricing.total_price

        # Create booking
        $bookingUri = "$baseUrl/api/supplier/v1/bookings"
        
        $firstName = $firstNames | Get-Random
        $lastName = $lastNames | Get-Random
        $email = "$($firstName.ToLower()).$($lastName.ToLower())@example.com"
        $phone = "+44" + (Get-Random -Minimum 7000000000 -Maximum 7999999999)
        
        $carMake = $carMakes | Get-Random
        $carModel = $carModels | Get-Random
        $carColour = $carColours | Get-Random
        
        $plateLetters1 = -join ((65..90) | Get-Random -Count 2 | ForEach-Object { [char]$_ })
        $plateNumbers = (Get-Random -Minimum 10 -Maximum 100).ToString()
        $plateLetters2 = -join ((65..90) | Get-Random -Count 3 | ForEach-Object { [char]$_ })
        $plate = "$plateLetters1$plateNumbers $plateLetters2"

        $externalRef = "AMEND-CANCEL-TEST-$(Get-Date -Format 'yyyyMMdd')-$i-$(Get-Random -Minimum 1000 -Maximum 9999)"

        $bookingBody = @{
            external_reference = $externalRef
            product_id = $productId
            start_at = $startAt
            end_at = $endAt
            customer = @{
                first_name = $firstName
                last_name = $lastName
                email = $email
                phone = $phone
            }
            vehicle = @{
                plate = $plate
                make = $carMake
                model = $carModel
                colour = $carColour
            }
            price = @{
                currency = "GBP"
                total = $totalPrice
            }
        } | ConvertTo-Json -Depth 10

        try {
            $bookingResp = Invoke-RestMethod `
                -Uri $bookingUri `
                -Headers @{ 
                    "X-API-Key" = $apiKey
                    "Content-Type" = "application/json"
                } `
                -Method POST `
                -Body $bookingBody

            $bookingRef = $bookingResp.reference
            Write-Host "[$i/$totalBookings] ✅ Created: $bookingRef ($startAt → $endAt)" -ForegroundColor Green
            
            $createdBookings += @{
                reference = $bookingRef
                start_at = $startAt
                end_at = $endAt
                original_start = $startAt
                original_end = $endAt
            }
        }
        catch {
            Write-Host "[$i/$totalBookings] ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "[$i/$totalBookings] ❌ Availability check failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Created $($createdBookings.Count) bookings"
Write-Host ""

# Step 2: Amend bookings
Write-Host "=== STEP 2: Amending $amendmentsCount bookings ==="
Write-Host ""

$bookingsToAmend = $createdBookings | Select-Object -First $amendmentsCount

foreach ($booking in $bookingsToAmend) {
    $reference = $booking.reference
    
    # Amend customer and vehicle details (not dates)
    $newFirstName = $firstNames | Get-Random
    $newLastName = $lastNames | Get-Random
    $newEmail = "$($newFirstName.ToLower()).$($newLastName.ToLower()).updated@example.com"
    $newPhone = "+44" + (Get-Random -Minimum 7000000000 -Maximum 7999999999)
    
    $newCarMake = $carMakes | Get-Random
    $newCarModel = $carModels | Get-Random
    $newCarColour = $carColours | Get-Random
    
    $newPlateLetters1 = -join ((65..90) | Get-Random -Count 2 | ForEach-Object { [char]$_ })
    $newPlateNumbers = (Get-Random -Minimum 10 -Maximum 100).ToString()
    $newPlateLetters2 = -join ((65..90) | Get-Random -Count 3 | ForEach-Object { [char]$_ })
    $newPlate = "$newPlateLetters1$newPlateNumbers $newPlateLetters2"
    
    $newFlightNumber = "BA" + (Get-Random -Minimum 100 -Maximum 999)
    
    $encodedRef = [uri]::EscapeDataString($reference)
    $amendUri = "$baseUrl/api/supplier/v1/bookings/$encodedRef"
    
    $amendBody = @{
        customer_name = "$newFirstName $newLastName"
        customer_email = $newEmail
        customer_phone = $newPhone
        plate = $newPlate
        car_make = $newCarMake
        car_model = $newCarModel
        car_color = $newCarColour
        flight_number = $newFlightNumber
        notes = "Amended via test script on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    } | ConvertTo-Json

    Write-Host "Amending $reference..."
    Write-Host "  Updating customer/vehicle details (not dates)"
    Write-Host "  New customer: $newFirstName $newLastName ($newEmail)"
    Write-Host "  New vehicle: $newPlate ($newCarMake $newCarModel, $newCarColour)"
    Write-Host "  New flight: $newFlightNumber"

    try {
        $amendResp = Invoke-RestMethod `
            -Uri $amendUri `
            -Headers @{ 
                "X-API-Key" = $apiKey
                "Content-Type" = "application/json"
            } `
            -Method PATCH `
            -Body $amendBody

        Write-Host "  ✅ AMENDED successfully" -ForegroundColor Green
        $amendedBookings += $reference
    }
    catch {
        Write-Host "  ❌ AMENDMENT FAILED: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response -ne $null) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $body = $reader.ReadToEnd()
            Write-Host "     Response: $body"
        }
    }
    Write-Host ""
}

Write-Host "Amended $($amendedBookings.Count) bookings"
Write-Host ""

# Step 3: Cancel bookings
Write-Host "=== STEP 3: Cancelling $cancellationsCount bookings ==="
Write-Host ""

# Get bookings that weren't amended (to avoid cancelling amended ones)
$bookingsToCancel = $createdBookings | Where-Object { $amendedBookings -notcontains $_.reference } | Select-Object -First $cancellationsCount

if ($bookingsToCancel.Count -lt $cancellationsCount) {
    Write-Host "⚠️  Warning: Only $($bookingsToCancel.Count) bookings available to cancel (requested $cancellationsCount)" -ForegroundColor Yellow
}

foreach ($booking in $bookingsToCancel) {
    $reference = $booking.reference
    
    $encodedRef = [uri]::EscapeDataString($reference)
    $cancelUri = "$baseUrl/api/supplier/v1/bookings/$encodedRef/cancel"
    
    Write-Host "Cancelling $reference..."

    try {
        $cancelResp = Invoke-RestMethod `
            -Uri $cancelUri `
            -Headers @{ 
                "X-API-Key" = $apiKey
                "Content-Type" = "application/json"
            } `
            -Method POST

        Write-Host "  ✅ CANCELLED successfully (status: $($cancelResp.status))" -ForegroundColor Green
        $cancelledBookings += $reference
    }
    catch {
        Write-Host "  ❌ CANCELLATION FAILED: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response -ne $null) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $body = $reader.ReadToEnd()
            Write-Host "     Response: $body"
        }
    }
    Write-Host ""
}

Write-Host "Cancelled $($cancelledBookings.Count) bookings"
Write-Host ""

# Summary
Write-Host "=== TEST SUMMARY ==="
Write-Host "  ✅ Created: $($createdBookings.Count) bookings"
Write-Host "  🔄 Amended: $($amendedBookings.Count) bookings"
Write-Host "  ❌ Cancelled: $($cancelledBookings.Count) bookings"
Write-Host ""

if ($amendedBookings.Count -gt 0) {
    Write-Host "Amended booking references:" -ForegroundColor Cyan
    $amendedBookings | ForEach-Object { Write-Host "  - $_" }
    Write-Host ""
}

if ($cancelledBookings.Count -gt 0) {
    Write-Host "Cancelled booking references:" -ForegroundColor Cyan
    $cancelledBookings | ForEach-Object { Write-Host "  - $_" }
    Write-Host ""
}

Write-Host "=== Test Complete ==="

