import React from "react";
import { Settings2 } from "lucide-react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import { Index } from "@/routes/index";
import { useBootstrapSettings } from "@/lib/use-bootstrap";
import "@/styles.css";

function App() {
  useBootstrapSettings();
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-background/90 px-3 py-3 sm:px-4">
        <a className="min-w-0 font-display text-lg font-bold text-primary sm:text-xl" href="/">
          🎬 共映 <span className="hidden text-xs text-muted-foreground sm:inline">CoWatch · AI弹幕放映室</span>
        </a>
        <button type="button" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary/80" onClick={() => window.dispatchEvent(new Event("cowatch:open-settings"))} aria-label="打开设置侧栏"><Settings2 className="size-4"/> 设置</button>
      </header>
      <Index />
      <Toaster position="top-center" richColors />
    </div>
  );
}

// Register only in production; the service worker caches application files,
// never user's videos, API requests or third-party resources.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
