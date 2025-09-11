import { fetchHeadlines } from "../services/fetchHeadlines.js";

try {
  await fetchHeadlines(process.env.NEWS_API_KEY);
} catch (err) {
  const data = err?.response?.data || err?.message || err;
  console.error('[TestHeadlines] error:', data);
  process.exitCode = 1;
}
