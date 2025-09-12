// runTextOnly.js
import { summarizeNews } from "./services/summarizeNews.js";
import { buildRedditBundles, toPromptBlocks } from "./services/buildRedditBundles.js";
import { fetchOnThisDayEvent } from "./services/onThisDay.js";
import { redditBundlesConfig } from "./config/redditBundles.config.js";
import { clean } from "./services/clean.js";
import 'dotenv/config';
import { logSummary } from "./services/summaryLogger.js";

export async function runTextOnlyJob() {
  console.log(`[RunTextOnly] Starting text-only generation...`);
  try {
    const bundles = await buildRedditBundles(redditBundlesConfig);
    let onThisDay = '';
    try { const ev = await fetchOnThisDayEvent(); onThisDay = ev?.text || ''; } catch {}
    const prompt = toPromptBlocks(bundles, { ...(redditBundlesConfig.prompt || {}), onThisDayText: onThisDay });
    const summary = await summarizeNews(process.env.OPENAI_API_KEY, null, { prompt });
    // Append the raw generated summary to persistent JSONL log
    await logSummary(summary, null, "./");
    const cleanText = clean(summary);

    console.log("✅ Text-only generation complete (no audio, no save).");
  } catch (err) {
    // Keep error logging simple and local to avoid webhooks or file writes
    if (err?.stack) console.error(err.stack);
    else console.error(err);
    process.exitCode = 1;
  }
}

// If invoked directly, execute immediately
if (import.meta.url === `file://${process.argv[1]}`) {
  runTextOnlyJob();
}

