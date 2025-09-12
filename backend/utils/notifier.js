// Centralized Discord notifier (ESM) adapted from aeromax/discord-notifier
// Exports: configure, notify, getConfig

import https from 'https';
import { URL } from 'url';

// Discord content limit per message
const DISCORD_LIMIT = 2000;

// Code-based global defaults. Edit these values directly if you prefer
// not to rely on environment variables.
// NOTE: Do not commit real webhook URLs to source control.
const codeDefaults = {
  channels: {
    test: 'https://discord.com/api/webhooks/1415871530788851802/0QhsSFQsfeklwjmTAqLaiXZZXny8JtBY4cq7i5kFCGkOjR1ppjNnKKtONim89_SVGBk-',
  },
  defaultChannel: 'test',
  defaultUsername: 'News for Schmucks',
  defaultAvatarUrl: undefined,
  timeoutMs: 10000,
};

// Internal state for configuration (initialized from codeDefaults)
const state = {
  channels: { ...(codeDefaults.channels || {}) },
  defaultChannel: codeDefaults.defaultChannel,
  defaultUsername: codeDefaults.defaultUsername,
  defaultAvatarUrl: codeDefaults.defaultAvatarUrl,
  timeoutMs: codeDefaults.timeoutMs,
};

// No environment bootstrapping — configuration is code-driven.

export function configure(opts = {}) {
  if (opts.channels && typeof opts.channels === 'object') {
    state.channels = { ...state.channels, ...opts.channels };
  }
  if (typeof opts.defaultChannel === 'string') state.defaultChannel = opts.defaultChannel;
  if (typeof opts.defaultUsername === 'string') state.defaultUsername = opts.defaultUsername;
  if (typeof opts.defaultAvatarUrl === 'string') state.defaultAvatarUrl = opts.defaultAvatarUrl;
  if (typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0) state.timeoutMs = opts.timeoutMs;
}

// configure(...) remains available for runtime tweaks if needed

function toChunks(str, size) {
  const s = String(str);
  const parts = [];
  for (let i = 0; i < s.length; i += size) parts.push(s.slice(i, i + size));
  return parts;
}

function postJson(urlString, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const payload = Buffer.from(JSON.stringify(body), 'utf8');
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        path: url.pathname + url.search,
        port: url.port || 443,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(payload.length),
          'User-Agent': 'discord-notifier/esm',
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, body: data });
          } else {
            const err = new Error(`Discord webhook error ${res.statusCode}: ${data}`);
            err.statusCode = res.statusCode;
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

export async function notify(a, b, c) {
  let channelName;
  let message;
  let overrides = {};

  if (typeof b === 'undefined' && typeof c === 'undefined') {
    // notify('message')
    message = a;
    channelName = undefined;
  } else if (typeof b === 'object' && b !== null && typeof c === 'undefined') {
    // notify('message', overrides)
    message = a;
    overrides = b;
    channelName = undefined;
  } else {
    // notify(channel, message[, overrides]) or notify(undefined, message[, overrides])
    channelName = a;
    message = b;
    overrides = c || {};
  }

  const name = channelName || state.defaultChannel;
  if (!name) throw new Error('No channel specified and no defaultChannel configured');
  let webhook = state.channels[name];
  // Fallback: use DISCORD_WEBHOOK_URL from environment for the default channel
  if (!webhook && name === 'default' && typeof process !== 'undefined' && process.env && process.env.DISCORD_WEBHOOK_URL) {
    webhook = String(process.env.DISCORD_WEBHOOK_URL).trim();
    if (webhook) state.channels[name] = webhook;
  }
  if (!webhook) throw new Error(`No webhook URL configured for channel "${name}"`);

  if (typeof message !== 'string') message = String(message);
  if (!message || !message.trim()) return; // silence empty messages

  const username = (overrides && overrides.username) || state.defaultUsername;
  const avatar_url = (overrides && overrides.avatarUrl) || state.defaultAvatarUrl;

  // Allow rich formatting via embeds when provided (single payload)
  if (overrides && Array.isArray(overrides.embeds) && overrides.embeds.length) {
    const payload = { content: message.slice(0, DISCORD_LIMIT), embeds: overrides.embeds };
    if (username) payload.username = username;
    if (avatar_url) payload.avatar_url = avatar_url;
    await postJson(webhook, payload, state.timeoutMs);
    return;
  }

  const chunks = toChunks(message, DISCORD_LIMIT);
  for (const [i, chunk] of chunks.entries()) {
    const content = chunks.length > 1 ? `(${i + 1}/${chunks.length})\n${chunk}` : chunk;
    const payload = { content };
    if (username) payload.username = username;
    if (avatar_url) payload.avatar_url = avatar_url;
    await postJson(webhook, payload, state.timeoutMs);
  }
}

export function getConfig() {
  return { ...state, channels: { ...state.channels } };
}

// Log to console and post to Discord concurrently (fire-and-forget for Discord)
export function logNotify(message, overrides) {
  try {
    // Always log locally
    // eslint-disable-next-line no-console
    console.log(message);
  } catch { }
  try {
    // Post to Discord without blocking the caller
    Promise.resolve()
      .then(() => notify(message, overrides))
      // eslint-disable-next-line no-console
      .catch((err) => console.error('[logNotify] notify failed:', err?.message || err));
  } catch { }
}
