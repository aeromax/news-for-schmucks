// services/fetchRedditComments.js

import axios from "axios";
import { logNotify } from "../utils/notifier.js";

const UA = 'news-for-schmucks/1.0 (+https://github.com/aeromax/news-for-schmucks)';

function normalizePermalink(permalink) {
  let p = String(permalink || '').trim();
  if (!p) throw new Error('fetchRedditComments: missing permalink');
  if (!p.startsWith('/')) {
    // Allow full URLs too
    try {
      const u = new URL(p);
      p = u.pathname;
    } catch {
      p = '/' + p.replace(/^https?:\/\//i, '').replace(/^[^/]+/, '');
    }
  }
  // Ensure it ends with a trailing slash and no comment id suffix
  p = p.replace(/\?.*$/, '');
  if (!p.endsWith('/')) p += '/';
  return p;
}

/**
 * Fetch top-level comments for a Reddit post permalink.
 * Returns an array of simplified comment objects.
 *
 * @param {string} permalink - e.g., "/r/news/comments/xxxx/title_here/"
 * @param {{sort?: 'top'|'best'|'new'|'controversial'|'old', limit?: number}} [opts]
 */
export async function fetchRedditComments(permalink, opts = {}) {
  const sort = opts.sort || 'top';
  const limit = Math.max(1, Math.min(100, parseInt(opts.limit, 10) || 50));
  const p = normalizePermalink(permalink);
  const url = `https://www.reddit.com${p}.json?sort=${encodeURIComponent(sort)}&limit=${limit}&raw_json=1`;

  console.log(`[FetchRedditComments] ${sort} ${limit} → ${p}`);

  const res = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 15000,
    validateStatus: (s) => s >= 200 && s < 300,
  });

  // Reddit returns an array: [linkListing, commentsListing]
  const arr = Array.isArray(res?.data) ? res.data : [];
  const commentsListing = arr[1]?.data?.children;
  if (!Array.isArray(commentsListing)) return [];

  const linkId = arr[0]?.data?.children?.[0]?.data?.id;
  const linkName = linkId ? `t3_${linkId}` : null;

  const items = [];
  for (const c of commentsListing) {
    if (!c || c.kind !== 't1') continue; // comment
    const d = c.data || {};
    // Only top-level comments: parent is the link
    if (linkName && d.parent_id && d.parent_id !== linkName) continue;
    if (d.body === undefined || d.author === undefined) continue;
    if (d.removed_by_category || d.banned_by || d.author === '[deleted]' || d.body === '[deleted]') continue;
    items.push({
      id: String(d.id || ''),
      author: String(d.author || ''),
      body: String(d.body || ''),
      score: Number.isFinite(d.score) ? Number(d.score) : 0,
      created_utc: Number.isFinite(d.created_utc) ? Number(d.created_utc) : 0,
      permalink: d.permalink ? String(d.permalink) : `/r${d.subreddit_name_prefixed || '/news'}/comments/${linkId}/_/${d.id}/`,
      distinguished: d.distinguished ? String(d.distinguished) : null,
      is_submitter: !!d.is_submitter,
      controversiality: Number.isFinite(d.controversiality) ? Number(d.controversiality) : 0,
      num_reports: Number.isFinite(d.num_reports) ? Number(d.num_reports) : 0,
    });
  }
  return items;
}

/** Fetch basic user profile (about.json) */
export async function fetchRedditUserAbout(username) {
  const name = String(username || '').trim();
  if (!name) throw new Error('fetchRedditUserAbout: missing username');
  const url = `https://www.reddit.com/user/${encodeURIComponent(name)}/about.json`;
  const res = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 10000,
    validateStatus: (s) => s >= 200 && s < 300,
  });
  const d = res?.data?.data || {};
  return {
    name,
    total_karma: Number.isFinite(d.total_karma) ? Number(d.total_karma) : 0,
    created_utc: Number.isFinite(d.created_utc) ? Number(d.created_utc) : 0,
    is_gold: !!d.is_gold,
    is_mod: !!d.is_mod,
  };
}

