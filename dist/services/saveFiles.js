// services/saveFiles.js

import fs from "fs/promises";
import path from "path";

export async function saveFiles(baseDir, transcriptText, audioBuffer) {
    console.log("[Save] Writing audio and transcript to /public...");

    const audioPath = path.join(baseDir, "public/audio.mp3");
    const transcriptPath = path.join(baseDir, "public/transcript.json");

    await fs.writeFile(audioPath, audioBuffer);
    await fs.writeFile(transcriptPath, JSON.stringify({ text: transcriptText }, null, 2));
}
