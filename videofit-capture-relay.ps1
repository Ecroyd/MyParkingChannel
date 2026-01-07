# Videofit Capture Relay for Parking Channel
# Polls Videofit SOAP service and forwards captures to Parking Channel API

param(
    [string]$ConfigPath = "C:\ParkingChannel\config.json",
    [string]$CursorPath = "C:\ParkingChannel\videofit-last.json",
    [string]$QueuePath = "C:\ParkingChannel\capture-outbox.jsonl"
)

# Error handling
$ErrorActionPreference = "Stop"

# Load configuration
function Load-Config {
    if (-not (Test-Path $ConfigPath)) {
        Write-Error "Config file not found: $ConfigPath"
        exit 1
    }
    
    $config = Get-Content $ConfigPath | ConvertFrom-Json
    
    $required = @('parkingChannelBaseUrl', 'tenantId', 'relayToken', 'siteClientLicense', 'locPcNo', 'defaultGroup', 'pollSeconds')
    foreach ($field in $required) {
        if (-not $config.$field) {
            Write-Error "Missing required config field: $field"
            exit 1
        }
    }
    
    return $config
}

# Load cursor (last seen timestamp/event id)
function Load-Cursor {
    if (Test-Path $CursorPath) {
        $cursor = Get-Content $CursorPath | ConvertFrom-Json
        return $cursor
    }
    return @{
        lastTimestamp = $null
        lastEventId = $null
    }
}

# Save cursor
function Save-Cursor {
    param([object]$Cursor)
    
    $Cursor | ConvertTo-Json -Depth 10 | Set-Content $CursorPath -Encoding UTF8
}

# Load queue (JSONL file)
function Load-Queue {
    if (-not (Test-Path $QueuePath)) {
        return @()
    }
    
    $queue = @()
    Get-Content $QueuePath | ForEach-Object {
        if ($_.Trim()) {
            try {
                $queue += $_ | ConvertFrom-Json
            } catch {
                Write-Warning "Skipping invalid JSON line in queue: $_"
            }
        }
    }
    return $queue
}

# Append to queue
function Append-ToQueue {
    param([object]$Event)
    
    $json = $Event | ConvertTo-Json -Compress -Depth 10
    Add-Content $QueuePath -Value $json -Encoding UTF8
}

# Remove from queue (rewrite file without the item)
function Remove-FromQueue {
    param([int]$Index)
    
    if (-not (Test-Path $QueuePath)) {
        return
    }
    
    $lines = Get-Content $QueuePath
    $newLines = New-Object System.Collections.ArrayList
    
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($i -ne $Index -and $lines[$i].Trim()) {
            [void]$newLines.Add($lines[$i])
        }
    }
    
    if ($newLines.Count -eq 0) {
        # Empty queue - delete file
        Remove-Item $QueuePath -ErrorAction SilentlyContinue
    } else {
        # Rewrite queue file
        $newLines | Set-Content $QueuePath -Encoding UTF8
    }
}

# Discover Videofit SOAP endpoint (placeholder with TODO)
function Get-VideofitEndpoint {
    param([object]$Config)
    
    # TODO: Implement discovery logic or use hardcoded endpoint
    # For now, using placeholder
    $endpoint = "http://localhost/Videofit/SendCaptureWebService.asmx"
    
    # If config has endpoint, use it
    if ($Config.videofitEndpoint) {
        $endpoint = $Config.videofitEndpoint
    }
    
    return $endpoint
}

# Poll Videofit SOAP service for new captures
function Poll-VideofitCaptures {
    param(
        [object]$Config,
        [object]$Cursor
    )
    
    $endpoint = Get-VideofitEndpoint -Config $Config
    
    # Build SOAP request to get captures since last cursor
    # TODO: Adjust SOAP method name, namespace, and parameters based on actual Videofit API
    # This is a placeholder structure - you'll need to:
    # 1. Check Videofit SOAP WSDL to get correct method name and namespace
    # 2. Adjust parameter names to match Videofit API
    # 3. Update XPath in response parsing to match actual response structure
    
    $sinceTimestamp = ""
    if ($Cursor.lastTimestamp) {
        $sinceTimestamp = $Cursor.lastTimestamp
    } elseif ($Cursor.lastEventId) {
        # If using event ID instead of timestamp
        $sinceTimestamp = ""
    }
    
    $soapBody = @"
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
        <GetCaptures xmlns="http://tempuri.org/">
            <siteClientLicense>$($Config.siteClientLicense)</siteClientLicense>
            <locPcNo>$($Config.locPcNo)</locPcNo>
            <defaultGroup>$($Config.defaultGroup)</defaultGroup>
            <sinceTimestamp>$sinceTimestamp</sinceTimestamp>
        </GetCaptures>
    </soap:Body>
</soap:Envelope>
"@
    
    try {
        $headers = @{
            "Content-Type" = "text/xml; charset=utf-8"
            "SOAPAction" = "http://tempuri.org/GetCaptures"
        }
        
        $response = Invoke-WebRequest -Uri $endpoint -Method POST -Body $soapBody -Headers $headers -UseBasicParsing
        
        # Parse SOAP response
        $xml = [xml]$response.Content
        
        # TODO: Adjust XPath based on actual Videofit SOAP response structure
        # Example XPath patterns to try:
        # - "//*[local-name()='Capture']"
        # - "//GetCapturesResponse/GetCapturesResult/Capture"
        # - Check SOAP response in browser/Postman first
        
        $captures = @()
        $captureNodes = $xml.SelectNodes("//*[local-name()='Capture']")
        
        if ($captureNodes.Count -eq 0) {
            # Try alternative XPath patterns
            $captureNodes = $xml.SelectNodes("//Capture")
        }
        
        foreach ($node in $captureNodes) {
            # Extract fields - adjust property names based on actual Videofit response
            $capture = @{
                EventId = $node.SelectSingleNode("EventId")?.InnerText
                Plate = $node.SelectSingleNode("Plate")?.InnerText
                OccurredAt = $node.SelectSingleNode("OccurredAt")?.InnerText -or $node.SelectSingleNode("Timestamp")?.InnerText -or $node.SelectSingleNode("EventTime")?.InnerText
                Direction = $node.SelectSingleNode("Direction")?.InnerText
                CameraId = $node.SelectSingleNode("CameraId")?.InnerText -or $node.SelectSingleNode("CameraID")?.InnerText
                Lane = $node.SelectSingleNode("Lane")?.InnerText
                Confidence = $node.SelectSingleNode("Confidence")?.InnerText
                Raw = $node.OuterXml  # Store raw XML for debugging
            }
            
            # Only add if we have at least plate and timestamp
            if ($capture.Plate -and $capture.OccurredAt) {
                $captures += $capture
            } else {
                Write-Warning "Skipping capture with missing required fields: Plate=$($capture.Plate), OccurredAt=$($capture.OccurredAt)"
            }
        }
        
        return $captures
    } catch {
        Write-Warning "Failed to poll Videofit: $_"
        Write-Warning "Endpoint: $endpoint"
        return @()
    }
}

# Transform Videofit capture to Parking Channel format
function Transform-Capture {
    param(
        [object]$Capture,
        [object]$Config
    )
    
    # Map direction: Videofit might use different values, normalize to 'in'/'out'
    $direction = $Capture.Direction
    if (-not $direction) {
        Write-Warning "Missing direction in capture, defaulting to 'in'"
        $direction = "in"
    }
    
    $directionLower = $direction.ToString().ToLower()
    if ($directionLower -eq "entry" -or $directionLower -eq "in" -or $directionLower -eq "arrival") {
        $direction = "in"
    } elseif ($directionLower -eq "exit" -or $directionLower -eq "out" -or $directionLower -eq "departure") {
        $direction = "out"
    } else {
        Write-Warning "Unknown direction value: $direction, defaulting to 'in'"
        $direction = "in"
    }
    
    # Ensure ISO timestamp format
    $occurredAt = $Capture.OccurredAt
    if ($occurredAt -is [string] -and $occurredAt.Trim()) {
        try {
            $dt = [DateTime]::Parse($occurredAt)
            $occurredAt = $dt.ToUniversalTime().ToString("o") # ISO 8601 format
        } catch {
            Write-Warning "Invalid timestamp format: $occurredAt, using current time"
            $occurredAt = (Get-Date).ToUniversalTime().ToString("o")
        }
    } else {
        $occurredAt = (Get-Date).ToUniversalTime().ToString("o")
    }
    
    # Parse confidence as number if present
    $confidence = $null
    if ($Capture.Confidence) {
        try {
            $confidence = [double]$Capture.Confidence
        } catch {
            Write-Warning "Invalid confidence value: $($Capture.Confidence)"
        }
    }
    
    return @{
        plate = $Capture.Plate.ToString().Trim()
        occurred_at = $occurredAt
        direction = $direction
        camera_id = if ($Capture.CameraId) { $Capture.CameraId.ToString().Trim() } else { $null }
        lane = if ($Capture.Lane) { $Capture.Lane.ToString().Trim() } else { $null }
        confidence = $confidence
        raw = $Capture.Raw
    }
}

# Send capture to Parking Channel API
function Send-ToParkingChannel {
    param(
        [object]$Event,
        [object]$Config
    )
    
    $url = "$($Config.parkingChannelBaseUrl)/api/internal/anpr/capture?tenantId=$($Config.tenantId)"
    $headers = @{
        "Authorization" = "Bearer $($Config.relayToken)"
        "Content-Type" = "application/json"
    }
    
    $body = $Event | ConvertTo-Json -Compress -Depth 10
    
    try {
        $response = Invoke-WebRequest -Uri $url -Method POST -Body $body -Headers $headers -UseBasicParsing
        
        if ($response.StatusCode -eq 200) {
            $result = $response.Content | ConvertFrom-Json
            return @{
                Success = $true
                Duplicate = $result.duplicate -eq $true
                Response = $result
            }
        } else {
            return @{
                Success = $false
                Error = "HTTP $($response.StatusCode)"
            }
        }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $errorMessage = $_.Exception.Message
        
        # Check if it's a duplicate (200 with duplicate:true)
        if ($statusCode -eq 200) {
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $responseBody = $reader.ReadToEnd()
                $result = $responseBody | ConvertFrom-Json
                if ($result.duplicate -eq $true) {
                    return @{
                        Success = $true
                        Duplicate = $true
                        Response = $result
                    }
                }
            } catch {
                # Ignore parse errors
            }
        }
        
        return @{
            Success = $false
            Error = "HTTP $statusCode : $errorMessage"
        }
    }
}

# Main polling loop
function Start-Relay {
    param([object]$Config)
    
    Write-Host "Starting Videofit Capture Relay..." -ForegroundColor Green
    Write-Host "  Config: $ConfigPath" -ForegroundColor Gray
    Write-Host "  Cursor: $CursorPath" -ForegroundColor Gray
    Write-Host "  Queue: $QueuePath" -ForegroundColor Gray
    Write-Host "  Poll interval: $($Config.pollSeconds) seconds" -ForegroundColor Gray
    Write-Host ""
    
    while ($true) {
        $stats = @{
            Polled = 0
            Queued = 0
            Sent = 0
            Duplicates = 0
            Errors = 0
        }
        
        try {
            # Load cursor
            $cursor = Load-Cursor
            
            # Poll Videofit for new captures
            Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Polling Videofit..." -ForegroundColor Cyan
            $captures = Poll-VideofitCaptures -Config $Config -Cursor $cursor
            $stats.Polled = $captures.Count
            Write-Host "  Found $($captures.Count) new capture(s)" -ForegroundColor Gray
            
            # Transform and queue new captures
            $newestTimestamp = $cursor.lastTimestamp
            $newestEventId = $cursor.lastEventId
            
            foreach ($capture in $captures) {
                $transformed = Transform-Capture -Capture $capture -Config $Config
                
                # Append to queue before sending
                Append-ToQueue -Event $transformed
                $stats.Queued++
                
                # Update cursor tracking
                if ($capture.OccurredAt) {
                    $ts = [DateTime]::Parse($capture.OccurredAt)
                    if (-not $newestTimestamp -or $ts -gt [DateTime]::Parse($newestTimestamp)) {
                        $newestTimestamp = $ts.ToUniversalTime().ToString("o")
                    }
                }
                if ($capture.EventId -and (-not $newestEventId -or $capture.EventId -gt $newestEventId)) {
                    $newestEventId = $capture.EventId
                }
            }
            
            # Update cursor if we found new captures
            if ($captures.Count -gt 0) {
                $cursor.lastTimestamp = $newestTimestamp
                $cursor.lastEventId = $newestEventId
                Save-Cursor -Cursor $cursor
            }
            
            # Process queue (oldest first)
            # Process from file directly to avoid index issues
            if (Test-Path $QueuePath) {
                $queueLines = Get-Content $QueuePath
                $processedIndices = @()
                
                for ($i = 0; $i -lt $queueLines.Count; $i++) {
                    if (-not $queueLines[$i].Trim()) {
                        continue
                    }
                    
                    try {
                        $event = $queueLines[$i] | ConvertFrom-Json
                        
                        Write-Host "  Sending: plate=$($event.plate), direction=$($event.direction), occurred_at=$($event.occurred_at)" -ForegroundColor DarkGray
                        
                        $result = Send-ToParkingChannel -Event $event -Config $Config
                        
                        if ($result.Success) {
                            if ($result.Duplicate) {
                                $stats.Duplicates++
                                Write-Host "    -> Duplicate (already processed)" -ForegroundColor Yellow
                            } else {
                                $stats.Sent++
                                Write-Host "    -> Success" -ForegroundColor Green
                            }
                            
                            # Mark for removal
                            $processedIndices += $i
                        } else {
                            $stats.Errors++
                            Write-Host "    -> Error: $($result.Error)" -ForegroundColor Red
                            # Keep in queue for retry
                        }
                    } catch {
                        Write-Warning "Failed to parse queue item at index $i : $_"
                        # Mark invalid items for removal
                        $processedIndices += $i
                    }
                }
                
                # Remove processed items (in reverse order to maintain indices)
                $processedIndices | Sort-Object -Descending | ForEach-Object {
                    Remove-FromQueue -Index $_
                }
            }
            
            # Log stats
            Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Stats: Polled=$($stats.Polled), Queued=$($stats.Queued), Sent=$($stats.Sent), Duplicates=$($stats.Duplicates), Errors=$($stats.Errors)" -ForegroundColor Cyan
            Write-Host ""
            
        } catch {
            Write-Error "Error in relay loop: $_"
            $stats.Errors++
        }
        
        # Wait before next poll
        Start-Sleep -Seconds $Config.pollSeconds
    }
}

# Main entry point
try {
    $config = Load-Config
    Start-Relay -Config $config
} catch {
    Write-Error "Fatal error: $_"
    exit 1
}

