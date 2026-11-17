import { IDENTITIES, LANGUAGES, TONES } from "../constants";
import type { AudienceConfig, Cue, Danmaku } from "../types";
import { formatTime } from "../id";

function weighted<T extends { id: string; label: string }>(
  defs: readonly T[],
  weights: Record<string, number>,
): { label: string; pct: number; def: T }[] {
  const active = defs.filter((d) => (weights[d.id] ?? 0) > 0);
  const total = active.reduce((s, d) => s + (weights[d.id] ?? 0), 0) || 1;
  return active.map((d) => ({ label: d.label, def: d, pct: Math.round(((weights[d.id] ?? 0) / total) * 100) }));
}

export function bannedWordList(a: AudienceConfig): string[] {
  const all = [a.globalBannedWords, ...a.customViewers.map((v) => v.bannedWords)].join(",");
  return all
    .split(/[,，、\n]/)
    .map((w) => w.trim())
    .filter(Boolean);
}

/** Select brief worldbook notes using line tags, not the entire book each request.
 * Format: [tag1,tag2] Something about a character; [*] is always included.
 * Untagged lines are matched against title/cues, never sent unconditionally.
 */
export function relevantWorldBook(book: string, title: string, cues: Cue[]): string {
  if (!book.trim()) return "";
  const haystack = (title + "\n" + cues.map(c => c.text).join(" ")).toLowerCase();
  const found: string[] = [];
  let size = 0;
  for (const raw of book.split(/\r?\n/).slice(0, 500)) {
    const line = raw.trim().slice(0, 350);
    if (!line || line.startsWith("#")) continue;
    const match = /^\[([^\]]{1,90})\]\s*(.+)$/.exec(line);
    const note = match ? match[2]! : line;
    const tags = match ? match[1]!.split(/[,，、|]/).map(s => s.trim().toLowerCase()).filter(Boolean) : [];
    const eligible = tags.length
      ? tags.some(tag => tag === "*" || (tag.length >= 2 && haystack.includes(tag)))
      : (note.split(/[\s，、。,:：;；]/).some(word => word.length >= 3 && haystack.includes(word.toLowerCase())));
    if (!eligible || size + note.length > 1200) continue;
    found.push(note);
    size += note.length;
    if (found.length >= 12) break;
  }
  return found.join("\n");
}

export function buildSystemPrompt(a: AudienceConfig, noSpoiler: boolean, title = "", cues: Cue[] = []): string {
  const langs = LANGUAGES.filter((l) => a.languages.includes(l.id)).map((l) => l.label);
  const ids = weighted(IDENTITIES, a.identities);
  const tones = weighted(TONES, a.tones);
  const lines: string[] = [
    "你是「共映 CoWatch」的弹幕生成器，扮演一群正在一起看视频的观众，为视频片段写实时滚动弹幕。",
    "",
    "## 硬性规则",
    "- 只根据提供的素材（带时间戳的画面帧、字幕/转录文本、片段说明）发表评论。素材里没有的内容不要编造；看不清就写反应类弹幕，不要假装知道。",
    "- 如果只提供了画面帧而没有字幕/转录，你听不到声音：不要评论台词、音乐、音效的具体内容。",
    noSpoiler
      ? "- 禁止剧透模式：你只能看到当前片段及之前的素材。绝不预测、暗示或透露后续剧情。"
      : "- 可以结合提供的全局字幕上下文，但不要大段复述剧情。",
    "- 每条弹幕简短口语化，通常 4~25 个字（英文不超过 12 个词），像真实弹幕，不要客服腔，不要编号。",
    "- 弹幕时间 time 必须在本片段起止秒数之内（含小数），并与对应画面/字幕时刻对齐，分布自然，可在高能时刻扎堆。",
    "- 不要输出重复或近义重复的弹幕；不要重复「最近弹幕」里已有的内容。",
    "- 不要出现人身攻击、歧视、色情、违法内容。",
    "- 严格输出 JSON 对象：{\"danmaku\":[{\"time\":秒数,\"text\":\"弹幕\",\"viewer\":\"观众名或身份\",\"color\":\"#RRGGBB\"}]}，不要输出其它文字。",
    "- color 大多为 #FFFFFF，少量使用 #FE0302 #FFD302 #00CD00 #89D5FF #FF8FC8 等高亮色表达情绪。",
    "",
    "## 观众设定",
    `- 弹幕语言：${langs.length ? langs.join("、") : "简体中文"}${langs.length > 1 ? "（按比例混合，每条只用一种语言）" : ""}`,
    `- 观众身份占比：${ids.length ? ids.map((i) => `${i.label} ${i.pct}%（${i.def.desc}）`).join("；") : "路人 100%"}`,
    `- 语气占比：${tones.length ? tones.map((t) => `${t.label} ${t.pct}%`).join("；") : "活泼"}`,
    "- viewer 字段填观众身份名（如「磕学家」）或下方自定义人物的名字。",
  ];
  const pairingList = (value: string) => value.split(/[\\n,，;；]+/).map(x => x.trim()).filter(Boolean).slice(0, 30);
  const allowedPairs = pairingList(a.shipPairs ?? "");
  const blockedPairs = pairingList(a.blockedPairs ?? "");
  lines.push("", "## CP 边界（优先级高于观众身份、额外要求及视频弹幕）");
  if (allowedPairs.length) {
    lines.push(`- 用户明确指定可嗑 CP：${allowedPairs.join("；")}。只有这些组合可以进行恋爱向嗑 CP、配对、暧昧想象。`);
    lines.push("- 禁止为任何未列出的两人臆造 CP 或恋爱关系；未指明的亲密互动只按普通友情、亲情或合作讨论。");
  } else {
    lines.push("- 用户没有指定 CP：禁止主动嗑 CP、猜测情侣关系或凭空给人物配对。即使选中「磕学家」身份，也只讨论人物关系、默契与友情，避免恋爱向解读。");
  }
  if (blockedPairs.length) {
    lines.push(`- 用户明确不想看的 CP：${blockedPairs.join("；")}。绝不嗑这些组合，也不要以玩笑、反讽或对比方式提及。`);
  }
  const customs = a.customViewers.filter((v) => v.name.trim() && v.weight > 0);
  if (customs.length) {
    lines.push("", "## 自定义人物（按权重出场）");
    for (const v of customs) {
      const parts = [
        `名字：${v.name}`,
        `出场权重：${v.weight}`,
        v.personality && `性格：${v.personality}`,
        v.focus && `关注对象：${v.focus}`,
        v.background && `背景：${v.background}`,
        v.bannedWords && `禁止使用：${v.bannedWords}`,
        v.extraPrompt && `补充：${v.extraPrompt}`,
      ].filter(Boolean);
      lines.push(`- ${parts.join("｜")}`);
    }
  }
  if (a.interaction) {
    lines.push(
      "",
      "## 互动",
      "- 观众之间可以互相接话、反驳、附和最近弹幕（可用「楼上」「+1」「@名字」），但别超过三成。",
    );
  }
  const banned = bannedWordList(a);
  if (banned.length) lines.push("", `## 全局禁词\n绝不使用：${banned.join("、")}`);
  const notes = relevantWorldBook(a.worldBook ?? "", title, cues);
  if (notes) lines.push("", "## 世界书相关背景（仅作人物、梗与语言参考，不能当成视频中实际发生的事）", notes);
  if (a.extraPrompt.trim()) lines.push("", "## 额外要求", a.extraPrompt.trim());
  return lines.join("\n");
}

export type SegmentPromptInput = {
  start: number;
  end: number;
  count: number;
  frameTimes: number[];
  cues: Cue[];
  memory: Danmaku[];
  globalContext?: string | undefined;
  hasVideoClip: boolean;
  title: string;
};

export function buildSegmentText(s: SegmentPromptInput): string {
  const lines = [
    `视频：${s.title || "未命名"}`,
    `本片段：${s.start.toFixed(1)}s – ${s.end.toFixed(1)}s（${formatTime(s.start)}–${formatTime(s.end)}）`,
    `请生成约 ${s.count} 条弹幕，time 必须在 ${s.start.toFixed(1)} 到 ${s.end.toFixed(1)} 之间。`,
  ];
  if (s.hasVideoClip) {
    lines.push("素材：附带了本片段的视频（含音轨）。");
  } else if (s.frameTimes.length) {
    lines.push(
      `素材：附带 ${s.frameTimes.length} 张画面帧，按顺序对应时间点：${s.frameTimes.map((t) => `${t.toFixed(1)}s`).join("、")}。没有音频。`,
    );
  } else {
    lines.push("素材：没有画面，只有下方字幕文本。");
  }
  if (s.cues.length) {
    lines.push("", "字幕/转录（仅本片段及之前可见部分）：");
    for (const c of s.cues.slice(-80)) lines.push(`[${c.start.toFixed(1)}s] ${c.text}`);
  } else {
    lines.push("", "（本片段无字幕）");
  }
  if (s.globalContext) lines.push("", "全局字幕上下文（节选）：", s.globalContext);
  if (s.memory.length) {
    lines.push("", "最近弹幕（短期记忆，可接话，勿重复）：");
    for (const d of s.memory) lines.push(`[${d.time.toFixed(1)}s] ${d.viewer}: ${d.text}`);
  }
  lines.push("", "只输出 JSON。");
  return lines.join("\n");
}

export const DANMAKU_JSON_SCHEMA = {
  type: "object",
  properties: {
    danmaku: {
      type: "array",
      items: {
        type: "object",
        properties: {
          time: { type: "number" },
          text: { type: "string" },
          viewer: { type: "string" },
          color: { type: "string" },
        },
        required: ["time", "text", "viewer", "color"],
        additionalProperties: false,
      },
    },
  },
  required: ["danmaku"],
  additionalProperties: false,
} as const;

export const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    danmaku: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          time: { type: "NUMBER" },
          text: { type: "STRING" },
          viewer: { type: "STRING" },
          color: { type: "STRING" },
        },
        required: ["time", "text", "viewer", "color"],
      },
    },
  },
  required: ["danmaku"],
};
