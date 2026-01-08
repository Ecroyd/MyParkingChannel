# ANPR Relay Authentication & Endpoint Fixes - Summary

## Changes Made

### A) Relay Token Authentication ✅
- **Confirmed:** Server uses SHA256 hashing (matches `hashRelayToken` in `src/lib/anpr/relayAuth.ts`)
- **Confirmed:** `assertRelayAuth` in `src/lib/anpr/auth.ts` correctly:
  1. Extracts token from `x-relay-token` header
  2. Hashes it using SHA256
  3. Compares to `anpr_sites.relay_token_hash` (case-insensitive)
  4. Checks if site is enabled

### B) Endpoint Contract ✅
**Updated:** `POST /api/anpr/events` now accepts:
- **No query parameters** - `tenantId` moved to request body
- **Request body:**
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
- **Headers:** `x-relay-token: <raw token>`

### C) Config Documentation ✅
**Updated:** `SNAP_ANPR_RELAY_README.md` now clearly states:
- `relayToken` must be the **raw token** (64 hex chars), NOT the hash
- Raw token only stored in config file on ANPR PC, never in database
- Only SHA256 hash stored in `anpr_sites.relay_token_hash`

### D) Token Rotation ✅
**Already implemented:**
- Endpoint: `POST /api/internal/anpr/rotate-token`
- UI: `/admin/settings/anpr` has "Generate New Relay Token" button
- Flow:
  1. Generates 32-byte random token (64 hex chars)
  2. Hashes with SHA256
  3. Stores hash in `anpr_sites.relay_token_hash`
  4. Returns raw token ONCE in response
  5. UI displays token with copy button and warning: "Copy this token now - it will not be shown again!"

### E) Relay Script Improvements ✅
**Updated:** `snap-anpr-ingest.ps1`:
- Posts to `${apiBaseUrl}/api/anpr/events` (no query string)
- Sends `x-relay-token` header with raw token
- Request body matches new contract (camelCase fields)
- Clear error message for 401/403: "AUTH FAILED – check raw relay token in config file"

## Files Modified

1. **`src/app/api/anpr/events/route.ts`**
   - Changed from query param `tenantId` to body field
   - Updated field names to match contract (camelCase)
   - Updated variable names for clarity

2. **`snap-anpr-ingest.ps1`**
   - Updated API URL (removed query param)
   - Updated request body structure (camelCase fields)
   - Added clear auth error messages
   - Added support for `confidence` and `snapshotUrl` parameters

3. **`SNAP_ANPR_RELAY_README.md`**
   - Added "Getting Your Relay Token" section
   - Clarified raw token vs hash
   - Updated API contract documentation
   - Improved troubleshooting section

## Verification Checklist

- [x] Server hashes provided token with SHA256
- [x] Server compares hash to `anpr_sites.relay_token_hash`
- [x] Endpoint accepts `tenantId` in body (not query)
- [x] Relay script sends correct contract
- [x] README documents raw token requirement
- [x] Token rotation UI shows token once with copy button
- [x] Clear auth error messages in relay script

## Testing

To test the relay:
1. Generate token in admin UI (`/admin/settings/anpr`)
2. Copy raw token to `C:\ParkingChannel\snap-anpr-ingest.json`
3. Run script: `.\snap-anpr-ingest.ps1 -Mode watch`
4. Verify events appear in `/admin/anpr/events`

If you get 401 errors:
- Check that token in config is the raw token (64 hex chars)
- Verify token was copied correctly from admin UI
- Ensure `anpr_sites.enabled = true`

