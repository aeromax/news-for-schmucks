// index.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { logNotify, notify } from "./backend/utils/notifier.js";
import { runJob } from "./backend/runJob.js";
import 'dotenv/config';
import { timingSafeEqual } from 'crypto';
import fs from "fs/promises";
import { listInstructions, upsertInstruction, removeInstruction } from "./backend/services/summarizerInstructions.js";
// Email sending disabled; replaced with Discord notify


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
// Prefer /var/data if it exists, then fall back to configured storagePath
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
    } catch { }
  }
  return '';
}

// Unified storage endpoint to serve whitelisted files
const STORAGE_MIME = new Map([
  ['audio.mp3', 'audio/mpeg'],
  ['transcript.json', 'application/json; charset=utf-8'],
]);

app.get('/storage/:name', async (req, res) => {
  try {
    const name = String(req.params.name || '').toLowerCase();
    if (!STORAGE_MIME.has(name)) {
      return res.status(404).json({ ok: false, error: 'not found' });
    }
    const file = await resolveAsset(name);
    if (!file) return res.status(404).json({ ok: false, error: 'not found' });
    res.set('Content-Type', STORAGE_MIME.get(name));
    res.set('Cache-Control', 'no-store');
    res.set('Access-Control-Allow-Origin', '*');
    res.sendFile(file);
  } catch (err) {
    const msg = err?.stack || err?.message || String(err);
    logNotify(`[index.js:/storage] ${msg}`);
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

    const ipLower = ip.toLowerCase();
    const blockedIps = new Set(['0.0.0.0', '38.81.107.160', 'localhost', '127.0.0.1']);
    const isInternalIp = ipLower.startsWith('192.168.');
    if (blockedIps.has(ipLower) || isInternalIp) {
      return res.status(204).end();
    }

    // Start with ip, then append host/city/region and a newline, then other fields
    let msg = `🙋 Site view: ● ip:${ip}`;

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
    // msg += ` | ua:${ua}`;

    // Fire-and-forget notification
    try { logNotify(msg); } catch { }
    res.status(204).end();
  } catch (err) {
    const msg = err?.stack || err?.message || String(err);
    logNotify(`[index.js:/notify-view] ${msg}`);
    res.status(500).json({ ok: false });
  }
});

// Contact form endpoint
const contactParser = express.json({ limit: '32kb' });
const RATE_LIMIT = new Map(); // ip -> { lastTs, count }
const adminJsonParser = express.json({ limit: '16kb' });

function tooMany(ip) {
  const now = Date.now();
  const rec = RATE_LIMIT.get(ip) || { lastTs: 0, count: 0 };
  // Reset window every 5 minutes
  if (now - rec.lastTs > 5 * 60 * 1000) { rec.count = 0; rec.lastTs = now; }
  rec.count += 1;
  rec.lastTs = now;
  RATE_LIMIT.set(ip, rec);
  return rec.count > 8; // max 8 posts per 5 minutes per IP
}

app.post('/contact', contactParser, async (req, res) => {
  try {
    const ipRaw = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
    const ipFirst = String(ipRaw).split(',')[0].trim();
    const ip = ipFirst.startsWith('::ffff:') ? ipFirst.slice(7) : ipFirst;
    if (tooMany(ip)) return res.status(429).json({ ok: false, error: 'Too many requests' });

    const body = req.body || {};
    const name = (body.name || '').toString().trim().slice(0, 200);
    const email = (body.email || '').toString().trim().slice(0, 320);
    const message = (body.message || '').toString().trim().slice(0, 5000);
    const website = (body.website || '').toString().trim(); // honeypot
    const human = !!body.human;
    const dwellMs = parseInt(body.dwellMs || '0', 10) || 0;

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!isEmail) return res.status(400).json({ ok: false, error: 'Invalid email' });
    if (!message) return res.status(400).json({ ok: false, error: 'Message required' });
    if (website) return res.status(400).json({ ok: false, error: 'Blocked' });
    if (!human) return res.status(400).json({ ok: false, error: 'Confirm human' });
    if (dwellMs > 0 && dwellMs < 3000) return res.status(400).json({ ok: false, error: 'Too fast' });

    const to = process.env.CONTACT_TO || 'newsforschmucks@maxpalmer.design';
    const subject = `**Feedback from ${name || email}**`;
    const lines = [
      `Email: ${email}\n`,
      `--- Message ---\n`,
      message,
      `\n--------------\nTime: ${new Date().toISOString()}`,
    ];
    const text = lines.join('');

    // Log locally to a JSONL file (best-effort, non-blocking)
    try {
      const logLine = JSON.stringify({
        ts: new Date().toISOString(), ip, name, email, dwellMs,
        message
      }) + '\n';
      const logPath = path.join(storagePath, 'contact-messages.jsonl');
      await fs.mkdir(path.dirname(logPath), { recursive: true }).catch(() => { });
      await fs.appendFile(logPath, logLine, 'utf8').catch(() => { });
    } catch { }

    // Try to notify Discord, but do not fail the request if it errors
    let notified = false;
    try {
      await notify(`📬 ${subject}\n\n${text}`);
      notified = true;
    } catch (err) {
      logNotify(`[index.js:/contact] notify failed: ${err?.message || err}`);
    }

    const debug = (process.env.CONTACT_DEBUG || '').toLowerCase();
    if (debug === '1' || debug === 'true') {
      return res.json({ ok: true, notified });
    }
    return res.json({ ok: true });
  } catch (err) {
    const msg = err?.stack || err?.message || String(err);
    logNotify(`[index.js:/contact] ${msg}`);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// Email transport verify endpoint removed (email disabled)

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

async function ensureAdminAuth(req, res, label) {
  const expected = process.env.LOGS_PASSWORD || '';
  const provided = extractLogsPassword(req);
  if (!expected || !tokensMatch(expected, provided)) {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
    const ua = req.get('user-agent') || 'unknown';
    try { await notify(`[index.js:${label}] Unauthorized access from ${ip} | ua:${ua}`); } catch { }
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

// Password-protected endpoint to view JSONL summary logs (API)
// Usage: GET /api/logs?date=YYYY-MM-DD&limit=50 (send password via header: x-logs-password)
app.get('/api/logs', async (req, res) => {
  try {
    const expected = process.env.LOGS_PASSWORD || '';
    const provided = extractLogsPassword(req);

    if (!expected || !tokensMatch(expected, provided)) {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
      const ua = req.get('user-agent') || 'unknown';
      try { await notify(`[index.js:/api/logs] Unauthorized access from ${ip} | ua:${ua}`); } catch { }
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
    const msg = err?.stack || err?.message || String(err);
    logNotify(`[index.js:/api/logs] ${msg}`);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// Summarizer instruction admin API
app.get('/api/instructions', async (req, res) => {
  try {
    if (!await ensureAdminAuth(req, res, '/api/instructions')) return;
    const instructions = await listInstructions(__dirname);
    res.json({ ok: true, instructions });
  } catch (err) {
    const msg = err?.stack || err?.message || String(err);
    logNotify(`[index.js:/api/instructions(GET)] ${msg}`);
    res.status(500).json({ ok: false, error: 'Failed to load instructions' });
  }
});

app.post('/api/instructions', adminJsonParser, async (req, res) => {
  try {
    if (!await ensureAdminAuth(req, res, '/api/instructions')) return;
    const body = req.body || {};
    const type = body?.type === 'next' ? 'next' : 'date';
    const text = body?.text ?? '';
    const date = type === 'date' ? (body?.date || '') : undefined;
    const instructions = await upsertInstruction({ type, date, text }, __dirname);
    res.json({ ok: true, instructions });
  } catch (err) {
    const status = err?.message === 'Instruction text required' || err?.message?.includes('Date is required') ? 400 : 500;
    const msg = err?.stack || err?.message || String(err);
    logNotify(`[index.js:/api/instructions(POST)] ${msg}`);
    res.status(status).json({ ok: false, error: err?.message || 'Failed to save instruction' });
  }
});

app.delete('/api/instructions/:key', async (req, res) => {
  try {
    if (!await ensureAdminAuth(req, res, '/api/instructions')) return;
    const key = String(req.params?.key || '').trim() || '';
    const instructions = await removeInstruction(key || undefined, __dirname);
    res.json({ ok: true, instructions });
  } catch (err) {
    const msg = err?.stack || err?.message || String(err);
    logNotify(`[index.js:/api/instructions(DELETE)] ${msg}`);
    res.status(500).json({ ok: false, error: 'Failed to delete instruction' });
  }
});

// Unified admin dashboard (instructions + logs)
app.get('/admin', async (req, res) => {
  try {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const initialDate = (req.query?.date ? String(req.query.date) : `${yyyy}-${mm}-${dd}`).slice(0, 10);
    const today = `${yyyy}-${mm}-${dd}`;

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>News for Schmucks — Admin</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        --bg:#0b0c10;
        --fg:#eaf0f6;
        --muted:#a0aab8;
        --accent:#ff3083;
        --accent2:#4aa3ff;
        --card:#15171c;
        --border:#232730;
      }
      * { box-sizing:border-box; }
      body {
        margin:0;
        font-family: system-ui,-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background:var(--bg);
        color:var(--fg);
      }
      h1,h2,h3 { margin:0; font-weight:600; }
      a { color:var(--accent2); }
      button {
        cursor:pointer;
        border:none;
        border-radius:6px;
        background:var(--accent);
        color:#0b0c10;
        font-weight:600;
        padding:9px 14px;
      }
      button.secondary {
        background:#222836;
        color:var(--fg);
      }
      button.ghost {
        background:transparent;
        border:1px solid #2d3240;
        color:var(--muted);
      }
      input[type="date"], textarea, select {
        width:100%;
        background:#0f1218;
        color:var(--fg);
        border:1px solid #303540;
        border-radius:6px;
        padding:8px;
      }
      textarea { min-height:110px; resize:vertical; }
      label { font-weight:600; margin-bottom:6px; display:block; }

      #login {
        max-width: 420px;
        margin: 18vh auto;
        background: var(--card);
        padding: 28px;
        border-radius: 12px;
        border:1px solid var(--border);
        box-shadow: 0 18px 42px rgba(0,0,0,0.36);
      }
      #login h2 { margin:0 0 12px; font-size:20px; }
      #login form { display:flex; gap:10px; margin-top:18px; }
      #login input[type="password"] {
        flex:1;
        background:#10131b;
        color:var(--fg);
        border:1px solid #303540;
        border-radius:6px;
        padding:10px;
      }
      #error { color:#ff6b6b; margin-top:12px; min-height:1.2em; }
      #app { display:none; }

      header.top {
        display:flex;
        flex-wrap:wrap;
        gap:16px;
        align-items:center;
        justify-content:space-between;
        padding:24px 28px 12px;
      }
      header.top h1 { font-size:22px; }
      nav.tabs {
        display:flex;
        gap:8px;
      }
      nav.tabs button {
        background:#20232d;
        color:var(--muted);
        padding:8px 18px;
        border-radius:999px;
        transition: background 0.2s ease, color 0.2s ease;
      }
      nav.tabs button.active {
        background:var(--accent);
        color:#0b0c10;
      }

      main {
        padding:0 28px 40px;
      }
      .panel {
        display:none;
      }
      .panel.active { display:block; }

      .card {
        background:var(--card);
        border:1px solid var(--border);
        border-radius:12px;
        padding:24px;
        margin-bottom:24px;
        box-shadow: 0 12px 28px rgba(0,0,0,0.28);
      }
      .card h2 { margin-bottom:12px; }
      .muted { color:var(--muted); font-size:14px; }

      .instructions-list ul {
        list-style:none;
        margin:0;
        padding:0;
        display:flex;
        flex-direction:column;
        gap:12px;
      }
      .instructions-list li {
        border:1px solid #20242d;
        border-radius:10px;
        background:#10131b;
        padding:14px 16px;
        display:flex;
        gap:12px;
        justify-content:space-between;
        align-items:flex-start;
      }
      .instructions-list .entry-text {
        margin-top:6px;
        white-space:pre-wrap;
      }
      .entry-meta {
        display:flex;
        gap:12px;
        align-items:center;
        flex-wrap:wrap;
      }
      .instructions-actions {
        display:flex;
        gap:8px;
      }

      .logs-layout {
        display:grid;
        grid-template-columns:320px 1fr;
        gap:16px;
        margin-top:16px;
        min-height:360px;
      }
      .logs-sidebar {
        border:1px solid #20242d;
        border-radius:12px;
        background:#10131b;
        overflow:auto;
      }
      .logs-sidebar ul {
        list-style:none;
        margin:0;
        padding:0;
      }
      .logs-sidebar li {
        border-bottom:1px solid #1c2028;
        padding:12px 14px;
        cursor:pointer;
      }
      .logs-sidebar li:hover { background:#111722; }
      .logs-sidebar li.active {
        background:#0b1220;
        border-left:3px solid var(--accent2);
        padding-left:11px;
      }
      .log-detail {
        border:1px solid #20242d;
        border-radius:12px;
        background:#10131b;
        display:flex;
        flex-direction:column;
      }
      .entry-actions {
        display:flex;
        gap:10px;
        padding:10px 12px;
        border-bottom:1px solid #20242d;
        background:#161922;
      }
      pre#logDetail {
        flex:1;
        margin:0;
        padding:16px;
        white-space:pre-wrap;
        word-break:break-word;
        color:var(--fg);
      }
      pre#logDetail.empty {
        color:var(--muted);
      }
      .controls-row {
        display:flex;
        gap:12px;
        flex-wrap:wrap;
        align-items:flex-end;
      }
      .controls-row .field {
        min-width:220px;
        flex:1;
      }

      @media (max-width:960px) {
        .logs-layout {
          grid-template-columns:1fr;
        }
      }
      @media (max-width:720px) {
        header.top {
          padding:20px 20px 10px;
        }
        main { padding:0 20px 32px; }
        .card { padding:20px; }
      }
    </style>
  </head>
  <body>
    <div id="login">
      <h2>Admin Access</h2>
      <p class="muted">Enter the logs password to manage intro instructions and review summaries.</p>
      <form id="loginForm">
        <input id="pw" type="password" placeholder="Password" autocomplete="current-password" required />
        <button type="submit">Unlock</button>
      </form>
      <div id="error"></div>
    </div>

    <div id="app">
      <header class="top">
        <h1>News for Schmucks — Admin Dashboard</h1>
        <nav class="tabs">
          <button type="button" data-view="instructions" class="active">Instructions</button>
          <button type="button" data-view="logs">Logs</button>
        </nav>
      </header>

      <main>
        <section id="panel-instructions" class="panel active">
          <div class="card">
            <h2>Next Run Instruction</h2>
            <p class="muted">This note is spoken immediately after the history line on the next job. It is consumed once.</p>
            <form id="nextForm">
              <label for="nextText">Instruction (max 500 characters)</label>
              <textarea id="nextText" maxlength="500" placeholder="Example: Oh, and happy Hanukkah, schmucks. Light those candles."></textarea>
              <div class="instructions-actions" style="margin-top:12px;">
                <button type="submit">Save for Next Job</button>
                <button type="button" id="clearNext" class="secondary">Clear</button>
              </div>
            </form>
          </div>

          <div class="card">
            <h2>Date-Specific Instruction</h2>
            <p class="muted">Queue a note for a specific run date (UTC). These persist until you replace or remove them.</p>
            <form id="dateForm">
              <div class="controls-row">
                <div class="field" style="max-width:200px;">
                  <label for="dateInput">Run date</label>
                  <input id="dateInput" type="date" value="${today}" required />
                </div>
              </div>
              <label for="dateText" style="margin-top:12px;">Instruction (max 500 characters)</label>
              <textarea id="dateText" maxlength="500" placeholder="Example: Reminder: recordings move to Wednesdays next week."></textarea>
              <div class="instructions-actions" style="margin-top:12px;">
                <button type="submit">Save for Date</button>
                <button type="button" id="clearDate" class="secondary">Remove Date Instruction</button>
              </div>
            </form>
          </div>

          <div class="card instructions-list">
            <h2>Scheduled Instructions</h2>
            <ul id="instructionList">
              <li><div><strong>No instructions scheduled.</strong><p class="muted">Add one above to customize the intro.</p></div></li>
            </ul>
          </div>
        </section>

        <section id="panel-logs" class="panel">
          <div class="card">
            <h2>Summary Logs</h2>
            <p class="muted">Browse stored summaries to see what the model generated for each run.</p>
            <div class="controls-row" style="margin-top:16px;">
              <div class="field" style="max-width:220px;">
                <label for="logDate">Date</label>
                <select id="logDate"></select>
              </div>
              <div>
                <button type="button" id="refreshLogs" class="ghost">Refresh</button>
              </div>
            </div>

            <div class="logs-layout">
              <aside class="logs-sidebar">
                <ul id="logList"></ul>
              </aside>
              <div class="log-detail">
                <div class="entry-actions">
                  <button type="button" id="copyLog" class="secondary">Copy JSON</button>
                  <button type="button" id="downloadLog" class="secondary">Download JSON</button>
                </div>
                <pre id="logDetail" class="empty">Select an entry to view details…</pre>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>

    <script>
      const initialDate = ${JSON.stringify(initialDate)};
      const defaultDate = ${JSON.stringify(today)};
      let password = '';

      const elLogin = document.getElementById('login');
      const elForm = document.getElementById('loginForm');
      const elPw = document.getElementById('pw');
      const elErr = document.getElementById('error');
      const elApp = document.getElementById('app');

      const tabButtons = Array.from(document.querySelectorAll('[data-view]'));
      const panels = {
        instructions: document.getElementById('panel-instructions'),
        logs: document.getElementById('panel-logs')
      };

      const elNextForm = document.getElementById('nextForm');
      const elNextText = document.getElementById('nextText');
      const elClearNext = document.getElementById('clearNext');
      const elDateForm = document.getElementById('dateForm');
      const elDateInput = document.getElementById('dateInput');
      const elDateText = document.getElementById('dateText');
      const elClearDate = document.getElementById('clearDate');
      const elInstructionList = document.getElementById('instructionList');

      const elLogDate = document.getElementById('logDate');
      const elRefreshLogs = document.getElementById('refreshLogs');
      const elLogList = document.getElementById('logList');
      const elLogDetail = document.getElementById('logDetail');
      const elCopyLog = document.getElementById('copyLog');
      const elDownloadLog = document.getElementById('downloadLog');

      let instructions = { byDate: {}, next: null };
      let logDates = [];
      let logEntries = [];
      let activeEntry = -1;
      let selectedDate = initialDate;

      function setView(view) {
        tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
        Object.entries(panels).forEach(([key, panel]) => {
          panel.classList.toggle('active', key === view);
        });
      }

      tabButtons.forEach(btn => {
        btn.addEventListener('click', () => setView(btn.dataset.view));
      });

      function sanitizeHtml(text) {
        return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      function renderInstructions() {
        const entries = [];
        if (instructions.next && instructions.next.text) {
          entries.push({
            id: 'next',
            label: 'Next Run',
            text: instructions.next.text,
            updatedAt: instructions.next.updatedAt
          });
        }
        Object.keys(instructions.byDate || {}).sort().forEach(date => {
          const item = instructions.byDate[date];
          entries.push({
            id: date,
            label: date,
            text: item?.text || '',
            updatedAt: item?.updatedAt
          });
        });

        if (!entries.length) {
          elInstructionList.innerHTML = '<li><div><strong>No instructions scheduled.</strong><p class="muted">Add one above to customize the intro.</p></div></li>';
          return;
        }

        elInstructionList.innerHTML = entries.map(entry => {
          const meta = entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : '';
          const escaped = sanitizeHtml(entry.text);
          return '<li data-id=\"' + entry.id + '\">\
            <div style=\"flex:1;\">\
              <div class=\"entry-meta\"><strong>' + entry.label + '</strong>' + (meta ? '<span class=\"muted\">Updated ' + meta + '</span>' : '') + '</div>\
              <p class=\"entry-text\">' + (escaped || '<span class=\"muted\">(no text)</span>') + '</p>\
            </div>\
            <div class=\"instructions-actions\">\
              <button type=\"button\" class=\"secondary\" data-remove=\"' + entry.id + '\">Delete</button>\
            </div>\
          </li>';
        }).join('');
      }

      function renderLogDates() {
        if (!logDates.length) {
          selectedDate = '';
          elLogDate.innerHTML = '<option value=\"\">No logs found</option>';
          return;
        }
        if (!selectedDate || !logDates.includes(selectedDate)) {
          selectedDate = logDates[logDates.length - 1];
        }
        elLogDate.innerHTML = logDates.map(date => '<option value=\"' + date + '\"' + (date === selectedDate ? ' selected' : '') + '>' + date + '</option>').join('');
      }

      function renderLogEntries() {
        elLogList.innerHTML = '';
        if (!logEntries.length) {
          elLogList.innerHTML = '<li><div><strong>No entries for this date.</strong></div></li>';
          elLogDetail.classList.add('empty');
          elLogDetail.textContent = 'No entries loaded.';
          activeEntry = -1;
          return;
        }

        logEntries.forEach((entry, idx) => {
          const li = document.createElement('li');
          li.dataset.index = String(idx);
          const text = Array.isArray(entry.text) ? entry.text.join('\\n') : (entry.text || '');
          const preview = text.slice(0, 140).replace(/\\s+/g, ' ').trim();
          li.innerHTML = '<div><strong>' + (idx + 1) + '.</strong> ' + (preview || '<span class=\"muted\">(no text)</span>') + '</div>' +
                         '<div class=\"muted\">' + (entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '') + '</div>';
          if (idx === activeEntry) li.classList.add('active');
          elLogList.appendChild(li);
        });
        if (activeEntry >= 0 && logEntries[activeEntry]) {
          elLogDetail.classList.remove('empty');
          elLogDetail.textContent = JSON.stringify(logEntries[activeEntry], null, 2);
        } else {
          elLogDetail.classList.add('empty');
          elLogDetail.textContent = 'Select an entry to view details…';
        }
      }

      elInstructionList.addEventListener('click', async (event) => {
        const id = event.target?.dataset?.remove;
        if (!id) return;
        try {
          const data = await api('DELETE', '/api/instructions/' + encodeURIComponent(id));
          instructions = data.instructions || { byDate: {}, next: null };
          renderInstructions();
        } catch (err) {
          alert(err.message);
        }
      });

      elLogList.addEventListener('click', (event) => {
        const li = event.target.closest('li[data-index]');
        if (!li) return;
        const idx = Number(li.dataset.index);
        if (Number.isNaN(idx)) return;
        activeEntry = idx;
        renderLogEntries();
      });

      async function api(method, url, body, options = {}) {
        const { allow404 = false } = options || {};
        const headers = { 'x-logs-password': password };
        const requestOptions = { method, headers };
        if (body !== undefined) {
          headers['Content-Type'] = 'application/json';
          requestOptions.body = JSON.stringify(body);
        }
        const res = await fetch(url, requestOptions);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
          if (allow404 && res.status === 404) {
            return { ok: true, notFound: true };
          }
          throw new Error(data?.error || 'Request failed');
        }
        return data;
      }

      async function loadInstructions() {
        const data = await api('GET', '/api/instructions');
        instructions = data.instructions || { byDate: {}, next: null };
        renderInstructions();
      }

      async function loadLogDates() {
        const data = await api('GET', '/api/logs/dates');
        logDates = data.dates || [];
        renderLogDates();
      }

      async function loadLogEntries() {
        if (!selectedDate) {
          logEntries = [];
          renderLogEntries();
          return;
        }
        const data = await api('GET', '/api/logs?date=' + encodeURIComponent(selectedDate) + '&limit=0', undefined, { allow404: true });
        if (data?.notFound) {
          logEntries = [];
        } else {
          logEntries = data.entries || [];
        }
        activeEntry = -1;
        renderLogEntries();
      }

      elNextForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          const payload = { type: 'next', text: elNextText.value || '' };
          const data = await api('POST', '/api/instructions', payload);
          instructions = data.instructions || { byDate: {}, next: null };
          elNextText.value = '';
          renderInstructions();
          alert('Next run instruction saved.');
        } catch (err) {
          alert(err.message);
        }
      });

      elClearNext.addEventListener('click', async () => {
        try {
          const data = await api('DELETE', '/api/instructions/next');
          instructions = data.instructions || { byDate: {}, next: null };
          renderInstructions();
        } catch (err) {
          alert(err.message);
        }
      });

      elDateForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          const payload = {
            type: 'date',
            date: elDateInput.value,
            text: elDateText.value || ''
          };
          const data = await api('POST', '/api/instructions', payload);
          instructions = data.instructions || { byDate: {}, next: null };
          elDateText.value = '';
          renderInstructions();
          alert('Instruction saved for ' + elDateInput.value + '.');
        } catch (err) {
          alert(err.message);
        }
      });

      elClearDate.addEventListener('click', async () => {
        if (!elDateInput.value) return;
        try {
          const data = await api('DELETE', '/api/instructions/' + encodeURIComponent(elDateInput.value));
          instructions = data.instructions || { byDate: {}, next: null };
          renderInstructions();
        } catch (err) {
          alert(err.message);
        }
      });

      elLogDate.addEventListener('change', async () => {
        selectedDate = elLogDate.value || '';
        await loadLogEntries();
      });

      elRefreshLogs.addEventListener('click', async () => {
        await loadLogDates();
        await loadLogEntries();
      });

      elCopyLog.addEventListener('click', async () => {
        if (activeEntry < 0 || !logEntries[activeEntry]) return;
        try {
          await navigator.clipboard.writeText(JSON.stringify(logEntries[activeEntry], null, 2));
        } catch (err) {
          alert('Copy failed');
        }
      });

      elDownloadLog.addEventListener('click', () => {
        if (activeEntry < 0 || !logEntries[activeEntry]) return;
        const blob = new Blob([JSON.stringify(logEntries[activeEntry], null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const date = selectedDate || 'logs';
        link.download = 'log-' + date + '-entry-' + (activeEntry + 1) + '.json';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 1000);
      });

      async function boot() {
        try {
          await Promise.all([loadInstructions(), loadLogDates()]);
          await loadLogEntries();
          elLogin.style.display = 'none';
          elApp.style.display = 'block';
        } catch (err) {
          password = '';
          elErr.textContent = err?.message || 'Unauthorized';
        }
      }

      elForm.addEventListener('submit', (event) => {
        event.preventDefault();
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
    const msg = err?.stack || err?.message || String(err);
    logNotify(`[index.js:/admin] ${msg}`);
    res.status(500).set('Content-Type', 'text/plain; charset=utf-8').send('Internal Server Error');
  }
});

// List available log dates (filenames) (API)
// GET /api/logs/dates (send password via header: x-logs-password)
app.get('/api/logs/dates', async (req, res) => {
  try {
    const expected = process.env.LOGS_PASSWORD || '';
    const provided = extractLogsPassword(req);
    if (!expected || !tokensMatch(expected, provided)) {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
      const ua = req.get('user-agent') || 'unknown';
      try { await notify(`[index.js:/api/logs/dates] Unauthorized access from ${ip} | ua:${ua}`); } catch { }
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
    const msg = err?.stack || err?.message || String(err);
    logNotify(`[index.js:/api/logs/dates] ${msg}`);
    res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// Simple HTML viewer for logs with selection
// Optional: manual trigger for debugging or webhook pinging (secured)
app.post("/run-job", async (req, res) => {
  try {
    const expected = process.env.JOB_AUTH_TOKEN;
    const provided = extractBearerToken(req);

    if (!expected || !tokensMatch(expected, provided)) {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
      const ua = req.get('user-agent') || 'unknown';
      console.warn(`[/run-job] Unauthorized attempt from ${ip}`);
      try { await notify(`[index.js:/run-job] Unauthorized attempt from ${ip} | ua:${ua}`); } catch { }
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    // Notify that a job was started (include requester context)
    try {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
      const ua = req.get('user-agent') || 'unknown';
      logNotify(`[index.js:/run-job] Job start requested from ${ip} | ua:${ua}`);
    } catch { }

    await runJob();
    res.status(200).json({ ok: true, message: "Job executed." });
  } catch (err) {
    const msg = err?.stack || err?.message || String(err);
    logNotify(`[index.js:/run-job] ${msg}`);
    res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`[Server] Listening on http://${HOST}:${PORT}`);
  console.log(`[Server] Serving static from: ${staticPath}`);
});
