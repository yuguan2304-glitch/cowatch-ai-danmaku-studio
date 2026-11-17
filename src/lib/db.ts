import type { HistorySession, SavedScreening, Settings, ViewerPreset } from "./types";

const DB_NAME = "cowatch";
const DB_VERSION = 2;
let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("此浏览器不支持 IndexedDB"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("history")) db.createObjectStore("history", { keyPath: "id" });
        if (!db.objectStoreNames.contains("presets")) db.createObjectStore("presets", { keyPath: "id" });
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv", { keyPath: "key" });
        if (!db.objectStoreNames.contains("screenings")) db.createObjectStore("screenings", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const db = {
  listScreenings: async () =>
    (await tx<SavedScreening[]>("screenings","readonly",(store)=>store.getAll())).sort((a,b)=>b.updatedAt-a.updatedAt),
  getScreening: (id:string)=>tx<SavedScreening|undefined>("screenings","readonly",(store)=>store.get(id)),
  putScreening: (item:SavedScreening)=>tx("screenings","readwrite",(store)=>store.put(item)),
  deleteScreening: (id:string)=>tx("screenings","readwrite",(store)=>store.delete(id)),
  listHistory: async () =>
    (await tx<HistorySession[]>("history", "readonly", (s) => s.getAll())).sort((a, b) => b.updatedAt - a.updatedAt),
  getHistory: (id: string) => tx<HistorySession | undefined>("history", "readonly", (s) => s.get(id)),
  putHistory: (h: HistorySession) => tx("history", "readwrite", (s) => s.put(h)),
  deleteHistory: (id: string) => tx("history", "readwrite", (s) => s.delete(id)),
  clearHistory: () => tx("history", "readwrite", (s) => s.clear()),

  listPresets: async () =>
    (await tx<ViewerPreset[]>("presets", "readonly", (s) => s.getAll())).sort((a, b) => b.createdAt - a.createdAt),
  putPreset: (p: ViewerPreset) => tx("presets", "readwrite", (s) => s.put(p)),
  deletePreset: (id: string) => tx("presets", "readwrite", (s) => s.delete(id)),

  /** Settings never include API keys — those stay in memory only. */
  loadSettings: async () => {
    const row = await tx<{ key: string; value: Settings } | undefined>("kv", "readonly", (s) => s.get("settings"));
    return row?.value;
  },
  saveSettings: (value: Settings) => tx("kv", "readwrite", (s) => s.put({ key: "settings", value })),
};
