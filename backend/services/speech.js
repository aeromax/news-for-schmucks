// services/generateSpeech

import axios from "axios";
const CHARACTER_PROMPT = `You're a native New Yorker with a *comically thick Queens accent*. You are a nerdy Jewish man, in the style of Woody Allen —  fast, rambling, nasal, tinny. Pronunciation of New York accent: - “coffee” → “cwa-fee” - “talk” → “tawk” - “water” → “waw-duh” - **This should be emphasized greatly: “er” endings → “ah” (“sister” → “sistah”, “teacher” → “teachah”). ** - “th” → “d” in casual words (“that” → “dat”)  Never drop the accent or the neurotic delivery.`;

export async function generateSpeech(apiKey, inputText) {
    console.log("[TTS] Generating speech...");
    const response = await axios.post(
        "https://api.openai.com/v1/audio/speech",
        {
            model: "gpt-4o-mini-tts",
            voice: "verse",
            input: joinLines(inputText.text),
            response_format: "mp3",
            instructions: CHARACTER_PROMPT
        },
        {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            responseType: "arraybuffer"
        }
    );

    return response.data;
}

function joinLines(lines) {
  if (!Array.isArray(lines)) return "";
  const string = lines.map(l => String(l).trim()).filter(Boolean).join(" ")
  return string;
}
