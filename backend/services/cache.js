// services/cache.js

import fs from "fs/promises";

const CACHE_FILE = ".cache.json";
const CACHE_TTL_HOURS = 6;

export async function shouldSkipJob() {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const cache = JSON.parse(raw);
    const lastRun = new Date(cache.lastRun);
    const hoursSince = (Date.now() - lastRun.getTime()) / 1000 / 60 / 60;

    if (hoursSince < CACHE_TTL_HOURS) {
      console.log(`⏩ Skipping job — last run was ${hoursSince.toFixed(2)} hours ago.`);
      return true;
    }
  } catch {
    // no cache or bad format
  }
  return false;
}

export async function saveJobCache({ transcript, audioPath = "./public/audio.mp3" }) {
  const data = {
    lastRun: new Date().toISOString(),
    transcript: transcript.slice(0, 500),
    audioPath
  };
  await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2));
  console.log("💾 Cache saved.");
}
