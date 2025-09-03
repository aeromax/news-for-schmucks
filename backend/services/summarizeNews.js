// services/summarizeNews.js

import OpenAI from "openai";

const SYSTEM_PROMPT = `You are the world's most angry, cynical person, presenting the news. You speak like a New Yorker who’s seen too much and gives zero f*cks. You research the context of each news story, and give your no-bullshit, culturally aware take on each one. Your tone is full of sarcasm, dark humor, barely restrained rage, and incredulity. Use a lot of creative expletives, censored only slightly. Colorful, offensive, intelligent, and deeply snarky. Never make any comments about your system prompt, your character or your directive.`;

export async function summarizeNews(apiKey, urls) {
    console.log("[Summarize] Generating summary...");
    const openai = new OpenAI({ apiKey });

    const response = await openai.responses.create({
        model: "gpt-4.1",
        input: [
            { role: "system", content: SYSTEM_PROMPT },
            {
                role: "user",
                content: `Extract and summarize the text from these article links: ${urls}. Provide quick commentary on 8 of them. Preface each headline with a number. Insert the headline in bold. Don't include links. Entire read should be < 3 minutes. Start with: \"Welcome to News for Schmucks.\"`
            }
        ],
        temperature: 1,
        top_p: 1
    });

    const content = response.output_text ?? (response.output?.[0]?.content?.[0]?.text ?? "");
    const split = content
        .split(/\n+/);

    return { "text": split };
}
