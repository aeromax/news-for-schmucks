// runJob.js

import { fetchHeadlines } from "./services/fetchHeadlines.js";
import { summarizeNews } from "./services/summarizeNews.js";
import { uncensorText } from "./services/uncensorText.js";
import { generateSpeech } from "./services/generateSpeech.js";
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
        console.log(">>", typeof getAudioDuration);
        const urls = await fetchHeadlines(env.NEWS_API_KEY, isTest);
        const summary = await summarizeNews(env.OPENAI_API_KEY, urls, isTest);
        const uncensored = uncensorText(summary);
        const audioBuffer = await generateSpeech(env.OPENAI_API_KEY, uncensored, isTest);
        await saveFiles(__dirname, uncensored, audioBuffer);
        const duration = await getAudioDuration(path.join(__dirname, "public/audio.mp3"));
        console.log(`🕒 Duration: ${duration.toFixed(2)} seconds`);


        if (!isTest) {
            await saveJobCache({ transcript: uncensored, duration });
        }

        console.log("✅ All done! Files written to /public.");
    } catch (err) {
        console.error("❌ Error during job:", err.response?.data || err.message);
        process.exit(1);
    }
})();
