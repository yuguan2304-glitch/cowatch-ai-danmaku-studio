# 共映 CoWatch · Android 发行说明

## 当前版本状态

- 网页版：由 Cloudflare Workers 静态托管，网址 https://cowatch-ai-danmaku-studio.yuguan2304.workers.dev/
- Android Alpha：GitHub Release 的 `android-alpha-4` 为**临时调试签名** APK，只用于内测；不建议当作长期面向公众的稳定安装渠道。
- Android 正式签名：仓库已经配置 **Android Signed Public Release** 手动工作流；**在仓库所有者完成以下签名密钥配置和第一次成功签名发布前，尚未有正式签名版 APK**。

## 所有者首次配置（仅在自己可信的电脑上操作）

1. 安装 JDK 17+（自带 `keytool`）和 Android Studio 或 Android SDK。创建一个只用于共映的新签名文件：
   ```bash
   keytool -genkeypair -v -keystore cowatch-release.jks -storetype PKCS12 -alias cowatch -keyalg RSA -keysize 3072 -validity 10000
   ```
   请自行设置并记录存储库口令、密钥口令、别名。**切勿将 .jks 文件、口令或 Base64 文本提交 GitHub、粘贴到 Issue、发给 AI 或上传社交平台。**

2. 对 `cowatch-release.jks` 做至少两份安全离线备份，并在安全位置保存口令。签名文件一旦丢失，未来就无法为已安装的用户发布可直接升级的相同身份 APK。
3. 从本地 JKS 文件生成一整行 Base64（这是敏感密钥，不要贴到任何公开位置）。Linux: `base64 -w0 cowatch-release.jks`；macOS: `base64 < cowatch-release.jks | tr -d '\\n'`；Windows PowerShell：`[Convert]::ToBase64String([IO.File]::ReadAllBytes("cowatch-release.jks"))`。
4. 在仓库 GitHub → Settings → Secrets and variables → Actions 新增 **Repository secrets**，名称完全一致：
   - `COWATCH_SIGNING_KEYSTORE_BASE64`：上面的 Base64
   - `COWATCH_SIGNING_STORE_PASSWORD`：keystore 口令
   - `COWATCH_SIGNING_KEY_ALIAS`：别名，例如 `cowatch`
   - `COWATCH_SIGNING_KEY_PASSWORD`：密钥口令
5. Settings → Environments → 新建 `android-release` 环境。推荐添加 Required reviewers（仅仓库可用时）或部署分支限制。密钥永远不要写进 workflow 文件。
6. Actions → **Android Signed Public Release** → Run workflow，输入版本号，例如 `0.2.0-beta.1`，确认执行；成功后在 Releases 获得经过签名验证的 APK。保持后续版本号不重复；版本码由 GitHub Actions 的工作流运行编号生成，不能小于旧版。
7. 在自己的安卓设备安装验证：应用能启动、选择本地视频、全屏隐藏系统栏、生成弹幕、保存收藏、返回键退出横屏。**首次由调试签名 Alpha 迁移到发布签名 APK，签名不同，通常必须卸载旧版才能安装。** 卸载旧版可能删除本地收藏、API 配置、视频副本；请先确认不再需要这些数据，或备份后再迁移。
8. 公开 APK 下载前，建议额外验证 SHA-256 校验值，并用 Google Play Protect 检查。

## 更新策略

- 每次正式发行使用**同一把**发布签名密钥，才能实现同包名覆盖更新。
- 不要以已发布 APK 版本对应的新签名再签同一包名；这会让 Android 拒绝更新。
- 在 GitHub Actions 的临时 runner 中解码签名密钥并在结束后删除。仓库访问权限、Actions 工作流和密钥应只由可信维护者修改。GitHub Actions 中能执行代码的有权限维护者理论上能够接触部署密钥，因此请认真管理仓库合并权限。
- **本测试版不是 Google Play 应用**，没有自动更新服务，也没有经过完整的第三方安全审计。
