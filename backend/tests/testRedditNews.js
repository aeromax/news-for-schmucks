// tests/testRedditNews.js
import { fetchRedditNewsTop } from '../services/fetchRedditNews.js';
import { logNotify } from '../utils/notifier.js';
import { redditBundlesConfig } from '../config/redditBundles.config.js';

async function main() {
  try {
    const t = redditBundlesConfig.t || 'day';
    const limit = Math.max(1, Math.min(100, parseInt(redditBundlesConfig.limit, 10) || 25));

    console.log(`[TestRedditNews] Fetching r/news top (t=${t}, limit=${limit})`);
    const posts = await fetchRedditNewsTop({ t, limit });

    const summary = posts.map(p => ({ id: p.id, title: p.title, url: p.url, reddit: `https://www.reddit.com${p.permalink}` }));
    console.log(JSON.stringify({ count: posts.length, summary }, null, 2));
  } catch (err) {
    if (err?.stack) console.error(err.stack); else console.error(err);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
