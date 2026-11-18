import { useEffect,useRef,useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadText } from "@/lib/export";
import {loadTermGroups,saveTermGroups,selectedTermGroupId,saveSelectedTermGroupId,parseTermFile,uniqueTerms,newTerm,newTermGroup,type TermGroup} from "@/lib/translation-terms";

export function TerminologyLibrary({onChange}:{onChange:(text:string)=>void}){
 const [groups,setGroups]=useState<TermGroup[]>(loadTermGroups);
 const [active,setActive]=useState<string>(selectedTermGroupId);
 const [newCategory,setNewCategory]=useState("");
 const [source,setSource]=useState(""),[target,setTarget]=useState(""),[note,setNote]=useState("");
 const [importMode,setImportMode]=useState<"merge"|"replace">("merge");
 const [pasted,setPasted]=useState("");
 const [pasteOpen,setPasteOpen]=useState(false);
 const fileRef=useRef<HTMLInputElement>(null);
 const current=groups.find(g=>g.id===active);
 const termText=(group:TermGroup|undefined)=>group?.entries.map(e=>e.source+" = "+e.target+(e.note?"（"+e.note+"）":"")).join("\\n")??"";
 useEffect(()=>{onChange(termText(groups.find(g=>g.id===active)));},[]);
 const commit=(next:TermGroup[],chosen=active)=>{
  try{
   saveTermGroups(next);saveSelectedTermGroupId(chosen);
   setGroups(next);setActive(chosen);
   onChange(termText(next.find(g=>g.id===chosen)));
  }catch(e){toast.error((e as Error).message);}
 };
 const choose=(id:string)=>{
  saveSelectedTermGroupId(id);setActive(id);
  onChange(termText(groups.find(g=>g.id===id)));
 };
 const addCategory=()=>{
  const name=newCategory.trim().slice(0,80);
  if(!name){toast.error("请输入分类名称");return;}
  if(groups.some(g=>g.name===name)){toast.error("已有同名分类");return;}
  const group=newTermGroup(name);commit([...groups,group],group.id);setNewCategory("");
 };
 const updateGroup=(entries:TermGroup["entries"])=>{
  if(!current)return;
  commit(groups.map(g=>g.id===active?{...g,entries,updatedAt:Date.now()}:g));
 };
 const addEntry=()=>{
  if(!current){toast.error("请先创建或选中分类");return;}
  if(!source.trim()||!target.trim()){toast.error("原词和译名都不能为空");return;}
  if(current.entries.some(e=>e.source.toLocaleLowerCase()===source.trim().toLocaleLowerCase())){toast.error("该原词已存在，请直接编辑现有术语");return;}
  updateGroup([...current.entries,newTerm(source.trim(),target.trim(),note.trim())]);
  setSource("");setTarget("");setNote("");
 };
 const applyEntries=(imported:TermGroup["entries"])=>{
   if(!current)return;
   if(importMode==="replace"&&!confirm("用这 "+imported.length+" 条术语替换当前「"+current.name+"」分类？其他分类不受影响。"))return;
   const entries=importMode==="replace"?imported:uniqueTerms([...imported,...current.entries]);
   updateGroup(entries);
   toast.success("已导入 "+imported.length+" 条；当前分类共 "+entries.length+" 条");
 };
 const readFile=async(file:File|undefined)=>{
  if(!file||!current)return;
  try{applyEntries(parseTermFile(file.name,await file.text()));}
  catch(e){toast.error("术语导入失败："+(e as Error).message);}
 };
 const readPasted=()=>{
  if(!pasted.trim()){toast.error("请先粘贴术语内容");return;}
  try{
    const content=pasted.trim();
    const parsed=parseTermFile(content.startsWith("[")||content.startsWith("{")?"粘贴术语.json":"粘贴术语.txt",content);
    applyEntries(parsed);setPasted("");
  }catch(e){toast.error("粘贴导入失败："+(e as Error).message);}
 };
 const exportGroup=()=>{
  if(!current)return;
  downloadText("cowatch-imported-worldbook.json",JSON.stringify({format:"cowatch-terms-v1",name:current.name,entries:current.entries},null,2),"application/json");
 };
 return <details className="rounded-lg border border-border p-3 text-sm">
  <summary className="cursor-pointer font-semibold">📚 分类术语库 · {groups.length} 类（导入、编辑、保存、切换）</summary>
  <div className="space-y-3 pt-3">
   <p className="text-xs text-muted-foreground">按不同圈子分别保存人名、CP、专有名词。一次只启用一个分类；与上方手填术语一起用于 AI 翻译。术语保存在当前设备，不会随着云端同步，不含 API 密钥。</p>
   <label className="block text-xs">当前启用分类
    <select value={active} onChange={e=>choose(e.target.value)} className="w-full rounded border bg-background p-2">
     <option value="">不使用分类术语</option>
     {groups.map(g=><option value={g.id} key={g.id}>{g.name}（{g.entries.length} 条）</option>)}
    </select>
   </label>
   <div className="flex gap-2">
    <Input value={newCategory} onChange={e=>setNewCategory(e.target.value)} placeholder="新分类，如 Dream Team、动漫、纪录片"/>
    <Button type="button" size="sm" onClick={addCategory}>新建</Button>
   </div>
   {current&&<>
    <div className="flex flex-wrap gap-2">
     <Button type="button" size="sm" variant="outline" onClick={exportGroup}>导出此分类 JSON</Button>
     <Button type="button" size="sm" variant="outline" onClick={()=>{if(confirm("删除「"+current.name+"」分类及其中全部术语？"))commit(groups.filter(g=>g.id!==active),"");}}>删除分类</Button>
    </div>
    <div className="space-y-2 rounded border border-border p-2">
     <p className="text-xs font-medium">添加术语</p>
     <div className="grid grid-cols-2 gap-2">
      <Input value={source} onChange={e=>setSource(e.target.value)} placeholder="原词，如 Ender Pearl"/>
      <Input value={target} onChange={e=>setTarget(e.target.value)} placeholder="译名，如 末影珍珠"/>
     </div>
     <Input value={note} onChange={e=>setNote(e.target.value)} placeholder="备注（可选）：语境、角色、习惯用法"/>
     <Button size="sm" type="button" onClick={addEntry}>添加到 {current.name}</Button>
    </div>
    <div className="space-y-2">
     <p className="text-xs font-medium">导入术语：支持 JSON / TXT / MD / CSV / TSV</p>
     <p className="text-xs text-muted-foreground">文本示例：Dream = Dream；或一个原词、译名两列的 CSV。还支持世界书 JSON 条目的 name/content 或 comment/content。</p>
     <div className="flex flex-wrap gap-2 items-center">
      <select className="rounded border bg-background p-2 text-xs" value={importMode} onChange={e=>setImportMode(e.target.value as typeof importMode)}>
       <option value="merge">合并并去重</option><option value="replace">替换当前分类</option>
      </select>
      <input ref={fileRef} type="file" className="block w-full min-w-0 max-w-full text-xs file:mr-2 file:rounded file:border file:border-border file:bg-secondary file:px-2 file:py-2" accept=".json,.txt,.md,.markdown,.csv,.tsv,application/json,text/plain" aria-label="从手机文件管理器选择术语文件" onChange={e=>{const file=e.target.files?.[0];e.target.value="";void readFile(file);}}/>
     </div>
     <p className="text-xs text-muted-foreground">直接点击上方的「选择文件」打开手机文件管理器。如安卓 WebView 无法弹出文件选择器，可使用下方「粘贴导入」。</p>
     <Button type="button" size="sm" variant="outline" onClick={()=>setPasteOpen(x=>!x)}>{pasteOpen?"收起粘贴导入":"粘贴导入（无需文件选择器）"}</Button>
     {pasteOpen&&<div className="space-y-2">
       <textarea className="w-full min-h-36 rounded border border-border bg-background p-2 text-xs" value={pasted} onChange={e=>setPasted(e.target.value)} placeholder={"直接粘贴术语书 JSON 全文，或一行一条：\\nDream = Dream\\nSapnap = Sapnap\\nMinecraft Manhunt = Minecraft 猎人游戏"}/>
       <Button type="button" size="sm" onClick={readPasted}>导入粘贴的术语</Button>
     </div>
    </div>
    <div className="max-h-72 space-y-2 overflow-y-auto">
     {current.entries.map(entry=><div className="rounded border border-border p-2 space-y-1" key={entry.id}>
      <div className="grid grid-cols-2 gap-2">
       <Input aria-label="术语原词" value={entry.source} onChange={e=>updateGroup(current.entries.map(x=>x.id===entry.id?{...x,source:e.target.value}:x))}/>
       <Input aria-label="术语译名" value={entry.target} onChange={e=>updateGroup(current.entries.map(x=>x.id===entry.id?{...x,target:e.target.value}:x))}/>
      </div>
      <div className="flex gap-2">
       <Input aria-label="术语备注" value={entry.note} placeholder="备注" onChange={e=>updateGroup(current.entries.map(x=>x.id===entry.id?{...x,note:e.target.value}:x))}/>
       <Button type="button" variant="ghost" size="sm" onClick={()=>updateGroup(current.entries.filter(x=>x.id!==entry.id))}>删除</Button>
      </div>
     </div>)}
     {!current.entries.length&&<p className="text-xs text-muted-foreground">这个分类还是空的，可以直接添加或导入。</p>}
    </div>
   </>}
  </div>
 </details>;
}
