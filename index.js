// index.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { sendDiscordWebhook } from "./backend/utils/notify.js";
import { runJob } from "./backend/runJob.js";
import 'dotenv/config';
 


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

//

// Optional: manual trigger for debugging or webhook pinging
app.get("/run-job", async (req, res) => {
  try {
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
