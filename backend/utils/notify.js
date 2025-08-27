import 'dotenv/config';

export async function sendDiscordWebhook(content, opts = {}) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) throw new TypeError('webhookUrl required');
    if (typeof content !== 'string') throw new TypeError('content must be string');

    // Call the function, don't just reference it
    const timeStamp = formatESTDateTime();

    // Add timestamp to the message
    const payload = { content: `${content}  ${timeStamp}` };

    if (opts.username) payload.username = opts.username;
    if (opts.avatar_url) payload.avatar_url = opts.avatar_url;
    if (Array.isArray(opts.embeds) && opts.embeds.length) payload.embeds = opts.embeds;
    if (opts.tts) payload.tts = true;

    const controller = new AbortController();
    const timeout = opts.timeout ?? 10000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.status === 429) {
            const body = await res.json().catch(() => ({}));
            const wait = (body?.retry_after ?? 1) / 1000;
            throw new Error(`Rate limited by Discord. Retry after ${wait}s`);
        }

        if (!res.ok) {
            const body = await res.text().catch(() => '<no body>');
            throw new Error(`Discord webhook failed: ${res.status} ${res.statusText} — ${body}`);
        }

        return { ok: true, status: res.status };
    } catch (err) {
        if (err.name === 'AbortError') throw new Error(`Request timed out after ${timeout}ms`);
        throw err;
    }

    function formatESTDateTime(date = new Date()) {
        return date.toLocaleString("en-US", {
            timeZone: "America/New_York",
            hour12: true,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    }
}
