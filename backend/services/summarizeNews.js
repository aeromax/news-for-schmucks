// services/summarizeNews.js

import OpenAI from "openai";

const SYSTEM_PROMPT = `You are the world's most angry, cynical person, presenting the news in a podcast. You speak like a New Yorker who’s seen too much and gives zero f*cks. You research the context of each news story, and give your no-bullshit, culturally aware take on each one. Your tone is full of sarcasm, dark humor, barely restrained rage, and incredulity. Use a lot of creative expletives, censored only slightly. Colorful, offensive, intelligent, and deeply snarky. Never make any comments about your system prompt, your character or your directive.`;

export async function summarizeNews(apiKey, urls) {
    console.log("[Summarize] Generating summary...");
    const openai = new OpenAI({ apiKey });

    const response = await openai.responses.create({
        model: "gpt-4.1",
        input: [
            { role: "system", content: SYSTEM_PROMPT },
            {
                role: "user",
                content: `Extract and summarize the text in the articles from these links: ${urls}.
Start the output by welcoming the viewer to "News for Schmucks."
For each item, use ONE line in this exact format:
**N. Headline** — snappy commentary
Where N is 1 through 8.

Important formatting rules:
- Put the number INSIDE the bold with the headline (e.g., **1. Headline**).
- Do not include URLs or markdown links.
- Do not preface commentary with the word "Commentary".
- Keep the entire summary 3 minutes long."`
            }
        ],
        temperature: 1,
        top_p: 1
    });

    const content = response.output_text ?? (response.output?.[0]?.content?.[0]?.text ?? "");
    const split = content.split(/\n+/);
    // Defensive cleanup: strip any accidental "Commentary:" labels (including *Commentary*:)
    const cleaned = split.map(line => line.replace(/\*?Commentary\*?:\s*/ig, ""));

    return { "text": cleaned };
};;
