// services/onThisDay.js

import axios from 'axios';
import { logNotify } from '../utils/notifier.js';

function pad2(n) { return String(n).padStart(2, '0'); }

function pickRandom(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const i = Math.floor(Math.random() * arr.length);
  return arr[i];
}

/**
 * Fetch a random "On This Day" event text from Wikimedia feed API.
 * Defaults to today in local time.
 * Returns an object: { text, year, title }
 */
export async function fetchOnThisDayEvent({ month, day, lang = 'en' } = {}) {
  const now = new Date();
  const mm = pad2(month ?? (now.getMonth() + 1));
  const dd = pad2(day ?? now.getDate());
  const url = `https://api.wikimedia.org/feed/v1/wikipedia/${encodeURIComponent(lang)}/onthisday/selected/${mm}/${dd}`;

  console.log(`[OnThisDay] Fetching ${lang} ${mm}/${dd}`);

  const res = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent': 'news-for-schmucks/1.0 (+https://github.com/aeromax/news-for-schmucks)',
      'Accept': 'application/json'
    },
    validateStatus: (s) => s >= 200 && s < 300,
  });

  const data = res?.data || {};
  // Try curated selected first, then events, then any bucket containing text
  const pools = [];
  if (Array.isArray(data.selected)) pools.push(...data.selected);
  if (Array.isArray(data.events)) pools.push(...data.events);
  // Some feeds include births/deaths with text too — include as fallback
  if (Array.isArray(data.births)) pools.push(...data.births);
  if (Array.isArray(data.deaths)) pools.push(...data.deaths);

  const withText = pools.filter(e => typeof e?.text === 'string' && e.text.trim());
  const chosen = pickRandom(withText);
  if (!chosen) return { text: '', year: undefined, title: undefined };
  // Some entries include pages; pick a title if available
  const title = Array.isArray(chosen.pages) && chosen.pages[0]?.titles?.normalized
    ? String(chosen.pages[0].titles.normalized)
    : undefined;
  return { text: String(chosen.text).trim(), year: chosen.year, title };
}

