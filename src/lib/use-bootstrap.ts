import { useEffect } from "react";
import { useApp, rememberedProviderAddresses, syncRememberedProviderAddresses, needsOldCredentialMigration } from "./store";
import { db } from "./db";
import { defaultSettings } from "./constants";
import type { Settings } from "./types";

function merge(saved: Partial<Settings> | undefined): Settings {
  const d = defaultSettings();
  const addresses = rememberedProviderAddresses();
  if (!saved) return {...d,provider:{...d.provider,...addresses}};
  // Users asked to initialize all previous API choices, not only hide them.
  const provider = needsOldCredentialMigration() ? d.provider : { ...d.provider, ...saved.provider, baseUrl: addresses.baseUrl ?? d.provider.baseUrl, transcribeBaseUrl: addresses.transcribeBaseUrl ?? d.provider.transcribeBaseUrl };
  return {
    provider,
    analysis: { ...d.analysis, ...saved.analysis },
    generation: { ...d.generation, ...saved.generation },
    audience: { ...d.audience, ...saved.audience },
    display: { ...d.display, ...saved.display },
  };
}

/** Load non-secret settings from IndexedDB once, then save changes (debounced). */
export function useBootstrapSettings() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    db.loadSettings()
      .catch(() => undefined)
      .then((saved) => {
        if (cancelled) return;
        useApp.getState().setSettings(merge(saved));
        // Sanitize legacy saved history without discarding videos, danmaku or settings.
        if (needsOldCredentialMigration()) {
          void db.listHistory().then(rows => Promise.all(rows.map(row => db.putHistory({ ...row, settings: { ...row.settings, provider: defaultSettings().provider } })))).then(() => undefined).catch(() => undefined);
        }
        const initial = useApp.getState().settings;
        const defaults = defaultSettings().provider;
        void db.saveSettings({ ...initial, provider: { ...initial.provider, baseUrl: defaults.baseUrl, transcribeBaseUrl: defaults.transcribeBaseUrl } }).catch(() => undefined);
        unsub = useApp.subscribe((st, prev) => {
          if (st.settings === prev.settings) return;
          clearTimeout(timer);
          syncRememberedProviderAddresses();
          timer = setTimeout(() => {
            const defaults = defaultSettings().provider;
            const safeSettings: Settings = {...st.settings, provider: {...st.settings.provider, baseUrl: defaults.baseUrl, transcribeBaseUrl: defaults.transcribeBaseUrl}};
            void db.saveSettings(safeSettings).catch(() => undefined);
          }, 400);
        });
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsub?.();
    };
  }, []);
}
