# Fly Parks Exeter — ANPR gateway plan

Written 30 Oct 2026 after a remote survey of the site over Tailscale. Phase 1 is live in a shadow run (from 9 Nov 2026); phase 2 is built and awaiting an on-site test.

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
4. **Done: gateway heartbeat.** The gateway is registered as a `gate_devices` row and sends its id as `device_id` on every `/capture`. That updates `last_seen` and is stored on `gate_events.device_id`. It also calls `POST /api/internal/anpr/heartbeat?tenantId=` with `{ device_id }` every 5 minutes, so it stays "connected" when no cars move. The admin ANPR page already shows connected or disconnected from `last_seen`. Still open: a push alert (email/Slack) when it goes quiet, following the existing canary/alerting pattern.

### The gateway (phase 1 scope)

**Built in [`gateway/`](../gateway/README.md)**: live stream, dedupe, durable queue, `/capture` delivery, heartbeat, probe and dry-run modes, and a Windows startup task. The site computer is a staff PC that stays on. Catch-up after downtime is built on the NVR's real search format, captured and checked against this NVR. Still to do: confirm the live event format with `probe`, which needs an NVR login for the gateway.

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

### Shadow run findings (10 Nov 2026)

- Gateway 0.1.0 installed on Nic's PC on 9 Nov. It stayed connected to the NVR's `alertStream` overnight but received **no plate events**; the only read (EK25GSO, 14:54) came from the catch-up search when it moved to the background. Cars passing since were not recorded.
- Gateway 0.2.0 therefore **searches the NVR's stored reads every minute** (the search verified on 30 Oct) instead of relying on the live stream, and recovers everything since set-up on its first run.
- Still worth checking on site: whether the cameras' plate events are linked to "Notify Surveillance Center" on the NVR, which is what feeds the live stream.

## Phase 2: barrier control

Status: **built (gateway 0.2.0), not yet tested on site.** Nothing changes at the barrier until the camera linkage is switched (step 4 below).

### How it works

- **The camera decides.** Booked plates sit in each ANPR camera's own allow-list with validity dates, so the barrier opens instantly for expected cars, whether or not the gateway PC or the internet is up at that moment. The gateway only keeps the list current.
- **Desired-state sync, not a queue.** Every 5 minutes the gateway fetches the whole list from `GET /api/internal/anpr/allowlist` (gateway key auth; built by `src/lib/anpr/allowList.ts`) and makes each camera match it. The older outbox (`/outbox`, `/outbox/ack`, `/snapshot`) is a leased queue for the Videofit relay, so a second consumer would steal its items; it is left as it is.
- **What is on the list:** bookings that aren't cancelled or departed, from **12 h before start to 12 h after end**, up to **7 days ahead**; cars that arrived and haven't left stay allowed (at least 2 days ahead) however overdue, so they can always get out; active staff vehicles for a year. One entry per plate, widest window. The camera holds **dates only** (London days), so a booking is valid all day on its start and end dates.
- **Only its own plates.** The gateway remembers what it added per camera (`allowlist.db`) and only ever removes those; entries typed into the camera by hand are left alone. Every 6 hours it reads each camera back and re-adds anything missing.
- **Fails safe:** if the list can't be fetched nothing changes on the cameras; a sync that would remove more than half of its plates at once (and more than 20) is refused and shown as an error.
- **PC switched off overnight:** the cameras keep working from what they already hold, and because the list runs a week ahead almost every booking is already there. Only bookings made, changed or cancelled while the PC is off wait until it is back on. Those cars need the intercom/QR route until then, or a PC that stays on.
- **Visible remotely:** the heartbeat reports plates expected, plates on each camera, last sync and errors; Admin → Settings → ANPR → On-site gateway shows it.

### Camera calls (to verify on site)

| Operation | Call | Source |
|---|---|---|
| Read the list | `POST /ISAPI/Traffic/channels/1/searchLPListAudit` (`LPListAuditSearchDescription`, paged; result has `id`, `LicensePlate`, `type` = `whitelist`/`blackList`) | Hikvision "How to integrate with Hikvision LPR function via ISAPI" |
| Add / re-date | `PUT /ISAPI/Traffic/channels/1/licensePlateAuditData/record?format=json` with `LicensePlateInfoList[]` (`LicensePlate`, `listType: whiteList`, `effectiveStartDate`, `effectiveTime`) | **Unverified**: best-known 7-series format |
| Delete | `PUT /ISAPI/Traffic/channels/1/DelLicensePlateAuditData?format=json` with `{ "id": [...] }` | **Unverified**: community reports |

All three live in `gateway/src/allowList.ts` (`CameraAllowList`). If the add or delete call is wrong, capture the real requests from the camera's own web page (Configuration → Road Traffic → Allowlist, browser dev tools) and adjust that class; nothing else depends on the format.

### Reaching the cameras

D1 and D2 sit on the NVR's PoE network (`192.168.254.0/24`), not the LAN. The plan is the NVR's **Virtual Host** (Configuration → Network → Advanced → Other; the NVR reboots), which serves each PoE camera's HTTP interface at `http://192.168.1.88:65001`, `:65002`, … in channel order. If ISAPI calls don't pass through it, the fallback is a LAN route to `192.168.254.0/24` (a static route via the NVR, or a PC on a spare PoE port with a static address).

### Turning it on (on site, with Cameron)

1. Enable Virtual Host on the NVR and note D1's and D2's ports (the camera management page links them).
2. Gateway page → **Barrier allow-list → Set up**: enter both camera addresses (blank login = the CCTV login) and click **Test cameras**. The test adds plate `MPCTEST1`, finds it as an allow-list entry, deletes it and confirms it is gone, showing each raw response. **Turn on** is only offered after a clean test.
3. Watch for a day: each camera's allow-list (camera web page) should hold today's and the coming week's bookings, and Admin should show the sync healthy.
4. **Enforcement switch:** on D1 and D2, untick the relays and Wiegand under **Others** and **Blocklist** and keep them under **Allowlist**. Rollback is re-ticking **Others**. Until this step the barrier behaves exactly as today.

**To confirm beforehand:** which relay drives which barrier, what the Wiegand output is wired to, whether "open for everyone" is deliberate today, whether the exit should also be allow-list only (overdue cars stay listed, but unbooked visitors would then be held at the exit), and what happens for unbooked or unread vehicles (the QR/intercom route).

## Housekeeping found during the survey

- NVR "Device Remote Configuration" was switched on during the survey (Device Access → More). Turn it off if it isn't needed.
- The NVR gets its address by DHCP, so reserve `192.168.1.88` on the router.
- Unused NVR channels D8–D24 are flagged "Risky password".
