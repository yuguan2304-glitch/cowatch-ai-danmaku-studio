import { create } from "zustand";
import { defaultSettings } from "./constants";
import { uid } from "./id";
import { db } from "./db";
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

/** Stable per-file subtitle backup, independent of which speech/translation model is selected. */
export function subtitleBackupKey(file:File):string {
  return "cowatch:subtitle-backup:v1:"+JSON.stringify([file.name,file.size,file.lastModified]);
}
export async function recoverLocalVideoCues(file:File):Promise<{cues:Cue[];label:string}|undefined> {
  return db.getLocalValue<{cues:Cue[];label:string}>(subtitleBackupKey(file));
}

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
  setCues: (cues, cueLabel) => {
    set({ cues, cueLabel });
    const source=useApp.getState().source;
    if(source.kind==="file" && source.file && cues.length) {
      // Never store video bytes or API keys. Save each new subtitle snapshot locally.
      void db.putLocalValue(subtitleBackupKey(source.file),{cues:[...cues],label:cueLabel}).catch(()=>
        useApp.getState().pushLog("warn","字幕本地备份失败；请检查设备空间并导出 SRT")
      );
    }
  },
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
 * Personal-device opt-in: users can choose to store the main API key in
 * this browser's localStorage. Default is off; never add it to sync, logs,
 * export files, URLs or remote databases. LocalStorage is NOT encrypted.
 * The old privacy reset uses a different v1 key and cannot delete this v3 opt-in.
 */
const SECRET_STORAGE = "cowatch:main-api-secret:v3";
const SAVE_SECRET = "cowatch:remember-main-api-secret:v3";
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

function rememberedSecrets(): {apiKey:string;rememberKey:boolean;rememberSecret:boolean} {
  if(typeof window==="undefined")return {apiKey:"",rememberKey:false,rememberSecret:false};
  try {
    // Legacy unconsented plaintext tokens are never restored.
    localStorage.removeItem("cowatch:remembered-api-key:v1");
    const enabled=localStorage.getItem(SAVE_SECRET)==="yes";
    if(!enabled)localStorage.removeItem(SECRET_STORAGE);
    const apiKey=enabled?(localStorage.getItem(SECRET_STORAGE)||""):"";
    return {apiKey,rememberKey:localStorage.getItem(REMEMBER_STORAGE)==="yes",rememberSecret:enabled};
  }catch{return {apiKey:"",rememberKey:false,rememberSecret:false};}
}
function persistSecret(apiKey:string,rememberSecret:boolean){
  if(typeof window==="undefined")return;
  try{
    if(rememberSecret&&apiKey.trim()){
      localStorage.setItem(SECRET_STORAGE,apiKey);
      localStorage.setItem(SAVE_SECRET,"yes");
    }else if(!rememberSecret){
      localStorage.removeItem(SECRET_STORAGE);
      localStorage.removeItem(SAVE_SECRET);
    }else{
      localStorage.removeItem(SECRET_STORAGE);
    }
  }catch{/* No persistence if browser storage is blocked. */}
}
function persistAddresses(remember:boolean) {
  if(typeof window==="undefined")return;
  try{
    if(remember)localStorage.setItem(REMEMBER_STORAGE,"yes");
    else{
      localStorage.removeItem(REMEMBER_STORAGE);
      localStorage.removeItem(ADDRESS_STORAGE);
    }
  }catch{}
}

type SecretState = {
  apiKey: string;
  transcribeKey: string;
  rememberKey: boolean;
  rememberSecret: boolean;
  setRememberSecret: (remember:boolean)=>void;
  setApiKey: (k: string) => void;
  setTranscribeKey: (k: string) => void;
  setRememberKey: (remember: boolean) => void;
  clearKeys: () => void;
};

export const useSecrets = create<SecretState>((set, get) => ({
  ...rememberedSecrets(),
  transcribeKey: "",
  setApiKey: (apiKey) => {
    persistSecret(apiKey,get().rememberSecret);
    set({apiKey});
  },
  setTranscribeKey: (transcribeKey) => set({transcribeKey}),
  setRememberKey: (rememberKey) => {
    persistAddresses(rememberKey);
    set({rememberKey});
    syncRememberedProviderAddresses();
  },
  setRememberSecret: (rememberSecret) => {
    persistSecret(get().apiKey,rememberSecret);
    set({rememberSecret});
  },
  clearKeys: () => {
    persistSecret("",false);
    persistAddresses(false);
    set({apiKey:"",transcribeKey:"",rememberKey:false,rememberSecret:false});
  },
}));
