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
  // Player handles native fullscreen + mobile landscape fallback.
  // A custom event keeps both control-bar and in-video buttons in sync.
  stageRef.current?.dispatchEvent(new Event("cowatch:toggle-fullscreen"));
}
