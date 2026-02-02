# Cloudflare Inbound Email Ingest + Cron Scheduler Audit Report

**Date:** 2025-02-02  
**Scope:** Ingest endpoints, cron endpoints, pipeline health/banners. No implementation changes.

---

## STEP A — Cloudflare Ingest Endpoints and Secrets

### 1. Search results (file paths)

| Search term | Matches |
|-------------|--------|
| `x-ingest-secret` | `src/app/api/ingest/email/route.ts`, `cloudflare-worker-*.js` (3 files) |
| `INGEST_SECRET` | `src/app/api/ingest/email/route.ts`, `src/app/api/internal/email/process/route.ts`, `cloudflare-worker-*.js`, `env.example` |
| `INGEST_URL` | `cloudflare-worker-simple-raw.js`, `cloudflare-worker-email-ingest-fixed.js`, `cloudflare-worker-email-ingest.js` (Worker env; not in `env.example`) |
| `/api/webhooks` | `EMAIL_QUEUE_SYSTEM_README.md` (Resend), `README.md` (ParkVia, Holiday Extras). Inbound **email** ingest is **not** under `/api/webhooks`; it uses `/api/ingest/email`. |
| `email_ingest` | `src/app/api/internal/email/process/route.ts` (body param `email_ingest_id`) |
| `cloudflare` | Worker files (3), `env.example` (comment) |
| `message.raw` | All three Cloudflare Worker files |
| `raw_rfc822_base64` | `src/app/api/ingest/email/route.ts`, `src/app/api/internal/email/process/route.ts`, Worker files |

### 2. Router and handler path

- **Router:** App Router (`src/app/api/...`).
- **Handler that receives the Worker POST:**  
  **`/api/ingest/email`**  
  Implemented in: `src/app/api/ingest/email/route.ts` (POST only).

### 3. Ingest handler documentation

| Item | Details |
|------|--------|
| **Ingest handler URL** | `POST /api/ingest/email` |
| **Auth** | Header: `x-ingest-secret`. Env: `INGEST_SECRET`. Rejected with 401 if header ≠ env (or 500 if env missing). |
| **Tables written** | **`ingest_emails`** (main row: `received_at`, `to_address`, `from_address`, `subject`, `message_id`, `raw_rfc822_base64`, `sha256`, `status: "received"`). **`ingest_email_files`** (per attachment: `email_id`, `filename`, `content_type`, `file_size`, `storage_bucket`, `storage_path`, `parse_status`, etc.). Storage bucket **`email-imports`** (Supabase Storage). |
| **Failure / ingest log** | No dedicated **ingest log** or **ingest_failures** table. Failures are: (1) returned in JSON (401, 400, 500), (2) logged via `console.error` in the route, (3) duplicates handled with 200 + `deduped: true` and no separate log row. |

**Worker → app:** Workers use `env.INGEST_URL` (e.g. `https://yourdomain.com/api/ingest/email`) and send `x-ingest-secret: env.INGEST_SECRET` and body with `raw_rfc822_base64` (and optional attachments).

---

## STEP B — Existing Cron Endpoints

### 1. Search results

- **`/api/internal/cron`:** `src/app/api/internal/cron/email-sender/route.ts`
- **`INTERNAL_CRON_KEY`:** `src/app/api/internal/cron/email-sender/route.ts`, `src/app/api/internal/suppliers/cavu/sync/route.ts`, `EMAIL_QUEUE_SYSTEM_README.md`
- **`Authorization: Bearer`:** `email-sender` route, Cavu **sync** route (not Cavu **cron** route)
- **`sendDueEmails`:** `src/lib/email/emailService.ts`, `src/app/api/internal/cron/email-sender/route.ts`, `EMAIL_QUEUE_SYSTEM_README.md`

### 2. Cron endpoints (path + purpose)

| Path | Method | Purpose | Auth |
|------|--------|--------|------|
| `/api/internal/cron/email-sender` | POST, GET | Send queued emails (`sendDueEmails`), run email failure/bounce alerts | **`Authorization: Bearer ${INTERNAL_CRON_KEY}`** |
| `/api/internal/suppliers/cavu/cron` | GET, POST | CAVU supplier sync (events/bookings); supports QStash | **None in code** |
| `/api/internal/suppliers/cavu/sync` | GET | CAVU sync for a single tenant (`?tenantId=`) | **`Authorization: Bearer ${INTERNAL_CRON_KEY}`** |
| `/api/cron/pull-parkvia` | GET | Pull ParkVia channel data for enabled accounts | **None in code** |
| `/api/cron/pull-holidayextras` | GET | Pull Holiday Extras data | **None in code** |
| `/api/admin/jobs/aph/export` | GET | APH SFTP rate export for enabled channels | **`x-cron-secret`** header, env **`CRON_SECRET`** |

### 3. Cron auth summary

- **Email sender:** Auth enforced: `Authorization: Bearer ${INTERNAL_CRON_KEY}`; key must be set.
- **Cavu cron:** No auth check in route; relies on URL secrecy / external scheduler (e.g. QStash).
- **Cavu sync:** Auth enforced: `Authorization: Bearer ${INTERNAL_CRON_KEY}`.
- **ParkVia / Holiday Extras cron:** No auth in code.
- **APH export:** Auth enforced: `x-cron-secret` header must equal `CRON_SECRET`.

### 4. External scheduler references

- **Docs/env:** Only **Vercel Cron** is referenced (`vercel.json` crons in `README.md` and `EMAIL_QUEUE_SYSTEM_README.md`). No references to cron-job.org, healthchecks.io, or Uptime Robot in the repo.
- **`env.example`:** No `INGEST_URL`; has `INGEST_SECRET`. No cron-related URL or scheduler service vars.

---

## STEP C — Pipeline Health and Banners

### 1. Search results

- **`tenant_pipeline_health` / `pipeline_health`:** No matches.
- **`health status`:** Only in generic UI/booking copy, not tenant pipeline.
- **Banner:** Admin layout renders **`EmailParseFailureBanner`** and **`CavuSyncHealthBanner`** in `src/components/admin-shell-client.tsx` (lines 110–111).
- **Alert + tenant:** Alert routes, Ops emails, CAVU sync alerts (tenant-scoped); no “pipeline health” table.

### 2. Where banners are rendered and data sources

| Location | What’s rendered | Data source |
|----------|------------------|-------------|
| **Admin shell** (`src/components/admin-shell-client.tsx`) | Two banners above main content: (1) `EmailParseFailureBanner`, (2) `CavuSyncHealthBanner` | (1) **`/api/admin/email-parse/health`** → `ingest_email_files` + `ingest_emails` (failed/stuck pending/empty parsed). (2) **`/api/admin/cavu/sync-health`** → CAVU sync runs/status. |

**Existing health/banner pattern:**  
Banners are tenant-aware (email-parse health filtered by email→tenant mapping; CAVU is tenant/supplier). There is **no** `tenant_pipeline_health` or `pipeline_health` table; health is derived from existing tables (`ingest_email_files`, `ingest_emails`, CAVU sync state).

---

## Summary Table

| Area | Finding |
|------|--------|
| **Ingest path** | `POST /api/ingest/email` (App Router) |
| **Ingest auth** | Header `x-ingest-secret`, env `INGEST_SECRET` |
| **Tables written by ingest** | `ingest_emails`, `ingest_email_files`; bucket `email-imports` |
| **Ingest log table** | None; failures only in response JSON + console |
| **Cron endpoints** | 6 found (email-sender, Cavu cron, Cavu sync, ParkVia, Holiday Extras, APH export); only email-sender, Cavu sync, and APH export enforce auth |
| **External scheduler** | Only Vercel Cron in docs; no third-party scheduler in env/docs |
| **Health/banners** | Email parse failure + CAVU sync health banners in admin shell; no pipeline_health table |

---

## Recommendation: Minimal change plan for canary integration

1. **Ingest**
   - Keep using **`/api/ingest/email`** and **`x-ingest-secret`** / **`INGEST_SECRET`**. No new ingest URL needed for canary.
   - Optional: add an **ingest log** (or **ingest_failures**) table and write failed/auth-failed requests for canary monitoring; today you can still infer from Vercel/server logs and 401/400/500 responses.

2. **Cron**
   - Use **`INTERNAL_CRON_KEY`** and **`Authorization: Bearer`** for any new canary cron (same as `/api/internal/cron/email-sender`).
   - New canary job can live under **`/api/internal/cron/...`** (e.g. `/api/internal/cron/canary` or `/api/internal/cron/health`) and share the same auth.
   - No need to introduce cron-job.org/healthchecks.io unless you want external pings; Vercel Cron is already the documented scheduler.

3. **Health/banners**
   - Reuse the existing pattern: a **banner component** in **`admin-shell-client.tsx`** that fetches a **health API** (e.g. `/api/admin/email-parse/health` or a new `/api/admin/.../health`). No `tenant_pipeline_health` table is required unless you want a materialized health store; current approach is “derive from existing tables + optional new health endpoint.”

4. **Canary**
   - Add a small **canary route** (e.g. POST that accepts a payload, validates a shared secret or `INTERNAL_CRON_KEY`, and writes a row to a **canary_log** or **ingest_log** table and returns 200). Worker or external cron hits this after sending to `/api/ingest/email` so you can confirm “ingest path + cron” without changing existing ingest contract or auth.

This keeps existing ingest URL, auth, and tables; reuses cron auth and banner patterns; and adds only the minimal canary endpoint (and optionally an ingest/canary log table) for observability.
