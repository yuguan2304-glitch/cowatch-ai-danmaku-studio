import { db } from "../db";
import type { Danmaku, Segment, VideoSource, Settings } from "../types";

/** Private, on-device generated danmaku progress. Never contains API keys or video bytes. */
export type DanmakuCheckpoint = {
  version: 1;
  completed: Array<{ start: number; end: number; items: Danmaku[] }>;
  updatedAt: number;
};

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
}

/** Bind progress to both the actual video and material generation settings. */
export async function danmakuCheckpointKey(source: VideoSource, duration: number, settings: Settings): Promise<string> {
  let media: unknown;
  if (source.kind === "file" && source.file) {
    const f = source.file;
    const first = new Uint8Array(await f.slice(0, 32768).arrayBuffer());
    const last = new Uint8Array(await f.slice(Math.max(0, f.size - 32768)).arrayBuffer());
    const combined = new Uint8Array(first.byteLength + last.byteLength);
    combined.set(first);
    combined.set(last, first.byteLength);
    media = ["file", f.name, f.size, f.lastModified, await sha256(combined)];
  } else {
    media = [source.kind, source.kind === "youtube" ? source.youtubeId : source.src || source.label];
  }
  // Request budget and playback mode are deliberately excluded: they must not reset saved progress.
  const generation = { ...settings.generation, requestLimit: undefined, bufferMode: undefined, lookahead: undefined, maxRetries: undefined };
  const input = JSON.stringify({
    media, duration: Math.round(duration * 10) / 10,
    provider: [settings.provider.kind, settings.provider.baseUrl, settings.provider.model,
      settings.provider.geminiInput, settings.provider.jsonMode, settings.provider.imageDetail],
    analysis: settings.analysis, generation, audience: settings.audience,
  });
  return "cowatch:danmaku-checkpoint:v1:" + await sha256(new TextEncoder().encode(input));
}

export async function loadDanmakuCheckpoint(key: string): Promise<DanmakuCheckpoint | undefined> {
  const data = await db.getLocalValue<DanmakuCheckpoint>(key);
  if (!data || data.version !== 1 || !Array.isArray(data.completed)) return undefined;
  return data;
}

export async function saveDanmakuChunk(
  key: string, seg: Segment, items: Danmaku[],
): Promise<void> {
  const state = await loadDanmakuCheckpoint(key) ?? { version: 1 as const, completed: [], updatedAt: 0 };
  state.completed = state.completed.filter(x => Math.abs(x.start - seg.start) > 0.01 || Math.abs(x.end - seg.end) > 0.01);
  state.completed.push({ start: seg.start, end: seg.end, items });
  state.updatedAt = Date.now();
  await db.putLocalValue(key, state);
}

export async function removeDanmakuChunk(key: string, seg: Segment): Promise<void> {
  const state = await loadDanmakuCheckpoint(key);
  if (!state) return;
  state.completed = state.completed.filter(x => Math.abs(x.start - seg.start) > 0.01 || Math.abs(x.end - seg.end) > 0.01);
  state.updatedAt = Date.now();
  await db.putLocalValue(key, state);
}

export async function clearDanmakuCheckpoint(key: string): Promise<void> {
  await db.deleteLocalValue(key);
}
