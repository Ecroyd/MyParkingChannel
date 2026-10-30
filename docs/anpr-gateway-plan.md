# Fly Parks Exeter — ANPR gateway plan

Status: plan, not started. Written 30 Oct 2026 after a remote survey of the site over Tailscale.

## Goal and phasing

- **Phase 1: arrivals and departures (camera → My Parking Channel).** Each plate read becomes a `gate_events` row. When it matches a booking, the booking is marked arrived or departed and occupancy updates. **The cameras and barriers stay exactly as they are.** Phase 1 only listens.
- **Phase 2: barrier control (My Parking Channel → camera).** Later. Booked plates are pushed to the cameras' allow-lists, and the cameras switch to opening only for allow-listed plates.

Both phases use the same **gateway**: a small program on a dedicated, always-on PC on the Fly Parks network. The cameras can't be reached from the internet and Vercel can't reach the site, so something on-site has to make outbound calls.

## What's on site (surveyed 30 Oct 2026)

| Item | Detail |
|---|---|
| NVR | Hikvision DS-7732NI-M4/24P, firmware V5.04.081, `192.168.1.88` (**DHCP, needs reserving**) |
| ANPR cameras | D1 `192.168.254.2` and D2 `192.168.254.3`, both iDS-2CD7A26G0/P-IZHSY, firmware V5.8.50 |
| Other cameras | D3–D7, general CCTV |
| Camera network | Cameras sit on the NVR's internal PoE network `192.168.254.0/24` and can't be reached directly from the LAN |
| Remote access | Tailscale. The tailnet is `camforrest@outlook.com`; Cameron's PC currently shares `192.168.1.0/24` |

D1 Road Traffic settings:

- Plate recognition **on**: Entrance/Exit mode, 1 lane, Europe → England/Scotland/Wales, "License Plate & Vehicle" (also gives make, colour, type and direction).
- **Duplicate-plate removal is off**, so a car sitting at the barrier can be read several times.
- The allow-list and blocklist are empty. Linkage for Blocklist, Allowlist and Others **all fire relays A→1 and A→2 plus Wiegand WD-1**. If those drive the barrier, it currently opens for every vehicle read. This matters for phase 2, not phase 1.
- The NVR stores every read (52 on 30 Oct by early afternoon), so missed reads can be recovered.

---

## Phase 1: arrivals and departures

### How it works

```
 D1 / D2  ──►  NVR 192.168.1.88  ── ISAPI event stream (digest auth) ──►  Gateway PC
                                                                             │ outbound HTTPS
                                                                             ▼
                                              POST /api/internal/anpr/capture?tenantId=…
                                                                             │
                                          gate_events row  →  booking match  →  arrived / departed
```

Nothing is written to the NVR or the cameras. The gateway needs an NVR user with **read-only** event permissions, not `admin`.

### The cloud side already exists

`POST /api/internal/anpr/capture?tenantId=` (relay token in `x-relay-token` or `Authorization: Bearer`):

- Body: `{ plate, occurred_at, direction: "in"|"out", camera_id, lane, confidence, raw }`.
- It inserts a `gate_events` row, de-duplicating on `event_hash` (tenant, plate, time, direction, camera, lane). A resend returns `{ duplicate: true }`.
- It matches a booking on `plate` within ±6 hours of the booking window, picking the booking whose start (for `in`) or end (for `out`) is closest.
- On a match it calls `applyBookingOccupancyAction(arrived|departed, source: 'anpr')`, sets `result: allow` and links the booking. Otherwise it sets `result: deny, reason: 'no booking match'`.

Reads show up in Admin → ANPR → Events, and arrivals and departures reach the ops board through the existing occupancy ledger.

### Small cloud changes for phase 1

1. **Done (branch `feat/anpr-phase1-capture`): plate matching ignores spacing.** Several booking writers keep spaces (`AB12 CDE`), so `/capture` now queries with a spacing-insensitive pattern and compares normalised plates (`src/lib/anpr/captureBookingMatch.ts`). The import mapper (`src/lib/imports/mapToBookings.ts`) now also strips spaces. No backfill is needed for matching.
2. **Done: `source` field.** `/capture` accepts an optional `source` (default `videofit`), so the gateway sends `hikvision`. It's recorded on `gate_events.source` and in the occupancy metadata.
3. **Done: departures after long overstays.** If an `out` read matches nothing within ±6 hours, it checks the vehicle out of its most recent arrived-but-not-departed booking.
4. **Open: health.** Add a gateway heartbeat (a `last_seen_at` on `anpr_sites`, or a small endpoint) and alert when there has been nothing for 15 minutes during opening hours, using the existing canary/alerting pattern.

### The gateway (phase 1 scope)

- **Runtime:** Node.js/TypeScript service, run as a Windows service (NSSM) or with systemd. Config: NVR address and read-only credentials, tenant ID, relay token, base URL, and the channel map.
- **Listen:** keep one long-lived connection to `GET /ISAPI/Event/notification/alertStream` on the NVR, and parse vehicle-detection (ANPR) events for D1 and D2. Reconnect with backoff.
- **Direction:** the simplest rule is `D1 → in`, `D2 → out`. If one camera covers both directions, use the camera's own direction field (it reports "Forward"/"Reverse") instead. Confirm on site.
- **De-duplicate locally:** drop the same plate on the same channel within 60 seconds. `/capture`'s `event_hash` only catches exact repeats, and camera-side duplicate removal is off.
- **Never lose a read:** queue on local disk (SQLite) and send with retry and backoff, so an internet outage just delays things.
- **Catch-up:** on start-up and every 15 minutes, search the NVR (`POST /ISAPI/ContentMgmt/eventRecordSearch`, vehicle detection, D1/D2, since the last confirmed send) and resend anything missing. Resends are harmless.
- **Ignore low-confidence and empty reads**, but still send them with `confidence` so they're visible in Events for tuning.

### Phase 1 rollout

1. **Gateway PC:** always on, no sleep, Tailscale running unattended on the `camforrest` tailnet for remote support. Reserve DHCP leases for it and for the NVR (`192.168.1.88`).
2. **Create a read-only NVR user** for the gateway.
3. **Cloud changes 1–2** (plate normalisation and source field) deployed; check the plate backfill.
4. **Shadow run:** the gateway sends to `/capture` for a few days. Each day, compare Admin → ANPR → Events against the NVR's own vehicle-detection search, and check the match rate (`allow` vs `no booking match`) against the day's arrivals list.
5. **Go live:** staff rely on ANPR arrivals and departures on the ops board, and the manual check-in remains as a fallback.

### Phase 1 open questions

- Is D2 the exit camera, and is it set up like D1 (Entrance/Exit, UK plates, plate and vehicle)?
- Do the cameras or NVR already send events somewhere (Videofit, FTP, a "surveillance center")? Phase 1 doesn't need that changed, but we should know.
- What match rate is acceptable before staff stop checking cars in manually?

---

## Phase 2: barrier control (later)

Outline only; it gets a detailed plan once phase 1 is stable.

- **Already built:** `GET /outbox` (5-minute lease; `plate`, `valid_from`, `valid_until`, `action: upsert|delete`), `POST /outbox/ack` (failures requeue), `GET /snapshot` and `GET /staff-vehicles` for reconciliation. Bookings already enqueue outbox rows (`src/lib/videofit/bookingSync.ts`).
- **Gateway addition:** poll the outbox and write plates, with their start and end dates, to both cameras' allow-lists (up to 10,000 plates, dates supported). Acknowledge once both cameras accept. Reconcile nightly from the snapshot.
- **Technical risk to settle first:** the NVR must pass ISAPI list management through to the PoE cameras. If it doesn't, the gateway needs a route to `192.168.254.0/24` (a spare NVR PoE port with a static address, or NVR port forwarding).
- **Enforcement switch (on site, with Cameron):** on D1 and D2, untick the relays and Wiegand under **Others** and **Blocklist** and keep them under **Allowlist**. Rollback is re-ticking Others.
- **To confirm beforehand:** which relay drives which barrier, what the Wiegand output is wired to, whether "open for everyone" is deliberate today, and what happens for unbooked or unread vehicles (the QR/intercom route).

## Housekeeping found during the survey

- NVR "Device Remote Configuration" was switched on during the survey (Device Access → More). Turn it off if it isn't needed.
- The NVR gets its address by DHCP, so reserve `192.168.1.88` on the router.
- Unused NVR channels D8–D24 are flagged "Risky password".
