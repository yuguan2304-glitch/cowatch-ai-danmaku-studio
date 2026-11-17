import { useEffect, useRef } from "react";
import { setClock } from "@/lib/clock";
import { useApp } from "@/lib/store";

type YTPlayer = {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getPlaybackRate(): number;
  seekTo(t: number, allow: boolean): void;
  destroy(): void;
};
type YTNamespace = { Player: new (el: HTMLElement, opts: unknown) => YTPlayer };

let ytPromise: Promise<YTNamespace> | null = null;
function loadYT(): Promise<YTNamespace> {
  const w = window as unknown as { YT?: YTNamespace & { loaded?: number }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (!ytPromise) {
    ytPromise = new Promise((resolve, reject) => {
      const prev = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(w.YT as YTNamespace);
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = () => {
        ytPromise = null;
        reject(new Error("YouTube 播放器脚本加载失败"));
      };
      document.head.appendChild(s);
    });
  }
  return ytPromise;
}

export function YouTubeEmbed({ id }: { id: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let player: YTPlayer | null = null;
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    const mount = document.createElement("div");
    hostRef.current?.appendChild(mount);
    loadYT()
      .then((YT) => {
        if (cancelled) return;
        let lastRaw = -1;
        let lastAt = 0;
        player = new YT.Player(mount, {
          videoId: id,
          width: "100%",
          height: "100%",
          playerVars: { playsinline: 1, rel: 0, fs: 0, modestbranding: 1 },
          events: {
            onReady: () => {
              const p = player!;
              setClock({
                getTime: () => {
                  const raw = p.getCurrentTime() || 0;
                  const now = performance.now();
                  if (raw !== lastRaw) {
                    lastRaw = raw;
                    lastAt = now;
                  }
                  return p.getPlayerState() === 1 ? raw + ((now - lastAt) / 1000) * (p.getPlaybackRate() || 1) : raw;
                },
                isPaused: () => p.getPlayerState() !== 1,
                getRate: () => p.getPlaybackRate() || 1,
                getDuration: () => p.getDuration() || 0,
                seek: (t) => p.seekTo(t, true),
              });
              poll = setInterval(() => {
                const d = p.getDuration();
                if (d > 0) {
                  useApp.getState().setDuration(d);
                  clearInterval(poll);
                }
              }, 500);
            },
            onError: (e: { data: number }) => {
              const msg =
                e.data === 101 || e.data === 150
                  ? "该视频的所有者禁止嵌入播放，请在 YouTube 观看或使用本地文件。"
                  : "YouTube 播放器错误（代码 " + e.data + "）。";
              useApp.getState().patchSource({ note: msg });
            },
          },
        });
      })
      .catch((e: Error) => useApp.getState().patchSource({ note: e.message }));
    return () => {
      cancelled = true;
      clearInterval(poll);
      setClock(null);
      player?.destroy();
      mount.remove();
    };
  }, [id]);

  return <div ref={hostRef} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />;
}
