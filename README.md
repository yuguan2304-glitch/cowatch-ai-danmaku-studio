# CoWatch AI Danmaku Studio

构建中文优先的真实可用响应式 Web App「共映 CoWatch｜AI弹幕放映室」，深色影院风格、手机和电脑适配。核心：本地视频通过 object URL 播放，直接 MP4/WebM 视频链接支持播放及 CORS 允许时分析；YouTube/B站链接仅在合法嵌入可用时播放，明确若无法读取媒体则提示上传本地文件或字幕，不假装解析。播放器叠加滚动弹幕，严格与 currentTime、暂停、seek、倍速同步，防碰撞轨道、开关、速度、字体/透明度、显示密度、区域、全屏。支持多选语言（简繁中文、English、日语、韩语等）、观众身份（粉丝、乐子人、磕学家、技术党、路人、老粉、吐槽役、考据党）、语气（活泼、玩梗、温柔、冷幽默、理性、毒舌、碎碎念、激动），权重与自定义人物名称/性格/关注对象/背景/禁词/额外提示，多观众互动短期记忆，禁止剧透模式，密度5-100条/分钟和总量选项。真实生成必须接真实用户自定义API：OpenAI兼容 base URL/model/key 与 Gemini native 视频/多模态模式可配置，默认无密钥，密钥仅内存会话，不持久化或记录，不暴露给不相关服务。可通过客户端抽帧（可配置间隔、分段、分辨率）并导入 SRT/VTT 字幕，发送带时间戳的图片与字幕给支持图像的 OpenAI compatible 模型，若支持 Gemini 原生视频可采用合规视频输入方式；明确无音轨转录时只分析帧及已有字幕，不声称理解音频，尝试真实可配置转录接口作为可选项。按段生成结构化 JSON {time,text,viewer,color}，验证时间范围、去重、分段进度、取消、重试、错误可见、成本预估（无定价时标明无法预估）和预生成/边播边生成缓冲。禁止剧透时只提供时间点之前可见素材，避免未来信息。生成结果可逐条编辑删除，按片段重新生成，导出/导入 JSON 和 B站兼容 XML。历史记录和观众预设保存到本地 IndexedDB，视频默认不上传至应用服务器，明确生成时选定帧/字幕或视频会发送给用户指定AI供应商。清晰标注演示数据，不以模拟弹幕充当真实分析。提供适合首次用户的配置指引、测试连接、明确 API 不等于 ChatGPT Plus，浏览器跨域限制提示，避免任意代理与公开泄露key。主页面播放器优先，设置移动端折叠面板，历史和预设独立页面。默认简中、粉丝/乐子人/磕学家，活泼/玩梗，35条每分钟。实现真正可执行的 MVP 并检查构建，不要仅静态 mockup。不要自动发布网站。

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1cbba8be-ee15-41a5-b453-78afc8a7c3bd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
