// backend/scripts/syncPublicData.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveStorageDir() {
  if (process.env.STORAGE_DIR) return process.env.STORAGE_DIR;
  return process.env.NODE_ENV === 'production'
    ? '/var/data'
    : path.join(path.dirname(__dirname), '/var/data'); // projectRoot/storage
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function copyFileIfExists(src, dest) {
  try {
    await fs.copyFile(src, dest);
    console.log(`[syncPublicData] Copied ${src} -> ${dest}`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`[syncPublicData] Skip missing: ${src}`);
      return;
    }
    throw err;
  }
}

async function main() {
  const projectRoot = path.join(path.dirname(__dirname));
  const storageDir = resolveStorageDir();
  const publicDataDir = path.join(projectRoot, 'public', 'data');

  await ensureDir(publicDataDir);

  // Copy known files used by the frontend
  const toCopy = [
    { name: 'audio.mp3' },
    { name: 'transcript.json' }
  ];

  for (const f of toCopy) {
    const src = path.join(storageDir, f.name);
    const dest = path.join(publicDataDir, f.name);
    await copyFileIfExists(src, dest);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('[syncPublicData] Failed:', err);
    process.exit(0); // Don't block server start; fail soft
  });
}

