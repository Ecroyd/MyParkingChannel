# Ops Board (Arrivals/Departures) — Audit Checklist

## A) UI rules currently present

### Conditional styling

- **Based on:** The board uses **`gate_status`** (and section) for styling. There are **no** `arrived_at`, `no_show_at`, `departed_at`, or `keys_taken_at` columns on the booking type in the UI; the app uses **`checked_in_at`** / **`checked_out_at`** only when updating after a status change (and in ExemptionsPanel for display).
- **Where:**
  - **Status pill (dropdown trigger):** `TodayServerClient.tsx` line 695 — `gateStatusPillClass(displayGateStatus)` from `@/lib/gateStatus`.
  - **Pill classes in code:** `src/lib/gateStatus.ts` lines 26–40 — `gateStatusPillClass()`:
    - `arrived` → green (`bg-green-100 text-green-900 border-green-200`)
    - `no_show` → red (`bg-red-200 text-black border-red-300`)
    - `take_key` / `arrived_key_taken` → yellow (`bg-yellow-200 ...`)
    - `departed` → slate
    - default → slate
  - **Row background by section:** `TodayServerClient.tsx` lines 549–555 — `rowClass`: arrivals `bg-blue-50/40`, departures `bg-green-50/40`.
  - **Key taken icon:** `TodayServerClient.tsx` lines 611–614 — amber key icon when `gate_status` is `take_key` or `arrived_key_taken` (or `highlight_code === 'key'`).
  - **Cancelled badge:** line 659 — `bg-red-100 text-red-800` for cancelled.
  - **Departures header:** lines 952–958 — green pill/count styling.
- **Not present:** No CSS classes named `noShow`, `arrived`, `departed`, `keyTaken`; styling is via Tailwind and `gateStatusPillClass()`. No UI logic that reads `arrived_at` / `no_show_at` / `departed_at` / `keys_taken_at` (those fields do not exist on bookings; ANPR internal uses `arrived_at`/`departed_at` in a different context).

**Summary:** Styling is driven by **`gate_status`** (and section + highlight/cancelled). Timestamp-based styling for arrived/no_show/departed/keys_taken is **not** implemented because the model uses **`gate_status`** + **`checked_in_at`** / **`checked_out_at`** (and **`ops_hidden`** for hide-from-list), not separate *_at columns for each status.

---

## B) Dropdown options

### Arrivals dropdown

- **Source:** `GATE_STATUS_OPTIONS` from `src/lib/gateStatus.ts` (lines 12–18), then filtered by section in `TodayServerClient.tsx` (lines 599–604).
- **When `section === 'arrivals'`:** no filter — all options are shown:
  - — Status — (none)
  - Arrived
  - No Show
  - Take Key
  - Arrived & Key Taken
  - Departed
- **Exact file/lines:** `TodayServerClient.tsx` 599–604 (`gateStatusOptions`), 700–704 (render). Options defined in `src/lib/gateStatus.ts` 12–18.

### Departures dropdown

- **When `section === 'departures'`:** options are filtered to **only** (lines 599–601):
  - — Status —
  - Departed
- **Exact file/lines:** `TodayServerClient.tsx` 599–602: `return GATE_STATUS_OPTIONS.filter((o) => o.value === GATE_STATUS.NONE || o.value === GATE_STATUS.DEPARTED)`.

**Summary:** Arrivals get all six options; departures get only "— Status —" and "Departed". No extra options in the departures dropdown.

---

## C) Departed behaviour

### Does selecting "Departed" remove the booking from the departures list?

- **Yes.** It is **filter-based**, not delete. The booking stays in the DB; it is hidden from the default departures list.
- **Back-end:** `src/app/api/admin/bookings/[id]/gate-status/route.ts` (lines 121–132): when `gateStatus === 'departed'`, the handler sets:
  - `checked_out_at: now`
  - `status: 'checked_out'`
  - `ops_hidden: true`, `ops_hidden_reason: 'departed'`, `ops_hidden_at`, `ops_hidden_by`
- **Front-end filter:** `TodayServerClient.tsx` lines 278–283 — `visibleDepartures`:
  - First applies `applyStatusFilters(sortedDepartures)` (cancelled/ops_hidden/filter toggles).
  - Then, **unless** "Show hidden" is on, filters out rows where `gate_status === GATE_STATUS.DEPARTED`:  
    `return filtered.filter((b) => b.gate_status !== GATE_STATUS.DEPARTED)`.
- **"Show hidden"** (line 118): reveals departed (and no_show/cancelled) rows so staff can unhide if needed.

**Summary:** Departed is implemented as **soft-hide** (filter + `ops_hidden`). No row delete; no separate "history" table. Exact logic: **`TodayServerClient.tsx` 278–283** (departures filter), **`gate-status/route.ts` 121–132** (set departed + ops_hidden).

---

## D) Accounting export

### Where is the "accounting export" CSV?

- The only CSV export found for ops/today/key usage is the **Key Report** export. There is **no** separate route or page named "accounting export".
- **Key Report:**
  - **API:** `src/app/api/admin/key-report/route.ts` — GET, query params `tab`, `from`, `to`. Returns bookings with `gate_status === 'take_key'` or `'arrived_key_taken'`. Selected fields: `id, tenant_id, reference, customer_name, customer_email, plate, start_at, end_at, status, gate_status, highlight_code, created_at`. **No `source`, `external_source`, or agent-related field.**
  - **CSV build (client-side):** `src/app/admin/key-report/KeyReportClient.tsx` lines 70–87 — `exportCsv()`:
    - Headers: `['Reference', 'Customer', 'Email', 'Plate', 'Start', 'End', 'Status']`.
    - Rows from `bookings` (from the key-report API). **No agent/source column; no filter by agent.**

### Agent / source concept

- **Bookings table:** Has **`source`** (enum, e.g. direct, parkvia, holidayextras, cavu, manual, other) and **`external_source`** (text, e.g. "Holiday Extras Email Import"). Used in Bookings list and parsed-files UI for channel/source labels. **No `agent_id` or dedicated "agent" field** — "agent" appears only in **channels/pricing** (e.g. "agent" channel in `src/app/admin/channels/page.tsx`).
- **Key Report API** (line 35): `.select('id, tenant_id, reference, customer_name, customer_email, plate, start_at, end_at, status, gate_status, highlight_code, created_at')` — **does not** select `source` or `external_source`.

**Summary:**  
- **Accounting export:** Only the Key Report CSV exists; no separate "accounting export" route.  
- **Agent data:** Key Report CSV **does not** include agent/source; the key-report API does not return `source` or `external_source`.  
- **Filter by agent:** Not supported in Key Report (no agent/source filter).  
- **Field for "agent"/channel:** Use **`bookings.source`** and/or **`bookings.external_source`**; there is no dedicated agent_id.

---

## Summary table

| Item | Implemented | File(s) / lines |
|------|-------------|------------------|
| Styling by gate_status (arrived=green, no_show=red, key=yellow, departed=slate) | Yes | `gateStatus.ts` 26–40; `TodayServerClient.tsx` 695, 549–555, 611–614 |
| Styling by arrived_at / no_show_at / departed_at / keys_taken_at | No (no such columns; uses gate_status + checked_in_at/checked_out_at) | — |
| Arrivals dropdown: all options (Arrived, No Show, Take Key, Arrived & Key Taken, Departed) | Yes | `gateStatus.ts` 12–18; `TodayServerClient.tsx` 599–604, 700–704 |
| Departures dropdown: only Departed (and — Status —) | Yes | `TodayServerClient.tsx` 599–602 |
| Departed removes from list (filter, not delete) | Yes | `TodayServerClient.tsx` 278–283; `gate-status/route.ts` 121–132 |
| Accounting export CSV | Only Key Report CSV (keys-focused) | `KeyReportClient.tsx` 70–87; `key-report/route.ts` |
| Accounting export includes agent/source | No | Key Report has no source/external_source column |
| Filter by agent in export | No | Key Report has no agent/source filter |
| Agent field on bookings | source + external_source (no agent_id) | Bookings list / parsed-files; key-report does not expose them |

---

## What's missing vs typical customer request

- **Timestamp-based UI rules:** If the customer wants styling or rules based on **arrived_at**, **no_show_at**, **departed_at**, or **keys_taken_at**, these are **not** in the current bookings model for the board; the app uses **gate_status** and **checked_in_at** / **checked_out_at** instead. Any such requirement would need schema/API and then UI changes.
- **Dedicated "accounting export":** There is no separate accounting export; only the Key Report CSV. If the customer expects a general accounting CSV (e.g. all today’s bookings with revenue/source), that does not exist.
- **Agent in export:** Key Report does not include or filter by source/external_source (agent/channel). Adding agent would mean extending the key-report API select and the CSV columns (and optionally a filter by source/external_source).
- **Explicit no_show_at / keys_taken_at:** The app does not store **no_show_at** or **keys_taken_at**; no_show and key states are represented by **gate_status** and **ops_hidden** (and for keys, **highlight_code**). If the customer needs these as separate timestamps, that would require schema and API changes.

Implement changes only after confirming requirements with the customer.
