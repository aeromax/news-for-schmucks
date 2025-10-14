// services/onThisDay.js

import axios from 'axios';
import { logNotify } from '../utils/notifier.js';

function pad2(n) { return String(n).padStart(2, '0'); }

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickRandom(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const i = Math.floor(Math.random() * arr.length);
  return arr[i];
}

async function fetchEventForDay(month, day, lang) {
  const monthNum = Number.parseInt(month, 10);
  const dayNum = Number.parseInt(day, 10);
  if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) {
    throw new Error(`fetchEventForDay: invalid month "${month}"`);
  }
  if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > 31) {
    throw new Error(`fetchEventForDay: invalid day "${day}"`);
  }

  const mm = pad2(monthNum);
  const dd = pad2(dayNum);
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
  const pools = [];
  if (Array.isArray(data.selected)) pools.push(...data.selected);
  if (Array.isArray(data.events)) pools.push(...data.events);
  if (Array.isArray(data.births)) pools.push(...data.births);
  if (Array.isArray(data.deaths)) pools.push(...data.deaths);

  const withText = pools.filter(e => typeof e?.text === 'string' && e.text.trim());
  const chosen = pickRandom(withText);
  if (!chosen) return null;
  const title = Array.isArray(chosen.pages) && chosen.pages[0]?.titles?.normalized
    ? String(chosen.pages[0].titles.normalized)
    : undefined;
  return {
    text: String(chosen.text).trim(),
    year: chosen.year,
    title,
    month: monthNum,
    day: dayNum,
  };
}

/**
 * Fetch a random historical event from the past week using the Wikimedia feed API.
 * By default, selects a random date within the previous `lookbackDays` (7) from `baseDate` (now).
 * If `month` and `day` are provided, fetches specifically for that date.
 * Returns an object: { text, year, title }
 */
export async function fetchOnThisDayEvent({ month, day, lang = 'en', baseDate, lookbackDays = 7 } = {}) {
  const hasExplicitDate = month != null && day != null;
  if (hasExplicitDate) {
    const mm = Number.parseInt(month, 10);
    const dd = Number.parseInt(day, 10);
    const event = await fetchEventForDay(mm, dd, lang);
    return event || { text: '', year: undefined, title: undefined, month: mm, day: dd };
  }

  const referenceDate = baseDate ? new Date(baseDate) : new Date();
  if (Number.isNaN(referenceDate?.getTime())) {
    throw new Error('fetchOnThisDayEvent: Invalid baseDate provided');
  }

  const lookback = Math.max(1, Math.min(31, Number.parseInt(lookbackDays, 10) || 7));
  const offsets = shuffleInPlace(Array.from({ length: lookback }, (_, idx) => idx + 1));

  for (const offset of offsets) {
    const candidate = new Date(referenceDate);
    candidate.setDate(candidate.getDate() - offset);
    const mm = candidate.getMonth() + 1;
    const dd = candidate.getDate();
    try {
      const event = await fetchEventForDay(mm, dd, lang);
      if (event && event.text) return event;
    } catch (err) {
      logNotify(`[OnThisDay] Fetch failed for ${pad2(mm)}/${pad2(dd)}: ${err?.message || err}`);
    }
  }

  // As a last resort, fall back to the reference date to avoid returning empty text.
  try {
    const fallback = await fetchEventForDay(referenceDate.getMonth() + 1, referenceDate.getDate(), lang);
    if (fallback) return fallback;
  } catch (err) {
    logNotify(`[OnThisDay] Fallback fetch failed: ${err?.message || err}`);
  }

  return { text: '', year: undefined, title: undefined };
}
