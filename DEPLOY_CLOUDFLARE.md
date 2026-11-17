# 共映 CoWatch：独立部署指南

本项目已采用 Cloudflare Vite Plugin + Workers，独立构建测试已经验证可生成 Wrangler 部署包。

## 手机端借助 GitHub 一键手动部署

部署工作流位置：`.github/workflows/deploy-cloudflare.yml`。**仅手动触发，不会自动发布。**

1. 登录或注册 [Cloudflare 控制台](https://dash.cloudflare.com/) 并开启 Workers 功能。
2. 在账户页面找到 **Account ID**，然后在 **My Profile → API Tokens → Create Token** 生成权限尽可能小的 Workers 部署令牌。首次创建 Worker 需要创建权限。参考[Cloudflare 官方 GitHub Actions 指引](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)。
3. 打开 GitHub 仓库的 **Settings → Secrets and variables → Actions → New repository secret**，分别填写 `CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_API_TOKEN`。**不要将 Token 发送到聊天，也不要写进源代码。**
4. 将本独立部署分支合并到 `main` 后，在 **Actions → Deploy CoWatch to Cloudflare Workers → Run workflow** 手动选择 main 运行。
5. 从日志读取真正部署完成后的 `workers.dev` 地址，在手机浏览器测试本地视频、演示弹幕和字幕导出。

Cloudflare Workers 免费层有使用限制；AI 模型 API 消耗另计，由使用者自行承担。上线前请按实际条款确认费用。

## 开发

```bash
bun install
bun run build
bunx tsc --noEmit
bunx wrangler deploy --dry-run
```

如果不用 GitHub 部署，也可以在本机执行 `bunx wrangler login` 与 `bunx wrangler deploy`。源码完全保存在 GitHub，不再依赖 Lovable 运行。
