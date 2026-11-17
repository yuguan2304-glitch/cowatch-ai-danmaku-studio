export class AiError extends Error {
  status: number | undefined;
  retryable: boolean;
  constructor(message: string, opts: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = "AiError";
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
  }
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

/** Turn a failed fetch/response into a user-readable error. Never includes the key. */
export async function toAiError(res: Response, provider: string): Promise<AiError> {
  let detail = "";
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      detail = j?.error?.message ?? j?.message ?? text;
    } catch {
      detail = text;
    }
  } catch {
    /* ignore */
  }
  detail = String(detail).slice(0, 400);
  const s = res.status;
  const hint =
    s === 401
      ? "密钥无效或未授权。"
      : s === 403
        ? "无权限访问该模型或地区受限。"
        : s === 404
          ? "接口或模型不存在，请检查 Base URL 与模型名。"
          : s === 429
            ? "请求过快或额度不足。"
            : s === 400
              ? "请求参数被拒绝（模型可能不支持图片/JSON 模式）。"
              : s >= 500
                ? "供应商服务暂时异常。"
                : "";
  return new AiError(`${provider} 返回 ${s}：${hint}${detail ? ` ${detail}` : ""}`, {
    status: s,
    retryable: s === 429 || s >= 500,
  });
}

export function networkError(e: unknown): AiError {
  if (isAbort(e)) throw e;
  return new AiError(
    "网络请求失败：可能是浏览器跨域 (CORS) 限制、Base URL 错误或网络不可达。部分供应商不允许浏览器直接调用，请换用支持 CORS 的服务或本地兼容网关。",
    { retryable: true },
  );
}
