// services/summaryLogger.js

import fs from "fs/promises";
import path from "path";

// Append a log entry of the summarizeNews generation to a persistent JSONL file
// One file per day: summaries/YYYY-MM-DD.jsonl
export async function logSummary(summary, urls, baseDir = "./") {
  try {
    const storageDir = process.env.STORAGE_DIR
      ? process.env.STORAGE_DIR
      : (process.env.NODE_ENV === 'production' ? '/var/data' : path.join(baseDir, 'storage'));

    const logsDir = path.join(storageDir, "summaries");

    // Ensure directory exists
    await fs.mkdir(logsDir, { recursive: true });

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');

    const filename = `${yyyy}-${mm}-${dd}.jsonl`;
    const filePath = path.join(logsDir, filename);

    // Normalize record
    const record = {
      timestamp: now.toISOString(),
      urls: typeof urls === 'string' ? urls.split(',').filter(Boolean) : urls,
      // summarizeNews currently returns { text: string[] }
      text: summary?.text ?? summary
    };

    const line = JSON.stringify(record) + "\n";
    await fs.appendFile(filePath, line, { encoding: 'utf8' });
    console.log(`📝➡[Log] Appended summary to ${filePath}`);
  } catch (err) {
    // Do not fail the job if logging fails; just report
    console.error("[Log] Failed to append summary log:", err?.stack || err);
  }
}

