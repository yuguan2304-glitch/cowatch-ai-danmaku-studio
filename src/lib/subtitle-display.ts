import { create } from "zustand";

export type SubtitleDisplayMode = "off" | "original" | "translated" | "both";
type SubtitleDisplayState = {
  mode: SubtitleDisplayMode;
  translated: Record<number, string>;
  originalFontSize: number;
  translatedFontSize: number;
  setOriginalFontSize(size: number): void;
  setTranslatedFontSize(size: number): void;
  setMode(mode: SubtitleDisplayMode): void;
  setTranslated(translated: Record<number, string>): void;
  mergeTranslated(translated: Record<number, string>): void;
  removeTranslated(indices: number[]): void;
};

const readSize=(name:string,defaultSize:number)=>{
  try { const number=Number(localStorage.getItem(name)); return Number.isFinite(number)&&number>=10&&number<=32?number:defaultSize; }
  catch { return defaultSize; }
};
const clampSize=(size:number)=>Math.round(Math.max(10,Math.min(32,size)));

export const useSubtitleDisplay = create<SubtitleDisplayState>((set) => ({
  mode: "both",
  translated: {},
  originalFontSize: readSize("cowatch:subtitle-original-size:v1",16),
  translatedFontSize: readSize("cowatch:subtitle-translated-size:v1",14),
  setOriginalFontSize:(size)=>{const next=clampSize(size);try{localStorage.setItem("cowatch:subtitle-original-size:v1",String(next));}catch{}set({originalFontSize:next});},
  setTranslatedFontSize:(size)=>{const next=clampSize(size);try{localStorage.setItem("cowatch:subtitle-translated-size:v1",String(next));}catch{}set({translatedFontSize:next});},
  setMode: (mode) => set({ mode }),
  setTranslated: (translated) => set({ translated }),
  mergeTranslated: (translated) => set((state) => ({ translated: { ...state.translated, ...translated } })),
  removeTranslated: (indices) => set((state) => ({translated: Object.fromEntries(Object.entries(state.translated).filter(([k])=>!indices.includes(Number(k))))})),
}));
