// services/saveFiles.js

import fs from "fs/promises";
import path from "path";

export async function saveFiles(baseDir, transcriptText, audioBuffer) {
    console.log("💾⬅[Save] Writing audio and transcript to /storage...");

    const storageDir = path.join(baseDir, "storage");
    const audioPath = path.join(storageDir, "audio.mp3");
    const transcriptPath = path.join(storageDir, "transcript.json");

    // Ensure storage directory exists
    await fs.mkdir(storageDir, { recursive: true });

    await fs.writeFile(audioPath, audioBuffer);
    await fs.writeFile(transcriptPath, JSON.stringify({ captions: transcriptText }, null, 2));
}
