import { useEffect, useRef, useState } from "react";
import { Film, Maximize, Minimize, Upload } from "lucide-react";
import { useApp } from "@/lib/store";
import { setClock, stageRef, toggleFullscreen } from "@/lib/clock";
import { DanmakuCanvas } from "./DanmakuCanvas";
import { SubtitleOverlay } from "./SubtitleOverlay";
import { YouTubeEmbed } from "./YouTubeEmbed";
import { openLocalFile } from "./source-actions";

export function Player() {
  const source = useApp((s) => s.source);
  const demo = useApp((s) => s.demo);
  const hasDanmaku = useApp((s) => s.danmaku.length > 0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fs, setFs] = useState(false);
  const [fauxFullscreen, setFauxFullscreen] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [fullscreenHint, setFullscreenHint] = useState("");
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    const checkPortrait = () => setPortrait(window.innerHeight > window.innerWidth);
    const onFs = () => {
      const native = document.fullscreenElement === stage;
      setFs(native);
      if (!native) setFauxFullscreen(false);
    };
    const toggle = async () => {
      setFullscreenHint("");
      if (document.fullscreenElement === stage) {
        try { await document.exitFullscreen(); } catch { setFauxFullscreen(false); }
        return;
      }
      if (fauxFullscreen) { setFauxFullscreen(false); return; }
      let native = false;
      if (stage?.requestFullscreen) {
        try {
          await stage.requestFullscreen();
          native = document.fullscreenElement === stage;
        } catch { /* Browser denied native fullscreen: use a viewport fallback. */ }
      }
      if (!native) {
        setFauxFullscreen(true);
        checkPortrait();
        setFullscreenHint("浏览器不支持页面原生全屏，已切换沉浸式观影。");
      } else {
        // Android may allow orientation.lock only while fullscreen.
        try {
          const orientation = screen.orientation as ScreenOrientation & { lock?: (value: "landscape") => Promise<void> };
          if (orientation?.lock) await orientation.lock("landscape");
          else { checkPortrait(); setFullscreenHint("如果画面仍是竖屏，请旋转手机或开启系统自动旋转。"); }
        } catch {
          // Some Android in-app browsers allow fullscreen but deny orientation.lock.
          // Fall back to a rotated fixed-position theater while keeping subtitles and danmaku.
          try { await document.exitFullscreen(); } catch { /* native exit may be unsupported */ }
          checkPortrait();
          setFauxFullscreen(true);
          setFullscreenHint("已启用兼容横屏模式。若画面方向异常，可尝试关闭系统旋转锁定。");
        }
      }
    };
    checkPortrait();
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("resize", checkPortrait);
    stage?.addEventListener("cowatch:toggle-fullscreen", toggle);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("resize", checkPortrait);
      stage?.removeEventListener("cowatch:toggle-fullscreen", toggle);
    };
  }, [fauxFullscreen]);

  useEffect(() => {
    const oldOverflow = document.body.style.overflow;
    if (fauxFullscreen) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = oldOverflow; };
  }, [fauxFullscreen]);

  const isHtmlVideo = source.kind === "file" || source.kind === "url";

  useEffect(() => {
    if (!isHtmlVideo) return;
    const v = videoRef.current;
    if (!v) return;
    setClock({
      getTime: () => v.currentTime,
      isPaused: () => v.paused,
      getRate: () => v.playbackRate,
      getDuration: () => v.duration || 0,
      seek: (t) => {
        v.currentTime = t;
      },
    });
    return () => setClock(null);
  }, [isHtmlVideo, source.src, source.crossOrigin]);

  const onVideoError = () => {
    const st = useApp.getState();
    if (st.source.kind === "url" && st.source.crossOrigin) {
      // Retry without CORS: playable, but frames can't be read.
      st.patchSource({
        crossOrigin: false,
        analyzable: false,
        note: "该链接未允许跨域 (CORS)：可以播放，但浏览器禁止读取画面，无法抽帧分析。可下载后以本地文件打开，或导入字幕。",
      });
      return;
    }
    st.patchSource({
      analyzable: false,
      note:
        st.source.kind === "file"
          ? "浏览器无法解码该文件（可能是不支持的编码，如 HEVC/MKV）。请转为 H.264 MP4 或 WebM。"
          : "无法播放该链接：需要是可直接访问的 MP4/WebM 视频地址（网页地址不行）。",
    });
  };

  return (
    <div
      ref={(el) => {
        stageRef.current = el;
      }}
      className={["group/stage relative aspect-video w-full overflow-hidden rounded-lg bg-screen shadow-screen", (fs || fauxFullscreen) ? "aspect-auto rounded-none" : "", fs ? "h-[100dvh] w-[100dvw]" : "", fauxFullscreen ? "fixed z-[100] bg-black" : "", fauxFullscreen && portrait ? "left-[100vw] top-0 h-[100vw] w-[100dvh] origin-top-left rotate-90" : "", fauxFullscreen && !portrait ? "inset-0 h-[100dvh] w-[100dvw]" : ""].join(" ")}
      data-fs={fs || fauxFullscreen}
      onDragOver={(e) => {
        if (source.kind === "none") {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) openLocalFile(f);
      }}
    >
      {isHtmlVideo && (
        <video
          key={source.src + String(source.crossOrigin)}
          ref={videoRef}
          src={source.src}
          crossOrigin={source.crossOrigin ? "anonymous" : undefined}
          controls
          playsInline
          controlsList="nofullscreen"
          disablePictureInPicture
          className="absolute inset-0 h-full w-full"
          onLoadedMetadata={(e) => useApp.getState().setDuration(e.currentTarget.duration || 0)}
          onDurationChange={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) useApp.getState().setDuration(d);
          }}
          onError={onVideoError}
        />
      )}
      {source.kind === "youtube" && source.youtubeId && <YouTubeEmbed id={source.youtubeId} />}
      {source.kind === "bilibili" && source.bilibiliEmbed && (
        <iframe
          src={source.bilibiliEmbed}
          title="Bilibili 播放器"
          className="absolute inset-0 h-full w-full"
          allow="fullscreen; encrypted-media"
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
          referrerPolicy="no-referrer"
        />
      )}
      {source.kind === "none" && (
        <label
          className={`absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed p-6 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-transparent"}`}
        >
          <input
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) openLocalFile(f);
            }}
          />
          <span className="grid size-16 place-items-center rounded-full bg-marquee text-primary-foreground shadow-glow">
            <Film className="size-7" />
          </span>
          <span className="font-display text-xl font-bold sm:text-2xl">今晚放映什么？</span>
          <span className="max-w-md text-sm text-muted-foreground">
            点击或拖入本地视频（只在你的浏览器里播放，不上传到本站）；或在上方粘贴视频链接。
          </span>
          <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-primary">
            <Upload className="size-3.5" /> 选择视频文件
          </span>
        </label>
      )}

      {source.kind !== "bilibili" && source.kind !== "none" && <DanmakuCanvas />}

      {source.kind !== "none" && source.kind !== "bilibili" && <SubtitleOverlay />}

      {demo && hasDanmaku && (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-destructive/90 px-2 py-0.5 text-[11px] font-bold text-destructive-foreground">
          演示数据 · 非 AI 分析
        </div>
      )}

      {fullscreenHint && (fs || fauxFullscreen) && <div className="pointer-events-none absolute left-2 top-2 z-30 max-w-[75%] rounded bg-black/65 px-2 py-1 text-xs text-white">{fullscreenHint}</div>}
      {source.kind !== "none" && (
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className="absolute right-2 top-2 rounded-md bg-screen/70 p-1.5 text-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover/stage:opacity-100"
          aria-label={fs || fauxFullscreen ? "退出全屏" : "横屏全屏（含弹幕和字幕）"}
        >
          {fs || fauxFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
        </button>
      )}
    </div>
  );
}
