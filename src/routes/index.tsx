import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { SourceBar } from "@/components/theater/SourceBar";
import { Player } from "@/components/theater/Player";
import { DisplayControls } from "@/components/theater/DisplayControls";
import { GenerationPanel } from "@/components/theater/GenerationPanel";
import { useApp, useSecrets } from "@/lib/store";
import { IDENTITIES, TONES, LANGUAGES, PROVIDER_PRESETS } from "@/lib/constants";
import { openaiTest } from "@/lib/ai/openai";
import { geminiTest } from "@/lib/ai/gemini";
import { checkBaseUrl } from "@/lib/video-url";
import { downloadText, toJsonExport, toBiliXml, fromJsonImport, fromBiliXml } from "@/lib/export";
import { getClock } from "@/lib/clock";
import { formatTime } from "@/lib/id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TranslationPanel } from "@/components/theater/TranslationPanel";

export const Route = createFileRoute("/")({ component: Index });
export function Index() {
  const s = useApp();
  const key = useSecrets(x => x.apiKey);
  const setKey = useSecrets(x => x.setApiKey);
  const transcribeKey = useSecrets(x => x.transcribeKey);
  const setTranscribeKey = useSecrets(x => x.setTranscribeKey);
  const [testing,setTesting] = useState(false);
  const p=s.settings.provider, a=s.settings.audience, g=s.settings.generation, an=s.settings.analysis;
  const toggleWeight=(group:"identities"|"tones",id:string)=> {
    const next={...a[group]};
    if(next[id]) delete next[id]; else next[id]=50;
    s.update("audience",{[group]:next});
  };
  const test=async()=>{
    const valid=checkBaseUrl(p.baseUrl);
    if(!valid.ok) { toast.error(valid.reason); return; }
    if(!key) { toast.error("请填写 API 密钥"); return; }
    if(!window.confirm("向 "+valid.url.host+" 发送测试请求，可能产生少量费用。继续？"))return;
    setTesting(true);
    try {const r=await (p.kind==="gemini"?geminiTest:openaiTest)(p.baseUrl,key,p.model);toast.success("连接成功 · "+r.ms+"ms");}
    catch(e){toast.error((e as Error).message);}finally{setTesting(false);}
  };
  return <main className="mx-auto max-w-[1440px] space-y-4 p-3 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="font-display text-2xl font-bold">AI 弹幕放映室</h1><p className="text-sm text-muted-foreground">选一部视频，邀请你的虚拟观众。所有 AI 弹幕均为模拟内容。</p></div><Button variant="outline" onClick={()=>navigator.clipboard.writeText(location.origin).then(()=>toast.success("已复制链接"),()=>toast.error("复制失败"))}>分享网站</Button></div>
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-3"><SourceBar/><Player/><DisplayControls/><GenerationPanel/><TranslationPanel/>
        <section className="panel space-y-2 p-3"><h2 className="font-bold">弹幕列表 · {s.danmaku.length} 条</h2>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>downloadText("cowatch.json",toJsonExport(s.source.label,s.danmaku,s.demo),"application/json")}>导出 JSON</Button><Button size="sm" variant="outline" onClick={()=>downloadText("cowatch.xml",toBiliXml(s.danmaku),"application/xml")}>导出 XML</Button><label className="text-sm">导入弹幕 <input type="file" accept=".json,.xml" disabled={s.generating} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{if(s.danmaku.length&&!confirm("替换当前弹幕？"))return;const raw=await f.text();const result=f.name.endsWith(".xml")?{danmaku:fromBiliXml(raw),demo:false}:fromJsonImport(raw);s.setDanmaku(result.danmaku,result.demo);s.setSegments([]);}catch(err){toast.error((err as Error).message);}finally{e.target.value="";}}}/></label></div>
          <div className="max-h-72 overflow-auto space-y-1">{s.danmaku.map(d=><div key={d.id} className="flex items-center gap-2 text-sm"><button className="shrink-0 text-primary" onClick={()=>getClock()?.seek(d.time)}>{formatTime(d.time)}</button><span className="shrink-0 text-xs text-muted-foreground">{d.viewer}</span><Input aria-label="编辑弹幕" value={d.text} disabled={s.generating} onChange={e=>s.updateDanmaku(d.id,{text:e.target.value})}/><Button size="sm" variant="ghost" disabled={s.generating} onClick={()=>s.removeDanmaku(d.id)}>删除</Button></div>)}</div>
        </section>
      </div>
      <fieldset disabled={s.generating} className="min-w-0 space-y-3">
        <section className="panel space-y-3 p-3"><h2 className="font-bold">AI 接口</h2><p className="text-xs text-muted-foreground">使用你自己的 API 额度，密钥仅保留在本次页面内存。内容将发送至你配置的服务商。</p>
          <div className="flex flex-wrap gap-1">{PROVIDER_PRESETS.map(x=><Button key={x.label} size="sm" variant="outline" onClick={()=>{setKey("");s.update("provider",{kind:x.kind,baseUrl:x.baseUrl,model:x.model});}}>{x.label}</Button>)}</div>
          <label className="block text-sm">接口类型 <select className="w-full rounded border bg-background p-2" value={p.kind} onChange={e=>{setKey("");s.update("provider",{kind:e.target.value==="gemini"?"gemini":"openai"});}}><option value="openai">OpenAI 兼容</option><option value="gemini">Gemini 原生</option></select></label>
          <label className="block text-sm">API 地址<Input value={p.baseUrl} onChange={e=>{setKey("");s.update("provider",{baseUrl:e.target.value});}}/></label>
          <label className="block text-sm">模型<Input value={p.model} onChange={e=>s.update("provider",{model:e.target.value})}/></label>
          <label className="block text-sm">API 密钥<Input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)}/></label>
          {p.kind==="gemini"?<label className="block text-sm">输入方式 <select className="w-full rounded border bg-background p-2" value={p.geminiInput} onChange={e=>s.update("provider",{geminiInput:e.target.value==="video"?"video":"frames"})}><option value="frames">抽帧</option><option value="video">原生视频（小文件）</option></select></label>:<label className="flex gap-2 text-sm"><input type="checkbox" checked={p.jsonMode} onChange={e=>s.update("provider",{jsonMode:e.target.checked})}/>要求 JSON 模式</label>}
          <Button disabled={testing} onClick={()=>void test()}>{testing?"测试中…":"测试连接"}</Button>
          <details className="space-y-2 text-sm"><summary>音轨转录接口（可选）</summary><label>地址<Input value={p.transcribeBaseUrl} onChange={e=>{setTranscribeKey("");s.update("provider",{transcribeBaseUrl:e.target.value,transcribeUseMainKey:false});}}/></label><label>模型<Input value={p.transcribeModel} onChange={e=>s.update("provider",{transcribeModel:e.target.value})}/></label><label className="flex gap-2"><input type="checkbox" checked={p.transcribeUseMainKey} onChange={e=>s.update("provider",{transcribeUseMainKey:e.target.checked})}/>明确授权复用主密钥</label>{!p.transcribeUseMainKey&&<Input type="password" aria-label="转录密钥" value={transcribeKey} onChange={e=>setTranscribeKey(e.target.value)}/>}</details>
        </section>
        <section className="panel space-y-3 p-3"><h2 className="font-bold">虚拟观众</h2><p className="text-sm">语言（多选）</p><div className="flex flex-wrap gap-1">{LANGUAGES.map(x=><Button key={x.id} size="sm" variant={a.languages.includes(x.id)?"default":"outline"} onClick={()=>s.update("audience",{languages:a.languages.includes(x.id)?a.languages.filter(y=>y!==x.id):[...a.languages,x.id]})}>{x.label}</Button>)}</div>
          <p className="text-sm">观众类型（多选）</p><div className="flex flex-wrap gap-1">{IDENTITIES.map(x=><Button key={x.id} size="sm" title={x.desc} variant={a.identities[x.id]?"default":"outline"} onClick={()=>toggleWeight("identities",x.id)}>{x.label}</Button>)}</div>
          <p className="text-sm">语气（多选）</p><div className="flex flex-wrap gap-1">{TONES.map(x=><Button key={x.id} size="sm" variant={a.tones[x.id]?"default":"outline"} onClick={()=>toggleWeight("tones",x.id)}>{x.label}</Button>)}</div>
          <label className="block text-sm">额外要求（人物、圈内梗、偏好）<Textarea value={a.extraPrompt} onChange={e=>s.update("audience",{extraPrompt:e.target.value})}/></label>
          <label className="block text-sm">屏蔽词<Input value={a.globalBannedWords} onChange={e=>s.update("audience",{globalBannedWords:e.target.value})}/></label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={a.interaction} onChange={e=>s.update("audience",{interaction:e.target.checked})}/>允许观众互动</label>
        </section>
        <section className="panel space-y-3 p-3"><h2 className="font-bold">生成设置</h2>
          <label className="block text-sm">密度 · {g.density} 条/分钟<input className="w-full" type="range" min="5" max="100" step="5" value={g.density} onChange={e=>s.update("generation",{density:Number(e.target.value)})}/></label>
          <label className="block text-sm">抽帧间隔 · {an.frameInterval} 秒<input className="w-full" type="range" min="1" max="15" value={an.frameInterval} onChange={e=>s.update("analysis",{frameInterval:Number(e.target.value)})}/></label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={g.noSpoiler} onChange={e=>s.update("generation",{noSpoiler:e.target.checked})}/>防剧透（提示词约束）</label>
          <label className="block text-sm">生成模式<select className="w-full rounded border bg-background p-2" value={g.bufferMode} onChange={e=>s.update("generation",{bufferMode:e.target.value==="live"?"live":"full"})}><option value="full">预生成</option><option value="live">边播边生成</option></select></label>
        </section>
      </fieldset>
    </div>
  </main>;
}
