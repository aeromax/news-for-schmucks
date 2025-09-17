import fs from "fs/promises";
import { spawn } from "child_process";

function createBiquad(type, freq, q, sampleRate) {
  const w0 = 2 * Math.PI * (freq / sampleRate);
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  let b0, b1, b2, a0, a1, a2;

  if (type === "lowpass") {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
  } else if (type === "bandpass") {
    b0 = sin / 2;
    b1 = 0;
    b2 = -sin / 2;
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
  } else { // highpass
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
  }

  const invA0 = 1 / a0;
  return {
    b0: b0 * invA0,
    b1: b1 * invA0,
    b2: b2 * invA0,
    a1: a1 * invA0,
    a2: a2 * invA0,
    x1: 0,
    x2: 0,
    y1: 0,
    y2: 0,
    process(sample) {
      const y = this.b0 * sample + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
      this.x2 = this.x1;
      this.x1 = sample;
      this.y2 = this.y1;
      this.y1 = y;
      return y;
    }
  };
}

export async function buildVisualizerData(audioPath, outputPath, options = {}) {
  const sampleRate = options.sampleRate || 16000;
  const frameMs = options.frameMs || 60;
  const windowSize = Math.max(1, Math.round(sampleRate * (frameMs / 1000)));

  const filters = {
    low: createBiquad("lowpass", 200, Math.SQRT1_2, sampleRate),
    mid: createBiquad("bandpass", 1000, 1, sampleRate),
    high: createBiquad("highpass", 3000, Math.SQRT1_2, sampleRate)
  };

  const ffmpeg = spawn("ffmpeg", ["-i", audioPath, "-ac", "1", "-ar", String(sampleRate), "-f", "f32le", "pipe:1"], {
    stdio: ["ignore", "pipe", "ignore"]
  });

  let frames = [];
  let totals = { low: 0, mid: 0, high: 0, full: 0 };
  let sampleCount = 0;
  let frameIndex = 0;
  let pending = Buffer.alloc(0);

  const processSample = (value) => {
    const low = filters.low.process(value);
    const mid = filters.mid.process(value);
    const high = filters.high.process(value);
    totals.low += low * low;
    totals.mid += mid * mid;
    totals.high += high * high;
    totals.full += value * value;
    sampleCount += 1;

    if (sampleCount === windowSize) {
      const t = (frameIndex * windowSize) / sampleRate;
      frames.push({
        t,
        bass: Math.sqrt(totals.low / windowSize),
        mid: Math.sqrt(totals.mid / windowSize),
        treble: Math.sqrt(totals.high / windowSize),
        full: Math.sqrt(totals.full / windowSize)
      });
      totals = { low: 0, mid: 0, high: 0, full: 0 };
      sampleCount = 0;
      frameIndex += 1;
    }
  };

  ffmpeg.stdout.on("data", (chunk) => {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    const floatCount = Math.floor(pending.length / 4);
    if (!floatCount) return;
    const view = new Float32Array(pending.buffer, pending.byteOffset, floatCount);
    for (let i = 0; i < view.length; i += 1) processSample(view[i]);
    const usedBytes = floatCount * 4;
    pending = usedBytes === pending.length ? Buffer.alloc(0) : pending.slice(usedBytes);
  });

  await new Promise((resolve, reject) => {
    ffmpeg.once("error", reject);
    ffmpeg.once("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
  });

  if (sampleCount > 0) {
    const t = (frameIndex * windowSize) / sampleRate;
    frames.push({
      t,
      bass: Math.sqrt(totals.low / sampleCount),
      mid: Math.sqrt(totals.mid / sampleCount),
      treble: Math.sqrt(totals.high / sampleCount),
      full: Math.sqrt(totals.full / sampleCount)
    });
  }

  if (!frames.length) {
    await fs.writeFile(outputPath, JSON.stringify({ version: 1, interval: frameMs / 1000, frames: [] }));
    return;
  }

  let max = 0;
  for (const frame of frames) {
    max = Math.max(max, frame.bass, frame.mid, frame.treble, frame.full);
  }
  const scale = max > 0 ? 1 / max : 1;

  const payload = {
    version: 1,
    interval: frameMs / 1000,
    frames: frames.map((frame) => ({
      t: Number(frame.t.toFixed(3)),
      bass: Number((frame.bass * scale).toFixed(3)),
      mid: Number((frame.mid * scale).toFixed(3)),
      treble: Number((frame.treble * scale).toFixed(3)),
      full: Number((frame.full * scale).toFixed(3))
    }))
  };

  await fs.writeFile(outputPath, JSON.stringify(payload));
}
