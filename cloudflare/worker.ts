// CoWatch Cloudflare Worker: privately encrypted cross-device metadata sync.
// The client sends a derived authorization secret; encryption key never leaves devices.
interface D1Like {
  prepare(sql:string): {bind(...args:unknown[]):{first<T=unknown>():Promise<T|null>;run():Promise<{meta?:{changes?:number}}>}};
}
interface Env { SYNC_DB: D1Like; AI?:{run(model:string,options:{audio:string;task:string}):Promise<unknown>}; ASSETS:{fetch(request:Request):Promise<Response>}; }
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

/**
 * Authenticated, quota-capped optional Cloudflare Whisper transcription.
 * A user needs an existing private sync vault; a random unauthenticated
 * visitor cannot run paid AI. No audio or transcript is stored server-side.
 * Limit all users to <= 2h audio/day in aggregate as an additional safety cap.
 */
async function transcribeAudio(req:Request,env:Env):Promise<Response>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST")return json(req,{error:"只允许 POST"},405);
  if(!env.AI)return json(req,{error:"Cloudflare Workers AI 尚未启用，请使用 Groq"},503);
  const auth=req.headers.get("Authorization")||"";
  if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(auth))return json(req,{error:"请在共映设置中创建同步空间后再试"},401);
  const owner=await sha256(auth.slice(7));
  try {
    const vault=await env.SYNC_DB.prepare("SELECT version FROM sync_vaults WHERE owner_hash=?").bind(owner).first();
    if(!vault)return json(req,{error:"尚未初始化云同步空间，请先点击「立即同步」保存配对信息"},403);
    const declared=Number(req.headers.get("Content-Length")||0);
    if(declared>1_650_000)return json(req,{error:"单个音频分段太大，不能上传"},413);
    const raw=await req.text();
    if(raw.length>1_650_000)return json(req,{error:"单次音轨上限约 1MB"},413);
    let data:{audio?:unknown;seconds?:unknown};
    try{data=JSON.parse(raw) as typeof data;}catch{return json(req,{error:"音轨数据格式不正确"},400);}
    const seconds=Number(data.seconds);
    if(!Number.isSafeInteger(seconds)||seconds<1||seconds>75||
      typeof data.audio!=="string"||data.audio.length<50||data.audio.length>1_500_000||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(data.audio))
      return json(req,{error:"Cloudflare 单次转录只接受最多 75 秒的压缩音频"},400);
    // Counters are reserved BEFORE the call. Errors do not reimburse the
    // budget, avoiding repeated retries accidentally consuming money.
    await env.SYNC_DB.prepare("CREATE TABLE IF NOT EXISTS transcribe_daily_usage (owner_hash TEXT NOT NULL,day TEXT NOT NULL,seconds INTEGER NOT NULL,PRIMARY KEY(owner_hash,day))").bind().run();
    const day=new Date().toISOString().slice(0,10);
    const global=await env.SYNC_DB.prepare("INSERT INTO transcribe_daily_usage(owner_hash,day,seconds) VALUES('__global__',?,?) ON CONFLICT(owner_hash,day) DO UPDATE SET seconds=seconds+excluded.seconds WHERE seconds+excluded.seconds<=7200").bind(day,seconds).run();
    if(!(global.meta?.changes||0))return json(req,{error:"共映 Cloudflare 今日免费保护额度已满，请明天再试或使用 Groq"},429);
    const own=await env.SYNC_DB.prepare("INSERT INTO transcribe_daily_usage(owner_hash,day,seconds) VALUES(?,?,?) ON CONFLICT(owner_hash,day) DO UPDATE SET seconds=seconds+excluded.seconds WHERE seconds+excluded.seconds<=3600").bind(owner,day,seconds).run();
    if(!(own.meta?.changes||0))return json(req,{error:"你的 Cloudflare 每日保护额度已满，请明天再试"},429);
    let result:unknown;
    try{result=await env.AI.run("@cf/openai/whisper-large-v3-turbo",{audio:data.audio,task:"transcribe"});}
    catch{return json(req,{error:"Cloudflare 识别服务暂不可用，本段未完成，可以稍后重试；不自动转入付费服务"},503);}
    const object=result as {segments?:Array<{start?:unknown;end?:unknown;text?:unknown}>;text?:unknown}|null;
    const segments=Array.isArray(object?.segments)?object!.segments!.filter(x=>
      x&&Number.isFinite(x.start)&&Number.isFinite(x.end)&&typeof x.text==="string"&&x.text.trim())
      .map(x=>({start:Number(x.start),end:Number(x.end),text:String(x.text).slice(0,1000)})).slice(0,500):[];
    if(!segments.length)return json(req,{error:"Cloudflare 没有返回带时间戳的字幕，请改用 Groq 或重试"},422);
    return json(req,{segments});
  }catch{return json(req,{error:"转录服务暂时无法完成请求，请检查 D1 绑定和免费额度"},503);}
}

/**
 * First-party, allowlisted model delivery for browsers that cannot reach
 * Hugging Face directly. No user API keys or audio are sent to this endpoint.
 * Daily data caps prevent this optional feature from consuming unlimited
 * Cloudflare resources.
 */
async function whisperModelAsset(req:Request,env:Env,path:string):Promise<Response>{
  if(req.method!=="GET")return json(req,{error:"只允许读取模型资源"},405);
  const matched=/^\/api\/model\/v1\/onnx-community\/whisper-(tiny|base)\/resolve\/main\/(.+)$/.exec(path);
  if(!matched)return json(req,{error:"模型资源不在允许列表"},404);
  const modelSize=matched[1];
  const filename=matched[2];
  if(!/^(?:[a-zA-Z0-9._-]+|onnx\/[a-zA-Z0-9._-]+)$/.test(filename)
    || !/\.(?:json|onnx)$/.test(filename))return json(req,{error:"文件类型不支持"},404);
  const origin=req.headers.get("Origin")||"";
  if(origin && !allowedOrigins.has(origin))return json(req,{error:"当前来源不允许获取共映模型"},403);
  const estimate=filename.endsWith(".onnx")?(modelSize==="base"?170_000_000:65_000_000):2_000_000;
  // Reserve conservatively before fetching; no dependency on external billing.
  try{
    await env.SYNC_DB.prepare("CREATE TABLE IF NOT EXISTS model_daily_budget (owner_hash TEXT NOT NULL, day TEXT NOT NULL, bytes INTEGER NOT NULL, PRIMARY KEY(owner_hash,day))").run();
    const day=new Date().toISOString().slice(0,10);
    const ip=(req.headers.get("CF-Connecting-IP")||"unknown").slice(0,100);
    const ipHash=await sha256("model-ip:"+ip);
    const own=await env.SYNC_DB.prepare("INSERT INTO model_daily_budget(owner_hash,day,bytes) VALUES(?,?,?) ON CONFLICT(owner_hash,day) DO UPDATE SET bytes=bytes+excluded.bytes WHERE bytes+excluded.bytes<=600000000").bind(ipHash,day,estimate).run();
    if(!(own.meta?.changes||0))return json(req,{error:"今日此设备模型下载保护额度已满，明天再试或选择其他下载来源"},429);
    const all=await env.SYNC_DB.prepare("INSERT INTO model_daily_budget(owner_hash,day,bytes) VALUES('__global__',?,?) ON CONFLICT(owner_hash,day) DO UPDATE SET bytes=bytes+excluded.bytes WHERE bytes+excluded.bytes<=3000000000").bind(day,estimate).run();
    if(!(all.meta?.changes||0))return json(req,{error:"共映模型下载保护额度已满，请明天再试"},429);
  }catch{return json(req,{error:"模型下载额度校验暂不可用"},503);}
  const url="https://huggingface.co/onnx-community/whisper-"+modelSize+"/resolve/main/"+filename;
  try{
    const upstream=await fetch(url,{headers:{"User-Agent":"CoWatch-Model-Delivery/1.0"}});
    if(!upstream.ok||!upstream.body)return json(req,{error:"模型源站暂不可用（HTTP "+upstream.status+"），可切换下载来源"},502);
    const contentLength=Number(upstream.headers.get("Content-Length")||0);
    if(contentLength>220_000_000)return json(req,{error:"模型文件超过共映当前的安全下载上限"},413);
    const headers=new Headers({
      "Content-Type":filename.endsWith(".json")?"application/json":"application/octet-stream",
      "Cache-Control":"public, max-age=86400",
      "X-Content-Type-Options":"nosniff",
    });
    if(allowedOrigins.has(origin))headers.set("Access-Control-Allow-Origin",origin);
    return new Response(upstream.body,{status:200,headers});
  }catch{return json(req,{error:"共映中转站也无法连接模型源站，请换网络或使用 Groq/Cloudflare 转录"},502);}
}
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const u=new URL(request.url);
    if(u.pathname==="/api/sync/v1")return sync(request,env);
    if(u.pathname==="/api/transcribe/v1")return transcribeAudio(request,env);
    if(u.pathname.startsWith("/api/model/v1/"))return whisperModelAsset(request,env,u.pathname);
    if(u.pathname.startsWith("/api/"))return json(request,{error:"Not found"},404);
    return env.ASSETS.fetch(request);
  },
};
