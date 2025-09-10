// services/saveFiles.js

import fs from "fs/promises";
import path from "path";
import { logNotify } from "../utils/notifier.js";

export async function saveFiles(baseDir, transcriptText, audioBuffer) {
    // Resolve storage directory from env (e.g., /var/data on Render) or local fallback
    const storageDir = process.env.STORAGE_DIR
        ? process.env.STORAGE_DIR
        : (process.env.NODE_ENV === 'production' ? '/var/data' : path.join(baseDir, 'storage'));

    logNotify(`💾⬅[Save] Writing audio and transcript to ${storageDir}...`);

    const audioPath = path.join(storageDir, "audio.mp3");
    const transcriptPath = path.join(storageDir, "transcript.json");

    // Ensure storage directory exists
    await fs.mkdir(storageDir, { recursive: true });

    await fs.writeFile(audioPath, audioBuffer);
    await fs.writeFile(transcriptPath, JSON.stringify({ captions: transcriptText }, null, 2));
}
