# Ingest Canary (Cloudflare Email Routing + Worker + /api/ingest/email)

Proves the inbound booking email path is alive: **Email Routing → Worker → POST /api/ingest/email → Supabase**. No manual inbox checks; no emails to personal inbox.

## Setup

### 1. Cloudflare Email Routing

- **Address:** `canary-bookings@myparkingchannel.app`
- **Action:** Send to a Worker → **parking-channel-email-ingest**
- Do **not** forward canary to Gmail or elsewhere; the proof is `ingest_emails` + `ingest_canary_runs`.

### 2. Cron (cron-job.org)

- **cron-job.org** must call **POST** `https://yourdomain.com/api/internal/cron/ingest-canary` with header **`Authorization: Bearer <INTERNAL_CRON_KEY>`**.
- **Recommended schedule:** every **15 minutes**.
- **Canary is considered down** if not received within **10 minutes** (next run marks `status = 'down'`).

### 3. Expected behaviour

- Each run inserts a row in **`ingest_canary_runs`** with `status = 'sent'`.
- A canary email is sent **to** `canary-bookings@myparkingchannel.app` (subject `[CANARY] cloudflare-ingest token=<token>`).
- Cloudflare routes it to the Worker; the Worker POSTs to `/api/ingest/email`.
- The ingest route writes the email to **`ingest_emails`** and updates **`ingest_canary_runs`**: `received_at = now()`, `status = 'received'`.
- If a run is not received within 10 minutes, the next cron run marks it `status = 'down'` and `last_error = 'canary not received within 10 minutes'`.

## Admin banner

- **Health:** `GET /api/admin/ingest-canary/health` (same auth as other admin health; tenant admin/owner).
- **Banner:** Rendered at the top of the admin shell. Red when status is **down**; optional yellow “canary not run yet” for platform admins when status is **unknown**.

## Tables

- **`ingest_canary_runs`:** `id`, `token`, `sent_at`, `received_at`, `status` (`sent` | `received` | `down`), `last_error`, `created_at`, `updated_at`.
- RLS: SELECT for platform admins; INSERT/UPDATE only via service role (cron and ingest route).

---

## Manual test plan

### 1. Trigger canary (POST with auth)

**PowerShell:**
```powershell
$key = $env:INTERNAL_CRON_KEY   # or set manually
Invoke-RestMethod -Uri "https://yourdomain.com/api/internal/cron/ingest-canary" -Method POST -Headers @{ "Authorization" = "Bearer $key" }
```

**curl:**
```bash
curl -X POST "https://yourdomain.com/api/internal/cron/ingest-canary" \
  -H "Authorization: Bearer YOUR_INTERNAL_CRON_KEY"
```

Expected: `200` with JSON like `{ "ok": true, "token": "ingest-YYYYMMDD-HHMM-xxxxxx", "previousMarkedDown": false }`.

### 2. Ping (GET, no auth)

**PowerShell:**
```powershell
Invoke-RestMethod -Uri "https://yourdomain.com/api/internal/cron/ingest-canary" -Method GET
```

**curl:**
```bash
curl "https://yourdomain.com/api/internal/cron/ingest-canary"
```

Expected: `200` with `{ "ok": true, "note": "use POST for real runs" }`.

### 3. Verify in database

**Latest canary run:**
```sql
SELECT id, token, sent_at, received_at, status, last_error, updated_at
FROM public.ingest_canary_runs
ORDER BY sent_at DESC
LIMIT 5;
```

**Count by status:**
```sql
SELECT status, COUNT(*) FROM public.ingest_canary_runs GROUP BY status;
```
