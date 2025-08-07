// services/fetchHeadlines.js

import axios from "axios";
import fs from "fs/promises";
import path from "path";

export async function fetchHeadlines(apiKey, testMode = false) {
    console.log("[Fetch] Getting top headlines" + (testMode ? " (TEST MODE)" : "") + "...");

    let articles;

    if (testMode) {
        const filePath = path.resolve("./test/top-headlines.json");
        const raw = await fs.readFile(filePath, "utf-8");
        const data = JSON.parse(raw);
        articles = data.articles.filter(a => a.content);
    } else {
        const res = await axios.get(
            `https://newsapi.org/v2/top-headlines?source=bbc_news&country=us&pageSize=15&apiKey=${apiKey}`
        );
        articles = res.data.articles.filter(a => a.content);
    }

    if (!articles.length) {
        throw new Error("No articles found in response.");
    }

    const urls = articles.map(a => a.url).join(",");
    return urls;
}
