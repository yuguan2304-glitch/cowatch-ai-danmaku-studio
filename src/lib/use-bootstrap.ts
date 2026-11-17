import { useEffect } from "react";
import { useApp } from "./store";
import { db } from "./db";
import { defaultSettings } from "./constants";
import type { Settings } from "./types";

function merge(saved: Partial<Settings> | undefined): Settings {
  const d = defaultSettings();
  if (!saved) return d;
  return {
    provider: { ...d.provider, ...saved.provider },
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
          timer = setTimeout(() => void db.saveSettings(st.settings).catch(() => undefined), 400);
        });
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsub?.();
    };
  }, []);
}
