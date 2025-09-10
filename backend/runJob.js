// runJob.js
import { fetchHeadlines } from "./services/fetchHeadlines.js";
import { summarizeNews } from "./services/summarizeNews.js";
import { clean } from "./services/clean.js";
import { generateSpeech } from "./services/speech.js";
import { saveFiles } from "./services/saveFiles.js";
import 'dotenv/config';
import { getAudioDurationFromBuffer } from "./services/getDuration.js";
import { notify, logNotify } from "./utils/notifier.js";
import { logSummary } from "./services/summaryLogger.js";

export async function runJob() {
  logNotify(`[RunJob] Starting News for Schmucks job...`);
  notify(`⏱️Job running`);


  try {
    const urls = await fetchHeadlines(process.env.NEWS_API_KEY);
    const summary = await summarizeNews(process.env.OPENAI_API_KEY, urls);
    // Append the raw generated summary to persistent JSONL log
    await logSummary(summary, urls, "./");
    logNotify(summary);

    const cleanText = clean(summary);

    const speech = await generateSpeech(process.env.OPENAI_API_KEY, cleanText);

    const duration = await getAudioDurationFromBuffer(speech);
    cleanText.duration = duration;

    await saveFiles("./", cleanText, speech);

    logNotify("✅ All done! Files written to storage directory.");
  } catch (err) {
    showErr(err);
    throw err; // bubble up so caller (cron, API endpoint) can handle
  }
}

function showErr(err) {
  if (err?.stack) {
    console.error(err.stack);
    return;
  }

  const data = err?.response?.data ?? err;
  if (Buffer.isBuffer(data)) {
    const text = data.toString("utf8");
    try {
      console.error("[HTTP Error JSON]", JSON.parse(text));
      notify(`💥[Backend job: HTTP Error JSON]\n${text}`);
    } catch {
      notify(`💥[Backend job: HTTP Error Text]\n${text}`);
      console.error("💥[Backend job: HTTP Error Text]", text);
    }
  } else {
    console.error("💥[Backend job: Error]", data);
    try {
      const msg = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      notify(`[💥Backend job: Error]\n${msg}`);
    } catch {
      notify(`💥[Backend job: Error]`);
    }
  }
}

// If you run `node runJob.js` directly, execute immediately
if (import.meta.url === `file://${process.argv[1]}`) {
  runJob().catch(() => process.exit(1));
}
