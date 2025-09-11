// runJob.js
import { fetchHeadlines } from "./services/fetchHeadlines.js";
import { summarizeNews } from "./services/summarizeNews.js";
import { clean } from "./services/clean.js";
import { generateSpeech } from "./services/speech.js";
import { saveFiles } from "./services/saveFiles.js";
import 'dotenv/config';
import { getAudioDurationFromBuffer } from "./services/getDuration.js";
import { logNotify } from "./utils/notifier.js";
import { logSummary } from "./services/summaryLogger.js";

export async function runJob() {
  // Indicate start of a new backend job
  try { logNotify(`[RunJob] Starting News for Schmucks job...`); } catch {}


  try {
    const urls = await fetchHeadlines(process.env.NEWS_API_KEY);
    const summary = await summarizeNews(process.env.OPENAI_API_KEY, urls);
    // Append the raw generated summary to persistent JSONL log
    await logSummary(summary, urls, "./");
    // Notification removed

    const cleanText = clean(summary);

    const speech = await generateSpeech(process.env.OPENAI_API_KEY, cleanText);

    const duration = await getAudioDurationFromBuffer(speech);
    cleanText.duration = duration;

    await saveFiles("./", cleanText, speech);

    // Notification removed
  } catch (err) {
    showErr(err);
    throw err; // bubble up so caller (cron, API endpoint) can handle
  }
}

function showErr(err) {
  if (err?.stack) {
    console.error(err.stack);
    try { logNotify(`[runJob.js] ${err.stack}`); } catch {}
    return;
  }

  const data = err?.response?.data ?? err;
  if (Buffer.isBuffer(data)) {
    const text = data.toString("utf8");
    try {
      console.error("[HTTP Error JSON]", JSON.parse(text));
      try { logNotify(`[runJob.js] [HTTP Error JSON] ${text}`); } catch {}
    } catch {
      console.error("💥[Backend job: HTTP Error Text]", text);
      try { logNotify(`[runJob.js] [HTTP Error Text] ${text}`); } catch {}
    }
  } else {
    console.error("💥[Backend job: Error]", data);
    try {
      const msg = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      logNotify(`[runJob.js] ${msg}`);
    } catch {}
  }
}

// If you run `node runJob.js` directly, execute immediately
if (import.meta.url === `file://${process.argv[1]}`) {
  runJob().catch(() => process.exit(1));
}
