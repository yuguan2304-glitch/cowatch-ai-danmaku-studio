import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { presetFromHash, type SharedPreset } from "@/lib/preset-share";
import { db } from "@/lib/db";
import { uid } from "@/lib/id";
import { useApp } from "@/lib/store";

const SEEN_KEY = "cowatch:welcome-seen:v1";

export function openWelcome() {
  window.dispatchEvent(new Event("cowatch:open-welcome"));
}

/** First-visit notice + confirm-before-apply for preset links (#preset=...). */
export function WelcomeDialog() {
  const [open, setOpen] = useState(false);
  const [incoming, setIncoming] = useState<SharedPreset | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) !== "yes") setOpen(true);
    } catch {
      setOpen(true);
    }
    const show = () => setOpen(true);
    window.addEventListener("cowatch:open-welcome", show);
    try {
      const p = presetFromHash(window.location.hash);
      if (p) setIncoming(p);
    } catch (e) {
      toast.error("预设链接无效：" + (e as Error).message);
    }
    return () => window.removeEventListener("cowatch:open-welcome", show);
  }, []);

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, "yes");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const clearHash = () => history.replaceState(null, "", window.location.pathname + window.location.search);

  return (
    <>
      <Dialog open={open && !incoming} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">欢迎来到共映 CoWatch</DialogTitle>
            <DialogDescription>一个面向所有兴趣圈层的 AI 弹幕观影工具：游戏实况、动漫、影视、综艺、纪录片、原创视频都可以。</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2.5 text-sm leading-relaxed">
            <li className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5">
              <b>弹幕是 AI 模拟的，不是真实网友评论。</b>屏幕上的「观众」都是虚拟角色，由你选择的 AI 根据画面和字幕生成，可能出错。
            </li>
            <li>🔑 <b>每个人用自己的 API 密钥。</b>本站没有共享账号，站主也不承担任何 AI 费用。密钥只放在当前页面内存里，刷新即清除，不会出现在链接或日志中。</li>
            <li>💻 <b>数据留在你的设备。</b>视频在浏览器本地播放，不上传本站；历史和观众预设存于本机。只有你主动生成时，选中的画面帧/字幕才会发给你指定的 AI 服务商。</li>
            <li>🎭 粉丝应援、磕 CP 等都只是可选模式；作品名、角色关系、圈内术语都由你自己填写。</li>
            <li>💡 ChatGPT Plus 等订阅不等于 API 额度；部分服务商不允许浏览器直接调用（跨域限制）。</li>
          </ul>
          <DialogFooter>
            <Button variant="marquee" onClick={close}>
              我知道了，开始观影
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!incoming}
        onOpenChange={(o) => {
          if (!o) {
            setIncoming(null);
            clearHash();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>导入分享的观众预设？</DialogTitle>
            <DialogDescription>
              有人分享了观众预设「{incoming?.name}」。它只包含观众身份、语气、自定义观众等设置，不含任何密钥或视频。确认后才会保存到本机。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setIncoming(null);
                clearHash();
              }}
            >
              忽略
            </Button>
            <Button
              variant="marquee"
              onClick={async () => {
                if (!incoming) return;
                await db.putPreset({ id: uid("p"), name: incoming.name, createdAt: Date.now(), audience: incoming.audience });
                const cur = useApp.getState().settings.audience;
                useApp.getState().update("audience", { ...incoming.audience, worldBook: cur.worldBook ?? "", worldBookEntries: cur.worldBookEntries ?? [] });
                window.dispatchEvent(new Event("cowatch:presets-changed"));
                toast.success(`已导入并应用「${incoming.name}」`);
                setIncoming(null);
                clearHash();
              }}
            >
              导入并应用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
