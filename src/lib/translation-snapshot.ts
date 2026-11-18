import { db } from "./db";
import type { Cue } from "./types";

type Entry = { start:number; original:string; translated:string };
type Snapshot = { entries:Entry[]; updatedAt:number };
const queues=new Map<string,Promise<unknown>>();
export function translationSnapshotKey(file:File,target:string):string {
  return "cowatch:translation-snapshot:v1:"+JSON.stringify([file.name,file.size,file.lastModified,target]);
}
function match(a:Entry,b:Entry):boolean {
  return a.original===b.original && Math.abs(a.start-b.start)<0.3;
}
export async function readTranslationSnapshot(file:File,target:string,cues:Cue[]):Promise<Record<number,string>> {
  const key=translationSnapshotKey(file,target);
  await queues.get(key)?.catch(()=>undefined);
  const saved=await db.getLocalValue<Snapshot>(key);
  const result:Record<number,string>={};
  if(!saved?.entries?.length)return result;
  for(let i=0;i<cues.length;i++){
    const cue=cues[i]!;
    const candidate=saved.entries.find(e=>e.original===cue.text&&Math.abs(e.start-cue.start)<0.3);
    if(candidate?.translated)result[i]=candidate.translated;
  }
  return result;
}
/** Append/update only nonempty translations, never delete old results when a UI session resets. */
export function preserveTranslations(file:File,target:string,cues:Cue[],translations:Record<number,string>):Promise<void> {
  const key=translationSnapshotKey(file,target);
  const updates:Entry[]=cues.flatMap((c,i)=>{
    const t=translations[i];
    return typeof t==="string"&&t.trim()?[{start:c.start,original:c.text,translated:t}]:[];
  });
  if(!updates.length)return Promise.resolve();
  const previous=queues.get(key)??Promise.resolve();
  const next=previous.catch(()=>undefined).then(async()=>{
    const existing=await db.getLocalValue<Snapshot>(key);
    const entries=[...(existing?.entries??[])];
    for(const item of updates){
      const index=entries.findIndex(e=>match(e,item));
      if(index>=0)entries[index]=item;
      else entries.push(item);
    }
    await db.putLocalValue(key,{entries,updatedAt:Date.now()} satisfies Snapshot);
  });
  queues.set(key,next);
  void next.finally(()=>{if(queues.get(key)===next)queues.delete(key);}).catch(()=>undefined);
  return next;
}
