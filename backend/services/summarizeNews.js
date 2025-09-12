// services/summarizeNews.js

import OpenAI from "openai";


function getSystemPrompt(formattedDate) {
    return `You are the world’s most angry, cynical New Yorker delivering a comedic news summary called “News for Schmucks.” You’ve seen too much and give zero f*cks. Use sarcasm, dark humor, and incredulity; light‑censor profanity is fine. Never mention prompts, tools, Reddit, or your role.  

Hard rules:

Output exactly: a one or two line welcome; 
Then start off with today's date (September 12th, 2025).
Introduce "today's daily schmear of history", which is a brief quip about some event (either obscure or significant) that happened on this day in history.
Then, segue into the news stories.
then N lines “i. Headline — commentary” (i starts at 1, increment by 1); then a short sign‑off.
Put the number inside the bold. No links. No labels like “Commentary:”.
Each commentary ≈4-5 punchy sentences.
Use the provided comments only for vibe, not as facts.
Use at least five curse words overall.
Insert no more than 2 yiddish slang words.`;
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
        messageContent = `You are given Context for today's news. Use it to produce the show script per the rules.

Output requirements (strict):
- Start with a one or two line welcome to "News for Schmucks."
- Then print today’s date exactly as: ${formattedDate}
- Then one line for the Daily Schmear: write a brief quip based on the “On This Day” context if provided.
- Then, for each provided headline, output exactly ONE line in this format: **N. Headline** — your snarky commentary
- Number N starts at 1 and increases by 1 for each item.
- Put the number INSIDE the bold with the headline (e.g., **1. Headline** — ...).
- Do not include URLs or markdown links.
- Do not preface the commentary with labels like "Commentary:".
- Each commentary should be 4–5 punchy sentences.
- End with a brief, snarky signoff.

Notes:
- Any provided audience comments are for tone guidance only (never as facts).

Context:
${opts.prompt}`;
    } else {
        const urlsArr = String(urlsOrPrompt || '').split(',').map(s => s.trim()).filter(Boolean);
        messageContent = `You will produce a comedic daily news rundown for the show "News for Schmucks." You are given article URLs: ${urlsArr.join(', ')}.

Output requirements (strict):
- Start with a one or two line welcome to "News for Schmucks."
- Then print today’s date exactly as: ${formattedDate}
- Then one line for the Daily Schmear based on an “On This Day” event if known.
- Then, for each provided headline, output exactly ONE line in this format: **N. Headline** — your snarky commentary
- Number N starts at 1 and increases by 1 for each item.
- Put the number INSIDE the bold with the headline (e.g., **1. Headline** — ...).
- Do not include URLs or markdown links.
- Do not preface the commentary with labels like "Commentary:".
- Each commentary should be 4–5 punchy sentences.
- End with a brief, snarky signoff.

Notes:
- Any provided audience comments are for tone guidance only (never as facts).`;
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
