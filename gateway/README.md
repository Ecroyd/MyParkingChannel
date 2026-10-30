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

## Install at a car park (the normal way)

1. **Computer:** wired to the same network as the recorder (NVR), always on, sleep set to Never.
2. **My Parking Channel → Admin → Settings → ANPR → On-site gateway:** click **Download gateway
   (Windows)** on that computer and run `mpc-gateway.exe`. If Windows says it protected your PC,
   click **More info → Run anyway** (the app isn't code-signed yet).
3. The set-up page opens in the browser (`http://127.0.0.1:5719`):
   1. **Connect:** click **Get pairing code** in admin and type the code. This creates the gate
      device and its key; nothing to copy by hand.
   2. **Recorder:** the NVR address, plus the username and password of a dedicated NVR user (not
      `admin`). **Test and continue** lists the cameras, with each one's plate reads over the last
      7 days, so the ANPR cameras stand out.
   3. **Cameras:** set the ANPR cameras to Entry or Exit, and leave the rest on Ignore.
   4. **Run in the background:** one Windows permission prompt. The gateway moves to
      `C:\ProgramData\MPC Gateway` (locked to SYSTEM and Administrators, because it holds the NVR
      password and device key), and from then on runs as a startup task, with nobody signed in.
4. Opening `mpc-gateway.exe` again (or `http://127.0.0.1:5719`) shows the status page: connection,
   plates today, sent today and waiting to send. Cameras and the recorder login can be changed there.
5. **Shadow run:** for a few days, compare Admin → ANPR → Events with the NVR's own vehicle
   detection search before staff rely on it.

**More than one gateway at a site** (e.g. a backup PC) is fine: pair each with its own code. My
Parking Channel counts the same plate in the same direction within a minute once, whichever
gateway sends it. Check the NVR accepts that many event connections; some models limit them.

To remove it: Administrator PowerShell, `Unregister-ScheduledTask -TaskName 'MPC ANPR Gateway'`, then
delete `C:\ProgramData\MPC Gateway`.

## Releasing

Push a tag like `gateway-v0.1.0`. `.github/workflows/gateway-release.yml` runs the tests, builds
`mpc-gateway.exe` on Windows (Node 24 single executable application: no Node install needed on site),
smoke-tests it and publishes a GitHub release. The admin download button points at
`releases/latest/download/mpc-gateway.exe` (override with `ANPR_GATEWAY_DOWNLOAD_URL`).
`node scripts/build-exe.mjs` builds the same thing locally for the current OS.

## Development

No build step and no npm packages: Node 24 runs the TypeScript directly and has SQLite built in.

```bash
node src/main.ts --data data --port 5719   # the app: set-up page + gateway
node src/main.ts probe 300                 # headless: record raw NVR events (uses .env); sends nothing
node --test "test/*.test.ts"               # tests
```

**Headless set-up (alternative):** with a `.env` (copy `env.example`) and no `--data`,
`node src/main.ts` runs the gateway without the set-up page, authenticating with
`MPC_DEVICE_KEY` or the tenant relay token. `scripts/install-windows.ps1` installs that variant as
a startup task.

## Verified against the site NVR (DS-7732NI-M4/24P, V5.04.081, 30 Oct 2026)

- **Catch-up search:** the `eventRecordSearch` request and response formats were captured from the
  NVR's own Event Center page. The NVR honours UTC offsets: the same window as `+00:00` and as
  `+01:00` returned the same 18 reads, and a window an hour later returned 22. Stored reads use
  channel `1` for D1 and `2` for D2.
- **Still to confirm with `probe`:** the live alertStream notification format. The parser follows
  Hikvision's documented ANPR fields and accepts both XML and JSON. `probe` also runs a catch-up
  search, so one probe session checks both paths.
