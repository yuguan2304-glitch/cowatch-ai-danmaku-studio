/**
 * Local sound-energy timeline. No audio is uploaded; no extra AI request.
 * This measures amplitude only: it cannot recognize speech or identify sounds.
 */
let cached: { file: File; promise: Promise<Float32Array | null> } | null = null;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_SECONDS = 20 * 60;

async function calculate(file: File): Promise<Float32Array | null> {
  if (file.size > MAX_BYTES || !file.size) return null;
  const AudioCtor = window.AudioContext;
  if (!AudioCtor) return null;
  const ctx = new AudioCtor();
  try {
    const bytes = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(bytes);
    if (decoded.duration > MAX_SECONDS || decoded.duration <= 0) return null;
    const buckets = new Float32Array(Math.ceil(decoded.duration));
    const counts = new Uint16Array(buckets.length);
    const channel = decoded.getChannelData(0);
    // Sample RMS approximately every 10ms; avoid scanning every PCM sample.
    const step = Math.max(1, Math.floor(decoded.sampleRate / 100));
    for (let i = 0; i < channel.length; i += step) {
      const second = Math.floor(i / decoded.sampleRate);
      if (second >= buckets.length) break;
      const value = channel[i] ?? 0;
      buckets[second] = buckets[second]! + value * value;
      counts[second] = counts[second]! + 1;
    }
    for (let i = 0; i < buckets.length; i++) {
      buckets[i] = Math.sqrt(buckets[i]! / Math.max(1, counts[i]!));
    }
    return buckets;
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

/** Returns a compact relative-volume description; never implies what produced a sound. */
export async function localAudioClues(file: File, start: number, end: number): Promise<string | null> {
  if (cached?.file !== file) {
    cached = { file, promise: calculate(file).catch(() => null) };
  }
  const levels = await cached.promise;
  if (!levels) return null;
  const slice = Array.from(levels.slice(Math.max(0, Math.floor(start)), Math.min(levels.length, Math.ceil(end))));
  if (!slice.length) return null;
  const highest = Math.max(...slice);
  const average = slice.reduce((a, b) => a + b, 0) / slice.length;
  if (highest < 0.003) return "整体音量很低或近乎静音（仅测得幅度）";
  const peaks: number[] = [];
  const threshold = Math.max(0.025, average * 2.2);
  for (let i = 0; i < slice.length; i++) {
    if (slice[i]! >= threshold && slice[i]! >= (slice[i - 1] ?? 0) && slice[i]! >= (slice[i + 1] ?? 0)) {
      peaks.push(Math.floor(start) + i);
      if (peaks.length >= 4) break;
    }
  }
  return peaks.length
    ? "音量较明显的时间点（不代表一定有惊叫/爆炸/说话）：" + peaks.map(t => t + "s").join("、")
    : "音量无显著突增（无法判断具体声音内容）";
}

export function clearLocalAudioCache() {
  cached = null;
}
