/** Translation-only local preferences. No video, subtitles or provider API keys are exported. */
const PREFS_KEY = "cowatch:translation-config:v1";
const SECRET_KEY = "cowatch:translation-secret:v1";
const TRANSCRIBE_KEY = "cowatch:transcription-remember:v1";
const TRANSCRIBE_SECRET = "cowatch:transcription-secret:v1";

export type TranslationPrefs = {
  service: "shared" | "custom" | "google";
  url: string;
  model: string;
  target: string;
  glossary: string;
  rememberSecret: boolean;
};
export type TranscriptionPrefs = {
  address: string;
  model: string;
  useMainKey: boolean;
  rememberSecret: boolean;
};

const read = (key: string): unknown => {
  try { return JSON.parse(localStorage.getItem(key) || "null"); }
  catch { return null; }
};
export function loadTranslationPrefs(): TranslationPrefs | null {
  const v = read(PREFS_KEY);
  if (!v || typeof v !== "object") return null;
  const p = v as Partial<TranslationPrefs>;
  if (!["shared","custom","google"].includes(p.service || "")) return null;
  return {
    service: p.service!,
    url: typeof p.url === "string" ? p.url : "https://api.openai.com/v1",
    model: typeof p.model === "string" ? p.model : "gpt-4o-mini",
    target: typeof p.target === "string" ? p.target : "简体中文",
    glossary: typeof p.glossary === "string" ? p.glossary : "",
    rememberSecret: p.rememberSecret === true,
  };
}
export function saveTranslationPrefs(p: TranslationPrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* privacy mode */ }
}
export function getRememberedTranslationKey(): string {
  try { return loadTranslationPrefs()?.rememberSecret ? localStorage.getItem(SECRET_KEY) || "" : ""; }
  catch { return ""; }
}
export function saveTranslationKey(key: string, remember: boolean): void {
  try { if (remember && key) localStorage.setItem(SECRET_KEY, key); else localStorage.removeItem(SECRET_KEY); }
  catch { /* privacy mode */ }
}
export function loadTranscriptionPrefs(): TranscriptionPrefs | null {
  const v = read(TRANSCRIBE_KEY);
  if (!v || typeof v !== "object") return null;
  const p = v as Partial<TranscriptionPrefs>;
  if (typeof p.address !== "string" || typeof p.model !== "string") return null;
  return {
    address: p.address, model: p.model,
    useMainKey: p.useMainKey === true,
    rememberSecret: p.rememberSecret === true,
  };
}
export function saveTranscriptionPrefs(p: TranscriptionPrefs): void {
  try { localStorage.setItem(TRANSCRIBE_KEY, JSON.stringify(p)); } catch { /* privacy mode */ }
}
export function getRememberedTranscriptionKey(): string {
  try { return loadTranscriptionPrefs()?.rememberSecret ? localStorage.getItem(TRANSCRIBE_SECRET) || "" : ""; }
  catch { return ""; }
}
export function saveTranscriptionKey(key: string, remember: boolean): void {
  try { if (remember && key) localStorage.setItem(TRANSCRIBE_SECRET, key); else localStorage.removeItem(TRANSCRIBE_SECRET); }
  catch { /* privacy mode */ }
}
