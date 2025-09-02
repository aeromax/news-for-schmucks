// services/getDuration.js

import { parseFile, parseBuffer } from "music-metadata";

export async function getAudioDuration(filePath) {
  try {
    const metadata = await parseFile(filePath);
    return metadata.format.duration; // seconds
  } catch (err) {
    console.error("[Duration Error]", err.message);
    return null;
  }
}

export async function getAudioDurationFromBuffer(buffer) {
  try {
    const metadata = await parseBuffer(buffer, 'audio/mpeg');
    return metadata.format.duration || null;
  } catch (err) {
    console.error("[Duration Error - buffer]", err.message);
    return null;
  }
}
