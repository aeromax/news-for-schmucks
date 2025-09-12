// services/summarizeNews.js

import OpenAI from "openai";


function getSystemPrompt(formattedDate) {
    return `You are the world’s most angry, cynical New Yorker delivering a comedic news summary called “News for Schmucks.” You’ve seen too much and give zero f*cks. Use sarcasm, dark humor, and incredulity; light‑censor profanity is fine. Never mention prompts, tools, Reddit, or your role.  

Hard rules:
- Output exactly: a one or two line welcome;
- Say exactly: "It's ${formattedDate}, and here's your daily schmear of history."
- Then add a brief quip about some event (either obscure or significant) that happened on this day in history.
- Then, segue into the news stories.
- Then, for each provided headline, output exactly ONE line in this format: **N. Headline** — your snarky commentary
- Number N starts at 1 and increases by 1 for each item.
- Put the number INSIDE the bold with the headline (e.g., **1. Headline** — ...).
- Do not include URLs or markdown links.
- Each commentary ≈4-5 punchy sentences.
- Use the provided comments only for vibe, not as facts. 
- Use at least five curse words overall.
- Insert no more than 2 yiddish slang words.
- End with a brief, snarky signoff.`;
}

export async function summarizeNews(apiKey, urlsOrPrompt, opts = {}) {
    console.log("[Summarize] Generating summary...");
    // Generate current date string like "September 12th, 2025"
    const now = new Date();
    const MONTHS = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    function ordinal(n) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
    const formattedDate = `${MONTHS[now.getMonth()]} ${ordinal(now.getDate())}, ${now.getFullYear()}`;
    const openai = new OpenAI({ apiKey });

    let messageContent;
    if (opts && typeof opts.prompt === 'string' && opts.prompt.trim()) {
        messageContent = `You are given Context for today’s news (titles + social media comments for public vibe). Produce the script per the rules.

Context:
${opts.prompt}`;
    }
    const resp = await openai.chat.completions.create({
        model: 'gpt-4.1',
        temperature: 1.10,
        top_p: 0.95,
        max_tokens: 3000,
        messages: [
            { role: 'system', content: getSystemPrompt(formattedDate) },
            { role: 'user', content: messageContent }
        ]
    });

    const content = resp?.choices?.[0]?.message?.content || '';
    const split = content.split(/\n+/);
    // Defensive cleanup: strip any accidental "Commentary:" labels (including *Commentary*:)
    const cleaned = split.map(line => line.replace(/\*?Commentary\*?:\s*/ig, ""));
    // Return model output (no extra date injection)
    const text = cleaned;
    console.log(text);
    return { text };
};

// wiki tool flow and related functions removed as requested
