# Supplier API CONCURRENT REQUESTS Test
# Tests race conditions and simultaneous booking requests

$baseUrl = "http://localhost:3002"
$apiKey  = "01dbc10fdde0338e12fee013b329c3f1802e84340c2f9493900524472c8e2ad4"
$productId = "ab6a2d39-2162-4d5b-936e-15aa92c33a63"

# Test configuration
$concurrentRequests = 20  # Number of simultaneous requests
$capacity = 40  # Expected capacity

$today = (Get-Date).ToUniversalTime().Date.AddDays(7)
$startAt = ("{0:yyyy-MM-dd}T10:00:00Z" -f $today)
$endAt = ("{0:yyyy-MM-dd}T14:00:00Z" -f $today)

Write-Host "=== Supplier API CONCURRENT REQUESTS Test ==="
Write-Host "Testing $concurrentRequests simultaneous booking requests"
Write-Host "All requests for: $startAt → $endAt"
Write-Host "Expected capacity: $capacity"
Write-Host ""

# Sample data pools
$firstNames = @("James", "Sarah", "Michael", "Emma", "David", "Olivia", "Robert", "Sophia", "William", "Isabella")
$lastNames = @("Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez")
$carMakes = @("Audi", "BMW", "Mercedes", "Ford", "Toyota")
$carModels = @("A3", "3 Series", "C-Class", "Focus", "Corolla")

# Function to create a single booking
function CreateBooking {
    param($index)
    
    $firstName = $firstNames | Get-Random
    $lastName = $lastNames | Get-Random
    $email = "$($firstName.ToLower()).$($lastName.ToLower()).$index@example.com"
    $phone = "+44" + (Get-Random -Minimum 7000000000 -Maximum 7999999999)
    
    $carMake = $carMakes | Get-Random
    $carModel = $carModels | Get-Random
    
    $plateLetters1 = -join ((65..90) | Get-Random -Count 2 | ForEach-Object { [char]$_ })
    $plateNumbers = (Get-Random -Minimum 10 -Maximum 100).ToString()
    $plateLetters2 = -join ((65..90) | Get-Random -Count 3 | ForEach-Object { [char]$_ })
    $plate = "$plateLetters1$plateNumbers $plateLetters2"

    $externalRef = "CONCURRENT-TEST-$index-$(Get-Date -Format 'yyyyMMddHHmmss')"

    try {
        # Check availability
        $availUri = "$baseUrl/api/supplier/v1/availability?product_id=$productId&start_at=$startAt&end_at=$endAt&currency=GBP"
        $availResp = Invoke-RestMethod -Uri $availUri -Headers @{ "X-API-Key" = $apiKey } -Method GET

        if ($availResp.availability_status -ne "available") {
            return @{ success = $false; message = "Not available"; remaining = $availResp.remaining_capacity }
        }

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
                colour = "Black"
            }
            price = @{
                currency = "GBP"
                total = $availResp.pricing.total_price
            }
        } | ConvertTo-Json -Depth 10

        $bookingResp = Invoke-RestMethod -Uri $bookingUri `
            -Headers @{ 
                "X-API-Key" = $apiKey
                "Content-Type" = "application/json"
            } `
            -Method POST `
            -Body $bookingBody

        return @{ 
            success = $true
            reference = $bookingResp.reference
            remaining = $availResp.remaining_capacity
            price = $availResp.pricing.total_price
        }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $errorBody = ""
        if ($_.Exception.Response -ne $null) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $errorBody = $reader.ReadToEnd()
        }
        
        return @{ 
            success = $false
            message = $_.Exception.Message
            statusCode = $statusCode
            errorBody = $errorBody
        }
    }
}

Write-Host "Creating $concurrentRequests concurrent booking requests..."
Write-Host ""

# Create jobs for concurrent execution
$jobs = @()
for ($i = 1; $i -le $concurrentRequests; $i++) {
    $job = Start-Job -ScriptBlock ${function:CreateBooking} -ArgumentList $i
    $jobs += $job
    Write-Host "Started request $i..."
}

Write-Host ""
Write-Host "Waiting for all requests to complete..."
Write-Host ""

# Wait for all jobs and collect results
$results = @()
foreach ($job in $jobs) {
    $result = Receive-Job -Job $job -Wait
    $results += $result
    Remove-Job -Job $job
}

# Analyze results
$successCount = ($results | Where-Object { $_.success -eq $true }).Count
$failureCount = ($results | Where-Object { $_.success -eq $false }).Count
$successfulBookings = $results | Where-Object { $_.success -eq $true }
$failedBookings = $results | Where-Object { $_.success -eq $false }

Write-Host "=== CONCURRENT TEST RESULTS ==="
Write-Host ""
Write-Host "  ✅ Successful: $successCount"
Write-Host "  ❌ Failed: $failureCount"
Write-Host ""

if ($successfulBookings.Count -gt 0) {
    Write-Host "Successful bookings:" -ForegroundColor Green
    foreach ($booking in $successfulBookings) {
        Write-Host "  - $($booking.reference) (remaining: $($booking.remaining))"
    }
    Write-Host ""
}

if ($failedBookings.Count -gt 0) {
    Write-Host "Failed requests:" -ForegroundColor Red
    foreach ($failure in $failedBookings) {
        if ($failure.statusCode) {
            Write-Host "  - Status: $($failure.statusCode), Message: $($failure.message)"
        } else {
            Write-Host "  - Message: $($failure.message)"
        }
    }
    Write-Host ""
}

# Check for race conditions
$uniqueReferences = ($successfulBookings | Select-Object -ExpandProperty reference -Unique).Count
if ($uniqueReferences -lt $successCount) {
    Write-Host "⚠️  WARNING: Duplicate references detected! Possible race condition." -ForegroundColor Yellow
    Write-Host "   Expected $successCount unique references, got $uniqueReferences"
} else {
    Write-Host "✅ All successful bookings have unique references" -ForegroundColor Green
}

# Check capacity enforcement
$minRemaining = ($successfulBookings | Measure-Object -Property remaining -Minimum).Minimum
if ($minRemaining -lt 0) {
    Write-Host "❌ Capacity exceeded! Some bookings show negative remaining capacity" -ForegroundColor Red
} elseif ($successCount -gt $capacity) {
    Write-Host "⚠️  More bookings created than capacity ($successCount > $capacity)" -ForegroundColor Yellow
    Write-Host "   This might indicate a race condition in capacity checking"
} else {
    Write-Host "✅ Capacity appears to be enforced correctly" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Test Complete ==="

