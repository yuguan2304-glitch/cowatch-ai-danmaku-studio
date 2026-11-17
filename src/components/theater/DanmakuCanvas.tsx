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
    if (!canvas || size.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      const clock = getClock();
      if (!display.enabled || !clock) return;
      const t = clock.getTime();
      ctx.font = font;
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, display.fontSize / 8);
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.globalAlpha = display.opacity;
      for (const { item, x } of visibleAt(placed, t, size.w, display.crossSeconds, maxWidth)) {
        const y = 4 + item.lane * lineHeight;
        ctx.strokeText(item.text, x, y);
        ctx.fillStyle = item.color;
        ctx.fillText(item.text, x, y);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [placed, maxWidth, size.w, size.h, font, lineHeight, display.enabled, display.opacity, display.crossSeconds, display.fontSize]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}
