// Centralized Discord notifier (ESM) adapted from aeromax/discord-notifier
// Exports: configure, notify, getConfig

import https from 'https';
import { URL } from 'url';

// Discord content limit per message
const DISCORD_LIMIT = 2000;

// Internal state for configuration
const state = {
  channels: {}, // name -> webhook URL
  defaultChannel: undefined,
  defaultUsername: undefined,
  defaultAvatarUrl: undefined,
  timeoutMs: 10000,
};

function parseEnvChannels() {
  const map = {};
  const json = process.env.DISCORD_WEBHOOKS_JSON;
  if (json) {
    try {
      const obj = JSON.parse(json);
      if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === 'string') map[k] = v;
        }
      }
    } catch { /* ignore invalid JSON */ }
  }

  const flat = process.env.DISCORD_WEBHOOKS;
  if (flat) {
    flat.split(/;+/).forEach(pair => {
      const [k, v] = pair.split('=');
      if (k && v) map[k.trim()] = v.trim();
    });
  }

  // Compatibility: single URL via DISCORD_WEBHOOK_URL
  if (process.env.DISCORD_WEBHOOK_URL) {
    const ch = process.env.DISCORD_DEFAULT_CHANNEL || 'default';
    map[ch] = String(process.env.DISCORD_WEBHOOK_URL).trim();
  }

  return map;
}

function bootstrapFromEnv() {
  const envMap = parseEnvChannels();
  if (Object.keys(envMap).length) state.channels = { ...state.channels, ...envMap };
  if (process.env.DISCORD_DEFAULT_CHANNEL) state.defaultChannel = process.env.DISCORD_DEFAULT_CHANNEL;
  if (!state.defaultChannel && process.env.DISCORD_WEBHOOK_URL) state.defaultChannel = 'default';
  if (process.env.DISCORD_USERNAME) state.defaultUsername = process.env.DISCORD_USERNAME;
  if (process.env.DISCORD_AVATAR_URL) state.defaultAvatarUrl = process.env.DISCORD_AVATAR_URL;
  if (process.env.DISCORD_TIMEOUT_MS) {
    const t = Number(process.env.DISCORD_TIMEOUT_MS);
    if (!Number.isNaN(t) && t > 0) state.timeoutMs = t;
  }
}

bootstrapFromEnv();

export function configure(opts = {}) {
  if (opts.channels && typeof opts.channels === 'object') {
    state.channels = { ...state.channels, ...opts.channels };
  }
  if (typeof opts.defaultChannel === 'string') state.defaultChannel = opts.defaultChannel;
  if (typeof opts.defaultUsername === 'string') state.defaultUsername = opts.defaultUsername;
  if (typeof opts.defaultAvatarUrl === 'string') state.defaultAvatarUrl = opts.defaultAvatarUrl;
  if (typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0) state.timeoutMs = opts.timeoutMs;
}

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
  const webhook = state.channels[name];
  if (!webhook) throw new Error(`No webhook URL configured for channel "${name}"`);

  if (typeof message !== 'string') message = String(message);
  if (!message || !message.trim()) return; // silence empty messages

  const username = (overrides && overrides.username) || state.defaultUsername;
  const avatar_url = (overrides && overrides.avatarUrl) || state.defaultAvatarUrl;

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

