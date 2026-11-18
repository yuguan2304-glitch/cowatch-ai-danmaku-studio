import { useEffect, useState } from "react";
import { getClock } from "@/lib/clock";
import { useApp } from "@/lib/store";
import { useSubtitleDisplay } from "@/lib/subtitle-display";

export function SubtitleOverlay() {
  const cues = useApp(s => s.cues);
  const mode = useSubtitleDisplay(s => s.mode);
  const translated = useSubtitleDisplay(s => s.translated);
  const originalFontSize = useSubtitleDisplay(s => s.originalFontSize);
  const translatedFontSize = useSubtitleDisplay(s => s.translatedFontSize);
  const [time, setTime] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTime(getClock()?.getTime() ?? -1), 180);
    return () => window.clearInterval(timer);
  }, []);

  if (mode === "off" || !cues.length) return null;
  const index = cues.findIndex(c => c.start <= time && c.end > time);
  if (index < 0) return null;
  const cue = cues[index];
  if (!cue) return null;
  const translation = translated[index];
  const lines = mode === "original" ? [{text:cue.text,size:originalFontSize}] :
    mode === "translated" ? [{text:translation ?? cue.text,size:translation ? translatedFontSize : originalFontSize}] :
    [{text:cue.text,size:originalFontSize}, ...(translation && translation !== cue.text ? [{text:translation,size:translatedFontSize}] : [])];

  return <div className="pointer-events-none absolute bottom-[12%] left-2 right-2 z-20 flex flex-col items-center gap-1 text-center sm:bottom-[8%]" aria-live="off">
    {lines.map((line, i) => <div key={i} style={{fontSize:line.size+"px"}} className="max-w-[94%] rounded bg-black/75 px-2 py-1 font-semibold leading-snug text-white [text-shadow:0_1px_2px_#000]">{line.text}</div>)}
  </div>;
}
