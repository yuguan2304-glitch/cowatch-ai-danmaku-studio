import type { Cue } from "./types";

function parseTimestamp(ts: string): number | null {
  const m = ts.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!m) return null;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2]);
  const s = Number(m[3]);
  const ms = Number((m[4] ?? "0").padEnd(3, "0"));
  return h * 3600 + min * 60 + s + ms / 1000;
}

/** Parse SRT or WebVTT text into cues. Tags are stripped. */
export function parseSubtitles(raw: string): Cue[] {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const blocks = text.split(/\n{2,}/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const idx = lines.findIndex((l) => l.includes("-->"));
    if (idx === -1) continue;
    const [a, bRaw] = lines[idx].split("-->");
    const b = bRaw.trim().split(/\s+/)[0];
    const start = parseTimestamp(a);
    const end = parseTimestamp(b);
    if (start === null || end === null) continue;
    const body = lines
      .slice(idx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\{\\[^}]*\}/g, "")
      .trim();
    if (!body) continue;
    cues.push({ start, end: Math.max(end, start), text: body });
  }
  return cues.sort((x, y) => x.start - y.start);
}

/** Cues overlapping [from, to). */
export function cuesInRange(cues: Cue[], from: number, to: number): Cue[] {
  return cues.filter((c) => c.end >= from && c.start < to);
}
