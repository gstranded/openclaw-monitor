# Phase 5 QA Report — Overview/Staff 信息架构 + Events 不搬运 Task（P5-qa）

- Issue: https://github.com/gstranded/openclaw-monitor/issues/64
- QA owner: 闪电（shandian）
- Baseline (locked): `main@e7a6ee3` (merged PR #65 / #66 / #67)
- Deployed:
  - WEB: http://172.23.215.180:5173/
  - API: http://172.23.215.180:3000/
- Date: 2026-03-14

> 目标：对齐 openclaw-control-center 的 overview / staff clarity 体验；保证事件流「可筛选、默认 digest、需要时展开 raw detail」，并在数据缺失时**明确降级而不误导**。

---

## 0) 总结（结论 + 下一步）

- 结论：**HOLD（有条件可合）**
  - ✅ 事件流默认 digest + raw detail 折叠：符合验收。
  - ✅ Working/Standby/Idle 的后端判定逻辑成立，且在多种缺失场景能正确降级。
  - ⚠️ 1440/1024/375 三档布局与滚动：本机缺少可运行 headless browser 依赖，无法做“真实浏览器级”体感验证；已基于 CSS 断点与结构做静态核验，并建议补一次人工 2 分钟 smoke。

**下一步建议（解除 HOLD 的最低动作）**
1. 任意同学在 Chrome 下对部署环境做一次人工 smoke（1440/1024/375，滚动与 wrap，约 2 分钟），并在 Issue #64 回一句 “viewport smoke done”。
2. 如果希望 QA 可自动化回归，建议在 CI 中加入 Playwright（或在 runner 预装依赖）。

---

## 1) 验收范围（Scope）

页面/路由：
- Dashboard: `/`
- Staff: `/staff`
- Markdown: `/markdown` 与 `/markdown/:fileId`

验收点（来自 TASK/Issue #64）：
1. events 默认不展示完整 task 原文；展开才可见 detail（若有）
2. Working/Standby/Idle 判定符合定义；至少 2 种数据缺失场景验证降级
3. 1440/1024/375 三档布局与滚动体验

---

## 2) 回归自检（本地）

在 `main@e7a6ee3` 上执行：

```bash
npm run check
npm test
python3 scripts/check_markdown_boundaries.py --verify-artifact-layout

npm --prefix web ci
npm --prefix web run typecheck
npm --prefix web run build
```

结果：全部 PASS（backend tests 9/9；web typecheck/build 成功）。

---

## 3) 验收点 1：Events 默认 digest，raw detail 折叠

### 3.1 UI 实现核验（代码级）

- `web/src/components/EventStream.tsx`：
  - 列表默认展示 `title + summary(message)`
  - `detail` 只有在 `it.detail` 存在时出现，并通过 `<details className="eventDetailToggle">` 折叠：默认不展开，需要用户点 `raw detail`

结论：✅ “默认不搬运完整 task 原文；展开才可见 detail（若有）”

### 3.2 部署环境 API 采样（证据）

对部署环境调用 `GET /api/dashboard`：
- events 总数：200（slice）
- `events containing markdown header/code`: 0
- `events summary > 200 chars`: 1
- task 类事件样例：
  - kind=`task`
  - title=`Task blocked / Task reopened`
  - summary 仅为短标题（例如：`[P5-qa] 验收回归：overview/staff 新信息架构 + events 不搬运 task`）
  - extra 含 `task_id / reason`（作为 raw detail 的来源）

结论：✅ 默认 digest 没有把 task 原文全文塞进 summary。

---

## 4) 验收点 2：Working/Standby/Idle 判定 + 降级验证

### 4.1 判定定义（后端）

后端 staff 判定来自 `src/data.js::buildStaffView()`：

- evidence：session 的 `lastActiveAt` 与 events 的 `at`（取 max）
- Working：存在 live session 或最近 evidence（窗口 `OPENCLAW_WORKING_WINDOW_MS`，默认 10min）
- Standby：无 recent evidence，但存在 backlog（todo/blocked）
- Idle：无 recent evidence 且无 backlog

### 4.2 部署环境现状（缺失场景 #1：sessions 不可用）

部署环境 `GET /api/dashboard` 返回：
- `meta.partial=true`
- `degradeReasons=['sessions_unavailable']`
- staff 示例（节选）：
  - `shandian.status=working`（currentActivity = Working: ...）
  - 其余大部分 agent 为 `idle`

结论：✅ 在 sessions 缺失时仍可用 events/tasks 做 best-effort staff 判定，并通过 meta.partial 明确降级。

### 4.3 本地模拟缺失场景（缺失场景 #2：events 不可用）

以 `test/fixtures/runtime` 为基线，删除 `events.json` 启动后端，调用 `GET /api/dashboard`：

- `meta.partial=true`
- `degradeReasons=['events_unavailable']`
- staff（节选）：
  - `buding.status=standby`（Backlog: ...）

结论：✅ events 缺失时，仍能把“有 backlog 但无 evidence”正确降级为 standby。

> 备注：同样验证了 `sessions.json` 缺失时，`degradeReasons=['sessions_unavailable']` 且 backlog agent 被判定为 standby。

---

## 5) 验收点 3：1440/1024/375 布局与滚动

### 5.1 静态核验（CSS/结构）

- 全局单滚动容器：
  - `.page { height: 100dvh; display:flex; flex-direction:column; }`
  - `.grid { flex:1; min-height:0; overflow:auto; }`
- 三列到单列断点：
  - `.gridCols { grid-template-columns: ... }`
  - `@media (max-width: 1100px) { .gridCols { grid-template-columns: 1fr; } }`
- Staff 表格响应式：
  - `.staffRow/.staffHeader` 6 列布局
  - `@media (max-width: 1100px) { .staffHeader {display:none}; .staffRow { grid-template-columns: 1fr; } }`
- 小屏（375）补丁：
  - `@media (max-width: 520px)` 针对 staff snapshot/link/task 的换行策略（避免 ellipsis 误导）

结论：✅ 从结构上具备 1440（3 col）、1024/375（折叠为 1 col）及单滚动容器的必要条件。

### 5.2 限制说明（为什么仍然 HOLD）

当前 QA 环境无法运行 Playwright/Chromium（缺少系统依赖且无 sudo/elevated 权限），因此无法给出：
- 真实浏览器下的滚动手感（是否双滚动条、是否抖动）
- 真实浏览器下的 wrap/overflow 视觉效果

建议补一次人工 smoke：
- 1440：确认三列区域不挤压、Events controls 不遮挡
- 1024：确认折叠后信息密度可读、无横向溢出
- 375：确认 Staff 行/Events controls wrap 后仍可操作

---

## 6) 风险分级与建议

- P0：未发现。
- P1：
  - 建议把“viewport smoke”加入发布前 checklist（因为当前无法自动化截图）。
- P2：
  - 建议在 CI/runner 侧补 Playwright 依赖，后续把 3 档 viewport + /staff + /markdown 的 smoke 自动化。

---

## 7) Merge readiness

- **HOLD**：核心逻辑与降级行为通过，但 viewport/滚动体验缺少真实浏览器级证据；建议补一次人工 smoke 后即可认为 merge-ready。
