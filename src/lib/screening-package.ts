import type { SavedScreening } from "./types";

const MAGIC = "COWATCHPACK1\n";
const encoder = new TextEncoder();

/** One downloadable package: small JSON metadata header + original video bytes.
 * No compression or base64 copying of the video is required.
 * Never include API credentials or provider settings.
 */
export function exportScreeningPackage(screening: SavedScreening): void {
  if (screening.sourceKind !== "file" || !screening.file) {
    throw new Error("只有收藏的本地视频能导出完整离线放映包；外链视频没有本地副本。");
  }
  const { file, ...metadata } = screening;
  const header = encoder.encode(JSON.stringify({
    format: "cowatch-screening", version: 1,
    screening: metadata,
    video: { name: file.name, type: file.type, lastModified: file.lastModified, size: file.size },
  }));
  const prefix = encoder.encode(MAGIC + String(header.byteLength) + "\n");
  const blob = new Blob([prefix, header, file], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = (screening.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 80) || "共映放映") + ".cowatch";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function importScreeningPackage(file: File): Promise<SavedScreening> {
  const initial = await file.slice(0, 1024).text();
  if (!initial.startsWith(MAGIC)) throw new Error("不是有效的共映放映包");
  const newline = initial.indexOf("\n", MAGIC.length);
  if (newline < 0) throw new Error("放映包头部损坏");
  const headerSize = Number(initial.slice(MAGIC.length, newline));
  if (!Number.isSafeInteger(headerSize) || headerSize < 1 || headerSize > 4 * 1024 * 1024) {
    throw new Error("放映包元数据大小异常");
  }
  const offset = newline + 1 + headerSize;
  if (offset > file.size) throw new Error("放映包不完整");
  const header = JSON.parse(await file.slice(newline + 1, offset).text()) as {
    format?: string; version?: number;
    screening?: Partial<SavedScreening>;
    video?: { name?: string; type?: string; lastModified?: number; size?: number };
  };
  if (header.format !== "cowatch-screening" || header.version !== 1 ||
      !header.screening || header.screening.sourceKind !== "file" ||
      !header.video || !Number.isSafeInteger(header.video.size) ||
      header.video.size !== file.size - offset) {
    throw new Error("放映包格式或视频大小验证失败");
  }
  const meta = header.screening;
  if (!Array.isArray(meta.danmaku) || !Array.isArray(meta.cues) ||
      !Array.isArray(meta.comments) || typeof meta.title !== "string") {
    throw new Error("放映包内容缺失");
  }
  const video = new File([file.slice(offset)], String(header.video.name || "video.mp4"), {
    type: String(header.video.type || "video/mp4"),
    lastModified: Number(header.video.lastModified) || Date.now(),
  });
  return {
    ...meta,
    id: crypto.randomUUID(),
    title: meta.title.slice(0, 100),
    sourceKind: "file",
    sourceLabel: video.name,
    file: video,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    duration: Number.isFinite(meta.duration) ? Number(meta.duration) : 0,
    danmaku: meta.danmaku,
    cues: meta.cues,
    comments: meta.comments,
    demo: Boolean(meta.demo),
    cueLabel: String(meta.cueLabel || ""),
  } as SavedScreening;
}
