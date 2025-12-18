# ANPR Relay Script Reference

## SOAP Response Debugging

**Important:** Always log the SOAP response to see if Videofit accepted or rejected the request.

### In your `VideofitBulkUpdate` function, replace this:

```powershell
$null = Invoke-WebRequest -Method POST -Uri $videofitUrl `
  -Headers @{ "SOAPAction" = $soapAction } `
  -ContentType "text/xml; charset=utf-8" `
  -Body $soap `
  -UseBasicParsing `
  -TimeoutSec 20 `
  -DisableKeepAlive

Write-Host "[relay] SOAP OK"
```

### With this (captures and prints response):

```powershell
$resp = Invoke-WebRequest -Method POST -Uri $videofitUrl `
  -Headers @{ "SOAPAction" = $soapAction } `
  -ContentType "text/xml; charset=utf-8" `
  -Body $soap `
  -UseBasicParsing `
  -TimeoutSec 20 `
  -DisableKeepAlive

Write-Host ("[relay] SOAP HTTP " + $resp.StatusCode)
if ($resp.Content) {
  $preview = $resp.Content
  if ($preview.Length -gt 400) { $preview = $preview.Substring(0,400) + "..." }
  Write-Host ("[relay] SOAP RESP: " + $preview)
} else {
  Write-Host "[relay] SOAP RESP: <empty>"
}
```

**Why this matters:** The SOAP response body will tell you immediately whether Videofit accepted the request or silently rejected it. This is the key to debugging integration issues.

**What to look for in the response:**
- **Success indicators:** `<SendDbBulkUpdateResult>true</SendDbBulkUpdateResult>` or similar
- **Error messages:** SOAP faults, validation errors, or rejection reasons
- **Status codes:** HTTP 200 doesn't always mean success in SOAP

**To debug:**
1. Run the relay script
2. Click "Send Test Vehicle" in the UI
3. Check the PowerShell console output for lines starting with `[relay] SOAP RESP: ...`
4. **Paste those lines** - the response will tell us immediately whether Videofit accepted it or silently rejected it

## Certificate Validation Callback Fix

In the `VideofitBulkUpdate` function, replace the certificate callback assignment with this version:

### OLD (Problematic - causes "Cannot find an overload" error):
```powershell
$oldCb = [System.Net.ServicePointManager]::ServerCertificateValidationCallback
[System.Net.ServicePointManager]::ServerCertificateValidationCallback =
  New-Object System.Net.Security.RemoteCertificateValidationCallback([PcRelayCert]::TrustAll)
```

### NEW (Fixed - uses compiled delegate):
```powershell
$oldCb = [System.Net.ServicePointManager]::ServerCertificateValidationCallback
[System.Net.ServicePointManager]::ServerCertificateValidationCallback =
  New-Object System.Net.Security.RemoteCertificateValidationCallback([TrustAll]::Validate)
```

**Note:** This assumes you have an `Add-Type` class called `TrustAll` with a static `Validate` method. Example:
```powershell
Add-Type @"
  public class TrustAll {
    public static bool Validate(object sender, System.Security.Cryptography.X509Certificates.X509Certificate certificate, System.Security.Cryptography.X509Certificates.X509Chain chain, System.Net.Security.SslPolicyErrors sslPolicyErrors) {
      return true;
    }
  }
"@
```

### Restore (Keep as-is):
```powershell
finally {
  [System.Net.ServicePointManager]::ServerCertificateValidationCallback = $oldCb
}
```

**Why this works:** Using a compiled delegate from an `Add-Type` class avoids runspace issues and overload resolution problems. The method group `[TrustAll]::Validate` matches the delegate signature exactly.

## ACK Endpoint Payload Format

The `/api/internal/anpr/outbox/ack` endpoint expects this exact format:

### Correct Format:
```json
{
  "itemIds": ["uuid1", "uuid2", "uuid3"],
  "success": true
}
```

### Field Requirements:
- `itemIds`: **Array of strings** (UUIDs from the outbox items)
- `success`: **Boolean** (`true` for successful processing, `false` for failures)

### Example Request:
```powershell
$ackBody = @{
    itemIds = @("550e8400-e29b-41d4-a716-446655440000", "660e8400-e29b-41d4-a716-446655440001")
    success = $true
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/api/internal/anpr/outbox/ack?tenantId=$tenantId" `
    -Method POST `
    -Headers @{ "Authorization" = "Bearer $relayToken"; "Content-Type" = "application/json" } `
    -Body $ackBody
```

### Incorrect Formats (Will Return 400):
```json
// ❌ WRONG - Using "results" array
{
  "results": [
    { "id": "...", "ok": true, "error": "..." }
  ],
  "atUtc": "..."
}

// ❌ WRONG - Using "acks" array
{
  "acks": [...]
}

// ❌ WRONG - Using "outbox_id" instead of "id"
{
  "outbox_id": "...",
  "status": "..."
}

// ❌ WRONG - Flat structure per POST
{
  "id": "...",
  "status": "..."
}
```

## Outbox Polling Endpoint

### GET `/api/internal/anpr/outbox?tenantId={tenantId}&limit={limit}&maxAge={maxAge}`

**Response Format:**
```json
{
  "ok": true,
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "plate": "ABC123",
      "group": 4,
      "validFrom": "2025-12-18T20:00:00Z",
      "validUntil": "2025-12-19T08:00:00Z",
      "action": "upsert",
      "createdAt": "2025-12-18T20:00:00Z",
      "retryCount": 0
    }
  ],
  "count": 1
}
```

**Note:** Items are automatically marked as `processing` when fetched. You must ACK them after processing.

## ACK Logic - Only ACK Successful Items

**Important:** Only ACK items that successfully processed. Failed items should remain in the outbox for retry or inspection.

### Replace your ACK section with this:

```powershell
# ACK only the items that succeeded
$okIds = @()
foreach ($r in $results) {
  if ($r.ok -eq $true) { $okIds += $r.id }
}

if ($okIds.Count -gt 0) {
  try {
    $null = SendAck $okIds
    Write-Host ("[relay] ACK sent ok=" + $okIds.Count)
  } catch {
    Write-Host ("[relay] ACK failed: " + $_.Exception.Message)
  }
} else {
  Write-Host "[relay] No successful items to ACK."
}
```

**Benefits:**
- Only removes items from outbox when Videofit succeeded
- Leaves failures in outbox (so you can retry or inspect)
- Prevents successful items from being reprocessed

### SendAck Function Example:

```powershell
function SendAck {
  param([string[]]$itemIds)
  
  $ackBody = @{
    itemIds = $itemIds
    success = $true
  } | ConvertTo-Json

  Invoke-RestMethod -Uri "$baseUrl/api/internal/anpr/outbox/ack?tenantId=$tenantId" `
    -Method POST `
    -Headers @{ 
      "Authorization" = "Bearer $relayToken"
      "Content-Type" = "application/json" 
    } `
    -Body $ackBody
}
```

## Complete Flow Example

```powershell
# 1. Poll for items
$response = Invoke-RestMethod -Uri "$baseUrl/api/internal/anpr/outbox?tenantId=$tenantId" `
    -Method GET `
    -Headers @{ "Authorization" = "Bearer $relayToken" }

# 2. Process each item and collect results
$results = @()
foreach ($item in $response.items) {
    $result = @{
        id = $item.id
        ok = $false
        error = $null
    }
    
    try {
        # Send to Videofit
        VideofitBulkUpdate -Item $item
        $result.ok = $true
    } catch {
        $result.error = $_.Exception.Message
        Write-Host "[relay] Failed to process item $($item.id): $_"
    }
    
    $results += $result
}

# 3. ACK only successful items (see ACK Logic section above)
$okIds = @()
foreach ($r in $results) {
  if ($r.ok -eq $true) { $okIds += $r.id }
}

if ($okIds.Count -gt 0) {
  try {
    $null = SendAck $okIds
    Write-Host ("[relay] ACK sent ok=" + $okIds.Count)
  } catch {
    Write-Host ("[relay] ACK failed: " + $_.Exception.Message)
  }
} else {
  Write-Host "[relay] No successful items to ACK."
}
```

## Diagnostics Collection

The relay script should periodically collect diagnostic information about the Videofit system and POST it to the server. This helps locate where Videofit stores the known vehicles database and verify the system is running correctly.

### Collect Diagnostics Function:

```powershell
function CollectVideofitDiagnostics {
  $diag = @{
    videofitProcess = $null
    iisEndpoints = @()
    recentFiles = @()
    collectedAt = (Get-Date).ToUniversalTime().ToString("o")
  }

  # 1. Check if videofit.exe is running
  $vfProcess = Get-Process -Name "videofit" -ErrorAction SilentlyContinue
  if ($vfProcess) {
    $diag.videofitProcess = @{
      running = $true
      pid = $vfProcess.Id
      path = $vfProcess.Path
      commandLine = (Get-WmiObject Win32_Process -Filter "ProcessId = $($vfProcess.Id)").CommandLine
    }
  } else {
    $diag.videofitProcess = @{
      running = $false
    }
  }

  # 2. Find IIS ASMX endpoints under C:\inetpub\wwwroot
  $wwwRoot = "C:\inetpub\wwwroot"
  if (Test-Path $wwwRoot) {
    $asmxFiles = Get-ChildItem -Path $wwwRoot -Filter "*.asmx" -Recurse -ErrorAction SilentlyContinue
    $diag.iisEndpoints = $asmxFiles | ForEach-Object {
      $relativePath = $_.FullName.Replace($wwwRoot, "").Replace("\", "/")
      if (-not $relativePath.StartsWith("/")) { $relativePath = "/" + $relativePath }
      $relativePath
    }
  }

  # 3. Find recent file writes (last 5 minutes) in ProgramData/AppData/Snap directories
  $cutoffTime = (Get-Date).AddMinutes(-5)
  $searchPaths = @(
    "$env:ProgramData",
    "$env:AppData",
    "$env:ProgramData\Snap",
    "$env:AppData\Snap"
  )

  foreach ($searchPath in $searchPaths) {
    if (Test-Path $searchPath) {
      Get-ChildItem -Path $searchPath -Recurse -File -ErrorAction SilentlyContinue | 
        Where-Object { 
          $_.LastWriteTime -gt $cutoffTime -and (
            $_.Extension -match "\.(db|mdb|accdb|sqlite|sqlite3)$" -or
            $_.FullName -match "videofit" -or
            $_.FullName -match "snap"
          )
        } | ForEach-Object {
          $diag.recentFiles += $_.FullName
        }
    }
  }

  return $diag
}
```

### POST Diagnostics to Server:

```powershell
function SendDiagnostics {
  param($diagnostics)
  
  $body = $diagnostics | ConvertTo-Json -Depth 10

  try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/internal/anpr/videofit/diagnostics?tenantId=$tenantId" `
      -Method POST `
      -Headers @{ 
        "Authorization" = "Bearer $relayToken"
        "Content-Type" = "application/json" 
      } `
      -Body $body

    Write-Host "[relay] Diagnostics sent successfully"
    return $true
  } catch {
    Write-Host ("[relay] Failed to send diagnostics: " + $_.Exception.Message)
    return $false
  }
}
```

### Usage in Relay Loop:

```powershell
# Collect and send diagnostics every 5 minutes (or on demand)
$lastDiagnostics = Get-Date
$diagnosticsInterval = New-TimeSpan -Minutes 5

while ($true) {
  # ... existing polling logic ...
  
  # Send diagnostics periodically
  if ((Get-Date) - $lastDiagnostics -gt $diagnosticsInterval) {
    $diag = CollectVideofitDiagnostics
    SendDiagnostics -diagnostics $diag
    $lastDiagnostics = Get-Date
  }
  
  Start-Sleep -Seconds 60
}
```

**Note:** The admin UI "Verify Test Vehicle" button retrieves the most recent diagnostics from the server. The relay script should POST diagnostics periodically or on-demand.
