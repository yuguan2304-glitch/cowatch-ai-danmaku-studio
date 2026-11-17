/// <reference lib="webworker" />
/** Whisper runs entirely in this dedicated browser worker, not via a paid API. */
import { pipeline, env } from "@huggingface/transformers";

env.allowRemoteModels = true;
env.useBrowserCache = true;

type Recognizer = (audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>;
let recognizer: Recognizer | null = null;
const createPipeline = pipeline as unknown as (task: string, model: string, options: Record<string, unknown>) => Promise<Recognizer>;

type WorkerRequest =
  | { kind: "load" }
  | { kind: "recognize"; id: number; data: Float32Array; offset: number };

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;
  try {
    if (!recognizer) {
      self.postMessage({kind: "progress", text: "首次使用：正在下载并缓存本地英语语音模型（可能消耗较多流量）…"});
      recognizer = await createPipeline("automatic-speech-recognition", "onnx-community/whisper-tiny.en", {
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
    const result = await recognizer(data.data, { return_timestamps: true, task: "transcribe" });
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
    self.postMessage({kind: "result", id: data.id, cues});
  } catch (error) {
    self.postMessage({kind: "error", id: data.kind === "recognize" ? data.id : -1, message: error instanceof Error ? error.message : String(error)});
  }
};
