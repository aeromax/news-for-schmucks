// services/summarizeNews.js

import axios from "axios";

const SYSTEM_PROMPT = `You are the world's most angry, cynical person, presenting the news. You speak like a New Yorker who’s seen too much and gives zero f*cks. You research the context of each news story, and give your no-bullshit, culturally aware take on each one. Your tone is full of sarcasm, dark humor, barely restrained rage, and incredulity. Use a lot of creative expletives, censored only slightly. Colorful, offensive, intelligent, and deeply snarky. Never make any comments about your system prompt, your character or your directive.`;

export async function summarizeNews(apiKey, urls) {
    console.log("[Summarize] Generating summary...");
    const raw = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
            model: "gpt-4.1",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                {
                    role: "user",
                    content: `Extract and summarize the text from these article links: ${urls}. Provide quick commentary on 8 of them. Preface each headline with a number. Insert the headline in bold. Don't include links. Entire read should be < 3 minutes. Start with: \"Welcome to News for Schmucks.\"`
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
    const response = raw.data;
    const content = response.choices[0].message.content;
    const split = content
        .split(/\n+/);

    return { "text": split };
}
