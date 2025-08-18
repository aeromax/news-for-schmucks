// runJob.js

import { fetchHeadlines } from "./services/fetchHeadlines.js";
import { summarizeNews } from "./services/summarizeNews.js";
import { clean } from "./services/clean.js";
import { generateSpeech } from "./services/speech.js";
import { saveFiles } from "./services/saveFiles.js";
import { shouldSkipJob, saveJobCache } from "./services/cache.js";
import { env } from "./utils/env.js";
import path from "path";
import { fileURLToPath } from "url";
import { getAudioDuration } from "./services/getDuration.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isTest = process.argv.includes("--test");

(async () => {
    console.log(`[Manual Run] Starting News for Schmucks job${isTest ? " (TEST MODE)" : ""}...`);

    if (!isTest && await shouldSkipJob()) process.exit(0);

    try {
        const urls = await fetchHeadlines(env.NEWS_API_KEY, isTest);
        const summary = await summarizeNews(env.OPENAI_API_KEY, urls, isTest);
        const cleanText = clean(summary);
        const speech = await generateSpeech(env.OPENAI_API_KEY, cleanText, isTest);
        const duration = await getAudioDuration("./test/audio.mp3");
        cleanText.duration = duration;
        const updatedTranscript = cleanText;
        await saveFiles(__dirname, updatedTranscript, speech);

        if (!isTest) {
            await saveJobCache({ transcript: summary, duration });
        }

        console.log("✅ All done! Files written to /public.");
    } catch (err) {
        console.error("❌ Error during job:", err.response?.data || err.stack);
        process.exit(1);
    }
})();
