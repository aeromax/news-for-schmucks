const requiredVars = ["NEWS_API_KEY", "OPENAI_API_KEY"];
import dotenv from "dotenv";
dotenv.config();
export const env = {};

for (const key of requiredVars) {
    const value = process.env[key];
    
    if (!value) {
        console.error(`[ENV ERROR] Missing required environment variable: ${key}`);
        process.exit(1);
    }
    env[key] = value;
}
