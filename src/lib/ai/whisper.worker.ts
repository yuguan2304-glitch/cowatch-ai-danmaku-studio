/// <reference lib="webworker" />
/** Whisper runs entirely in this dedicated browser worker, not via a paid API. */
import { pipeline, env } from "@huggingface/transformers";

env.allowRemoteModels = true;
env.useBrowserCache = true;
// Show the failing resource's host instead of the opaque "Failed to fetch".
// Do not alter headers, credentials or network destinations.
let failedResource = "";
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  let label = "未知资源";
  try {
    const uri = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const parsed = new URL(uri, self.location.href);
    label = parsed.hostname + parsed.pathname.slice(-90);
  } catch { /* ignore */ }
  try {
    const response = await originalFetch(input, init);
    if (!response.ok) failedResource = label + " (HTTP " + response.status + ")";
    return response;
  } catch (error) {
    failedResource = label;
    throw error;
  }
}) as typeof fetch;

type Recognizer = (audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>;
let recognizer: Recognizer | null = null;
const createPipeline = pipeline as unknown as (task: string, model: string, options: Record<string, unknown>) => Promise<Recognizer>;

type WorkerRequest =
  | { kind: "load"; modelHost?: string }
  | { kind: "recognize"; id: number; data: Float32Array; offset: number };

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;
  try {
    if (!recognizer) {
      if (data.kind === "load" && data.modelHost) {
        // Use an explicitly selected HTTPS model source; no silent fallback.
        const parsed = new URL(data.modelHost);
        if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
          throw new Error("模型下载地址必须是有效的 HTTPS 域名");
        }
        env.remoteHost = parsed.origin + (parsed.pathname === "/api/model/v1/" ? parsed.pathname : "/");
        // Transformers.js appends the resource filename itself; do NOT include {file} here.\n        env.remotePathTemplate = "{model}/resolve/{revision}/";
      }
      self.postMessage({kind: "progress", text: "首次使用：正在下载并缓存本地多语言语音模型（可能消耗较多流量）…"});
      recognizer = await createPipeline("automatic-speech-recognition", "onnx-community/whisper-tiny", {
        device: "wasm",
        dtype: "q8",
        progress_callback: (item: {status?: string; progress?: number}) => {
          if (item.status === "progress" && typeof item.progress === "number") {
            self.postMessage({kind: "progress", text: "正在准备离线模型：" + Math.round(item.progress) + "%"});
          }
        },
      });
      self.postMessage({kind: "ready"});
    }
    if (data.kind === "load") return;
    // Prevent common Whisper hallucinations on noisy game audio or silence.
    // Local chunks are independent; disable inherited prompt context.
    const result = await recognizer(data.data, {
      return_timestamps: true,
      task: "transcribe",
      condition_on_prev_tokens: false,
      no_speech_threshold: 0.55,
      compression_ratio_threshold: 2.1,
      logprob_threshold: -1.0,
    });
    const raw = result as {text?: string; chunks?: {text: string; timestamp: [number, number | null]}[]};
    const cues = Array.isArray(raw.chunks)
      ? raw.chunks.filter(c => c.text?.trim()).map(c => ({
          start: data.offset + Math.max(0, c.timestamp?.[0] ?? 0),
          end: data.offset + Math.max((c.timestamp?.[0] ?? 0) + 0.1, c.timestamp?.[1] ?? data.data.length / 16000),
          text: c.text.trim(),
        }))
      : raw.text?.trim()
        ? [{ start: data.offset, end: data.offset + data.data.length / 16000, text: raw.text.trim() }]
        : [];
    // Do not convert a repeatedly hallucinated sentence into dozens of subtitles.
    const normalized = (text: string) => text.toLowerCase().replace(/[\\p{P}\\p{S}\\s]/gu, "");
    const counts = new Map<string,number>();
    for (const cue of cues) {
      const key=normalized(cue.text);
      if (key.length>=12) counts.set(key,(counts.get(key)??0)+1);
    }
    const mostRepeated=Math.max(0,...counts.values());
    if (cues.length>=5 && mostRepeated>=4 && mostRepeated/cues.length>=0.65) {
      self.postMessage({kind:"error",id:data.id,message:"本地 Whisper 连续生成同一句话，疑似语音幻觉。当前片段已拒绝保存，建议换 Groq 对照或尝试更大模型。"});
      return;
    }
    self.postMessage({kind: "result", id: data.id, cues});
  } catch (error) {
    self.postMessage({kind: "error", id: data.kind === "recognize" ? data.id : -1, message: (() => {
      const msg = error instanceof Error ? error.message : String(error);
      return /Failed to fetch|NetworkError|fetch failed/i.test(msg)
        ? "模型资源下载失败：" + (failedResource || "未知资源") +
          "。可能是模型网站/CDN 无法访问、跨域限制或网络中断。未调用付费转录 API。"
        : msg;
    })()});
  }
};
