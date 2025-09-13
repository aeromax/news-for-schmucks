// tests/testRedditTone.js
import { fetchRedditNewsTop } from '../services/fetchRedditNews.js';
import { selectToneComments } from '../services/selectToneComments.js';
import { logNotify } from '../utils/notifier.js';

async function main() {
  try {
    logNotify('[TestRedditTone] Fetching top posts…');
    const posts = await fetchRedditNewsTop({ t: 'day', limit: 10 });
    if (!posts.length) throw new Error('No posts');
    const first = posts[0];
    logNotify(`[TestRedditTone] Using post: ${first.title}`);

    const selected = await selectToneComments(first.permalink, {});
    console.log(JSON.stringify({
      post: { id: first.id, title: first.title, permalink: `https://www.reddit.com${first.permalink}` },
      count: selected.length,
      comments: selected
    }, null, 2));
  } catch (err) {
    if (err?.stack) console.error(err.stack); else console.error(err);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
