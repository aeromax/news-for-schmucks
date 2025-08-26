// index.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";

// CHANGE THIS import based on how you export runJob
// If runJob is a default export:
import { runJob } from "./backend/runJob.js";
// If it's a named export, use: import { runJob } from "./backend/runJob.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// Where your built/static files live. Adjust to "public" or "build" if that's your setup.
const STATIC_DIR = process.env.STATIC_DIR || "public";
const staticPath = path.join(__dirname, STATIC_DIR);

// Basic health check for Render
app.get("/healthz", (req, res) => res.status(200).send("ok"));

// Serve static assets
app.use(express.static(staticPath));

// Root should serve the HTML file
app.get("/", (req, res) => {
  res.sendFile(path.join(staticPath, "index.html"));
});

// Optional: manual trigger for debugging or webhook pinging
app.get("/run-job", async (req, res) => {
  try {
    await runJob();
    res.status(200).json({ ok: true, message: "Job executed." });
  } catch (err) {
    console.error("[/run-job] Failed:", err);
    res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
  }
});

// Schedule the cron only if you actually want it running on this instance
// Set CRON_ENABLED=false in Render env if you deploy multiple instances/jobs
if (process.env.CRON_ENABLED !== "false") {
  // Daily at 1 AM
  cron.schedule("0 1 * * *", async () => {
    console.log("[Cron] Triggered by schedule");
    try {
      await runJob();
      console.log("[Cron] Job completed");
    } catch (err) {
      console.error("[Cron] Job failed:", err);
    }
  });
}

app.listen(PORT, HOST, () => {
  console.log(`[Server] Listening on http://${HOST}:${PORT}`);
  console.log(`[Server] Serving static from: ${staticPath}`);
});
