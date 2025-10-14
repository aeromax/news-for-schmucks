// services/summarizerInstructions.js
import fs from 'fs/promises';
import path from 'path';
import { logNotify } from '../utils/notifier.js';

const FILE_NAME = 'summarizer-instructions.json';

function resolveStorageRoot(baseDir = process.cwd()) {
  if (process.env.STORAGE_DIR && process.env.STORAGE_DIR.trim()) {
    return process.env.STORAGE_DIR.trim();
  }
  if (process.env.NODE_ENV === 'production') {
    return '/var/data';
  }
  return path.join(baseDir, 'storage');
}

function resolveFilePath(baseDir) {
  const root = resolveStorageRoot(baseDir);
  return { filePath: path.join(root, FILE_NAME), root };
}

async function loadInstructions(baseDir) {
  const { filePath } = resolveFilePath(baseDir);
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(text);
    return {
      byDate: parsed?.byDate && typeof parsed.byDate === 'object' ? parsed.byDate : {},
      next: parsed?.next && typeof parsed.next === 'object' ? parsed.next : null,
    };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { byDate: {}, next: null };
    }
    logNotify(`[summarizerInstructions] load failed: ${err?.message || err}`);
    throw err;
  }
}

async function saveInstructions(data, baseDir) {
  const { filePath, root } = resolveFilePath(baseDir);
  await fs.mkdir(root, { recursive: true });
  const payload = {
    byDate: data?.byDate && typeof data.byDate === 'object' ? data.byDate : {},
    next: data?.next && typeof data.next === 'object' ? data.next : null,
  };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function sanitizeInstruction(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.slice(0, 500); // limit to a reasonable length
}

export async function listInstructions(baseDir) {
  return loadInstructions(baseDir);
}

export async function upsertInstruction({ date, text, type = 'date' }, baseDir) {
  const data = await loadInstructions(baseDir);
  const cleanText = sanitizeInstruction(text);
  if (!cleanText) {
    throw new Error('Instruction text required');
  }

  const now = new Date().toISOString();

  if (type === 'next') {
    data.next = { text: cleanText, updatedAt: now };
  } else {
    if (!date) throw new Error('Date is required for date-based instructions');
    const key = String(date).slice(0, 10);
    data.byDate[key] = { text: cleanText, updatedAt: now };
  }

  await saveInstructions(data, baseDir);
  return data;
}

export async function removeInstruction(identifier, baseDir) {
  const data = await loadInstructions(baseDir);
  if (identifier === 'next') {
    data.next = null;
  } else if (identifier) {
    delete data.byDate[String(identifier).slice(0, 10)];
  }
  await saveInstructions(data, baseDir);
  return data;
}

export async function getInstructionForDate(date, { baseDir, consumeNext = true } = {}) {
  const data = await loadInstructions(baseDir);
  const key = String(date || '').slice(0, 10);

  if (key && data.byDate[key] && data.byDate[key].text) {
    return { text: data.byDate[key].text, source: { type: 'date', key } };
  }

  if (consumeNext && data.next && data.next.text) {
    const nextInstruction = { ...data.next };
    data.next = null;
    await saveInstructions(data, baseDir);
    return { text: nextInstruction.text, source: { type: 'next' } };
  }

  return { text: '', source: null };
}
