# Phase 4 UI QA Report — Dashboard 视觉/滚动 + Event/Timeline 新体验

- Issue: https://github.com/gstranded/openclaw-monitor/issues/55
- QA owner: 闪电（shandian）
- Target commit (locked): `74cd374e5596222e43dc29826353987f0d39c60b` (origin/main) — `style(web): restyle dashboard to match reference (tokens + before/after)`
- Date: 2026-03-12

> 说明：本次验收基于已合入 main 的 UI restyle（PR #52）。Issue #54（事件/时间线数据规范化）仍 open 且无可测 PR，因此“Event/Timeline 新体验（去噪/可行动/有意义时间线）”只能做 **现状差距审计**，无法给出最终 PASS。

---

## 1) Scope checked

按 Issue #55 验收标准覆盖：

- Dashboard `/`
- Agent detail `/agents/:agentId`
- Markdown list `/markdown`
- Markdown editor `/markdown/:fileId`
- Theme: dark/light（含 `?theme=light|dark` 方式与 toggle）
- 回归：API error/partial/degraded 逻辑（通过 web 的 `loadDashboardSnapshot` 归一化 + backend tests）；markdown preview/save 安全边界

证据截图（repo 内已有 before/after）：

- Dashboard
  - `web/screenshots/before/dashboard.png`
  - `web/screenshots/after/dashboard.png`
  - `web/screenshots/after-light/dashboard.png`
- Agent
  - `web/screenshots/before/agents_naicha.png`
  - `web/screenshots/after/agents_naicha.png`
  - `web/screenshots/after-light/agents_naicha_theme_light.png`
- Markdown
  - `web/screenshots/before/markdown.png`
  - `web/screenshots/after/markdown.png`
  - `web/screenshots/after-light/markdown_theme_light.png`

---

## 2) Checks (可复现)

```bash
# backend
npm install
npm run check
npm test
python3 scripts/check_markdown_boundaries.py --verify-artifact-layout

# frontend
npm --prefix web ci
npm --prefix web run typecheck
npm --prefix web run build
```

结果：以上命令均 PASS（backend tests 9/9，web build 成功）。

---

## 3) UI 观感结论（“我觉得丑”的具体点 + 改善点）

### 3.1 明显改善（相对 before）

1. **信息层级更清晰**：顶部 topbar/controls、卡片式分区（Agents/Timeline/Leaderboard/Event Stream）结构更像产品页而非 demo。
2. **视觉不再“纯灰/纯黑”**：tokens + 渐变背景 + 卡片阴影让层次更丰富；dark/light 两套都能看。
3. **全局一致性提升**：按钮、badge、card header/ body、列表 item 的边框/圆角/间距趋于统一，页面更“收敛”。

### 3.2 仍然“丑/不够产品级”的点（具体）

1. **背景网格/光晕有点抢戏**：在 dark 模式下，grid overlay + 多层 radial gradient 叠加，容易让用户注意力被背景带走，尤其在信息密集列表区域。
2. **“muted 字体”对比度偏低**：大量辅助信息（时间戳、meta line、表格 header、detail 文案）在暗背景上略灰，远看会“糊成一片”。
3. **Event 与 Timeline 视觉/语义区分不足**：目前两块都是“左时间戳 + 右标题/摘要”的 list，缺少明显的结构差异（分组、标签、可行动入口），导致用户不清楚看哪块、两者差别是什么。
4. **列表可读性边界**：severity 主要靠边框色提示，缺少显式标识（icon/label），对色弱/低亮环境不友好。

---

## 4) 滚动/布局/窗口缩放（结论 + 风险）

基于当前 CSS 结构（`web/src/styles.css`）：

- `max-width: 1440px` + `gridCols` 三列布局；`@media (max-width: 1100px)` 会改为单列堆叠。
- `AgentsRow` 使用 `overflow: auto`（横向滚动），其余区域默认随页面纵向滚动。

**结论（有限）**：从代码结构与截图看，已具备避免“<1100 三列挤压”的机制；Agents 区域的横向 overflow 属于可接受的局部滚动。

**仍需人工验证项**（建议上游提供可测环境后补一轮）：
- 1440/1280 视窗下三列区域是否出现双滚动条（页面滚动 + 卡片内部纵向滚动）
- Timeline/Event 长列表下是否出现卡顿/滚动抖动（目前无虚拟列表/分组/折叠）
- header 是否需要 sticky（当前不是），在长页面场景下导航/刷新入口可能不够易达

---

## 5) Event/Timeline 新体验（当前差距）

### 5.1 过滤器/搜索

**FAIL（P0）**：
- Dashboard 的 `EventStream` / `Timeline` 组件当前仅渲染 list；无 severity/agent/kind 过滤器、无文本搜索。

### 5.2 “Event 信息不乱且可行动”

**Not ready（P0/P1）**：
- 当前 event/timeline item 缺少明确的结构字段展示（agentId/source/issue/task link）。
- 仅靠 `title/summary` + 时间戳，很难做到“可行动”（无法直接跳转 agent/issue/task）。

### 5.3 Timeline 与 Event 区分明确且内容有价值

**FAIL（P0）**：
- 当前 timeline 与 events 基本同源（同一批事件映射成两种展示），缺少“关键里程碑/状态变化”的独立语义。
- 这点与 Issue #54 的目标一致：需要后端提供规范化 event schema + timeline semantics。

---

## 6) 回归项（PASS）

- 路由：Dashboard/Agent/Markdown list/editor 路由结构未破坏（从代码侧确认）。
- Markdown：preview/save 安全边界、rollback/audit、expectedContent guard、forbidden path 拒绝 —— backend tests 覆盖且 PASS。
- degraded/partial：web 侧通过 `loadDashboardSnapshot()` 对后端 envelope 进行归一化，具备展示 partial/degraded 横幅的基础。

---

## 7) 问题清单（按严重度）

### P0（阻塞“新体验/可展示”验收）

1. Dashboard：Event/Timeline 缺少 **过滤器/搜索**（与验收标准不符）。
2. Dashboard：Timeline 与 Event **缺少语义区分**，当前无法称为“更有意义的 Timeline”。

### P1（强烈建议尽快做）

1. Event 可行动性不足：建议补 agent/task/issue 关联信息与跳转入口。
2. 列表可访问性：severity 不应只靠颜色；建议加 icon/label + 更稳定的层级。
3. 背景视觉“抢戏”：建议降低网格/光晕强度，提升内容对比度（尤其 muted 文案）。

### P2（锦上添花）

1. 长页面场景下可以考虑 sticky header 或面板内部滚动策略（避免页面过长）。
2. Timeline 可以考虑按天分组/折叠（提升扫描效率）。

---

## 8) 3 个最值得继续优化的建议（按收益排序）

1. **先补功能可用性**：Event/Timeline 增加至少 2 个过滤器（severity + agent/kind）+ 文本搜索；这是“新体验”验收底线。
2. **后端规范化落地（Issue #54）**：统一 event schema（kind/severity/agentId/source/title/summary/at）并产出真正的 timeline（里程碑/状态变化），避免 timeline=events 的重复。
3. **视觉降噪 + 可读性提升**：降低背景 overlay 强度、提高 muted 对比度、为 severity 增加 icon/label，保证远看也能读。

---

## 9) 最终结论（merge readiness）

- **视觉（PR #52 已合入部分）**：趋势正确，整体更接近可展示。
- **Event/Timeline 新体验（Issue #55 关键验收）**：当前 **HOLD/FAIL**（缺过滤/搜索 + timeline 语义未成立）。

建议：等待 Issue #54 提供可测 PR/分支后，再做一次完整的 Phase 4 验收回归并给出最终 PASS/NO-GO。
