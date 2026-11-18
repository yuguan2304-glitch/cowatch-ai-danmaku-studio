# 🎬 共映 CoWatch · AI 弹幕放映室

一个可以给自己的视频邀请**虚拟观众**的私人放映室。支持本地视频、AI 弹幕、模拟评论、私人收藏，以及安卓横屏沉浸观影。

**当前状态：公开测试版（Alpha）。欢迎反馈，功能可能变更。**

- 🌐 **网页版：** https://cowatch-ai-danmaku-studio.yuguan2304.workers.dev/
- 📱 **Android Alpha 测试版：** [查看 GitHub Releases](https://github.com/yuguan2304-glitch/cowatch-ai-danmaku-studio/releases)（文件名含 `alpha-preview` 的版本内置启动界面，可与旧版本并存）
- 🔒 **隐私说明：** [PRIVACY.md](PRIVACY.md)
- 📦 **正式签名 APK 发布流程：** [docs/ANDROID_RELEASE.md](docs/ANDROID_RELEASE.md)
- 🛡️ **公开前安全核对：** [SECURITY.md](SECURITY.md)

## 主要功能

| 功能 | 使用说明 |
| --- | --- |
| AI 弹幕 | 为支持分析的本地视频抽取画面并生成带时间轴的弹幕；需要自备 AI API |
| 虚拟观众 | 粉丝、乐子人、技术党、考据党、磕学家等身份；可自定义语言、性格、权重和指定 CP |
| 模拟评论区 | 主动触发生成 AI 观后评论，也可自己发表评论、点赞和回复；不是公共社区 |
| 我的放映室 | 手动保存视频（本地文件会占用存储空间）、弹幕、字幕、评论；首页显示本地收藏推荐卡 |
| 视频 AI 字幕 | 可导入 SRT/VTT，或调用自备转录 API 提取字幕；长视频尝试在设备端实时生成音频分段，可能需要视频本身的时长 |
| 翻译 | 自备翻译 API 或复用兼容的 AI 接口，翻译字幕并以原文/译文/双语显示 |
| 安卓横屏 | Android WebView 原生外壳可切换横屏、在观影时隐藏 Android 系统状态栏/导航栏；效果依设备而异 |

## 快速开始

1. 打开网页版或安装 Android Alpha APK（当前为**调试签名**版本，仅供内测）。
2. 导入一个自己有权使用的本地视频；YouTube/B站等链接通常只能嵌入播放，**不能保证 AI 读取画面和音轨**。
3. 右上角打开「设置」→「AI 接口设置」，填入自备 OpenAI 兼容或 Gemini 服务的地址、模型与 API 密钥；先点测试连接。
4. 选择虚拟观众和弹幕参数，主动启动生成；生成会向你选择的 API 服务商发送分析材料并可能产生费用。
5. 观看弹幕和模拟评论，满意后点击「收藏这场放映」，以后可以在「我的放映室」重新打开。

**注意：** ChatGPT Plus 订阅不等于 API 额度。API 是否支持图片、转录、视频和跨域请求，取决于具体模型及服务商；中转站需要自行确认其服务条款和安全性。

## Android 安装与更新

[Releases 页面](https://github.com/yuguan2304-glitch/cowatch-ai-danmaku-studio/releases) 当前包含 `android-alpha-4` 调试签名 APK。可下载后在安卓设备中安装；第三方安装包需要谨慎验证来源。**这不是长期稳定更新渠道**。仓库已提供用户自行保管密钥的正式签名发布工作流，在首次成功完成发布前，不应宣传已提供正式签名稳定 APK。

调试签名版改为正式签名版时，通常无法直接覆盖安装，卸载旧 App 可能清除本地收藏。请先阅读 [升级说明](docs/ANDROID_RELEASE.md)。

## 数据与隐私

- 无共映账号，也没有云端收藏同步。本地收藏保存在该设备的浏览器/应用数据内。
- API 密钥默认不会持久保存；主动选择「记住」才会在此设备的 localStorage **未加密**保存。
- AI 分析、转录与翻译需要将相应素材发送给用户选择的外部 API 服务商。
- 共映不负责第三方服务的计费、内容处理或数据保留政策。使用前请阅读 [隐私说明](PRIVACY.md)。

## 开发

需要 Node.js/Bun 与可用的依赖源：

```sh
bun install
bun run dev
```

构建与检查：

```sh
bun run build
bunx tsc --noEmit
bunx wrangler deploy --dry-run
```

Android 工程位于 `android/`；仓库的 GitHub Actions 可构建测试 APK。正式签名工作流使用仓库所有者设置的 GitHub Secrets，详见 [发行文档](docs/ANDROID_RELEASE.md)。

## 项目说明

该项目最初基于 Lovable 创建，随后迁移为独立托管的 Vite + React 单页应用，并增加 Cloudflare Workers 部署和 Android 原生外壳。

**开源代码可供阅读和协作。** 当前仓库尚未明确选定源代码许可协议；在添加许可证之前，不应假定所有代码、第三方素材或品牌元素都可自由复制、修改和再分发。

问题反馈请使用 GitHub Issues，避免在 Issue 中张贴 API 密钥、私人视频或其他敏感信息。


## ☁️ PC / Android 自动同步（Alpha）

- 「共映设置」→「多设备自动同步」：同一邮箱登录后，电脑与手机在前台每约 30 秒合并并保存弹幕、字幕、观众设定和放映收藏等元数据。
- 此功能需要云端 Supabase 项目的 URL、**公开** publishable/anon key、邮箱 OTP 和 `public.cowatch_sync` 数据表。仓库附带 [数据库安全配置 SQL](docs/SUPABASE_CLOUD_SYNC.sql)。在公共云配置完成前，界面里的登录同步无法直接使用。
- 不上传原视频文件、AI 密钥、私密中转站地址；视频须按设备单独选择或导入完整放映包。
- 两端同时修改同一条内容时可能存在覆盖风险，尚不支持跨设备删除同步；重要记录仍建议备份。
- 旧在线 WebView 版本随在线网站更新后可通过登录同步历史记录；旧的内置页面 APK 无法直接读取新版独立 App 的沙盒，必须先从旧版导出 `.cowatch` 放映包做一次迁移。**不要清除或卸载旧版**，直至核实数据已迁出。
