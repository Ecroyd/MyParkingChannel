# ANPR Relay API Examples

## Authentication

All internal API endpoints use the `x-relay-token` header for authentication. The token is a 64-character hex string generated in the admin UI.

## PowerShell Example

```powershell
# Configuration
$baseUrl = "https://your-parking-channel-domain.com"
$tenantId = "your-tenant-uuid"
$relayToken = "your-64-char-hex-token-from-admin-ui"

# Headers
$headers = @{
    "x-relay-token" = $relayToken
}

# 1. Get outbox items (non-destructive - just reads, doesn't mark as processing)
$outboxResponse = Invoke-RestMethod -Uri "$baseUrl/api/internal/anpr/outbox?tenantId=$tenantId&limit=100" `
    -Method GET `
    -Headers $headers

Write-Host "Found $($outboxResponse.count) outbox items"

# Process each item...
foreach ($item in $outboxResponse.items) {
    Write-Host "Processing: $($item.plate) - $($item.action)"
    # ... send to Videofit SOAP ...
    
    # After successful SOAP call, ACK the item
    $ackBody = @{
        tenantId = $tenantId
        outboxItemId = $item.id
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "$baseUrl/api/internal/anpr/ack" `
        -Method POST `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $ackBody
}

# 2. Get full snapshot (all vehicles from bookings)
$snapshotResponse = Invoke-RestMethod -Uri "$baseUrl/api/internal/anpr/snapshot?tenantId=$tenantId" `
    -Method GET `
    -Headers $headers

Write-Host "Snapshot contains $($snapshotResponse.count) vehicles"
foreach ($vehicle in $snapshotResponse.items) {
    Write-Host "$($vehicle.plate) - Group $($vehicle.group) - Valid: $($vehicle.valid_from) to $($vehicle.valid_to)"
}
```

## cURL Examples

### Get Outbox Items
```bash
curl -X GET \
  "https://your-domain.com/api/internal/anpr/outbox?tenantId=YOUR_TENANT_ID&limit=100" \
  -H "x-relay-token: YOUR_RELAY_TOKEN"
```

### Acknowledge Item
```bash
curl -X POST \
  "https://your-domain.com/api/internal/anpr/ack" \
  -H "x-relay-token: YOUR_RELAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "YOUR_TENANT_ID",
    "outboxItemId": "OUTBOX_ITEM_UUID"
  }'
```

### Get Snapshot
```bash
curl -X GET \
  "https://your-domain.com/api/internal/anpr/snapshot?tenantId=YOUR_TENANT_ID" \
  -H "x-relay-token: YOUR_RELAY_TOKEN"
```

## Response Formats

### Outbox Response
```json
{
  "ok": true,
  "items": [
    {
      "id": "uuid",
      "plate": "ABC123",
      "group": 4,
      "validFrom": "2025-01-20T10:00:00Z",
      "validUntil": "2025-01-21T18:00:00Z",
      "action": "upsert",
      "createdAt": "2025-01-20T09:00:00Z",
      "retryCount": 0,
      "type": null,
      "reason": null
    }
  ],
  "count": 1
}
```

### Snapshot Response
```json
{
  "ok": true,
  "items": [
    {
      "id": "booking-uuid",
      "plate": "ABC123",
      "group": 4,
      "valid_from": "2025-01-20T10:00:00Z",
      "valid_to": "2025-01-21T18:00:00Z"
    }
  ],
  "count": 1
}
```

### ACK Response
```json
{
  "success": true,
  "message": "Item acknowledged"
}
```

## Important Notes

1. **Non-Destructive Outbox**: The outbox endpoint does NOT mark items as processing. You must ACK items after successful SOAP processing.

2. **Token Security**: The relay token is only shown once when generated. Store it securely - it cannot be retrieved again.

3. **Snapshot Logic**: The snapshot includes:
   - Vehicles currently on site (checked_in_at set, checked_out_at null)
   - Upcoming bookings within `include_upcoming_hours`
   - Recent bookings within `grace_after_end_hours` after end time

4. **Error Handling**: All endpoints return standard HTTP status codes:
   - 200: Success
   - 400: Bad request (missing parameters)
   - 401: Invalid or missing relay token
   - 403: Site not enabled
   - 404: Resource not found
   - 500: Server error

