import {useEffect,useMemo,useState} from "react";
import {getClock} from "@/lib/clock";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import type {Cue} from "@/lib/types";

type Suspicion={index:number;reason:string};
const clock=(n:number)=>[Math.floor(n/3600),Math.floor(n/60)%60,Math.floor(n)%60].map(v=>String(Math.max(0,v)).padStart(2,"0")).join(":");
const compact=(text:string)=>text.toLowerCase().replace(/[\p{P}\p{S}\s]/gu,"");

export function findSuspectCues(cues:Cue[]):Suspicion[]{
 const result:Suspicion[]=[];
 const counts=new Map<string,number>();
 for(const c of cues){const key=compact(c.text);if(key.length>12)counts.set(key,(counts.get(key)||0)+1);}
 for(let i=0;i<cues.length;i++){
  const c=cues[i]!;const key=compact(c.text);
  const reasons:string[]=[];
  if(key.length>12&&(counts.get(key)??0)>=3)reasons.push("多次出现同一句（可能是重复识别）");
  if(c.end-c.start>=16&&key.length<=5)reasons.push("长片段仅有少量文字");
  if(c.text.trim().length>=65&&c.end-c.start<2)reasons.push("短时间内出现过多文字");
  if(i>0&&c.start<cues[i-1]!.end-0.5)reasons.push("字幕时间重叠（不一定是多人说话）");
  if(i>0&&c.start-cues[i-1]!.end>40)reasons.push("长时间缺少字幕（也可能是安静场景）");
  if(reasons.length)result.push({index:i,reason:reasons.join("；")});
 }
 return result.slice(0,80);
}

export function TranscriptionReviewPanel({cues,translated,onCorrect,onRetranslate,onGroq,disabled}:{
 cues:Cue[];
 translated:Record<number,string>;
 onCorrect:(index:number,text:string)=>void;
 onRetranslate:(indices:number[])=>void;
 onGroq:(start:number,end:number)=>void;
 disabled:boolean;
}){
 const [showAll,setShowAll]=useState(false);
 const [selected,setSelected]=useState<number[]>([]);
 const [expanded,setExpanded]=useState<number[]>([]);
 const [drafts,setDrafts]=useState<Record<number,string>>({});
 const [query,setQuery]=useState("");
 const [page,setPage]=useState(0);
 const suspect=useMemo(()=>findSuspectCues(cues),[cues]);
 const suspicion=useMemo(()=>new Map(suspect.map(x=>[x.index,x.reason])),[suspect]);
 const visible=useMemo(()=>cues.map((c,index)=>({c,index})).filter(({c,index})=>(showAll||suspicion.has(index))&&(!query.trim()||c.text.toLowerCase().includes(query.toLowerCase()))),[cues,showAll,suspicion,query]);
 const filtered=visible.slice(page*20,page*20+20);
 useEffect(()=>{setSelected([]);setDrafts({});setExpanded([]);setPage(0);},[cues.length]);
 const choose=(i:number,v:boolean)=>setSelected(old=>v?[...new Set([...old,i])]:old.filter(x=>x!==i));
 const edit=(i:number)=>{
  if(!expanded.includes(i))setDrafts(old=>({...old,[i]:cues[i]?.text??""}));
  setExpanded(old=>old.includes(i)?old.filter(x=>x!==i):[...old,i]);
 };
 const retranslate=()=>{
  if(!selected.length)return;
  onRetranslate(selected);
 };
 return <details className="rounded-lg border border-primary/45 bg-secondary/20 p-3 space-y-2 text-sm" id="cowatch-transcription-review">
  <summary className="cursor-pointer font-semibold">🛠️ 转录纠错工作台 · {suspect.length} 条建议复查</summary>
  <div className="space-y-3 pt-3">
   <p className="text-xs text-muted-foreground">根据重复、字幕间隔、时间重叠和字数规则提示可疑内容，不代表一定听错，也无法仅凭字幕判断谁在说话。点击时间戳回听，修正原文后可只重翻所选台词，或调用 Groq 重新识别短片段。</p>
   <div className="flex flex-wrap gap-2">
    <Button type="button" variant={!showAll?"default":"outline"} size="sm" onClick={()=>{setShowAll(false);setPage(0);}}>只看可疑（{suspect.length}）</Button>
    <Button type="button" variant={showAll?"default":"outline"} size="sm" onClick={()=>{setShowAll(true);setPage(0);}}>全部字幕（{cues.length}）</Button>
   </div>
   <input className="w-full rounded border border-border bg-background px-3 py-2 text-sm" placeholder="搜索原文台词（例如点火、right、fire）" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/>
   <div className="flex items-center justify-between gap-2 rounded border border-border p-2">
    <span className="text-xs">已勾选 {selected.length} 条</span>
    <div className="flex flex-wrap gap-2">
     <Button size="sm" variant="outline" type="button" onClick={()=>setSelected([])}>清空</Button>
     <Button size="sm" type="button" disabled={disabled||!selected.length} onClick={retranslate}>只重翻选中（{selected.length}）</Button>
    </div>
   </div>
   <div className="space-y-2">
    {filtered.map(({c,index:i})=><div key={i} className="rounded-lg border border-border bg-background/50 p-2 space-y-2">
     <div className="flex items-center justify-between gap-2 text-xs">
      <button className="font-mono text-primary underline" type="button" onClick={()=>getClock()?.seek(c.start)} title="跳转视频回听">{clock(c.start)} – {clock(c.end)}</button>
      <label className="flex items-center gap-1"><input type="checkbox" checked={selected.includes(i)} onChange={e=>choose(i,e.target.checked)}/>选中</label>
     </div>
     {suspicion.has(i)&&<p className="text-xs text-amber-500">⚑ {suspicion.get(i)}</p>}
     <p className="break-words text-sm">{c.text}</p>
     {translated[i]&&<p className="break-words text-xs text-muted-foreground">译文：{translated[i]}</p>}
     <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" type="button" onClick={()=>edit(i)}>{expanded.includes(i)?"收起":"改原文"}</Button>
      <Button size="sm" variant="outline" type="button" onClick={()=>onGroq(Math.max(0,c.start-3),Math.min(c.end+3,c.start+175))}>Groq 重听此段</Button>
      <Button size="sm" variant="ghost" type="button" disabled={disabled} onClick={()=>onRetranslate([i])}>重翻此句</Button>
     </div>
     {expanded.includes(i)&&<div className="space-y-2">
      <Textarea aria-label="人工校对原始转录" value={drafts[i]??c.text} onChange={e=>setDrafts(old=>({...old,[i]:e.target.value}))}/>
      <Button size="sm" type="button" onClick={()=>{onCorrect(i,drafts[i]??c.text);setExpanded(old=>old.filter(x=>x!==i));}}>保存原文（不调用 API）</Button>
     </div>}
    </div>)}
    {!visible.length&&<p className="rounded border border-border p-3 text-xs text-muted-foreground">{cues.length?"当前筛选没有匹配的字幕。可以切换「全部字幕」人工逐句检查。":"请先用本地 Whisper/Groq 转录或导入 SRT/VTT 字幕。"}</p>}
   </div>
   {visible.length>20&&<div className="flex items-center justify-between">
    <Button type="button" variant="outline" size="sm" disabled={page===0} onClick={()=>setPage(p=>p-1)}>上一页</Button>
    <span className="text-xs">{page+1} / {Math.ceil(visible.length/20)}</span>
    <Button type="button" variant="outline" size="sm" disabled={(page+1)*20>=visible.length} onClick={()=>setPage(p=>p+1)}>下一页</Button>
   </div>}
  </div>
 </details>;
}
