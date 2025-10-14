// tests/testExtractArticles.js
import { fetchRedditNewsTop } from '../services/fetchRedditNews.js';
import { extractArticles } from '../services/articleExtractor.js';
import { logNotify } from '../utils/notifier.js';

async function main() {
  try {
    console.log('[TestExtractArticles] Fetching r/news top for the week…');
    const posts = await fetchRedditNewsTop({ t: 'week', limit: 5 });
    const urls = posts.map(p => p.url);
    const extracted = await extractArticles(urls, { concurrency: 3 });
    const preview = extracted.map(a => ({ url: a.url, title: a.title, site: a.siteName, summary: (a.summary || '').slice(0, 240) }));
  } catch (err) {
    if (err?.stack) console.error(err.stack); else console.error(err);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
