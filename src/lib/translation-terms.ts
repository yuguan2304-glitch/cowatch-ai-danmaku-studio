/** Local, user-managed translation terminology libraries. No API keys or videos. */
export type TermEntry={id:string;source:string;target:string;note:string};
export type TermGroup={id:string;name:string;entries:TermEntry[];updatedAt:number};
const STORAGE="cowatch:term-groups:v1";
const SELECTED="cowatch:term-group-selected:v1";
const newId=()=>crypto.randomUUID?.()??Math.random().toString(36).slice(2);
function safeEntry(value:unknown):TermEntry|null{
 if(!value||typeof value!=="object")return null;
 const x=value as Record<string,unknown>;
 const source=String(x["source"]??x["term"]??x["original"]??x["key"]??"").trim().slice(0,120);
 const target=String(x["target"]??x["translation"]??x["translated"]??x["value"]??"").trim().slice(0,160);
 if(!source||!target)return null;
 return {id:typeof x["id"]==="string"?x["id"]:newId(),source,target,note:typeof x["note"]==="string"?x["note"].slice(0,300):""};
}
export function loadTermGroups():TermGroup[]{
 try{
  const raw=JSON.parse(localStorage.getItem(STORAGE)??"[]") as unknown;
  if(!Array.isArray(raw))return [];
  return raw.slice(0,80).flatMap(x=>{
   if(!x||typeof x!=="object")return [];
   const g=x as Record<string,unknown>;
   if(typeof g["id"]!=="string"||typeof g["name"]!=="string"||!Array.isArray(g["entries"]))return [];
   return [{id:g["id"],name:g["name"].slice(0,80),entries:g["entries"].slice(0,500).map(safeEntry).filter((v):v is TermEntry=>v!==null),updatedAt:Number(g["updatedAt"])||Date.now()}];
  });
 }catch{return [];}
}
export function saveTermGroups(groups:TermGroup[]){
 if(groups.length>80||groups.some(g=>g["entries"].length>500))throw new Error("最多 80 个分类，每类最多 500 条术语");
 localStorage.setItem(STORAGE,JSON.stringify(groups));
}
export function selectedTermGroupId(){try{return localStorage.getItem(SELECTED)||"";}catch{return "";}}
export function saveSelectedTermGroupId(id:string){try{localStorage.setItem(SELECTED,id);}catch{}}
export function parseTermFile(name:string,text:string):TermEntry[]{
 if(text.length>1024*1024)throw new Error("术语文件不能超过 1 MB");
 let rows:unknown[]=[];
 if(/\.json$/i.test(name)){
  const parsed:unknown=JSON.parse(text);
  if(Array.isArray(parsed))rows=parsed;
  else if(parsed&&typeof parsed==="object"){
   const data=parsed as Record<string,unknown>;
   if(Array.isArray(data["entries"]))rows=data["entries"];
   else if(Array.isArray(data["terms"]))rows=data["terms"];
   else if(data["character_book"]&&typeof data["character_book"]==="object"&&Array.isArray((data["character_book"] as Record<string,unknown>).entries))rows=(data["character_book"] as {entries:unknown[]}).entries;
   else rows=Object.entries(data).map(([source,target])=>({source,target}));
  }
 }else if(/\.(txt|md|markdown|csv|tsv)$/i.test(name)){
  rows=text.split(/\r?\n/).map(line=>{
   const trimmed=line.trim();
   if(!trimmed||trimmed.startsWith("#"))return null;
   const m=/^(.+?)\s*(?:=|=>|→|\t|,|，)\s*(.+)$/.exec(trimmed);
   return m?{source:m[1],target:m[2]}:null;
  });
 }else throw new Error("支持 JSON / TXT / MD / CSV / TSV 文件");
 const entries=rows.map(row=>{
  if(row&&typeof row==="object"&&"content" in row){
   const r=row as Record<string,unknown>;
   const source=typeof r["comment"]==="string"?r["comment"]:typeof r["name"]==="string"?r["name"]:"";
   const target=typeof r["content"]==="string"?r["content"]:"";
   return safeEntry({source,target});
  }
  return safeEntry(row);
 }).filter((x):x is TermEntry=>x!==null);
 if(!entries.length)throw new Error("没有识别出术语：请用「原词 = 译名」，或 JSON 里的 source/target 字段");
 if(entries.length>500)throw new Error("单次最多导入 500 条术语");
 return entries;
}
export function composeTerminology(group:TermGroup|undefined,legacy:string){
 const lines=(group?.entries??[]).map(e=>e.source+" = "+e.target+(e.note?"（"+e.note+"）":""));
 return [legacy.trim(),...lines].filter(Boolean).join("\n").slice(0,10000);
}
export function uniqueTerms(items:TermEntry[]){
 const seen=new Set<string>();
 return items.filter(item=>{const k=item.source.toLocaleLowerCase();if(seen.has(k))return false;seen.add(k);return true;});
}
export function newTermGroup(name:string):TermGroup{return {id:newId(),name,entries:[],updatedAt:Date.now()};}
export function newTerm(source:string,target:string,note=""):TermEntry{return {id:newId(),source,target,note};}
