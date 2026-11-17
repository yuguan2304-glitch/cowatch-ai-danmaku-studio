import { useApp, useSecrets } from "../store";
import { getClock } from "../clock";
import { FrameExtractor, frameTimesFor, CorsTaintedError } from "../frames";
import { cuesInRange } from "../subtitles";
import { segmentCount } from "../danmaku-engine";
import { GEMINI_INLINE_VIDEO_MAX_BYTES } from "../constants";
import { checkBaseUrl } from "../video-url";
import { buildSegmentText, buildSystemPrompt, bannedWordList } from "./prompt";
import { extractJson, validateDanmaku } from "./validate";
import { openaiChat } from "./openai";
import { geminiGenerate, fileToBase64 } from "./gemini";
import { AiError, isAbort } from "./errors";
import { db } from "../db";
import type { Segment } from "../types";

let controller: AbortController | null = null;
let extractor: FrameExtractor | null = null;
let videoCache: { file: File; base64: string } | null = null;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

export function buildSegments(duration: number, segLen: number): Segment[] {
  const len = Math.max(5, segLen);
  const out: Segment[] = [];
  for (let i = 0, s = 0; s < duration - 0.25; i++, s += len) {
    out.push({ index: i, start: s, end: Math.min(duration, s + len), status: "pending", attempts: 0, count: 0 });
  }
  return out;
}

export type Material = { canFrames: boolean; useVideo: boolean; hasCues: boolean; problem: string | null; warning: string | null };

export function describeMaterial(): Material {
  const { source, settings, cues } = useApp.getState();
  const canFrames = source.analyzable && (source.kind === "file" || source.kind === "url");
  let useVideo = false;
  let warning: string | null = null;
  if (settings.provider.kind === "gemini" && settings.provider.geminiInput === "video") {
    if (source.kind === "file" && source.file && source.file.size <= GEMINI_INLINE_VIDEO_MAX_BYTES) useVideo = true;
    else warning = "Gemini 原生视频输入仅支持 ≤14MB 的本地文件，将改用抽帧。";
  }
  const hasCues = cues.length > 0;
  let problem: string | null = null;
  if (source.kind === "none") problem = "请先打开视频。";
  else if (!canFrames && !useVideo && !hasCues)
    problem =
      source.kind === "youtube" || source.kind === "bilibili"
        ? "嵌入式播放器无法读取视频画面或音频。请上传本地视频文件，或导入该视频的 SRT/VTT 字幕后再生成。"
        : "该视频无法被读取分析（跨域限制）。请上传本地文件或导入字幕。";
  return { canFrames, useVideo, hasCues, problem, warning };
}

function preflight(): string | null {
  const { settings, duration } = useApp.getState();
  const { apiKey } = useSecrets.getState();
  const base = checkBaseUrl(settings.provider.baseUrl);
  if (!base.ok) return base.reason;
  if (!settings.provider.model.trim()) return "请填写模型名称。";
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.url.hostname);
  if (!apiKey && !local) return "请先在「AI 接口」中填写你的 API 密钥（仅保存在本页内存）。";
  if (!duration) return "尚未读取到视频时长，请等待视频加载或先播放一下。";
  if (useApp.getState().source.kind === "bilibili") return "B站嵌入播放器无法提供播放进度，无法同步弹幕。请上传本地文件。";
  return describeMaterial().problem;
}

export function ensureSegments() {
  const st = useApp.getState();
  const len = Math.max(5, st.settings.analysis.segmentLength);
  const segs = st.segments;
  const stale =
    segs.length === 0 ||
    Math.abs(segs[segs.length - 1]!.end - st.duration) > 0.5 ||
    Math.abs(segs[0]!.end - segs[0]!.start - Math.min(len, st.duration)) > 0.01;
  if (stale) st.setSegments(buildSegments(st.duration, len));
}

function pickNext(): Segment | null {
  const { segments, settings } = useApp.getState();
  const open = segments.filter((s) => s.status === "pending" || s.status === "cancelled");
  if (!open.length) return null;
  if (settings.generation.bufferMode === "full") return open[0] ?? null;
  const t = getClock()?.getTime() ?? 0;
  const ahead = open.filter((s) => s.end > t && s.start <= t + settings.generation.lookahead);
  if (ahead.length) return ahead.reduce((a, b) => (a.start < b.start ? a : b));
  const anyAhead = open.some((s) => s.end > t);
  if (anyAhead) return null; // wait until playback approaches
  return open[0] ?? null; // only past segments remain — fill them in
}

async function runSegment(seg: Segment, signal: AbortSignal) {
  const st = useApp.getState();
  const { settings, source, cues, duration } = st;
  const { apiKey } = useSecrets.getState();
  const material = describeMaterial();
  const isLast = seg.end >= duration - 0.01;
  const realCount = st.danmaku.filter((d) => !d.demo && !(d.time >= seg.start && (isLast ? d.time <= seg.end : d.time < seg.end))).length;
  const remaining = settings.generation.totalLimit === null ? null : settings.generation.totalLimit - realCount;
  const count = segmentCount(settings.generation.density, seg.end - seg.start, remaining);
  if (count <= 0) {
    st.updateSegment(seg.index, { status: "skipped", error: "已达总量上限" });
    return;
  }

  // Material strictly up to this segment's end (no-spoiler friendly).
  const frameTimes = material.canFrames && !material.useVideo ? frameTimesFor(seg.start, seg.end, settings.analysis.frameInterval) : [];
  let images: { time: number; dataUrl: string }[] = [];
  if (frameTimes.length) {
    if (!extractor) extractor = new FrameExtractor(source.src, source.crossOrigin);
    try {
      images = await extractor.capture(frameTimes, settings.analysis.frameMaxWidth, settings.analysis.jpegQuality, signal);
    } catch (e) {
      if (e instanceof CorsTaintedError) {
        useApp.getState().patchSource({ analyzable: false, note: e.message });
        if (!cues.length) throw new AiError(e.message);
        useApp.getState().pushLog("warn", e.message + " 本段改为仅使用字幕。");
      } else throw e;
    }
  }
  let video: { mimeType: string; base64: string; start: number; end: number } | undefined;
  if (material.useVideo && source.file) {
    if (!videoCache || videoCache.file !== source.file) {
      videoCache = { file: source.file, base64: await fileToBase64(source.file) };
    }
    video = { mimeType: source.file.type || "video/mp4", base64: videoCache.base64, start: seg.start, end: seg.end };
  }

  const noSpoiler = settings.generation.noSpoiler;
  const segCues = noSpoiler ? cuesInRange(cues, Math.max(0, seg.start - 20), seg.end) : cuesInRange(cues, seg.start, seg.end);
  const globalContext = !noSpoiler && cues.length
    ? cues.map((c) => c.text).join(" / ").slice(0, 3000)
    : undefined;
  const memory = useApp
    .getState()
    .danmaku.filter((d) => !d.demo && d.time < seg.start)
    .slice(-settings.audience.memorySize);

  const system = buildSystemPrompt(settings.audience, noSpoiler, source.label, segCues);
  const userText = buildSegmentText({
    start: seg.start,
    end: seg.end,
    count,
    frameTimes: images.map((i) => i.time),
    cues: segCues,
    memory,
    globalContext,
    hasVideoClip: !!video,
    title: source.label,
  });

  const p = settings.provider;
  const result =
    p.kind === "gemini"
      ? await geminiGenerate({ baseUrl: p.baseUrl, apiKey, model: p.model, system, userText, images, video, signal })
      : await openaiChat({
          baseUrl: p.baseUrl,
          apiKey,
          model: p.model,
          system,
          userText,
          images,
          imageDetail: p.imageDetail,
          jsonMode: p.jsonMode,
          signal,
        });

  let parsed: unknown;
  try {
    parsed = extractJson(result.text);
  } catch (e) {
    throw new AiError(`无法解析模型输出为 JSON：${(e as Error).message}`, { retryable: true });
  }
  const current = useApp.getState();
  const existing = current.danmaku.filter((d) => !d.demo && !(d.time >= seg.start && (isLast ? d.time <= seg.end : d.time < seg.end)));
  const { items, rejected } = validateDanmaku(parsed, {
    start: seg.start,
    end: seg.end,
    maxCount: count,
    existing,
    bannedWords: bannedWordList(settings.audience),
  });
  if (items.length === 0) {
    throw new AiError(
      `模型返回 0 条有效弹幕（越界 ${rejected.outOfRange}，重复 ${rejected.duplicate}，格式错误 ${rejected.invalid}）`,
      { retryable: true },
    );
  }
  if (current.demo) current.setDanmaku([], false);
  useApp.getState().removeRange(seg.start, seg.end, isLast);
  useApp.getState().addDanmaku(items);
  const dropped = rejected.outOfRange + rejected.duplicate + rejected.invalid + rejected.banned;
  if (dropped > 0) {
    useApp
      .getState()
      .pushLog("info", `片段 ${seg.index + 1}：丢弃 ${dropped} 条（越界 ${rejected.outOfRange} / 重复 ${rejected.duplicate} / 格式 ${rejected.invalid} / 禁词 ${rejected.banned}）`);
  }
  useApp.getState().updateSegment(seg.index, {
    status: "done",
    count: items.length,
    error: undefined,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });
}

export async function saveHistory() {
  const st = useApp.getState();
  if (!st.danmaku.length) return;
  const now = Date.now();
  const prev = await db.getHistory(st.sessionId).catch(() => undefined);
  const { display: _display, ...rest } = st.settings;
  await db.putHistory({
    id: st.sessionId,
    title: st.source.label || "未命名视频",
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    sourceKind: st.source.kind,
    sourceLabel: st.source.label,
    sourceUrl: st.source.kind === "file" ? undefined : st.source.kind === "youtube" ? `https://www.youtube.com/watch?v=${st.source.youtubeId}` : st.source.src,
    duration: st.duration,
    demo: st.demo,
    model: st.demo ? undefined : st.settings.provider.model,
    danmaku: st.danmaku,
    settings: { ...rest, provider: { ...rest.provider, baseUrl: "", transcribeBaseUrl: "" } },
  });
}

export async function startGeneration(): Promise<void> {
  const st = useApp.getState();
  if (st.generating) return;
  const problem = preflight();
  if (problem) {
    st.pushLog("error", problem);
    throw new Error(problem);
  }
  const warn = describeMaterial().warning;
  if (warn) st.pushLog("warn", warn);
  ensureSegments();
  controller = new AbortController();
  const signal = controller.signal;
  st.setGenerating(true);
  st.pushLog("info", `开始生成（${st.settings.generation.bufferMode === "full" ? "预生成全部" : "边播边生成"}），素材将发送至 ${new URL(st.settings.provider.baseUrl).host}`);
  try {
    while (!signal.aborted) {
      const current = useApp.getState();
      const requestLimit = current.settings.generation.requestLimit;
      const attempted = current.segments.filter(x => x.attempts > 0).length;
      if (requestLimit != null && attempted >= requestLimit) {
        current.pushLog("info", "已达到 API 预算上限：" + requestLimit + " 个片段。剩余片段保留为待生成；提高上限后可点继续生成。");
        break;
      }
      const seg = pickNext();
      if (!seg) {
        const open = useApp.getState().segments.some((s) => s.status === "pending" || s.status === "cancelled");
        if (!open) break;
        await sleep(500, signal);
        continue;
      }
      const maxRetries = useApp.getState().settings.generation.maxRetries;
      let attempt = 0;
      useApp.getState().updateSegment(seg.index, { status: "running", error: undefined });
      while (true) {
        try {
          useApp.getState().updateSegment(seg.index, { attempts: attempt + 1 });
          await runSegment(seg, signal);
          break;
        } catch (e) {
          if (isAbort(e)) throw e;
          const err = e instanceof AiError ? e : new AiError((e as Error).message ?? String(e));
          if (err.retryable && attempt < maxRetries) {
            attempt++;
            const wait = 1500 * 2 ** (attempt - 1) + Math.random() * 500;
            useApp.getState().pushLog("warn", `片段 ${seg.index + 1} 失败，${Math.round(wait / 1000)} 秒后重试：${err.message}`);
            await sleep(wait, signal);
            continue;
          }
          useApp.getState().updateSegment(seg.index, { status: "error", error: err.message });
          useApp.getState().pushLog("error", `片段 ${seg.index + 1}：${err.message}`);
          // Terminal auth/permission errors stop the whole run.
          if (err.status === 401 || err.status === 403 || err.status === 404) {
            useApp.getState().pushLog("error", "已停止生成：请检查接口配置后再试。");
            controller.abort();
          }
          break;
        }
      }
    }
  } catch (e) {
    if (!isAbort(e)) useApp.getState().pushLog("error", (e as Error).message);
  } finally {
    const s = useApp.getState();
    s.segments.filter((x) => x.status === "running").forEach((x) => s.updateSegment(x.index, { status: "cancelled" }));
    s.setGenerating(false);
    controller = null;
    extractor?.dispose();
    extractor = null;
    s.pushLog("info", signal.aborted ? "生成已停止。" : "生成完成。");
    if (!s.demo && s.danmaku.length) await saveHistory().catch(() => undefined);
  }
}

export function cancelGeneration() {
  controller?.abort();
}

export function resetVideoCache() {
  videoCache = null;
}

export async function regenerateSegment(index: number) {
  const st = useApp.getState();
  const seg = st.segments.find((s) => s.index === index);
  if (!seg) return;
  st.updateSegment(index, { status: "pending", attempts: 0, error: undefined, count: 0 });
  if (!st.generating) await startGeneration().catch(() => undefined);
}

export async function restartAll() {
  const st = useApp.getState();
  if (st.generating) return;
  st.setDanmaku([], false);
  st.setSegments([]);
  st.newSession();
  await startGeneration();
}
