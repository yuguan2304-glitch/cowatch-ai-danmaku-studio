import { exportDeviceTransfer, importDeviceTransfer } from "./device-transfer";

const STORE = "cowatch:cloud-sync:v1";
export type SyncConfig = { url: string; anonKey: string; email: string; accessToken: string; refreshToken: string; expiresAt: number; userId: string };
export const emptySyncConfig: SyncConfig = {url:"",anonKey:"",email:"",accessToken:"",refreshToken:"",expiresAt:0,userId:""};
export function readSyncConfig(): SyncConfig {
  try { return {...emptySyncConfig,...JSON.parse(localStorage.getItem(STORE)||"{}")}; }
  catch { return {...emptySyncConfig}; }
}
export function writeSyncConfig(config: SyncConfig): void { localStorage.setItem(STORE,JSON.stringify(config)); }
function configured(c: SyncConfig): string {
  let url: URL;
  try { url = new URL(c.url); } catch {throw Error("请填写有效的 Supabase HTTPS 项目地址");}
  if (url.protocol!=="https:" || !url.hostname.endsWith(".supabase.co") || url.pathname!=="/" || !c.anonKey.trim()) {
    throw Error("请填写 Supabase 项目 HTTPS URL 和公开 anon/publishable key（不要使用 service_role 密钥）");
  }
  return url.origin;
}
async function request(c: SyncConfig,path: string, method: string, body?:unknown, auth?:string):Promise<any> {
  const url=configured(c);
  const response=await fetch(url+path,{
    method,headers:{"apikey":c.anonKey,"Content-Type":"application/json",
      ...(auth?{"Authorization":"Bearer "+auth}:{}),
      ...(method==="POST"&&path.startsWith("/rest/")?{"Prefer":"resolution=merge-duplicates,return=minimal"}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),credentials:"omit",referrerPolicy:"no-referrer",
  });
  if(!response.ok) {
    const message=(await response.text().catch(()=>"")).slice(0,180);
    throw Error("云端返回 HTTP "+response.status+"："+message);
  }
  const t=await response.text();
  return t?JSON.parse(t):null;
}
export async function sendSyncCode(c:SyncConfig):Promise<void> {
  await request(c,"/auth/v1/otp","POST",{email:c.email.trim(),create_user:true});
}
export async function verifySyncCode(c:SyncConfig,code:string):Promise<SyncConfig> {
  const data=await request(c,"/auth/v1/verify","POST",{email:c.email.trim(),token:code.trim(),type:"email"});
  if (!data.access_token||!data.refresh_token||!data.user?.id)throw Error("验证码无效或已过期");
  const next={...c,accessToken:String(data.access_token),refreshToken:String(data.refresh_token),
    expiresAt:Date.now()+Number(data.expires_in||3600)*1000,userId:String(data.user.id)};
  writeSyncConfig(next);return next;
}
async function fresh(c:SyncConfig):Promise<SyncConfig> {
  if (!c.refreshToken || !c.userId)throw Error("请先登录同步账户");
  if (Date.now()<c.expiresAt-120000) return c;
  const data=await request(c,"/auth/v1/token?grant_type=refresh_token","POST",{refresh_token:c.refreshToken});
  if(!data.access_token||!data.refresh_token)throw Error("登录已过期，请重新验证邮箱");
  const next={...c,accessToken:String(data.access_token),refreshToken:String(data.refresh_token),
    expiresAt:Date.now()+Number(data.expires_in||3600)*1000};
  writeSyncConfig(next);return next;
}
type Snapshot = {user_id:string;data:unknown;updated_at:string};
function normalized(s:string):string {
  const data=JSON.parse(s) as Record<string,unknown>;
  delete data["exportedAt"];
  return JSON.stringify(data);
}
let syncing=false;
export async function syncNow(config:SyncConfig):Promise<{pulled:boolean;pushed:boolean}> {
  if(syncing)return {pulled:false,pushed:false};
  syncing=true;
  try {
    const c=await fresh(config);
    const remote=await request(c,"/rest/v1/cowatch_sync?select=user_id,data,updated_at&user_id=eq."+encodeURIComponent(c.userId),"GET",undefined,c.accessToken) as Snapshot[];
    const initial=(await exportDeviceTransfer()).text;
    let pulled=false;
    const record=remote?.[0];
    if(record?.data) {
      const raw=JSON.stringify(record.data);
      // Merge remote data locally, newest history/screenings win; never clear local files.
      await importDeviceTransfer(raw);
      pulled=normalized(raw)!==normalized(initial);
    }
    const merged=(await exportDeviceTransfer()).text;
    // Keep remote in sync with merged local snapshot only if the content differs.
    if(!record || normalized(merged)!==normalized(JSON.stringify(record.data))) {
      await request(c,"/rest/v1/cowatch_sync?on_conflict=user_id","POST",
        {user_id:c.userId,data:JSON.parse(merged)},c.accessToken);
      return {pulled,pushed:true};
    }
    return {pulled,pushed:false};
  }finally{syncing=false;}
}
export function clearSyncLogin():void {
  const c=readSyncConfig();
  writeSyncConfig({...c,accessToken:"",refreshToken:"",expiresAt:0,userId:""});
}
