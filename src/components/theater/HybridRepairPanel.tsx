import { useEffect,useMemo,useRef,useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp,useSecrets } from "@/lib/store";
import type { Cue } from "@/lib/types";
import { mergeRepairCues,previewGroqRepair,readRepairHistory,repairEstimate,saveRepairHistory,validateRepairRange,type RepairPreview,type RepairHistoryEntry } from "@/lib/ai/hybrid-transcribe";

function format(sec:number){
  const n=Math.max(0,Math.floor(sec));
  return String(Math.floor(n/3600)).padStart(2,"0")+":"+String(Math.floor(n/60)%60).padStart(2,"0")+":"+String(n%60).padStart(2,"0");
}
function parseClock(input:string){
  const parts=input.trim().split(":").map(Number);
  if(parts.length>3||parts.length<1||parts.some(v=>!Number.isFinite(v)||v<0))return NaN;
  return parts.reduce((sum,n)=>sum*60+n,0);
}
function suggestRanges(cues:Cue[],duration:number){
  const suggestions:{start:number;end:number;reason:string}[]=[];
  const counts=new Map<string,number>();
  for(const c of cues){const text=c.text.toLowerCase().replace(/[\p{P}\p{S}\s]/gu,"");if(text.length>12)counts.set(text,(counts.get(text)||0)+1);}
  for(let i=0;i<cues.length;i++){
    const c=cues[i]!;
    const key=c.text.toLowerCase().replace(/[\p{P}\p{S}\s]/gu,"");
    if(key.length>12&&(counts.get(key)??0)>=4){
      const start=Math.max(0,Math.floor(c.start-6)),end=Math.min(duration,Math.ceil(c.end+6));
      if(end-start>1&&!suggestions.some(r=>Math.abs(r.start-start)<25))suggestions.push({start,end:Math.min(start+180,end),reason:"疑似重复台词"});
    }
    if(i>0&&c.start-cues[i-1]!.end>45){
      const start=Math.max(0,Math.floor(cues[i-1]!.end));
      const end=Math.min(duration,start+Math.min(60,c.start-start));
      if(end>start+1&&!suggestions.some(r=>Math.abs(r.start-start)<25))suggestions.push({start,end,reason:"长时间没有字幕（可能是正常安静场景）"});
    }
    if(suggestions.length>=5)break;
  }
  return suggestions;
}
export function HybridRepairPanel(){
 const source=useApp(s=>s.source),duration=useApp(s=>s.duration),cues=useApp(s=>s.cues),session=useApp(s=>s.sessionId);
 const groqKey=useSecrets(s=>s.transcribeKey);
 const [start,setStart]=useState("00:00:00"),[end,setEnd]=useState("00:00:30");
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState(""),[preview,setPreview]=useState<RepairPreview|null>(null);
 const [history,setHistory]=useState<RepairHistoryEntry[]>([]);
 const [viewHistory,setViewHistory]=useState(false);
 const ctrl=useRef<AbortController|null>(null);
 const [shown,setShown]=useState(false);
 const details=useRef<HTMLDetailsElement|null>(null);
 const selectedSeconds=parseClock(end)-parseClock(start);
 const estimate=repairEstimate(Math.max(0,selectedSeconds));
 const sourceFile=source.kind==="file"?source.file:undefined;
 const suggestions=useMemo(()=>suggestRanges(cues,duration),[cues,duration]);
 useEffect(()=>{setPreview(null);setHistory([]);setStart("00:00:00");setEnd("00:00:30");ctrl.current?.abort();},[session]);
 useEffect(()=>{if(!sourceFile)return;let cancelled=false;void readRepairHistory(sourceFile).then(items=>{if(!cancelled)setHistory(items);}).catch(()=>{});return()=>{cancelled=true;};},[sourceFile]);
 useEffect(()=>()=>ctrl.current?.abort(),[]);
 useEffect(()=>{
  const onRequest=(event:Event)=>{
   const request=(event as CustomEvent<{start:number;end:number}>).detail;
   if(!request||!Number.isFinite(request.start)||!Number.isFinite(request.end))return;
   pick(Math.max(0,request.start),Math.max(request.start+1,request.end));
   if(details.current){details.current.open=true;setShown(true);details.current.scrollIntoView({behavior:"smooth",block:"center"});}
  };
  window.addEventListener("cowatch:repair-range",onRequest);
  return()=>window.removeEventListener("cowatch:repair-range",onRequest);
 },[]);

 const pick=(a:number,b:number)=>{setStart(format(a));setEnd(format(b));setPreview(null);};
 const request=async()=>{
   if(!sourceFile){toast.error("请先打开本地视频");return;}
   let range;try{range=validateRepairRange(parseClock(start),parseClock(end),duration);}catch(e){toast.error((e as Error).message);return;}
   if(!groqKey){toast.error("请先在上方 Groq 语音转录服务填写 API Key");return;}
   if(!confirm("只将 "+format(range.start)+"～"+format(range.end)+" 的音频上传给 Groq 重新识别（预计 $"+repairEstimate(range.end-range.start).toFixed(4)+"，实际以服务商额度计费为准）。不会上传整部视频，也不会自动替换字幕。继续吗？"))return;
   const controller=new AbortController();ctrl.current=controller;setBusy(true);setPreview(null);setProgress("");
   const originalSession=useApp.getState().sessionId;
   try{
     const result=await previewGroqRepair({file:sourceFile,range,original:cues,apiKey:groqKey,signal:controller.signal,onProgress:setProgress});
     if(controller.signal.aborted||useApp.getState().sessionId!==originalSession)return;
     setPreview(result);toast.success("Groq 修正结果已生成，请预览并确认是否替换");
   }catch(e){if(!controller.signal.aborted)toast.error((e as Error).message,{duration:11000});}
   finally{setBusy(false);setProgress("");if(ctrl.current===controller)ctrl.current=null;}
 };
 const apply=async()=>{
   if(!preview||!sourceFile)return;
   if(!confirm("确认仅替换 "+format(preview.range.start)+"～"+format(preview.range.end)+" 的字幕？原始台词会写入本机修订记录，便于查看和恢复。"))return;
   const current=useApp.getState();
   const merged=mergeRepairCues(current.cues,preview.after,preview.range);
   const old=current.cues.filter(c=>c.start<preview.range.end&&c.end>preview.range.start);
   try{
     await saveRepairHistory(sourceFile,{at:Date.now(),range:preview.range,before:old,after:preview.after,service:"groq",model:"whisper-large-v3-turbo"});
     setHistory(await readRepairHistory(sourceFile));
     current.setCues(merged,"混合识别（本机 Whisper + Groq 局部修正）");
     setPreview(null);
     toast.success("已合并修正字幕，原文修订记录保存在当前设备。翻译过的台词需重新翻译。");
   }catch(e){toast.error("保存修订记录失败，尚未修改字幕："+(e as Error).message);}
 };
 const undo=async(entry:RepairHistoryEntry)=>{
   if(!confirm("恢复这一次 Groq 修正之前的字幕？仅影响所选时间段。"))return;
   const current=useApp.getState();current.setCues(mergeRepairCues(current.cues,entry.before,entry.range),"混合识别（已恢复历史原文）");
   toast.success("已经恢复修正之前的原文字幕；修订历史仍保留");
 };
 return <details ref={details} className="rounded-lg border border-primary/40 bg-secondary/20 p-3 space-y-3 text-sm" onToggle={e=>setShown(e.currentTarget.open)}>
  <summary className="cursor-pointer font-semibold">🎧 混合识别：只用 Groq 修正选中的片段</summary>
  {shown&&<div className="space-y-3 pt-2">
   <p className="text-xs text-muted-foreground">先用免费的本机 Whisper Base 转录整段视频，再指定不满意的时间段。共映只提取这段音频并发送给 Groq；结果先预览，确认后才替换。本地和云端的识别结果均保留时间戳。</p>
   <div className="grid grid-cols-2 gap-2">
    <label className="text-xs space-y-1">开始位置（时:分:秒）<Input disabled={busy} value={start} onChange={e=>{setStart(e.target.value);setPreview(null);}} placeholder="00:12:30"/></label>
    <label className="text-xs space-y-1">结束位置（时:分:秒）<Input disabled={busy} value={end} onChange={e=>{setEnd(e.target.value);setPreview(null);}} placeholder="00:14:00"/></label>
   </div>
   <p className="text-xs text-muted-foreground">当前视频：{duration?format(duration):"时长未知"} · 选中 {Number.isFinite(selectedSeconds)&&selectedSeconds>0?Math.round(selectedSeconds):0} 秒 · Groq 预计费用约 $ {estimate.toFixed(4)}（免费额度内可能为 $0） · 单次上限 3 分钟</p>
   {suggestions.length>0&&<div className="space-y-1">
     <p className="text-xs font-semibold">可能需要复查的片段（仅按重复/空白规则提示，并不代表一定识别错误）</p>
     <div className="flex flex-wrap gap-2">
      {suggestions.map((r,i)=><Button key={i} type="button" size="sm" variant="outline" disabled={busy} onClick={()=>pick(r.start,r.end)}>{format(r.start)} · {r.reason}</Button>)}
     </div>
   </div>}
   <div className="flex flex-wrap gap-2">
     <Button type="button" disabled={busy||!sourceFile||!Number.isFinite(selectedSeconds)||selectedSeconds<1||selectedSeconds>180} onClick={()=>void request()}>仅转录选中片段（先预览）</Button>
     {busy&&<Button type="button" variant="outline" onClick={()=>ctrl.current?.abort()}>取消</Button>}
   </div>
   {progress&&<p role="status" className="text-xs text-primary">{progress}</p>}
   {!sourceFile&&<p className="text-xs text-amber-500">仅支持已打开的本地视频文件；需要先保存本机字幕，再进行局部修正。</p>}
   {preview&&<div className="space-y-3 rounded-lg border border-primary/40 p-3">
     <p className="font-semibold">修正预览 · {format(preview.range.start)}～{format(preview.range.end)}</p>
     <div className="space-y-1"><p className="text-xs font-medium text-muted-foreground">原字幕（{preview.before.length} 条）</p>
     <div className="max-h-36 overflow-y-auto rounded bg-background/60 p-2 text-xs">{preview.before.length?preview.before.map((c,i)=><p key={i}>{format(c.start)} {c.text}</p>):"此段原来没有字幕"}</div></div>
     <div className="space-y-1"><p className="text-xs font-medium text-primary">Groq 修正后（{preview.after.length} 条）</p>
     <div className="max-h-40 overflow-y-auto rounded bg-background/60 p-2 text-xs">{preview.after.map((c,i)=><p key={i}>{format(c.start)} {c.text}</p>)}</div></div>
     <p className="text-xs text-muted-foreground">已发生一次 Groq 请求；点放弃不会撤销本次 API 用量。未确认前原字幕保持不变。</p>
     <div className="flex gap-2"><Button type="button" onClick={()=>void apply()}>确认合并并保存记录</Button><Button type="button" variant="outline" onClick={()=>setPreview(null)}>放弃修改</Button></div>
   </div>}
   <div className="space-y-2">
    <button type="button" className="text-xs underline text-muted-foreground" onClick={()=>setViewHistory(v=>!v)}>{viewHistory?"收起":"查看"}本机修订记录（{history.length}）</button>
    {viewHistory&&<div className="space-y-2 max-h-40 overflow-y-auto">{history.slice().reverse().map((entry,i)=><div key={entry.at+"-"+i} className="flex items-center justify-between gap-2 rounded border p-2 text-xs">
      <span>{new Date(entry.at).toLocaleString()} · {format(entry.range.start)}～{format(entry.range.end)} · {entry.after.length} 条</span>
      <Button size="sm" variant="outline" type="button" onClick={()=>void undo(entry)}>恢复原文</Button>
    </div>)}</div>}
   </div>
  </div>}
 </details>;
}
