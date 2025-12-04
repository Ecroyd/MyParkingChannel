# Supplier DYNAMIC PRICING Test
# Gradually increases occupancy and verifies dynamic pricing is applied correctly

$baseUrl = "http://localhost:3002"
$apiKey  = "01dbc10fdde0338e12fee013b329c3f1802e84340c2f9493900524472c8e2ad4"
$productId = "ab6a2d39-2162-4d5b-936e-15aa92c33a63"

# Test configuration
$capacity = 40
$testDate = (Get-Date).ToUniversalTime().Date.AddDays(7)  # 7 days from now
$startAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $testDate)
$endAt = ("{0:yyyy-MM-dd}T14:00:00Z" -f $testDate)  # 1-day stay, 4 hours

# Occupancy checkpoints to test
# Capacity = 40, so:
# - 50% = 20 cars → should trigger 10% increase
# - 80% = 32 cars → should trigger 20% increase (assuming)
$checkpoints = @(
    @{ count = 0; label = "0% (baseline)"; expectedOccupancy = 0 },
    @{ count = 5; label = "12.5% (5 cars)"; expectedOccupancy = 12.5 },
    @{ count = 10; label = "25% (10 cars)"; expectedOccupancy = 25 },
    @{ count = 15; label = "37.5% (15 cars)"; expectedOccupancy = 37.5 },
    @{ count = 20; label = "50% (20 cars) - Should trigger 10% increase"; expectedOccupancy = 50 },
    @{ count = 25; label = "62.5% (25 cars)"; expectedOccupancy = 62.5 },
    @{ count = 30; label = "75% (30 cars)"; expectedOccupancy = 75 },
    @{ count = 32; label = "80% (32 cars) - Should trigger 20% increase"; expectedOccupancy = 80 },
    @{ count = 35; label = "87.5% (35 cars)"; expectedOccupancy = 87.5 }
)

# Sample data pools
$firstNames = @("James", "Sarah", "Michael", "Emma", "David", "Olivia", "Robert", "Sophia", "William", "Isabella", "Richard", "Charlotte", "Joseph", "Amelia", "Thomas", "Mia", "Daniel", "Harper", "Matthew", "Evelyn", "Christopher", "Abigail", "Andrew", "Emily", "Joshua", "Madison", "Joseph", "Chloe", "Ryan", "Grace", "Benjamin", "Lily", "Samuel", "Ava", "Nathan", "Sophia", "Ethan", "Emma", "Noah", "Olivia")
$lastNames = @("Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson", "Clark", "Rodriguez", "Lewis", "Lee", "Walker", "Hall", "Allen", "Young", "King", "Wright", "Scott", "Green", "Adams", "Baker", "Nelson")
$carMakes = @("Audi", "BMW", "Mercedes", "Ford", "Toyota", "Volkswagen", "Nissan", "Honda", "Hyundai", "Kia")
$carModels = @("A3", "3 Series", "C-Class", "Focus", "Corolla", "Golf", "Qashqai", "Civic", "i30", "Sportage")
$carColours = @("Black", "White", "Silver", "Grey", "Blue", "Red")

Write-Host "=== Supplier DYNAMIC PRICING Test ==="
Write-Host "Capacity: $capacity"
Write-Host "Test dates: $startAt → $endAt"
Write-Host "Expected thresholds:"
Write-Host "  - 50% occupancy (20 cars) → 10% price increase"
Write-Host "  - 80% occupancy (32 cars) → 90% price increase"
Write-Host ""

$createdBookings = @()
$basePrice = $null
$pricingHistory = @()

# Step 1: Get baseline price (0% occupancy)
Write-Host "=== STEP 1: Getting baseline price (0% occupancy) ==="
Write-Host ""

try {
    $availabilityUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
    $availabilityResp = Invoke-RestMethod `
        -Uri $availabilityUri `
        -Headers @{ "X-API-Key" = $apiKey } `
        -Method GET

    $basePrice = $availabilityResp.pricing.base_price
    $totalPrice = $availabilityResp.pricing.total_price
    $dynamicApplied = $availabilityResp.pricing.dynamicPricingApplied
    $occupancyPercent = $availabilityResp.pricing.dynamicPricingOccupancyPercent

    Write-Host "✅ Baseline price: Base=£$basePrice, Total=£$totalPrice" -ForegroundColor Green
    Write-Host "   Dynamic pricing applied: $dynamicApplied"
    Write-Host "   Occupancy: $occupancyPercent%"
    Write-Host ""

    $pricingHistory += @{
        bookings = 0
        occupancy = 0
        basePrice = $basePrice
        totalPrice = $totalPrice
        dynamicApplied = $dynamicApplied
        multiplier = $availabilityResp.pricing.dynamicPricingMultiplier
        occupancyPercent = $occupancyPercent
    }
} catch {
    Write-Host "❌ Failed to get baseline price: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# Step 2: Create bookings at each checkpoint and check pricing
Write-Host "=== STEP 2: Creating bookings and checking pricing at each occupancy level ==="
Write-Host ""

$totalCreated = 0

foreach ($checkpoint in $checkpoints) {
    if ($checkpoint.count -eq 0) {
        continue  # Skip baseline, already done
    }

    $targetCount = $checkpoint.count
    $toCreate = $targetCount - $totalCreated

    Write-Host "--- Checkpoint: $($checkpoint.label) ---"
    Write-Host "Current bookings: $totalCreated, Need to create: $toCreate"
    Write-Host ""

    # Create bookings up to this checkpoint
    for ($i = 1; $i -le $toCreate; $i++) {
        $bookingNum = $totalCreated + $i
        
        # Generate booking data
        $firstName = $firstNames | Get-Random
        $lastName = $lastNames | Get-Random
        $email = "$($firstName.ToLower()).$($lastName.ToLower()).$bookingNum@example.com"
        $phone = "+44" + (Get-Random -Minimum 7000000000 -Maximum 7999999999)
        
        $carMake = $carMakes | Get-Random
        $carModel = $carModels | Get-Random
        $carColour = $carColours | Get-Random
        
        $plateLetters1 = -join ((65..90) | Get-Random -Count 2 | ForEach-Object { [char]$_ })
        $plateNumbers = (Get-Random -Minimum 10 -Maximum 100).ToString()
        $plateLetters2 = -join ((65..90) | Get-Random -Count 3 | ForEach-Object { [char]$_ })
        $plate = "$plateLetters1$plateNumbers $plateLetters2"

        $externalRef = "DYNAMIC-TEST-$(Get-Date -Format 'yyyyMMdd')-$bookingNum"

        # Check availability first to get current price
        try {
            $availabilityUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
            $availabilityResp = Invoke-RestMethod `
                -Uri $availabilityUri `
                -Headers @{ "X-API-Key" = $apiKey } `
                -Method GET

            if ($availabilityResp.availability_status -ne "available") {
                Write-Host "  [$bookingNum] ⚠️  Not available, skipping" -ForegroundColor Yellow
                continue
            }

            $currentPrice = $availabilityResp.pricing.total_price
            $currentBase = $availabilityResp.pricing.base_price
            $dynamicApplied = $availabilityResp.pricing.dynamicPricingApplied
            $multiplier = $availabilityResp.pricing.dynamicPricingMultiplier
            $occupancyPercent = $availabilityResp.pricing.dynamicPricingOccupancyPercent
            $remaining = $availabilityResp.remaining_capacity

            # Create booking
            $bookingUri = "$baseUrl/api/supplier/v1/bookings"
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
                    total = $currentPrice
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
                Write-Host "  [$bookingNum] ✅ Created: $bookingRef" -ForegroundColor Green
                Write-Host "      Price: Base=£$currentBase, Total=£$currentPrice"
                Write-Host "      Dynamic: $dynamicApplied, Multiplier: $multiplier, Occupancy: $occupancyPercent%"
                Write-Host "      Remaining capacity: $remaining"
                
                $createdBookings += $bookingRef
                $totalCreated++

                # Record pricing at this point
                $pricingHistory += @{
                    bookings = $totalCreated
                    occupancy = [math]::Round(($totalCreated / $capacity) * 100, 1)
                    basePrice = $currentBase
                    totalPrice = $currentPrice
                    dynamicApplied = $dynamicApplied
                    multiplier = $multiplier
                    occupancyPercent = $occupancyPercent
                }
            } catch {
                Write-Host "  [$bookingNum] ❌ Booking creation failed: $($_.Exception.Message)" -ForegroundColor Red
            }
        } catch {
            Write-Host "  [$bookingNum] ❌ Availability check failed: $($_.Exception.Message)" -ForegroundColor Red
        }

        # Small delay
        Start-Sleep -Milliseconds 200
    }

    Write-Host ""
}

# Step 3: Final pricing check
Write-Host "=== STEP 3: Final pricing check ==="
Write-Host ""

try {
    $availabilityUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
    $availabilityResp = Invoke-RestMethod `
        -Uri $availabilityUri `
        -Headers @{ "X-API-Key" = $apiKey } `
        -Method GET

    $finalBase = $availabilityResp.pricing.base_price
    $finalTotal = $availabilityResp.pricing.total_price
    $finalDynamic = $availabilityResp.pricing.dynamicPricingApplied
    $finalMultiplier = $availabilityResp.pricing.dynamicPricingMultiplier
    $finalOccupancy = $availabilityResp.pricing.dynamicPricingOccupancyPercent
    $finalRemaining = $availabilityResp.remaining_capacity

    Write-Host "Final state:"
    Write-Host "  Bookings created: $totalCreated"
    Write-Host "  Occupancy: $finalOccupancy%"
    Write-Host "  Base price: £$finalBase"
    Write-Host "  Total price: £$finalTotal"
    Write-Host "  Dynamic pricing: $finalDynamic"
    Write-Host "  Multiplier: $finalMultiplier"
    Write-Host "  Remaining capacity: $finalRemaining"
    Write-Host ""
} catch {
    Write-Host "❌ Final check failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 4: Summary table
Write-Host "=== PRICING HISTORY SUMMARY ==="
Write-Host ""
Write-Host ("{0,-8} {1,-12} {2,-10} {3,-12} {4,-8} {5,-12} {6,-10}" -f "Bookings", "Occupancy%", "Base Price", "Total Price", "Dynamic", "Multiplier", "Occupancy%")
Write-Host ("-" * 80)

foreach ($record in $pricingHistory) {
    $dynamicStr = if ($record.dynamicApplied) { "Yes" } else { "No" }
    $multiplierStr = if ($record.multiplier) { $record.multiplier.ToString("F2") } else { "1.00" }
    Write-Host ("{0,-8} {1,-12} £{2,-9:F2} £{3,-11:F2} {4,-8} {5,-12} {6,-10}" -f 
        $record.bookings, 
        "$($record.occupancy)%", 
        $record.basePrice, 
        $record.totalPrice, 
        $dynamicStr, 
        $multiplierStr,
        "$($record.occupancyPercent)%")
}

Write-Host ""
Write-Host "=== EXPECTED BEHAVIOR ==="
Write-Host "  - Base price should remain constant: £$basePrice"
Write-Host "  - At 0-49% occupancy: No dynamic pricing (Total = Base)"
Write-Host "  - At 50%+ occupancy: 10% increase (Total = Base × 1.10)"
Write-Host "  - At 80%+ occupancy: 90% increase (Total = Base × 1.90)"
Write-Host ""

# Analysis
$priceIncrease50 = $null
$priceIncrease80 = $null

foreach ($record in $pricingHistory) {
    if ($record.occupancy -ge 50 -and $priceIncrease50 -eq $null) {
        $priceIncrease50 = $record
    }
    if ($record.occupancy -ge 80 -and $priceIncrease80 -eq $null) {
        $priceIncrease80 = $record
    }
}

if ($priceIncrease50) {
    $expected50 = [math]::Round($basePrice * 1.10, 2)
    $actual50 = $priceIncrease50.totalPrice
    if ([math]::Abs($actual50 - $expected50) -lt 0.01) {
        Write-Host "✅ 50% threshold: Price correctly increased to £$actual50 (expected £$expected50)" -ForegroundColor Green
    } else {
        Write-Host "⚠️  50% threshold: Price is £$actual50 (expected £$expected50)" -ForegroundColor Yellow
    }
}

if ($priceIncrease80) {
    $expected80 = [math]::Round($basePrice * 1.90, 2)
    $actual80 = $priceIncrease80.totalPrice
    if ([math]::Abs($actual80 - $expected80) -lt 0.01) {
        Write-Host "✅ 80% threshold: Price correctly increased to £$actual80 (expected £$expected80)" -ForegroundColor Green
    } else {
        Write-Host "⚠️  80% threshold: Price is £$actual80 (expected £$expected80)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== Test Complete ==="
Write-Host "Created $totalCreated bookings for dynamic pricing test"

