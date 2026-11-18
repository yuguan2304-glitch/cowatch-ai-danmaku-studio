import type { AudienceConfig } from "./types";

/** Neutral, general-purpose viewing presets. Fan/ship modes are opt-in only. */
export type ScenePreset = {
  id: string;
  label: string;
  emoji: string;
  optional?: boolean;
  identities: Record<string, number>;
  tones: Record<string, number>;
  sceneHint: string;
};

export const SCENE_PRESETS: ScenePreset[] = [
  { id: "general", label: "通用观影", emoji: "🍿", identities: { passerby: 40, fun: 35, tech: 25 }, tones: { lively: 50, meme: 50 }, sceneHint: "通用观影：像一群普通观众一起看，反应自然，不预设任何圈子或身份。" },
  { id: "game", label: "游戏实况", emoji: "🎮", identities: { tech: 35, fun: 35, roaster: 20, passerby: 10 }, tones: { excited: 50, meme: 50 }, sceneHint: "游戏实况：关注画面中可见的操作、关卡、战术和意外瞬间；不要编造游戏名、玩家身份或比分。" },
  { id: "anime", label: "动漫", emoji: "✨", identities: { veteran: 30, researcher: 25, fun: 25, passerby: 20 }, tones: { lively: 50, chatter: 50 }, sceneHint: "动漫：关注作画、分镜、角色表情和氛围；作品名和角色名只使用用户提供或字幕中出现的。" },
  { id: "drama", label: "影视剧", emoji: "🎬", identities: { passerby: 30, researcher: 25, roaster: 25, tech: 20 }, tones: { rational: 50, dry: 50 }, sceneHint: "影视剧：关注剧情走向、演技、镜头语言和细节；遵守防剧透。" },
  { id: "variety", label: "综艺", emoji: "😂", identities: { fun: 40, roaster: 30, passerby: 30 }, tones: { meme: 50, excited: 50 }, sceneHint: "综艺：抓笑点、反应和名场面，善意吐槽，不攻击真人。" },
  { id: "documentary", label: "纪录片", emoji: "🌍", identities: { researcher: 40, tech: 30, passerby: 30 }, tones: { rational: 60, gentle: 40 }, sceneHint: "纪录片：关注画面中的知识点、自然或人文细节，补充要克制，不确定的不要断言。" },
  { id: "original", label: "原创视频 / Vlog", emoji: "📹", identities: { passerby: 40, fan: 30, tech: 30 }, tones: { gentle: 50, lively: 50 }, sceneHint: "原创视频：友好地回应创作者的内容、剪辑和用心之处。" },
  { id: "cheer", label: "应援模式", emoji: "📣", optional: true, identities: { fan: 60, veteran: 20, fun: 20 }, tones: { excited: 60, lively: 40 }, sceneHint: "应援模式（用户主动选择）：热情支持画面中的人物或创作者，具体称呼请以用户填写为准。" },
  { id: "ship", label: "关系向（磕学家）", emoji: "💞", optional: true, identities: { shipper: 50, fun: 30, passerby: 20 }, tones: { lively: 50, meme: 50 }, sceneHint: "关系向（用户主动选择）：关注人物互动与默契；只讨论用户在 CP 设置里明确填写的组合。" },
];

export function applyScenePreset(a: AudienceConfig, p: ScenePreset): AudienceConfig {
  return { ...a, identities: { ...p.identities }, tones: { ...p.tones }, sceneHint: p.sceneHint };
}
