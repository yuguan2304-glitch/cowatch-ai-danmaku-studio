import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkBaseUrl } from "@/lib/video-url";
import { networkError, toAiError } from "@/lib/ai/errors";

type ModelInfo = { id: string; name?: string };
type Props = {
  kind: "openai" | "gemini";
  baseUrl: string;
  apiKey: string;
  model: string;
  onModelChange: (value: string) => void;
};

function modelsEndpoint(input: string, kind: Props["kind"]) {
  const base = input.trim().replace(/\/+$/, "");
  // OpenAI-compatible services typically expose GET /v1/models.
  // Native Gemini uses GET /v1beta/models, not the OpenAI schema.
  if (kind === "gemini") {
    return base.replace(/\/(v1beta|v1)$/, "") + "/v1beta/models";
  }
  return base + "/models";
}

export function ModelPicker({ kind, baseUrl, apiKey, model, onModelChange }: Props) {
  const [items, setItems] = useState<ModelInfo[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loadedFrom, setLoadedFrom] = useState("");

  const requestModels = async () => {
    const validated = checkBaseUrl(baseUrl);
    if (!validated.ok) {
      setMessage(validated.reason);
      toast.error(validated.reason);
      return;
    }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(validated.url.hostname);
    if (!apiKey && !local) {
      setMessage("请先填写当前服务商的 API 密钥");
      return;
    }
    const endpoint = modelsEndpoint(baseUrl, kind);
    const url = new URL(endpoint);
    if (!window.confirm("从 " + url.host + " 获取模型列表？请求将携带你填写的 API 密钥，仅发送至该服务商。")) return;
    setBusy(true);
    setMessage("");
    setItems([]);
    setLoadedFrom("");
    try {
      // Never fall back to an unknown third-party proxy or share keys with our host.
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: apiKey ? { Authorization: "Bearer " + apiKey } : {},
        credentials: "omit",
        referrerPolicy: "no-referrer",
      }).catch((error: unknown) => { throw networkError(error); });
      if (!response.ok) throw await toAiError(response, "获取模型列表");
      const data: unknown = await response.json();
      const obj = data as { data?: unknown; models?: unknown; nextPageToken?: unknown };
      const raw = kind === "gemini" ? obj?.models : obj?.data;
      if (!Array.isArray(raw)) throw new Error("接口未返回标准模型列表；此中转站可能不支持 /models，请手动输入模型 ID");
      const list = raw.flatMap((m: unknown) => {
        if (!m || typeof m !== "object") return [];
        const entry = m as { id?: unknown; name?: unknown; displayName?: unknown };
        const id = kind === "gemini" ? String(entry.name ?? "").replace(/^models\//, "") : entry.id;
        if (typeof id !== "string" || !id.trim()) return [];
        const name = typeof entry.displayName === "string" ? entry.displayName : undefined;
        return [{ id, ...(name ? { name } : {}) }];
      });
      const unique = [...new Map(list.map((m: ModelInfo) => [m.id, m])).values()].sort((a, b) => a.id.localeCompare(b.id));
      setItems(unique);
      setLoadedFrom(kind + "|" + baseUrl + "|" + apiKey);
      const info = "已获取 " + unique.length + " 个模型" + (obj.nextPageToken ? "（仅显示第一页）" : "");
      setMessage(unique.length ? info : "服务商返回空列表，可继续手动输入模型 ID");
      if (unique.length) toast.success(info);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "读取失败";
      setMessage(msg + "。如果中转站不允许浏览器跨域请求，网站不能绕过限制；仍可手动输入模型 ID。");
    } finally {
      setBusy(false);
    }
  };
  const validList = loadedFrom === kind + "|" + baseUrl + "|" + apiKey;
  const filtered = (validList ? items : []).filter(x => !filter.trim() || (x.id + " " + (x.name ?? "")).toLowerCase().includes(filter.trim().toLowerCase())).slice(0, 300);
  return <div className="space-y-2">
    <label className="block text-sm">模型 ID（也可手动输入）
      <Input value={model} onChange={e => onModelChange(e.target.value)} autoComplete="off" placeholder="例如：gpt-4o-mini"/>
    </label>
    <Button size="sm" variant="outline" disabled={busy} onClick={() => void requestModels()}>
      {busy ? "正在获取…" : "获取模型列表"}
    </Button>
    {validList && items.length > 0 && <>
      <Input aria-label="搜索模型" placeholder="筛选模型…" value={filter} onChange={e => setFilter(e.target.value)}/>
      <select aria-label="选择模型" className="w-full rounded border bg-background p-2 text-sm" value="" onChange={e => { if (e.target.value) onModelChange(e.target.value); }}>
        <option value="">从 {filtered.length} 个结果中选择模型</option>
        {filtered.map(m => <option key={m.id} value={m.id}>{m.name && m.name !== m.id ? m.name + " · " : ""}{m.id}</option>)}
      </select>
    </>}
    {message && <p role="status" className="break-words text-xs text-muted-foreground">{message}</p>}
    <p className="text-xs text-muted-foreground">部分中转站不提供模型列表，或拒绝浏览器跨域访问。列表失败不代表模型不可用；可保留手填 ID。视觉分析请选支持图片输入的模型。</p>
  </div>;
}
