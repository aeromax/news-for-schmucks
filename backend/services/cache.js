// dist/services/cache.js
import fs from "fs/promises";
import path from "path";

/** Where to store cache. Put it next to your dist folder, or change if you prefer */
const CACHE_FILE = path.resolve(process.cwd(), ".cache.json");

/** Safely read & parse the cache file */
async function readCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null; // file missing or invalid JSON
  }
}

/** Convert arbitrary transcript input into a short, safe preview string */
function toPreviewSnippet(input) {
  if (input == null) return "";
  if (Array.isArray(input)) {
    return input.map(v => String(v).trim()).filter(Boolean).join(" ").slice(0, 400);
  }
  if (typeof input === "object") {
    if (Array.isArray(input.text)) {
      return input.text.map(v => String(v).trim()).filter(Boolean).join(" ").slice(0, 400);
    }
    if (typeof input.content === "string") {
      return input.content.slice(0, 400);
    }
    try {
      return JSON.stringify(input).slice(0, 400);
    } catch {
      return String(input).slice(0, 400);
    }
  }
  return String(input).slice(0, 400);
}

/**
 * Should we skip the job? (true if last run is within ttlHours)
 * Default TTL = 6 hours.
 */
export async function shouldSkipJob(ttlHours = 6) {
  const cache = await readCache();
  if (!cache || !cache.lastRun) return false;

  const last = new Date(cache.lastRun);
  if (Number.isNaN(last.getTime())) return false;

  const hoursSince = (Date.now() - last.getTime()) / (1000 * 60 * 60);
  if (hoursSince < ttlHours) {
    console.log(`⏩ Skipping job — last run ${hoursSince.toFixed(2)}h ago (TTL ${ttlHours}h).`);
    return true;
  }
  return false;
}

/**
 * Save a new cache entry.
 * Accepts flexible transcript shapes:
 * - string
 * - array of strings
 * - object with { text: [...] } or { content: "..." }
 */
export async function saveJobCache({
  transcript,
  duration = null,
  audioPath = "./public/audio.mp3",
  extra = {}
} = {}) {
  const data = {
    lastRun: new Date().toISOString(),
    duration,
    audioPath,
    preview: toPreviewSnippet(transcript),
    ...extra
  };

  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2));
    console.log("💾 Cache saved at", CACHE_FILE);
  } catch (err) {
    console.error("[Cache Save Error]", err?.stack || err?.message || err);
  }

  return data;
}

/** Helper to inspect current cache (optional) */
export async function readJobCache() {
  return readCache();
}
