// services/articleExtractor.js

import axios from 'axios';
import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { logNotify } from '../utils/notifier.js';

function toText(x) { return (x == null ? '' : String(x)).trim(); }

export async function fetchHtml(url, { timeout = 20000 } = {}) {
  const res = await axios.get(url, {
    timeout,
    responseType: 'text',
    headers: {
      'User-Agent': 'news-for-schmucks/1.0 (+https://github.com/aeromax/news-for-schmucks)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    maxRedirects: 5,
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return res.data;
}

export function parseHtml(html, url) {
  // Suppress noisy jsdom CSS parser warnings/errors that can spam the console
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => { /* swallow jsdom internal errors (e.g., CSS parse) */ });
  try {
    const dom = new JSDOM(html, {
      url,
      contentType: 'text/html',
      pretendToBeVisual: true,
      runScripts: 'outside-only',
      virtualConsole: vc,
    });
    return dom.window.document;
  } catch {
    // Fallback to a minimal document if parsing fails
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
      url,
      contentType: 'text/html',
      pretendToBeVisual: true,
      runScripts: 'outside-only',
      virtualConsole: vc,
    });
    return dom.window.document;
  }
}

function getMeta(doc, selectors) {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const c = el.getAttribute('content') || el.getAttribute('value') || el.textContent;
      if (c && toText(c)) return toText(c);
    }
  }
  return '';
}

function extractMeta(doc) {
  const title = toText(getMeta(doc, [
    'meta[property="og:title"]', 'meta[name="twitter:title"]', 'meta[name="title"]'
  ])) || toText(doc.querySelector('title')?.textContent || '');
  const description = toText(getMeta(doc, [
    'meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]'
  ]));
  const siteName = toText(getMeta(doc, [
    'meta[property="og:site_name"]'
  ]));
  const published = toText(getMeta(doc, [
    'meta[property="article:published_time"]', 'meta[name="pubdate"]', 'meta[name="date"]'
  ]));
  const byline = toText(getMeta(doc, [
    'meta[name="author"]', 'meta[property="article:author"]'
  ]));
  const image = toText(getMeta(doc, [
    'meta[property="og:image"]', 'meta[name="twitter:image"]'
  ]));
  return { title, description, siteName, published, byline, image };
}

function cleanText(s) {
  return toText(s).replace(/\s+/g, ' ').trim();
}

export function extractWithReadability(doc) {
  try {
    const reader = new Readability(doc, { keepClasses: false });
    const art = reader.parse();
    if (art && (art.textContent || art.content)) {
      return {
        title: toText(art.title),
        byline: toText(art.byline),
        text: cleanText(art.textContent || ''),
        length: (art.textContent || '').length,
      };
    }
  } catch { }
  return { title: '', byline: '', text: '', length: 0 };
}

export async function extractArticle(url) {
  console.log(`[ArticleExtract] Fetching ${url}`);
  const html = await fetchHtml(url);
  const doc = parseHtml(html, url);
  const meta = extractMeta(doc);
  const read = extractWithReadability(doc);
  const title = read.title || meta.title;
  const byline = read.byline || meta.byline;
  const text = read.text || '';
  const summary = meta.description || text.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ');
  return {
    url,
    title,
    byline,
    siteName: meta.siteName,
    published: meta.published,
    topImage: meta.image,
    description: meta.description,
    text,
    summary,
    length: text.length,
  };
}

export async function extractArticles(urls, { concurrency = 3 } = {}) {
  const list = Array.isArray(urls) ? urls : String(urls || '').split(',').map(s => s.trim()).filter(Boolean);
  const out = [];
  let i = 0, active = 0, err;
  return await new Promise((resolve, reject) => {
    const next = async () => {
      if (err) return; // stop on first error
      if (i >= list.length && active === 0) return resolve(out);
      if (i >= list.length) return;
      const idx = i++; active++;
      extractArticle(list[idx])
        .then(v => { out[idx] = v; })
        .catch(e => { out[idx] = { url: list[idx], error: e?.message || String(e) }; })
        .finally(() => { active--; next(); });
      if (active < concurrency && i < list.length) next();
    };
    for (let k = 0; k < Math.min(concurrency, list.length); k++) next();
  });
}
