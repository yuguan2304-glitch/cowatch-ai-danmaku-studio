import type { Danmaku } from "./types";
import { uid } from "./id";

export type DanmakuExport = {
  app: "CoWatch";
  version: 1;
  title: string;
  exportedAt: string;
  demo: boolean;
  danmaku: Danmaku[];
};

export function toJsonExport(title: string, danmaku: Danmaku[], demo: boolean): string {
  const payload: DanmakuExport = {
    app: "CoWatch",
    version: 1,
    title,
    exportedAt: new Date().toISOString(),
    demo,
    danmaku: danmaku.map(({ id, time, text, viewer, color }) => ({ id, time, text, viewer, color })),
  };
  return JSON.stringify(payload, null, 2);
}

export function fromJsonImport(raw: string): { danmaku: Danmaku[]; demo: boolean; title?: string | undefined } {
  const data = JSON.parse(raw) as unknown;
  const arr = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { danmaku?: unknown }).danmaku)
      ? (data as { danmaku: unknown[] }).danmaku
      : null;
  if (!arr) throw new Error("JSON 中没有找到 danmaku 数组");
  const out: Danmaku[] = [];
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    const time = Number(r["time"]);
    const text = typeof r["text"] === "string" ? r["text"].trim() : "";
    if (!Number.isFinite(time) || time < 0 || !text) continue;
    out.push({
      id: uid("d"),
      time,
      text,
      viewer: typeof r["viewer"] === "string" ? r["viewer"] : "导入",
      color: typeof r["color"] === "string" && /^#[0-9a-fA-F]{6}$/.test(r["color"]) ? r["color"] : "#FFFFFF",
    });
  }
  const obj = !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  return {
    danmaku: out.sort((a, b) => a.time - b.time),
    demo: obj["demo"] === true,
    title: typeof obj["title"] === "string" ? obj["title"] : undefined,
  };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hexToDec(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(n) ? n : 16777215;
}

function decToHex(n: number): string {
  return "#" + (n & 0xffffff).toString(16).padStart(6, "0").toUpperCase();
}

/** Bilibili-compatible XML: p="time,mode,size,color,timestamp,pool,userHash,rowId". */
export function toBiliXml(danmaku: Danmaku[]): string {
  const now = Math.floor(Date.now() / 1000);
  const rows = [...danmaku]
    .sort((a, b) => a.time - b.time)
    .map((d, i) => {
      const userHash = Math.abs(hashString(d.viewer)).toString(16).slice(0, 8);
      return `  <d p="${d.time.toFixed(5)},1,25,${hexToDec(d.color)},${now},0,${userHash},${i + 1}">${escapeXml(d.text)}</d>`;
    });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<i>",
    "  <chatserver>chat.bilibili.com</chatserver>",
    "  <chatid>0</chatid>",
    "  <mission>0</mission>",
    `  <maxlimit>${Math.max(danmaku.length, 1000)}</maxlimit>`,
    "  <state>0</state>",
    "  <real_name>0</real_name>",
    "  <source>CoWatch</source>",
    ...rows,
    "</i>",
  ].join("\n");
}

export function fromBiliXml(raw: string): Danmaku[] {
  const doc = new DOMParser().parseFromString(raw, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("XML 解析失败");
  const out: Danmaku[] = [];
  doc.querySelectorAll("d").forEach((node) => {
    const p = (node.getAttribute("p") ?? "").split(",");
    const time = Number(p[0]);
    const color = decToHex(Number(p[3] ?? 16777215));
    const text = (node.textContent ?? "").trim();
    if (!Number.isFinite(time) || !text) return;
    out.push({ id: uid("d"), time, text, color, viewer: p[6] ? `用户${p[6]}` : "导入" });
  });
  return out.sort((a, b) => a.time - b.time);
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

export function downloadText(filename: string, content: string, mime: string) {
  // Android's DownloadManager cannot retrieve blob: URLs. The signed app
  // exposes a narrow origin-scoped message channel to save local exports.
  // Browser users continue to use the normal blob download path.
  const nativeExport = (window as Window & { CoWatchExport?: { postMessage: (data: string) => void } }).CoWatchExport;
  const allowed = ["cowatch.json","cowatch.xml","cowatch-worldbook.txt","cowatch-imported-worldbook.json","cowatch-sync.json"].includes(filename)
    || (/^[^/\\\\:*?"<>|\\r\\n]{1,100}-共映术语\\.json$/u.test(filename) && mime === "application/json");
  if (nativeExport && allowed) {
    nativeExport.postMessage(JSON.stringify({ filename, mime, content }));
    return;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
