import { useCallback, useEffect, useMemo, useState } from "react";
import { BookmarkPlus, Clapperboard, Heart, Play, Trash2, RefreshCw, Download, Upload } from "lucide-react";
import { exportScreeningPackage, importScreeningPackage, shareSavedVideo } from "@/lib/screening-package";
import { exportDeviceTransfer, importDeviceTransfer } from "@/lib/device-transfer";
import { downloadText } from "@/lib/export";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { useApp } from "@/lib/store";
import { openLocalFile, openUrl } from "./source-actions";
import type { SavedScreening } from "@/lib/types";

async function makeCover(): Promise<string | undefined> {
  const v = document.querySelector("video");
  if (!v || v.readyState < 2 || !v.videoWidth || !v.videoHeight) return undefined;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.fillStyle = "#161110";
    ctx.fillRect(0, 0, 320, 180);
    const ratio = Math.min(320 / v.videoWidth, 180 / v.videoHeight);
    const w = v.videoWidth * ratio, h = v.videoHeight * ratio;
    ctx.drawImage(v, (320 - w) / 2, (180 - h) / 2, w, h);
    return canvas.toDataURL("image/jpeg", 0.65);
  } catch {
    // Cross-origin video is playable but cannot be snapshotted.
    return undefined;
  }
}

function durationText(sec: number): string {
  const n = Math.floor(Math.max(0, sec || 0));
  return Math.floor(n / 60) + ":" + String(n % 60).padStart(2, "0");
}

export function SavedTheater() {
  const source = useApp(s => s.source);
  const danmaku = useApp(s => s.danmaku);
  const comments = useApp(s => s.comments);
  const cues = useApp(s => s.cues);
  const generating = useApp(s => s.generating);
  const savedId = useApp(s => s.savedScreeningId);
  const [records, setRecords] = useState<SavedScreening[]>([]);
  const [busy, setBusy] = useState(false);
  const [storageEstimate, setStorageEstimate] = useState<string>("");

  const reload = useCallback(async () => {
    try { setRecords(await db.listScreenings()); }
    catch { toast.error("无法读取本机放映收藏。请确认浏览器允许保存网站数据。"); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { const handler = () => {void reload();}; window.addEventListener("cowatch:records-updated", handler); return () => window.removeEventListener("cowatch:records-updated", handler); }, [reload]);
  useEffect(() => {
    if (!navigator.storage?.estimate) return;
    void navigator.storage.estimate().then(({ usage, quota }) => {
      if (usage !== undefined && quota !== undefined) {
        setStorageEstimate("本机网站存储约 " + (usage / 1024 / 1024).toFixed(0) +
          " MB / " + (quota / 1024 / 1024).toFixed(0) + " MB（浏览器估算）");
      }
    }).catch(() => undefined);
  }, [records.length]);

  const save = async () => {
    if (source.kind === "none" || generating) return;
    const existing = savedId ? records.find(r => r.id === savedId) : undefined;
    const suggested = existing?.title ?? source.label.replace(/\.[^.]+$/, "") ?? "我的放映";
    const entered = window.prompt("给这场放映起个标题吧（仅自己可见）", suggested);
    if (entered === null) return;
    const title = entered.trim().slice(0, 100);
    if (!title) { toast.error("标题不能为空"); return; }
    const file = source.kind === "file" ? source.file : undefined;
    if (source.kind === "file" && !file) { toast.error("视频文件已失效，请重新选择本地视频"); return; }
    if (file && file.size > 150 * 1024 * 1024) {
      const mb = Math.round(file.size / 1024 / 1024);
      if (!window.confirm("这个视频约 " + mb + "MB。收藏会把完整视频复制到此设备的共映存储中，占用手机空间，并可能受浏览器容量限制。仍要保存吗？")) return;
    }
    setBusy(true);
    try {
      const now = Date.now();
      const current = useApp.getState();
      const cover = await makeCover();
      const rec: SavedScreening = {
        id: existing?.id ?? crypto.randomUUID(),
        title,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        sourceKind: source.kind as SavedScreening["sourceKind"],
        sourceLabel: source.label,
        ...(file ? { file } : {}),
        ...(source.kind !== "file" ? { sourceUrl: source.kind === "youtube"
          ? "https://www.youtube.com/watch?v=" + source.youtubeId
          : source.kind === "bilibili" ? source.label : source.src } : {}),
        ...(cover ? { thumbnail: cover } : existing?.thumbnail ? { thumbnail: existing.thumbnail } : {}),
        duration: current.duration,
        danmaku: [...current.danmaku],
        demo: current.demo,
        cues: [...current.cues],
        cueLabel: current.cueLabel,
        comments: [...current.comments],
      };
      await db.putScreening(rec);
      useApp.getState().setSavedScreeningId(rec.id);
      await reload();
      toast.success("已收藏「" + title + "」：视频、" + danmaku.length + " 条弹幕、" + comments.length + " 条评论");
    } catch (error) {
      const quota = error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "UnknownError");
      toast.error(quota ? "手机网站存储空间不足。可以换较小的视频，或释放设备空间后重试。" : "保存失败：无法写入本机存储，请检查浏览器权限与剩余空间。");
    } finally { setBusy(false); }
  };

  const open = (item: SavedScreening) => {
    if (generating) { toast.error("请先停止正在生成的弹幕"); return; }
    let error: string | null;
    if (item.sourceKind === "file") {
      if (!item.file) { toast.error("收藏中的本地视频文件缺失"); return; }
      error = openLocalFile(item.file);
    } else {
      error = openUrl(item.sourceUrl || item.sourceLabel);
    }
    if (error) { toast.error(error); return; }
    const state = useApp.getState();
    state.setCues(item.cues ?? [], item.cueLabel || "");
    state.setDanmaku(item.danmaku ?? [], item.demo ?? false);
    state.setComments(item.comments ?? []);
    state.setSavedScreeningId(item.id);
    toast.success("欢迎回来！已恢复 " + (item.danmaku?.length ?? 0) + " 条弹幕和 " + (item.comments?.length ?? 0) + " 条评论");
    document.getElementById("cowatch-player-top")?.scrollIntoView({ behavior: "smooth" });
  };

  const exportTransfer = async () => {
    if (generating) {toast.error("请先停止生成后备份，避免漏掉最新弹幕");return;}
    setBusy(true);
    try {
      const result = await exportDeviceTransfer();
      downloadText("cowatch-sync.json", result.text, "application/json");
      toast.success("设备迁移包已导出：含 " + result.history + " 条历史、" + result.screenings + " 部收藏。不含视频原文件和 API 密钥。");
    } catch(error) {
      toast.error("导出失败：" + (error instanceof Error ? error.message : String(error)));
    } finally {setBusy(false);}
  };
  const importTransfer = async (file: File) => {
    if (generating) {toast.error("请先停止生成弹幕");return;}
    if (!window.confirm("将此设备迁移包合并到本机：保留本机现有记录，同编号优先采用较新的记录；使用导入的观众与生成偏好，但保留本机 API 密钥与接口地址。继续？"))return;
    setBusy(true);
    try {
      const result = await importDeviceTransfer(file);
      await reload();
      toast.success("迁移完成：历史 " + result.history + " 条、预设 " + result.presets + " 组、收藏 " + result.screenings + " 部。缺少视频文件的收藏可在此补充视频。",{duration:9000});
    } catch(error) {
      toast.error("迁移失败：" + (error instanceof Error ? error.message : String(error)));
    } finally {setBusy(false);}
  };
  const attachVideo = async (item: SavedScreening, file: File) => {
    if (generating) {toast.error("请先停止生成弹幕");return;}
    if (!file.type.startsWith("video/") && !/\\.(mp4|webm|mov|m4v|mkv|ogv)$/i.test(file.name)) {toast.error("请选择视频文件");return;}
    if (item.sourceLabel && file.name !== item.sourceLabel && !window.confirm("视频文件名与原收藏不同，时间轴可能无法匹配，仍要关联吗？"))return;
    setBusy(true);
    try {
      await db.putScreening({...item,file,sourceLabel:file.name,updatedAt:Date.now()});
      await reload();
      toast.success("已关联视频文件，原来的弹幕和字幕不会重新生成");
    }catch{toast.error("保存视频文件失败，可能是本机空间不足");}
    finally{setBusy(false);}
  };
  const importPackage = async (file: File) => {
    if (generating) { toast.error("请先停止生成弹幕"); return; }
    setBusy(true);
    try {
      const item = await importScreeningPackage(file);
      await db.putScreening(item);
      await reload();
      toast.success("完整放映包已导入本机收藏，离线观看无需重新生成弹幕");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入失败；请检查文件和剩余空间");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: SavedScreening) => {
    if (!window.confirm("从本设备删除「" + item.title + "」及其收藏的弹幕、评论和视频副本？删除后无法恢复。")) return;
    try {
      await db.deleteScreening(item.id);
      if (savedId === item.id) useApp.getState().setSavedScreeningId(null);
      await reload();
      toast.success("已从我的放映室移除");
    } catch { toast.error("删除失败"); }
  };

  const recommended = useMemo(() => {
    if (!records.length) return [];
    // Playful local-only rotation, never implies a public algorithm or strangers' uploads.
    const pivot = Math.floor(Date.now() / 86400000) % records.length;
    return [...records.slice(pivot), ...records.slice(0, pivot)].slice(0, 3);
  }, [records]);

  const card = (item: SavedScreening, compact: boolean) => (
    <div key={item.id} className="min-w-0 overflow-hidden rounded-xl border border-border bg-secondary/20">
      <button type="button" onClick={() => open(item)} className="block w-full text-left">
        <div className="relative aspect-video overflow-hidden bg-black">
          {item.thumbnail ? <img src={item.thumbnail} alt="" className="h-full w-full object-contain" loading="lazy" /> : <div className="flex h-full w-full items-center justify-center text-primary"><Clapperboard className="size-9"/></div>}
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-xs text-white">{durationText(item.duration)}</span>
          <span className="absolute left-2 top-2 rounded bg-black/70 p-1.5 text-white"><Play className="size-4"/></span>
        </div>
        <div className="space-y-1 px-2.5 py-2">
          <p className="line-clamp-2 break-words text-sm font-semibold">{item.title}</p>
          <p className="text-xs text-muted-foreground">💬 {item.danmaku?.length ?? 0} 弹幕 · {item.comments?.length ?? 0} 评论</p>
          {!compact && <p className="text-xs text-muted-foreground">{new Date(item.updatedAt).toLocaleDateString("zh-CN")} · {item.sourceKind === "file" ? "本地视频" : "外链视频"}</p>}
        </div>
      </button>
      {!compact && <div className="flex flex-wrap justify-end gap-1 border-t border-border px-2 py-1">
        {item.sourceKind === "file" && !item.file && <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs">补充本地视频 <input type="file" accept="video/*,.mkv,.mov,.m4v,.ogv" className="sr-only" disabled={busy||generating} onChange={e=>{const f=e.target.files?.[0];if(f)void attachVideo(item,f);e.target.value="";}}/></label>}\n        {item.sourceKind === "file" && item.file && <>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => {
            void shareSavedVideo(item).then(()=>toast.success("已调用安卓分享，记得在接收位置确认视频文件完整保存。")).catch(error=>{
              if((error as Error).name!=="AbortError") toast.error((error as Error).message,{duration:9000});
            });
          }}><Upload className="size-3.5"/> 手机分享原视频</Button>
          <Button size="sm" variant="outline" onClick={() => { void exportScreeningPackage(item).then(message=>toast.message(message,{duration:9000})).catch(error=>{if((error as Error).name!=="AbortError")toast.error((error as Error).message,{duration:11000});}); }}><Download className="size-3.5"/> 导出放映包</Button>
        </>}
        <Button size="sm" variant="ghost" onClick={() => void remove(item)}><Trash2 className="size-3.5"/> 删除收藏</Button>
      </div>}
    </div>
  );

  return <section className="panel space-y-3 p-3 sm:p-4" id="my-screenings">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="mr-auto flex items-center gap-2 font-bold"><Heart className="size-5 text-primary"/> 猜你喜欢 <span className="text-xs font-normal text-muted-foreground">来自我的放映室</span></h2>
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium hover:bg-secondary">
        <Upload className="size-3.5"/>导入放映包
        <input className="sr-only" type="file" accept=".cowatch" disabled={busy || generating} onChange={e => {
          const file = e.target.files?.[0];
          if (file) void importPackage(file);
          e.target.value = "";
        }}/>
      </label>
      <Button size="sm" variant="outline" disabled={busy||generating} onClick={()=>void exportTransfer()}><Download className="size-3.5"/> PC→手机迁移包</Button>
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium hover:bg-secondary">
        <Upload className="size-3.5"/>导入设备迁移包
        <input className="sr-only" type="file" accept=".json" disabled={busy || generating} onChange={e=>{const f=e.target.files?.[0];if(f)void importTransfer(f);e.target.value="";}}/>
      </label>
      <Button size="sm" variant="marquee" disabled={source.kind === "none" || generating || busy} onClick={() => void save()}><BookmarkPlus className="size-4"/>{busy ? "保存中…" : savedId ? "更新这场放映" : "收藏这场放映"}</Button>
    </div>
    {!records.length ? <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">这里将成为你的私人观影首页。先选一个视频，生成弹幕和评论，再点「收藏这场放映」就能拥有第一张推荐卡片啦！🍿</div> : <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{recommended.map(item => card(item, true))}</div>
      <details className="space-y-3 rounded-lg border border-border px-3 py-2">
        <summary className="cursor-pointer font-semibold">📚 我的放映室 · {records.length} 部收藏（展开全部）</summary>
        <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3">{records.map(item => card(item, false))}</div>
        <Button size="sm" variant="ghost" onClick={() => void reload()}><RefreshCw className="size-4"/> 刷新收藏</Button>
      </details>
    </>}
    <p className="text-xs text-muted-foreground">旧版安卓可能无法保存 .cowatch 下载。请先在设置中用配对码将弹幕与收藏记录同步到新 Alpha；如原视频只在旧版，展开收藏卡片尝试「手机分享原视频」，在系统分享页保存到文件管理或传到 PC。看到视频在外部文件夹可播放后，再到新 Alpha 的收藏里点「补充本地视频」进行关联。切勿提前卸载旧版或清理其应用数据。</p>
    {storageEstimate && <p className="text-xs text-muted-foreground">{storageEstimate}</p>}\n    <p className="text-xs text-muted-foreground">支持导出和导入 .cowatch 完整放映包。断网启动需先联网打开新版共映至少一次，让离线网页资源完成缓存。仅本地文件可以完整离线播放；外链仍需网络。 </p>\n    <p className="text-xs text-muted-foreground">这些都是你自己保存的放映记录，推荐卡片只从本机收藏中轮换，不是其他人的真实投稿。本地视频会占用设备存储；切换浏览器、卸载 App 或清除网站数据可能导致收藏丢失。修改弹幕后记得点「更新这场放映」。</p>
  </section>;
}
