// services/getDuration.js

import { parseFile } from "music-metadata";

export async function getAudioDuration(filePath) {
  try {
    const metadata = await parseFile(filePath);
    return metadata.format.duration; // seconds
  } catch (err) {
    console.error("[Duration Error]", err.message);
    return null;
  }
}
