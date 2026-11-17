import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Section({
  title,
  icon,
  badge,
  defaultOpen,
  children,
}: {
  title: string;
  icon?: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="panel group overflow-hidden" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
        <span className="text-primary">{icon}</span>
        <span className="flex-1">{title}</span>
        {badge}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground">{format ? format(value) : value}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} aria-label={label} />
      {hint && <p className="text-xs text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-secondary/60 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-xs leading-relaxed",
        tone === "info" && "border-border bg-muted/60 text-muted-foreground",
        tone === "warn" && "border-warning/40 bg-warning/10 text-warning",
        tone === "error" && "border-destructive/50 bg-destructive/10 text-destructive",
      )}
    >
      {children}
    </div>
  );
}
