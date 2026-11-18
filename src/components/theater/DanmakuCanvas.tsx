import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { getClock } from "@/lib/clock";
import { layoutDanmaku, visibleAt } from "@/lib/danmaku-engine";

const FONT_FAMILY = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';

export function DanmakuCanvas() {
  const danmaku = useApp((s) => s.danmaku);
  const display = useApp((s) => s.settings.display);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = canvasRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const font = `700 ${display.fontSize}px ${FONT_FAMILY}`;
  const lineHeight = Math.round(display.fontSize * 1.35);

  const placed = useMemo(() => {
    if (typeof document === "undefined" || size.w === 0) return [];
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return [];
    ctx.font = font;
    const items = display.showViewer ? danmaku.map((d) => ({ ...d, text: `${d.viewer}：${d.text}` })) : danmaku;
    return layoutDanmaku(items, {
      containerWidth: size.w,
      laneCount: Math.max(1, Math.floor((size.h * display.area - 8) / lineHeight)),
      crossSeconds: display.crossSeconds,
      gap: display.fontSize,
      displayDensity: display.displayDensity,
      measure: (t) => ctx.measureText(t).width + 4,
    });
  }, [danmaku, size.w, size.h, font, lineHeight, display.area, display.crossSeconds, display.displayDensity, display.showViewer, display.fontSize]);

  const maxWidth = useMemo(() => placed.reduce((m, p) => Math.max(m, p.width), 0), [placed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0) return;
    // Keep mobile output sharp enough without multiplying full-screen GPU work.
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    let raf = 0;
    let lastTime = NaN;
    let lastDrawAt = -Infinity;
    let smoothTime = NaN;
    let smoothFrameAt = NaN;
    let wasPaused = true;
    const glyphCache = new Map<string, HTMLCanvasElement>();
    const cacheMax = 80;
    const cachePixelBudget = 3_000_000; // ~12MB RGBA, bounded on Android
    let cachedPixels = 0;
    const glyphHeight = Math.max(lineHeight + 6, Math.ceil(display.fontSize * 1.6) + 4);

    // Stroke/fill each caption ONCE into a small bitmap, then move that bitmap
    // using drawImage. This avoids expensive per-frame Chinese text rasterization.
    const glyph = (item: (typeof placed)[number]): HTMLCanvasElement | null => {
      const key = item.color + "\\0" + item.text;
      const cached = glyphCache.get(key);
      if (cached) {
        glyphCache.delete(key);
        glyphCache.set(key, cached);
        return cached;
      }
      const bitmap = document.createElement("canvas");
      const logicalWidth = Math.ceil(item.width + 8);
      // Avoid enormous allocations for malformed, extremely long comments.
      if(logicalWidth <= 0 || logicalWidth > 4096)return null;
      bitmap.width = Math.ceil(logicalWidth * dpr);
      bitmap.height = Math.ceil(glyphHeight * dpr);
      const pen = bitmap.getContext("2d");
      if (!pen) return null;
      pen.setTransform(dpr, 0, 0, dpr, 0, 0);
      pen.font = font;
      pen.textBaseline = "top";
      pen.lineJoin = "round";
      pen.lineWidth = Math.max(2, display.fontSize / 8);
      pen.strokeStyle = "rgba(0,0,0,0.8)";
      pen.strokeText(item.text, 4, 3);
      pen.fillStyle = item.color;
      pen.fillText(item.text, 4, 3);
      const pixels = bitmap.width * bitmap.height;
      if (pixels > cachePixelBudget / 2) return bitmap;
      glyphCache.set(key,bitmap);
      cachedPixels += pixels;
      while (glyphCache.size > cacheMax || cachedPixels > cachePixelBudget) {
        const oldest = glyphCache.keys().next().value;
        if (!oldest) break;
        const evicted = glyphCache.get(oldest)!;
        cachedPixels -= evicted.width * evicted.height;
        glyphCache.delete(oldest);
        evicted.width = 0;
        evicted.height = 0;
      }
      return bitmap;
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const clock = getClock();
      if (!display.enabled || !clock) {
        if(!Number.isNaN(lastTime)) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, size.w, size.h);
          lastTime = NaN;
        }
        return;
      }
      const observed = clock.getTime() - (display.timeOffset ?? 0);
      const paused = clock.isPaused();
      const rate = Math.max(0, Math.min(4, clock.getRate() || 1));
      // Android media currentTime can advance in coarse jumps even when the
      // compositor is rendering at 60Hz. Predict between those readings and
      // gently correct drift; immediately snap on seeks, stalls and resumes.
      if (!Number.isFinite(smoothTime) || !Number.isFinite(smoothFrameAt) || paused !== wasPaused ||
          Math.abs(observed - smoothTime) > 0.35 ||
          now - smoothFrameAt > 300) {
        smoothTime = observed;
      } else if (!paused) {
        const elapsed = Math.max(0, Math.min(0.08, (now - smoothFrameAt) / 1000));
        const predicted = smoothTime + elapsed * rate;
        const error = observed - predicted;
        smoothTime = predicted + Math.max(-0.015, Math.min(0.015, error * 0.08));
      } else {
        smoothTime = observed;
      }
      smoothFrameAt = now;
      wasPaused = paused;
      const t = smoothTime;
      if (Math.abs(t - lastTime) < 0.002) return;
      // Target ~60fps without tying movement to the cadence of currentTime updates.
      if (now - lastDrawAt < 15) return;
      lastDrawAt = now;
      lastTime = t;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      ctx.globalAlpha = display.opacity;
      ctx.imageSmoothingEnabled = false; // Avoid soft resampling of cached text glyphs
      for (const { item, x } of visibleAt(placed, t, size.w, display.crossSeconds, maxWidth)) {
        const y = 4 + item.lane * lineHeight;
        const bitmap = glyph(item);
        if(bitmap) {
          const sharpX = Math.round((x - 4) * dpr) / dpr;
          const sharpY = Math.round((y - 3) * dpr) / dpr;
          ctx.drawImage(bitmap, sharpX, sharpY, bitmap.width / dpr, bitmap.height / dpr);
        }
        else {
          ctx.font = font;
          ctx.textBaseline = "top";
          ctx.lineJoin = "round";
          ctx.lineWidth = Math.max(2, display.fontSize / 8);
          ctx.strokeStyle = "rgba(0,0,0,0.8)";
          ctx.strokeText(item.text,x,y);
          ctx.fillStyle=item.color;
          ctx.fillText(item.text,x,y);
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      glyphCache.forEach(bitmap => {bitmap.width = 0; bitmap.height = 0;});
      glyphCache.clear();
    };
  }, [placed, maxWidth, size.w, size.h, font, lineHeight, display.enabled, display.opacity, display.crossSeconds, display.fontSize, display.timeOffset]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}
