// snarkynews-dist/index.js

import express from "express";
import cron from "node-cron";
import { fetchHeadlines } from "./backend/services/fetchHeadlines.js";
import { summarizeNews } from "./backend/services/summarizeNews.js";
import { clean } from "./backend/services/clean.js";
import { generateSpeech } from "./backend/services/speech.js";
import { saveFiles } from "./backend/services/saveFiles.js";
import { env } from "./backend/utils/env.js";
import { getAudioDuration } from "./backend/services/getDuration.js";

const isTest = process.argv.includes("--test");

const app = express();
const PORT = process.env.PORT || 3000;

// ENV vars you’ll need to set on Render:
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Daily cron job at 1 AM
cron.schedule("0 1 * * *", async () => {
  console.log("[Cron] Running daily headline-to-audio job");
  try {
    const urls = await fetchHeadlines(env.NEWS_API_KEY, isTest);
    const summary = await summarizeNews(env.OPENAI_API_KEY, urls, isTest);
    console.log(summary);
    const cleanText = clean(summary);
    const speech = await generateSpeech(env.OPENAI_API_KEY, cleanText, isTest);
    const duration = await getAudioDuration("./test/audio.mp3");
    cleanText.duration = duration;
    const updatedTranscript = cleanText;
    await saveFiles("./", updatedTranscript, speech);
    console.log("✅ All done! Files written to /public.");
  }
  catch (err) {
    // console.error("❌ Error during job:", err.response?.data || err.stack);
    showErr(err);
    process.exit(1);
  }
});

function showErr(err) {
  // Prefer full stack if available
  if (err?.stack) {
    console.error(err.stack);
    return;
  }

  // Axios error with possible buffer body
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