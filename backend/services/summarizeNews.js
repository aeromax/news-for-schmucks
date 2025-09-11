// services/summarizeNews.js

import OpenAI from "openai";
import { logNotify } from "../utils/notifier.js";
import axios from "axios";
import wiki from "wikipedia";

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
    // Use tool-calling with a single batch Wikipedia search tool (direct Wikipedia API)
    const content = await runWithWikiTools(openai, urls);
    const split = content.split(/\n+/);
    // Defensive cleanup: strip any accidental "Commentary:" labels (including *Commentary*:)
    const cleaned = split.map(line => line.replace(/\*?Commentary\*?:\s*/ig, ""));
    // Prepend the formatted date so TTS reads it first
    const text = [formattedDate, ...cleaned];
    console.log(text);
    return { text };
};

// Tool-driven flow: a single batch wiki_search tool the model calls once per story
async function runWithWikiTools(openai, urlsCsv) {
    const urls = String(urlsCsv || '').split(',').map(s => s.trim()).filter(Boolean);

    const tools = [
        {
            type: 'function',
            function: {
                name: 'wiki_search',
                description: 'Batch search Wikipedia using the wikipedia npm package. Returns compact results by term.',
                parameters: {
                    type: 'object',
                    properties: {
                        terms: {
                            type: 'array',
                            description: 'Array of subjects to search on Wikipedia',
                            items: { type: 'string' },
                            minItems: 1
                        },
                        lang: { type: 'string', description: 'Language code, e.g., en', default: 'en' },
                        limit: { type: 'integer', minimum: 1, maximum: 10, default: 1 }
                    },
                    required: ['terms']
                }
            }
        }
    ];

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        {
            role: 'user',
            content:
                `You will produce a comedic daily news rundown for the show "News for Schmucks." You are given article URLs: ${urls.join(', ')}.
            `
                // Wikipedia research tool:
                // - wiki_search(terms: string[], limit = 1, lang = 'en').
                // For the entire set of stories, first choose TWO distinct subjects per story to research on Wikipedia. Then make ONE SINGLE wiki_search call for the whole request with terms=[all chosen subjects], deduped, limit=1 per term. After receiving the tool results, write the final output for all stories in order. Do not call wiki_search more than once.
                + `

                Output requirements (strict):
                - Start with a one-line welcome to "News for Schmucks."
                - Then, for each provided URL, output exactly ONE line in this format: **N. Headline** — snappy commentary
                - Number N starts at 1 and increases by 1 for each item.
                - Put the number INSIDE the bold with the headline (e.g., **1. Headline** — ...).
                - Do not include URLs or markdown links.
                - Do not preface the commentary with labels like "Commentary:".
                - End with a brief, snarky signoff.

                Only output the welcome line and the numbered items; no other text.`
        }
    ];

    for (let step = 0; step < 8; step++) {
        const resp = await openai.chat.completions.create({
            model: 'gpt-4.1',
            messages,
            // tools,
            tool_choice: 'auto',
            temperature: 1,
        });

        const choice = resp.choices?.[0];
        if (!choice) throw new Error('No model choice returned');
        const msg = choice.message;
        const toolCalls = msg.tool_calls || [];

        if (toolCalls.length) {
            messages.push({ role: 'assistant', content: msg.content || '', tool_calls: toolCalls });
            for (const call of toolCalls) {
                const name = call.function?.name || call.name;
                const argsText = call.function?.arguments || call.arguments || '{}';
                let args; try { args = JSON.parse(argsText); } catch { args = {}; }

                let result;
                try {
                    if (name === 'wiki_search') {
                        const terms = Array.isArray(args.terms) ? args.terms.filter(Boolean).map(String) : [];
                        const lang = String(args.lang || 'en');
                        const limit = Math.max(1, Math.min(10, parseInt(args.limit, 10) || 1));
                        // Deduplicate terms (case-insensitive) before searching to avoid duplicate payloads
                        const seen = new Set();
                        const uniqTerms = [];
                        for (const t of terms) {
                            const n = String(t).toLowerCase().trim();
                            if (!n || seen.has(n)) continue;
                            seen.add(n);
                            uniqTerms.push(String(t).trim());
                        }
                        console.log(`[Tools] wiki_search terms=${JSON.stringify(uniqTerms).slice(0, 200)} lang=${lang} limit=${limit}`);

                        result = await wikiBatchSearch(uniqTerms, { lang, limit });
                    } else {
                        result = { error: `Unknown tool: ${name}` };
                    }
                } catch (err) {
                    result = { error: err?.message || String(err) };
                }

                messages.push({
                    role: 'tool',
                    tool_call_id: call.id,
                    name,
                    content: JSON.stringify(result).slice(0, 30000)
                });
            }
            continue;
        }

        return msg.content || '';
    }

    throw new Error('Tool loop exceeded step limit');
}



// Batch Wikipedia search using the official 'wikipedia' npm package
// Returns { by_term: { term: [{ x: extract }] } }
async function wikiBatchSearch(terms, { lang = 'en', limit = 1 } = {}) {
    const language = String(lang || 'en').toLowerCase();
    try { await wiki.setLang(language); } catch { }

    const by_term = {};

    const list = Array.isArray(terms) ? terms : [];
    const seen = new Set();
    for (const raw of list) {
        const term = String(raw || '').trim();
        const key = term.toLowerCase();
        if (!term || seen.has(key)) { if (term) by_term[term] = by_term[term] || []; continue; }
        seen.add(key);
        if (!term) { by_term[raw] = []; continue; }
        try {
            const searchRes = await wiki.search(term, { limit: Math.max(1, Math.min(10, parseInt(limit, 10) || 1)), suggestion: true });
            const list = Array.isArray(searchRes?.results) ? searchRes.results : Array.isArray(searchRes) ? searchRes : [];
            const picked = list.slice(0, Math.max(1, Math.min(10, parseInt(limit, 10) || 1)));

            const out = [];
            for (const r of picked) {
                const title = r?.title || r?.page || r?.displaytitle || '';
                if (!title) continue;
                let extract = '';
                try {
                    const sum = await wiki.summary(title).catch(() => null);
                    if (sum?.extract) extract = String(sum.extract);
                } catch { }
                out.push({ x: extract });
            }
            by_term[term] = out;
        } catch {
            by_term[term] = [];
        }
    }

    return { by_term };
}

function stripHtml(html) {
    return String(html || '')
        .replace(/<span class=\"searchmatch\">/g, '')
        .replace(/<\/span>/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
