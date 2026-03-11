# Architecture

> 本文描述 openclaw-monitor 的当前架构与数据流（以 Phase 2 实现为基线）。

## 1. Overview

openclaw-monitor = **Backend 聚合 API（Node）** + **Web Dashboard（Vite + React）**。

- Backend 从 OpenClaw runtime 快照 JSON 中读取数据，并聚合为：dashboard / agent detail / markdown 管理接口。
- Frontend 通过 Vite proxy 访问 `/api/*`，以读为主，Markdown 保存通过受控 API 完成。

## 2. Data flow

```text
OpenClaw runtime snapshots
(scores.json / tasks.json / events.json)
          │
          ▼
Backend (src/server.js + src/router.js + src/data.js)
          │  exposes /api/dashboard, /api/agents/:id, /api/markdown/*
          ▼
Frontend (web/)
  - / dashboard
  - /agents/:agentId
  - /markdown, /markdown/:fileId
```

## 3. Backend

- `src/server.js`: Node http server
- `src/router.js`: 路由与参数校验，统一 envelope
- `src/data.js`: 从 runtimeRoot 加载 JSON，计算 meta.freshness / degradeReasons

### 3.1 Runtime root

通过 `OPENCLAW_RUNTIME_DIR` 指定；若未设置则尝试从 repo 根向上查找包含 `tasks.json` 的目录。

### 3.2 Health / meta

所有聚合接口返回 `meta`：

- `partial`: 是否有数据源不可用或被降级
- `degradeReasons`: 降级原因
- `freshness`: 每个数据源的 lag/mtime 计算

## 4. Markdown 管理的安全边界

写操作（保存）必须满足：

- allowlist：只能操作明确允许的 markdown 文件
- path boundary：禁止 `..` 等越界路径
- optimistic guard：`expectedContent` 防止覆盖
- rollback：可选（策略启用时写入 `.rollback/markdown-edits/`）
- audit：可选（策略启用时写入 `.audit/markdown-edits.jsonl`）

策略配置：`config/markdown-boundaries.json`

## 5. Frontend

- Vite + React，组件在 `web/src/components/`
- 页面：
  - `DashboardPage.tsx`
  - `AgentPage.tsx`
  - `MarkdownListPage.tsx`
  - `MarkdownEditorPage.tsx`

## 6. Non-goals

- 本项目当前不提供：认证/鉴权、多租户、写操作运维闭环。
- Phase 2 / 3 目标是把“观察面与受控写入”做好，后续再扩展。
