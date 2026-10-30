// The gateway's local set-up / status page (served at http://127.0.0.1:5719). One self-contained
// HTML document; every call to the local API carries the x-mpc-gateway header, which the server
// requires so other web pages cannot drive it.

export const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My Parking Channel Gateway</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --text:#1d2433; --muted:#667085; --line:#e4e7ec; --brand:#0f766e; --brand-ink:#fff; --bad:#b42318; --ok:#067647; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { max-width:640px; margin:0 auto; padding:32px 16px 64px; }
  h1 { font-size:20px; margin:0 0 4px; }
  .sub { color:var(--muted); margin:0 0 24px; }
  .steps { display:flex; gap:8px; margin-bottom:16px; font-size:13px; color:var(--muted); }
  .steps span { padding:4px 10px; border-radius:999px; background:#eef0f3; }
  .steps span.on { background:var(--brand); color:var(--brand-ink); }
  .steps span.done { background:#d1fadf; color:var(--ok); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:20px; margin-bottom:16px; }
  .card h2 { font-size:16px; margin:0 0 8px; }
  label { display:block; font-weight:600; font-size:13px; margin:14px 0 6px; }
  input, select { width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:8px; font:inherit; background:#fff; }
  input.code { font:600 22px ui-monospace,Menlo,Consolas,monospace; letter-spacing:4px; text-transform:uppercase; }
  button { margin-top:16px; padding:10px 18px; border:0; border-radius:8px; background:var(--brand); color:var(--brand-ink); font:600 15px inherit; cursor:pointer; }
  button.secondary { background:#eef0f3; color:var(--text); }
  button:disabled { opacity:.5; cursor:default; }
  .hint { color:var(--muted); font-size:13px; margin:6px 0 0; }
  .err { color:var(--bad); margin:12px 0 0; }
  .ok { color:var(--ok); }
  table { width:100%; border-collapse:collapse; margin-top:8px; }
  td, th { text-align:left; padding:10px 6px; border-bottom:1px solid var(--line); vertical-align:middle; }
  th { font-size:12px; color:var(--muted); font-weight:600; }
  .pill { display:inline-block; font-size:12px; padding:2px 8px; border-radius:999px; background:#eef0f3; color:var(--muted); }
  .pill.anpr { background:#d1fadf; color:var(--ok); }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:12px; margin-top:8px; }
  .stat { background:var(--bg); border-radius:8px; padding:12px; }
  .stat b { display:block; font-size:20px; }
  .stat span { font-size:12px; color:var(--muted); }
  .dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; background:var(--bad); }
  .dot.on { background:var(--ok); }
  a { color:var(--brand); }
</style>
</head>
<body>
<main>
  <h1>My Parking Channel Gateway</h1>
  <p class="sub" id="sub">Sends number-plate reads from your cameras to My Parking Channel.</p>
  <div class="steps" id="steps"></div>
  <div id="view"></div>
</main>
<script>
const H = { 'content-type': 'application/json', 'x-mpc-gateway': '1' };
let state = null;
let cameras = null;

async function api(path, body) {
  const res = await fetch(path, body === undefined ? { headers: H } : { method: 'POST', headers: H, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || ('Error ' + res.status));
  return json;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const $ = (id) => document.getElementById(id);

function steps(active) {
  const names = [['pair','1. Connect'],['nvr','2. Recorder'],['cameras','3. Cameras'],['running','4. Running']];
  const idx = names.findIndex(([k]) => k === active);
  $('steps').innerHTML = names.map(([k, n], i) => '<span class="' + (i < idx ? 'done' : i === idx ? 'on' : '') + '">' + n + '</span>').join('');
}

function busy(btn, on, text) { btn.disabled = on; if (text) btn.textContent = text; }
function showErr(id, e) { $(id).textContent = e ? (e.message || String(e)) : ''; }

function viewPair() {
  steps('pair');
  $('view').innerHTML = '<div class="card"><h2>Connect to My Parking Channel</h2>' +
    '<p class="hint">In My Parking Channel go to <b>Admin → Settings → ANPR</b>, click <b>Get pairing code</b>, and type the code here.</p>' +
    '<label for="code">Pairing code</label><input id="code" class="code" placeholder="XXXX-XXXX" maxlength="9" autocomplete="off">' +
    '<button id="go">Connect</button><p class="err" id="e"></p></div>';
  $('code').focus();
  $('go').onclick = async () => {
    busy($('go'), true, 'Connecting…'); showErr('e');
    try { await api('/api/pair', { code: $('code').value }); await refresh(); }
    catch (e) { showErr('e', e); busy($('go'), false, 'Connect'); }
  };
  $('code').onkeydown = (ev) => { if (ev.key === 'Enter') $('go').click(); };
}

function viewNvr() {
  steps('nvr');
  const s = state.settings;
  $('view').innerHTML = '<div class="card"><h2>Connect to the camera recorder (NVR)</h2>' +
    '<p class="hint">Connected to <b>' + esc(s.tenantName || 'My Parking Channel') + '</b>. Now sign in to the Hikvision recorder on this network.</p>' +
    '<label for="url">Recorder address</label><input id="url" value="' + esc(s.nvrUrl || 'http://192.168.1.88') + '">' +
    '<label for="user">Username</label><input id="user" value="' + esc(s.nvrUsername || '') + '" autocomplete="off">' +
    '<label for="pass">Password</label><input id="pass" type="password" autocomplete="new-password" placeholder="' + (s.hasNvrPassword ? '(saved, leave blank to keep)' : '') + '">' +
    '<p class="hint">Use a separate recorder user for the gateway rather than admin.</p>' +
    '<button id="go">Test and continue</button><p class="err" id="e"></p></div>';
  $('go').onclick = async () => {
    busy($('go'), true, 'Checking the recorder…'); showErr('e');
    try {
      cameras = await api('/api/nvr', { url: $('url').value, username: $('user').value, password: $('pass').value });
      await refresh(true);
    } catch (e) { showErr('e', e); busy($('go'), false, 'Test and continue'); }
  };
}

function viewCameras() {
  steps('cameras');
  const dirs = state.settings.channelDirections || {};
  if (!cameras) { $('view').innerHTML = '<div class="card">Loading cameras…</div>'; api('/api/nvr', {}).then((c) => { cameras = c; viewCameras(); }).catch((e) => { $('view').innerHTML = '<div class="card"><p class="err">' + esc(e.message) + '</p><button class="secondary" onclick="viewNvr()">Back</button></div>'; }); return; }
  const rows = cameras.channels.map((c) => {
    const isAnpr = c.reads7d > 0;
    const cur = dirs[c.id] || '';
    return '<tr><td><b>' + esc(c.name) + '</b><br><span class="hint">Channel ' + esc(c.id) + '</span></td>' +
      '<td>' + (isAnpr ? '<span class="pill anpr">' + c.reads7d + ' plates in 7 days</span>' : '<span class="pill">no plates</span>') + '</td>' +
      '<td><select data-ch="' + esc(c.id) + '">' +
      ['','in','out'].map((v) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + (v === 'in' ? 'Entry' : v === 'out' ? 'Exit' : 'Ignore') + '</option>').join('') +
      '</select></td></tr>';
  }).join('');
  $('view').innerHTML = '<div class="card"><h2>Which cameras read number plates?</h2>' +
    '<p class="hint">Recorder: ' + esc(cameras.device.model || 'Hikvision NVR') + '. Cameras marked green have read plates recently. Set each one to Entry or Exit; leave the rest on Ignore.</p>' +
    '<table><tr><th>Camera</th><th>Plate reads</th><th>Use as</th></tr>' + rows + '</table>' +
    '<button id="go">Save and start</button> <button class="secondary" id="back">Back</button><p class="err" id="e"></p></div>';
  $('back').onclick = () => viewNvr();
  $('go').onclick = async () => {
    const channelDirections = {};
    document.querySelectorAll('select[data-ch]').forEach((s) => { if (s.value) channelDirections[s.dataset.ch] = s.value; });
    busy($('go'), true, 'Starting…'); showErr('e');
    try { await api('/api/cameras', { channelDirections }); await refresh(); }
    catch (e) { showErr('e', e); busy($('go'), false, 'Save and start'); }
  };
}

function viewRunning() {
  steps('running');
  const st = state.status || {};
  const last = st.lastRead ? esc(st.lastRead.plate) + ' · ' + (st.lastRead.direction === 'in' ? 'entry' : 'exit') + ' · ' + new Date(st.lastRead.at).toLocaleTimeString() : 'none yet';
  const bg = state.service
    ? '<p class="ok">Running in the background. It starts automatically with Windows; you can close this page.</p>'
    : state.canInstall
      ? '<p class="hint">Right now the gateway stops if this window is closed. Make it run in the background so it keeps going after restarts and with nobody signed in (Windows will ask for permission once).</p><button id="install">Run in the background</button><p class="err" id="ie"></p>'
      : '<p class="hint">Keep this program running. (Background mode is available on Windows.)</p>';
  $('view').innerHTML = '<div class="card"><h2><span class="dot ' + (st.nvrConnected ? 'on' : '') + '"></span>' + (st.nvrConnected ? 'Connected and listening' : 'Connecting to the recorder…') + '</h2>' +
    (st.lastError && !st.nvrConnected ? '<p class="err">' + esc(st.lastError) + '</p>' : '') +
    '<div class="grid"><div class="stat"><b>' + (st.readsToday ?? 0) + '</b><span>plates today</span></div>' +
    '<div class="stat"><b>' + (st.sentToday ?? 0) + '</b><span>sent today</span></div>' +
    '<div class="stat"><b>' + (st.pending ?? 0) + '</b><span>waiting to send</span></div></div>' +
    '<p class="hint">Last plate: ' + last + '</p>' + bg + '</div>' +
    '<div class="card"><h2>Settings</h2><p class="hint">Account: <b>' + esc(state.settings.tenantName || '') + '</b> · Recorder: ' + esc(state.settings.nvrUrl) + '</p>' +
    '<button class="secondary" id="cams">Change cameras</button> <button class="secondary" id="nvr">Change recorder login</button></div>';
  $('cams').onclick = () => { cameras = null; viewCameras(); };
  $('nvr').onclick = () => viewNvr();
  if ($('install')) $('install').onclick = async () => {
    busy($('install'), true, 'Waiting for Windows permission…'); showErr('ie');
    try {
      await api('/api/install', {});
      $('view').innerHTML = '<div class="card"><h2>Moving to the background…</h2><p class="hint">This page will reconnect in a few seconds.</p></div>';
      waitForService();
    } catch (e) { showErr('ie', e); busy($('install'), false, 'Run in the background'); }
  };
}

async function waitForService() {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try { const s = await api('/api/state'); if (s.service) { state = s; render(); return; } } catch {}
  }
  $('view').innerHTML = '<div class="card"><p class="err">The background service did not start. Open the gateway again to retry.</p></div>';
}

function render() {
  if (state.phase === 'pair') return viewPair();
  if (state.phase === 'nvr') return viewNvr();
  if (state.phase === 'cameras') return viewCameras();
  return viewRunning();
}

async function refresh(keepCameras) {
  state = await api('/api/state');
  if (!keepCameras) cameras = null;
  render();
}

refresh().catch((e) => { $('view').innerHTML = '<div class="card"><p class="err">' + esc(e.message) + '</p></div>'; });
setInterval(async () => {
  if (!state || state.phase !== 'running' || document.activeElement?.tagName === 'SELECT') return;
  try { const s = await api('/api/state'); if (s.phase === 'running') { state = s; if (!document.getElementById('ie')?.textContent) viewRunning(); } } catch {}
}, 5000);
</script>
</body>
</html>`;
