import { exportDeviceTransfer, importDeviceTransfer } from "./device-transfer";
import { useApp } from "./store";

// This is a private 256-bit pairing secret, not a user-chosen password.
// No Supabase project or third-party account is required.
const STORAGE_KEY = "cowatch:pairing-code:v1";
const API = "https://cowatch-ai-danmaku-studio.yuguan2304.workers.dev/api/sync/v1";
const MAX_BYTES = 500_000;
let busy=false;

function encode(b:Uint8Array):string{
  let value="";for(const byte of b)value+=String.fromCharCode(byte);
  return btoa(value).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function decode(s:string):Uint8Array{
  if(!/^[A-Za-z0-9_-]{43}$/.test(s))throw Error("同步码应为 43 位字符，请完整复制");
  const raw=atob(s.replace(/-/g,"+").replace(/_/g,"/")+"=");
  if(raw.length!==32)throw Error("同步码长度不正确");
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
export function generateSyncCode():string{
  const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return encode(bytes);
}
export function readSyncCode():string{
  try{return localStorage.getItem(STORAGE_KEY)||"";}catch{return "";}
}
export function saveSyncCode(code:string):void{
  decode(code.trim());
  localStorage.setItem(STORAGE_KEY,code.trim());
}
export function clearSyncCode():void{
  localStorage.removeItem(STORAGE_KEY);
}
async function derive(code:string,purpose:string):Promise<Uint8Array>{
  const seed=decode(code);
  const input=new Uint8Array(seed.byteLength+purpose.length);
  input.set(new TextEncoder().encode(purpose),0);input.set(seed,purpose.length);
  return new Uint8Array(await crypto.subtle.digest("SHA-256",input));
}
async function authToken(code:string):Promise<string>{
  return encode(await derive(code,"cowatch-auth-v1:"));
}
async function encryptionKey(code:string):Promise<CryptoKey>{
  const bytes=await derive(code,"cowatch-encryption-v1:");
  return crypto.subtle.importKey("raw",new Uint8Array(bytes).buffer,"AES-GCM",false,["encrypt","decrypt"]);
}
async function encrypt(code:string,plain:string):Promise<string>{
  if(plain.length>MAX_BYTES)throw Error("共映 Alpha 云同步每份元数据上限约 500KB：请通过本地放映包备份大批收藏，视频原文件从不上传");
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},
    await encryptionKey(code),new TextEncoder().encode(plain)));
  const out=new Uint8Array(iv.length+ciphertext.length);
  out.set(iv);out.set(ciphertext,iv.length);
  return encode(out);
}
async function decrypt(code:string,packed:string):Promise<string>{
  try{
    const clean=packed.replace(/-/g,"+").replace(/_/g,"/");
    const data=Uint8Array.from(atob(clean+"=".repeat((4-clean.length%4)%4)),c=>c.charCodeAt(0));
    if(data.length<29)throw Error("同步包太短");
    const raw=await crypto.subtle.decrypt({name:"AES-GCM",iv:data.slice(0,12)},
      await encryptionKey(code),data.slice(12));
    return new TextDecoder().decode(raw);
  }catch{throw Error("无法解密云端数据：配对码不匹配，或同步数据损坏。没有覆盖本机记录。");}
}
async function request(code:string,method:"GET"|"PUT",body?:unknown):Promise<{version:number;ciphertext?:string|null}>{
  const response=await fetch(API,{
    method,headers:{"Authorization":"Bearer "+await authToken(code),
      ...(body?{"Content-Type":"application/json"}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
    cache:"no-store",credentials:"omit",referrerPolicy:"no-referrer",
  });
  if(!response.ok){
    const message=await response.json().catch(()=>({error:"网络或接口异常"})) as {error?:string};
    throw Error("同步接口 HTTP "+response.status+"："+(message.error||"请检查网络和 D1 配置"));
  }
  return response.json() as Promise<{version:number;ciphertext?:string|null}>;
}
function normalized(s:string):string{
  const d=JSON.parse(s) as Record<string,unknown>;delete d["exportedAt"];return JSON.stringify(d);
}
export async function syncNow(code:string):Promise<{pulled:boolean;pushed:boolean;version:number}>{
  if(busy)return {pulled:false,pushed:false,version:0};
  decode(code);busy=true;
  try{
    for(let attempt=0;attempt<3;attempt++){
      const remote=await request(code,"GET");
      const before=(await exportDeviceTransfer()).text;
      const beforeNorm=normalized(before);
      const last=localStorage.getItem("cowatch:sync:last:"+code.slice(0,8));
      const locallyEdited=last!==null&&last!==beforeNorm;
      const savedSettings=locallyEdited?useApp.getState().settings:null;
      let pulled=false;
      if(remote.ciphertext){
        const raw=await decrypt(code,remote.ciphertext);
        if(normalized(raw)!==beforeNorm){
          await importDeviceTransfer(raw);
          pulled=true;
          if(savedSettings)useApp.getState().setSettings(savedSettings);
        }
      }
      const merged=(await exportDeviceTransfer()).text;
      const mergedNorm=normalized(merged);
      let remoteNorm="";
      if(remote.ciphertext)remoteNorm=normalized(await decrypt(code,remote.ciphertext));
      if(remote.ciphertext&&mergedNorm===remoteNorm){
        localStorage.setItem("cowatch:sync:last:"+code.slice(0,8),mergedNorm);
        return {pulled,pushed:false,version:remote.version};
      }
      try{
        const ciphertext=await encrypt(code,merged);
        const response=await request(code,"PUT",{expectedVersion:remote.version,ciphertext});
        localStorage.setItem("cowatch:sync:last:"+code.slice(0,8),mergedNorm);
        return {pulled,pushed:true,version:response.version};
      }catch(e){
        if(String(e).includes("HTTP 409")&&attempt<2)continue;
        throw e;
      }
    }
    throw Error("同步冲突，请稍后重试");
  }finally{busy=false;}
}
