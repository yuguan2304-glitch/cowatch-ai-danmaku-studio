import { useApp } from "@/lib/store";
import { resetVideoCache, cancelGeneration } from "@/lib/ai/generator";
import { parseVideoUrl } from "@/lib/video-url";
import { parseSubtitles } from "@/lib/subtitles";

let currentObjectUrl: string | null = null;

function releaseObjectUrl() {
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = null;
}

export function openLocalFile(file: File): string | null {
  if (!file.type.startsWith("video/") && !/\.(mp4|webm|mov|m4v|mkv|ogv)$/i.test(file.name)) {
    return "请选择视频文件";
  }
  cancelGeneration();
  releaseObjectUrl();
  resetVideoCache();
  const src = URL.createObjectURL(file);
  currentObjectUrl = src;
  useApp.getState().setSource({ kind: "file", src, label: file.name, file, crossOrigin: false, analyzable: true });
  return null;
}

export function openUrl(input: string): string | null {
  const parsed = parseVideoUrl(input);
  if (parsed.kind === "invalid") return parsed.reason;
  cancelGeneration();
  releaseObjectUrl();
  resetVideoCache();
  const st = useApp.getState();
  if (parsed.kind === "youtube") {
    st.setSource({
      kind: "youtube",
      src: "",
      youtubeId: parsed.id,
      label: `https://www.youtube.com/watch?v=${parsed.id}`,
      crossOrigin: false,
      analyzable: false,
      note: "YouTube 嵌入仅用于播放：本应用无法读取其画面或音频。弹幕会与播放进度同步；如需 AI 生成，请导入该视频的字幕，或改用本地文件。",
    });
  } else if (parsed.kind === "bilibili") {
    st.setSource({
      kind: "bilibili",
      src: "",
      bilibiliEmbed: parsed.embed,
      label: input.trim(),
      crossOrigin: false,
      analyzable: false,
      note: "B站外链播放器仅能播放，不提供播放进度与画面读取，因此无法叠加同步弹幕或分析。请下载授权内容后以本地文件打开。",
    });
  } else {
    st.setSource({ kind: "url", src: parsed.url, label: parsed.url, crossOrigin: true, analyzable: true });
  }
  return null;
}

export async function importSubtitleFile(file: File): Promise<string> {
  const text = await file.text();
  const cues = parseSubtitles(text);
  if (!cues.length) throw new Error("没有解析到字幕（支持 SRT / WebVTT）");
  useApp.getState().setCues(cues, file.name);
  return `已导入 ${cues.length} 条字幕`;
}
