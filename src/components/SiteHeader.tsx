import { Link } from "@tanstack/react-router";
import { Clapperboard, Info, Share2 } from "lucide-react";
import { AppUpdateButton } from "@/components/AppUpdateButton";
import { toast } from "sonner";
import { openWelcome } from "@/components/WelcomeDialog";

const NAV = [{ to: "/", label: "放映室" }] as const;

async function shareSite() {
  // Only the bare site address — never settings, keys or history.
  const url = window.location.origin + "/";
  const data = { title: "共映 CoWatch｜AI弹幕放映室", text: "用自己的 AI 接口给视频加上模拟弹幕的观影工具", url };
  if (navigator.share) {
    try {
      await navigator.share(data);
      return;
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("网站链接已复制");
  } catch {
    window.prompt("复制网站链接：", url);
  }
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-3 sm:gap-4 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-marquee text-primary-foreground shadow-glow">
            <Clapperboard className="size-4" />
          </span>
          <span className="leading-none">
            <span className="font-display text-lg font-bold text-marquee">共映</span>
            <span className="ml-1.5 hidden text-xs tracking-[0.2em] text-muted-foreground md:inline">COWATCH · AI弹幕放映室</span>
          </span>
        </Link>
        <nav className="ml-auto flex items-center gap-0.5 text-sm">
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
          <AppUpdateButton/>
          <button type="button" onClick={openWelcome} className="flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1.5 text-muted-foreground hover:text-foreground" aria-label="使用须知">
            <Info className="size-4" />
            <span className="hidden sm:inline">须知</span>
          </button>
          <button type="button" onClick={() => void shareSite()} className="flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1.5 text-muted-foreground hover:text-foreground" aria-label="分享网站链接">
            <Share2 className="size-4" />
            <span className="hidden sm:inline">分享</span>
          </button>
        </nav>
      </div>
      <div className="marquee-dots h-1.5" aria-hidden />
    </header>
  );
}
