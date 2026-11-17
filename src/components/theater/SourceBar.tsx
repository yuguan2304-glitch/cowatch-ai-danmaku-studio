import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileVideo, Link2, Captions, Mic, X, Loader2, Languages, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/form-bits";
import { useApp, useSecrets } from "@/lib/store";
import { openLocalFile, openUrl, importSubtitleFile } from "./source-actions";
import { transcribe } from "@/lib/ai/openai";
import { checkBaseUrl } from "@/lib/video-url";
import { TRANSCRIBE_MAX_BYTES } from "@/lib/constants";
import { isAbort } from "@/lib/ai/errors";

export function SourceBar() {
  const source = useApp((s) => s.source);
  const cues = useApp((s) => s.cues);
  const cueLabel = useApp((s) => s.cueLabel);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const subRef = useRef<HTMLInputElement>(null);

  const runTranscribe = async () => {
    const st = useApp.getState();
    const p = st.settings.provider;
    const file = st.source.file;
    if (!file) return;
    if (file.size > TRANSCRIBE_MAX_BYTES) {
      toast.error("文件超过 25MB，多数转录接口会拒绝。请先导入字幕或截取较短片段。");
      return;
    }
    const base = checkBaseUrl(p.transcribeBaseUrl);
    if (!base.ok) { toast.error(`转录接口：${base.reason}`); return; }
    const secrets = useSecrets.getState();
    const key = p.transcribeUseMainKey ? secrets.apiKey : secrets.transcribeKey;
    if (!key) { toast.error("请先在「AI 接口 → 可选：音轨转录」填写密钥"); return; }
    if (!window.confirm(`将把整个视频文件「${file.name}」发送到 ${base.url.host} 进行转录，确定吗？`)) return;
    abortRef.current = new AbortController();
    setBusy(true);
    try {
      const r = await transcribe({ baseUrl: p.transcribeBaseUrl, apiKey: key, model: p.transcribeModel, file, signal: abortRef.current.signal });
      if (!r.timestamped) {
        toast.warning("该转录模型未返回时间戳，无法按片段对齐，未导入。请改用支持 verbose_json 的模型（如 whisper-1）。");
        return;
      }
      st.setCues(r.cues, `AI 转录（${p.transcribeModel}）`);
      toast.success(`转录完成：${r.cues.length} 段`);
    } catch (e) {
      if (!isAbort(e)) toast.error((e as Error).message);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="panel space-y-3 p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="marquee" onClick={() => fileRef.current?.click()} className="shrink-0">
          <FileVideo /> 本地视频
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              const err = openLocalFile(f);
              if (err) toast.error(err);
            }
            e.target.value = "";
          }}
        />
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const err = openUrl(url);
            if (err) toast.error(err);
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Link2 className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="MP4/WebM 直链、YouTube 或 B站链接"
              className="pl-8"
              inputMode="url"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={!url.trim()}>
            打开
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Button size="sm" variant="outline" onClick={() => subRef.current?.click()}>
          <Captions /> 导入字幕 SRT/VTT
        </Button>
        <a href="#video-translation" onClick={() => { const panel=document.getElementById("video-translation"); if (panel instanceof HTMLDetailsElement) panel.open=true; }} className="inline-flex items-center gap-1.5 rounded-md border border-primary/45 bg-primary/10 px-3 py-2 text-primary hover:bg-primary/20 text-sm font-semibold"><Languages className="size-4" /> 视频 AI 翻译</a>
        <input
          ref={subRef}
          type="file"
          accept=".srt,.vtt,text/vtt"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              toast.success(await importSubtitleFile(f));
            } catch (err) {
              toast.error((err as Error).message);
            }
          }}
        />
        {source.kind === "url" && <a href={source.src} download target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm" title="尝试由浏览器保存视频文件；跨域服务器可能忽略 download 属性而改为打开链接"><Download className="size-4"/> 下载直链视频</a>}
        {(source.kind === "youtube" || source.kind === "bilibili") && <a href={source.kind==="youtube" ? "https://www.youtube.com/watch?v="+source.youtubeId : source.label} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm" title="前往官方视频页面，使用平台提供的合法离线/下载方式"><ExternalLink className="size-4"/> 前往平台保存</a>}
        {(source.kind === "youtube" || source.kind === "bilibili") && <span className="text-xs text-muted-foreground">平台嵌入视频无法直接下载成 MP4；请使用平台允许的离线方式，或选择自己拥有的本地视频。</span>}
        {source.kind === "url" && <span className="text-xs text-muted-foreground">直链下载取决于视频服务器是否允许。若浏览器只打开视频，可尝试浏览器菜单「下载」。</span>}
        {source.kind === "file" &&
          (busy ? (
            <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>
              <Loader2 className="animate-spin" /> 转录中…点此取消
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={runTranscribe} title="可选：调用你配置的转录接口">
              <Mic /> AI 转录音轨（可选）
            </Button>
          ))}
        {cues.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
            字幕：{cueLabel} · {cues.length} 条
            <button type="button" aria-label="移除字幕" onClick={() => useApp.getState().setCues([], "")}>
              <X className="size-3.5" />
            </button>
          </span>
        ) : (
          <span className="text-muted-foreground">无字幕时 AI 只能看画面，听不到声音。</span>
        )}
        {source.label && (
          <span className="ml-auto max-w-full truncate text-muted-foreground" title={source.label}>
            正在放映：{source.label}
          </span>
        )}
      </div>
      {source.note && <Notice tone="warn">{source.note}</Notice>}
    </div>
  );
}
