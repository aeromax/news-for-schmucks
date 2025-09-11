// services/fetchHeadlines.js

import axios from "axios";
import { logNotify } from "../utils/notifier.js";

export async function fetchHeadlines(apiKey) {
    logNotify("[Fetch] Getting top headlines...");

    const res = await axios.get(
        `https://newsapi.org/v2/top-headlines?source=bbc_news&country=us&apiKey=${apiKey}`
    );
    const articles = res.data.articles.filter(a => a.content);

    if (!articles.length) {
        throw new Error("No articles found in response.");
    }

    // Randomly select 8 stories (or fewer if not available)
    const sampleSize = Math.min(8, articles.length);
    const picked = shuffle(articles.slice()).slice(0, sampleSize);

    // Map to unique URLs and join as CSV
    const urls = Array.from(new Set(picked.map(a => a.url))).join(",");
    console.log(urls);
    return urls;
}

// Fisher–Yates shuffle for unbiased random order
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
