import { useEffect, useState } from "react";
import { MessageCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useApp, useSecrets } from "@/lib/store";
import { checkBaseUrl } from "@/lib/video-url";
import { openaiChat } from "@/lib/ai/openai";
import { geminiGenerate } from "@/lib/ai/gemini";
import { extractJson } from "@/lib/ai/validate";

type Comment = { id: string; name: string; text: string; liked: boolean; likes: number; replyTo?: string };
type RawComment = { name?: unknown; text?: unknown; replyTo?: unknown };

export function CommentSection() {
  const source = useApp(s => s.source);
  const danmaku = useApp(s => s.danmaku);
  const cues = useApp(s => s.cues);
  const p = useApp(s => s.settings.provider);
  const audience = useApp(s => s.settings.audience);
  const apiKey = useSecrets(s => s.apiKey);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  useEffect(() => { setComments([]); setDraft(""); setReplyTo(null); }, [source.src, source.youtubeId, source.bilibiliEmbed, source.label]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    if (text.length > 600) { toast.error("评论最多 600 字"); return; }
    setComments(old => [...old, { id: crypto.randomUUID(), name: "我", text, likes: 0, liked: false, ...(replyTo ? { replyTo } : {}) }]);
    setDraft(""); setReplyTo(null);
  };
  const generate = async () => {
    if (!source.label) { toast.error("请先打开视频"); return; }
    if (!danmaku.length && !cues.length) { toast.error("请先生成弹幕或导入字幕。评论不会凭空假装看过视频。"); return; }
    const checked = checkBaseUrl(p.baseUrl);
    if (!checked.ok) { toast.error(checked.reason); return; }
    if (!apiKey) { toast.error("请先在设置侧栏配置 API 密钥"); return; }
    if (!confirm("用当前 AI 接口生成虚拟观众评论？将发送视频标题、部分弹幕、字幕与观众偏好至 "+checked.url.host+"，可能产生费用。")) return;
    setBusy(true);
    try {
      const system = [
        "你是共映虚拟评论区生成器。返回 JSON 对象 {\\\"comments\\\":[{\\\"name\\\":\\\"观众昵称\\\",\\\"text\\\":\\\"完整评论\\\",\\\"replyTo\\\":\\\"可选的被回复昵称\\\"}]}。",
        "生成 6 条具有鲜明不同个性且有交流感的观后评论，内容通常每条 20-100 字。",
        "严格根据给定弹幕和字幕发言；没有画面或音轨时不能编造具体内容。不要假装这些是真实用户。",
        "只有用户明确列出的 CP 可以恋爱向讨论；未指定不得随机配对。不要提及禁嗑的组合。",
        "评论不得包含歧视、人身攻击或违法内容。不要泄露 API 等配置。",
      ].join("\\n");
      const user = JSON.stringify({
        title: source.label,
        languages: audience.languages,
        identities: audience.identities,
        tones: audience.tones,
        extraPrompt: audience.extraPrompt,
        allowedCp: audience.shipPairs ?? "",
        blockedCp: audience.blockedPairs ?? "",
        danmaku: danmaku.slice(0, 100).map(d => ({time:d.time,text:d.text})),
        subtitles: cues.slice(0, 80).map(c => ({time:c.start,text:c.text})),
      });
      const result = p.kind === "gemini" ?
        await geminiGenerate({ baseUrl:p.baseUrl, apiKey, model:p.model, system, userText:user, images:[] }) :
        await openaiChat({ baseUrl:p.baseUrl, apiKey, model:p.model, system, userText:user, images:[], imageDetail:"low", jsonMode:p.jsonMode });
      const data = extractJson(result.text) as { comments?: RawComment[] };
      if (!Array.isArray(data.comments)) throw new Error("模型未返回评论列表");
      const generated: Comment[] = data.comments.slice(0, 10).flatMap(item => {
        if (typeof item?.name !== "string" || typeof item.text !== "string" || !item.text.trim()) return [];
        return [{ id: crypto.randomUUID(), name: item.name.slice(0, 30), text: item.text.slice(0, 650), likes:0, liked:false, ...(typeof item.replyTo==="string" && item.replyTo.trim()?{replyTo:item.replyTo.slice(0,30)}:{}) }];
      });
      if (!generated.length) throw new Error("模型返回的评论为空");
      setComments(old => [...old, ...generated]);
      toast.success("已生成 "+generated.length+" 条 AI 模拟评论");
    } catch(e) { toast.error(e instanceof Error?e.message:String(e)); }
    finally { setBusy(false); }
  };

  return <section className="panel space-y-3 p-3 sm:p-4">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="mr-auto flex items-center gap-2 font-bold"><MessageCircle className="size-5"/> 评论区 <span className="text-xs text-muted-foreground">{comments.length} 条</span></h2>
      <Button size="sm" variant="outline" disabled={busy||source.kind==="none"} onClick={()=>void generate()}><Sparkles className="size-4"/>{busy?"生成中…":"生成 AI 观众评论"}</Button>
    </div>
    <p className="text-xs text-muted-foreground">AI 评论是虚构观众的模拟内容，不代表真实用户。生成会消耗所选模型的 API 额度；手动评论只保存在当前页面，不会公开发布。</p>
    {replyTo && <Button size="sm" variant="ghost" onClick={()=>setReplyTo(null)}>取消回复：{replyTo} ×</Button>}
    <Textarea rows={3} value={draft} maxLength={600} placeholder={replyTo?"回复 "+replyTo+"…":"写点观后感……"} onChange={e=>setDraft(e.target.value)}/>
    <div className="flex justify-end"><Button size="sm" disabled={!draft.trim()} onClick={send}>发表评论</Button></div>
    {!comments.length && <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">还没有评论。生成弹幕后，可以邀请虚拟观众来聊聊这部视频。💬</p>}
    <div className="space-y-3">{comments.map(c=><div key={c.id} className="space-y-2 border-b border-border/60 pb-3">
      <div className="flex items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary font-bold">{c.name.slice(0,1)}</span><div><div className="text-sm font-semibold">{c.name}</div>{c.replyTo && <div className="text-xs text-muted-foreground">回复 {c.replyTo}</div>}</div></div>
      <p className="whitespace-pre-wrap break-words pl-10 text-sm">{c.text}</p>
      <div className="flex items-center gap-3 pl-10 text-xs text-muted-foreground"><button type="button" onClick={()=>setComments(old=>old.map(x=>x.id===c.id?{...x,liked:!x.liked,likes:x.likes+(x.liked?-1:1)}:x))}>{c.liked?"♥":"♡"} {c.likes}</button><button type="button" onClick={()=>{setReplyTo(c.name);document.getElementById("cowatch-comment-anchor")?.scrollIntoView({behavior:"smooth"});}}>回复</button><button type="button" onClick={()=>setComments(old=>old.filter(x=>x.id!==c.id))}>删除</button></div>
    </div>)}</div>
    <span id="cowatch-comment-anchor"/>
  </section>;
}
