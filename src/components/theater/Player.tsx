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
  const [orientationNote, setOrientationNote] = useState("");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [seekPreview, setSeekPreview] = useState<number | null>(null);
  const touchStart = useRef<{ x: number; y: number; v: number; b: number; brightnessSide: boolean; changed: boolean } | null>(null);
  const seekingRef = useRef(false);
  const lastTapRef = useRef(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekTrackRef = useRef<HTMLDivElement>(null);
  const [gestureHint, setGestureHint] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const isHtmlVideo = source.kind === "file" || source.kind === "url";
  const [controlsVisible, setControlsVisible] = useState(true);

  useEffect(() => () => {
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
  }, []);

  // Use page-level cinema mode rather than the browser's native Android
  // fullscreen, which can show a persistent system exit banner and hide controls.
  useEffect(() => {
    const checkPortrait = () => setPortrait(window.innerHeight > window.innerWidth);
    const toggle = async () => {
      const v = videoRef.current;
      if (v) resumeRef.current = {time:v.currentTime, playing:!v.paused};
      checkPortrait();
      setControlsVisible(true);
      if (stageRef.current?.dataset["fs"] === "true") {
        setFauxFullscreen(false);
        setOrientationNote("");
        try { screen.orientation.unlock(); } catch { /* no permission required for fallback */ }
        return;
      }
      setFauxFullscreen(true);
      // Installed Android PWAs may permit orientation.lock, unlike in-app tabs.
      // Never trigger native requestFullscreen: it displays Android's system exit banner.
      const orientation = screen.orientation as ScreenOrientation & { lock?: (value: "landscape") => Promise<void> };
      if (typeof orientation?.lock === "function") {
        try {
          await orientation.lock("landscape");
          setOrientationNote("");
          checkPortrait();
        } catch {
          setOrientationNote("手机未允许自动横屏。请打开自动旋转，或点手机上的旋转提示按钮。");
        }
      } else {
        setOrientationNote("如果画面横着显示，请开启手机自动旋转或使用系统旋转按钮。");
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        setFauxFullscreen(false);
        try { screen.orientation.unlock(); } catch { /* unsupported */ }
      }
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

  // Real video players hide their controls while playing. Any tap on empty
  // video space toggles them; clicks on buttons and the seek bar are ignored.
  useEffect(() => {
    if (!controlsVisible || !playing || !isHtmlVideo || seekPreview !== null || gestureHint) return;
    const timeout = window.setTimeout(() => setControlsVisible(false), 3200);
    return () => window.clearTimeout(timeout);
  }, [controlsVisible, playing, isHtmlVideo, seekPreview, gestureHint]);

  const leaveCinema = async () => {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* exit may be blocked */ }
    }
    setControlsVisible(true);
    setFauxFullscreen(false);
    setOrientationNote("");
    try { screen.orientation.unlock(); } catch { /* unsupported */ }
  };

  const fmt = (seconds: number) => {
    if (!Number.isFinite(seconds)) return "0:00";
    const v = Math.max(0, Math.floor(seconds));
    return Math.floor(v/60)+":"+String(v%60).padStart(2,"0");
  };
  const seekAt = (clientX: number, clientY: number) => {
    const track = seekTrackRef.current;
    const v = videoRef.current;
    if (!track || !v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    const rect = track.getBoundingClientRect();
    // When the cinema is rotated with CSS, the track runs vertically in
    // viewport coordinates. Measure against its own local horizontal axis.
    const rotated = fauxFullscreen && portrait;
    const fraction = rotated
      ? (clientY - rect.top) / Math.max(rect.height, 1)
      : (clientX - rect.left) / Math.max(rect.width, 1);
    const time = Math.min(v.duration, Math.max(0, fraction * v.duration));
    v.currentTime = time;
    setCurrentTime(time);
    setSeekPreview(time);
  };
  const handleStageTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      lastTapRef.current = 0;
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
      togglePlayback();
      setControlsVisible(true);
      return;
    }
    lastTapRef.current = now;
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      setControlsVisible(v => !v);
      singleTapTimerRef.current = null;
    }, 320);
  };
  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };

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
          onPlay={() => { setPlaying(true); setControlsVisible(true); }}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
          onEnded={() => setPlaying(false)}
        />
      )}
      {isHtmlVideo && brightness < 1 && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5]" style={{ background: `rgba(0,0,0,${(1-brightness)*0.85})` }} />}
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

      {isHtmlVideo && <div
        aria-label="播放画面：左侧上下滑调亮度，右侧上下滑调音量"
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          const localX = e.nativeEvent.offsetX;
          touchStart.current = {
            x: e.clientX, y: e.clientY,
            v: videoRef.current?.volume ?? 1, b: brightness,
            brightnessSide: localX < e.currentTarget.clientWidth / 2,
            changed: false,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const g = touchStart.current;
          if (!g || e.pointerType === "mouse") return;
          const rotated = fauxFullscreen && portrait;
          const deltaPx = rotated ? e.clientX - g.x : g.y - e.clientY;
          const sideways = rotated ? Math.abs(e.clientY - g.y) : Math.abs(e.clientX - g.x);
          if (!g.changed && (Math.abs(deltaPx) < 12 || sideways > Math.abs(deltaPx) * 1.4)) return;
          g.changed = true;
          const delta = deltaPx / Math.max(150, e.currentTarget.clientHeight);
          if (g.brightnessSide) {
            const next = Math.max(0.15, Math.min(1, g.b + delta));
            setBrightness(next);
            setGestureHint("☀ 亮度 " + Math.round(next * 100) + "%");
          } else if (videoRef.current) {
            const next = Math.max(0, Math.min(1, g.v + delta));
            videoRef.current.volume = next;
            videoRef.current.muted = false;
            setGestureHint("♫ 音量 " + Math.round(next * 100) + "%");
          }
        }}
        onPointerUp={(e) => {
          const g = touchStart.current;
          touchStart.current = null;
          setGestureHint("");
          if (g && !g.changed) handleStageTap();
        }}
        onPointerCancel={() => { touchStart.current = null; setGestureHint(""); }}
        onClick={(e) => { if ((e.nativeEvent as PointerEvent).pointerType === "mouse") handleStageTap(); }}
        className="absolute inset-0 z-30 h-full w-full cursor-default bg-transparent"
        style={{ touchAction: "none" }}
      />}
      {gestureHint && <div aria-live="polite" className="pointer-events-none absolute left-1/2 top-1/2 z-[45] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/75 px-4 py-2 text-sm font-semibold text-white">{gestureHint}</div>}

      {isHtmlVideo && <div data-player-control aria-hidden={!controlsVisible} className={["absolute bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-2 pt-8 text-white transition-opacity duration-200", !controlsVisible ? "pointer-events-none opacity-0" : "opacity-100"].join(" ")}>
        <div
          ref={seekTrackRef}
          role="slider"
          tabIndex={0}
          aria-label="视频进度（拖动跳转）"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, duration)}
          aria-valuenow={Math.min(seekPreview ?? currentTime, Math.max(0, duration))}
          aria-valuetext={fmt(seekPreview ?? currentTime) + " / " + fmt(duration)}
          className="group/seek relative mb-2 flex h-9 w-full cursor-pointer touch-none select-none items-center outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          onPointerDown={(e) => {
            if (e.pointerType === "touch") return; // Touch events have a dedicated mobile drag path.
            if (duration <= 0) return;
            seekingRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            seekAt(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (e.pointerType !== "touch" && seekingRef.current) seekAt(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            if (e.pointerType !== "touch" && seekingRef.current) seekAt(e.clientX, e.clientY);
            seekingRef.current = false;
            setSeekPreview(null);
          }}
          onPointerCancel={() => { seekingRef.current = false; setSeekPreview(null); }}
          onTouchStart={(e) => {
            if (e.cancelable) e.preventDefault();
            const touch = e.touches[0];
            if (!touch) return;
            seekingRef.current = true;
            setControlsVisible(true);
            seekAt(touch.clientX, touch.clientY);
          }}
          onTouchMove={(e) => {
            if (e.cancelable) e.preventDefault();
            const touch = e.touches[0];
            if (seekingRef.current && touch) seekAt(touch.clientX, touch.clientY);
          }}
          onTouchEnd={(e) => {
            if (e.cancelable) e.preventDefault();
            const touch = e.changedTouches[0];
            if (seekingRef.current && touch) seekAt(touch.clientX, touch.clientY);
            seekingRef.current = false;
            setSeekPreview(null);
          }}
          onTouchCancel={() => { seekingRef.current = false; setSeekPreview(null); }}
          onKeyDown={(e) => {
            if (!videoRef.current || !Number.isFinite(duration) || duration <= 0) return;
            const delta = e.key === "ArrowRight" ? 5 : e.key === "ArrowLeft" ? -5 : 0;
            if (delta) {
              e.preventDefault();
              const time = Math.max(0, Math.min(duration, videoRef.current.currentTime + delta));
              videoRef.current.currentTime = time;
              setCurrentTime(time);
            }
          }}
        >
          <div className="relative h-1.5 w-full rounded-full bg-white/40 transition-[height] group-hover/seek:h-2.5">
            <div className="absolute inset-y-0 left-0 rounded-full bg-amber-400" style={{ width: (duration > 0 ? Math.min(100, 100 * (seekPreview ?? currentTime) / duration) : 0) + "%" }} />
            <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300 shadow" style={{ left: (duration > 0 ? Math.min(100, 100 * (seekPreview ?? currentTime) / duration) : 0) + "%" }} />
          </div>
        </div>
        {seekPreview !== null && <div className="mb-1 text-center text-xs text-amber-300">跳转至 {fmt(seekPreview)}</div>}
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
      {fauxFullscreen && <div data-player-control aria-hidden={!controlsVisible} className={["absolute right-3 top-3 z-[70] flex flex-col items-end gap-2 transition-opacity duration-200", controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"].join(" ")}>
        <button type="button" onClick={() => void leaveCinema()} className="rounded-lg border border-white/50 bg-black/85 px-4 py-2 text-sm font-bold text-white shadow-lg" aria-label="退出横屏返回放映室"><Minimize className="mr-1 inline size-4"/>退出横屏</button>
        {orientationNote && <span role="status" className="max-w-64 rounded-md bg-black/75 px-3 py-1.5 text-xs text-white">{orientationNote}</span>}
      </div>}

    </div>
  );
  return fauxFullscreen ? createPortal(stage, document.body) : stage;
}
