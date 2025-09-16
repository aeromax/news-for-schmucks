// services/buildRedditBundles.js

import { fetchRedditNewsTop } from './fetchRedditNews.js';
import { selectToneComments } from './selectToneComments.js';
import { extractArticles } from './articleExtractor.js';
import { logNotify } from '../utils/notifier.js';
import { redditBundlesConfig } from '../config/redditBundles.config.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function mapWithLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0; let active = 0; let err;
  return await new Promise((resolve, reject) => {
    const next = async () => {
      if (err) return; // stop on first error
      if (i >= items.length && active === 0) return resolve(out);
      if (i >= items.length) return;
      const idx = i++; active++;
      Promise.resolve(fn(items[idx], idx))
        .then((v) => { out[idx] = v; })
        .catch((e) => { err = e; })
        .finally(() => { active--; next(); });
      if (active < limit && i < items.length) next();
    };
    for (let k = 0; k < Math.min(limit, items.length); k++) next();
  });
}

/**
 * Build bundles of Reddit top posts with selected tone comments.
 * @param {{ t?: 'hour'|'day'|'week'|'month'|'year'|'all', limit?: number, maxStories?: number }} opts
 * @returns {Promise<Array<{ id: string, title: string, url: string, selftext: string, permalink: string, ups: number, num_comments: number, created_utc: number, domain: string, comments: Array }>>}
 */
export async function buildRedditBundles(opts = {}) {
  const t = opts.t || 'day';
  const limit = Math.max(1, Math.min(50, parseInt(opts.limit, 10) || 25));
  const maxStories = Math.max(1, Math.min(12, parseInt(opts.maxStories, 10) || 8));
  const sortBy = (opts.sortBy || 'comments_per_hour'); // 'comments' | 'ups' | 'comments_per_hour'
  const minComments = Number.isFinite(opts.minComments) ? opts.minComments : 0;
  const minUps = Number.isFinite(opts.minUps) ? opts.minUps : 0;
  const maxAgeHours = Number.isFinite(opts.maxAgeHours) ? opts.maxAgeHours : Infinity;
  const diversifyDomains = !!opts.diversifyDomains; // if true, prefer unique domains

  const posts = await fetchRedditNewsTop({ t, limit });

  // Rank/filter posts by engagement
  const now = Math.floor(Date.now() / 1000);
  const ranked = posts.map(p => {
    const ageH = Math.max(1 / 60, (now - (p.created_utc || now)) / 3600);
    const commentsPerHour = (p.num_comments || 0) / ageH;
    const upsPerHour = (p.ups || 0) / ageH;
    return { ...p, _age_hours: ageH, _comments_per_hour: commentsPerHour, _ups_per_hour: upsPerHour };
  })
    .filter(p => p.num_comments >= minComments && p.ups >= minUps && p._age_hours <= maxAgeHours)
    .sort((a, b) => {
      if (sortBy === 'comments') return (b.num_comments - a.num_comments) || (b.ups - a.ups);
      if (sortBy === 'ups') return (b.ups - a.ups) || (b.num_comments - a.num_comments);
      // default: comments_per_hour
      return (b._comments_per_hour - a._comments_per_hour) || (b.ups - a.ups);
    });

  let picked = ranked.slice(0, maxStories);
  if (diversifyDomains && picked.length > 1) {
    const seen = new Set();
    const diverse = [];
    for (const p of ranked) {
      if (!seen.has(p.domain)) {
        diverse.push(p);
        seen.add(p.domain);
      }
      if (diverse.length >= maxStories) break;
    }
    if (diverse.length) picked = diverse;
  }

  console.log(`[Bundles] Building bundles for ${picked.length} posts…`);

  // Fetch article extracts for picked posts to provide factual summaries
  let extracts = [];
  try {
    const urls = picked.map(p => p.url);
    extracts = await extractArticles(urls, { concurrency: 3 });
  } catch (e) {
    logNotify(`[Bundles] Article extract failed: ${e?.message || e}`);
  }
  const byUrl = new Map((extracts || []).map(x => [x?.url, x]));

  // Fetch comment selections with small concurrency and polite pacing
  const bundles = await mapWithLimit(picked, 3, async (p) => {
    // small jitter to avoid burst
    await sleep(100 + Math.floor(Math.random() * 200));
    let comments = [];
    try {
      comments = await selectToneComments(p.permalink, {});
    } catch (e) {
      logNotify(`[Bundles] Comment select failed for ${p.id}: ${e?.message || e}`);
    }
    const article = byUrl.get(p.url) || null;
    return { ...p, comments, article };
  });

  return bundles;
}

/**
 * Convert bundles into a compact prompt string for the LLM.
 * Keeps only essential comment info and trims long bodies.
 */
export function toPromptBlocks(bundles, opts = {}) {
  const pc = redditBundlesConfig?.prompt || {};
  const maxCommentLen = Number.isFinite(opts.maxCommentLen) ? opts.maxCommentLen : (Number.isFinite(pc.maxCommentLen) ? pc.maxCommentLen : 280);
  const maxCommentsPerStory = Number.isFinite(opts.maxCommentsPerStory) ? opts.maxCommentsPerStory : (Number.isFinite(pc.maxCommentsPerStory) ? pc.maxCommentsPerStory : 8);
  const maxSelftextLen = Number.isFinite(opts.maxSelftextLen) ? opts.maxSelftextLen : (Number.isFinite(pc.maxSelftextLen) ? pc.maxSelftextLen : 300);
  const showMeta = typeof opts.showMeta === 'boolean' ? opts.showMeta : (pc.showMeta === true);
  const showScore = typeof opts.showScore === 'boolean' ? opts.showScore : (pc.showScore === true);
  const showTone = typeof opts.showTone === 'boolean' ? opts.showTone : (pc.showTone === true);
  const showCues = typeof opts.showCues === 'boolean' ? opts.showCues : (pc.showCues === true);
  const showArticleUrl = typeof opts.showArticleUrl === 'boolean' ? opts.showArticleUrl : (pc.showArticleUrl !== false);
  const showRedditLink = typeof opts.showRedditLink === 'boolean' ? opts.showRedditLink : (pc.showRedditLink === true);
  const showArticleSummary = typeof opts.showArticleSummary === 'boolean' ? opts.showArticleSummary : (pc.showArticleSummary === true);
  const maxSummaryLen = Number.isFinite(opts.maxSummaryLen) ? opts.maxSummaryLen : (Number.isFinite(pc.maxSummaryLen) ? pc.maxSummaryLen : 320);
  const showCommentaryHeader = typeof opts.showCommentaryHeader === 'boolean' ? opts.showCommentaryHeader : (pc.showCommentaryHeader !== false);
  const onThisDayText = typeof opts.onThisDayText === 'string' ? opts.onThisDayText : undefined;
  const showOnThisDay = typeof opts.showOnThisDay === 'boolean' ? opts.showOnThisDay : (pc.showOnThisDay === true);
  const onThisDayLabel = typeof opts.onThisDayLabel === 'string' ? opts.onThisDayLabel : (pc.onThisDayLabel || 'On This Day:');
  const lines = [];
  if (showOnThisDay && onThisDayText && onThisDayText.trim()) {
    lines.push(`${onThisDayLabel} ${onThisDayText.trim()}`);
    lines.push('');
  }
  for (let i = 0; i < bundles.length; i++) {
    const b = bundles[i];
    lines.push(`Story ${i + 1}: ${b.title}`);
    if (showArticleUrl && b.url) lines.push(`URL: ${b.url}`);
    if (showArticleSummary && b?.article?.summary) {
      const s = b.article.summary;
      const trimmed = s.length > maxSummaryLen ? `${s.slice(0, maxSummaryLen)}…` : s;
      lines.push(`Summary: ${trimmed}`);
    }
    if (b.selftext) lines.push(`Selftext: ${b.selftext.slice(0, maxSelftextLen)}${b.selftext.length > maxSelftextLen ? '…' : ''}`);
    if (showRedditLink && b.permalink) lines.push(`Reddit: https://www.reddit.com${b.permalink}`);
    // pick top comments by tone then score
    const selected = (b.comments || [])
      .slice()
      .sort((a, b) => (b.tone_score - a.tone_score) || (b.score - a.score))
      .slice(0, maxCommentsPerStory);
    if (showCommentaryHeader && selected.length) lines.push('Commentary:');
    for (const c of selected) {
      const body = String(c.body || '');
      const trimmed = body.length > maxCommentLen ? `${body.slice(0, maxCommentLen)}…` : body;
      if (showMeta) {
        const cues = showCues ? (c.matched_cues || []).slice(0, 3).join(', ') : '';
        const metaParts = [];
        if (showScore) metaParts.push(`score=${c.score}`);
        if (showTone) metaParts.push(`tone=${c.tone_score}`);
        if (showCues && cues) metaParts.push(`cues=${cues}`);
        const meta = metaParts.join(' ');
        lines.push(meta ? `- [${meta}] ${trimmed}` : `- ${trimmed}`);
      } else {
        lines.push(`- ${trimmed}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}
