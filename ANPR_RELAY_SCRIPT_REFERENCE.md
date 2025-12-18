# ANPR Relay Script Reference

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
