import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearSyncCode, generateSyncCode, readSyncCode, saveSyncCode, syncNow } from "@/lib/cloud-sync";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { exportDeviceTransfer } from "@/lib/device-transfer";
import { saveHistory } from "@/lib/ai/generator";

export function CloudSyncPanel() {
  const [code,setCode]=useState(()=>readSyncCode());
  const [draft,setDraft]=useState("");
  const [active,setActive]=useState(()=>{try{return localStorage.getItem("cowatch:sync-enabled:v1")==="yes";}catch{return false;}});
  const [status,setStatus]=useState("尚未连接云端");
  const [busy,setBusy]=useState(false);
  const settingsLoaded=useApp(st=>st.settingsLoaded);
  const [localCounts,setLocalCounts]=useState<{history:number;screenings:number;presets:number;missingVideos:number}|null>(null);
  const refreshCounts=async()=>{try{const r=await exportDeviceTransfer();setLocalCounts(r);}catch{setLocalCounts(null);}};
  useEffect(()=>{void refreshCounts();const onChanged=()=>void refreshCounts();window.addEventListener("cowatch:records-updated",onChanged);window.addEventListener("cowatch:local-data-changed",onChanged);return()=>{window.removeEventListener("cowatch:records-updated",onChanged);window.removeEventListener("cowatch:local-data-changed",onChanged);};},[]);
  const paired=Boolean(code);
  const setup=(value:string)=>{
    try{
      saveSyncCode(value.trim());
      setCode(value.trim());setDraft("");
      setStatus("设备配对成功。请将配对码安全保存，并在另一台设备输入同一个码。");
      toast.success("同步配对完成");
    }catch(e){toast.error(e instanceof Error?e.message:String(e));}
  };
  const run=async()=>{
    if(busy||!code)return;
    setBusy(true);
    try{
      const state=useApp.getState();
      if(state.danmaku.length && !state.demo)await saveHistory();
      const result=await syncNow(code);
      await refreshCounts();
      setStatus("云端连接成功 · "+new Date().toLocaleTimeString("zh-CN")+
        " · 本设备历史 "+result.history+" 条、收藏 "+result.screenings+" 部、预设 "+result.presets+" 组"+
        (result.pulled?" · 已拉取合并":"")+
        (result.pushed?" · 已上传元数据":" · 云端版本未变化")+
        "。视频文件本身没有上传。"+
        (!result.history&&!result.screenings?" 当前没有可同步的已保存记录，请先在「我的放映室」收藏视频或保存生成历史。":""));
    }catch(e){setStatus("同步失败："+(e instanceof Error?e.message:String(e)));}
    finally{setBusy(false);}
  };
  useEffect(()=>{
    if(!active||!paired||!settingsLoaded)return;
    let running=false;
    const tick=async()=>{
      if(running||document.visibilityState!=="visible")return;
      running=true;
      try{
        const result=await syncNow(readSyncCode());
        setLocalCounts({history:result.history,screenings:result.screenings,presets:result.presets,missingVideos:result.missingVideos});
        setStatus("云端同步检查完成 · "+new Date().toLocaleTimeString("zh-CN")+
          " · 收藏 "+result.screenings+" 部，历史 "+result.history+" 条"+
          (result.pushed?"（已上传元数据）":"（没有需要上传的变化）")+
          "；视频原文件不在同步范围内。");
      }catch(e){setStatus("自动同步失败："+(e instanceof Error?e.message:String(e)));}
      finally{running=false;}
    };
    void tick();
    const timer=window.setInterval(()=>void tick(),30000);
    let changeTimer:ReturnType<typeof setTimeout>|undefined;
    const changed=()=>{
      if(changeTimer)clearTimeout(changeTimer);
      changeTimer=setTimeout(()=>void tick(),2500);
    };
    const visible=()=>{if(document.visibilityState==="visible")void tick();};
    document.addEventListener("visibilitychange",visible);
    window.addEventListener("cowatch:local-data-changed",changed);
    return ()=>{
      clearInterval(timer);
      if(changeTimer)clearTimeout(changeTimer);
      document.removeEventListener("visibilitychange",visible);
      window.removeEventListener("cowatch:local-data-changed",changed);
    };
  },[active,paired,settingsLoaded]);
  return <details className="panel space-y-2 p-3" id="cowatch-cloud-sync">
    <summary className="cursor-pointer font-bold">☁️ 多设备自动同步 · Cloudflare D1</summary>
    <div className="space-y-2 pt-2 text-sm">
      <p className="text-xs text-muted-foreground">不用 Lovable、Supabase 或邮箱账号。PC 与手机输入同一串随机配对码，可以同步已保存的生成历史、弹幕、字幕、观众设定和收藏记录。</p>
      <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs space-y-1">
        <p className="font-bold">注意：目前不支持跨设备自动传输视频文件。</p>
        <p>同步成功指云端元数据读写成功，不代表新设备已有可以播放的视频。视频需在两台设备分别导入，并在「我的放映室」点「补充本地视频」关联；不会因此重新生成 AI 弹幕。</p>
        <p>正在播放但没有收藏的视频，也不算已保存的放映记录。请先在「我的放映室」保存视频，或确认生成历史已保存。</p>
      </div>
      <p className="text-xs">本机已保存：{localCounts? `历史 ${localCounts.history} 条 · 收藏 ${localCounts.screenings} 部 · 观众预设 ${localCounts.presets} 组`:"正在读取…"}。</p>
      <Button type="button" size="sm" variant="outline" onClick={()=>void refreshCounts()}>重新检查本机数据</Button>
      {!paired?<div className="space-y-2">
        <Button size="sm" onClick={()=>setup(generateSyncCode())}>创建我的同步空间</Button>
        <label className="block">已有同步码？在这里粘贴
          <Input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="从另一台设备复制的 43 位同步码" autoComplete="off"/>
        </label>
        <Button variant="outline" size="sm" disabled={!draft.trim()} onClick={()=>setup(draft)}>加入现有同步空间</Button>
      </div>:<div className="space-y-2">
        <p className="text-xs font-semibold">此设备已配对</p>
        <label className="block text-xs">你的同步码（相当于账户密码，请勿公开或发送到聊天）
          <Input readOnly type="password" value={code}/>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={()=>{void navigator.clipboard.writeText(code).then(()=>toast.success("已复制同步码，请安全传至另一台设备")).catch(()=>toast.error("复制失败，请手动保存"));}}>复制同步码</Button>
          <Button size="sm" variant="outline" onClick={()=>{
            if(!confirm("只退出当前设备的云同步空间？本机弹幕和视频不会删除。重新配对需要原同步码。"))return;
            clearSyncCode();setCode("");setActive(false);localStorage.removeItem("cowatch:sync-enabled:v1");setStatus("已退出云端配对，本机数据保留");
          }}>取消本机配对</Button>
        </div>
        <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={active} onChange={e=>{setActive(e.target.checked);localStorage.setItem("cowatch:sync-enabled:v1",e.target.checked?"yes":"no");}}/>启用自动同步（每约 30 秒、切回前台、保存数据后检查）</label>
        <Button size="sm" disabled={busy} onClick={()=>void run()}>{busy?"同步中…":"立即同步"}</Button>
      </div>}
      <p className="text-xs break-words rounded border p-2" role="status">{status}</p>
      <p className="text-xs text-muted-foreground">重要：配对码丢失无法找回，建议保存到安全位置。配对码本机保存在 App 存储中。首次自动同步会合并已有收藏；不同设备同时修改同一条记录仍有覆盖风险。数据同步需要当前网络可以访问共映 Cloudflare 接口；本地播放无需它。</p>
    </div>
  </details>;
}
