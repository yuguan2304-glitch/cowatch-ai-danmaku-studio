import type { Settings } from "../types";

export type CostEstimate = {
  requests: number;
  frames: number;
  inputTokens: number;
  outputTokens: number;
  usd: number | null;
  note: string;
};

export function imageTokens(settings: Settings): number {
  const w = settings.analysis.frameMaxWidth;
  const h = Math.round((w * 9) / 16);
  if (settings.provider.kind === "gemini") {
    if (w <= 384 && h <= 384) return 258;
    return Math.ceil(w / 768) * Math.ceil(h / 768) * 258;
  }
  if (settings.provider.imageDetail === "low") return 85;
  return 85 + 170 * Math.ceil(w / 512) * Math.ceil(h / 512);
}

/** Rough token/cost estimate. Returns usd=null when pricing is not filled in. */
export function estimateCost(
  settings: Settings,
  duration: number,
  opts: { canUseFrames: boolean; useVideo: boolean; subtitleChars: number },
): CostEstimate {
  const { analysis, generation, provider } = settings;
  const segLen = Math.max(5, analysis.segmentLength);
  const allSegments = duration > 0 ? Math.ceil(duration / segLen) : 0;
  const requests = Math.min(allSegments, generation.requestLimit == null ? allSegments : Math.max(1, generation.requestLimit));
  const framesPerSeg = opts.canUseFrames && !opts.useVideo ? Math.max(1, Math.floor(segLen / analysis.frameInterval)) : 0;
  const frames = framesPerSeg * requests;
  const systemTokens = 900;
  const memoryTokens = settings.audience.memorySize * 25;
  const subtitleTokens = Math.round(opts.subtitleChars * 0.8);
  const videoTokens = opts.useVideo ? Math.round(duration * 300) : 0;
  let total = generation.totalLimit ?? Infinity;
  const perSegCount = Math.max(1, Math.round((generation.density * segLen) / 60));
  const totalDanmaku = Math.min(total, perSegCount * requests);
  total = totalDanmaku;
  const inputTokens =
    requests * (systemTokens + memoryTokens + 200) + frames * imageTokens(settings) + subtitleTokens + videoTokens;
  const outputTokens = Math.round(total * 35);
  const priced = provider.inputPricePerM !== null && provider.outputPricePerM !== null;
  const usd = priced
    ? (inputTokens / 1e6) * (provider.inputPricePerM ?? 0) + (outputTokens / 1e6) * (provider.outputPricePerM ?? 0)
    : null;
  return {
    requests,
    frames,
    inputTokens,
    outputTokens,
    usd,
    note: priced
      ? "按你填写的单价粗略估算，实际以供应商账单为准（推理模型会产生额外思考 token）。"
      : "未填写模型单价，无法预估费用；仅显示 token 粗估。",
  };
}
