import { useMemo } from "react";
import { toast } from "sonner";
import { Play, Square, RotateCcw, Sparkles, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Notice } from "@/components/form-bits";
import { useApp, useSecrets } from "@/lib/store";
import { getClock } from "@/lib/clock";
import { cancelGeneration, describeMaterial, regenerateSegment, restartAll, startGeneration } from "@/lib/ai/generator";
import { estimateCost } from "@/lib/ai/cost";
import { makeDemoDanmaku } from "@/lib/demo";
import { formatTime } from "@/lib/id";
import { cn } from "@/lib/utils";
import type { SegmentStatus } from "@/lib/types";

const STATUS: Record<SegmentStatus, { label: string; cls: string }> = {
  pending: { label: "待生成", cls: "bg-muted" },
  running: { label: "生成中", cls: "bg-primary animate-pulse" },
  done: { label: "完成", cls: "bg-success" },
  error: { label: "失败", cls: "bg-destructive" },
  skipped: { label: "跳过", cls: "bg-secondary" },
  cancelled: { label: "已取消", cls: "bg-warning/50" },
};

export function GenerationPanel() {
  const settings = useApp((s) => s.settings);
  const source = useApp((s) => s.source);
  const cues = useApp((s) => s.cues);
  const duration = useApp((s) => s.duration);
  const segments = useApp((s) => s.segments);
  const generating = useApp((s) => s.generating);
  const log = useApp((s) => s.log);
  const demo = useApp((s) => s.demo);
  const realCount = useApp((s) => (s.demo ? 0 : s.danmaku.length));
  const hasKey = useSecrets((s) => s.apiKey.length > 0);

  const material = useMemo(() => describeMaterial(), [source, settings.provider, cues]);
  const estimate = useMemo(
    () =>
      estimateCost(settings, duration, {
        canUseFrames: material.canFrames,
        useVideo: material.useVideo,
        subtitleChars: cues.reduce((n, c) => n + c.text.length, 0),
      }),
    [settings, duration, material, cues],
  );

  let host = "";
  try {
    host = new URL(settings.provider.baseUrl).host;
  } catch {
    host = "（无效地址）";
  }

  const done = segments.filter((s) => s.status === "done").length;
  const pct = segments.length ? Math.round((done / segments.length) * 100) : 0;

  const sendList = [
    material.useVideo ? "本片段视频（含音轨，Gemini 原生）" : material.canFrames ? `抽帧图片（每 ${settings.analysis.frameInterval}s，最宽 ${settings.analysis.frameMaxWidth}px）` : null,
    material.hasCues ? "字幕文本" : null,
    "最近弹幕与观众设定",
  ].filter(Boolean);

  const start = async () => {
    try {
      const current = useApp.getState();
      const remaining = Math.ceil(Math.max(0,current.duration) / Math.max(5,current.settings.analysis.segmentLength))
        - current.segments.filter(x => x.status === "done").length;
      if (current.settings.generation.requestLimit == null && remaining > 10
        && !window.confirm(`即将尝试处理约 ${remaining} 个片段且没有请求上限。长视频使用付费模型可能产生较高费用。是否继续？\n建议先在「生成设置」选择「先试 2 分钟」或限制片段数。`)) return;
      await startGeneration();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <section className="panel space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display mr-auto text-base font-bold">AI 弹幕生成</h2>
        {generating ? (
          <Button variant="destructive" onClick={cancelGeneration}>
            <Square /> 停止
          </Button>
        ) : (
          <>
            <Button variant="marquee" onClick={start} disabled={source.kind === "none"}>
              <Play /> {segments.some((s) => s.status === "done") ? "继续生成" : "开始生成"}
            </Button>
            {realCount > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  if (window.confirm("清空当前所有弹幕并全部重新生成？")) restartAll().catch((e) => toast.error((e as Error).message));
                }}
              >
                <RotateCcw /> 全部重来
              </Button>
            )}
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={generating || !duration}
          title="生成本地示例弹幕，仅用于试用播放器，并非 AI 分析"
          onClick={() => {
            if (realCount > 0 && !window.confirm("演示弹幕会替换当前弹幕，继续？")) return;
            useApp.getState().setDanmaku(makeDemoDanmaku(duration, settings.generation.density), true);
            useApp.getState().setSegments([]);
            toast.info("已加载演示弹幕（非 AI 分析，仅用于试看效果）");
          }}
        >
          <Sparkles /> 演示弹幕
        </Button>
      </div>

      {duration >= 1800 && !generating && segments.every(s => s.status !== "done") && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <div className="mb-1 font-medium">长视频省钱提速</div>
          <p className="mb-2 text-xs text-muted-foreground">只改变后续生成：减少分段请求与发送的截图；不会额外调用 API。精细模式保持原有设置。建议先用省钱模式试一小段，检查弹幕质量。</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => {
              useApp.getState().update("analysis", {segmentLength: 30, frameInterval: 5});
              useApp.getState().setSegments([]);
              toast.info("已切换精细模式：每 30 秒一段、5 秒一帧");
            }}>精细 · 30 秒 / 5 秒</Button>
            <Button size="sm" variant="secondary" onClick={() => {
              useApp.getState().update("analysis", {segmentLength: 60, frameInterval: 6});
              useApp.getState().setSegments([]);
              toast.success("已切换均衡模式：每 60 秒一段、6 秒一帧");
            }}>均衡 · 60 秒 / 6 秒</Button>
            <Button size="sm" variant="secondary" onClick={() => {
              useApp.getState().update("analysis", {segmentLength: 90, frameInterval: 9});
              useApp.getState().setSegments([]);
              toast.success("已切换省钱模式：每 90 秒一段、9 秒一帧");
            }}>省钱 · 90 秒 / 9 秒</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">当前：每 {settings.analysis.segmentLength} 秒一段，每 {settings.analysis.frameInterval} 秒一帧。省钱模式可能错过短暂高能画面；正在生成或已有完成片段时不会显示切换按钮，以免破坏进度。</p>
        </div>
      )}

      {demo && <Notice tone="warn">当前显示的是「演示数据」：本地随机示例，不是对视频的 AI 分析。开始生成后会被替换。</Notice>}

      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-md bg-muted/60 p-2.5">
          <div className="mb-1 flex items-center gap-1 font-medium text-foreground">
            <ShieldCheck className="size-3.5 text-primary" /> 生成时将发送给 <span className="font-mono text-primary">{host}</span>
          </div>
          <p className="text-muted-foreground">{sendList.join(" · ")}。视频文件本身不会上传到本站服务器。</p>
          {!material.useVideo && <p className="mt-1 text-muted-foreground">未提供音频：AI 只理解画面帧{material.hasCues ? "和字幕" : ""}，不会声称听到了声音。</p>}
        </div>
        <div className="rounded-md bg-muted/60 p-2.5">
          <div className="mb-1 font-medium text-foreground">预估用量</div>
          {duration > 0 ? (
            <p className="text-muted-foreground">
              {estimate.requests} 次请求 · {estimate.frames} 张图 · 输入约 {Math.round(estimate.inputTokens / 1000)}k / 输出约{" "}
              {Math.round(estimate.outputTokens / 1000)}k tokens
              {estimate.usd !== null ? <span className="text-primary"> · 约 ${estimate.usd.toFixed(3)}</span> : null}
            </p>
          ) : (
            <p className="text-muted-foreground">打开视频后显示。</p>
          )}
          <p className="mt-1 text-muted-foreground/80">{estimate.note}</p>
        </div>
      </div>

      {!hasKey && source.kind !== "none" && (
        <Notice>还没有填写 API 密钥：请在「AI 接口」中配置你自己的供应商。也可以先点「演示弹幕」试看播放效果。</Notice>
      )}
      {material.problem && source.kind !== "none" && <Notice tone="warn">{material.problem}</Notice>}

      {segments.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              分段进度 {done}/{segments.length}（{settings.generation.bufferMode === "full" ? "预生成全部" : `边播边生成，提前 ${settings.generation.lookahead}s`}）
            </span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />
          <div className="flex flex-wrap gap-1" role="list" aria-label="片段状态">
            {segments.map((s) => (
              <button
                key={s.index}
                role="listitem"
                type="button"
                title={`片段 ${s.index + 1} ${formatTime(s.start)}–${formatTime(s.end)} · ${STATUS[s.status].label}${s.count ? ` · ${s.count} 条` : ""}${s.error ? `\n${s.error}` : ""}`}
                onClick={() => getClock()?.seek(s.start)}
                className={cn("h-3 min-w-3 flex-1 rounded-sm", STATUS[s.status].cls)}
              />
            ))}
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">片段详情 · 按片段重新生成</summary>
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
              {segments.map((s) => (
                <li key={s.index} className="flex items-center gap-2 rounded bg-muted/40 px-2 py-1">
                  <span className={cn("size-2 shrink-0 rounded-full", STATUS[s.status].cls)} />
                  <button type="button" className="font-mono hover:text-primary" onClick={() => getClock()?.seek(s.start)}>
                    {formatTime(s.start)}–{formatTime(s.end)}
                  </button>
                  <span className="text-muted-foreground">{STATUS[s.status].label}{s.count ? ` · ${s.count} 条` : ""}</span>
                  {s.error && <span className="min-w-0 flex-1 truncate text-destructive" title={s.error}>{s.error}</span>}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-6 px-2"
                    disabled={s.status === "running"}
                    onClick={() => void regenerateSegment(s.index)}
                  >
                    <RefreshCw className="size-3" /> {s.status === "error" ? "重试" : "重新生成"}
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {log.length > 0 && (
        <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-md bg-screen/60 p-2 font-mono text-[11px]" aria-live="polite">
          {log.slice(-8).map((l, i) => (
            <div key={i} className={cn(l.level === "error" && "text-destructive", l.level === "warn" && "text-warning", l.level === "info" && "text-muted-foreground")}>
              {new Date(l.at).toLocaleTimeString("zh-CN", { hour12: false })} {l.text}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
