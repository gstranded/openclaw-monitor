# Viewport smoke (headless Playwright)

目的：在**无桌面环境**下产出 1440/1024/375 三档截图，用于回归 overview/staff/markdown 等关键页面布局与滚动体验。

## CI（推荐 / 可复现）

仓库内提供 GitHub Actions workflow：`.github/workflows/viewport-smoke.yml`

- 自动触发：本次 ops 分支 push（用于产出一次证据）
- 常规使用：Actions 手动 `Run workflow`（`workflow_dispatch`）

Workflow 会：

1. 启动后端（3000）+ Vite dev server（5173）
2. 安装 Playwright Chromium 及系统依赖（runner 有 sudo）
3. 对以下路由生成截图并输出 `summary.json`：
   - `/`、`/staff`、`/markdown`
   - viewport：1440 / 1024 / 375

产物：Actions artifact `viewport-smoke`（包含 screenshots + backend/web logs）。

## 本机无 sudo 的情况

当前 host 若缺 `libatk-1.0.so.0` 等系统库，直接运行 Playwright 的 `headless_shell` 会失败。

可选方案：

- 使用 GitHub Actions（上面已覆盖）
- 或用 Playwright 官方容器镜像（需要本机可用 Docker）：

```bash
docker run --rm -t \
  -v "$PWD:/work" -w /work \
  mcr.microsoft.com/playwright:v1.50.1-jammy \
  bash -lc 'npm ci && npm --prefix web ci && OPENCLAW_RUNTIME_DIR=/work/.tmp/runtime PORT=3000 node src/server.js & npm --prefix web run dev -- --host 127.0.0.1 --port 5173 & sleep 3 && node scripts/viewport_smoke.mjs --base-url http://127.0.0.1:5173 --out artifacts/viewport-smoke'
```
