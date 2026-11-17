import type { Danmaku } from "./types";

export type PlacedDanmaku = {
  id: string;
  time: number;
  lane: number;
  width: number;
  text: string;
  color: string;
};

export type LayoutOptions = {
  containerWidth: number;
  laneCount: number;
  /** Seconds a danmaku takes to cross the container width. */
  crossSeconds: number;
  /** Minimum horizontal gap between consecutive danmaku in a lane (px). */
  gap: number;
  /** 0..1 — fraction of danmaku to keep (display density). */
  displayDensity: number;
  measure: (text: string) => number;
};

/** Stable 0..99 bucket for an id, so density sampling does not flicker. */
export function densityBucket(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100;
}

/**
 * Assign lanes so no two danmaku overlap. All items move at the same speed
 * (containerWidth / crossSeconds), so a lane is free once the previous item's
 * tail has fully entered the screen plus a gap. Items that fit no lane are dropped.
 */
export function layoutDanmaku(items: Danmaku[], opts: LayoutOptions): PlacedDanmaku[] {
  const { containerWidth, laneCount, crossSeconds, gap, displayDensity, measure } = opts;
  if (containerWidth <= 0 || laneCount <= 0 || crossSeconds <= 0) return [];
  const speed = containerWidth / crossSeconds;
  const keep = Math.round(Math.max(0, Math.min(1, displayDensity)) * 100);
  const sorted = [...items].sort((a, b) => a.time - b.time);
  const laneLast: ({ time: number; width: number } | null)[] = new Array(laneCount).fill(null);
  const placed: PlacedDanmaku[] = [];
  for (const d of sorted) {
    if (densityBucket(d.id) >= keep) continue;
    const width = measure(d.text);
    let chosen = -1;
    for (let lane = 0; lane < laneCount; lane++) {
      const last = laneLast[lane];
      if (!last || (d.time - last.time) * speed >= last.width + gap) {
        chosen = lane;
        break;
      }
    }
    if (chosen === -1) continue;
    laneLast[chosen] = { time: d.time, width };
    placed.push({ id: d.id, time: d.time, lane: chosen, width, text: d.text, color: d.color });
  }
  return placed;
}

/** x position of a placed danmaku at time t, or null when not visible. */
export function positionAt(
  p: PlacedDanmaku,
  t: number,
  containerWidth: number,
  crossSeconds: number,
): number | null {
  if (t < p.time) return null;
  const speed = containerWidth / crossSeconds;
  const x = containerWidth - (t - p.time) * speed;
  if (x + p.width < 0) return null;
  return x;
}

/** Visible items at time t; `placed` must be sorted by time. */
export function visibleAt(
  placed: PlacedDanmaku[],
  t: number,
  containerWidth: number,
  crossSeconds: number,
  maxWidth: number,
): { item: PlacedDanmaku; x: number }[] {
  const speed = containerWidth / crossSeconds;
  const earliest = t - (containerWidth + maxWidth) / speed;
  let lo = 0;
  let hi = placed.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (placed[mid]!.time < earliest) lo = mid + 1;
    else hi = mid;
  }
  const out: { item: PlacedDanmaku; x: number }[] = [];
  for (let i = lo; i < placed.length && placed[i]!.time <= t; i++) {
    const x = positionAt(placed[i]!, t, containerWidth, crossSeconds);
    if (x !== null) out.push({ item: placed[i]!, x });
  }
  return out;
}

/** Danmaku count for a segment given density (per minute), clamped to remaining total. */
export function segmentCount(
  density: number,
  segmentSeconds: number,
  remaining: number | null,
): number {
  const base = Math.max(1, Math.round((density * segmentSeconds) / 60));
  if (remaining === null) return base;
  return Math.max(0, Math.min(base, remaining));
}
