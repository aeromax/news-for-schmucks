// runTextOnly.js
import { fetchHeadlines } from "./services/fetchHeadlines.js";
import { summarizeNews } from "./services/summarizeNews.js";
import { clean } from "./services/clean.js";
import { env } from "./utils/env.js";

export async function runTextOnlyJob() {
  console.log(`[RunTextOnly] Starting text-only generation...`);
  try {
    const urls = await fetchHeadlines(env.NEWS_API_KEY);
    const summary = await summarizeNews(env.OPENAI_API_KEY, urls);
    const cleanText = clean(summary);

    // Output the transcript JSON to stdout for tests and inspection
    // Matches the shape consumed by the frontend without writing files
    console.log(JSON.stringify({ captions: cleanText }, null, 2));
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

