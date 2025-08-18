// snarkynews-dist/index.js

import express from "express";
import axios from "axios";
import fs from "fs/promises";
import cron from "node-cron";
import FormData from "form-data";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ENV vars you’ll need to set on Render:
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Daily cron job at 1 AM
cron.schedule("0 1 * * *", async () => {
  console.log("[Cron] Running daily headline-to-audio job");
  try {
    // 1. Get news headlines
    const news = await axios.get(
      `https://newsapi.org/v2/top-headlines?source=bbc_news&country=us&pageSize=15&apiKey=${NEWS_API_KEY}`
    );

    const urls = news.data.articles.filter(a => a.content).map(a => a.url).join(",");

    // 2. Generate snarky commentary
    const summary = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are the world's most angry..." },
          { role: "user", content: `Extract and summarize the text from these article links: ${urls}. Provide quick commentary on 10 of them...` }
        ],
        temperature: 1,
        top_p: 1
      },
      {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
      }
    );

    const text = summary.data.choices[0].message.content;

    // 3. Replace censored curse words
    const uncensored = text.replace(/f[*]*k/gi, "fuck").replace(/s[*]*t/gi, "shit") /* etc */;

    // 4. Send to OpenAI TTS
    const ttsRes = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      {
        model: "gpt-4o-mini-tts",
        voice: "verse",
        input: uncensored,
        response_format: "mp3",
        instructions: "Harvey Fierstein style description..."
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        responseType: "arraybuffer"
      }
    );

    // 5. Write files
    await fs.writeFile(path.join(__dirname, "public/audio.mp3"), ttsRes.data);
    await fs.writeFile(path.join(__dirname, "public/transcript.json"), JSON.stringify({ text: uncensored }, null, 2));

    console.log("[Cron] Job complete: audio and transcript saved.");
  } catch (err) {
    console.error("[Cron Error]", err.response?.data || err.message);
  }
});

app.get("/status", (req, res) => res.send("SnarkyNews dist running."));

app.use("/public", express.static(path.join(__dirname, "public")));

app.listen(PORT, () => console.log(`[Server] Listening on port ${PORT}`));
