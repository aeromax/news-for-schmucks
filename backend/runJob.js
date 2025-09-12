// runJob.js
import { summarizeNews } from "./services/summarizeNews.js";
import { buildRedditBundles, toPromptBlocks } from "./services/buildRedditBundles.js";
import { fetchOnThisDayEvent } from "./services/onThisDay.js";
import { redditBundlesConfig } from "./config/redditBundles.config.js";
import { clean } from "./services/clean.js";
import { generateSpeech } from "./services/speech.js";
import { saveFiles } from "./services/saveFiles.js";
import 'dotenv/config';
import { getAudioDurationFromBuffer } from "./services/getDuration.js";
import { notify, logNotify } from "./utils/notifier.js";
import { logSummary } from "./services/summaryLogger.js";

export async function runJob() {
  logNotify(`[RunJob] Starting News for Schmucks job...`);

  try {
    const bundles = await buildRedditBundles(redditBundlesConfig);
    let onThisDay = '';
    try { const ev = await fetchOnThisDayEvent(); onThisDay = ev?.text || ''; } catch {}
    const prompt = toPromptBlocks(bundles, { ...(redditBundlesConfig.prompt || {}), onThisDayText: onThisDay });
    const summary = await summarizeNews(process.env.OPENAI_API_KEY, null, { prompt });
    // Append the raw generated summary to persistent JSON log
    await logSummary(summary, null, "./");
    const cleanText = clean(summary);
    const speech = await generateSpeech(process.env.OPENAI_API_KEY, cleanText);
    const duration = await getAudioDurationFromBuffer(speech);
    cleanText.duration = duration;
    await saveFiles("./", cleanText, speech);

    logNotify("All done! Files written to storage directory.");
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
