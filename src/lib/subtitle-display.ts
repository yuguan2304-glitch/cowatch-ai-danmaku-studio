import { create } from "zustand";

export type SubtitleDisplayMode = "off" | "original" | "translated" | "both";
type SubtitleDisplayState = {
  mode: SubtitleDisplayMode;
  translated: Record<number, string>;
  setMode(mode: SubtitleDisplayMode): void;
  setTranslated(translated: Record<number, string>): void;
  mergeTranslated(translated: Record<number, string>): void;
};

export const useSubtitleDisplay = create<SubtitleDisplayState>((set) => ({
  mode: "both",
  translated: {},
  setMode: (mode) => set({ mode }),
  setTranslated: (translated) => set({ translated }),
  mergeTranslated: (translated) => set((state) => ({ translated: { ...state.translated, ...translated } })),
}));
