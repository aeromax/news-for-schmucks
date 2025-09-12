// services/selectToneComments.js

import { fetchRedditComments, fetchRedditUserAbout } from './fetchRedditComments.js';
import { logNotify } from "../utils/notifier.js";

const HOUR = 3600;
const DAY = 86400;

const sarcasmCues = [
  'yeah right', 'sure, jan', 'this is fine', 'clown show', "can't make this up",
  'can’t make this up', 'what a joke', 'of course', 'nothing to see here'
];

const stanceWords = [
  'ban', 'boycott', 'grift', 'corrupt', 'finally', 'nothingburger', 'fearmongering',
  'shill', 'propaganda', 'cartel', 'rigged', 'scam', 'fraud'
];

const slangOrIntensity = [
  'lmao', 'lol', 'wtf', 'omg', 'af', 'asf', 'smh', 'ffs', 'bro', 'dude', 'fr', 'idk',
  'shit', 'fuck', 'damn', 'crap', 'hell', 'bs', 'bullshit', 'trash', 'garbage',
  '🤡', '😂', '🙄', '🤷', '🔥'
];

function stripMarkdown(s) {
  return String(s || '')
    .replace(/`{1,3}[^`]*`{1,3}/g, ' ')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/\*\*?|__|~~|>+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function urlCount(s) {
  const m = String(s || '').match(/https?:\/\/\S+/gi);
  return m ? m.length : 0;
}

function quoteLineRatio(body) {
  const lines = String(body || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return 0;
  const quoted = lines.filter(l => l.startsWith('>') || l.startsWith('&gt;')).length;
  return quoted / lines.length;
}

function isBotty(comment) {
  const a = String(comment.author || '').toLowerCase();
  const b = String(comment.body || '').toLowerCase();
  if (a === 'automoderator' || a === 'auto_mod' || a.endsWith('bot')) return true;
  if (b.includes('i am a bot') || b.includes('beep boop')) return true;
  return false;
}

function linkOnlyOrLowSignal(body) {
  const s = String(body || '').trim();
  if (!s) return true;
  // link-only
  if (/^https?:\/\/\S+$/i.test(s)) return true;
  const urls = urlCount(s);
  const text = stripMarkdown(s);
  if (text.length < 20) return true;
  const tokens = text.split(/\s+/);
  if (urls > 0 && tokens.length <= 4) return true;
  return false;
}

function toneScore(body) {
  const s = String(body || '').toLowerCase();
  let score = 0;
  const cues = [];

  for (const p of sarcasmCues) {
    if (s.includes(p)) { score += 2; cues.push(p); }
  }
  for (const w of stanceWords) {
    if (s.includes(w)) { score += 1; cues.push(w); }
  }

  let slangHits = 0;
  for (const w of slangOrIntensity) {
    if (s.includes(w)) { slangHits++; cues.push(w); }
  }
  score += Math.min(1.5, slangHits * 0.5);

  const q = quoteLineRatio(body);
  if (q > 0.3) score -= 2;
  if (urlCount(body) > 2) score -= 1;

  return { score, cues: Array.from(new Set(cues)) };
}

function nowUtcSec() { return Math.floor(Date.now() / 1000); }

async function pickHighKarmaAuthors(comments, maxUsers = 6) {
  const authors = Array.from(new Set(comments.map(c => c.author).filter(Boolean)));
  const toFetch = authors.slice(0, maxUsers);
  const profiles = await Promise.allSettled(toFetch.map(a => fetchRedditUserAbout(a)));
  const out = new Map();
  profiles.forEach((p, i) => {
    if (p.status === 'fulfilled') {
      const prof = p.value;
      out.set(toFetch[i], prof);
    }
  });
  return out; // Map<author, { total_karma, created_utc }>
}

/**
 * Select comments that capture the post's "tone" using heuristics.
 * Returns an array with metadata and scores.
 *
 * Floors: top≥3 when available. Hard cap 12.
 */
export async function selectToneComments(permalink, opts = {}) {
  const now = nowUtcSec();
  const floors = { top: 3 };
  const caps = { top: 12, high_karma: 2, total: 12 };

  const [top] = await Promise.all([
    fetchRedditComments(permalink, { sort: 'top', limit: 50 }),
  ]);

  // Tag buckets
  const map = new Map(); // id -> enriched comment { buckets: Set }
  function addBucket(arr, name) {
    for (const c of arr) {
      const cur = map.get(c.id) || { ...c, buckets: new Set() };
      cur.buckets.add(name);
      map.set(c.id, cur);
    }
  }
  addBucket(top, 'top');

  // Filter junk
  const candidates = [];
  for (const c of map.values()) {
    if (c.distinguished || isBotty(c)) continue;
    if (quoteLineRatio(c.body) > 0.4) continue;
    if (linkOnlyOrLowSignal(c.body)) continue;
    const { score, cues } = toneScore(c.body);
    candidates.push({ ...c, tone_score: score, matched_cues: cues, buckets: Array.from(c.buckets) });
  }

  // Fetch profiles for high-karma signal
  const profiles = await pickHighKarmaAuthors(candidates, 6);
  const withProfiles = candidates.map(c => {
    const prof = profiles.get(c.author);
    const karma = prof?.total_karma || 0;
    const ageDays = prof?.created_utc ? Math.floor((now - prof.created_utc) / DAY) : 0;
    const isHigh = karma >= 10000 && ageDays >= 730; // 2 years
    const buckets = new Set(c.buckets);
    if (isHigh) buckets.add('high_karma');
    return { ...c, author_karma: karma, author_age_days: ageDays, buckets: Array.from(buckets) };
  });

  // Helper to select by bucket with cap, preferring tone score then score
  function takeByBucket(name, cap) {
    const pool = withProfiles.filter(c => c.buckets.includes(name));
    pool.sort((a, b) => (b.tone_score - a.tone_score) || (b.score - a.score));
    return pool.slice(0, cap).map(c => c.id);
  }

  const selectedIds = new Set();
  // Floors: ensure minimum from top, up to available
  takeByBucket('top', caps.top).slice(0, floors.top).forEach(id => selectedIds.add(id));
  // no 'fresh' bucket anymore (removed 'new' fetch)

  // Then try high_karma
  for (const id of takeByBucket('high_karma', caps.high_karma)) {
    if (selectedIds.size >= caps.total) break;
    selectedIds.add(id);
  }

  // Fill remaining by best tone overall
  const remaining = withProfiles
    .filter(c => !selectedIds.has(c.id))
    .sort((a, b) => (b.tone_score - a.tone_score) || (b.score - a.score));
  for (const c of remaining) {
    if (selectedIds.size >= caps.total) break;
    selectedIds.add(c.id);
  }

  // Build final list in a stable, useful order: top tone then score
  const final = withProfiles.filter(c => selectedIds.has(c.id))
    .sort((a, b) => (b.tone_score - a.tone_score) || (b.score - a.score));

  // Normalize permalink to full URL
  const out = final.map(c => ({
    id: c.id,
    author: c.author,
    body: c.body,
    score: c.score,
    created_utc: c.created_utc,
    permalink: c.permalink && c.permalink.startsWith('http') ? c.permalink : `https://www.reddit.com${c.permalink || ''}`,
    buckets: c.buckets,
    tone_score: c.tone_score,
    matched_cues: c.matched_cues,
    author_karma: c.author_karma,
    author_age_days: c.author_age_days,
  }));

  console.log(`[SelectTone] Selected ${out.length} comments (cap ${caps.total})`);
  return out;
}
