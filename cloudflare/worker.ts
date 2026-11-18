// CoWatch Cloudflare Worker: privately encrypted cross-device metadata sync.
// The client sends a derived authorization secret; encryption key never leaves devices.
interface D1Like {
  prepare(sql:string): {bind(...args:unknown[]):{first<T=unknown>():Promise<T|null>;run():Promise<{meta?:{changes?:number}}>}};
}
interface Env { SYNC_DB: D1Like; ASSETS:{fetch(request:Request):Promise<Response>}; }
// Keep each encrypted vault deliberately small: no video file belongs in D1.
const MAX_PAYLOAD=800_000;
const allowedOrigins = new Set([
  "https://appassets.androidplatform.net",
  "cowatch://app",
  "https://cowatch-ai-danmaku-studio.yuguan2304.workers.dev",
]);
function cors(req:Request):Headers {
  const h=new Headers({"Cache-Control":"no-store","Vary":"Origin","X-Content-Type-Options":"nosniff"});
  const origin=req.headers.get("Origin")||"";
  if(allowedOrigins.has(origin)){
    h.set("Access-Control-Allow-Origin",origin);
    h.set("Access-Control-Allow-Headers","Authorization, Content-Type");
    h.set("Access-Control-Allow-Methods","GET,PUT,DELETE,OPTIONS");
  }
  return h;
}
function json(req:Request,data:unknown,status=200):Response {
  const h=cors(req);h.set("Content-Type","application/json; charset=utf-8");
  return new Response(JSON.stringify(data),{status,headers:h});
}
async function sha256(value:string):Promise<string>{
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,"0")).join("");
}
async function sync(req:Request,env:Env):Promise<Response>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="GET"&&req.method!=="PUT"&&req.method!=="DELETE")return json(req,{error:"Method not allowed"},405);
  const auth=req.headers.get("Authorization")||"";
  if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(auth))return json(req,{error:"请先在设备上设置安全同步码"},401);
  const owner=await sha256(auth.slice(7));
  try {
    if(req.method==="GET"){
      const knownRaw=new URL(req.url).searchParams.get("knownVersion");
      const known=knownRaw===null?null:Number(knownRaw);
      if(known!==null && Number.isSafeInteger(known) && known>0){
        const state=await env.SYNC_DB.prepare("SELECT version FROM sync_vaults WHERE owner_hash=?").bind(owner).first<{version:number}>();
        if(state?.version===known)return json(req,{version:known,unchanged:true});
      }
      const r=await env.SYNC_DB.prepare("SELECT ciphertext,version,updated_at FROM sync_vaults WHERE owner_hash=?").bind(owner).first<{ciphertext:string;version:number;updated_at:number}>();
      if(!r)return json(req,{version:0,ciphertext:null});
      return json(req,{version:r.version,ciphertext:r.ciphertext,updatedAt:r.updated_at});
    }
    if(req.method==="DELETE"){
      let data:{expectedVersion?:number};
      try{data=await req.json() as {expectedVersion?:number};}catch{return json(req,{error:"缺少删除版本号"},400);}
      if(!Number.isSafeInteger(data.expectedVersion)||Number(data.expectedVersion)<=0)return json(req,{error:"版本号无效"},400);
      const out=await env.SYNC_DB.prepare("DELETE FROM sync_vaults WHERE owner_hash=? AND version=?").bind(owner,data.expectedVersion).run();
      if(!(out.meta?.changes||0))return json(req,{error:"删除冲突，云端可能已有更新"},409);
      return json(req,{deleted:true});
    }
    const sizeHeader=Number(req.headers.get("Content-Length")||0);
    if(sizeHeader>MAX_PAYLOAD)return json(req,{error:"同步数据超过 2MB 限额，请缩减收藏元信息"},413);
    const raw=await req.text();
    if(raw.length>MAX_PAYLOAD)return json(req,{error:"同步数据超过 2MB 限额"},413);
    let data:unknown;
    try{data=JSON.parse(raw);}catch{return json(req,{error:"请求格式有误"},400);}
    if(!data||typeof data!=="object")return json(req,{error:"请求格式有误"},400);
    const incoming=data as {ciphertext?:unknown;expectedVersion?:unknown};
    if(typeof incoming.ciphertext!=="string"||incoming.ciphertext.length>MAX_PAYLOAD||incoming.ciphertext.length<20||
      !/^[A-Za-z0-9_-]+$/.test(incoming.ciphertext)||!Number.isSafeInteger(incoming.expectedVersion)||
      Number(incoming.expectedVersion)<0)return json(req,{error:"同步包校验失败"},400);
    const expected=Number(incoming.expectedVersion);
    let changes=0;
    if(expected===0) {
      // Soft global free-tier safety guard for first-time pairings, not a billing upgrade.
      const usage=await env.SYNC_DB.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(LENGTH(ciphertext)),0) AS bytes FROM sync_vaults").bind().first<{total:number;bytes:number}>();
      if((usage?.bytes||0)>=50_000_000 || (usage?.total||0)>=200)
        return json(req,{error:"同步存储已达到共映 Alpha 的免费保护上限，请联系管理员；不会自动产生付费"},507);
      const out=await env.SYNC_DB.prepare("INSERT INTO sync_vaults(owner_hash,ciphertext,version,updated_at) VALUES(?,?,1,unixepoch()) ON CONFLICT(owner_hash) DO NOTHING").bind(owner,incoming.ciphertext).run();
      changes=out.meta?.changes||0;
    } else {
      const out=await env.SYNC_DB.prepare("UPDATE sync_vaults SET ciphertext=?,version=version+1,updated_at=unixepoch() WHERE owner_hash=? AND version=?").bind(incoming.ciphertext,owner,expected).run();
      changes=out.meta?.changes||0;
    }
    if(!changes)return json(req,{error:"另一台设备刚刚更新，请重新合并",conflict:true},409);
    return json(req,{version:expected+1});
  }catch{
    return json(req,{error:"服务器同步失败，请稍后重试；本地数据不会被清除"},503);
  }
}
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const u=new URL(request.url);
    if(u.pathname==="/api/sync/v1")return sync(request,env);
    if(u.pathname.startsWith("/api/"))return json(request,{error:"Not found"},404);
    return env.ASSETS.fetch(request);
  },
};
