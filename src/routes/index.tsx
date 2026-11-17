import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Settings2, X } from "lucide-react";
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
import { ModelPicker } from "@/components/theater/ModelPicker";
import { CommentSection } from "@/components/theater/CommentSection";
import { SavedTheater } from "@/components/theater/SavedTheater";
import { ShipControls } from "@/components/theater/ShipControls";
import { WorldBookImport } from "@/components/theater/WorldBookImport";

export const Route = createFileRoute("/")({ component: Index });
export function Index() {
  const s = useApp();
  const key = useSecrets(x => x.apiKey);
  const setKey = useSecrets(x => x.setApiKey);
  const transcribeKey = useSecrets(x => x.transcribeKey);
  const setTranscribeKey = useSecrets(x => x.setTranscribeKey);
  const rememberKey = useSecrets(x => x.rememberKey);
  const setRememberKey = useSecrets(x => x.setRememberKey);
  const clearKeys = useSecrets(x => x.clearKeys);
  const [settingsOpen,setSettingsOpen] = useState(false);
  useEffect(() => { const open=()=>setSettingsOpen(true); window.addEventListener("cowatch:open-settings",open); return ()=>window.removeEventListener("cowatch:open-settings",open); }, []);
  useEffect(() => { if (!settingsOpen) return; const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSettingsOpen(false); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [settingsOpen]);
  const [testing,setTesting] = useState(false);
  const [testResult,setTestResult] = useState("");
  const p=s.settings.provider, a=s.settings.audience, g=s.settings.generation, an=s.settings.analysis;
  const toggleWeight=(group:"identities"|"tones",id:string)=> {
    const next={...a[group]};
    if(next[id]) delete next[id]; else next[id]=50;
    s.update("audience",{[group]:next});
  };
  const test=async()=>{
    const valid=checkBaseUrl(p.baseUrl);
    if(!valid.ok) { setTestResult(valid.reason); toast.error(valid.reason); return; }
    if(!key) { setTestResult("请填写 API 密钥"); toast.error("请填写 API 密钥"); return; }
    if(!window.confirm("向 "+valid.url.host+" 发送测试请求，可能产生少量费用。继续？"))return;
    setTesting(true);
    setTestResult("正在测试 "+valid.url.host+" 的模型 "+p.model+"…");
    try {const r=await (p.kind==="gemini"?geminiTest:openaiTest)(p.baseUrl,key,p.model);setTestResult("连接成功，模型已响应 · "+r.ms+"ms");toast.success("连接成功 · "+r.ms+"ms");}
    catch(e){const message=e instanceof Error?e.message:String(e);setTestResult(message);toast.error("测试失败，请查看下方错误详情");}finally{setTesting(false);}
  };
  return <main className="mx-auto max-w-[1440px] space-y-4 p-3 sm:p-6">
    <div><h1 className="font-display text-2xl font-bold">AI 弹幕放映室</h1><p className="text-sm text-muted-foreground">选一部视频，邀请你的虚拟观众。所有 AI 弹幕均为模拟内容。</p></div>
    <div className="space-y-4">
      <div className="min-w-0 space-y-3"><SourceBar/><div id="cowatch-player-top"><Player/></div><CommentSection/><SavedTheater/>
      </div>
      {settingsOpen && <div className="fixed inset-0 z-[150] bg-black/65" onClick={()=>setSettingsOpen(false)} aria-hidden="true"/>}
      <aside role="dialog" aria-modal={settingsOpen} aria-label="共映设置侧栏" aria-hidden={!settingsOpen} className={["fixed right-0 top-0 z-[160] flex h-[100dvh] w-[min(92vw,440px)] flex-col border-l border-border bg-background shadow-2xl transition-transform duration-200",settingsOpen?"translate-x-0":"translate-x-full pointer-events-none"].join(" ")}>
        <div className="flex shrink-0 items-center justify-between border-b border-border p-4"><h2 className="flex items-center gap-2 font-bold"><Settings2 className="size-5"/> 共映设置</h2><Button size="sm" variant="ghost" aria-label="关闭设置侧栏" onClick={()=>setSettingsOpen(false)}><X className="size-5"/></Button></div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 pb-10">
          <details className="panel space-y-3 p-3"><summary className="cursor-pointer font-bold">🎬 视频辅助工具</summary><SourceBar toolsOnly/></details>
          <details className="panel space-y-3 p-3"><summary className="cursor-pointer font-bold">🎛️ 弹幕显示</summary><DisplayControls inDrawer/></details>
          <GenerationPanel/>
          <TranslationPanel/>
                  <details className="panel group space-y-2 p-3"><summary className="cursor-pointer list-item font-bold">💬 弹幕列表 · {s.danmaku.length} 条</summary>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>downloadText("cowatch.json",toJsonExport(s.source.label,s.danmaku,s.demo),"application/json")}>导出 JSON</Button><Button size="sm" variant="outline" onClick={()=>downloadText("cowatch.xml",toBiliXml(s.danmaku),"application/xml")}>导出 XML</Button><label className="text-sm">导入弹幕 <input type="file" accept=".json,.xml" disabled={s.generating} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{if(s.danmaku.length&&!confirm("替换当前弹幕？"))return;const raw=await f.text();const result=f.name.endsWith(".xml")?{danmaku:fromBiliXml(raw),demo:false}:fromJsonImport(raw);s.setDanmaku(result.danmaku,result.demo);s.setSegments([]);}catch(err){toast.error((err as Error).message);}finally{e.target.value="";}}}/></label></div>
          <div className="max-h-72 overflow-auto space-y-1">{s.danmaku.map(d=><div key={d.id} className="flex items-center gap-2 text-sm"><button className="shrink-0 text-primary" onClick={()=>getClock()?.seek(d.time)}>{formatTime(d.time)}</button><span className="shrink-0 text-xs text-muted-foreground">{d.viewer}</span><Input aria-label="编辑弹幕" value={d.text} disabled={s.generating} onChange={e=>s.updateDanmaku(d.id,{text:e.target.value})}/><Button size="sm" variant="ghost" disabled={s.generating} onClick={()=>s.removeDanmaku(d.id)}>删除</Button></div>)}</div>
        </details>

          <fieldset disabled={s.generating} className="min-w-0 space-y-3">
        <details className="panel space-y-3 p-3"><summary className="cursor-pointer font-bold">🔑 AI 接口设置</summary><p className="text-xs text-muted-foreground">使用你自己的 API 额度。默认每次刷新后清除密钥与中转站地址；只有明确勾选「记住」才保存在本设备。内容仅发送至所选服务商。</p><p className="truncate text-xs text-muted-foreground" title={p.model}>当前模型：{p.model || "未选择"}</p>
          <div className="flex flex-wrap gap-1">{PROVIDER_PRESETS.map(x=><Button key={x.label} size="sm" variant="outline" onClick={()=>{setKey("");s.update("provider",{kind:x.kind,baseUrl:x.baseUrl,model:x.model});}}>{x.label}</Button>)}</div>
          <label className="block text-sm">接口类型 <select className="w-full rounded border bg-background p-2" value={p.kind} onChange={e=>{setKey("");s.update("provider",{kind:e.target.value==="gemini"?"gemini":"openai"});}}><option value="openai">OpenAI 兼容</option><option value="gemini">Gemini 原生</option></select></label>
          <label className="block text-sm">API 地址<Input value={p.baseUrl} onChange={e=>{setKey("");s.update("provider",{baseUrl:e.target.value});}}/></label>
          <ModelPicker kind={p.kind} baseUrl={p.baseUrl} apiKey={key} model={p.model} onModelChange={model=>s.update("provider",{model})}/>
          <label className="block text-sm">API 密钥<Input type="password" name="cowatch-temp-api-secret" autoComplete="new-password" spellCheck={false} value={key} onChange={e=>setKey(e.target.value)}/></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={rememberKey} onChange={e=>setRememberKey(e.target.checked)}/> <span>记住此设备上的密钥与中转站地址（可选）<span className="block text-xs text-muted-foreground">默认不记住，刷新后地址会恢复官方预设、密钥会清空。勾选后密钥及中转站地址会保存在此浏览器中（未加密），请勿在共享设备启用。</span></span></label>
          <Button size="sm" variant="outline" type="button" onClick={()=>{clearKeys();setTestResult("");s.update("provider",{baseUrl:"https://api.openai.com/v1",transcribeBaseUrl:"https://api.openai.com/v1"});toast.success("已清除密钥与记住的中转站地址");}}>清除密钥和地址</Button>
          {p.kind==="gemini"?<label className="block text-sm">输入方式 <select className="w-full rounded border bg-background p-2" value={p.geminiInput} onChange={e=>s.update("provider",{geminiInput:e.target.value==="video"?"video":"frames"})}><option value="frames">抽帧</option><option value="video">原生视频（小文件）</option></select></label>:<label className="flex gap-2 text-sm"><input type="checkbox" checked={p.jsonMode} onChange={e=>s.update("provider",{jsonMode:e.target.checked})}/>要求 JSON 模式</label>}
          <Button disabled={testing} onClick={()=>void test()}>{testing?"测试中…":"测试连接"}</Button>
          {testResult&&<div role="status" className="rounded border border-border bg-secondary/40 p-3 text-xs break-words">{testResult}</div>}
          <p className="text-xs text-muted-foreground">注意：模型列表和测试连接是两种不同请求。部分中转站拒绝浏览器跨域（CORS），即使 API 密钥正常也可能无法直接调用。不要将密钥填到不可信的中转网站；本站不会将密钥发送到共映服务器。</p>
          <details className="space-y-2 text-sm"><summary>音轨转录接口（可选）</summary><label>地址<Input value={p.transcribeBaseUrl} onChange={e=>{setTranscribeKey("");s.update("provider",{transcribeBaseUrl:e.target.value,transcribeUseMainKey:false});}}/></label><label>模型<Input value={p.transcribeModel} onChange={e=>s.update("provider",{transcribeModel:e.target.value})}/></label><label className="flex gap-2"><input type="checkbox" checked={p.transcribeUseMainKey} onChange={e=>s.update("provider",{transcribeUseMainKey:e.target.checked})}/>明确授权复用主密钥</label>{!p.transcribeUseMainKey&&<Input type="password" aria-label="转录密钥" value={transcribeKey} onChange={e=>setTranscribeKey(e.target.value)}/>}</details>
        </details>
        <details className="panel space-y-3 p-3"><summary className="cursor-pointer font-bold">🎭 虚拟观众</summary><p className="text-sm">语言（多选）</p><div className="flex flex-wrap gap-1">{LANGUAGES.map(x=><Button key={x.id} size="sm" variant={a.languages.includes(x.id)?"default":"outline"} onClick={()=>s.update("audience",{languages:a.languages.includes(x.id)?a.languages.filter(y=>y!==x.id):[...a.languages,x.id]})}>{x.label}</Button>)}</div>
          <p className="text-sm">观众类型（多选）</p><div className="flex flex-wrap gap-1">{IDENTITIES.map(x=><Button key={x.id} size="sm" title={x.desc} variant={a.identities[x.id]?"default":"outline"} onClick={()=>toggleWeight("identities",x.id)}>{x.label}</Button>)}</div>
          {Boolean(a.identities["shipper"]) && <ShipControls/>}
          <p className="text-sm">语气（多选）</p><div className="flex flex-wrap gap-1">{TONES.map(x=><Button key={x.id} size="sm" variant={a.tones[x.id]?"default":"outline"} onClick={()=>toggleWeight("tones",x.id)}>{x.label}</Button>)}</div>
          <label className="block text-sm">🎭 自定义弹幕语气与说话方式（每行一种）
            <Textarea rows={5} disabled={s.generating} value={a.customTones??""} placeholder={"轻松调侃：这波操作有点意思（）\n慢半拍：等下？我是不是漏看了啥\n熟人吐槽：别急，我知道他下一秒又要整活了"} onChange={e=>s.update("audience",{customTones:e.target.value.slice(0,6000)})}/>
            <span className="block text-xs text-muted-foreground">可以写口癖、说话节奏、弹幕举例，每行一个风格。AI 会自然混合使用，不会逐字复读。用户指定风格会跟上面已有的语气一起生效。</span>
          </label>
          <details className="rounded-lg border border-border p-3 space-y-2">
            <summary className="cursor-pointer font-semibold">📖 我的世界书 · 梗 / 人设 / 口癖</summary>
            <p className="text-xs text-muted-foreground">**活人感建议：**用 [观众:昵称] 固定这位观众的口癖和反应习惯；[*] 表示所有观众适用；[角色名] 仅当标题或当前字幕提及角色时触发。每行一条，单次最多采用 12 条、1200 字。别把示例当成视频中真实发生的事。</p>
            <Textarea rows={7} value={a["worldBook"] ?? ""} disabled={s.generating} placeholder={"[观众:老粉] 看见熟悉操作会先调侃两句，偶尔打个（）\n[观众:考据党] 喜欢短短补充来历，平时说话比较克制\n[角色 A] 仅在出现相关角色时使用熟悉的梗，不编造实际台词\n[*] 观众发言要有长短差异，不要所有人统一句式"} onChange={e=>s.update("audience",{worldBook:e.target.value.slice(0,50000)})}/>
            <div className="flex flex-wrap gap-2">

              <Button size="sm" variant="outline" disabled={!(a["worldBook"]??"").trim()} onClick={()=>downloadText("cowatch-worldbook.txt",a["worldBook"]??"","text/plain")}>导出备份</Button>
              <Button size="sm" variant="ghost" disabled={s.generating||!(a["worldBook"]??"").trim()} onClick={()=>{if(confirm("清空世界书？建议先导出备份。"))s.update("audience",{worldBook:""});}}>清空</Button>
            </div>
            <WorldBookImport/>
            <p className="text-xs text-muted-foreground">世界书只在这台设备保存，不同步到其他设备。导入的内容可能发送给你选择的 AI API 服务商。请勿放入私人密码或 API 密钥。</p>
          </details>
          <label className="block text-sm">额外要求（人物、圈内梗、偏好）<Textarea value={a.extraPrompt} onChange={e=>s.update("audience",{extraPrompt:e.target.value})}/></label>
          <label className="block text-sm">屏蔽词<Input value={a.globalBannedWords} onChange={e=>s.update("audience",{globalBannedWords:e.target.value})}/></label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={a.interaction} onChange={e=>s.update("audience",{interaction:e.target.checked})}/>允许观众互动</label>
        </details>
        <details className="panel space-y-3 p-3"><summary className="cursor-pointer font-bold">⚙️ 生成设置</summary>
          <label className="block text-sm">密度 · {g.density} 条/分钟<input className="w-full" type="range" min="5" max="100" step="5" value={g.density} onChange={e=>s.update("generation",{density:Number(e.target.value)})}/></label>
          <label className="block text-sm">抽帧间隔 · {an.frameInterval} 秒<input className="w-full" type="range" min="1" max="15" value={an.frameInterval} onChange={e=>s.update("analysis",{frameInterval:Number(e.target.value)})}/></label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={g.noSpoiler} onChange={e=>s.update("generation",{noSpoiler:e.target.checked})}/>防剧透（提示词约束）</label>
          <div className="rounded-lg border border-primary/30 bg-secondary/20 p-3 space-y-2">
            <p className="text-sm font-semibold">💸 省钱档位 · 仅改变后续生成设置</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={s.generating} onClick={()=>{s.update("analysis",{segmentLength:180,frameInterval:30,frameMaxWidth:384});s.update("generation",{density:12,totalLimit:120,requestLimit:5,maxRetries:0});s.update("provider",{imageDetail:"low"});toast.success("已选超省模式：本轮最多尝试 5 个片段");}}>超省 💚</Button>
              <Button type="button" size="sm" variant="outline" disabled={s.generating} onClick={()=>{s.update("analysis",{segmentLength:120,frameInterval:20,frameMaxWidth:384});s.update("generation",{density:20,totalLimit:250,requestLimit:10,maxRetries:1});s.update("provider",{imageDetail:"low"});toast.success("已选均衡模式：本轮最多尝试 10 个片段");}}>均衡 🍿</Button>
              <Button type="button" size="sm" variant="outline" disabled={s.generating} onClick={()=>{s.update("analysis",{segmentLength:30,frameInterval:5,frameMaxWidth:512});s.update("generation",{density:35,totalLimit:null,requestLimit:null,maxRetries:2});toast.warning("已选高质量模式：无请求上限，长视频可能花费较多！");}}>高质量 ⚠️</Button>
            </div>
            <label className="block text-sm">本轮最多处理片段数
              <select className="w-full rounded border bg-background p-2" disabled={s.generating} value={g.requestLimit==null?"unlimited":String(g.requestLimit)} onChange={e=>s.update("generation",{requestLimit:e.target.value==="unlimited"?null:Number(e.target.value)})}>
                <option value="3">3 个片段</option><option value="5">5 个片段</option><option value="10">10 个片段</option><option value="20">20 个片段</option><option value="unlimited">不限制（谨慎）</option>
              </select>
            </label>
            <p className="text-xs text-muted-foreground">这是每轮处理的片段上限，不是金额上限。失败重试仍可能额外计费；长片段也可能增加单次 token。已经生成的内容不会自动重算。</p>
          </div>
          <label className="block text-sm">生成模式<select className="w-full rounded border bg-background p-2" value={g.bufferMode} onChange={e=>s.update("generation",{bufferMode:e.target.value==="live"?"live":"full"})}><option value="full">预生成</option><option value="live">边播边生成</option></select></label>
        </details>
      </fieldset></div>
      </aside>
    </div>
  </main>;
}
