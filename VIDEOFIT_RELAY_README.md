# Videofit Capture Relay

PowerShell script that polls Videofit SOAP service for ANPR capture events and forwards them to Parking Channel API.

## Setup

1. **Create configuration file**: Copy `config.example.json` to `C:\ParkingChannel\config.json` and fill in your values:

```json
{
  "parkingChannelBaseUrl": "https://your-parking-channel-domain.com",
  "tenantId": "your-tenant-uuid",
  "relayToken": "your-relay-token-from-tenant-secrets",
  "siteClientLicense": "your-videofit-license",
  "locPcNo": "your-location-pc-number",
  "defaultGroup": "default-group-name",
  "pollSeconds": 60,
  "videofitEndpoint": "http://localhost/Videofit/SendCaptureWebService.asmx"
}
```

2. **Get relay token**: 
   - Log into Parking Channel admin
   - Navigate to ANPR settings
   - Generate or view the relay token
   - Copy it to `config.json`

3. **Configure Videofit endpoint**:
   - Update `videofitEndpoint` in config.json with your actual Videofit SOAP endpoint URL
   - Or leave as placeholder and update the `Get-VideofitEndpoint` function in the script

## Running

```powershell
# Run the relay
.\videofit-capture-relay.ps1

# Or specify custom paths
.\videofit-capture-relay.ps1 -ConfigPath "C:\Custom\config.json" -CursorPath "C:\Custom\cursor.json" -QueuePath "C:\Custom\queue.jsonl"
```

## How It Works

1. **Polling**: Every `pollSeconds` (default 60), queries Videofit SOAP service for new captures since last cursor
2. **Queueing**: New captures are immediately written to `capture-outbox.jsonl` (one JSON object per line)
3. **Sending**: Processes queue oldest-first, sending to Parking Channel API
4. **Idempotency**: Server-side `event_hash` prevents duplicates - safe to retry
5. **Cursor**: Tracks `lastTimestamp` and `lastEventId` in `videofit-last.json`

## File Structure

- `config.json` - Configuration (tenant ID, tokens, endpoints)
- `videofit-last.json` - Cursor tracking (last processed timestamp/event ID)
- `capture-outbox.jsonl` - Queue file (one JSON capture per line)

## Customization

### SOAP Request Format

The script includes placeholder SOAP request structure. You'll need to:

1. **Check Videofit WSDL**: Get the correct method name and namespace
2. **Update SOAP body**: Adjust method name and parameters in `Poll-VideofitCaptures` function
3. **Update response parsing**: Adjust XPath in the same function to match Videofit response structure

Example places to update:
- Line ~100: SOAP envelope structure
- Line ~130: XPath for parsing captures (`//*[local-name()='Capture']`)
- Line ~140: Property extraction (EventId, Plate, OccurredAt, etc.)

### Direction Mapping

The script normalizes direction values. Update `Transform-Capture` function if Videofit uses different values:
- `"in"` / `"entry"` / `"arrival"` → `"in"`
- `"out"` / `"exit"` / `"departure"` → `"out"`

## Error Handling

- **Network errors**: Captures stay in queue for retry
- **Duplicate events**: Detected server-side, logged but not retried
- **Invalid captures**: Skipped with warning, not queued
- **SOAP errors**: Logged, polling continues

## Logging

The script logs:
- Poll timestamps
- Capture counts (polled, queued, sent, duplicates, errors)
- Individual send attempts with results
- Errors and warnings

## Running as Service

To run continuously:

1. **Windows Task Scheduler**: Create a scheduled task that runs the script
2. **PowerShell background job**: Use `Start-Job` or `Start-Process`
3. **Service wrapper**: Use NSSM (Non-Sucking Service Manager) or similar

Example Task Scheduler:
- Trigger: At startup + repeat every 1 minute
- Action: `powershell.exe -File "C:\ParkingChannel\videofit-capture-relay.ps1"`
- Run whether user is logged on or not

## Troubleshooting

**No captures being polled:**
- Check Videofit endpoint URL is correct
- Verify SOAP method name and parameters
- Check XPath matches actual response structure
- Review SOAP response in browser/Postman

**Captures queued but not sending:**
- Check `parkingChannelBaseUrl` is correct
- Verify `relayToken` is valid
- Check network connectivity
- Review error messages in console

**Duplicates:**
- Normal - server-side idempotency prevents actual duplicates
- Check `event_hash` computation matches server

**Queue growing:**
- Check API endpoint is reachable
- Verify authentication token
- Review error messages for specific failures


