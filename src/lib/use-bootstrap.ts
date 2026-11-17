import { useEffect } from "react";
import { useApp, rememberedProviderAddresses, syncRememberedProviderAddresses } from "./store";
import { db } from "./db";
import { defaultSettings } from "./constants";
import type { Settings } from "./types";

function merge(saved: Partial<Settings> | undefined): Settings {
  const d = defaultSettings();
  const addresses = rememberedProviderAddresses();
  if (!saved) return {...d,provider:{...d.provider,...addresses}};
  return {
    provider: { ...d.provider, ...saved.provider, baseUrl: addresses.baseUrl ?? d.provider.baseUrl, transcribeBaseUrl: addresses.transcribeBaseUrl ?? d.provider.transcribeBaseUrl },
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
