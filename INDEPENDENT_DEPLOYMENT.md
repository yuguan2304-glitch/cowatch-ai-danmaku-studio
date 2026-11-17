# 共映 CoWatch｜独立部署（不依赖 Lovable）

本项目代码由你自己的 GitHub 仓库管理；Lovable 仅为初始生成工具，部署、更新、域名和运营不必经过 Lovable。网站**仍需一台在线主机**，推荐在免费额度内先试用 Cloudflare Workers，并随时保留迁移到其他主机的自由。

## 目前结构

- React 19 + TanStack Start + Vite。不是可直接上传 index.html 的普通静态站点，具有服务器构建产物。
- `bun run build` 生成生产构建；`bunx tsc --noEmit` 检查类型。
- 页面默认不上传本地视频到共映服务器；用户主动使用 AI 时，才向选定服务商发送指定帧、字幕或视频。
- API 密钥只存在浏览器内存，部署时**不需要**填写任何弹幕/翻译 API 密钥。

## 方案 A：Cloudflare Workers 独立站点（推荐）

参考官方文档：https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/

1. 登录 https://dash.cloudflare.com/ ，进入 **Workers & Pages**。
2. 选择创建 Worker，并选择 **Import a repository / Connect to Git**，授权仓库 `yuguan2304-glitch/cowatch-ai-danmaku-studio`。设置生产分支为 `main`。
3. 仓库使用 `bun.lock`，可选择 Bun；建议首先试：
   - Build command: `bun install --frozen-lockfile && bun run build`
   - Deploy command: `npx wrangler deploy`
4. 如果 Cloudflare 自动识别 TanStack Start，Wrangler 会生成配置，通常指向 `.output/server/index.mjs` 和 `.output/public`。如果提示缺少配置或构建产物，**停止发布**，检查日志后再按框架文档迁移构建适配器。不要乱填 API 密钥。
5. 完成后，Cloudflare 会提供一个 `workers.dev` 网址；可以以后再绑定个人域名。
6. 正式对外分享前，用自己的浏览器测试：本地视频载入、暂停/拖动同步、演示弹幕、导入字幕、导出 JSON/SRT；最后才测试自有 AI API。

**提醒：** 目前的 Vite 配置引入 `@lovable.dev/vite-tanstack-config`。它是构建时依赖，而不是页面必须经过 Lovable 才能加载的运行平台。后续可替换成社区标准 Vite 配置以彻底去除构建依赖。Cloudflare Workers 是否直接兼容当前产物，仍需真实部署验证。

## 费用和隐私

- Cloudflare Workers 有免费额度，但**不是无限制免费**；使用前核对当前官方计费限制。
- 站点托管不代表 AI 模型免费。每个使用者自行提供 API Key。不要提交密钥到 GitHub，也不要在截图里暴露密钥。
- 不要为解决 CORS 向公开服务器搭建不受保护的 API Key 中转代理。
- 如果保持仓库私有，可通过 Cloudflare Git 安装授权指定仓库，不必公开源代码。

## 验收顺序

1. CI 构建、类型检查通过。
2. 独立网址访问得到共映 UI，而非空白页。
3. 本地视频和演示弹幕通过。
4. 用户自带 API 测试（可能产生费用）。
5. 分享公开地址。

源码属于你，之后可以改用其他云服务或自建服务器，不锁定在 Lovable。
