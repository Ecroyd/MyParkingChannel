# My Parking Channel ANPR gateway

Runs on an always-on computer at the car park. It listens to the Hikvision NVR for number-plate
reads and sends each one to My Parking Channel (`POST /api/internal/anpr/capture`), which records
the gate event and marks the matching booking arrived or departed.

Phase 1 is **read-only on site**: it never writes to the NVR, the cameras or the barriers.
Background and the overall plan: [`docs/anpr-gateway-plan.md`](../docs/anpr-gateway-plan.md).

## How it works

- One long-lived ISAPI `alertStream` connection to the NVR (digest auth), reconnecting with backoff.
- ANPR notifications (XML or JSON) become plate reads. Heartbeats, images and non-plate events
  are ignored.
- **Direction** comes from `CHANNEL_DIRECTIONS` (NVR channel → `in`/`out`), or from the camera's own
  forward/reverse via `CAMERA_DIRECTIONS`. Reads from unmapped channels are skipped and logged.
- **Repeats** of the same plate on the same channel within `DEDUPE_SECONDS` count once.
- Every read goes into a **SQLite queue on disk** (`data/queue.db`) before it is sent. Failed sends
  retry with backoff (up to 5 minutes), so internet outages and restarts delay reads but don't lose
  them. Reads the server rejects as invalid (HTTP 400) are parked in the `dead` table.
- **Catch-up:** the gateway records on disk when its NVR stream was last alive. After any gap
  (PC off or asleep, gateway restarted, network drop) it searches the NVR's stored vehicle
  detections for that period, with 10 minutes' overlap either side and up to 3 days back, and
  queues the reads it missed. Every read, live or caught up, is remembered in a `seen` table, so
  overlap never double-counts. A search that fails is retried every 5 minutes until it succeeds.
  Stored reads carry no travel direction, so catch-up uses `CHANNEL_DIRECTIONS`.
- A **heartbeat** every `HEARTBEAT_SECONDS` keeps the gateway's gate device "connected" on the admin
  ANPR page.
- Logs go to the console and `data/gateway.log` (rotated at 5 MB).

No build step and no npm packages: Node 24 runs the TypeScript directly and has SQLite built in.

## Commands

```bash
node src/main.ts probe 300     # record raw NVR events for 5 minutes to data/probe-*.log; sends nothing
node src/main.ts run --dry-run # parse and log what would be sent; sends nothing
node src/main.ts run           # the real thing
node --test "test/*.test.ts"   # tests
```

## Set-up on the site PC (Windows)

1. **Computer:** wired to the main Fly Parks network, and `http://192.168.1.88` opens the NVR login
   page in a browser. Sleep set to Never, `powercfg /hibernate off`, and Windows Update active hours
   covering opening hours.
2. **Node.js 24 LTS:** install it from nodejs.org.
3. **Copy this `gateway` folder** to the PC, e.g. `C:\mpc-gateway`.
4. **NVR user:** on the NVR, create a dedicated user (e.g. `mpc-gateway`) with the lowest role that
   can receive events. Don't reuse `admin`.
5. **My Parking Channel admin:**
   - The Fly Parks ANPR site is enabled, and there is a relay token.
   - Create a gate device for the gateway (e.g. "Fly Parks gateway") and copy its id.
6. **Configure:** copy `env.example` to `.env` and fill it in. Only someone authorised should
   handle the NVR password and relay token.
7. **Find the channels:** run `node src\main.ts probe 600` and drive a car past each ANPR camera.
   The summary shows each channel's id and name. Put them in `CHANNEL_DIRECTIONS` (e.g. `1:in,2:out`).
8. **Dry run:** `node src\main.ts run --dry-run` and check the logged reads look right.
9. **Install as a startup task** (Administrator PowerShell, in the gateway folder):
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1
   ```
   It runs as SYSTEM at boot with nobody logged in, and restarts every minute if it crashes.
   Remove it with `-Uninstall`.
10. **Shadow run:** for a few days, compare Admin → ANPR → Events with the NVR's own vehicle
    detection search before staff rely on it.

## Verified against the site NVR (DS-7732NI-M4/24P, V5.04.081, 30 Oct 2026)

- **Catch-up search:** the `eventRecordSearch` request and response formats were captured from the
  NVR's own Event Center page. The NVR honours UTC offsets: the same window as `+00:00` and as
  `+01:00` returned the same 18 reads, and a window an hour later returned 22. Stored reads use
  channel `1` for D1 and `2` for D2.
- **Still to confirm with `probe`:** the live alertStream notification format. The parser follows
  Hikvision's documented ANPR fields and accepts both XML and JSON. `probe` also runs a catch-up
  search, so one probe session checks both paths.
