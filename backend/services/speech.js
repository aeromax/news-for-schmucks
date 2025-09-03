// services/generateSpeech

import OpenAI from "openai";
const CHARACTER_PROMPT = `You're a native New Yorker with a *comically thick Queens accent*. You are a nerdy Jewish man, in the style of Woody Allen —  fast, rambling, nasal, tinny. Pronunciation of New York accent: - “coffee” → “cwa-fee” - “talk” → “tawk” - “water” → “waw-duh” - **This should be emphasized greatly: “er” endings → “ah” (“sister” → “sistah”, “teacher” → “teachah”). ** - “th” → “d” in casual words (“that” → “dat”)  Never drop the accent or the neurotic delivery.`;

export async function generateSpeech(apiKey, inputText) {
    console.log("[TTS] Generating speech...");
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
  const string = lines.map(l => String(l).trim()).filter(Boolean).join(" ")
  return string;
}
