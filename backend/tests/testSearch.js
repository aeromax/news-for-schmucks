// backend/scripts/testSearch.js
import 'dotenv/config';
import wiki from 'wikipedia';

async function main() {
  const args = process.argv.slice(2);
  const get = (flag, def) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : def;
  };

  const lang = get('--lang', process.env.SEARCH_LANG || 'en');
  const limit = clampInt(get('--limit', process.env.SEARCH_LIMIT || '2'), 1, 10, 2);
  const termsFromArgs = args.filter((a) => !a.startsWith('--') && a.trim());
  const defaultTerms = [
    'Boeing 737 MAX',
    'Elon Musk',
    'NVIDIA',
    'TikTok ban',
    'Ukraine war'
  ];
  const terms = termsFromArgs.length ? termsFromArgs : defaultTerms;

  try {
    await wiki.setLang(String(lang));
  } catch {}

  console.log(`[TestSearch] lang=${lang} limit=${limit} terms=${JSON.stringify(terms)}`);

  for (const term of terms) {
    try {
      const t = String(term).trim();
      if (!t) continue;
      const res = await wiki.search(t, { limit, suggestion: true });
      const list = Array.isArray(res?.results) ? res.results : Array.isArray(res) ? res : [];
      console.log(`\n=== ${t} ===`);
      if (!list.length) {
        console.log('(no results)');
        continue;
      }
      const picked = list.slice(0, limit);
      for (const r of picked) {
        const title = r?.title || r?.page || r?.displaytitle || '';
        if (!title) continue;
        let extract = '';
        try {
          const sum = await wiki.summary(title).catch(() => null);
          if (sum?.extract) extract = String(sum.extract).slice(0, 600);
        } catch {}
        const url = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
        console.log(`- ${title}`);
        console.log(`  ${url}`);
        if (extract) console.log(`  ${extract}`);
      }
    } catch (err) {
      const data = err?.response?.data || err?.message || err;
      console.error(`[TestSearch] error for term "${term}":`, data);
    }
  }
}

function clampInt(v, min, max, dflt) {
  const n = parseInt(v, 10);
  if (Number.isFinite(n)) return Math.min(max, Math.max(min, n));
  return dflt;
}

main().catch((err) => {
  const data = err?.response?.data || err?.message || err;
  console.error('[TestSearch] fatal:', data);
  process.exitCode = 1;
});

