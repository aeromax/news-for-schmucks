// services/fetchRedditNews.js

import axios from "axios";
import { logNotify } from "../utils/notifier.js";

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function getJsonWithRetry(url, { headers = {}, timeout = 15000, retries = 4 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await axios.get(url, {
        headers,
        timeout,
        validateStatus: (s) => s >= 200 && s < 300,
      });
    } catch (err) {
      const status = err?.response?.status;
      const retryAfter = err?.response?.headers?.['retry-after'];
      const is429 = status === 429;
      const is5xx = status >= 500 && status < 600;
      if (attempt >= retries || (!is429 && !is5xx)) throw err;
      // Backoff: use Retry-After (s) if provided, else exp backoff with jitter
      let delayMs;
      if (retryAfter && !Number.isNaN(Number(retryAfter))) {
        delayMs = Math.min(30000, Math.max(1000, Number(retryAfter) * 1000));
      } else {
        const base = Math.min(16000, 1000 * Math.pow(2, attempt));
        const jitter = Math.floor(Math.random() * 500);
        delayMs = base + jitter;
      }
      await sleep(delayMs);
      attempt++;
    }
  }
}

/**
 * Fetch top posts from r/news and return a compact array of objects
 * keeping only the requested fields.
 *
 * Fields kept per item:
 *  - id
 *  - title
 *  - url
 *  - selftext
 *  - permalink
 *  - ups
 *  - num_comments
 *  - created_utc
 *  - domain
 *
 * @param {Object} [opts]
 * @param {('hour'|'day'|'week'|'month'|'year'|'all')} [opts.t='day']
 * @param {number} [opts.limit=25]
 * @returns {Promise<Array<{id:string,title:string,url:string,selftext:string,permalink:string,ups:number,num_comments:number,created_utc:number,domain:string}>>>}
 */
export async function fetchRedditNewsTop(opts = {}) {
  const t = opts.t || 'day';
  const limit = Math.max(1, Math.min(100, parseInt(opts.limit, 10) || 25));
  const url = `https://www.reddit.com/r/news/top.json?t=${encodeURIComponent(t)}&limit=${limit}&raw_json=1`;

  console.log(`[FetchReddit] Fetching r/news top: t=${t} limit=${limit}`);

  const res = await getJsonWithRetry(url, {
    headers: {
      // Set a UA to play nice with Reddit
      'User-Agent': 'news-for-schmucks/1.0 (+https://github.com/aeromax/news-for-schmucks)',
      'Accept': 'application/json'
    },
    timeout: 15000,
    retries: 4,
  });

  const children = res?.data?.data?.children;
  if (!Array.isArray(children)) {
    throw new Error('Unexpected Reddit response shape: missing data.children');
  }

  const items = children.map((child) => {
    const d = child?.data || {};
    return {
      id: String(d.id || ''),
      title: String(d.title || ''),
      url: String(d.url || ''),
      selftext: String(d.selftext || ''),
      permalink: String(d.permalink || ''),
      ups: Number.isFinite(d.ups) ? Number(d.ups) : 0,
      num_comments: Number.isFinite(d.num_comments) ? Number(d.num_comments) : 0,
      created_utc: Number.isFinite(d.created_utc) ? Number(d.created_utc) : 0,
      domain: String(d.domain || ''),
    };
  });

  return items;
}
