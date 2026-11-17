import { GEMINI_RESPONSE_SCHEMA } from "./prompt";
import { AiError, networkError, toAiError } from "./errors";
import type { ChatResult } from "./openai";

function endpoint(base: string, model: string) {
  const m = model.replace(/^models\//, "");
  return `${base.replace(/\/+$/, "")}/v1beta/models/${encodeURIComponent(m)}:generateContent`;
}

type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string }; videoMetadata?: { startOffset: string; endOffset: string } };

export async function geminiGenerate(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  userText: string;
  images: { dataUrl: string }[];
  video?: { mimeType: string; base64: string; start: number; end: number };
  signal?: AbortSignal;
}): Promise<ChatResult> {
  const parts: Part[] = [];
  if (opts.video) {
    parts.push({
      inlineData: { mimeType: opts.video.mimeType, data: opts.video.base64 },
      videoMetadata: {
        startOffset: `${Math.floor(opts.video.start)}s`,
        endOffset: `${Math.ceil(opts.video.end)}s`,
      },
    });
  }
  for (const img of opts.images) {
    const [, data] = img.dataUrl.split(",");
    parts.push({ inlineData: { mimeType: "image/jpeg", data } });
  }
  parts.push({ text: opts.userText });
  let res: Response;
  try {
    res = await fetch(endpoint(opts.baseUrl, opts.model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json", responseSchema: GEMINI_RESPONSE_SCHEMA },
      }),
      signal: opts.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch (e) {
    throw networkError(e);
  }
  if (!res.ok) throw await toAiError(res, "Gemini");
  const json = await res.json();
  const cand = json?.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) {
    const reason = json?.promptFeedback?.blockReason ?? cand?.finishReason;
    throw new AiError(`Gemini 未返回内容${reason ? `（${reason}）` : ""}`);
  }
  return {
    text,
    inputTokens: json?.usageMetadata?.promptTokenCount,
    outputTokens: json?.usageMetadata?.candidatesTokenCount,
  };
}

export async function geminiTest(baseUrl: string, apiKey: string, model: string, signal?: AbortSignal) {
  const started = performance.now();
  const r = await geminiGenerate({
    baseUrl,
    apiKey,
    model,
    system: "Connection test.",
    userText: "Return {\"danmaku\":[]} as JSON.",
    images: [],
    signal,
  });
  return { ms: Math.round(performance.now() - started), sample: r.text.slice(0, 80) };
}

export async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
