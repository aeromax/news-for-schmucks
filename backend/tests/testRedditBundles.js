// tests/testRedditBundles.js
import { buildRedditBundles, toPromptBlocks } from '../services/buildRedditBundles.js';
import { redditBundlesConfig } from '../config/redditBundles.config.js';
import { logNotify } from '../utils/notifier.js';

async function main() {
  try {
    const bundles = await buildRedditBundles(redditBundlesConfig);
    // Show a compact JSON summary and the first prompt block chunk
    const summary = bundles.map(b => ({ id: b.id, title: b.title, url: b.url, reddit: `https://www.reddit.com${b.permalink}`, comments: b.comments.length }));
    console.log('[Summary]', JSON.stringify(summary, null, 2));

    const promptAll = toPromptBlocks(bundles, { maxCommentLen: 220, maxCommentsPerStory: 6 });
    console.log(`\n--- LLM Prompt (${bundles.length} stories) ---\n`);
    console.log(promptAll);
  } catch (err) {
    if (err?.stack) console.error(err.stack); else console.error(err);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
