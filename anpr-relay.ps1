# ANPR Relay Script for Parking Channel
# Polls outbox API and forwards vehicle updates to Videofit
# PowerShell 5.1 compatible

param(
    [string]$ConfigPath = "C:\ParkingChannel\anpr-relay.json"
)

# Error handling
$ErrorActionPreference = "Stop"

# Constants
$CachePath = "C:\ParkingChannel\anpr-last-good-outbox.json"
$MaxBackoffSeconds = 600  # 10 minutes max
$InitialBackoffSeconds = 30
$BackoffMultiplier = 2

# Load configuration
function Load-Config {
    if (-not (Test-Path $ConfigPath)) {
        Write-Host "[relay] ERROR: Config file not found: $ConfigPath" -ForegroundColor Red
        exit 1
    }
    
    $config = Get-Content $ConfigPath | ConvertFrom-Json
    
    $required = @('parkingChannelBaseUrl', 'tenantId', 'relayToken', 'siteClientLicense', 'locPcNo', 'defaultGroup', 'pollSeconds')
    foreach ($field in $required) {
        if (-not $config.PSObject.Properties[$field]) {
            Write-Host "[relay] ERROR: Missing required config field: $field" -ForegroundColor Red
            exit 1
        }
    }
    
    # Set defaults for optional fields
    if (-not $config.PSObject.Properties['minItemsToProcess']) {
        $config | Add-Member -MemberType NoteProperty -Name 'minItemsToProcess' -Value 1
    }
    if (-not $config.PSObject.Properties['useCacheWhenOffline']) {
        $config | Add-Member -MemberType NoteProperty -Name 'useCacheWhenOffline' -Value $false
    }
    if (-not $config.PSObject.Properties['videofitEndpoint']) {
        $config | Add-Member -MemberType NoteProperty -Name 'videofitEndpoint' -Value "http://localhost/Videofit/SendDbBulkUpdateWebService/SendDbBulkUpdateWebService.asmx"
    }
    
    return $config
}

# Trust all certificates (for self-signed Videofit endpoints)
Add-Type @"
    public class TrustAll {
        public static bool Validate(object sender, System.Security.Cryptography.X509Certificates.X509Certificate certificate, System.Security.Cryptography.X509Certificates.X509Chain chain, System.Net.Security.SslPolicyErrors sslPolicyErrors) {
            return true;
        }
    }
"@

# Fetch outbox items from API
function Fetch-Outbox {
    param(
        [object]$Config
    )
    
    $uri = "$($Config.parkingChannelBaseUrl)/api/internal/anpr/outbox?tenantId=$($Config.tenantId)&limit=100"
    
    try {
        $response = Invoke-RestMethod -Uri $uri `
            -Method GET `
            -Headers @{ 
                "Authorization" = "Bearer $($Config.relayToken)"
            } `
            -ErrorAction Stop
        
        Write-Host "[relay] Fetch successful: $($response.count) items" -ForegroundColor Green
        return $response
    } catch {
        Write-Host "[relay] Fetch failed: $($_.Exception.Message)" -ForegroundColor Red
        throw
    }
}

# Fetch staff vehicles from API
function Fetch-StaffVehicles {
    param(
        [object]$Config
    )
    
    $uri = "$($Config.parkingChannelBaseUrl)/api/internal/anpr/staff-vehicles?tenantId=$($Config.tenantId)"
    
    try {
        $response = Invoke-RestMethod -Uri $uri `
            -Method GET `
            -Headers @{ 
                "Authorization" = "Bearer $($Config.relayToken)"
            } `
            -ErrorAction Stop
        
        Write-Host "[relay] Staff vehicles fetched: $($response.count) vehicles" -ForegroundColor Green
        return $response
    } catch {
        Write-Host "[relay] Staff vehicles fetch failed: $($_.Exception.Message)" -ForegroundColor Red
        # Don't throw - staff vehicles are optional, continue without them
        return $null
    }
}

# Load cache file
function Load-Cache {
    if (Test-Path $CachePath) {
        try {
            $cacheContent = Get-Content $CachePath -Raw -Encoding UTF8
            $cache = $cacheContent | ConvertFrom-Json
            Write-Host "[relay] Loaded cache: $($cache.count) items" -ForegroundColor Yellow
            return $cache
        } catch {
            Write-Host "[relay] Failed to load cache: $($_.Exception.Message)" -ForegroundColor Red
            return $null
        }
    }
    return $null
}

# Save cache file
function Save-Cache {
    param(
        [string]$JsonContent
    )
    
    try {
        $cacheDir = Split-Path -Parent $CachePath
        if (-not (Test-Path $cacheDir)) {
            New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
        }
        $JsonContent | Set-Content -Path $CachePath -Encoding UTF8 -Force
        Write-Host "[relay] Cache saved: $CachePath" -ForegroundColor Gray
    } catch {
        Write-Host "[relay] Failed to save cache: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Send vehicle update to Videofit via SOAP
function Send-ToVideofit {
    param(
        [object]$Item,
        [object]$Config
    )
    
    $videofitUrl = $Config.videofitEndpoint
    $siteClientLicense = $Config.siteClientLicense
    $locPcNo = $Config.locPcNo
    
    # Determine action flags
    $deleteVehicle = ($Item.action -eq "delete")
    $editVehicle = ($Item.action -eq "upsert")
    
    # Convert dates to Videofit ticks (milliseconds since epoch)
    $validFromDate = [DateTime]::Parse($Item.validFrom)
    $validUntilDate = [DateTime]::Parse($Item.validUntil)
    $epoch = New-Object DateTime(1970, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)
    $visitArrivalTime = [long](($validFromDate.ToUniversalTime() - $epoch).TotalMilliseconds)
    $visitorDepTime = [long](($validUntilDate.ToUniversalTime() - $epoch).TotalMilliseconds)
    
    # Escape XML
    $escapedPlate = $Item.plate -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;' -replace '"', '&quot;' -replace "'", '&apos;'
    
    # Build SOAP envelope
    $soapAction = "http://www.videofit.co.uk/Videofit/SendDbBulkUpdateWebService/SendDbBulkUpdate"
    $updateGeneratedAt = [long](([DateTime]::UtcNow - $epoch).TotalMilliseconds)
    
    $soap = @"
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <SendDbBulkUpdate xmlns="http://www.videofit.co.uk/Videofit/SendDbBulkUpdateWebService">
      <siteClientLicense>$siteClientLicense</siteClientLicense>
      <locPcNo>$locPcNo</locPcNo>
      <deleteVehicle>
        <boolean>$deleteVehicle</boolean>
      </deleteVehicle>
      <editVehicle>
        <boolean>$editVehicle</boolean>
      </editVehicle>
      <vehPlate>
        <string>$escapedPlate</string>
      </vehPlate>
      <vehGroup>
        <int>$($Item.group)</int>
      </vehGroup>
      <visitArrivalTime>
        <long>$visitArrivalTime</long>
      </visitArrivalTime>
      <visitorDepTime>
        <long>$visitorDepTime</long>
      </visitorDepTime>
      <updateGeneratedAt>$updateGeneratedAt</updateGeneratedAt>
    </SendDbBulkUpdate>
  </soap:Body>
</soap:Envelope>
"@
    
    # Save old certificate callback
    $oldCb = [System.Net.ServicePointManager]::ServerCertificateValidationCallback
    
    try {
        # Trust all certificates
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = 
            New-Object System.Net.Security.RemoteCertificateValidationCallback([TrustAll]::Validate)
        
        # Send SOAP request
        $resp = Invoke-WebRequest -Method POST -Uri $videofitUrl `
            -Headers @{ "SOAPAction" = $soapAction } `
            -ContentType "text/xml; charset=utf-8" `
            -Body $soap `
            -UseBasicParsing `
            -TimeoutSec 20 `
            -DisableKeepAlive `
            -ErrorAction Stop
        
        Write-Host "[relay] SOAP HTTP $($resp.StatusCode)" -ForegroundColor Gray
        if ($resp.Content) {
            $preview = $resp.Content
            if ($preview.Length -gt 400) { 
                $preview = $preview.Substring(0, 400) + "..." 
            }
            Write-Host "[relay] SOAP RESP: $preview" -ForegroundColor Gray
        } else {
            Write-Host "[relay] SOAP RESP: <empty>" -ForegroundColor Gray
        }
        
        # Check for SOAP faults
        if ($resp.Content -match '<faultstring[^>]*>([^<]+)</faultstring>' -or $resp.Content -match '<soap:Fault>') {
            throw "SOAP fault in response"
        }
        
        return $true
    } catch {
        Write-Host "[relay] Videofit error for item $($Item.id): $($_.Exception.Message)" -ForegroundColor Red
        throw
    } finally {
        # Restore certificate callback
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = $oldCb
    }
}

# Send staff vehicles to Videofit as bulk update
function Send-StaffVehiclesToVideofit {
    param(
        [array]$StaffVehicles,
        [object]$Config
    )
    
    if ($StaffVehicles -eq $null -or $StaffVehicles.Count -eq 0) {
        return $true
    }
    
    $videofitUrl = $Config.videofitEndpoint
    $siteClientLicense = $Config.siteClientLicense
    $locPcNo = $Config.locPcNo
    $defaultGroup = $Config.defaultGroup
    
    # Staff vehicles should always be valid (wide time window)
    # Set valid from 10 years ago to 10 years in the future
    $epoch = New-Object DateTime(1970, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)
    $validFromDate = ([DateTime]::UtcNow).AddYears(-10)
    $validUntilDate = ([DateTime]::UtcNow).AddYears(10)
    $visitArrivalTime = [long](($validFromDate - $epoch).TotalMilliseconds)
    $visitorDepTime = [long](($validUntilDate - $epoch).TotalMilliseconds)
    
    # Build arrays for bulk update
    $deleteVehicleArray = @()
    $editVehicleArray = @()
    $vehPlateArray = @()
    $vehGroupArray = @()
    $visitArrivalTimeArray = @()
    $visitorDepTimeArray = @()
    
    foreach ($vehicle in $StaffVehicles) {
        $deleteVehicleArray += $false
        $editVehicleArray += $true
        $escapedPlate = $vehicle.plate -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;' -replace '"', '&quot;' -replace "'", '&apos;'
        $vehPlateArray += $escapedPlate
        $vehGroupArray += $defaultGroup
        $visitArrivalTimeArray += $visitArrivalTime
        $visitorDepTimeArray += $visitorDepTime
    }
    
    # Build SOAP envelope with arrays
    $soapAction = "http://www.videofit.co.uk/Videofit/SendDbBulkUpdateWebService/SendDbBulkUpdate"
    $updateGeneratedAt = [long](([DateTime]::UtcNow - $epoch).TotalMilliseconds)
    
    # Build array XML elements
    $deleteVehicleXml = ($deleteVehicleArray | ForEach-Object { "<boolean>$_</boolean>" }) -join "`n      "
    $editVehicleXml = ($editVehicleArray | ForEach-Object { "<boolean>$_</boolean>" }) -join "`n      "
    $vehPlateXml = ($vehPlateArray | ForEach-Object { "<string>$_</string>" }) -join "`n      "
    $vehGroupXml = ($vehGroupArray | ForEach-Object { "<int>$_</int>" }) -join "`n      "
    $visitArrivalTimeXml = ($visitArrivalTimeArray | ForEach-Object { "<long>$_</long>" }) -join "`n      "
    $visitorDepTimeXml = ($visitorDepTimeArray | ForEach-Object { "<long>$_</long>" }) -join "`n      "
    
    $soap = @"
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <SendDbBulkUpdate xmlns="http://www.videofit.co.uk/Videofit/SendDbBulkUpdateWebService">
      <siteClientLicense>$siteClientLicense</siteClientLicense>
      <locPcNo>$locPcNo</locPcNo>
      <deleteVehicle>
      $deleteVehicleXml
      </deleteVehicle>
      <editVehicle>
      $editVehicleXml
      </editVehicle>
      <vehPlate>
      $vehPlateXml
      </vehPlate>
      <vehGroup>
      $vehGroupXml
      </vehGroup>
      <visitArrivalTime>
      $visitArrivalTimeXml
      </visitArrivalTime>
      <visitorDepTime>
      $visitorDepTimeXml
      </visitorDepTime>
      <updateGeneratedAt>$updateGeneratedAt</updateGeneratedAt>
    </SendDbBulkUpdate>
  </soap:Body>
</soap:Envelope>
"@
    
    # Save old certificate callback
    $oldCb = [System.Net.ServicePointManager]::ServerCertificateValidationCallback
    
    try {
        # Trust all certificates
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = 
            New-Object System.Net.Security.RemoteCertificateValidationCallback([TrustAll]::Validate)
        
        # Send SOAP request
        $resp = Invoke-WebRequest -Method POST -Uri $videofitUrl `
            -Headers @{ "SOAPAction" = $soapAction } `
            -ContentType "text/xml; charset=utf-8" `
            -Body $soap `
            -UseBasicParsing `
            -TimeoutSec 20 `
            -DisableKeepAlive `
            -ErrorAction Stop
        
        Write-Host "[relay] Staff vehicles SOAP HTTP $($resp.StatusCode)" -ForegroundColor Gray
        if ($resp.Content) {
            $preview = $resp.Content
            if ($preview.Length -gt 400) { 
                $preview = $preview.Substring(0, 400) + "..." 
            }
            Write-Host "[relay] Staff vehicles SOAP RESP: $preview" -ForegroundColor Gray
        } else {
            Write-Host "[relay] Staff vehicles SOAP RESP: <empty>" -ForegroundColor Gray
        }
        
        # Check for SOAP faults
        if ($resp.Content -match '<faultstring[^>]*>([^<]+)</faultstring>' -or $resp.Content -match '<soap:Fault>') {
            throw "SOAP fault in response"
        }
        
        Write-Host "[relay] Staff vehicles sent successfully: $($StaffVehicles.Count) vehicles" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "[relay] Staff vehicles Videofit error: $($_.Exception.Message)" -ForegroundColor Red
        throw
    } finally {
        # Restore certificate callback
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = $oldCb
    }
}

# Send ACK for processed items
function Send-Ack {
    param(
        [string[]]$ItemIds,
        [object]$Config
    )
    
    if ($ItemIds.Count -eq 0) {
        return
    }
    
    $ackBody = @{
        itemIds = $ItemIds
        success = $true
    } | ConvertTo-Json
    
    $uri = "$($Config.parkingChannelBaseUrl)/api/internal/anpr/outbox/ack?tenantId=$($Config.tenantId)"
    
    try {
        $null = Invoke-RestMethod -Uri $uri `
            -Method POST `
            -Headers @{ 
                "Authorization" = "Bearer $($Config.relayToken)"
                "Content-Type" = "application/json"
            } `
            -Body $ackBody `
            -ErrorAction Stop
        
        Write-Host "[relay] ACK sent: $($ItemIds.Count) items" -ForegroundColor Green
    } catch {
        Write-Host "[relay] ACK failed: $($_.Exception.Message)" -ForegroundColor Red
        throw
    }
}

# Main relay loop
function Start-Relay {
    param([object]$Config)
    
    Write-Host "[relay] Starting ANPR Relay..." -ForegroundColor Green
    Write-Host "[relay] Config: $ConfigPath" -ForegroundColor Gray
    Write-Host "[relay] Cache: $CachePath" -ForegroundColor Gray
    Write-Host "[relay] Poll interval: $($Config.pollSeconds) seconds" -ForegroundColor Gray
    Write-Host "[relay] Min items to process: $($Config.minItemsToProcess)" -ForegroundColor Gray
    Write-Host "[relay] Use cache when offline: $($Config.useCacheWhenOffline)" -ForegroundColor Gray
    Write-Host ""
    
    $backoffSeconds = 0
    $consecutiveFailures = 0
    
    while ($true) {
        $loopStart = Get-Date
        
        try {
            # SAFE MODE: Try to fetch outbox
            $response = $null
            $useCache = $false
            
            try {
                $response = Fetch-Outbox -Config $Config
                $consecutiveFailures = 0
                $backoffSeconds = 0
                Write-Host "[relay] Fetch succeeded, resetting backoff" -ForegroundColor Green
            } catch {
                $consecutiveFailures++
                Write-Host "[relay] Fetch failed (consecutive failures: $consecutiveFailures)" -ForegroundColor Red
                
                # SAFE MODE: If fetch fails, check if we should use cache
                if ($Config.useCacheWhenOffline -eq $true) {
                    Write-Host "[relay] useCacheWhenOffline=true, attempting to load cache" -ForegroundColor Yellow
                    $cachedResponse = Load-Cache
                    if ($cachedResponse -ne $null) {
                        $response = $cachedResponse
                        $useCache = $true
                        Write-Host "[relay] Using cached outbox data" -ForegroundColor Yellow
                    } else {
                        Write-Host "[relay] No cache available, skipping processing" -ForegroundColor Yellow
                        $response = $null
                    }
                } else {
                    Write-Host "[relay] useCacheWhenOffline=false, skipping processing (safe mode)" -ForegroundColor Yellow
                    $response = $null
                }
                
                # Calculate exponential backoff
                if ($backoffSeconds -eq 0) {
                    $backoffSeconds = $InitialBackoffSeconds
                } else {
                    $backoffSeconds = $backoffSeconds * $BackoffMultiplier
                    if ($backoffSeconds -gt $MaxBackoffSeconds) {
                        $backoffSeconds = $MaxBackoffSeconds
                    }
                }
                Write-Host "[relay] Backoff: $backoffSeconds seconds" -ForegroundColor Yellow
            }
            
            # SAFE MODE: If we have no response (fetch failed and no cache), skip processing
            if ($response -eq $null) {
                Write-Host "[relay] No outbox data available, sleeping $backoffSeconds seconds" -ForegroundColor Yellow
                Start-Sleep -Seconds $backoffSeconds
                continue
            }
            
            # Fetch and send staff vehicles first (always include them when we have a connection)
            # Only fetch if we successfully connected (not using cache from offline mode)
            if (-not $useCache) {
                try {
                    $staffVehiclesResponse = Fetch-StaffVehicles -Config $Config
                    if ($staffVehiclesResponse -ne $null -and $staffVehiclesResponse.vehicles.Count -gt 0) {
                        Write-Host "[relay] Sending $($staffVehiclesResponse.vehicles.Count) staff vehicles to Videofit..." -ForegroundColor Cyan
                        try {
                            Send-StaffVehiclesToVideofit -StaffVehicles $staffVehiclesResponse.vehicles -Config $Config
                            Write-Host "[relay] Staff vehicles updated successfully" -ForegroundColor Green
                        } catch {
                            Write-Host "[relay] Failed to send staff vehicles: $($_.Exception.Message)" -ForegroundColor Red
                            # Don't fail the entire loop if staff vehicles fail
                        }
                    } else {
                        Write-Host "[relay] No staff vehicles to send" -ForegroundColor Gray
                    }
                } catch {
                    Write-Host "[relay] Failed to fetch staff vehicles: $($_.Exception.Message)" -ForegroundColor Yellow
                    # Don't fail the entire loop if staff vehicles fetch fails
                }
            } else {
                Write-Host "[relay] Skipping staff vehicles (using cache, safe mode)" -ForegroundColor Yellow
            }
            
            # Check minimum items requirement
            $itemCount = 0
            if ($response.PSObject.Properties['count']) {
                $itemCount = $response.count
            } elseif ($response.PSObject.Properties['items']) {
                $itemCount = $response.items.Count
            }
            
            if ($itemCount -lt $Config.minItemsToProcess) {
                Write-Host "[relay] Items count ($itemCount) < minItemsToProcess ($($Config.minItemsToProcess)), skipping processing" -ForegroundColor Yellow
                if ($backoffSeconds -gt 0) {
                    Write-Host "[relay] Sleeping $backoffSeconds seconds (backoff)" -ForegroundColor Yellow
                    Start-Sleep -Seconds $backoffSeconds
                } else {
                    Start-Sleep -Seconds $Config.pollSeconds
                }
                continue
            }
            
            # Process items
            $items = $response.items
            if ($items -eq $null) {
                $items = @()
            }
            
            Write-Host "[relay] Processing $($items.Count) items..." -ForegroundColor Cyan
            
            $results = @()
            foreach ($item in $items) {
                $result = @{
                    id = $item.id
                    ok = $false
                    error = $null
                }
                
                try {
                    # Call Videofit (even when using cache, if useCacheWhenOffline=true)
                    Send-ToVideofit -Item $item -Config $Config
                    $result.ok = $true
                } catch {
                    $result.error = $_.Exception.Message
                    Write-Host "[relay] Failed to process item $($item.id): $($result.error)" -ForegroundColor Red
                }
                
                $results += $result
            }
            
            # SAFE MODE: Only ACK if we successfully fetched (not from cache)
            # And only ACK successful items
            if (-not $useCache) {
                $okIds = @()
                foreach ($r in $results) {
                    if ($r.ok -eq $true) {
                        $okIds += $r.id
                    }
                }
                
                if ($okIds.Count -gt 0) {
                    try {
                        Send-Ack -ItemIds $okIds -Config $Config
                    } catch {
                        Write-Host "[relay] ACK failed, items will remain in outbox for retry" -ForegroundColor Red
                    }
                } else {
                    Write-Host "[relay] No successful items to ACK" -ForegroundColor Yellow
                }
                
                # Save cache after successful fetch+parse where items.Count > 0
                if ($items.Count -gt 0) {
                    try {
                        $rawJson = $response | ConvertTo-Json -Depth 10
                        Save-Cache -JsonContent $rawJson
                        Write-Host "[relay] Cache updated with $($items.Count) items" -ForegroundColor Gray
                    } catch {
                        Write-Host "[relay] Failed to save cache: $($_.Exception.Message)" -ForegroundColor Yellow
                    }
                }
            } else {
                Write-Host "[relay] Skipping ACK (using cache, safe mode)" -ForegroundColor Yellow
            }
            
            # Reset backoff on successful processing
            $backoffSeconds = 0
            
        } catch {
            Write-Host "[relay] Unexpected error in main loop: $($_.Exception.Message)" -ForegroundColor Red
            $consecutiveFailures++
            
            # Exponential backoff on errors
            if ($backoffSeconds -eq 0) {
                $backoffSeconds = $InitialBackoffSeconds
            } else {
                $backoffSeconds = $backoffSeconds * $BackoffMultiplier
                if ($backoffSeconds -gt $MaxBackoffSeconds) {
                    $backoffSeconds = $MaxBackoffSeconds
                }
            }
        }
        
        # Calculate sleep time
        $elapsed = ((Get-Date) - $loopStart).TotalSeconds
        $sleepSeconds = $Config.pollSeconds
        
        if ($backoffSeconds -gt 0) {
            $sleepSeconds = $backoffSeconds
        } elseif ($elapsed -lt $Config.pollSeconds) {
            $sleepSeconds = $Config.pollSeconds - $elapsed
        }
        
        if ($sleepSeconds -gt 0) {
            Write-Host "[relay] Sleeping $sleepSeconds seconds..." -ForegroundColor Gray
            Start-Sleep -Seconds $sleepSeconds
        }
    }
}

# Main entry point
try {
    $config = Load-Config
    Start-Relay -Config $config
} catch {
    Write-Host "[relay] Fatal error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

