const { app, BrowserWindow, protocol, net, shell, session } = require("electron");
const { pathToFileURL } = require("url");
const path = require("path");
const fs = require("fs");

protocol.registerSchemesAsPrivileged([
  { scheme:"cowatch", privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true} },
]);
const origin = "cowatch://app";
const assetsRoot = path.join(process.resourcesPath,"web");
const mime = {".js":"text/javascript",".mjs":"text/javascript",".css":"text/css",
  ".html":"text/html",".json":"application/json",".svg":"image/svg+xml",
  ".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",
  ".webp":"image/webp",".woff2":"font/woff2",".ico":"image/x-icon",
  ".wasm":"application/wasm"};

function securePath(url) {
  const incoming=new URL(url);
  let relative=decodeURIComponent(incoming.pathname).replace(/^\/+/, "");
  if(!relative || (!path.extname(relative) && !relative.startsWith("assets/")))relative="index.html";
  const full=path.resolve(assetsRoot,relative);
  const root=path.resolve(assetsRoot);
  if(full!==root && !full.startsWith(root+path.sep))return null;
  return full;
}
app.whenReady().then(async()=>{
  protocol.handle("cowatch",async request=>{
    const filename=securePath(request.url);
    if(!filename || !fs.existsSync(filename) || !fs.statSync(filename).isFile())
      return new Response("Not found",{status:404});
    const response=await net.fetch(pathToFileURL(filename).toString());
    const type=mime[path.extname(filename)];
    if(type){const h=new Headers(response.headers);h.set("Content-Type",type);return new Response(response.body,{status:response.status,headers:h});}
    return response;
  });
  const win=new BrowserWindow({
    title:"共映 Alpha",width:1280,height:860,minWidth:820,minHeight:580,
    backgroundColor:"#15110e",autoHideMenuBar:true,
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,
      webSecurity:true,allowRunningInsecureContent:false}
  });
  win.webContents.setWindowOpenHandler(({url})=>{
    try {const u=new URL(url);if(u.protocol==="https:")void shell.openExternal(url);}catch{}
    return {action:"deny"};
  });
  win.webContents.on("will-navigate",(event,url)=>{
    if(!url.startsWith(origin+"/")){event.preventDefault();try{const u=new URL(url);if(u.protocol==="https:")void shell.openExternal(url);}catch{}}
  });
  await win.loadURL(origin+"/index.html");
});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
