import express from "express";
import cron from "node-cron";
import "./backend/runJob.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Daily cron job at 1 AM
cron.schedule("0 1 * * *", async () => {
  console.log("[Cron] Triggered by schedule");
  try {
    await runJob();
  } catch (err) {
    console.error("[Cron] Job failed");
  }
});

app.listen(PORT, () => console.log(`[Server] Listening on port ${PORT}`));


// Optional: manual trigger for debugging or webhook pinging
app.get("/run-job", async (req, res) => {
  try {
    await runJob();
    res.status(200).json({ ok: true, message: "Job executed." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
