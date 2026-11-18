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
  const [available,setAvailable]=useState<Update|null>(null);
  const [checking,setChecking]=useState(false);
  async function check(showFeedback:boolean){
    if(checking)return;
    setChecking(true);
    try{
      const buildResponse=await fetch("/cowatch-build.json",{cache:"no-store"});
      if(!buildResponse.ok||!buildResponse.headers.get("content-type")?.includes("json"))return;
      const build=await buildResponse.json() as {platform?:string;build?:number;package?:string};
      if(build.platform!=="android"||build.package!=="dev.cowatch.player.alpha.stable2026"||!Number.isInteger(build.build))return;
      setInstalled(build.build!);
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
    }catch(e){if(showFeedback)toast.error(e instanceof Error?e.message:"检查更新失败");}
    finally{setChecking(false);}
  }
  useEffect(()=>{void check(false);},[]);
  if(installed===null)return null;
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
    {available?<button type="button" onClick={install} title={"版本 "+installed+" → "+available.build+"；更新后数据保留"} className="flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1.5 text-xs font-semibold text-primary">
      <DownloadCloud className="size-4"/> 更新 {available.build}
    </button>:<button type="button" onClick={()=>void check(true)} disabled={checking} title={"当前安卓 Alpha "+installed+" · 点击检查更新"} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground">
      <DownloadCloud className="size-4"/>{checking?"检查…":"检查更新"}
    </button>}
  </div>;
}
