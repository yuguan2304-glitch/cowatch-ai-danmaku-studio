import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearSyncLogin, emptySyncConfig, readSyncConfig, sendSyncCode, syncNow, verifySyncCode, writeSyncConfig } from "@/lib/cloud-sync";
import type { SyncConfig } from "@/lib/cloud-sync";
import { toast } from "sonner";

export function CloudSyncPanel() {
  const [config,setConfig]=useState<SyncConfig>(()=>typeof window==="undefined"?emptySyncConfig:readSyncConfig());
  const [code,setCode]=useState("");
  const [active,setActive]=useState(()=>{try{return localStorage.getItem("cowatch:sync-enabled:v1")==="yes";}catch{return false;}});
  const [status,setStatus]=useState("尚未连接云端");
  const [busy,setBusy]=useState(false);
  const lastRun=useRef(0);
  const signedIn=Boolean(config.userId&&config.refreshToken);
  const change=(part:Partial<SyncConfig>)=>{
    const next={...config,...part};
    setConfig(next);writeSyncConfig(next);
  };
  const run=async()=>{
    if(busy||!signedIn)return;
    setBusy(true);
    try {
      const result=await syncNow(readSyncConfig());
      lastRun.current=Date.now();
      setStatus("已同步："+new Date().toLocaleTimeString("zh-CN")+"；"+(result.pulled?"已合并云端记录；":"")+(result.pushed?"已上传更新":"云端和本机一致"));
    }catch(e){setStatus("同步失败："+(e instanceof Error?e.message:String(e)));}
    finally{setBusy(false);}
  };
  useEffect(()=>{
    if(!active||!signedIn)return;
    let running=false;
    const tick=async()=>{
      if(running || document.visibilityState!=="visible")return;
      running=true;
      try {
        const result=await syncNow(readSyncConfig());
        lastRun.current=Date.now();
        setStatus("自动同步成功 · "+new Date().toLocaleTimeString("zh-CN")+(result.pushed?" · 已上传":""));
      }catch(e){setStatus("自动同步失败："+(e instanceof Error?e.message:String(e)));}
      finally {running=false;}
    };
    void tick();
    const timer=window.setInterval(()=>void tick(),30000);
    const visible=()=>{if(document.visibilityState==="visible")void tick();};
    document.addEventListener("visibilitychange",visible);
    return ()=>{clearInterval(timer);document.removeEventListener("visibilitychange",visible);};
  },[active,signedIn]);
  const submitCode=async()=>{
    setBusy(true);
    try {const next=await verifySyncCode(config,code);setConfig(next);setCode("");setStatus("登录成功，可开启自动同步");toast.success("邮箱验证成功");}
    catch(e){toast.error(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  const sendCode=async()=>{
    setBusy(true);
    try {await sendSyncCode(config);setStatus("验证码已发送到邮箱（请检查垃圾邮件）；如果没有邮件，请检查 Supabase 邮件模板与限额。");}
    catch(e){toast.error(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  return <details className="panel space-y-2 p-3" id="cowatch-cloud-sync">
    <summary className="cursor-pointer font-bold">☁️ 多设备自动同步（测试版）</summary>
    <div className="space-y-2 pt-2 text-sm">
      <p className="text-xs text-muted-foreground">连接同一云端账户后，PC 和手机在前台每 30 秒检查并合并弹幕、字幕、观众偏好和收藏记录；打开 App 也会检查。视频原文件和 API 密钥不会上传。需要管理员先启用同步数据库。</p>
      <label className="block">Supabase 项目 URL
        <Input value={config.url} placeholder="https://xxxxx.supabase.co" disabled={busy||signedIn} onChange={e=>change({url:e.target.value.trim()})}/>
      </label>
      <label className="block">公开 publishable / anon key（不能使用 secret/service_role）
        <Input value={config.anonKey} type="password" disabled={busy||signedIn} onChange={e=>change({anonKey:e.target.value.trim()})}/>
      </label>
      <label className="block">同步账户邮箱
        <Input value={config.email} type="email" placeholder="you@example.com" disabled={busy||signedIn} onChange={e=>change({email:e.target.value.trim()})}/>
      </label>
      {!signedIn?<div className="space-y-2">
        <Button type="button" size="sm" disabled={busy||!config.email||!config.anonKey||!config.url} onClick={()=>void sendCode()}>发送登录验证码</Button>
        <div className="flex flex-wrap gap-2">
          <Input value={code} onChange={e=>setCode(e.target.value)} placeholder="邮箱中的验证码" disabled={busy}/>
          <Button type="button" size="sm" disabled={busy||!code.trim()} onClick={()=>void submitCode()}>验证并登录</Button>
        </div>
      </div>:<div className="space-y-2">
        <p className="text-xs text-muted-foreground">已登录 {config.email}</p>
        <label className="flex gap-2 items-center"><input type="checkbox" checked={active} disabled={busy} onChange={e=>{
          setActive(e.target.checked);
          localStorage.setItem("cowatch:sync-enabled:v1",e.target.checked?"yes":"no");
        }}/>启用自动同步（每 30 秒、切回前台时检查）</label>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" disabled={busy} onClick={()=>void run()}>{busy?"同步中…":"立即同步"}</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={()=>{
            clearSyncLogin();setConfig(readSyncConfig());setActive(false);localStorage.removeItem("cowatch:sync-enabled:v1");setStatus("已退出同步账户，本机数据未删除");
          }}>退出云端账户</Button>
        </div>
      </div>}
      <p role="status" className="text-xs break-words rounded border p-2">{status}</p>
      <p className="text-xs text-muted-foreground">首次连接已有云端内容时会自动合并；同一条历史/收藏按更新时间取较新版本。两台设备同时编辑同一条记录仍可能发生覆盖，重要作品请保留备份。数据同步需要网络；国内网络能否访问 Supabase 取决于运营商与域名。</p>
    </div>
  </details>;
}
