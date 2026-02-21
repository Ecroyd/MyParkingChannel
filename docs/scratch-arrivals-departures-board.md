# Arrivals / Departures Board — File & API Reference

## Board UI component(s)

| Role | File path |
|------|-----------|
| **Main Today board (Arrivals & Departures)** | `src/app/admin/today-server/TodayServerClient.tsx` |
| **Today page (server wrapper, fetches initial data)** | `src/app/admin/today-server/page.tsx` |
| **Dashboard arrivals/departures cards** | `src/app/admin/dashboard-server/DashboardClient.tsx` |
| **Dashboard page (server, fetches today arrivals/departures)** | `src/app/admin/dashboard-server/page.tsx` |
| **Legacy Arrivals table** | `src/components/admin/ArrivalsTable.tsx` |
| **Legacy Departures table** | `src/components/admin/DeparturesTable.tsx` |
| **Flights today (links to today-server)** | `src/app/admin/_components/FlightsToday.tsx` |
| **Key Report (Take Key / Arrived & Key Taken)** | `src/app/admin/key-report/KeyReportClient.tsx` |

---

## API route(s) that fetch today’s bookings

| Purpose | Method | File path |
|---------|--------|-----------|
| **Today board data (arrivals, departures, currently parked, KPIs)** | GET | `src/app/api/admin/today/route.ts` — query params: `from`, `to` |
| **Today summary** | GET | `src/app/api/admin/today/summary/route.ts` |
| **Legacy arrivals** | GET | `src/app/api/admin/today/arrivals/route.ts` — used by `ArrivalsTable` |
| **Legacy departures** | GET | `src/app/api/admin/today/departures/route.ts` — used by `DeparturesTable` |
| **Key Report (Take Key / Arrived & Key Taken)** | GET | `src/app/api/admin/key-report/route.ts` — query params: `tab`, `from`, `to` |

Note: The main Today board gets initial data from the **server page** `today-server/page.tsx` (Supabase queries for arrivals/departures/overlapping). Client refetch uses **`/api/admin/today?from=&to=`** in `TodayServerClient.tsx`.

---

## API route(s) that update booking status from dropdowns

| Purpose | Method | File path |
|---------|--------|-----------|
| **Gate status dropdown (Arrived / No Show / Take Key / Arrived & Key Taken / Departed)** | PATCH | `src/app/api/admin/bookings/[id]/gate-status/route.ts` — body: `{ gateStatus }` |
| **Ops status (alternative/legacy)** | PATCH | `src/app/api/admin/bookings/[id]/ops-status/route.ts` — body: `{ opsStatus }` |

The Today board uses **gate-status** only; dropdown calls `PATCH /api/admin/bookings/${booking.id}/gate-status` with `gateStatus` (see `TodayServerClient.tsx` ~563).

---

## Export endpoint(s) (CSV / accounting)

| Purpose | How | File path / notes |
|---------|-----|-------------------|
| **Key Report CSV** | Client-side export (no dedicated API) | `src/app/admin/key-report/KeyReportClient.tsx` — `exportCsv()` builds CSV from data already fetched from `GET /api/admin/key-report` and triggers download (`key-report-${tab}-${from}-${to}.csv`). |
| **Accounting / other CSV** | No separate “accounting export” route found; Key Report is the only CSV export located for today/keys. | — |

---

## Enums / types representing status

| File path | Contents |
|-----------|----------|
| `src/lib/gateStatus.ts` | `GATE_STATUS`: `none`, `arrived`, `no_show`, `take_key`, `arrived_key_taken`, `departed`; `GATE_STATUS_OPTIONS`; `gateStatusLabel()`, `gateStatusPillClass()`, `isKeyGateStatus()` |
| `src/lib/opsStatuses.ts` | `OPS_STATUS`: `arrived`, `no_show`, `take_key`, `arrived_key_taken`, `departed`; `OPS_STATUS_LABELS`; `ARRIVALS_OPS_OPTIONS`, `DEPARTURES_OPS_OPTIONS`, `DEPARTURES_EXCLUDED_OPS_STATUSES`; `GATE_STATUS` (reserved/arrived/departed/cancelled); `STATUS_UI` (label + pill class) |
| `src/types/bookings.ts` | `Booking` interface includes `gate_status?: string | null`; `BookingHighlightCode` |
| **DB / API** | `gate-status` route validates: `reserved`, `arrived`, `departed`, `cancelled`, `no_show`, `take_key`, `arrived_key_taken` |

---

## Quick reference

- **Board UI:** `src/app/admin/today-server/TodayServerClient.tsx`
- **Fetch today data:** `src/app/api/admin/today/route.ts` (client refetch), `src/app/admin/today-server/page.tsx` (initial server fetch)
- **Status update:** `src/app/api/admin/bookings/[id]/gate-status/route.ts` (PATCH)
- **Export:** Key Report CSV built in `src/app/admin/key-report/KeyReportClient.tsx`; data from `src/app/api/admin/key-report/route.ts`
- **Status enums:** `src/lib/gateStatus.ts`, `src/lib/opsStatuses.ts`
