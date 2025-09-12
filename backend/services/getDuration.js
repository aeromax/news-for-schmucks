// services/getDuration.js

import { parseFile, parseBuffer } from "music-metadata";
import { logNotify } from "../utils/notifier.js";

export async function getAudioDuration(filePath) {
  try {
    const metadata = await parseFile(filePath);
    return metadata.format.duration; // seconds
  } catch (err) {
    const msg = err?.stack || err?.message || String(err);
    console.error("[Duration Error]", msg);
    try { logNotify(`[getDuration.js] ${msg}`); } catch {}
    return null;
  }
}

export async function getAudioDurationFromBuffer(buffer) {
  try {
    const metadata = await parseBuffer(buffer, 'audio/mpeg');
    return metadata.format.duration || null;
  } catch (err) {
    const msg = err?.stack || err?.message || String(err);
    console.error("[Duration Error - buffer]", msg);
    try { logNotify(`[getDuration.js] ${msg}`); } catch {}
    return null;
  }
}
