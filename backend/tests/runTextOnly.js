// runTextOnly.js
import { fetchHeadlines } from "../services/fetchHeadlines.js";
import { summarizeNews } from "../services/summarizeNews.js";
import { clean } from "../services/clean.js";
import 'dotenv/config';
import { logSummary } from "../services/summaryLogger.js";

export async function runTextOnlyJob() {
  // Notification removed
  try {
    const urls = await fetchHeadlines(process.env.NEWS_API_KEY);
    const summary = await summarizeNews(process.env.OPENAI_API_KEY, urls);
    // Append the raw generated summary to persistent JSONL log
    await logSummary(summary, urls, "./");
    const cleanText = clean(summary);

    // Notification removed
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
