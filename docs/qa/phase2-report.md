# Phase 2 QA Report — Dashboard / Agent Detail / Markdown 管理 / 安全边界与回滚

- Issue: https://github.com/gstranded/openclaw-monitor/issues/41
- QA owner: 闪电（shandian）
- Date: 2026-03-11

## 1) Target / 环境锁定

### Repo / 版本

- repo: `gstranded/openclaw-monitor`
- verified commit: `f2e0fe186ce80b8e6ba63036965410d8b62e1e89` (`origin/main`)

Merged PRs (per Issue #41 notes):
- #42 Dashboard frontend V1
- #44 backend: markdown boundaries + rollback/audit + SSE events stream
- #46 web: agent detail + markdown file management

### 环境

- OS: Linux (x64)
- Node: `v22.22.1`
- npm: `10.9.4`

## 2) 运行方式（可复现）

### Backend

```bash
npm run check
npm test

export OPENCLAW_RUNTIME_DIR=/abs/path/to/claw_team/runtime
npm start
# http://127.0.0.1:3000
```

### One-click

```bash
export OPENCLAW_RUNTIME_DIR=/abs/path/to/claw_team/runtime
./scripts/run_local.sh
```

### Frontend

```bash
cd web
npm ci
npm run dev
# Vite dev server proxies /api -> http://127.0.0.1:3000
```

Routes:
- `/` dashboard
- `/agents/:agentId` agent detail
- `/markdown` markdown allowlist list
- `/markdown/:fileId` markdown editor

## 3) 覆盖范围（Scope checked）

- Dashboard 聚合数据（含 meta.partial / degradeReasons / freshness）
- Agent 详情 API
- Markdown：files/list、read、preview diff、save（expectedContent 冲突检测）
- 安全边界：越界路径拒绝（FORBIDDEN_PATH）、扩展名/路径策略
- Rollback/Audit：写入前备份 + audit jsonl 可核验
- SSE：`GET /api/events/stream` 基本可用性（Content-Type + 初始 meta + event 输出）
- Frontend：`web/` typecheck + build 可通过（产物可生成）

## 4) 验收用例与结果

### 4.1 自动化（CI 等价）

#### Backend lint/check

```text
> npm run check
(node --check src/server.js && node --check src/data.js && node --check src/router.js)
PASS
```

#### Backend tests

```text
> npm test
# tests 9
# pass 9
# fail 0
PASS
```

#### Markdown boundary policy

```text
python3 scripts/check_markdown_boundaries.py --verify-artifact-layout
markdown boundary check passed
backupDir=.rollback/markdown-edits
auditLogPath=.audit/markdown-edits.jsonl
PASS
```

### 4.2 Frontend build

```text
npm --prefix web ci
npm --prefix web run typecheck
npm --prefix web run build
vite ... ✓ built
PASS
```

备注：`npm audit` 显示 2 个 moderate 漏洞（未阻塞当前 CI）。

### 4.3 degraded/partial（缺失数据源可解释）

使用 `OPENCLAW_RUNTIME_DIR` 指向临时 runtime 快照验证：

- full snapshot（scores/tasks/events 都存在）
  - **Expected**: `meta.partial=false`
  - **Actual**: `meta.partial=false`, `degradeReasons=[]`

- missing `scores.json`
  - **Expected**: `meta.partial=true` 且 reasons 包含 `scores_unavailable`
  - **Actual**: `meta.partial=true`, `degradeReasons=["scores_unavailable"]`

结论：✅ 可解释（partial/degraded）

### 4.4 Markdown 管理：preview/save/冲突/越界/rollback/audit

#### Preview diff

- **Expected**: changed=true 且返回 diff
- **Actual**: preview status=200, changed=true ✅

#### Save（受控写入）+ rollback/audit

- **Expected**:
  - 保存成功
  - `.rollback/markdown-edits/` 生成备份文件
  - `.audit/markdown-edits.jsonl` 追加审计记录（含 actor/fileId/hash/backupPath）
- **Actual**:
  - save status=200 saved=true ✅
  - rollback files=1 ✅
  - audit bytes>0 ✅

#### expectedContent 冲突

- **Expected**: stale expectedContent → 409 CONFLICT
- **Actual**: 409 + `error.code=CONFLICT` ✅

#### 越界写入拒绝

- **Expected**: `../TASK.md` 被拒绝（403 FORBIDDEN_PATH）
- **Actual**: 403 + `FORBIDDEN_PATH` ✅

结论：✅ 安全边界与回滚/审计可核验

### 4.5 SSE 事件流（/api/events/stream）

- **Expected**: `Content-Type: text/event-stream` + 初始 meta + event 输出
- **Actual**: 200 + `text/event-stream; charset=utf-8`，样例：

```text
: connected

event: meta
data: {"partial":false,...}

event: event
data: {"at":"...","kind":"task",...}
```

结论：✅ SSE 基本可用

## 5) Blockers / 风险

- Blockers: **None found**
- Risks / follow-ups:
  - `web/` 依赖存在 `npm audit` moderate 漏洞（建议评估是否纳入质量门禁，但不建议阻塞当前验收）。

## 6) Merge Recommendation

- **PASS（merge-ready）**：按 Issue #41 验收项（安全边界/rollback-audit/degraded-partial/SSE + 前端 build）均通过。

## 7) 附：本次验收关键命令清单

```bash
# backend
npm run check
npm test
python3 scripts/check_markdown_boundaries.py --verify-artifact-layout

# frontend
npm --prefix web ci
npm --prefix web run typecheck
npm --prefix web run build
```
