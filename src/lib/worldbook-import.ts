/** CoWatch private world-book import. All parsing runs on-device. */
export type ImportedWorldEntry = {
  id: string;
  name: string;
  keywords: string[];
  content: string;
  constant: boolean;
  enabled: boolean;
};
export type WorldBookImport = { fileName: string; entries: ImportedWorldEntry[]; warnings: string[] };

const obj = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const str = (v: unknown) => typeof v === "string" ? v : "";
const words = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,，|]/) : [])
  .filter((x): x is string => typeof x === "string").map(s => s.trim()).filter(Boolean).slice(0, 30);
const makeId = () => crypto.randomUUID();

function convertEntry(value: unknown, index: number): ImportedWorldEntry | null {
  if (typeof value === "string") return value.trim() ? {id:makeId(),name:"条目 "+(index+1),keywords:[],content:value.trim(),constant:true,enabled:true} : null;
  const row = obj(value);
  if (!row) return null;
  const content = str(row["content"] ?? row["text"] ?? row["entry"] ?? row["description"]).trim();
  if (!content) return null;
  const enabled = row["enabled"] !== false && row["disable"] !== true && row["disabled"] !== true;
  const constant = row["constant"] === true || row["mode"] === "constant" || row["selective"] === false;
  const keywords = words(row["key"] ?? row["keys"] ?? row["keyword"] ?? row["keywords"] ?? row["triggers"]);
  const secondary = words(row["keysecondary"] ?? row["secondary_keys"]);
  return {
    id:makeId(),
    name:(str(row["comment"] ?? row["name"] ?? row["title"]) || "条目 "+(index+1)).slice(0,100),
    keywords:[...new Set([...keywords, ...secondary])].slice(0,30),
    content:content.slice(0,12000),
    constant:constant || keywords.length === 0,
    enabled,
  };
}

/** Supports SillyTavern world_info JSON and character_book.entries, arrays and common simple JSON. */
export function parseWorldBookFile(fileName: string, raw: string): WorldBookImport {
  if (raw.length > 1024 * 1024) throw new Error("文件内容超过 1MB，请先拆分世界书");
  let rows: unknown[];
  const warnings: string[] = [];
  if (/\.json$/i.test(fileName)) {
    let data: unknown;
    try { data = JSON.parse(raw); } catch { throw new Error("JSON 解析失败，文件可能损坏或不是 JSON"); }
    if (typeof data === "string") {
      rows = data.split(/\r?\n/).filter(Boolean);
    } else if (Array.isArray(data)) {
      rows = data;
    } else {
      const root = obj(data);
      if (!root) throw new Error("JSON 世界书格式无法识别");
      const inner = obj(root["data"]);
      const character = obj(root["character_book"]) ?? obj(inner?.["character_book"]);
      const candidate = root["entries"] ?? character?.["entries"] ?? inner?.["entries"] ?? root["worldBook"] ?? root["worldbook"];
      if (Array.isArray(candidate)) rows = candidate;
      else if (obj(candidate)) rows = Object.values(candidate as Record<string,unknown>);
      else if (typeof candidate === "string") rows = candidate.split(/\r?\n/).filter(Boolean);
      else if (typeof root["content"] === "string") rows = [root];
      else throw new Error("找不到 entries 条目；支持酒馆世界书 JSON、角色卡 character_book、条目数组或 TXT/MD");
    }
  } else if (/\.(txt|md|markdown)$/i.test(fileName)) {
    const stripped = raw.replace(/\r\n?/g,"\n");
    // Tagged CoWatch syntax: [keywords] content; plain untagged lines become constant.
    rows = stripped.split("\n").filter(line=>line.trim() && !line.trim().startsWith("#")).map(line=>{
      const m = /^\[([^\]]{1,120})\]\s*(.+)$/.exec(line.trim());
      return m ? {content:m[2], key:m[1]==="*"?[]:m[1]!.split(/[,，|]/),constant:m[1]==="*" || /^观众[:：]/.test(m[1]??""),comment:m[1]} : {content:line,constant:true};
    });
  } else {
    throw new Error("暂支持 JSON、TXT、MD 文件");
  }
  if (rows.length > 1000) throw new Error("世界书条目超过 1000，请先精简或拆分");
  const entries: ImportedWorldEntry[] = [];
  for (let i=0;i<rows.length;i++){
    const parsed = convertEntry(rows[i],i);
    if(parsed) entries.push(parsed);
  }
  if (!entries.length) throw new Error("没有找到可导入的世界书内容");
  if (entries.length < rows.length) warnings.push("有 "+(rows.length-entries.length)+" 条缺少正文，已跳过");
  if(entries.some(x=>!x.enabled)) warnings.push("已保留原文件中禁用的条目，生成时不会使用");
  return {fileName,entries,warnings};
}

/** Only send relevant, enabled snippets. Never send the complete imported book. */
export function activeImportedWorldBook(entries: ImportedWorldEntry[]|undefined, title: string, subtitles: string): string {
  if (!entries?.length) return "";
  const context=(title+"\n"+subtitles).toLowerCase();
  const relevant = entries.filter(e=>e.enabled && (e.constant || e.keywords.some(k=>k.length>=2&&context.includes(k.toLowerCase()))));
  const lines:string[]=[];
  let length=0;
  for(const e of relevant){
    const content=e.content.replace(/\s+/g," ").trim().slice(0,360);
    const note=(e.name ? e.name+"：" : "")+content;
    if(length+note.length>1200)continue;
    lines.push(note);
    length+=note.length;
    if(lines.length>=12)break;
  }
  return lines.join("\n");
}
