import { IDENTITIES, LANGUAGES, TONES, defaultAudience } from "./constants";
import type { AudienceConfig, CustomViewer, ShipRule } from "./types";

export const PRESET_FORMAT = "cowatch-viewer-preset";
export const SHARE_HASH_KEY = "preset";
const MAX_LINK_CHARS = 8000;

export type SharedPreset = { format: typeof PRESET_FORMAT; version: 1; name: string; audience: AudienceConfig };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

function weights(v: unknown, ids: readonly { id: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== "object") return out;
  for (const { id } of ids) {
    const w = (v as Record<string, unknown>)[id];
    if (w !== undefined) {
      const n = num(w, 0, 100, 0);
      if (n > 0) out[id] = n;
    }
  }
  return out;
}

/**
 * Keep only non-sensitive viewer settings. Never includes API keys, provider
 * addresses, videos, history, comments or the private world book.
 */
export function sanitizeAudience(input: unknown): AudienceConfig {
  const d = defaultAudience();
  const a = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const langIds = new Set<string>(LANGUAGES.map((l) => l.id));
  const languages = Array.isArray(a["languages"]) ? a["languages"].filter((x): x is string => typeof x === "string" && langIds.has(x)) : [];
  const viewers: CustomViewer[] = Array.isArray(a["customViewers"])
    ? a["customViewers"].slice(0, 20).flatMap((raw, i) => {
        if (!raw || typeof raw !== "object") return [];
        const v = raw as Record<string, unknown>;
        const name = str(v["name"], 24).trim();
        if (!name) return [];
        return [{
          id: str(v["id"], 40) || `v${i}`,
          name,
          personality: str(v["personality"], 200),
          focus: str(v["focus"], 200),
          background: str(v["background"], 300),
          bannedWords: str(v["bannedWords"], 300),
          extraPrompt: str(v["extraPrompt"], 300),
          weight: num(v["weight"], 0, 100, 50),
        }];
      })
    : [];
  const shipRules: ShipRule[] = Array.isArray(a["shipRules"])
    ? a["shipRules"].slice(0, 40).flatMap((raw, i) => {
        if (!raw || typeof raw !== "object") return [];
        const r = raw as Record<string, unknown>;
        const left = str(r["left"], 70).trim();
        const right = str(r["right"], 70).trim();
        if (!left || !right) return [];
        return [{ id: str(r["id"], 40) || `r${i}`, left, right, mode: r["mode"] === "fixed" ? "fixed" as const : "reversible" as const }];
      })
    : [];
  return {
    ...d,
    languages: languages.length ? languages : d.languages,
    identities: weights(a["identities"], IDENTITIES),
    tones: weights(a["tones"], TONES),
    customViewers: viewers,
    interaction: a["interaction"] !== false,
    memorySize: num(a["memorySize"], 0, 50, d.memorySize),
    globalBannedWords: str(a["globalBannedWords"], 1000),
    extraPrompt: str(a["extraPrompt"], 2000),
    customTones: str(a["customTones"], 3000),
    sceneHint: str(a["sceneHint"], 400),
    shipRules,
    shipPairs: "",
    blockedPairs: str(a["blockedPairs"], 1000),
    worldBook: "",
    worldBookEntries: [],
  };
}

/** Detects strings that look like API keys / tokens so they are never shared. */
export function containsSecretLike(value: unknown): boolean {
  const text = JSON.stringify(value);
  return /(sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z_-]{20,}|sb_secret_[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|gsk_[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{16,})/.test(text);
}

export function buildSharedPreset(name: string, audience: AudienceConfig): SharedPreset {
  const preset: SharedPreset = { format: PRESET_FORMAT, version: 1, name: name.trim().slice(0, 40) || "我的观众组", audience: sanitizeAudience(audience) };
  if (containsSecretLike(preset)) throw new Error("预设里似乎包含 API 密钥或令牌，已阻止分享。请先从文本中删除。");
  return preset;
}

export function parseSharedPreset(raw: string): SharedPreset {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("不是有效的预设文件");
  }
  const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (obj["format"] !== PRESET_FORMAT) throw new Error("不是共映观众预设");
  return { format: PRESET_FORMAT, version: 1, name: str(obj["name"], 40) || "导入的观众组", audience: sanitizeAudience(obj["audience"]) };
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Share link puts the preset in the #fragment, which browsers never send to any server. */
export function presetShareLink(origin: string, preset: SharedPreset): string {
  const link = `${origin}/#${SHARE_HASH_KEY}=${toBase64Url(JSON.stringify(preset))}`;
  if (link.length > MAX_LINK_CHARS) throw new Error("预设内容太长，无法放进链接，请改用「导出文件」分享。");
  return link;
}

export function presetFromHash(hash: string): SharedPreset | null {
  const m = hash.match(new RegExp(`[#&]${SHARE_HASH_KEY}=([A-Za-z0-9_-]+)`));
  if (!m) return null;
  return parseSharedPreset(fromBase64Url(m[1]!));
}
