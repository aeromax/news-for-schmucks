// services/summarizeNews.js

import axios from "axios";
import fs from "fs/promises";
import path from "path";

const SYSTEM_PROMPT = `You are the world's most angry, cynical person, presenting the news. You speak like a New Yorker who’s seen too much and gives zero f*cks. Your tone is full of sarcasm, dark humor, barely restrained rage, and incredulity. Use a lot of creative expletives, censored only slightly. Colorful, offensive, intelligent, and deeply snarky.`;

export async function summarizeNews(apiKey, urls, testMode = false) {
    console.log("[Summarize] Generating summary" + (testMode ? " (TEST MODE)" : "") + "...");

    let response;
    if (testMode) {
        const raw = await fs.readFile("./test/gptResponse.json", "utf-8");
        response = JSON.parse(raw);
        console.log("📝 Loaded test summary from disk.");
    } else {
        const raw = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-4o",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    {
                        role: "user",
                        content: `Extract and summarize the text from these article links: ${urls}. Provide quick commentary on 10 of them. Preface each headline with a number. Insert the headline in bold. Don't include links. Entire read should be < 3 minutes. Start with: \"Welcome to News for Schmucks.\"`
                    }
                ],
                temperature: 1,
                top_p: 1
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`
                }
            }
        );
    }
    const content = response.choices[0].message.content;
    
    const lines = content
        .split(/\n+/)
        .map(l => l.trim())
        .filter(Boolean);

    return {"text":lines} ;
}