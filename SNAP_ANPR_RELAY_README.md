# Snap/Videofit ANPR Relay for Parking Channel

This PowerShell script watches Snap/Videofit recognition log folders and automatically posts ANPR events to your Parking Channel SaaS.

## Setup

1. **Create the config directory:**
   ```powershell
   New-Item -ItemType Directory -Path "C:\ParkingChannel" -Force
   ```

2. **Copy the example config file:**
   ```powershell
   Copy-Item snap-anpr-ingest.json.example C:\ParkingChannel\snap-anpr-ingest.json
   ```

3. **Edit the config file** (`C:\ParkingChannel\snap-anpr-ingest.json`):
   - Set `tenantId` to your tenant UUID
   - Set `siteId` to your `anpr_sites.id` (or `null` if not using)
   - Set `apiBaseUrl` to your Parking Channel domain (e.g., `https://myparkingchannel.app`)
   - Set `relayToken` to the **raw relay token** (see "Getting Your Relay Token" below)
   - Verify `recognitionLogRoot` points to your Snap recognition log folder
   - Verify `vehiclesOnSiteFile` points to your vehicles on site file (optional, not currently used)

   **⚠️ IMPORTANT:** The `relayToken` must be the **raw token string** (a secret), NOT the hash. The raw token is only stored in this config file on the ANPR PC - never in the database. Only the SHA256 hash is stored in `anpr_sites.relay_token_hash`.

4. **Copy the script:**
   ```powershell
   Copy-Item snap-anpr-ingest.ps1 C:\ParkingChannel\snap-anpr-ingest.ps1
   ```

## Usage

### Watch Mode (Real-time, Recommended)
Uses FileSystemWatcher to monitor folders in real-time:
```powershell
C:\ParkingChannel\snap-anpr-ingest.ps1 -Mode watch
```

### Scan Mode (Scheduled)
Scans the most recent Day folder every minute (use if FileSystemWatcher is unreliable):
```powershell
C:\ParkingChannel\snap-anpr-ingest.ps1 -Mode scan
```

### Custom Config Path
```powershell
C:\ParkingChannel\snap-anpr-ingest.ps1 -ConfigPath "D:\Custom\config.json" -Mode watch
```

## Getting Your Relay Token

1. **In Parking Channel Admin UI:**
   - Navigate to **Settings → ANPR Relay** (or `/admin/settings/anpr`)
   - Click **"Generate Token"** or **"Rotate Token"** button
   - **Copy the token immediately** - it will only be shown once!
   - The token is a 64-character hexadecimal string (e.g., `a1b2c3d4e5f6...`)

2. **Paste into config file:**
   - Open `C:\ParkingChannel\snap-anpr-ingest.json`
   - Paste the raw token into the `relayToken` field
   - Save the file

**Security Note:** The raw token is a secret. Only the SHA256 hash is stored in the database (`anpr_sites.relay_token_hash`). The server hashes the token you send and compares it to the stored hash.

## How It Works

1. **File Watching/Scanning:**
   - **Watch mode:** Monitors `recognitionLogRoot` for new `.vrn` files using FileSystemWatcher
   - **Scan mode:** Scans the most recent `DirDayYYYYMMDD\DayYYYYMMDD` folder every minute

2. **Filename Parsing:**
   - Extracts plate number from filename (e.g., `WK25OJV` from `logvr20260108T040614...WK25OJV...vrn`)
   - Extracts timestamp from filename pattern `YYYYMMDDTHHMMSS`
   - Falls back to file modification time if timestamp can't be parsed

3. **Deduplication:**
   - Maintains a state file (`snap-anpr-ingest-state.json`) with processed file paths
   - Prevents double-posting if FileSystemWatcher fires multiple times
   - Keeps last 1000 processed files in memory

4. **API Posting:**
   - Posts to `POST /api/anpr/events` (no query parameters)
   - Uses `x-relay-token` header with the **raw token** for authentication
   - Request body:
     ```json
     {
       "tenantId": "<uuid>",
       "siteId": "<uuid|null>",
       "cameraId": "<string|null>",
       "direction": "in|out|unknown",
       "eventAt": "<ISO 8601 timestamp>",
       "plateRaw": "<string>",
       "confidence": null,
       "snapshotUrl": null
     }
     ```
   - Server hashes the provided token using SHA256 and compares to `anpr_sites.relay_token_hash`

5. **Direction Mapping:**
   - Defaults to `"unknown"` - Parking Channel will map camera to direction using `tenant_anpr_config.camera_direction_map`

## Logs

The script logs to console with timestamps:
- **Cyan:** Processing files, posting events
- **Green:** Success messages
- **Yellow:** Warnings (missing plate/timestamp, etc.)
- **Red:** Errors (API failures, missing folders)
- **Gray:** Info messages

## State File

The state file (`snap-anpr-ingest-state.json`) is stored in the same directory as the config file. It contains:
- `processedFiles`: Array of processed file paths (normalized, lowercase)
- `lastProcessedTime`: Not currently used, reserved for future use

## Troubleshooting

**"Config file not found":**
- Ensure the config file exists at the specified path
- Check file permissions

**"Recognition log root not found":**
- Verify `recognitionLogRoot` in config points to the correct Snap folder
- Check folder permissions

**"No Day folders found":**
- Snap may not have created any recognition logs yet
- Check that Snap is running and generating logs

**"Could not extract plate from filename":**
- Filename format may differ from expected pattern
- Check the actual filename format and adjust regex in `Parse-VrnFilename` if needed

**API errors:**
- **401/403 errors:** "AUTH FAILED – check raw relay token"
  - Verify `relayToken` in config is the **raw token** (64 hex chars), not the hash
  - Ensure you copied the token correctly from the admin UI
  - If token was rotated, update the config file with the new token
  - Check that `anpr_sites.enabled = true` in the database
- **400 errors:** Check that `tenantId` is correct and matches your tenant UUID
- **Network errors:** Ensure `apiBaseUrl` is correct and accessible from the ANPR PC
- **Other errors:** Check the error message in the console logs

## Running as a Service

To run continuously, you can:
1. Use Task Scheduler to run the script at startup
2. Use a service wrapper like NSSM (Non-Sucking Service Manager)
3. Use PowerShell's `Start-Process` with `-WindowStyle Hidden` in a scheduled task

Example Task Scheduler command:
```
powershell.exe -ExecutionPolicy Bypass -File "C:\ParkingChannel\snap-anpr-ingest.ps1" -Mode watch
```

