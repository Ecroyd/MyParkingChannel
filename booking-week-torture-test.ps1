# Supplier BOOKING CREATION torture test - Next 7 Days
# Creates 20 bookings all within the next week

$baseUrl = "http://localhost:3002"
$apiKey  = "01dbc10fdde0338e12fee013b329c3f1802e84340c2f9493900524472c8e2ad4"
$productId = "ab6a2d39-2162-4d5b-936e-15aa92c33a63"

# How many bookings to create
$totalRequests = 20
$maxDaysAhead = 7  # All bookings within next 7 days

$today = (Get-Date).ToUniversalTime().Date

# Sample data pools for randomization
$firstNames = @("James", "Sarah", "Michael", "Emma", "David", "Olivia", "Robert", "Sophia", "William", "Isabella", "Richard", "Charlotte", "Joseph", "Amelia", "Thomas", "Mia", "Daniel", "Harper", "Matthew", "Evelyn")
$lastNames = @("Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "White", "Harris")
$carMakes = @("Audi", "BMW", "Mercedes", "Ford", "Toyota", "Volkswagen", "Nissan", "Honda", "Hyundai", "Kia", "Volvo", "Jaguar", "Land Rover", "Porsche", "Tesla", "Mini", "Mazda", "Subaru", "Lexus", "Jeep")
$carModels = @("A3", "3 Series", "C-Class", "Focus", "Corolla", "Golf", "Qashqai", "Civic", "i30", "Sportage", "XC60", "XF", "Discovery", "911", "Model 3", "Cooper", "CX-5", "Outback", "RX", "Wrangler")
$carColours = @("Black", "White", "Silver", "Grey", "Blue", "Red", "Green", "Navy", "Metallic Black", "Pearl White", "Graphite", "Burgundy", "Bronze", "Champagne")

Write-Host "=== Supplier BOOKING CREATION Torture Test (Next 7 Days) ==="
Write-Host "Creating $totalRequests bookings all within the next $maxDaysAhead days"
Write-Host ""

$successCount = 0
$errorCount = 0
$duplicateCount = 0
$skippedCount = 0

for ($i = 1; $i -le $totalRequests; $i++) {
    # Random offset within next 7 days
    $offsetDays = Get-Random -Minimum 0 -Maximum $maxDaysAhead
    
    # LOS length: 1–7 days (varied but all within week)
    $lengthDays = Get-Random -Minimum 1 -Maximum 8

    $startDate = $today.AddDays($offsetDays)
    $endDate   = $startDate.AddDays($lengthDays)

    # Always use 10:00Z
    $startAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $startDate)
    $endAt   = ("{0:yyyy-MM-dd}T10:00:00Z" -f $endDate)

    # Step 1: Get availability to fetch the price
    $availabilityUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
    
    Write-Host ""
    Write-Host "[$i/$totalRequests] Checking availability..."
    Write-Host "  Dates: $startAt → $endAt ($lengthDays days)"
    
    try {
        $availabilityResp = Invoke-RestMethod `
            -Uri $availabilityUri `
            -Headers @{ "X-API-Key" = $apiKey } `
            -Method GET

        $status = $availabilityResp.availability_status
        $totalPrice = $availabilityResp.pricing.total_price
        $days = $availabilityResp.pricing.days

        Write-Host "  ✅ Availability: status=$status days=$days total_price=£$totalPrice"

        # Skip booking creation if not available
        if ($status -ne "available") {
            Write-Host "  ⚠️  Skipping booking creation (status=$status)" -ForegroundColor Yellow
            $skippedCount++
            continue
        }

        # Step 2: Create booking with the price from availability
        $bookingUri = "$baseUrl/api/supplier/v1/bookings"
        
        # Generate random customer/vehicle data
        $firstName = $firstNames | Get-Random
        $lastName = $lastNames | Get-Random
        $email = "$($firstName.ToLower()).$($lastName.ToLower())@example.com"
        $phone = "+44" + (Get-Random -Minimum 7000000000 -Maximum 7999999999)
        
        $carMake = $carMakes | Get-Random
        $carModel = $carModels | Get-Random
        $carColour = $carColours | Get-Random
        
        # Generate UK-style number plate (e.g., AB12 CDE)
        $plateLetters1 = -join ((65..90) | Get-Random -Count 2 | ForEach-Object { [char]$_ })
        $plateNumbers = (Get-Random -Minimum 10 -Maximum 100).ToString()
        $plateLetters2 = -join ((65..90) | Get-Random -Count 3 | ForEach-Object { [char]$_ })
        $plate = "$plateLetters1$plateNumbers $plateLetters2"

        # Generate unique external reference
        $externalRef = "WEEK-TEST-$(Get-Date -Format 'yyyyMMdd')-$i-$(Get-Random -Minimum 1000 -Maximum 9999)"

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

        Write-Host "  Creating booking: $plate ($carMake $carModel) - $firstName $lastName"

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
            $bookingStatus = $bookingResp.status
            $bookingSource = $bookingResp.source
            $bookingCreated = $bookingResp.created_at

            Write-Host "  ✅ BOOKING CREATED: ref=$bookingRef status=$bookingStatus source=$bookingSource" -ForegroundColor Green
            $successCount++
        }
        catch {
            $errorMsg = $_.Exception.Message
            Write-Host "  ❌ BOOKING ERROR: $errorMsg" -ForegroundColor Red

            if ($_.Exception.Response -ne $null) {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $body = $reader.ReadToEnd()
                Write-Host "     Response: $body"

                # Check if it's a duplicate (idempotency)
                if ($body -match "duplicate" -or $body -match "already exists" -or $errorMsg -match "duplicate") {
                    $duplicateCount++
                    Write-Host "     (Duplicate/idempotency response)" -ForegroundColor Yellow
                }
            }
            $errorCount++
        }
    }
    catch {
        Write-Host "  ❌ AVAILABILITY ERROR: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response -ne $null) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $body = $reader.ReadToEnd()
            Write-Host "     Response: $body"
        }
        $errorCount++
    }
}

Write-Host ""
Write-Host "=== BOOKING CREATION Torture Test Complete ==="
Write-Host "  ✅ Success: $successCount"
Write-Host "  ❌ Errors: $errorCount"
Write-Host "  🔄 Duplicates: $duplicateCount"
Write-Host "  ⚠️  Skipped (not available): $skippedCount"
Write-Host "  📊 Total Attempted: $totalRequests"
Write-Host ""

if ($successCount -gt 0) {
    Write-Host "✅ Test completed! $successCount bookings created in the next 7 days." -ForegroundColor Green
} else {
    Write-Host "⚠️  No bookings were created. Check errors above." -ForegroundColor Yellow
}

