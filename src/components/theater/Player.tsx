import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Film, Maximize, Minimize, Upload, Play, Pause, Volume2, VolumeX } from "lucide-react";
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
  const resumeRef = useRef<{time:number;playing:boolean}|null>(null);
  const [fauxFullscreen, setFauxFullscreen] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Use page-level cinema mode rather than the browser's native Android
  // fullscreen, which can show a persistent system exit banner and hide controls.
  useEffect(() => {
    const checkPortrait = () => setPortrait(window.innerHeight > window.innerWidth);
    const toggle = () => {
      const v = videoRef.current;
      if (v) resumeRef.current = {time:v.currentTime, playing:!v.paused};
      checkPortrait();
      setFauxFullscreen(x => !x);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFauxFullscreen(false);
    };
    checkPortrait();
    window.addEventListener("resize", checkPortrait);
    window.addEventListener("keydown", onKey);
    window.addEventListener("cowatch:toggle-fullscreen", toggle);
    return () => {
      window.removeEventListener("resize", checkPortrait);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cowatch:toggle-fullscreen", toggle);
    };
  }, []);

  useEffect(() => {
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    if (fauxFullscreen) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
    };
  }, [fauxFullscreen]);

  const fmt = (seconds: number) => {
    if (!Number.isFinite(seconds)) return "0:00";
    const v = Math.max(0, Math.floor(seconds));
    return Math.floor(v/60)+":"+String(v%60).padStart(2,"0");
  };
  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };

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
  }, [isHtmlVideo, source.src, source.crossOrigin, fauxFullscreen]);

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

  const stage = (
    <div
      ref={(el) => {
        stageRef.current = el;
      }}
      className="group/stage relative aspect-video w-full overflow-hidden rounded-lg bg-screen shadow-screen"
      // Portal this stage into document.body: page ancestors cannot trap fixed positioning.
      style={fauxFullscreen ? {
        position: "fixed",
        zIndex: 9999,
        top: 0,
        left: portrait ? "100vw" : 0,
        width: portrait ? "100dvh" : "100dvw",
        height: portrait ? "100dvw" : "100dvh",
        transform: portrait ? "rotate(90deg)" : "none",
        transformOrigin: "top left",
        aspectRatio: "auto",
        borderRadius: 0,
        backgroundColor: "#000",
      } : undefined}
      data-fs={fauxFullscreen}
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
          playsInline
          preload="metadata"
          disablePictureInPicture
          className="absolute inset-0 h-full w-full"
          onLoadedMetadata={(e) => {
            const video=e.currentTarget;
            const d=video.duration || 0;
            useApp.getState().setDuration(d);
            setDuration(d);
            const resume=resumeRef.current;
            if (resume) {
              resumeRef.current=null;
              if (Number.isFinite(resume.time) && resume.time > 0) {
                video.currentTime = Math.min(resume.time, Number.isFinite(d) && d>0 ? d : resume.time);
              }
              if (resume.playing) void video.play().catch(()=>undefined);
            }
          }}
          onDurationChange={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) { useApp.getState().setDuration(d); setDuration(d); }
          }}
          onError={onVideoError}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
          onEnded={() => setPlaying(false)}
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

      {isHtmlVideo && <div className="absolute bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-2 pt-8 text-white">
        <input type="range" aria-label="视频进度" className="mb-2 w-full accent-amber-400" min={0} max={Math.max(1,duration)} step={0.1} value={Math.min(currentTime,Math.max(1,duration))} onChange={e=>{const v=videoRef.current;if(v){v.currentTime=Number(e.target.value);setCurrentTime(v.currentTime);}}}/>
        <div className="flex items-center gap-2">
          <button type="button" className="rounded bg-black/40 p-2" aria-label={playing?"暂停":"播放"} onClick={togglePlayback}>{playing?<Pause className="size-5"/>:<Play className="size-5"/>}</button>
          <span className="text-xs tabular-nums">{fmt(currentTime)} / {fmt(duration)}</span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="rounded bg-black/40 p-2" aria-label={muted?"取消静音":"静音"} onClick={()=>{const v=videoRef.current;if(v)v.muted=!v.muted;}}>{muted?<VolumeX className="size-5"/>:<Volume2 className="size-5"/>}</button>
            <button type="button" onClick={() => void toggleFullscreen()} className="rounded bg-amber-400 px-3 py-2 font-semibold text-black" aria-label={fauxFullscreen?"退出横屏":"横屏放大"}>{fauxFullscreen?<Minimize className="size-5"/>:<Maximize className="size-5"/>}</button>
          </div>
        </div>
      </div>}
      {source.kind !== "none" && !isHtmlVideo && (
        <button type="button" onClick={() => void toggleFullscreen()} className="absolute right-2 top-2 z-50 rounded-md bg-black/85 px-3 py-2 text-sm font-bold text-white" aria-label={fauxFullscreen?"退出放大":"放大画面"}>{fauxFullscreen?"退出放大":"放大画面"}</button>
      )}
      {fauxFullscreen && <button type="button" onClick={() => void toggleFullscreen()} className="absolute right-3 top-3 z-[70] rounded-lg border border-white/50 bg-black/85 px-4 py-2 text-sm font-bold text-white shadow-lg" aria-label="退出横屏返回放映室"><Minimize className="mr-1 inline size-4"/> 退出横屏</button>}

    </div>
  );
  return fauxFullscreen ? createPortal(stage, document.body) : stage;
}
