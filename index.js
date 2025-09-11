// index.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { notify, logNotify } from "./backend/utils/notifier.js";
import { runJob } from "./backend/runJob.js";
import 'dotenv/config';
import { timingSafeEqual } from 'crypto';
import fs from "fs/promises";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// Notifier is pre-configured via code defaults inside backend/utils/notifier.js

// Where your built/static files live. Adjust to "public" or "build" if that's your setup.
const STATIC_DIR = process.env.STATIC_DIR || "public";
const staticPath = path.join(__dirname, STATIC_DIR);
// Allow overriding storage directory via env (e.g., persistent disk mounted at /var/data)
const storagePath = process.env.STORAGE_DIR
  ? process.env.STORAGE_DIR
  : (process.env.NODE_ENV === 'production' ? '/var/data' : path.join(__dirname, 'storage'));

// Basic health check for Render
app.get("/healthz", (req, res) => res.status(200).send("ok"));

// Serve static assets
app.use(express.static(staticPath));

// Serve storage assets (audio, transcript) when present via static dir
// Priority: project-local var/data -> system /var/data -> configured storagePath
app.use("/storage", express.static(path.join(__dirname, 'var', 'data')));
app.use("/storage", express.static('/var/data'));
app.use("/storage", express.static(storagePath));

// Helper: find an asset across likely locations
async function resolveAsset(relName) {
  const candidates = [
    path.join(storagePath, relName),
    path.join(__dirname, 'var', 'data', relName),
    path.join(__dirname, 'var', relName),
    path.join(staticPath, 'storage', relName),
  ];
  for (const p of candidates) {
    try {
      const st = await fs.stat(p);
      if (st && st.isFile()) return p;
    } catch {}
  }
  return '';
}

// Stream audio and transcript via backend so preview envs without persistent storage still work
app.get('/api/audio', async (req, res) => {
  try {
    const file = await resolveAsset('audio.mp3');
    if (!file) return res.status(404).json({ ok: false, error: 'audio not found' });
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    res.set('Access-Control-Allow-Origin', '*');
    res.sendFile(file);
  } catch (err) {
    console.error('[/api/audio] error', err);
    res.status(500).json({ ok: false });
  }
});

app.get('/api/transcript', async (req, res) => {
  try {
    const file = await resolveAsset('transcript.json');
    if (!file) return res.status(404).json({ ok: false, error: 'transcript not found' });
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.set('Access-Control-Allow-Origin', '*');
    res.sendFile(file);
  } catch (err) {
    console.error('[/api/transcript] error', err);
    res.status(500).json({ ok: false });
  }
});

// Root should serve the HTML file
app.get("/", (req, res) => {
  res.sendFile(path.join(staticPath, "index.html"));
});

// Lightweight view notification endpoint
app.post("/notify-view", express.json({ limit: '8kb' }), async (req, res) => {
  try {
    const ua = req.get('user-agent') || 'unknown';
    const ipRaw = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
    const ipFirst = String(ipRaw).split(',')[0].trim();
    const ip = ipFirst.startsWith('::ffff:') ? ipFirst.slice(7) : ipFirst; // normalize IPv4-mapped IPv6
    const meta = req.body || {};
    const pathViewed = meta.path || req.originalUrl;
    const tz = meta.tz || 'unknown-tz';
    const lang = meta.lang || 'unknown-lang';

    // Start with ip, then append host/city/region and a newline, then other fields
    let msg = `🙋 Site view: ${pathViewed} ● ip:${ip}`;

    // Try reverse DNS + geo lookup (non-fatal); add a newline right after this block
    try {
      const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '';
      if (!isLocal) {
        const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,reverse,city,regionName,query`;
        const resp = await fetch(url, { headers: { 'Accept': 'application/json' } }).catch(() => null);
        const data = resp ? await resp.json().catch(() => null) : null;
        if (data && data.status === 'success') {
          const host = data.reverse || 'n/a';
          const city = data.city || 'n/a';
          const region = data.regionName || 'n/a';
          msg += ` ● host:${host} ● city:${city} ● region:${region}`;
        } else {
          msg += `\n`;
        }
      } else {
        msg += ` ● host:local ● city:n/a ● region:n/a`;
      }
    } catch {
      msg += `\n`;
    }

    // Append remaining metadata after the newline
    // msg += ` | ua:${ua} | tz:${tz} | lang:${lang}`;
    msg += ` | ua:${ua}`;

    await notify(msg);
    res.status(204).end();
  } catch (err) {
    console.error('error', err);
    res.status(500).json({ ok: false });
  }
});

// Simple token helpers
function extractBearerToken(req) {
  const auth = req.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const headerToken = req.get('x-job-token');
  if (headerToken) return String(headerToken).trim();
  if (req.query && req.query.token) return String(req.query.token);
  return '';
}

function tokensMatch(expected, provided) {
  try {
    const a = Buffer.from(String(expected));
    const b = Buffer.from(String(provided));
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Simple logs password extractor (headers only; do not allow query)
function extractLogsPassword(req) {
  const header = req.get('x-password') || req.get('x-logs-password');
  if (header) return String(header);
  const auth = req.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return '';
}

// Password-protected endpoint to view JSONL summary logs (API)
// Usage: GET /api/logs?date=YYYY-MM-DD&limit=50 (send password via header: x-logs-password)
app.get('/api/logs', async (req, res) => {
  try {
    const expected = process.env.LOGS_PASSWORD || '';
    const provided = extractLogsPassword(req);

    if (!expected || !tokensMatch(expected, provided)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const date = (req.query?.date ? String(req.query.date) : `${yyyy}-${mm}-${dd}`).slice(0, 10);

    const limit = Math.max(0, Math.min(1000, parseInt(String(req.query?.limit || '200'), 10) || 200));

    const logsDir = path.join(storagePath, 'summaries');
    const filePath = path.join(logsDir, `${date}.jsonl`);

    const text = await fs.readFile(filePath, 'utf8').catch(err => {
      if (err && err.code === 'ENOENT') return null;
      throw err;
    });

    if (text == null) {
      return res.status(404).json({ ok: false, error: 'No logs for that date', date });
    }

    const lines = text.split(/\r?\n/).filter(Boolean);
    const tail = limit > 0 ? lines.slice(-limit) : lines;
    const entries = [];
    for (const line of tail) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        entries.push({ parse_error: true, raw: line });
      }
    }

    res.json({ ok: true, date, count: entries.length, entries });
  } catch (err) {
    console.error('[/logs] error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// List available log dates (filenames) (API)
// GET /api/logs/dates (send password via header: x-logs-password)
app.get('/api/logs/dates', async (req, res) => {
  try {
    const expected = process.env.LOGS_PASSWORD || '';
    const provided = extractLogsPassword(req);
    if (!expected || !tokensMatch(expected, provided)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const logsDir = path.join(storagePath, 'summaries');
    let files = [];
    try {
      files = await fs.readdir(logsDir);
    } catch (err) {
      if (err && err.code === 'ENOENT') return res.json({ ok: true, dates: [] });
      throw err;
    }

    const dates = files
      .filter(name => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
      .map(name => name.replace(/\.jsonl$/, ''))
      .sort();

    res.json({ ok: true, dates });
  } catch (err) {
    console.error('[/logs/dates] error', err);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// Simple HTML viewer for logs with selection
// GET /logs?date=YYYY-MM-DD (enter password on page; sent via headers)
app.get('/logs', async (req, res) => {
  try {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const initialDate = (req.query?.date ? String(req.query.date) : `${yyyy}-${mm}-${dd}`).slice(0, 10);

    const html = `<!doctype html>
<html>
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>Logs Viewer</title>
    <style>
      :root { --bg:#0b0c10; --fg:#eaf0f6; --muted:#a0aab8; --accent:#4aa3ff; --card:#15171c; }
      body { margin:0; font-family: system-ui,-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:var(--bg); color:var(--fg); }
      header { padding:12px 16px; background:#101218; border-bottom:1px solid #22262d; display:flex; gap:12px; align-items:center; }
      h1 { font-size:16px; margin:0; font-weight:600; }
      main { display:grid; grid-template-columns: 360px 1fr; gap:0; height: calc(100vh - 56px); }
      aside { border-right:1px solid #22262d; background:var(--card); overflow:auto; }
      section { overflow:auto; }
      .controls { display:flex; gap:8px; align-items:center; }
      select, input, button { background:#0e1117; color:var(--fg); border:1px solid #333a44; border-radius:6px; padding:6px 8px; }
      button { cursor:pointer; }
      ul { list-style:none; margin:0; padding:0; }
      li { border-bottom:1px solid #20242b; padding:10px 12px; cursor:pointer; }
      li:hover { background:#0f1218; }
      li.active { background:#0b1220; border-left:3px solid var(--accent); padding-left:9px; }
      .muted { color:var(--muted); font-size:12px; }
      pre { margin:0; white-space:pre-wrap; word-break:break-word; }
      .entry-actions { display:flex; gap:8px; padding:8px; border-bottom:1px solid #22262d; background:var(--card); }
      .empty { padding:24px; color:var(--muted); }
      /* Login */
      #login { max-width: 420px; margin: 18vh auto; background: var(--card); padding: 24px; border-radius: 10px; border:1px solid #2a2f3a; }
      #login h2 { margin: 0 0 12px; font-size: 18px; }
      #login p { color: var(--muted); margin: 0 0 16px; }
      #login form { display:flex; gap: 8px; }
      #error { color: #ff6b6b; margin-top: 10px; min-height: 1em; }
      #app { display: none; }
    </style>
  </head>
  <body>
    <div id=\"login\">
      <h2>Enter Logs Password</h2>
      <p>Access to logs requires a password.</p>
      <form id=\"loginForm\">
        <input id=\"pw\" type=\"password\" placeholder=\"Password\" autocomplete=\"current-password\" required />
        <button type=\"submit\">View Logs</button>
      </form>
      <div id=\"error\"></div>
    </div>

    <div id=\"app\">
      <header>
        <h1>News for Schmucks — Logs</h1>
        <div class=\"controls\">
          <label for=\"date\">Date:</label>
          <select id=\"date\"></select>
          <button id=\"refresh\">Refresh</button>
        </div>
      </header>
      <main>
        <aside>
          <ul id=\"list\"></ul>
        </aside>
        <section>
          <div class=\"entry-actions\">
            <button id=\"copy\">Copy JSON</button>
            <button id=\"download\">Download JSON</button>
          </div>
          <pre id=\"detail\" class=\"empty\">Select an entry to view details…</pre>
        </section>
      </main>
    </div>

    <script>
      const initialDate = ${JSON.stringify(initialDate)};
      let password = '';

      const elLogin = document.getElementById('login');
      const elForm = document.getElementById('loginForm');
      const elPw = document.getElementById('pw');
      const elErr = document.getElementById('error');
      const elApp = document.getElementById('app');

      const elDate = document.getElementById('date');
      const elList = document.getElementById('list');
      const elDetail = document.getElementById('detail');
      const elCopy = document.getElementById('copy');
      const elDownload = document.getElementById('download');
      const elRefresh = document.getElementById('refresh');

      let entries = [];
      let activeIndex = -1;

      function fmt(ts) {
        try { return new Date(ts).toLocaleString(); } catch { return ts; }
      }

      async function fetchDates() {
        const res = await fetch('/api/logs/dates', { headers: { 'x-logs-password': password } });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load dates');
        return data.dates;
      }

      async function fetchEntries(date) {
        const res = await fetch('/api/logs?date=' + encodeURIComponent(date) + '&limit=0', { headers: { 'x-logs-password': password } });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load logs');
        return data.entries || [];
      }

      function renderList(items) {
        elList.innerHTML = '';
        items.forEach((e, i) => {
          const li = document.createElement('li');
          li.dataset.index = String(i);
          const preview = (Array.isArray(e.text) ? e.text.join('\\n') : (e.text || '')).slice(0, 140).replace(/\\n+/g, ' ');
          li.innerHTML = '<div><strong>' + (i+1) + '.</strong> ' + (preview || '<span class=\\"muted\\">(no text)</span>') + '</div>' +
                         '<div class=\\"muted\\">' + (e.urls?.length ? e.urls.join(', ') : '') + '</div>' +
                         '<div class=\\"muted\\">' + (e.timestamp ? fmt(e.timestamp) : '') + '</div>';
          li.addEventListener('click', () => selectIndex(i));
          elList.appendChild(li);
        });
      }

      function selectIndex(i) {
        activeIndex = i;
        document.querySelectorAll('#list li').forEach((li, idx) => li.classList.toggle('active', idx === i));
        const e = entries[i];
        elDetail.classList.remove('empty');
        elDetail.textContent = JSON.stringify(e, null, 2);
      }

      elCopy?.addEventListener('click', async () => {
        if (activeIndex < 0) return;
        try { await navigator.clipboard.writeText(elDetail.textContent); } catch {}
      });

      elDownload?.addEventListener('click', () => {
        if (activeIndex < 0) return;
        const e = entries[activeIndex];
        const blob = new Blob([JSON.stringify(e, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const date = elDate.value || 'logs';
        a.download = 'log-' + date + '-entry-' + (activeIndex+1) + '.json';
          a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });

      elRefresh?.addEventListener('click', async () => {
        if (!elDate.value) return;
        entries = await fetchEntries(elDate.value);
        activeIndex = -1;
        renderList(entries);
        elDetail.textContent = 'Select an entry to view details…';
        elDetail.classList.add('empty');
      });

      async function boot() {
        try {
          const dates = await fetchDates();
          if (dates.length === 0) {
            elDate.innerHTML = '<option value=\"\">No logs found</option>';
            return;
          }
          let selected = initialDate && dates.includes(initialDate) ? initialDate : dates[dates.length-1];
          elDate.innerHTML = dates.map(d => '<option ' + (d===selected?'selected':'') + '>' + d + '</option>').join('');
          elDate.addEventListener('change', () => { activeIndex = -1; elDetail.textContent = 'Select an entry to view details…'; elDetail.classList.add('empty'); });
          entries = await fetchEntries(selected);
          renderList(entries);
          elLogin.style.display = 'none';
          elApp.style.display = 'block';
        } catch (err) {
          elErr.textContent = err?.message || 'Unauthorized';
        }
      }

      elForm.addEventListener('submit', (e) => {
        e.preventDefault();
        password = elPw.value || '';
        elErr.textContent = '';
        boot();
      });
    </script>
  </body>
</html>`;

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('[/logs] error', err);
    res.status(500).set('Content-Type', 'text/html; charset=utf-8').send('<!doctype html><html><body><h1>Error</h1><pre>' + (err?.message || 'Unknown error') + '</pre></body></html>');
  }
});

// Optional: manual trigger for debugging or webhook pinging (secured)
app.post("/run-job", async (req, res) => {
  try {
    const expected = process.env.JOB_AUTH_TOKEN;
    const provided = extractBearerToken(req);

    if (!expected || !tokensMatch(expected, provided)) {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
      console.warn(`[/run-job] Unauthorized attempt from ${ip}`);
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    await runJob();
    res.status(200).json({ ok: true, message: "Job executed." });
    notify(`⏱️ Job executed`);
  } catch (err) {
    console.error("[/run-job] Failed:", err);
    res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
    notify(`💥Job failed ${err}`);
  }
});

app.listen(PORT, HOST, () => {
  logNotify(`[Server] Listening on http://${HOST}:${PORT}`);
  logNotify(`[Server] Serving static from: ${staticPath}`);
  notify(`⏱️ Backend started`);
});
