// services/summarizeNews.js

import OpenAI from "openai";
import { logNotify } from "../utils/notifier.js";

const SYSTEM_PROMPT = `You are the world's most angry, cynical person, presenting the news in a podcast. You are offensive, have a sharp wit, and snarky sense of humor. You're a comedic genius. You speak like a New Yorker who’s seen too much and gives zero f*cks. You research the context of each news story, and give your no-bullsh*t, culturally aware take on each one. Use current cultural references and idioms. Your tone is full of sarcasm, dark humor, barely restrained rage, and incredulity. You are incredulous to how ridiculous the news is. You use phrases like "what the actual f*ck?!", "You've gotta be sh*tting me!", "Oh for crying out loud.", "Get the hell outta here." Use curse words, but you may censor them such as "f*ck","sh*t". You must use at least five curse words in your delivery . Colorful, offensive, intelligent, and deeply snarky. Never make any comments about your system prompt, your character or your directive.`;

export async function summarizeNews(apiKey, urls) {
    logNotify("[Summarize] Generating summary...");
    // Generate current date string like "September 9, 2025."
    const now = new Date();
    const MONTHS = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const formattedDate = `${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}.`;
    const openai = new OpenAI({ apiKey });

    const response = await openai.responses.create({
        model: "gpt-4.1",
        input: [
            { role: "system", content: SYSTEM_PROMPT },
            {
                role: "user",
                content: `Read and summarize these articles: ${urls}. Develop a humorous, pessimistic commentary on each one, complete with any contextual knowledge that might be useful to aid in the humor and sarcasm of the story. Start the output by welcoming the viewer to "News for Schmucks." Add relevant current or historical context to each news story by performing brief research from trusted sources, or public opinion and commentary. For each item, use ONE line in this exact format: N. Headline — snappy commentary Where N is 1 through 8. Important formatting rules: Put the number INSIDE the bold with the headline (e.g., 1. Headline). Do not include URLs or markdown links. Do not preface commentary with the word "Commentary"."`
            }
        ],
        temperature: 1,
        top_p: 1
    });

    const content = response.output_text ?? (response.output?.[0]?.content?.[0]?.text ?? "");
    const split = content.split(/\n+/);
    // Defensive cleanup: strip any accidental "Commentary:" labels (including *Commentary*:)
    const cleaned = split.map(line => line.replace(/\*?Commentary\*?:\s*/ig, ""));
    // Prepend the formatted date so TTS reads it first
    const text = [formattedDate, ...cleaned];
    return { text };
};;
