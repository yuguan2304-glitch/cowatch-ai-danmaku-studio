# 安全政策与公开前核对

## 不要提交凭据

请不要在仓库、Issues、Pull Requests、Actions 日志、截图或录屏中公开：
- OpenAI/Gemini/中转站的真实 API 密钥
- Android 正式发布签名 keystore、口令、Base64
- Cloudflare API Token / GitHub Personal Access Token / 私有部署变量

建议将正式发布凭据设为 GitHub Actions Secrets，授权最小权限，并定期复核。

## 发现泄露时

如果已经将真实密钥提交过仓库，**只删除当前文件并不够**；Git 历史与已下载副本仍可能保留。应先去对应服务商**吊销/轮换密钥**，再按情况处理历史并评估受影响范围。

## 安全审计状态

- 已对与 AI、存储、安卓、构建相关的核心当前文件执行常见令牌/私钥模式检查，未发现这些模式的硬编码密钥。
- 本检查**不是完整历史、全部依赖、所有二进制包或云端配置的安全审计**，不能保证不存在凭据。
- 公开前请在可信的开发环境进行全历史扫描（例如 `gitleaks git --redact` 或 `trufflehog git file://<本地仓库路径>`），并启用 GitHub 的 Secret scanning / Push protection（如果当前仓库提供）。
- 严禁将扫描输出中的真正凭据复制到公开报告。

若发现具体安全问题，先私下通知仓库维护者，并避免在公开 Issue 中张贴可用凭据。
