// services/fetchHeadlines.js

import axios from "axios";

export async function fetchHeadlines(apiKey) {
    console.log("[Fetch] Getting top headlines...");

    const res = await axios.get(
        `https://newsapi.org/v2/top-headlines?source=bbc_news&country=us&pageSize=15&apiKey=${apiKey}`
    );
    const articles = res.data.articles.filter(a => a.content);

    if (!articles.length) {
        throw new Error("No articles found in response.");
    }

    const urls = articles.map(a => a.url).join(",");
    return urls;
}
