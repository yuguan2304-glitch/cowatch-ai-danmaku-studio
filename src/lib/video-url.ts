export type ParsedVideoUrl =
  | { kind: "youtube"; id: string }
  | { kind: "bilibili"; embed: string }
  | { kind: "direct"; url: string }
  | { kind: "invalid"; reason: string };

export function parseVideoUrl(input: string): ParsedVideoUrl {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { kind: "invalid", reason: "不是有效的链接" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { kind: "invalid", reason: "仅支持 http(s) 链接" };
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    if (/^[\w-]{11}$/.test(id)) return { kind: "youtube", id };
  }
  if (host.endsWith("youtube.com") || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return { kind: "youtube", id: v };
    const m = url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})/);
    if (m) return { kind: "youtube", id: m[1] };
    return { kind: "invalid", reason: "无法识别 YouTube 视频 ID" };
  }
  if (host.endsWith("bilibili.com") || host === "b23.tv") {
    const bv = (url.pathname + url.search).match(/(BV[0-9A-Za-z]{10})/);
    const page = url.searchParams.get("p") ?? "1";
    if (bv) {
      return {
        kind: "bilibili",
        embed: `https://player.bilibili.com/player.html?bvid=${bv[1]}&page=${encodeURIComponent(page)}&autoplay=0&high_quality=1`,
      };
    }
    const av = url.pathname.match(/av(\d+)/i);
    if (av) {
      return {
        kind: "bilibili",
        embed: `https://player.bilibili.com/player.html?aid=${av[1]}&page=${encodeURIComponent(page)}&autoplay=0`,
      };
    }
    return { kind: "invalid", reason: "无法识别 B站 BV/av 号（短链请先在浏览器打开获取完整链接）" };
  }
  return { kind: "direct", url: url.toString() };
}

/** Validate an AI provider base URL: https required except localhost. */
export function checkBaseUrl(input: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, reason: "Base URL 格式无效" };
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    return { ok: false, reason: "为保护密钥，仅允许 https（本机 localhost 可用 http）" };
  }
  if (url.username || url.password) return { ok: false, reason: "Base URL 不应包含用户名或密码" };
  return { ok: true, url };
}
