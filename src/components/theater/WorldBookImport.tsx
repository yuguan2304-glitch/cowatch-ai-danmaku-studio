import { useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Download, FileUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { downloadText } from "@/lib/export";
import { parseWorldBookFile, type WorldBookImport as ImportPreview } from "@/lib/worldbook-import";

export function WorldBookImport() {
  const audience = useApp(s=>s.settings.audience);
  const update = useApp(s=>s.update);
  const generating = useApp(s=>s.generating);
  const [preview,setPreview] = useState<ImportPreview|null>(null);
  const [selection,setSelection] = useState<"merge"|"replace">("merge");
  const [error,setError] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const current = audience.worldBookEntries??[];
  const choose = async (file:File|undefined) => {
    if(!file)return;
    setError("");setPreview(null);
    if(file.size>1024*1024){setError("文件最大 1MB，请拆分后导入");return;}
    try{setPreview(parseWorldBookFile(file.name,await file.text()));}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  const importFile=()=>{
    if(!preview||generating)return;
    const entries=selection==="replace"?preview.entries:[...current,...preview.entries];
    if(entries.length>1000){toast.error("世界书最多保存 1000 条");return;}
    update("audience",{worldBookEntries:entries});
    toast.success("已导入 "+preview.entries.length+" 条世界书内容（本机保存）");
    setPreview(null);
  };
  const toggle=(id:string,enabled:boolean)=>{
    update("audience",{worldBookEntries:current.map(e=>e.id===id?{...e,enabled}:e)});
  };
  return <div className="space-y-3 rounded-lg border border-primary/35 bg-secondary/20 p-3">
    <div className="flex items-center gap-2 font-semibold text-sm"><BookOpen className="size-4"/> 导入完整世界书文件</div>
    <p className="text-xs text-muted-foreground">支持酒馆 / SillyTavern 世界书 JSON、角色卡 character_book、普通条目 JSON，以及 TXT / MD。会解析关键词、常驻条目、禁用状态；无需逐条复制。解析与保存都在本机完成。</p>
    <input ref={ref} type="file" className="hidden" accept=".json,.txt,.md,.markdown,application/json,text/plain" onChange={e=>{const f=e.target.files?.[0];e.target.value="";void choose(f);}}/>
    <Button type="button" variant="outline" disabled={generating} onClick={()=>ref.current?.click()}><FileUp className="size-4"/> 选择世界书文件</Button>
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {preview&&<div className="rounded-lg border border-primary/50 p-3 space-y-2">
      <p className="text-sm font-semibold">导入预览：{preview.fileName}</p>
      <p className="text-xs">识别 {preview.entries.length} 条 · 常驻 {preview.entries.filter(e=>e.constant).length} 条 · 关键词触发 {preview.entries.filter(e=>!e.constant).length} 条</p>
      {preview.warnings.map((w,i)=><p className="text-xs text-warning" key={i}>{w}</p>)}
      <div className="max-h-36 overflow-y-auto space-y-2">
        {preview.entries.slice(0,10).map((e,i)=><div key={e.id} className="rounded border border-border p-2 text-xs">
          <span className="font-semibold">{i+1}. {e.name}</span>
          <span className="text-muted-foreground"> · {e.enabled?"启用":"禁用"} · {e.constant?"常驻":e.keywords.join(" / ")}</span>
          <p className="line-clamp-2 break-words">{e.content}</p>
        </div>)}
        {preview.entries.length>10&&<p className="text-xs text-muted-foreground">另有 {preview.entries.length-10} 条未在预览中展开，导入时会全部保存。</p>}
      </div>
      <label className="block text-xs">导入方式
        <select className="w-full rounded border bg-background p-2 text-sm" value={selection} onChange={e=>setSelection(e.target.value==="replace"?"replace":"merge")}>
          <option value="merge">合并到已有世界书（推荐）</option>
          <option value="replace">替换之前导入的结构化世界书</option>
        </select>
      </label>
      <p className="text-xs text-muted-foreground">替换只影响已导入的结构化世界书，不删除上方手动填写的世界书文本。</p>
      <div className="flex gap-2">
        <Button size="sm" disabled={generating} onClick={importFile}>确认导入 {preview.entries.length} 条</Button>
        <Button size="sm" variant="ghost" onClick={()=>setPreview(null)}>取消</Button>
      </div>
    </div>}
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">已导入 {current.length} 条 · 已启用 {current.filter(x=>x.enabled).length} 条</span>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={!current.length} onClick={()=>downloadText("cowatch-imported-worldbook.json",JSON.stringify({entries:current},null,2),"application/json")}><Download className="size-3.5"/> 导出</Button>
          <Button size="sm" variant="ghost" disabled={!current.length||generating} onClick={()=>{if(confirm("删除所有已导入的结构化世界书？上方手动文本不会清空。"))update("audience",{worldBookEntries:[]});}}><Trash2 className="size-3.5"/> 清空</Button>
        </div>
      </div>
      {current.length>0&&<details className="rounded border border-border p-2">
        <summary className="cursor-pointer text-sm">管理导入条目（启用 / 禁用 / 删除）</summary>
        <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
          {current.map(e=><div key={e.id} className="rounded border border-border p-2 text-xs space-y-1">
            <div className="flex items-start gap-2">
              <label className="flex min-w-0 flex-1 items-start gap-2"><input type="checkbox" checked={e.enabled} disabled={generating} onChange={x=>toggle(e.id,x.target.checked)}/><span className="break-words font-semibold">{e.name}</span></label>
              <Button size="sm" variant="ghost" disabled={generating} onClick={()=>update("audience",{worldBookEntries:current.filter(x=>x.id!==e.id)})}>删除</Button>
            </div>
            <p className="text-muted-foreground">触发：{e.constant?"常驻":e.keywords.join(" / ")}</p>
            <p className="line-clamp-3 break-words">{e.content}</p>
          </div>)}
        </div>
      </details>}
    </div>
    <p className="text-xs text-muted-foreground">世界书不会自动上传到共映服务器。生成弹幕时只会挑选启用且符合关键词的少量条目发送给你配置的 AI 接口。酒馆的高级触发逻辑不保证完全兼容。</p>
  </div>;
}
