import React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import { Index } from "@/routes/index";
import { useBootstrapSettings } from "@/lib/use-bootstrap";
import "@/styles.css";

function App() {
  useBootstrapSettings();
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-background/90 px-4 py-3">
        <a className="font-display text-xl font-bold text-primary" href="/">
          🎬 共映 <span className="text-xs text-muted-foreground">CoWatch · AI弹幕放映室</span>
        </a>
      </header>
      <Index />
      <Toaster position="top-center" richColors />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
