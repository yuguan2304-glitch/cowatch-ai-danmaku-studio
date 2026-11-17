export class CorsTaintedError extends Error {
  constructor() {
    super("该视频源未允许跨域读取 (CORS)，浏览器禁止抽帧。请下载后以本地文件打开，或导入字幕。");
  }
}

/** Seeks a hidden <video> to timestamps and captures JPEG frames on a canvas. */
export class FrameExtractor {
  private video: HTMLVideoElement;
  private canvas = document.createElement("canvas");
  private ready: Promise<void>;

  constructor(src: string, crossOrigin: boolean) {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.playsInline = true;
    if (crossOrigin) v.crossOrigin = "anonymous";
    v.src = src;
    this.video = v;
    this.ready = new Promise((resolve, reject) => {
      v.addEventListener("loadeddata", () => resolve(), { once: true });
      v.addEventListener("error", () => reject(new Error("抽帧用视频加载失败")), { once: true });
    });
  }

  private seek(t: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const v = this.video;
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`跳转到 ${t.toFixed(1)}s 超时`));
      }, 15000);
      const onSeeked = () => {
        cleanup();
        resolve();
      };
      const onAbort = () => {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      };
      const cleanup = () => {
        clearTimeout(timer);
        v.removeEventListener("seeked", onSeeked);
        signal?.removeEventListener("abort", onAbort);
      };
      v.addEventListener("seeked", onSeeked);
      signal?.addEventListener("abort", onAbort);
      v.currentTime = Math.min(Math.max(0, t), Math.max(0, (v.duration || t) - 0.05));
    });
  }

  async capture(times: number[], maxWidth: number, quality: number, signal?: AbortSignal) {
    await this.ready;
    const v = this.video;
    const scale = Math.min(1, maxWidth / (v.videoWidth || maxWidth));
    this.canvas.width = Math.max(16, Math.round((v.videoWidth || 640) * scale));
    this.canvas.height = Math.max(16, Math.round((v.videoHeight || 360) * scale));
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持 Canvas");
    const out: { time: number; dataUrl: string; visualChange?: number }[] = [];
    // Tiny local-only image comparison; no extra images sent to the model.
    const probe = document.createElement("canvas");
    probe.width = 32;
    probe.height = 18;
    const probeCtx = probe.getContext("2d", { willReadFrequently: true });
    let previous: Uint8ClampedArray | null = null;
    for (const t of times) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      await this.seek(t, signal);
      ctx.drawImage(v, 0, 0, this.canvas.width, this.canvas.height);
      let dataUrl: string;
      try {
        dataUrl = this.canvas.toDataURL("image/jpeg", quality);
      } catch {
        throw new CorsTaintedError();
      }
      let visualChange: number | undefined;
      if (probeCtx) {
        probeCtx.drawImage(v, 0, 0, probe.width, probe.height);
        const pixels = probeCtx.getImageData(0, 0, probe.width, probe.height).data;
        if (previous) {
          let difference = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            difference += (Math.abs(pixels[i]! - previous[i]!) +
              Math.abs(pixels[i + 1]! - previous[i + 1]!) +
              Math.abs(pixels[i + 2]! - previous[i + 2]!)) / 3;
          }
          visualChange = Math.round(difference / (pixels.length / 4) / 255 * 100);
        }
        previous = new Uint8ClampedArray(pixels);
      }
      out.push({ time: t, dataUrl, ...(visualChange === undefined ? {} : { visualChange }) });
    }
    return out;
  }

  dispose() {
    this.video.removeAttribute("src");
    this.video.load();
  }
}

export function frameTimesFor(start: number, end: number, interval: number): number[] {
  const times: number[] = [];
  const step = Math.max(1, interval);
  for (let t = start + Math.min(step / 2, (end - start) / 2); t < end; t += step) {
    times.push(Math.round(t * 10) / 10);
  }
  if (times.length === 0) times.push(Math.round(((start + end) / 2) * 10) / 10);
  return times;
}
