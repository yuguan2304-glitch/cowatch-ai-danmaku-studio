import { create } from "zustand";
import { defaultSettings } from "./constants";
import { uid } from "./id";
import type { Cue, Danmaku, Segment, Settings, TheaterComment, VideoSource } from "./types";

// One-time privacy reset: previous remembered keys, endpoints and model selection
// must not reappear merely because users opened an older deployed version.
const PRIVACY_RESET_VERSION = "cowatch:privacy-reset:v2";
export function resetOldCredentialsOnce(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(PRIVACY_RESET_VERSION) === "done") return false;
    for (const key of ["cowatch:remembered-api-key:v1", "cowatch:remember-api-key:v1", "cowatch:remembered-provider-addresses:v1"]) localStorage.removeItem(key);
    localStorage.setItem(PRIVACY_RESET_VERSION, "done");
    return true;
  } catch { return false; }
}
// Run before Zustand initializes its API-key state.
const oldCredentialsResetThisLoad = resetOldCredentialsOnce();
export function needsOldCredentialMigration(): boolean { return oldCredentialsResetThisLoad; }

const emptySource: VideoSource = { kind: "none", src: "", label: "", crossOrigin: false, analyzable: false };

type AppState = {
  settings: Settings;
  settingsLoaded: boolean;
  source: VideoSource;
  duration: number;
  cues: Cue[];
  cueLabel: string;
  danmaku: Danmaku[];
  comments: TheaterComment[];
  savedScreeningId: string | null;
  demo: boolean;
  segments: Segment[];
  generating: boolean;
  log: { at: number; level: "info" | "warn" | "error"; text: string }[];
  sessionId: string;
  restoredLabel: string | null;

  setSettings: (s: Settings) => void;
  update: <K extends keyof Settings>(key: K, patch: Partial<Settings[K]>) => void;
  setSource: (s: VideoSource) => void;
  patchSource: (p: Partial<VideoSource>) => void;
  setDuration: (d: number) => void;
  setCues: (cues: Cue[], label: string) => void;
  setDanmaku: (d: Danmaku[], demo?: boolean) => void;
  setComments: (next: TheaterComment[] | ((prev: TheaterComment[]) => TheaterComment[])) => void;
  setSavedScreeningId: (id: string | null) => void;
  addDanmaku: (d: Danmaku[]) => void;
  updateDanmaku: (id: string, patch: Partial<Danmaku>) => void;
  removeDanmaku: (id: string) => void;
  removeRange: (start: number, end: number, inclusiveEnd: boolean) => void;
  setSegments: (s: Segment[]) => void;
  updateSegment: (index: number, patch: Partial<Segment>) => void;
  setGenerating: (g: boolean) => void;
  pushLog: (level: "info" | "warn" | "error", text: string) => void;
  clearLog: () => void;
  newSession: () => void;
  restore: (opts: { sessionId: string; danmaku: Danmaku[]; demo: boolean; label: string }) => void;
};

export const useApp = create<AppState>((set) => ({
  settings: defaultSettings(),
  settingsLoaded: false,
  source: emptySource,
  duration: 0,
  cues: [],
  cueLabel: "",
  danmaku: [],
  comments: [],
  savedScreeningId: null,
  demo: false,
  segments: [],
  generating: false,
  log: [],
  sessionId: uid("s"),
  restoredLabel: null,

  setSettings: (settings) => set({ settings, settingsLoaded: true }),
  update: (key, patch) =>
    set((st) => ({ settings: { ...st.settings, [key]: { ...st.settings[key], ...patch } } })),
  setSource: (source) =>
    set((st) => {
      const keep = st.restoredLabel !== null && st.restoredLabel === source.label;
      return {
        source,
        duration: 0,
        segments: [],
        danmaku: keep ? st.danmaku : [],
        comments: [],
        savedScreeningId: null,
        demo: keep ? st.demo : false,
        cues: keep ? st.cues : [],
        cueLabel: keep ? st.cueLabel : "",
        sessionId: keep ? st.sessionId : uid("s"),
        restoredLabel: null,
        log: [],
      };
    }),
  patchSource: (p) => set((st) => ({ source: { ...st.source, ...p } })),
  setDuration: (duration) => set({ duration }),
  setCues: (cues, cueLabel) => set({ cues, cueLabel }),
  setDanmaku: (danmaku, demo = false) => set({ danmaku: [...danmaku].sort((a, b) => a.time - b.time), demo }),
  setComments: (next) => set(st => ({ comments: typeof next === "function" ? next(st.comments) : next })),
  setSavedScreeningId: (savedScreeningId) => set({ savedScreeningId }),
  addDanmaku: (d) =>
    set((st) => ({ danmaku: [...st.danmaku, ...d].sort((a, b) => a.time - b.time), demo: false })),
  updateDanmaku: (id, patch) =>
    set((st) => ({
      danmaku: st.danmaku.map((d) => (d.id === id ? { ...d, ...patch } : d)).sort((a, b) => a.time - b.time),
    })),
  removeDanmaku: (id) => set((st) => ({ danmaku: st.danmaku.filter((d) => d.id !== id) })),
  removeRange: (start, end, inclusiveEnd) =>
    set((st) => ({
      danmaku: st.danmaku.filter((d) => !(d.time >= start && (inclusiveEnd ? d.time <= end : d.time < end))),
    })),
  setSegments: (segments) => set({ segments }),
  updateSegment: (index, patch) =>
    set((st) => ({ segments: st.segments.map((s) => (s.index === index ? { ...s, ...patch } : s)) })),
  setGenerating: (generating) => set({ generating }),
  pushLog: (level, text) => set((st) => ({ log: [...st.log.slice(-99), { at: Date.now(), level, text }] })),
  clearLog: () => set({ log: [] }),
  newSession: () => set({ sessionId: uid("s") }),
  restore: ({ sessionId, danmaku, demo, label }) =>
    set({ sessionId, danmaku, demo, restoredLabel: label, segments: [] }),
}));

/**
 * API keys live in session memory only — never localStorage, IndexedDB, links or logs.
 * The optional "remember" flag only keeps provider ADDRESSES (no key) on this device.
 */
const SECRET_STORAGE = "cowatch:remembered-api-key:v1";
const REMEMBER_STORAGE = "cowatch:remember-api-key:v1";
const ADDRESS_STORAGE = "cowatch:remembered-provider-addresses:v1";

export function rememberedProviderAddresses(): {baseUrl?: string; transcribeBaseUrl?: string} {
  if (typeof window === "undefined") return {};
  try {
    if (localStorage.getItem(REMEMBER_STORAGE) !== "yes") return {};
    const stored: unknown = JSON.parse(localStorage.getItem(ADDRESS_STORAGE) || "{}");
    if (!stored || typeof stored !== "object") return {};
    const value = stored as Record<string, unknown>;
    return {
      ...(typeof value["baseUrl"] === "string" ? {baseUrl:value["baseUrl"]} : {}),
      ...(typeof value["transcribeBaseUrl"] === "string" ? {transcribeBaseUrl:value["transcribeBaseUrl"]} : {}),
    };
  } catch { return {}; }
}

export function syncRememberedProviderAddresses() {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(REMEMBER_STORAGE) === "yes") {
      const { baseUrl, transcribeBaseUrl } = useApp.getState().settings.provider;
      localStorage.setItem(ADDRESS_STORAGE, JSON.stringify({baseUrl, transcribeBaseUrl}));
    } else localStorage.removeItem(ADDRESS_STORAGE);
  } catch { /* Storage unavailable; addresses remain session-only. */ }
}


function rememberedSecrets(): { apiKey: string; rememberKey: boolean } {
  if (typeof window === "undefined") return { apiKey: "", rememberKey: false };
  try {
    // Older versions could persist the key; wipe it so keys stay session-only.
    localStorage.removeItem(SECRET_STORAGE);
    return { rememberKey: localStorage.getItem(REMEMBER_STORAGE) === "yes", apiKey: "" };
  } catch { return { apiKey: "", rememberKey: false }; }
}
function persistSecret(_key: string, remember: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SECRET_STORAGE);
    if (remember) {
      localStorage.setItem(REMEMBER_STORAGE, "yes");
    } else {
      localStorage.removeItem(REMEMBER_STORAGE);
      localStorage.removeItem(SECRET_STORAGE);
      localStorage.removeItem(ADDRESS_STORAGE);
    }
  } catch { /* Storage may be unavailable. The in-memory key still works. */ }
}

type SecretState = {
  apiKey: string;
  transcribeKey: string;
  rememberKey: boolean;
  setApiKey: (k: string) => void;
  setTranscribeKey: (k: string) => void;
  setRememberKey: (remember: boolean) => void;
  clearKeys: () => void;
};

export const useSecrets = create<SecretState>((set, get) => ({
  ...rememberedSecrets(),
  transcribeKey: "",
  setApiKey: (apiKey) => {
    persistSecret(apiKey, get().rememberKey);
    set({ apiKey });
  },
  setTranscribeKey: (transcribeKey) => set({ transcribeKey }),
  setRememberKey: (rememberKey) => {
    persistSecret(get().apiKey, rememberKey);
    syncRememberedProviderAddresses();
    set({ rememberKey });
  },
  clearKeys: () => {
    persistSecret("", false);
    set({ apiKey: "", transcribeKey: "", rememberKey: false });
  },
}));
