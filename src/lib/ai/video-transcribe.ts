import { TRANSCRIBE_MAX_BYTES } from "@/lib/constants";
import { transcribe } from "./openai";
import type { Cue } from "@/lib/types";

/**
 * Large local videos are recorded as compact AUDIO ONLY segments in the user's
 * own browser, then sent individually to the user's configured transcription API.
 *
 * This fallback plays the media at normal speed in a hidden element. It cannot
 * work faster than playback; Android may pause it if the app goes into background.
 * A real-time capture is used only when the original file exceeds the upload cap.
 */
export async function transcribeVideoWithAudioChunks(opts: {
  file: File;
  baseUrl: string;
  apiKey: string;
  model: string;
  signal: AbortSignal;
  onProgress?: (message: string) => void;
}): Promise<{ cues: Cue[]; timestamped: boolean; audioOnly: boolean }> {
  const { file, signal, onProgress } = opts;
  if (file.size <= TRANSCRIBE_MAX_BYTES) {
    onProgress?.("正在将短视频送往转录接口…");
    const result = await transcribe(opts);
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
  const segmentSeconds = 180; // even at 64kbps, a segment is far below 25MB.
  const out: Cue[] = [];
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
    while (start < video.duration - 0.1) {
      assertNotCancelled();
      const end = Math.min(video.duration, start + segmentSeconds);
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
      current.start();
      video.currentTime = start;
      try { await video.play(); } catch {
        stopRecording();
        throw new Error("浏览器阻止后台音频提取。请保持共映在前台，并使用 Chrome 或安卓应用。");
      }
      await new Promise<void>((resolve, reject) => {
        const watch = () => {
          if (signal.aborted) { stopRecording(); reject(new DOMException("用户已取消转录", "AbortError")); return; }
          if (video.error) { stopRecording(); reject(new Error("视频音频播放中断")); return; }
          if (video.currentTime >= end - 0.15 || video.ended) { stopRecording(); resolve(); }
        };
        timer = setInterval(watch, 180);
        watch();
      }).finally(() => { if (timer) clearInterval(timer); timer = undefined; });
      await stopped;
      assertNotCancelled();
      if (!parts.length) throw new Error("无法从视频提取有效音轨；请使用带音频的视频或导入字幕");
      const ext = mime.includes("mp4") ? "m4a" : "webm";
      const audio = new File(parts, `cowatch-audio-${Math.floor(start)}.${ext}`, { type: mime });
      if (audio.size > TRANSCRIBE_MAX_BYTES) throw new Error("提取的音频片段仍超过 25MB，请尝试更短的视频");
      onProgress?.(`正在转录第 ${Math.floor(start / segmentSeconds) + 1} 段音频（${Math.round(audio.size / 1024)}KB）…`);
      const result = await transcribe({ baseUrl: opts.baseUrl, apiKey: opts.apiKey, model: opts.model, file: audio, signal });
      if (!result.timestamped) allTimestamped = false;
      if (result.timestamped) {
        out.push(...result.cues.map(c => ({ start: c.start + start, end: c.end + start, text: c.text })));
      }
      start = end;
      recorder = null;
    }
    return { cues: out, timestamped: allTimestamped && out.length > 0, audioOnly: true };
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
