import type { Cue } from "../types";

/** Extract and recognize audio locally in real time using WebAudio + a
 * dedicated Whisper worker. No audio is sent to CoWatch or a paid API.
 * Browser autoplay policies and CPU limitations apply.
 */
export async function transcribeLocalVideo(opts: {
  file: File;
  signal: AbortSignal;
  maxSeconds: number;
  modelHost?: string;
  onProgress: (text: string) => void;
  onPartial?: (cues: Cue[]) => void;
}): Promise<Cue[]> {
  if (!window.AudioContext || !window.Worker) throw new Error("当前浏览器不支持本地音频处理，请改用最新版 Chrome 或导入字幕。");
  const worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), {type: "module"});
  const video = document.createElement("video");
  const url = URL.createObjectURL(opts.file);
  const context = new AudioContext();
  let processor: ScriptProcessorNode | null = null;
  let source: MediaElementAudioSourceNode | null = null;
  let zeroGain: GainNode | null = null;
  let interval: ReturnType<typeof setInterval> | undefined;
  const samples: Float32Array[] = [];
  let sampleSize = 0;
  let seq = 0;
  let inProgress = false;
  let finished = false;
  const cues: Cue[] = [];
  const abortError = () => new DOMException("已取消本地识别", "AbortError");
  const ensureActive = () => { if (opts.signal.aborted) throw abortError(); };

  const waitForMetadata = () => new Promise<void>((resolve, reject) => {
    if (video.readyState >= 1) return resolve();
    const cleanup = () => {video.removeEventListener("loadedmetadata", ok);video.removeEventListener("error", bad);};
    const ok = () => {cleanup();resolve();};
    const bad = () => {cleanup();reject(new Error("本地视频无法解码音轨"));};
    video.addEventListener("loadedmetadata", ok, {once:true});
    video.addEventListener("error", bad, {once:true});
  });
  const sendWorker = <T>(request: object, kind: "ready" | "result", id = 0): Promise<T> => new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<{kind:string; id?:number; cues?:Cue[]; text?:string; message?:string}>) => {
      const m = event.data;
      if (m.kind === "progress") {opts.onProgress(m.text || "模型加载中"); return;}
      if (m.kind === "error") {cleanup();reject(new Error(m.message || "本地识别失败"));return;}
      if (m.kind === kind && (kind === "ready" || m.id === id)) {cleanup();resolve(m as T);}
    };
    const onError = () => {cleanup();reject(new Error("本地语音模型工作线程加载失败，请检查网络和浏览器支持情况"));};
    const onAbort = () => {cleanup();reject(abortError());};
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      opts.signal.removeEventListener("abort", onAbort);
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError, {once:true});
    opts.signal.addEventListener("abort", onAbort, {once:true});
    worker.postMessage(request);
  });
  function resample(input: Float32Array, from: number): Float32Array {
    const size = Math.max(1, Math.round(input.length * 16000 / from));
    const output = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const x = i * from / 16000;
      const left = Math.min(input.length - 1, Math.floor(x));
      const right = Math.min(input.length - 1, left + 1);
      const weight = x - left;
      output[i] = input[left]! * (1 - weight) + input[right]! * weight;
    }
    return output;
  }
  try {
    video.src = url;
    video.preload = "auto";
    video.playsInline = true;
    video.style.cssText = "position:fixed;left:-1000px;top:-1000px;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(video);
    await waitForMetadata();
    ensureActive();
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("无法获取视频时长");
    const endAt = Math.min(video.duration, opts.maxSeconds);
    opts.onProgress("准备本地英语语音模型…首次可能需要下载数十 MB 到上百 MB 文件");
    await sendWorker({kind:"load",modelHost:opts.modelHost}, "ready");
    ensureActive();

    source = context.createMediaElementSource(video);
    processor = context.createScriptProcessor(4096, 1, 1);
    zeroGain = context.createGain();
    zeroGain.gain.value = 0;
    source.connect(processor);
    processor.connect(zeroGain);
    zeroGain.connect(context.destination);
    await context.resume();
    let chunkStart = 0;
    const processChunk = async (end: number) => {
      if (inProgress || sampleSize === 0) return;
      inProgress = true;
      video.pause();
      const collected = new Float32Array(sampleSize);
      let position = 0;
      for (const part of samples) {collected.set(part, position);position += part.length;}
      samples.length = 0;
      sampleSize = 0;
      const pcm = resample(collected, context.sampleRate);
      opts.onProgress("本地识别中：" + Math.round(chunkStart) + "–" + Math.round(end) + " 秒；无需 API 额度");
      const id = ++seq;
      const data = await sendWorker<{cues: Cue[]}>({kind:"recognize",id,data:pcm,offset:chunkStart},"result",id);
      cues.push(...(data.cues || []).filter(c=>c.text.trim() && c.start < endAt));
      opts.onPartial?.([...cues]);
      chunkStart = end;
      inProgress = false;
      ensureActive();
      if (end >= endAt - 0.15) finished = true;
      else await video.play().catch(() => {throw new Error("浏览器暂停了视频提取；请保持页面在前台并重新开始");});
    };
    processor.onaudioprocess = event => {
      if (video.paused || inProgress || opts.signal.aborted) return;
      const input = event.inputBuffer.getChannelData(0);
      samples.push(new Float32Array(input));
      sampleSize += input.length;
    };
    await video.play().catch(() => {throw new Error("浏览器阻止自动播放音轨，请再次点击本地识别并保持共映在前台");});
    await new Promise<void>((resolve, reject) => {
      let processing = false;
      const tick = async () => {
        try {
          ensureActive();
          if (finished) {resolve(); return;}
          if (processing || inProgress) return;
          if (video.error) throw new Error("音轨读取中断");
          if (video.currentTime >= Math.min(endAt, chunkStart + 20) - 0.1 || video.ended) {
            processing = true;
            await processChunk(Math.min(endAt, video.currentTime));
            processing = false;
            if (finished) resolve();
          } else {
            opts.onProgress("正在本机读取声音：" + Math.floor(video.currentTime) + "/" + Math.floor(endAt) + " 秒（保持前台）");
          }
        } catch (e) {reject(e);}
      };
      interval = setInterval(() => {void tick();}, 250);
      void tick();
    });
    return cues;
  } finally {
    if (interval) clearInterval(interval);
    video.pause();
    if (processor) {processor.onaudioprocess = null; processor.disconnect();}
    source?.disconnect();
    zeroGain?.disconnect();
    void context.close().catch(() => undefined);
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
    worker.terminate();
  }
}
