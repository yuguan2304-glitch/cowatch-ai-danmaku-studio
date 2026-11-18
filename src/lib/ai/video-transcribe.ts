import { TRANSCRIBE_MAX_BYTES } from "@/lib/constants";
import { transcribe } from "./openai";
import { db } from "@/lib/db";
import type { Cue } from "@/lib/types";

/**
 * Large local videos are recorded as compact AUDIO ONLY segments in the user's
 * own browser, then sent individually to the user's configured transcription API.
 *
 * This fallback plays the media at normal speed in a hidden element. It cannot
 * work faster than playback; Android may pause it if the app goes into background.
 * A real-time capture is used only when the original file exceeds the upload cap.
 */
type SavedChunk = {start:number;end:number;cues:Cue[]};
type SavedTranscript = {completed:SavedChunk[]; updatedAt:number};
async function transcriptCacheKey(file:File,service:string,maxSeconds:number|undefined){
  const head=await file.slice(0,65536).arrayBuffer();
  const tail=await file.slice(Math.max(0,file.size-65536)).arrayBuffer();
  const marker=new TextEncoder().encode([service,file.name,file.size,file.lastModified,maxSeconds??"all"].join("|"));
  const merged=new Uint8Array(marker.length+head.byteLength+tail.byteLength);
  merged.set(marker);merged.set(new Uint8Array(head),marker.length);
  merged.set(new Uint8Array(tail),marker.length+head.byteLength);
  const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",merged));
  return "transcript:v2:"+Array.from(hash,v=>v.toString(16).padStart(2,"0")).join("");
}
/** Read already-paid transcript chunks without making any transcription request. */
export async function recoverSavedVideoTranscript(opts:{
  file:File; baseUrl:string; model:string;
  backend?:"groq"|"cloudflare"|"custom"; maxSeconds?:number;
}):Promise<Cue[]> {
  const key=await transcriptCacheKey(opts.file,(opts.backend??"custom")+":"+opts.baseUrl+":"+opts.model,opts.maxSeconds);
  const saved=await db.getLocalValue<SavedTranscript>(key);
  return (saved?.completed??[]).flatMap(c=>c.cues).filter(c=>
    Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.end>c.start&&typeof c.text==="string"
  ).sort((a,b)=>a.start-b.start);
}
export async function cloudflareTranscribeAudio(opts:{file:File;start:number;end:number;signal:AbortSignal}):Promise<{cues:Cue[];timestamped:boolean}>{
  const {readSyncCode}=await import("@/lib/cloud-sync");
  const code=readSyncCode();
  if(!code)throw new Error("使用 Cloudflare 免费转录前，请在「多设备自动同步」创建一个同步空间。同步码不需要分享给任何人。");
  const tokenSeed=new TextEncoder().encode("cowatch-auth-v1:");
  const raw=code.replace(/-/g,"+").replace(/_/g,"/");
  const source=Uint8Array.from(atob(raw+"=".repeat((4-raw.length%4)%4)),c=>c.charCodeAt(0));
  const combined=new Uint8Array(tokenSeed.length+source.length);
  combined.set(tokenSeed);combined.set(source,tokenSeed.length);
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",combined));
  const token=btoa(String.fromCharCode(...digest)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const bytes=new Uint8Array(await opts.file.arrayBuffer());
  let packed="";
  for(let i=0;i<bytes.length;i+=16384)packed+=String.fromCharCode(...bytes.subarray(i,i+16384));
  const response=await fetch("https://cowatch-ai-danmaku-studio.yuguan2304.workers.dev/api/transcribe/v1",{
    method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
    body:JSON.stringify({audio:btoa(packed),seconds:Math.max(1,Math.ceil(opts.end-opts.start))}),
    signal:opts.signal,credentials:"omit",cache:"no-store",
  });
  const data=await response.json().catch(()=>({error:"转录接口无法读取回复"})) as {error?:string;segments?:{start:number;end:number;text:string}[]};
  if(!response.ok)throw new Error("Cloudflare 转录失败（HTTP "+response.status+"）："+(data.error||"请检查免费额度"));
  const cues=(data.segments??[]).filter(c=>Number.isFinite(c.start)&&Number.isFinite(c.end)&&typeof c.text==="string"&&c.text.trim())
    .map(c=>({start:Math.max(0,c.start),end:Math.max(c.start+0.1,c.end),text:c.text.trim()}));
  if(!cues.length)throw new Error("Cloudflare 未返回带时间戳的字幕，本片段未标记为完成；可以重试或使用 Groq");
  return {cues,timestamped:true};
}
export async function transcribeVideoWithAudioChunks(opts: {
  file: File;
  baseUrl: string;
  apiKey: string;
  model: string;
  signal: AbortSignal;
  backend?: "groq" | "cloudflare" | "custom";
  onPartial?: (cues:Cue[])=>void;
  maxSeconds?: number;
  onProgress?: (message: string) => void;
}): Promise<{ cues: Cue[]; timestamped: boolean; audioOnly: boolean }> {
  const { file, signal, onProgress } = opts;
  const cacheKey=await transcriptCacheKey(file,(opts.backend??"custom")+":"+opts.baseUrl+":"+opts.model,opts.maxSeconds);
  let checkpoint=await db.getLocalValue<SavedTranscript>(cacheKey);
  if(!checkpoint||!Array.isArray(checkpoint.completed))checkpoint={completed:[],updatedAt:Date.now()};
  const saved=checkpoint;
  const oldCues=()=>saved.completed.flatMap(x=>x.cues).sort((a,b)=>a.start-b.start);
  if(saved.completed.length){onProgress?.("已恢复 "+saved.completed.length+" 个本机转录片段，正在跳过已完成部分…");opts.onPartial?.(oldCues());}
  const saveChunk=async(start:number,end:number,cues:Cue[])=>{
    saved.completed=saved.completed.filter(x=>Math.abs(x.start-start)>0.01);
    saved.completed.push({start,end,cues});saved.completed.sort((a,b)=>a.start-b.start);
    saved.updatedAt=Date.now();
    await db.putLocalValue(cacheKey,saved);
    opts.onPartial?.(oldCues());
  };
  // A short paid test always extracts only the first sample; it must never upload the full video.
  if (opts.backend !== "cloudflare" && opts.maxSeconds === undefined && file.size <= TRANSCRIBE_MAX_BYTES) {
    onProgress?.("正在将短视频送往转录接口…");
    if(saved.completed.some(x=>x.start===0&&x.end===-1))return {cues:oldCues(),timestamped:true,audioOnly:false};
    const result = await transcribe(opts);
    if(result.timestamped)await saveChunk(0,-1,result.cues);
    return { ...result, audioOnly: false };
  }
  if (!file.type.startsWith("video/") && !/\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name)) {
    throw new Error("请先选择一个支持播放的视频文件");
  }
  const AudioCtor = window.AudioContext;
  if (!AudioCtor || typeof window.MediaRecorder === "undefined") {
    throw new Error("当前手机浏览器不支持本地音轨提取。可在新版 Chrome 中试试，或导入 SRT/VTT 字幕。");
  }

  const video = document.createElement("video");
  const url = URL.createObjectURL(file);
  let context: AudioContext | null = null;
  let recorder: MediaRecorder | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  const segmentSeconds = opts.backend==="cloudflare"?60:180; // Cloudflare conservative per-request audio cap.
  const out: Cue[] = oldCues();
  let allTimestamped = true;

  const assertNotCancelled = () => {
    if (signal.aborted) throw new DOMException("用户已取消转录", "AbortError");
  };
  const waitForReady = () => new Promise<void>((resolve, reject) => {
    if (video.readyState >= 1) { resolve(); return; }
    const ok = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("无法读取视频音轨，请先确认视频在共映里能够播放")); };
    const abort = () => { cleanup(); reject(new DOMException("用户已取消转录", "AbortError")); };
    const cleanup = () => { video.removeEventListener("loadedmetadata", ok); video.removeEventListener("error", fail); signal.removeEventListener("abort", abort); };
    video.addEventListener("loadedmetadata", ok, { once: true });
    video.addEventListener("error", fail, { once: true });
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    video.src = url;
    video.preload = "auto";
    video.playsInline = true;
    video.style.cssText = "position:fixed;left:-1000px;top:-1000px;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(video);
    await waitForReady();
    assertNotCancelled();
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("视频时长无效，无法分段转录");

    context = new AudioCtor();
    const source = context.createMediaElementSource(video);
    const destination = context.createMediaStreamDestination();
    source.connect(destination); // No speakers: only audio is captured.
    const track = destination.stream.getAudioTracks()[0];
    if (!track) throw new Error("未检测到音轨，无法录制音频");

    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(t => MediaRecorder.isTypeSupported(t));
    if (!mime) throw new Error("此 WebView 不支持音频录制格式，请改用 Chrome 或导入字幕");
    await context.resume();
    let start = 0;
    const endLimit = Math.min(video.duration, opts.maxSeconds ?? video.duration);
    while (start < endLimit - 0.1) {
      assertNotCancelled();
      const end = Math.min(endLimit, start + segmentSeconds);
      const done=saved.completed.find(x=>Math.abs(x.start-start)<0.01&&Math.abs(x.end-end)<0.01);
      if(done){onProgress?.("跳过已完成的 "+Math.round(start)+"–"+Math.round(end)+" 秒音轨");start=end;continue;}
      const parts: BlobPart[] = [];
      const current = new MediaRecorder(destination.stream, { mimeType: mime, audioBitsPerSecond: 48000 });
      recorder = current;
      const stopped = new Promise<void>((resolve, reject) => {
        current.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
        current.onerror = () => reject(new Error("音频录制失败，可能是浏览器不支持该视频的音轨编码"));
        current.onstop = () => resolve();
      });
      const stopRecording = () => { if (current.state !== "inactive") current.stop(); video.pause(); };
      onProgress?.(`正在提取音频：${Math.floor(start / 60)}:${String(Math.floor(start % 60)).padStart(2,"0")} / ${Math.floor(video.duration / 60)} 分（保持应用在前台）`);
      // Seek BEFORE recording. Recording while the video is seeking can create
      // empty clips or leave Android WebView waiting indefinitely.
      const waitForSeek = () => new Promise<void>((resolve, reject) => {
        if (!video.seeking && Math.abs(video.currentTime - start) < 0.4) { resolve(); return; }
        let timeout: ReturnType<typeof setTimeout>;
        const cleanup = () => {
          clearTimeout(timeout);
          video.removeEventListener("seeked", ready);
          video.removeEventListener("error", failed);
          signal.removeEventListener("abort", cancelled);
        };
        const ready = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error("无法定位到音频片段，请重新选择视频或重试此段")); };
        const cancelled = () => { cleanup(); reject(new DOMException("用户已取消转录", "AbortError")); };
        video.addEventListener("seeked", ready, { once: true });
        video.addEventListener("error", failed, { once: true });
        signal.addEventListener("abort", cancelled, { once: true });
        timeout = setTimeout(() => { cleanup(); reject(new Error("视频定位超过 20 秒未响应；已保存的字幕不会丢失，重新打开可续转")); }, 20000);
      });
      video.currentTime = start;
      await waitForSeek();
      assertNotCancelled();
      current.start();
      try {
        await Promise.race([
          video.play(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("音轨播放启动超时；请保持应用在前台重试")), 20000)),
        ]);
      } catch {
        stopRecording();
        throw new Error("浏览器无法启动音频播放，可能被安卓暂停。已完成片段已保存，可重新打开续转。");
      }
      await new Promise<void>((resolve, reject) => {
        let lastPosition = video.currentTime;
        let lastAdvanceAt = Date.now();
        let lastShownSecond = -1;
        const fail = (message: string) => {
          stopRecording();
          reject(new Error(message + "；已完成片段已保存，重新打开可从失败位置续转"));
        };
        const watch = () => {
          if (signal.aborted) { stopRecording(); reject(new DOMException("用户已取消转录", "AbortError")); return; }
          if (video.error) { fail("视频音频播放中断"); return; }
          if (video.currentTime >= end - 0.15 || video.ended) { stopRecording(); resolve(); return; }
          if (video.currentTime > lastPosition + 0.08) {
            lastPosition = video.currentTime;
            lastAdvanceAt = Date.now();
          }
          if (Date.now() - lastAdvanceAt > 15000) {
            fail("音轨连续 15 秒没有前进（安卓浏览器可能暂停或卡住）");
            return;
          }
          const second = Math.floor(video.currentTime);
          if (second !== lastShownSecond) {
            lastShownSecond = second;
            onProgress?.(`正在提取音频：${Math.floor(second / 60)}:${String(second % 60).padStart(2, "0")} / ${Math.floor(video.duration / 60)} 分（已完成片段自动保存）`);
          }
        };
        timer = setInterval(watch, 250);
        watch();
      }).finally(() => { if (timer) clearInterval(timer); timer = undefined; });
      await stopped;
      assertNotCancelled();
      if (!parts.length) throw new Error("无法从视频提取有效音轨；请使用带音频的视频或导入字幕");
      const ext = mime.includes("mp4") ? "m4a" : "webm";
      const audio = new File(parts, `cowatch-audio-${Math.floor(start)}.${ext}`, { type: mime });
      if (audio.size > TRANSCRIBE_MAX_BYTES) throw new Error("提取的音频片段仍超过 25MB，请尝试更短的视频");
      onProgress?.(`正在转录第 ${Math.floor(start / segmentSeconds) + 1} 段音频（${Math.round(audio.size / 1024)}KB）…`);
      const result = opts.backend==="cloudflare"
        ? await cloudflareTranscribeAudio({file:audio,start,end,signal})
        : await transcribe({ baseUrl: opts.baseUrl, apiKey: opts.apiKey, model: opts.model, file: audio, signal });
      if (!result.timestamped) allTimestamped = false;
      if (result.timestamped) {
        const segmentCues=result.cues.map(c=>({start:c.start+start,end:c.end+start,text:c.text}));
        out.push(...segmentCues);
        await saveChunk(start,end,segmentCues);
      }
      start = end;
      recorder = null;
    }
    return { cues: oldCues(), timestamped: allTimestamped && saved.completed.length>0, audioOnly: true };
  } finally {
    if (timer) clearInterval(timer);
    video.pause();
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* ignore cleanup issues */ }
    }
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
    if (context) void context.close().catch(() => undefined);
  }
}
