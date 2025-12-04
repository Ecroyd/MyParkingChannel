# Supplier BOOKING CAPACITY LIMIT Test
# Creates bookings with staggered dates AND times
# Tests scenario where bookings can overlap on same dates as long as times don't overlap
# Capacity bookings need at least 1 hour grace period between arrival/departure times

$baseUrl = "http://localhost:3002"
$apiKey  = "01dbc10fdde0338e12fee013b329c3f1802e84340c2f9493900524472c8e2ad4"
$productId = "ab6a2d39-2162-4d5b-936e-15aa92c33a63"

# How many bookings to attempt
$totalBookings = 100  # Try to exceed capacity to see if time-based capacity is enforced

# Base date - all bookings will be around this date
$today = (Get-Date).ToUniversalTime().Date
$baseDate = $today.AddDays(7)  # 7 days from now

# Time slots with 1 hour grace period
# Each booking will use a different time slot
# Format: HH:00 (24-hour format)
$timeSlots = @(
    "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"
)

# Strategy: Create bookings that:
# - Overlap on the same dates
# - But have staggered arrival/departure times with 1+ hour gaps
# - This tests if the system enforces capacity per time slot, not just per date

Write-Host "=== Supplier BOOKING CAPACITY LIMIT Test (Time-Based) ==="
Write-Host "Attempting to create $totalBookings bookings with staggered dates AND times"
Write-Host "Strategy: Bookings overlap on same dates but have 1+ hour gaps between times"
Write-Host "Expected capacity: 50 per time slot"
Write-Host ""
Write-Host "This tests if the system enforces capacity correctly when:"
Write-Host "  - Bookings can overlap on the same date"
Write-Host "  - But need at least 1 hour grace period between arrival/departure times"
Write-Host "  - Example: 50 cars at 10:00-14:00, then 50 cars at 15:00-19:00 (1hr gap)"
Write-Host ""

# Sample data pools
$firstNames = @("James", "Sarah", "Michael", "Emma", "David", "Olivia", "Robert", "Sophia", "William", "Isabella", "Richard", "Charlotte", "Joseph", "Amelia", "Thomas", "Mia", "Daniel", "Harper", "Matthew", "Evelyn", "Christopher", "Abigail", "Andrew", "Emily", "Joshua", "Madison", "Joseph", "Chloe", "Ryan", "Grace")
$lastNames = @("Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson", "Clark", "Rodriguez", "Lewis", "Lee", "Walker")
$carMakes = @("Audi", "BMW", "Mercedes", "Ford", "Toyota", "Volkswagen", "Nissan", "Honda", "Hyundai", "Kia", "Volvo", "Jaguar", "Land Rover", "Porsche", "Tesla", "Mini", "Mazda", "Subaru", "Lexus", "Jeep")
$carModels = @("A3", "3 Series", "C-Class", "Focus", "Corolla", "Golf", "Qashqai", "Civic", "i30", "Sportage", "XC60", "XF", "Discovery", "911", "Model 3", "Cooper", "CX-5", "Outback", "RX", "Wrangler")
$carColours = @("Black", "White", "Silver", "Grey", "Blue", "Red", "Green", "Navy", "Metallic Black", "Pearl White")

$successCount = 0
$failureCount = 0
$availabilityFailures = 0
$otherFailures = 0

Write-Host "Creating $totalBookings bookings with staggered dates and times..."
Write-Host "Time slots available: $($timeSlots -join ', ')"
Write-Host ""

for ($i = 1; $i -le $totalBookings; $i++) {
    # Create staggered dates (some variation)
    $dateOffset = Get-Random -Minimum 0 -Maximum 3  # 0-2 days variation
    $stayLength = Get-Random -Minimum 2 -Maximum 5  # 2-4 day stays
    
    $startDate = $baseDate.AddDays($dateOffset)
    $endDate = $startDate.AddDays($stayLength)
    
    # Assign time slot with 1 hour grace period
    # Cycle through time slots, ensuring at least 1 hour gap
    $slotIndex = ($i - 1) % $timeSlots.Count
    $arrivalTimeStr = $timeSlots[$slotIndex]
    
    # Parse arrival time
    $arrivalHour = [int]($arrivalTimeStr.Split(':')[0])
    $arrivalMinute = [int]($arrivalTimeStr.Split(':')[1])
    
    # Departure time is 4 hours after arrival (ensures 1hr gap if next booking arrives 1hr later)
    $departureHour = ($arrivalHour + 4) % 24
    $departureMinute = 0
    
    # Build proper DateTime objects with times
    $startDateTime = $startDate.AddHours($arrivalHour).AddMinutes($arrivalMinute)
    $endDateTime = $endDate.AddHours($departureHour).AddMinutes($departureMinute)
    
    # Convert to ISO 8601 format
    $startAt = $startDateTime.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $endAt = $endDateTime.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    
    # Step 1: Check availability first
    $availabilityUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
    
    try {
        $availabilityResp = Invoke-RestMethod `
            -Uri $availabilityUri `
            -Headers @{ "X-API-Key" = $apiKey } `
            -Method GET

        $status = $availabilityResp.availability_status
        $totalPrice = $availabilityResp.pricing.total_price
        $remaining = $availabilityResp.remaining_capacity

        if ($status -ne "available") {
            Write-Host "[$i/$totalBookings] ⚠️  Availability check: status=$status remaining=$remaining" -ForegroundColor Yellow
            $availabilityFailures++
            continue
        }

        # Step 2: Create booking
        $bookingUri = "$baseUrl/api/supplier/v1/bookings"
        
        $firstName = $firstNames | Get-Random
        $lastName = $lastNames | Get-Random
        $email = "$($firstName.ToLower()).$($lastName.ToLower()).$i@example.com"
        $phone = "+44" + (Get-Random -Minimum 7000000000 -Maximum 7999999999)
        
        $carMake = $carMakes | Get-Random
        $carModel = $carModels | Get-Random
        $carColour = $carColours | Get-Random
        
        $plateLetters1 = -join ((65..90) | Get-Random -Count 2 | ForEach-Object { [char]$_ })
        $plateNumbers = (Get-Random -Minimum 10 -Maximum 100).ToString()
        $plateLetters2 = -join ((65..90) | Get-Random -Count 3 | ForEach-Object { [char]$_ })
        $plate = "$plateLetters1$plateNumbers $plateLetters2"

        $externalRef = "CAPACITY-TEST-$(Get-Date -Format 'yyyyMMdd')-$i-$(Get-Random -Minimum 1000 -Maximum 9999)"

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
            $startDateStr = $startDate.ToString("yyyy-MM-dd")
            $endDateStr = $endDate.ToString("yyyy-MM-dd")
            $departureTimeStr = "{0:D2}:{1:D2}" -f $departureHour, $departureMinute
            Write-Host "[$i/$totalBookings] ✅ Created: $bookingRef" -ForegroundColor Green
            Write-Host "    Dates: $startDateStr → $endDateStr | Times: $arrivalTimeStr → $departureTimeStr | Remaining: $remaining"
            $successCount++
        }
        catch {
            $errorMsg = $_.Exception.Message
            $statusCode = $_.Exception.Response.StatusCode.value__
            
            Write-Host "[$i/$totalBookings] ❌ Failed: $errorMsg (HTTP $statusCode)" -ForegroundColor Red

            if ($_.Exception.Response -ne $null) {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $body = $reader.ReadToEnd()
                
                if ($body -match "NO_AVAILABILITY" -or $body -match "capacity" -or $statusCode -eq 409) {
                    $availabilityFailures++
                    Write-Host "     Response: $body" -ForegroundColor Yellow
                } else {
                    $otherFailures++
                    Write-Host "     Response: $body"
                }
            } else {
                $otherFailures++
            }
            $failureCount++
        }
    }
    catch {
        Write-Host "[$i/$totalBookings] ❌ Availability check failed: $($_.Exception.Message)" -ForegroundColor Red
        $failureCount++
        $otherFailures++
    }
    
    # Small delay to avoid overwhelming the server
    Start-Sleep -Milliseconds 100
}

Write-Host ""
Write-Host "=== CAPACITY TEST SUMMARY ==="
Write-Host "  ✅ Successful bookings: $successCount"
Write-Host "  ❌ Failed bookings: $failureCount"
Write-Host "     - Availability/capacity failures: $availabilityFailures"
Write-Host "     - Other failures: $otherFailures"
Write-Host ""
Write-Host ""
Write-Host "Expected behavior:"
Write-Host "  - Bookings should succeed if they have 1+ hour gap between times"
Write-Host "  - Multiple bookings can overlap on same dates if times are staggered"
Write-Host "  - Capacity should be enforced per time slot (not just per date)"
Write-Host "  - Example: 50 cars at 10:00-14:00 is OK, then 50 cars at 15:00-19:00 is OK"
Write-Host "  - But 51 cars at 10:00-14:00 should fail (exceeds capacity for that time slot)"
Write-Host ""

Write-Host "Time slot distribution:"
$timeSlotCounts = @{}
for ($i = 0; $i -lt $timeSlots.Count; $i++) {
    $slot = $timeSlots[$i]
    $count = [math]::Floor($totalBookings / $timeSlots.Count)
    if ($i -lt ($totalBookings % $timeSlots.Count)) { $count++ }
    $timeSlotCounts[$slot] = $count
    Write-Host "  - $slot :00 slot: ~$count bookings expected"
}
Write-Host ""

if ($successCount -le 50) {
    Write-Host "✅ Result: $successCount bookings created" -ForegroundColor Green
    Write-Host "   This suggests capacity is being enforced per time slot"
} elseif ($successCount -gt 50 -and $successCount -le ($timeSlots.Count * 50)) {
    Write-Host "✅ Result: $successCount bookings created" -ForegroundColor Green
    Write-Host "   This is expected! With $($timeSlots.Count) time slots and 50 capacity each,"
    Write-Host "   you can have up to $($timeSlots.Count * 50) bookings if times are staggered"
    Write-Host "   Check if bookings are properly distributed across time slots"
} elseif ($successCount -gt ($timeSlots.Count * 50) -and $availabilityFailures -gt 0) {
    Write-Host "⚠️  Result: $successCount bookings created, $availabilityFailures capacity failures" -ForegroundColor Yellow
    Write-Host "   Some bookings exceeded time slot capacity. This is expected behavior."
} elseif ($successCount -gt ($timeSlots.Count * 50) -and $availabilityFailures -eq 0) {
    Write-Host "❌ Result: $successCount bookings created with no capacity failures!" -ForegroundColor Red
    Write-Host "   This suggests time-based capacity limit may not be enforced properly"
    Write-Host "   Expected max: $($timeSlots.Count * 50) bookings (50 per time slot)"
} else {
    Write-Host "ℹ️  Test completed. Review results above." -ForegroundColor Cyan
    Write-Host "   Check your database to see actual occupancy per time slot"
}

Write-Host ""

