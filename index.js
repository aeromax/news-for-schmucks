// index.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { sendDiscordWebhook } from "./backend/utils/notify.js";
import { runJob } from "./backend/runJob.js";
import 'dotenv/config';
import { timingSafeEqual } from 'crypto';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

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

// Serve storage assets (audio, transcript)
app.use("/storage", express.static(storagePath));

// Root should serve the HTML file
app.get("/", (req, res) => {
  res.sendFile(path.join(staticPath, "index.html"));
});

// Lightweight view notification endpoint
app.post("/notify-view", express.json({ limit: '8kb' }), async (req, res) => {
  try {
    const ua = req.get('user-agent') || 'unknown';
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
    const meta = req.body || {};
    const pathViewed = meta.path || req.originalUrl;
    const tz = meta.tz || 'unknown-tz';
    const lang = meta.lang || 'unknown-lang';

    const msg = `Site view: ${pathViewed} | ip:${ip} | ua:${ua} | tz:${tz} | lang:${lang}`;
    await sendDiscordWebhook(msg);
    res.status(204).end();
  } catch (err) {
    console.error('[notify-view] error', err);
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
    sendDiscordWebhook(`News-for-Schmucks job executed`);
  } catch (err) {
    console.error("[/run-job] Failed:", err);
    res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
    sendDiscordWebhook(`News-for-Schmucks job failed ${err}`);
  }
});

app.listen(PORT, HOST, () => {
  console.log(`[Server] Listening on http://${HOST}:${PORT}`);
  console.log(`[Server] Serving static from: ${staticPath}`);
  sendDiscordWebhook(`News-for-Schmucks backend started`);
});
