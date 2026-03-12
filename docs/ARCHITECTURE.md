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

## 4. Events & Timeline semantics

Backend 从 `events.json` 读取 **raw events**，并在聚合接口中输出两类结构：

- `events`: 规范化后的事件列表（用于 Event 面板）
- `timeline`: 去噪后的关键时间线（用于 Timeline 面板）

### 4.1 Event schema (normalized)

在 `/api/dashboard` 与 `/api/agents/:id` 中，`events[]` 至少补齐以下字段（保持向后兼容：原始字段仍保留）：

- `at` (ISO string | null)
- `kind` (string)
- `severity` (`info` | `warn` | `error`)
- `agentId` (string | null)
- `source` (string, default `runtime`)
- `title` (string)
- `summary` (string)

### 4.2 Ordering

- `events`: **按 `at` 倒序**（最新在前；缺失 `at` 的按输入顺序稳定排序）
- `timeline`: **按 `at` 正序**（最旧在前，方便 UI 展示状态演进）

### 4.3 De-noise / merge

对明显噪声事件（例如 `worker-tick` / `worker-skip`）进行连续合并，并在合并项上补充：

- `count`：合并数量
- `atEnd`：合并覆盖的最早时间（可选）

## 5. Markdown 管理的安全边界

写操作（保存）必须满足：

- allowlist：只能操作明确允许的 markdown 文件
- path boundary：禁止 `..` 等越界路径
- optimistic guard：`expectedContent` 防止覆盖
- rollback：可选（策略启用时写入 `.rollback/markdown-edits/`）
- audit：可选（策略启用时写入 `.audit/markdown-edits.jsonl`）

策略配置：`config/markdown-boundaries.json`

## 6. Frontend

- Vite + React，组件在 `web/src/components/`
- 页面：
  - `DashboardPage.tsx`
  - `AgentPage.tsx`
  - `MarkdownListPage.tsx`
  - `MarkdownEditorPage.tsx`

## 7. Non-goals

- 本项目当前不提供：认证/鉴权、多租户、写操作运维闭环。
- Phase 2 / 3 目标是把“观察面与受控写入”做好，后续再扩展。
