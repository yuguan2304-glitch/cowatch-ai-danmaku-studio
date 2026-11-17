import { AiError, networkError, toAiError } from "./errors";

export type ChatResult = { text: string; inputTokens?: number; outputTokens?: number };

function join(base: string, path: string) {
  return base.replace(/\/+$/, "") + path;
}

export async function openaiChat(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  userText: string;
  images: { dataUrl: string }[];
  imageDetail: "low" | "auto" | "high";
  jsonMode: boolean;
  signal?: AbortSignal;
}): Promise<ChatResult> {
  const content: unknown[] = [{ type: "text", text: opts.userText }];
  for (const img of opts.images) {
    content.push({ type: "image_url", image_url: { url: img.dataUrl, detail: opts.imageDetail } });
  }
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.images.length ? content : opts.userText },
    ],
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };
  let res: Response;
  try {
    res = await fetch(join(opts.baseUrl, "/chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: opts.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch (e) {
    throw networkError(e);
  }
  if (!res.ok) throw await toAiError(res, "OpenAI 兼容接口");
  const json = await res.json();
  const msg = json?.choices?.[0]?.message;
  const text: string = typeof msg?.content === "string" ? msg.content : Array.isArray(msg?.content) ? msg.content.map((p: { text?: string }) => p.text ?? "").join("") : "";
  if (!text) {
    if (msg?.refusal) throw new AiError(`模型拒绝了该请求：${String(msg.refusal).slice(0, 200)}`);
    throw new AiError("模型返回了空内容");
  }
  return {
    text,
    inputTokens: json?.usage?.prompt_tokens,
    outputTokens: json?.usage?.completion_tokens,
  };
}

export async function openaiTest(baseUrl: string, apiKey: string, model: string, signal?: AbortSignal) {
  const started = performance.now();
  const r = await openaiChat({
    baseUrl,
    apiKey,
    model,
    system: "You are a connection test. Reply with JSON.",
    userText: 'Reply exactly with JSON {"ok":true}',
    images: [],
    imageDetail: "low",
    jsonMode: false,
    signal,
  });
  return { ms: Math.round(performance.now() - started), sample: r.text.slice(0, 80) };
}

/** Optional transcription via an OpenAI-compatible /audio/transcriptions endpoint. */
export async function transcribe(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  file: File;
  signal?: AbortSignal;
}): Promise<{ cues: { start: number; end: number; text: string }[]; timestamped: boolean }> {
  const attempt = async (format: "verbose_json" | "json") => {
    const fd = new FormData();
    fd.append("file", opts.file, opts.file.name);
    fd.append("model", opts.model);
    fd.append("response_format", format);
    if (format === "verbose_json") fd.append("timestamp_granularities[]", "segment");
    try {
      return await fetch(join(opts.baseUrl, "/audio/transcriptions"), {
        method: "POST",
        headers: opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {},
        body: fd,
        signal: opts.signal,
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
    } catch (e) {
      throw networkError(e);
    }
  };
  let res = await attempt("verbose_json");
  if (res.status === 400) res = await attempt("json");
  if (!res.ok) throw await toAiError(res, "转录接口");
  const json = await res.json();
  if (Array.isArray(json?.segments) && json.segments.length) {
    return {
      timestamped: true,
      cues: json.segments
        .map((s: { start: number; end: number; text: string }) => ({
          start: Number(s.start),
          end: Number(s.end),
          text: String(s.text ?? "").trim(),
        }))
        .filter((c: { text: string; start: number }) => c.text && Number.isFinite(c.start)),
    };
  }
  const text = String(json?.text ?? "").trim();
  if (!text) throw new AiError("转录结果为空");
  return { timestamped: false, cues: [{ start: 0, end: 0, text }] };
}
