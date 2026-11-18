import type { Danmaku } from "../types";
import { uid } from "../id";

/** Pull a JSON value out of model text (handles ```json fences and stray prose). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? (fence[1] ?? "").trim() : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    const firstObj = body.indexOf("{");
    const firstArr = body.indexOf("[");
    const starts = [firstObj, firstArr].filter((i) => i >= 0);
    if (starts.length === 0) throw new Error("模型输出中没有 JSON");
    const start = Math.min(...starts);
    const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
    if (end <= start) throw new Error("模型输出的 JSON 不完整");
    return JSON.parse(body.slice(start, end + 1));
  }
}

export function normalizeText(t: string): string {
  return t
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

/**
 * Conservative near-duplicate detection. Only compare reasonably long
 * comments; short authentic reactions (e.g. "啊？") are allowed.
 * Runs locally without calling AI or consuming API tokens.
 */
function tooSimilar(a:string,b:string):boolean {
  if(a===b)return true;
  if(a.length<9||b.length<9)return false;
  if(Math.min(a.length,b.length)/Math.max(a.length,b.length)<0.72)return false;
  if(a.includes(b)||b.includes(a))return true;
  const grams=(text:string)=>{
    const out=new Set<string>();
    for(let i=0;i<text.length-1;i++)out.add(text.slice(i,i+2));
    return out;
  };
  const x=grams(a),y=grams(b);
  let overlap=0;
  for(const item of x)if(y.has(item))overlap++;
  const similarity=overlap/(x.size+y.size-overlap);
  return similarity>=0.84;
}

function toSeconds(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim().replace(/s$/i, "");
    if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
    const parts = s.split(":").map(Number);
    if (parts.length >= 2 && parts.every((p) => Number.isFinite(p))) {
      return parts.reduce((a, p) => a * 60 + p, 0);
    }
  }
  return null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export type ValidateOptions = {
  start: number;
  end: number;
  maxCount: number;
  existing: Danmaku[];
  bannedWords: string[];
  maxLength?: number;
};

export type ValidateResult = {
  items: Danmaku[];
  rejected: { outOfRange: number; duplicate: number; invalid: number; banned: number; overflow: number };
};

/** Validate raw model output into danmaku inside [start, end], deduped and capped. */
export function validateDanmaku(raw: unknown, opts: ValidateOptions): ValidateResult {
  const maxLength = opts.maxLength ?? 80;
  const rejected = { outOfRange: 0, duplicate: 0, invalid: 0, banned: 0, overflow: 0 };
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const arr = obj["danmaku"] ?? obj["comments"] ?? obj["items"] ?? obj["data"];
    if (Array.isArray(arr)) list = arr;
  }
  const seen = new Set(opts.existing.slice(-250).map((d) => normalizeText(d.text)));
  const priorTexts = Array.from(seen);
  const banned = opts.bannedWords.map((w) => w.trim().toLowerCase()).filter(Boolean);
  const items: Danmaku[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") {
      rejected.invalid++;
      continue;
    }
    const e = entry as Record<string, unknown>;
    const time = toSeconds(e["time"]);
    const text = typeof e["text"] === "string" ? e["text"].replace(/\s+/g, " ").trim() : "";
    if (time === null || !text || text.length > maxLength) {
      rejected.invalid++;
      continue;
    }
    if (time < opts.start || time > opts.end) {
      rejected.outOfRange++;
      continue;
    }
    const lower = text.toLowerCase();
    if (banned.some((w) => lower.includes(w))) {
      rejected.banned++;
      continue;
    }
    const norm = normalizeText(text);
    if (!norm || seen.has(norm) || priorTexts.some(previous=>tooSimilar(previous,norm))) {
      rejected.duplicate++;
      continue;
    }
    if (items.length >= opts.maxCount) {
      rejected.overflow++;
      continue;
    }
    seen.add(norm);
    priorTexts.push(norm);
    const color = typeof e["color"] === "string" && HEX.test(e["color"].trim()) ? e["color"].trim().toUpperCase() : "#FFFFFF";
    const viewer = typeof e["viewer"] === "string" && e["viewer"].trim() ? e["viewer"].trim().slice(0, 24) : "路人";
    items.push({ id: uid("d"), time: Math.round(time * 100) / 100, text, viewer, color });
  }
  items.sort((a, b) => a.time - b.time);
  return { items, rejected };
}
