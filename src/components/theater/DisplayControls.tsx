import { Maximize, SlidersHorizontal } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RangeField } from "@/components/form-bits";
import { useApp } from "@/lib/store";
import { toggleFullscreen } from "@/lib/clock";

const AREAS = [
  { v: 0.25, label: "1/4" },
  { v: 0.5, label: "半屏" },
  { v: 0.75, label: "3/4" },
  { v: 1, label: "全屏" },
];

export function DisplayControls() {
  const d = useApp((s) => s.settings.display);
  const update = useApp((s) => s.update);
  const count = useApp((s) => s.danmaku.length);
  return (
    <div className="flex flex-wrap items-center gap-3 px-1 text-sm">
      <label className="flex items-center gap-2">
        <Switch checked={d.enabled} onCheckedChange={(enabled) => update("display", { enabled })} aria-label="弹幕开关" />
        <span>弹幕 {d.enabled ? "开" : "关"}</span>
      </label>
      <span className="text-xs text-muted-foreground">{count} 条</span>
      <div className="ml-auto flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="secondary">
              <SlidersHorizontal /> 显示设置
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-4">
            <RangeField
              label="滚动速度（穿屏秒数，越小越快）"
              value={d.crossSeconds}
              min={4}
              max={16}
              step={0.5}
              format={(v) => `${v}s`}
              onChange={(crossSeconds) => update("display", { crossSeconds })}
            />
            <RangeField label="字号" value={d.fontSize} min={14} max={44} format={(v) => `${v}px`} onChange={(fontSize) => update("display", { fontSize })} />
            <RangeField
              label="不透明度"
              value={d.opacity}
              min={0.2}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(opacity) => update("display", { opacity })}
            />
            <RangeField
              label="显示密度"
              value={d.displayDensity}
              min={0.1}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(displayDensity) => update("display", { displayDensity })}
              hint="只影响屏幕上显示多少，不删除数据。"
            />
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">显示区域</span>
              <div className="grid grid-cols-4 gap-1">
                {AREAS.map((a) => (
                  <Button key={a.v} size="sm" variant={d.area === a.v ? "default" : "secondary"} onClick={() => update("display", { area: a.v })}>
                    {a.label}
                  </Button>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between text-xs text-muted-foreground">
              显示观众名
              <Switch checked={d.showViewer} onCheckedChange={(showViewer) => update("display", { showViewer })} />
            </label>
          </PopoverContent>
        </Popover>
        <Button size="sm" variant="secondary" onClick={() => void toggleFullscreen()}>
          <Maximize /> 全屏
        </Button>
      </div>
    </div>
  );
}
