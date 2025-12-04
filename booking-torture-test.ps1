# Supplier BOOKING CREATION torture test
# Similar structure to availability test, but creates actual bookings

$baseUrl = "http://localhost:3002"   # or your live domain later
$apiKey  = "01dbc10fdde0338e12fee013b329c3f1802e84340c2f9493900524472c8e2ad4"

# Your Standard Parking product
$productId = "ab6a2d39-2162-4d5b-936e-15aa92c33a63"

# How many torture requests
$totalRequests      = 200
$nearTermRequests   = 10    # at least 10 within next 30 days
$maxHorizonDays     = 365   # next 12 months

$today = (Get-Date).ToUniversalTime().Date

# Sample data pools for randomization
$firstNames = @("James", "Sarah", "Michael", "Emma", "David", "Olivia", "Robert", "Sophia", "William", "Isabella", "Richard", "Charlotte", "Joseph", "Amelia", "Thomas", "Mia")
$lastNames = @("Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Wilson", "Anderson", "Thomas", "Taylor")
$carMakes = @("Audi", "BMW", "Mercedes", "Ford", "Toyota", "Volkswagen", "Nissan", "Honda", "Hyundai", "Kia", "Volvo", "Jaguar", "Land Rover", "Porsche", "Tesla", "Mini")
$carModels = @("A3", "3 Series", "C-Class", "Focus", "Corolla", "Golf", "Qashqai", "Civic", "i30", "Sportage", "XC60", "XF", "Discovery", "911", "Model 3", "Cooper")
$carColours = @("Black", "White", "Silver", "Grey", "Blue", "Red", "Green", "Navy", "Metallic Black", "Pearl White")

Write-Host "=== Supplier BOOKING CREATION torture test (next 12 months, $nearTermRequests in next 30 days) ==="
Write-Host ""

$successCount = 0
$errorCount = 0
$duplicateCount = 0

for ($i = 1; $i -le $totalRequests; $i++) {
    # First N runs: always within next 30 days
    if ($i -le $nearTermRequests) {
        $offsetDays = Get-Random -Minimum 0 -Maximum 30
    }
    else {
        $offsetDays = Get-Random -Minimum 0 -Maximum $maxHorizonDays
    }

    # LOS length: 1–31 days (we want to hit the >30 logic too)
    $lengthDays = Get-Random -Minimum 1 -Maximum 32

    $startDate = $today.AddDays($offsetDays)
    $endDate   = $startDate.AddDays($lengthDays)

    # Always use 10:00Z as you've been doing
    $startAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $startDate)
    $endAt   = ("{0:yyyy-MM-dd}T10:00:00Z" -f $endDate)

    # Step 1: Get availability to fetch the price
    $availabilityUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
    
    Write-Host ""
    Write-Host "[$i/$totalRequests] Checking availability first..."
    Write-Host "  GET $availabilityUri"
    
    try {
        $availabilityResp = Invoke-RestMethod `
            -Uri $availabilityUri `
            -Headers @{ "X-API-Key" = $apiKey } `
            -Method GET

        $status = $availabilityResp.availability_status
        $totalPrice = $availabilityResp.pricing.total_price
        $days = $availabilityResp.pricing.days

        Write-Host "  ✅ Availability: status=$status days=$days total_price=$totalPrice"

        # Skip booking creation if not available
        if ($status -ne "available") {
            Write-Host "  ⚠️  Skipping booking creation (status=$status)" -ForegroundColor Yellow
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

        # Generate external reference (optional, but useful for idempotency testing)
        $externalRef = "TEST-$(Get-Date -Format 'yyyyMMdd')-$(Get-Random -Minimum 1000 -Maximum 9999)"

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

        Write-Host "  POST $bookingUri"
        Write-Host "  Body: $($bookingBody -replace '[\r\n]', ' ')"

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

            Write-Host "  ✅ BOOKING CREATED: reference=$bookingRef status=$bookingStatus source=$bookingSource created=$bookingCreated" -ForegroundColor Green
            $successCount++
        }
        catch {
            $errorMsg = $_.Exception.Message
            Write-Host "  ❌ BOOKING ERROR: $errorMsg" -ForegroundColor Red

            if ($_.Exception.Response -ne $null) {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $body = $reader.ReadToEnd()
                Write-Host "     Response body: $body"

                # Check if it's a duplicate (idempotency)
                if ($body -match "duplicate" -or $body -match "already exists" -or $errorMsg -match "duplicate") {
                    $duplicateCount++
                    Write-Host "     (This appears to be a duplicate/idempotency response)" -ForegroundColor Yellow
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
            Write-Host "     Response body: $body"
        }
        $errorCount++
    }
}

Write-Host ""
Write-Host "=== BOOKING CREATION torture run complete ==="
Write-Host "  Success: $successCount"
Write-Host "  Errors: $errorCount"
Write-Host "  Duplicates (idempotency): $duplicateCount"
Write-Host ""

