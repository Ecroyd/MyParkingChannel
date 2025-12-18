# ANPR Relay Script Reference

## Certificate Validation Callback Fix

In the `VideofitBulkUpdate` function, replace the certificate callback assignment with this version:

### OLD (Problematic):
```powershell
$oldCb = [System.Net.ServicePointManager]::ServerCertificateValidationCallback
[System.Net.ServicePointManager]::ServerCertificateValidationCallback =
  New-Object System.Net.Security.RemoteCertificateValidationCallback([PcRelayCert]::TrustAll)
```

### NEW (Fixed):
```powershell
$oldCb = [System.Net.ServicePointManager]::ServerCertificateValidationCallback
$cb = [System.Net.Security.RemoteCertificateValidationCallback]{
  param($sender, $cert, $chain, $errors)
  return $true
}
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = $cb
```

### Restore (Keep as-is):
```powershell
finally {
  [System.Net.ServicePointManager]::ServerCertificateValidationCallback = $oldCb
}
```

**Why this works:** PowerShell 5.1 can directly cast a scriptblock to the delegate type when the signature matches. The earlier `New-Object ... (method group)` overload is what's failing. This callback is scoped and created in the same runspace right before the Videofit call, and we restore immediately after.

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

## Complete Flow Example

```powershell
# 1. Poll for items
$response = Invoke-RestMethod -Uri "$baseUrl/api/internal/anpr/outbox?tenantId=$tenantId" `
    -Method GET `
    -Headers @{ "Authorization" = "Bearer $relayToken" }

# 2. Process each item
$processedIds = @()
$allSuccess = $true

foreach ($item in $response.items) {
    try {
        # Send to Videofit
        Send-VideofitBulkUpdate -Item $item
        
        $processedIds += $item.id
    } catch {
        Write-Error "Failed to process item $($item.id): $_"
        $allSuccess = $false
    }
}

# 3. ACK all processed items
if ($processedIds.Count -gt 0) {
    $ackBody = @{
        itemIds = $processedIds
        success = $allSuccess
    } | ConvertTo-Json

    Invoke-RestMethod -Uri "$baseUrl/api/internal/anpr/outbox/ack?tenantId=$tenantId" `
        -Method POST `
        -Headers @{ "Authorization" = "Bearer $relayToken"; "Content-Type" = "application/json" } `
        -Body $ackBody
}
```
