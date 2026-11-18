import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Share2, Download, Upload, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/lib/store";
import { db } from "@/lib/db";
import { uid } from "@/lib/id";
import { SCENE_PRESETS, applyScenePreset } from "@/lib/scene-presets";
import { buildSharedPreset, parseSharedPreset, presetShareLink, sanitizeAudience } from "@/lib/preset-share";
import { downloadText } from "@/lib/export";
import type { CustomViewer, ViewerPreset } from "@/lib/types";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt("复制下面的链接：", text);
    return false;
  }
}

/** Built-in neutral scene presets, saved viewer groups, custom viewers and safe sharing. */
export function AudiencePresets() {
  const audience = useApp((s) => s.settings.audience);
  const update = useApp((s) => s.update);
  const generating = useApp((s) => s.generating);
  const [saved, setSaved] = useState<ViewerPreset[]>([]);
  const [name, setName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => void db.listPresets().then(setSaved).catch(() => setSaved([]));
  useEffect(refresh, []);
  useEffect(() => {
    window.addEventListener("cowatch:presets-changed", refresh);
    return () => window.removeEventListener("cowatch:presets-changed", refresh);
  }, []);

  const viewers = audience.customViewers;
  const setViewers = (next: CustomViewer[]) => update("audience", { customViewers: next });
  const patchViewer = (id: string, patch: Partial<CustomViewer>) => setViewers(viewers.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const saveGroup = async () => {
    const groupName = name.trim() || `观众组 ${new Date().toLocaleDateString("zh-CN")}`;
    await db.putPreset({ id: uid("p"), name: groupName.slice(0, 40), createdAt: Date.now(), audience: { ...sanitizeAudience(audience), worldBook: audience.worldBook ?? "", worldBookEntries: audience.worldBookEntries ?? [] } });
    setName("");
    refresh();
    toast.success(`已保存「${groupName}」到本机`);
  };

  const applySaved = (p: ViewerPreset) => {
    update("audience", { ...p.audience, worldBook: p.audience.worldBook ?? audience.worldBook ?? "", worldBookEntries: p.audience.worldBookEntries ?? audience.worldBookEntries ?? [] });
    toast.success(`已应用「${p.name}」`);
  };

  const share = async (presetName: string, a = audience) => {
    try {
      const link = presetShareLink(window.location.origin, buildSharedPreset(presetName, a));
      if (await copyText(link)) toast.success("预设链接已复制。只含观众设置，不含 API 密钥、视频、历史和世界书。");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const exportFile = (presetName: string, a = audience) => {
    try {
      const preset = buildSharedPreset(presetName, a);
      downloadText(`cowatch-preset-${preset.name}.json`, JSON.stringify(preset, null, 2), "application/json");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div>
        <p className="text-sm font-semibold">🎞️ 观影场景预设</p>
        <p className="text-xs text-muted-foreground">一键切换观众身份和语气，不会改动你的语言、世界书和屏蔽词。标「可选」的是特定模式，需要时再开。</p>
      </div>
      <div className="flex flex-wrap gap-1">
        {SCENE_PRESETS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={audience.sceneHint === p.sceneHint ? "default" : "outline"}
            disabled={generating}
            title={p.sceneHint}
            onClick={() => {
              update("audience", applyScenePreset(audience, p));
              toast.success(`已切换到「${p.label}」`);
            }}
          >
            {p.emoji} {p.label}
            {p.optional && <span className="text-[10px] opacity-70">可选</span>}
          </Button>
        ))}
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">👥 自定义观众（{viewers.length}）</p>
          <Button
            size="sm"
            variant="outline"
            disabled={generating || viewers.length >= 20}
            onClick={() => setViewers([...viewers, { id: uid("v"), name: "", personality: "", focus: "", background: "", bannedWords: "", extraPrompt: "", weight: 50 }])}
          >
            <Plus /> 添加观众
          </Button>
        </div>
        {viewers.length === 0 && <p className="text-xs text-muted-foreground">可以自己创造几位常驻观众：名字、性格、关注对象都由你填写。</p>}
        {viewers.map((v) => (
          <div key={v.id} className="space-y-1.5 rounded-md bg-secondary/40 p-2">
            <div className="flex gap-1.5">
              <Input aria-label="观众名字" placeholder="名字，如：深夜观众" value={v.name} maxLength={24} disabled={generating} onChange={(e) => patchViewer(v.id, { name: e.target.value })} />
              <Input aria-label="出场权重" type="number" min={0} max={100} className="w-20" value={v.weight} disabled={generating} onChange={(e) => patchViewer(v.id, { weight: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
              <Button size="icon" variant="ghost" aria-label="删除观众" disabled={generating} onClick={() => setViewers(viewers.filter((x) => x.id !== v.id))}>
                <Trash2 />
              </Button>
            </div>
            <Input aria-label="性格" placeholder="性格 / 说话方式，如：慢热、爱用省略号" value={v.personality} disabled={generating} onChange={(e) => patchViewer(v.id, { personality: e.target.value.slice(0, 200) })} />
            <Input aria-label="关注对象" placeholder="关注对象，如：配乐、某位角色、操作细节" value={v.focus} disabled={generating} onChange={(e) => patchViewer(v.id, { focus: e.target.value.slice(0, 200) })} />
            <Input aria-label="背景" placeholder="背景（可选），如：第一次看这个系列" value={v.background} disabled={generating} onChange={(e) => patchViewer(v.id, { background: e.target.value.slice(0, 300) })} />
            <Input aria-label="禁词" placeholder="这位观众不说的词（可选，逗号分隔）" value={v.bannedWords} disabled={generating} onChange={(e) => patchViewer(v.id, { bannedWords: e.target.value.slice(0, 300) })} />
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-sm font-semibold">💾 我的观众组</p>
        <div className="flex gap-1.5">
          <Input placeholder="给当前设置起个名字" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <Button size="sm" onClick={() => void saveGroup()}>
            <Save /> 保存
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => void share(name || "我的观众组")}>
            <Share2 /> 复制当前设置的分享链接
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportFile(name || "我的观众组")}>
            <Download /> 导出文件
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload /> 导入预设
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                if (f.size > 200_000) throw new Error("文件太大，不像观众预设");
                const p = parseSharedPreset(await f.text());
                await db.putPreset({ id: uid("p"), name: p.name, createdAt: Date.now(), audience: p.audience });
                refresh();
                toast.success(`已导入「${p.name}」到我的观众组，点击即可应用`);
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          />
        </div>
        {saved.length === 0 ? (
          <p className="text-xs text-muted-foreground">还没有保存的观众组。观众组只存在这台设备上。</p>
        ) : (
          <ul className="space-y-1">
            {saved.map((p) => (
              <li key={p.id} className="flex items-center gap-1 rounded bg-secondary/40 px-2 py-1 text-sm">
                <button type="button" className="min-w-0 flex-1 truncate text-left hover:text-primary" disabled={generating} onClick={() => applySaved(p)} title="点击应用">
                  {p.name}
                </button>
                <Button size="icon" variant="ghost" className="size-7" aria-label={`分享 ${p.name}`} onClick={() => void share(p.name, p.audience)}>
                  <Share2 className="size-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="size-7" aria-label={`导出 ${p.name}`} onClick={() => exportFile(p.name, p.audience)}>
                  <Download className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={`删除 ${p.name}`}
                  onClick={async () => {
                    if (!window.confirm(`删除「${p.name}」？`)) return;
                    await db.deletePreset(p.id);
                    refresh();
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">分享和导出只包含观众设置（身份、语气、自定义观众、语言、屏蔽词等），不含 API 密钥、接口地址、视频、历史记录和世界书。分享链接的内容放在 # 后面，浏览器不会把它发送给任何服务器。</p>
      </div>
    </div>
  );
}
