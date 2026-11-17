import type { AudienceConfig, Settings } from "./types";

export const IDENTITIES = [
  { id: "fan", label: "粉丝", desc: "支持角色/创作者，夸夸、应援、护主" },
  { id: "fun", label: "乐子人", desc: "看热闹、抓笑点、整活" },
  { id: "shipper", label: "磕学家", desc: "关注人物关系与互动，嗑CP" },
  { id: "tech", label: "技术党", desc: "关注镜头、剪辑、画质、制作细节" },
  { id: "passerby", label: "路人", desc: "第一次看，直观反应和提问" },
  { id: "veteran", label: "老粉", desc: "熟悉过往内容，怀旧、对比、科普梗" },
  { id: "roaster", label: "吐槽役", desc: "精准吐槽画面槽点" },
  { id: "researcher", label: "考据党", desc: "考据细节、出处、背景知识" },
] as const;

export const TONES = [
  { id: "lively", label: "活泼" },
  { id: "meme", label: "玩梗" },
  { id: "gentle", label: "温柔" },
  { id: "dry", label: "冷幽默" },
  { id: "rational", label: "理性" },
  { id: "sharp", label: "毒舌" },
  { id: "chatter", label: "碎碎念" },
  { id: "excited", label: "激动" },
] as const;

export const LANGUAGES = [
  { id: "zh-Hans", label: "简体中文" },
  { id: "zh-Hant", label: "繁體中文" },
  { id: "en", label: "English" },
  { id: "ja", label: "日本語" },
  { id: "ko", label: "한국어" },
  { id: "es", label: "Español" },
  { id: "fr", label: "Français" },
] as const;

export const DENSITY_MIN = 5;
export const DENSITY_MAX = 100;
export const DEFAULT_DENSITY = 35;

export const TOTAL_LIMIT_OPTIONS: (number | null)[] = [null, 100, 300, 500, 1000, 2000, 5000];

export const DANMAKU_COLORS = [
  "#FFFFFF",
  "#FE0302",
  "#FF7204",
  "#FFAA02",
  "#FFD302",
  "#00CD00",
  "#89D5FF",
  "#4266BE",
  "#CC0273",
  "#FF8FC8",
];

export function defaultAudience(): AudienceConfig {
  return {
    languages: ["zh-Hans"],
    identities: { fan: 40, fun: 35, shipper: 25 },
    tones: { lively: 50, meme: 50 },
    customViewers: [],
    interaction: true,
    memorySize: 20,
    globalBannedWords: "",
    extraPrompt: "",
    worldBook: "",
    shipPairs: "",
    blockedPairs: "",
  };
}

export function defaultSettings(): Settings {
  return {
    provider: {
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      jsonMode: true,
      imageDetail: "low",
      geminiInput: "frames",
      inputPricePerM: null,
      outputPricePerM: null,
      transcribeBaseUrl: "https://api.openai.com/v1",
      transcribeModel: "whisper-1",
      transcribeUseMainKey: true,
    },
    analysis: {
      frameInterval: 5,
      segmentLength: 30,
      frameMaxWidth: 512,
      jpegQuality: 0.7,
    },
    generation: {
      density: DEFAULT_DENSITY,
      totalLimit: null,
      noSpoiler: true,
      bufferMode: "full",
      lookahead: 60,
      maxRetries: 2,
      requestLimit: 10,
    },
    audience: defaultAudience(),
    display: {
      enabled: true,
      crossSeconds: 8,
      fontSize: 24,
      opacity: 0.9,
      displayDensity: 1,
      area: 0.75,
      showViewer: false,
    },
  };
}

export const PROVIDER_PRESETS = [
  { label: "OpenAI", kind: "openai" as const, baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { label: "OpenRouter", kind: "openai" as const, baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  { label: "本地 Ollama", kind: "openai" as const, baseUrl: "http://localhost:11434/v1", model: "llava" },
  { label: "Gemini 原生", kind: "gemini" as const, baseUrl: "https://generativelanguage.googleapis.com", model: "gemini-2.5-flash" },
];

export const GEMINI_INLINE_VIDEO_MAX_BYTES = 14 * 1024 * 1024;
export const TRANSCRIBE_MAX_BYTES = 25 * 1024 * 1024;
