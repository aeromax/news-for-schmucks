import 'dotenv/config';

export async function sendDiscordWebhook(content, opts = {}) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) throw new TypeError('webhookUrl required');
    if (typeof content !== 'string') throw new TypeError('content must be string');

    const payload = { content };

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
            // basic retry info
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
}
