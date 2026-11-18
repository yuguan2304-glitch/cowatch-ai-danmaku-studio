import type { Cue } from "@/lib/types";
import { db } from "@/lib/db";
import { transcribe } from "./openai";

export type RepairRange={ start:number; end:number };
export type RepairPreview={
  before:Cue[];
  after:Cue[];
  range:RepairRange;
  audioSeconds:number;
  estimatedUsd:number;
};
export type RepairHistoryEntry={at:number;range:RepairRange;before:Cue[];after:Cue[];service:"groq";model:string};
const MAX_REPAIR_SECONDS=180; // Upload only a selected short window per request.
const PRICE_PER_HOUR=0.04; // Display-only estimate; provider pricing may change.
const VIDEO_EXT=/\.(mp4|webm|mov|m4v|mkv)$/i;

export function validateRepairRange(start:number,end:number,duration:number):RepairRange{
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||!Number.isFinite(duration)||duration<=0)throw new Error("请选择有效的起止时间");
  const last=Math.min(duration,end);
  if(start>=duration||last-start<1)throw new Error("修正片段至少需要 1 秒");
  if(last-start>MAX_REPAIR_SECONDS)throw new Error("一次最多修正 3 分钟；可分批修正，避免误上传过多音频");
  return {start,end:last};
}

export function mergeRepairCues(original:Cue[],replacement:Cue[],range:RepairRange):Cue[]{
  if(replacement.length===0)throw new Error("Groq 没有返回有效的带时间戳字幕；未修改原字幕");
  const start=range.start,end=range.end;
  const outside=original.flatMap(c=>{
    if(c.end<=start||c.start>=end)return [c];
    const result:Cue[]=[];
    if(c.start<start-0.05)result.push({...c,end:start});
    if(c.end>end+0.05)result.push({...c,start:end});
    return result;
  });
  return [...outside,...replacement].filter(c=>c.text.trim()&&c.end>c.start)
    .sort((a,b)=>a.start-b.start||a.end-b.end);
}
export function repairEstimate(seconds:number){return +(seconds/3600*PRICE_PER_HOUR).toFixed(6);}
export function repairCacheKey(file:File){
  // Non-secret local identity only: no audio leaves the device unless the user confirms an API repair.
  return "cowatch:repair-history:v1:"+[file.name,file.size,file.lastModified].join("|");
}

/** Record only the explicitly selected audio range; no full-video API upload. */
export async function extractRepairAudio(file:File,range:RepairRange,signal:AbortSignal,onProgress?:(s:string)=>void):Promise<File>{
  if((!file.type.startsWith("video/")&&!VIDEO_EXT.test(file.name))||!window.AudioContext||!window.MediaRecorder)
    throw new Error("当前浏览器不支持本地视频音轨提取");
  const url=URL.createObjectURL(file);
  const video=document.createElement("video");
  const ctx=new AudioContext();
  let recorder:MediaRecorder|undefined;
  let timer:ReturnType<typeof setInterval>|undefined;
  const abort=()=>new DOMException("已取消此段转录","AbortError");
  const wait=(eventName:string)=>new Promise<void>((resolve,reject)=>{
    if(signal.aborted)return reject(abort());
    const ok=()=>{clean();resolve();};
    const fail=()=>{clean();reject(new Error("无法读取选中视频的音频"))};
    const cancelled=()=>{clean();reject(abort());};
    const clean=()=>{video.removeEventListener(eventName,ok);video.removeEventListener("error",fail);signal.removeEventListener("abort",cancelled);};
    video.addEventListener(eventName,ok,{once:true});
    video.addEventListener("error",fail,{once:true});
    signal.addEventListener("abort",cancelled,{once:true});
  });
  try{
    video.src=url;video.preload="auto";video.playsInline=true;
    video.style.cssText="position:fixed;left:-1000px;top:-1000px;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(video);
    if(video.readyState<1)await wait("loadedmetadata");
    if(signal.aborted)throw abort();
    if(!Number.isFinite(video.duration)||range.end>video.duration+1)throw new Error("选中时间超出视频时长");
    const source=ctx.createMediaElementSource(video);
    const output=ctx.createMediaStreamDestination();
    source.connect(output); // No speakers, only the selected audio is recorded.
    const mime=["audio/webm;codecs=opus","audio/webm","audio/mp4"].find(m=>MediaRecorder.isTypeSupported(m));
    if(!mime)throw new Error("当前浏览器无法录制音频文件");
    await ctx.resume();
    video.currentTime=range.start;
    if(video.seeking)await wait("seeked");
    if(signal.aborted)throw abort();
    const chunks:BlobPart[]=[];
    recorder=new MediaRecorder(output.stream,{mimeType:mime,audioBitsPerSecond:48000});
    const current=recorder;
    const stopped=new Promise<void>((resolve,reject)=>{
      current.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      current.onerror=()=>reject(new Error("录制所选音频失败"));
      current.onstop=()=>resolve();
    });
    const stop=()=>{if(current.state!=="inactive")current.stop();video.pause();};
    current.start();
    try{await video.play();}catch{stop();throw new Error("浏览器阻止播放所选片段，请保持共映在前台重试");}
    await new Promise<void>((resolve,reject)=>{
      const tick=()=>{
        onProgress?.("正在提取片段音频："+Math.max(0,Math.round(video.currentTime-range.start))+" / "+Math.ceil(range.end-range.start)+" 秒（保持前台）");
        if(signal.aborted){stop();reject(abort());}
        else if(video.error){stop();reject(new Error("视频音轨播放中断"));}
        else if(video.currentTime>=range.end-0.15||video.ended){stop();resolve();}
      };
      timer=setInterval(tick,160);tick();
    });
    if(timer){clearInterval(timer);timer=undefined;}
    await stopped;
    if(signal.aborted)throw abort();
    if(chunks.length===0)throw new Error("所选片段没有可提取的音轨");
    const audio=new File(chunks,"cowatch-repair-"+Math.floor(range.start)+(mime.includes("mp4")?".m4a":".webm"),{type:mime});
    if(audio.size>25*1024*1024)throw new Error("所选音频超过 25MB，请缩短片段");
    return audio;
  }finally{
    if(timer)clearInterval(timer);
    video.pause();
    if(recorder&&recorder.state!=="inactive")try{recorder.stop();}catch{}
    video.removeAttribute("src");video.load();video.remove();URL.revokeObjectURL(url);
    void ctx.close().catch(()=>{});
  }
}

export async function previewGroqRepair(args:{
 file:File;range:RepairRange;original:Cue[];apiKey:string;signal:AbortSignal;onProgress?:(s:string)=>void;
}):Promise<RepairPreview>{
  if(!args.apiKey.trim())throw new Error("请先填写自己的 Groq 转录密钥");
  const audio=await extractRepairAudio(args.file,args.range,args.signal,args.onProgress);
  if(args.signal.aborted)throw new DOMException("已取消","AbortError");
  args.onProgress?.("仅向 Groq 提交选中的 "+Math.ceil(args.range.end-args.range.start)+" 秒音频…");
  const result=await transcribe({baseUrl:"https://api.groq.com/openai/v1",apiKey:args.apiKey,model:"whisper-large-v3-turbo",file:audio,signal:args.signal});
  if(!result.timestamped)throw new Error("Groq 未返回时间戳，未覆盖本地字幕");
  const after=result.cues.map(c=>({
   start:Math.max(args.range.start,c.start+args.range.start),
   end:Math.min(args.range.end,c.end+args.range.start),
   text:c.text.trim()
  })).filter(c=>c.text&&c.end>c.start);
  if(after.length===0)throw new Error("Groq 未识别出有效对白，未覆盖原字幕");
  return {
   before:args.original.filter(c=>c.start<args.range.end&&c.end>args.range.start),
   after,range:args.range,audioSeconds:args.range.end-args.range.start,
   estimatedUsd:repairEstimate(args.range.end-args.range.start)
  };
}

export async function saveRepairHistory(file:File,entry:RepairHistoryEntry){
 const key=repairCacheKey(file);
 const previous=await db.getLocalValue<RepairHistoryEntry[]>(key);
 await db.putLocalValue(key,[...(previous??[]),entry].slice(-50));
}
export async function readRepairHistory(file:File):Promise<RepairHistoryEntry[]>{
 return (await db.getLocalValue<RepairHistoryEntry[]>(repairCacheKey(file)))??[];
}
