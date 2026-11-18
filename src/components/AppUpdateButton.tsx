import { useEffect,useState } from "react";
import { DownloadCloud } from "lucide-react";
import { toast } from "sonner";

type Update={build:number;url:string};
type NativeUpdater={postMessage(message:string):void};
const LATEST="https://api.github.com/repos/yuguan2304-glitch/cowatch-ai-danmaku-studio/releases?per_page=30";
function updater():NativeUpdater|undefined{
  return (window as Window & {CoWatchUpdater?:NativeUpdater}).CoWatchUpdater;
}
export function AppUpdateButton(){
  const [installed,setInstalled]=useState<number|null>(null);
  const [webMode,setWebMode]=useState(false);
  const [unknownApp,setUnknownApp]=useState(false);
  const [available,setAvailable]=useState<Update|null>(null);
  const [autoWeb,setAutoWeb]=useState(false);
  const [checking,setChecking]=useState(false);
  async function check(showFeedback:boolean){
    if(checking)return;
    setChecking(true);
    try{
      const buildResponse=await fetch("/cowatch-build.json",{cache:"no-store"});
      if(!buildResponse.ok||!buildResponse.headers.get("content-type")?.includes("json")){setWebMode(true);return;}
      const build=await buildResponse.json() as {platform?:string;build?:number;package?:string};
      if(build.platform!=="android"||build.package!=="dev.cowatch.player.alpha.autoupdate"||!Number.isInteger(build.build)){setUnknownApp(true);return;}
      setInstalled(build.build!);
      // Native Alpha 89+ keeps the same appassets origin and loads web features
      // directly from first-party Cloudflare assets. New APKs are only needed
      // when a newer native Android shell becomes mandatory.
      try{
        const policyRes=await fetch("/cowatch-native-policy.json",{cache:"no-store"});
        if(policyRes.ok){
          const policy=await policyRes.json() as {minNativeBuild?:number;webUpdates?:boolean};
          if(policy.webUpdates===true&&Number.isInteger(policy.minNativeBuild)&&build.build!>=policy.minNativeBuild!){
            setAutoWeb(true);setAvailable(null);
            if(showFeedback)toast.success("网页功能已采用自动更新；点「刷新功能」即可重新加载最新版，无需安装 APK");
            return;
          }
        }
      }catch{/* Older APKs may not bundle the web-update policy. */}
      setAutoWeb(false);
      const response=await fetch(LATEST,{cache:"no-store",headers:{"Accept":"application/vnd.github+json"}});
      if(!response.ok)throw Error("暂时无法连接 GitHub 查询更新");
      const releases=await response.json() as Array<{tag_name:string;assets:Array<{name:string;browser_download_url:string}>}>;
      const options=releases.flatMap(rel=>{
        const match=/^android-alpha-(\d+)$/.exec(rel.tag_name);
        const asset=rel.assets?.find(a=>a.name==="cowatch-android-alpha-preview.apk");
        return match&&asset?[{build:Number(match[1]),url:asset.browser_download_url}]:[];
      }).sort((a,b)=>b.build-a.build);
      const latest=options[0]??null;
      setAvailable(latest&&latest.build>build.build!?latest:null);
      if(showFeedback)toast.info(latest&&latest.build>build.build!?("发现共映新版 Alpha "+latest.build):"当前已是最新版，或暂未发现可用更新");
    }catch(e){setUnknownApp(true);if(showFeedback)toast.error(e instanceof Error?e.message:"检查更新失败");}
    finally{setChecking(false);}
  }
  useEffect(()=>{void check(false);},[]);
  if(installed===null){
    if(webMode)return <button type="button" onClick={()=>window.location.reload()} title="网页版自动获得最新网页功能，无需安装 APK" className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-primary"><DownloadCloud className="size-4"/> 刷新网页版</button>;
    if(unknownApp)return <button type="button" onClick={()=>window.open("https://github.com/yuguan2304-glitch/cowatch-ai-danmaku-studio/releases","_blank","noopener,noreferrer")} title="当前安装版本没有可识别的应用内更新标记；打开共映发布页面" className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-primary"><DownloadCloud className="size-4"/> 版本与更新</button>;
    return <span className="text-xs text-muted-foreground">检查版本…</span>;
  }
  const install=()=>{
    if(!available)return;
    const url=available.url;
    if(!/^https:\/\/github\.com\/yuguan2304-glitch\/cowatch-ai-danmaku-studio\/releases\/download\/android-alpha-\d+\/cowatch-android-alpha-preview\.apk$/.test(url)){
      toast.error("更新地址未经验证，已取消下载");return;
    }
    if(!confirm("共映 Alpha "+available.build+" 已发布。将下载新版 APK 并由安卓系统确认安装；同包名同签名升级会保留原有视频和弹幕。继续吗？"))return;
    const native=updater();
    if(native){
      native.postMessage(JSON.stringify({action:"download-update",url}));
      toast.info("已请求系统下载新版。下载后安卓会要求你确认安装。");
    }else{
      window.open(url,"_blank","noopener,noreferrer");
      toast.info("已打开更新下载页，安装时请勿卸载旧版。");
    }
  };
  return <div className="flex items-center gap-1">
    {autoWeb?<button type="button" onClick={()=>window.location.reload()} title={"共映 Alpha "+installed+" · 网页功能在线获取新版；离线时回退到内置版本"} className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1.5 text-xs text-primary">
      <DownloadCloud className="size-4"/> 刷新功能（免安装）
    </button>:available?<button type="button" onClick={install} title={"版本 "+installed+" → "+available.build+"；更新后数据保留"} className="flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1.5 text-xs font-semibold text-primary">
      <DownloadCloud className="size-4"/> 更新 {available.build}
    </button>:<button type="button" onClick={()=>void check(true)} disabled={checking} title={"当前安卓 Alpha "+installed+" · 点击检查更新"} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground">
      <DownloadCloud className="size-4"/>{checking?"检查…":"检查更新"}
    </button>}
  </div>;
}
