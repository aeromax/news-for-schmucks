// runJob.js
import { fetchHeadlines } from "./services/fetchHeadlines.js";
import { summarizeNews } from "./services/summarizeNews.js";
import { clean } from "./services/clean.js";
import { generateSpeech } from "./services/speech.js";
import { saveFiles } from "./services/saveFiles.js";
import { env } from "./utils/env.js";
import { getAudioDuration } from "./services/getDuration.js";

const isTest = process.argv.includes("--test");

export async function runJob() {
  console.log(
    `[RunJob] Starting News for Schmucks job${isTest ? " (TEST MODE)" : ""}...`
  );

  try {
    const urls = await fetchHeadlines(env.NEWS_API_KEY, isTest);
    const summary = await summarizeNews(env.OPENAI_API_KEY, urls, isTest);
    console.log(summary);

    const cleanText = clean(summary);

    const speech = await generateSpeech(env.OPENAI_API_KEY, cleanText, isTest);

    const duration = await getAudioDuration("./test/audio.mp3");
    cleanText.duration = duration;

    await saveFiles("./", cleanText, speech);

    console.log("✅ All done! Files written to /public.");
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
    } catch {
      console.error("[HTTP Error Text]", text);
    }
  } else {
    console.error("[Error]", data);
  }
}

// If you run `node runJob.js` directly, execute immediately
if (import.meta.url === `file://${process.argv[1]}`) {
  runJob().catch(() => process.exit(1));
}
