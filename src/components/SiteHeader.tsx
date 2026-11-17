import { Link } from "@tanstack/react-router";
import { Clapperboard } from "lucide-react";

const NAV = [
  { to: "/", label: "放映室" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-marquee text-primary-foreground shadow-glow">
            <Clapperboard className="size-4" />
          </span>
          <span className="leading-none">
            <span className="font-display text-lg font-bold text-marquee">共映</span>
            <span className="ml-1.5 hidden text-xs tracking-[0.2em] text-muted-foreground sm:inline">COWATCH · AI弹幕放映室</span>
          </span>
        </Link>
        <nav className="ml-auto flex items-center gap-0.5 overflow-x-auto text-sm">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: true }}
              className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-primary"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="marquee-dots h-1.5" aria-hidden />
    </header>
  );
}
