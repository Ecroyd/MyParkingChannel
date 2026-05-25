# Email ingest resilience

Inbound booking emails must never be lost because of a parser bug or a missing database column. The pipeline stores the raw message first, records failures visibly, and supports admin replay.

## Addresses

| Address | Purpose |
|---------|---------|
| `bookings@myparkingchannel.app` | Production booking ingest |
| `canary-bookings@myparkingchannel.app` | Canary / routing health checks (`[CANARY] token=…` in subject) |

Tenant routing uses `public.tenant_inbound_inboxes` (`to_address` → `tenant_id`). Do not rely on hardcoded tenant UUIDs in code; configure inboxes in the database.

## Flow

1. Cloudflare Email Worker POSTs to `/api/ingest/email` with `x-ingest-secret` and `raw_rfc822_base64`.
2. API inserts `public.ingest_emails` immediately (status `received`).
3. Parsing, staging, and booking writes run in a try/catch. On failure:
   - `ingest_emails.status` = `failed`, `error` set
   - `ingest_email_parses.parse_status` = `failed`, `parse_error` set
   - Alert via `supplier_sync_alerts` (when tenant known) and `system_health_status` (`email_ingest`)
4. HTTP still returns **200** after storage so Cloudflare does not drop the message.

## Send a canary email

1. Ensure ingest canary cron is enabled (see `INGEST_CANARY_README.md`).
2. Send to `canary-bookings@myparkingchannel.app` with subject containing `[CANARY] token=<token from ingest_canary_runs>`.
3. Check Admin → health banners or `GET /api/admin/ingest-canary/health`.

## Cloudflare logs

1. Cloudflare dashboard → Email Routing → your route → Worker.
2. Look for POST to `INGEST_URL` and response status (expect 200 when storage succeeds).
3. Worker logs: `email()` handler errors vs API `processing_ok: false` in JSON body.

## Query failed ingest in SQL

```sql
SELECT id, received_at, to_address, from_address, subject, status, error
FROM public.ingest_emails
WHERE status = 'failed'
  AND received_at > now() - interval '14 days'
ORDER BY received_at DESC
LIMIT 50;
```

With latest parse row:

```sql
SELECT e.*, p.parse_status, p.parse_error, p.booking_reference_guess
FROM public.ingest_emails e
LEFT JOIN public.ingest_email_parses p ON p.ingest_email_id = e.id
WHERE e.status = 'failed'
ORDER BY e.received_at DESC
LIMIT 20;
```

## Admin UI replay

1. Open **Admin → Bookings → Email Ingest Failures** (`/admin/email-ingest`).
2. **Reprocess** — replays one email from stored `raw_rfc822_base64`.
3. **Retry all failed (14d)** — batch replay; optional error text filter (e.g. `external_status`).

API equivalents (admin session required):

- `POST /api/admin/ingest-emails/reprocess` — body `{ "emailId": "<uuid>" }`
- `POST /api/admin/ingest-emails/reprocess-failed` — body `{ "days": 14, "errorContains": "optional" }`

## Schema health check

`GET /api/admin/health-snapshot` includes `ingestSchema` — probes required columns on `bookings`, `booking_import_staging`, `ingest_emails`, and `ingest_email_parses`.

If `ingestSchema.ok` is false, apply the missing migration in Supabase before expecting booking writes to succeed.

## Safe booking writes

`safeBookingUpsertPayload()` whitelists columns sent to `public.bookings`. Unknown fields fail with a clear error instead of breaking PostgREST schema cache for the whole request.

## Manual verification checklist

- [ ] POST ingest with valid secret → 200, row in `ingest_emails` with `raw_rfc822_base64` populated
- [ ] Simulate parser failure (e.g. remove inbox mapping) → 200, `status=failed`, row retained
- [ ] Admin reprocess → status moves to `parsed` or stays `failed` with updated error
- [ ] Health snapshot shows `ingestSchema.ok: true`
