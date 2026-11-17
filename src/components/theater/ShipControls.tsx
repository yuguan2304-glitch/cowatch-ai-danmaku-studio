import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/lib/store";
import type { ShipRule } from "@/lib/types";

/** CP direction is user-controlled: left=攻, right=受 in fixed mode. */
export function ShipControls() {
  const a = useApp(s => s.settings.audience);
  const update = useApp(s => s.update);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [mode, setMode] = useState<ShipRule["mode"]>("fixed");
  const rules = a.shipRules ?? [];
  const disabled = useApp(s => s.generating);

  const add = () => {
    const x = left.trim().slice(0, 70), y = right.trim().slice(0, 70);
    if (!x || !y || x.toLowerCase() === y.toLowerCase()) { toast.error("请填写两个不同角色的名字"); return; }
    const same = (r: ShipRule) => [r.left.toLowerCase(), r.right.toLowerCase()].sort().join("|") === [x.toLowerCase(), y.toLowerCase()].sort().join("|");
    if (rules.some(same)) { toast.error("这个组合已存在，请在下面修改左右设置"); return; }
    if (rules.length >= 40) { toast.error("最多允许 40 组 CP"); return; }
    update("audience", { shipRules: [...rules, {id:crypto.randomUUID(), left:x, right:y, mode}] });
    setLeft(""); setRight("");
  };
  const patch = (id: string, props: Partial<ShipRule>) =>
    update("audience", { shipRules: rules.map(r => r.id === id ? { ...r, ...props } : r) });
  const convertLegacy = () => {
    const entries = (a.shipPairs ?? "").split(/\r?\n|[,，;；]/).map(x => x.trim()).filter(Boolean);
    const parsed = entries.flatMap((entry, i) => {
      const parts = entry.split(/\s*[×xX&＆/／]\s*/).map(s => s.trim());
      if (parts.length !== 2 || !parts[0] || !parts[1]) return [];
      return [{id:crypto.randomUUID()+"-"+i,left:parts[0],right:parts[1],mode:/[&＆/／]/.test(entry) ? "reversible" as const : "fixed" as const}];
    });
    if (!parsed.length) { toast.error("旧版 CP 文本无法解析，请手动添加"); return; }
    update("audience", { shipRules: [...rules, ...parsed].slice(0, 40), shipPairs: "" });
    toast.success("旧版 CP 已转换成独立规则，请核对左右方向");
  };
  return <div className="space-y-3 rounded-lg border border-primary/30 bg-secondary/30 p-3">
    <p className="text-sm font-bold">💞 CP 偏好 · 固定左右 / 杂食无差</p>
    <p className="text-xs text-muted-foreground">固定左右：左边攻、右边受，禁止逆 CP。无差杂食：只要是这两个人，顺序可互换。每一组 CP 单独选择，未列出的组合不允许主动拉郎。优先遵守下方的屏蔽 CP。</p>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs">攻（左） / 角色 A<Input disabled={disabled} placeholder="角色 A" value={left} onChange={e=>setLeft(e.target.value)}/></label>
      <label className="text-xs">受（右） / 角色 B<Input disabled={disabled} placeholder="角色 B" value={right} onChange={e=>setRight(e.target.value)}/></label>
    </div>
    <label className="block text-xs">这一组的嗑法
      <select disabled={disabled} className="w-full rounded border bg-background p-2 text-sm" value={mode} onChange={e=>setMode(e.target.value==="reversible"?"reversible":"fixed")}>
        <option value="fixed">🔒 固定左右 · 攻 × 受 · 不可逆</option>
        <option value="reversible">🔁 杂食无差 · 双向皆可</option>
      </select>
    </label>
    <Button type="button" size="sm" disabled={disabled} onClick={add}>添加这一组 CP</Button>
    {rules.length===0 && <p className="text-xs text-muted-foreground">还没有新式 CP 规则。</p>}
    {rules.map(r=><div key={r.id} className="space-y-2 rounded border border-border bg-background/60 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 break-words text-sm font-semibold">{r.left} {r.mode==="fixed"?"×":"↔"} {r.right}</span>
        <Button size="sm" type="button" variant="ghost" disabled={disabled} onClick={()=>update("audience",{shipRules:rules.filter(x=>x.id!==r.id)})}>删除</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <select aria-label={"切换 "+r.left+" 与 "+r.right+" 的 CP 嗑法"} disabled={disabled} className="min-w-0 flex-1 rounded border bg-background p-2 text-xs" value={r.mode} onChange={e=>patch(r.id,{mode:e.target.value==="reversible"?"reversible":"fixed"})}>
          <option value="fixed">固定：{r.left} 攻 / {r.right} 受</option>
          <option value="reversible">无差：左右均可</option>
        </select>
        {r.mode==="fixed" && <Button size="sm" type="button" variant="outline" disabled={disabled} onClick={()=>patch(r.id,{left:r.right,right:r.left})}>交换攻受</Button>}
      </div>
    </div>)}
    {(a.shipPairs??"").trim() && <div className="rounded border border-warning/50 p-2 text-xs">
      <p>检测到旧版 CP 文本：</p><p className="whitespace-pre-wrap">{a.shipPairs}</p>
      <Button size="sm" variant="outline" type="button" disabled={disabled} onClick={convertLegacy}>转换到新 CP 列表</Button>
      <p className="text-muted-foreground">请转换并核对左右；新 CP 规则存在时优先使用新列表。</p>
    </div>}
    <label className="block text-xs">禁嗑 CP（每行一组，双向都屏蔽）
      <Textarea rows={2} disabled={disabled} placeholder={"角色 A × 角色 B\n角色 C × 角色 D"} value={a.blockedPairs??""} onChange={e=>update("audience",{blockedPairs:e.target.value})}/>
    </label>
  </div>;
}
