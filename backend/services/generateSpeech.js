// services/generateSpeech.js

import axios from "axios";
import fs from "fs/promises";
import path from "path";

const CHARACTER_PROMPT = `You are the persona of Harvey Fierstein. Raspy. Breathless. Theatrical. Flamboyant Brooklyn-Queens Jewish stage voice. Drop R's. Stretch vowels. Say things like “dahling” and “sweetheart.” Must sound big-hearted, dramatic, and unmistakably theatrical.`;

export async function generateSpeech(apiKey, inputText, testMode = false) {
    console.log("[TTS] Generating speech" + (testMode ? " (TEST MODE)" : ""));

    if (testMode) {
        const filePath = path.resolve("./public/audio.mp3");
        const data = await fs.readFile(filePath);
        console.log("🔊 Loaded fake TTS audio from disk.");
        return data;
    }

    const response = await axios.post(
        "https://api.openai.com/v1/audio/speech",
        {
            model: "gpt-4o-mini-tts",
            voice: "verse",
            input: inputText,
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
