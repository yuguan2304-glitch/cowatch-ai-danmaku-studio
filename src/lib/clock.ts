export type PlayerClock = {
  getTime(): number;
  isPaused(): boolean;
  getRate(): number;
  getDuration(): number;
  seek(t: number): void;
};

let current: PlayerClock | null = null;

export function setClock(c: PlayerClock | null) {
  current = c;
}

export function getClock(): PlayerClock | null {
  return current;
}

/** The element that goes fullscreen (video + danmaku overlay together). */
export const stageRef: { current: HTMLDivElement | null } = { current: null };

export async function toggleFullscreen() {
  const el = stageRef.current;
  if (!el) return;
  if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => undefined);
    return;
  }
  if (el.requestFullscreen) {
    await el.requestFullscreen().catch(() => undefined);
    return;
  }
  // iOS Safari: only the <video> itself can go fullscreen (danmaku overlay is lost there).
  const v = el.querySelector("video") as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
  v?.webkitEnterFullscreen?.();
}
