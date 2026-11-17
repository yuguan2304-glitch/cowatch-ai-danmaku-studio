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
