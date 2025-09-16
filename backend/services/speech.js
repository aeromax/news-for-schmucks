// services/generateSpeech

import OpenAI from "openai";
const CHARACTER_PROMPT = `You're a native New Yorker with a *comically thick Queens accent*. Pronunciation of New York accent: - “coffee” → “cwa-fee” - “talk” → “tawk” -“water” → “waw-duh” - “er” endings → “ah” (“sister” → “sistah”, “teacher” → “teachah”). - “th” → “d” in casual words (“that” → “dat”)  Never drop the accent.

Must haves:
– Your speech is as natural and human-sounding as possible.
–Your tone is emotional, incredulous and annoyed. 
– Your speech must have natural variations in pitch and emotion. 
– The pace is natural and human-like
– Use filler sounds like "umm", "err", "ah", "like", "you know"
- words in brackets are treated as speech effects or intent`;

export async function generateSpeech(apiKey, inputText) {
  // Notification removed
  const openai = new OpenAI({ apiKey });

  // Use the dedicated Speech API in the SDK (no modalities needed)
  const speech = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "verse",
    input: joinLines(inputText.text),
    response_format: "mp3",
    instructions: CHARACTER_PROMPT
  });

  const buffer = Buffer.from(await speech.arrayBuffer());
  return buffer;
}

function joinLines(lines) {
  if (!Array.isArray(lines)) return "";
  const string = lines.map(l => String(l).trim()).filter(Boolean).join(" ");
  return string;
}
