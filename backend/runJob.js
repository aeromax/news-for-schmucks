// runJob.js
import { fetchHeadlines } from "./services/fetchHeadlines.js";
import { summarizeNews } from "./services/summarizeNews.js";
import { clean } from "./services/clean.js";
import { generateSpeech } from "./services/speech.js";
import { saveFiles } from "./services/saveFiles.js";
import { env } from "./utils/env.js";
import { getAudioDurationFromBuffer } from "./services/getDuration.js";
import { sendDiscordWebhook } from "./utils/notify.js";

export async function runJob() {
  console.log(`[RunJob] Starting News for Schmucks job...`);
  sendDiscordWebhook(`News for Schmucks job running`);


  try {
    const urls = await fetchHeadlines(env.NEWS_API_KEY);
    const summary = await summarizeNews(env.OPENAI_API_KEY, urls);
    console.log(summary);

    const cleanText = clean(summary);

    const speech = await generateSpeech(env.OPENAI_API_KEY, cleanText);

    const duration = await getAudioDurationFromBuffer(speech);
    cleanText.duration = duration;

    await saveFiles("./", cleanText, speech);

    console.log("✅ All done! Files written to storage directory.");
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
      sendDiscordWebhook("[HTTP Error JSON]", JSON.parse(text));
      console.error("[HTTP Error JSON]", JSON.parse(text));
    } catch {
      sendDiscordWebhook("[HTTP Error Text]", text);
      console.error("[HTTP Error Text]", text);
    }
  } else {
    sendDiscordWebhook("[Error]", data);
    console.error("[Error]", data);
  }
}

// If you run `node runJob.js` directly, execute immediately
if (import.meta.url === `file://${process.argv[1]}`) {
  runJob().catch(() => process.exit(1));
}
