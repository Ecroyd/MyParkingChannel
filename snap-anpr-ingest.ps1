# Snap/Videofit ANPR Relay for Parking Channel
# Watches recognition log folders and posts events to Parking Channel API
#
# Usage:
#   .\snap-anpr-ingest.ps1 [-ConfigPath "C:\ParkingChannel\snap-anpr-ingest.json"] [-Mode "watch|scan"]
#
# Modes:
#   watch - Uses FileSystemWatcher to monitor folders in real-time (default)
#   scan  - Scheduled mode: scans most recent Day folder every minute

param(
    [Parameter(Mandatory=$false)]
    [string]$ConfigPath = "C:\ParkingChannel\snap-anpr-ingest.json",
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("watch", "scan")]
    [string]$Mode = "watch"
)

# ============================================
# CONFIGURATION
# ============================================

function Load-Config {
    param([string]$Path)
    
    if (-not (Test-Path $Path)) {
        Write-Error "Config file not found: $Path"
        Write-Host "Please create a config file with the following structure:" -ForegroundColor Yellow
        Write-Host @"
{
  "tenantId": "your-tenant-uuid",
  "siteId": "your-site-uuid-or-null",
  "apiBaseUrl": "https://myparkingchannel.app",
  "relayToken": "your-relay-token",
  "recognitionLogRoot": "C:\\snap\\recognition log1",
  "vehiclesOnSiteFile": "C:\\snap\\vehicles on site\\vehicles on site list.txt"
}
"@ -ForegroundColor Yellow
        exit 1
    }
    
    try {
        $config = Get-Content $Path -Raw | ConvertFrom-Json
        return $config
    } catch {
        Write-Error "Failed to parse config file: $_"
        exit 1
    }
}

# ============================================
# STATE MANAGEMENT (DEDUPLICATION)
# ============================================

# State file path will be set after config is loaded
$script:StateFile = $null
$script:ConfigPath = $ConfigPath

function Load-State {
    param([string]$StateFilePath)
    
    if (Test-Path $StateFilePath) {
        try {
            $content = Get-Content $StateFilePath -Raw | ConvertFrom-Json
            return $content
        } catch {
            Write-Log "Warning: Failed to load state file, starting fresh" -ForegroundColor Yellow
        }
    }
    
    return @{
        processedFiles = @()
        lastProcessedTime = $null
    }
}

function Save-State {
    param(
        $State,
        [string]$StateFilePath
    )
    
    try {
        $State | ConvertTo-Json -Depth 10 | Set-Content $StateFilePath -Encoding UTF8
    } catch {
        Write-Log "Warning: Failed to save state file: $_" -ForegroundColor Yellow
    }
}

function Is-Processed {
    param(
        [string]$FilePath,
        [object]$State
    )
    
    $normalizedPath = $FilePath.ToLower().Replace('\', '/')
    return $State.processedFiles -contains $normalizedPath
}

function Mark-Processed {
    param(
        [string]$FilePath,
        [object]$State
    )
    
    $normalizedPath = $FilePath.ToLower().Replace('\', '/')
    if ($State.processedFiles -notcontains $normalizedPath) {
        $State.processedFiles += $normalizedPath
        
        # Keep only last 1000 entries to prevent state file from growing too large
        if ($State.processedFiles.Count -gt 1000) {
            $State.processedFiles = $State.processedFiles[-1000..-1]
        }
    }
}

# ============================================
# LOGGING
# ============================================

function Write-Log {
    param(
        [string]$Message,
        [string]$ForegroundColor = "White"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] $Message" -ForegroundColor $ForegroundColor
}

# ============================================
# FILENAME PARSING
# ============================================

function Parse-VrnFilename {
    param([string]$FileName)
    
    # Example: logvr20260108T040614000000099820260108T040614     WK25OJV0000009980000100X0000000000.vrn
    # Pattern: logvr + YYYYMMDD + T + HHMMSS + ... + plate + ...
    
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($FileName)
    
    # Try to extract date/time from filename
    # Look for pattern: YYYYMMDDTHHMMSS
    $dateTimePattern = '(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})'
    $dateTimeMatch = [regex]::Match($baseName, $dateTimePattern)
    
    $eventDateTime = $null
    if ($dateTimeMatch.Success) {
        $year = [int]$dateTimeMatch.Groups[1].Value
        $month = [int]$dateTimeMatch.Groups[2].Value
        $day = [int]$dateTimeMatch.Groups[3].Value
        $hour = [int]$dateTimeMatch.Groups[4].Value
        $minute = [int]$dateTimeMatch.Groups[5].Value
        $second = [int]$dateTimeMatch.Groups[6].Value
        
        try {
            $eventDateTime = Get-Date -Year $year -Month $month -Day $day -Hour $hour -Minute $minute -Second $second
        } catch {
            Write-Log "Warning: Invalid date/time in filename: $FileName" -ForegroundColor Yellow
        }
    }
    
    # Extract plate (UK format: typically 2-3 letters, 2 digits, 3 letters, or similar)
    # Look for alphanumeric sequences that look like UK plates
    # Common patterns: AB12CDE, AB123CD, ABC123D, etc.
    $platePattern = '([A-Z]{1,3}\d{1,4}[A-Z]{1,3})'
    $plateMatch = [regex]::Match($baseName, $platePattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    
    $plate = $null
    if ($plateMatch.Success) {
        $plate = $plateMatch.Groups[1].Value.ToUpper().Replace(' ', '')
    }
    
    # If no plate found, try to extract any alphanumeric sequence
    if (-not $plate) {
        $alnumPattern = '([A-Z0-9]{6,8})'
        $alnumMatch = [regex]::Match($baseName, $alnumPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if ($alnumMatch.Success) {
            $plate = $alnumMatch.Groups[1].Value.ToUpper()
        }
    }
    
    return @{
        Plate = $plate
        EventDateTime = $eventDateTime
        FileName = $FileName
    }
}

# ============================================
# API POSTING
# ============================================

function Post-AnprEvent {
    param(
        [object]$Config,
        [string]$Plate,
        [datetime]$EventAt,
        [string]$CameraId = $null,
        [string]$Direction = "unknown",
        [double]$Confidence = $null,
        [string]$SnapshotUrl = $null
    )
    
    if (-not $Plate) {
        Write-Log "Skipping event: no plate found" -ForegroundColor Yellow
        return $false
    }
    
    if (-not $EventAt) {
        Write-Log "Skipping event: no timestamp found" -ForegroundColor Yellow
        return $false
    }
    
    # Build API URL (no query params - tenantId goes in body)
    $url = "$($Config.apiBaseUrl)/api/anpr/events"
    
    # Build request body (matching API contract)
    $body = @{
        tenantId = $Config.tenantId
        eventAt = $EventAt.ToUniversalTime().ToString("o")  # ISO 8601
        plateRaw = $Plate
        direction = $Direction
    }
    
    if ($CameraId) {
        $body["cameraId"] = $CameraId
    }
    
    if ($Config.siteId -and $Config.siteId -ne "null" -and $Config.siteId -ne "") {
        $body["siteId"] = $Config.siteId
    }
    
    if ($null -ne $Confidence) {
        $body["confidence"] = $Confidence
    }
    
    if ($SnapshotUrl) {
        $body["snapshotUrl"] = $SnapshotUrl
    }
    
    $jsonBody = $body | ConvertTo-Json -Compress
    
    # Prepare headers
    $headers = @{
        "Content-Type" = "application/json"
        "x-relay-token" = $Config.relayToken
    }
    
    try {
        Write-Log "Posting event: Plate=$Plate, Time=$($EventAt.ToString('yyyy-MM-dd HH:mm:ss')), Direction=$Direction" -ForegroundColor Cyan
        
        $response = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $jsonBody -ErrorAction Stop
        
        Write-Log "Success: Event posted (ID: $($response.id), Status: $($response.status))" -ForegroundColor Green
        return $true
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $errorMsg = $_.Exception.Message
        
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            $errorMsg += " - $responseBody"
        }
        
        # Clear auth error message
        if ($statusCode -eq 401 -or $statusCode -eq 403) {
            Write-Log "AUTH FAILED – check raw relay token in config file" -ForegroundColor Red
            Write-Log "Error details: $errorMsg" -ForegroundColor Red
        } else {
            Write-Log "Error posting event: $errorMsg" -ForegroundColor Red
        }
        return $false
    }
}

# ============================================
# PROCESS VRN FILE
# ============================================

function Process-VrnFile {
    param(
        [string]$FilePath,
        [object]$Config,
        [object]$State,
        [string]$StateFilePath
    )
    
    if (Is-Processed $FilePath $State) {
        Write-Log "Skipping already processed: $FilePath" -ForegroundColor Gray
        return
    }
    
    $fileName = [System.IO.Path]::GetFileName($FilePath)
    Write-Log "Processing: $fileName" -ForegroundColor Cyan
    
    $parsed = Parse-VrnFilename $fileName
    
    if (-not $parsed.Plate) {
        Write-Log "Warning: Could not extract plate from filename: $fileName" -ForegroundColor Yellow
        Mark-Processed $FilePath $State
        Save-State -State $State -StateFilePath $StateFilePath
        return
    }
    
    if (-not $parsed.EventDateTime) {
        Write-Log "Warning: Could not extract timestamp from filename: $fileName" -ForegroundColor Yellow
        # Try to use file modification time as fallback
        $parsed.EventDateTime = (Get-Item $FilePath).LastWriteTime
        Write-Log "Using file modification time: $($parsed.EventDateTime)" -ForegroundColor Gray
    }
    
    # Post to API (direction defaults to 'unknown', Parking Channel will map via camera_direction_map)
    $success = Post-AnprEvent -Config $Config -Plate $parsed.Plate -EventAt $parsed.EventDateTime -Direction "unknown" -Confidence $null -SnapshotUrl $null
    
    if ($success) {
        Mark-Processed $FilePath $State
        Save-State -State $State -StateFilePath $StateFilePath
    }
}

# ============================================
# SCAN MODE: Scan most recent Day folder
# ============================================

function Scan-RecentFolder {
    param(
        [object]$Config,
        [object]$State,
        [string]$StateFilePath
    )
    
    $logRoot = $Config.recognitionLogRoot
    if (-not (Test-Path $logRoot)) {
        Write-Log "Recognition log root not found: $logRoot" -ForegroundColor Red
        return
    }
    
    # Find most recent DirDayYYYYMMDD folder
    $dayFolders = Get-ChildItem -Path $logRoot -Directory -Filter "DirDay*" | Sort-Object Name -Descending
    
    if ($dayFolders.Count -eq 0) {
        Write-Log "No Day folders found in: $logRoot" -ForegroundColor Yellow
        return
    }
    
    $mostRecentFolder = $dayFolders[0]
    Write-Log "Scanning most recent folder: $($mostRecentFolder.Name)" -ForegroundColor Cyan
    
    # Find DayYYYYMMDD subfolder
    $daySubFolders = Get-ChildItem -Path $mostRecentFolder.FullName -Directory -Filter "Day*"
    
    if ($daySubFolders.Count -eq 0) {
        Write-Log "No Day subfolders found in: $($mostRecentFolder.Name)" -ForegroundColor Yellow
        return
    }
    
    # Process all Day subfolders (in case there are multiple)
    foreach ($daySubFolder in $daySubFolders) {
        $vrnFiles = Get-ChildItem -Path $daySubFolder.FullName -Filter "*.vrn" -File
        
        foreach ($vrnFile in $vrnFiles) {
            Process-VrnFile -FilePath $vrnFile.FullName -Config $Config -State $State -StateFilePath $StateFilePath
        }
    }
}

# ============================================
# WATCH MODE: FileSystemWatcher
# ============================================

function Start-WatchMode {
    param(
        [object]$Config,
        [object]$State,
        [string]$StateFilePath
    )
    
    $logRoot = $Config.recognitionLogRoot
    if (-not (Test-Path $logRoot)) {
        Write-Log "Recognition log root not found: $logRoot" -ForegroundColor Red
        return
    }
    
    Write-Log "Starting FileSystemWatcher on: $logRoot" -ForegroundColor Green
    Write-Log "Watching for new .vrn files..." -ForegroundColor Green
    
    # Create FileSystemWatcher
    $watcher = New-Object System.IO.FileSystemWatcher
    $watcher.Path = $logRoot
    $watcher.Filter = "*.vrn"
    $watcher.IncludeSubdirectories = $true
    $watcher.EnableRaisingEvents = $true
    
    # Store config and state file path in script scope for event handler
    $script:Config = $Config
    $script:StateFilePath = $StateFilePath
    
    # Register event handler
    $action = {
        $filePath = $Event.SourceEventArgs.FullPath
        $changeType = $Event.SourceEventArgs.ChangeType
        
        if ($changeType -eq "Created") {
            # Small delay to ensure file is fully written
            Start-Sleep -Milliseconds 500
            
            if (Test-Path $filePath) {
                # Reload state to get latest
                $currentState = Load-State -StateFilePath $script:StateFilePath
                Process-VrnFile -FilePath $filePath -Config $script:Config -State $currentState -StateFilePath $script:StateFilePath
            }
        }
    }
    
    $eventJob = Register-ObjectEvent -InputObject $watcher -EventName "Created" -Action $action
    
    # Also do an initial scan of recent files
    Write-Log "Performing initial scan of recent files..." -ForegroundColor Cyan
    Scan-RecentFolder -Config $Config -State $State -StateFilePath $StateFilePath
    
    Write-Log "FileSystemWatcher is running. Press Ctrl+C to stop." -ForegroundColor Green
    
    # Keep script running
    try {
        while ($true) {
            Start-Sleep -Seconds 1
        }
    } finally {
        $watcher.EnableRaisingEvents = $false
        $watcher.Dispose()
        if ($eventJob) {
            Unregister-Event -SourceIdentifier $eventJob.Name
        }
        Write-Log "FileSystemWatcher stopped." -ForegroundColor Yellow
    }
}

# ============================================
# MAIN
# ============================================

Write-Log "========================================" -ForegroundColor Cyan
Write-Log "Snap/Videofit ANPR Relay for Parking Channel" -ForegroundColor Cyan
Write-Log "========================================" -ForegroundColor Cyan
Write-Log ""

# Load configuration
Write-Log "Loading configuration from: $ConfigPath" -ForegroundColor Cyan
$script:Config = Load-Config -Path $ConfigPath
$script:StateFile = Join-Path (Split-Path $ConfigPath) "snap-anpr-ingest-state.json"
Write-Log "Tenant ID: $($script:Config.tenantId)" -ForegroundColor Gray
Write-Log "API Base URL: $($script:Config.apiBaseUrl)" -ForegroundColor Gray
Write-Log "Recognition Log Root: $($script:Config.recognitionLogRoot)" -ForegroundColor Gray
Write-Log "State File: $script:StateFile" -ForegroundColor Gray
Write-Log ""

# Load state
$script:State = Load-State -StateFilePath $script:StateFile
Write-Log "Loaded state: $($script:State.processedFiles.Count) processed files" -ForegroundColor Gray
Write-Log ""

# Start in selected mode
if ($Mode -eq "scan") {
    Write-Log "Starting in SCAN mode (scheduled scans every minute)" -ForegroundColor Green
    Write-Log ""
    
    while ($true) {
        $script:State = Load-State -StateFilePath $script:StateFile
        Scan-RecentFolder -Config $script:Config -State $script:State -StateFilePath $script:StateFile
        Write-Log "Waiting 60 seconds until next scan..." -ForegroundColor Gray
        Start-Sleep -Seconds 60
    }
} else {
    Write-Log "Starting in WATCH mode (FileSystemWatcher)" -ForegroundColor Green
    Write-Log ""
    Start-WatchMode -Config $script:Config -State $script:State -StateFilePath $script:StateFile
}

