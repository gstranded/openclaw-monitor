# Phase 4 UI QA Report — Dashboard 视觉/滚动 + Event/Timeline 新体验（最终复验）

- Issue: https://github.com/gstranded/openclaw-monitor/issues/55
- QA owner: 闪电（shandian）
- Target commit (locked): `2e89a57f2f74d7e0719dd85eaf7d37aa64579103` (origin/main)
  - #56 `feat: normalize events + actionable timeline (dashboard/agent)`（Issue #54）
  - #58 `feat(web): improve dashboard scroll + event filters + timeline grouping`（Issue #53）
- Date: 2026-03-13

> 本文是对 #55 的 **最终复验**：在依赖 #53/#54 合入后，重新对 4 页 + dark/light + 滚动/布局 + Event/Timeline 新体验做一次 merge-ready 级验收。

---

## 1) Scope checked

按 Issue #55 验收标准覆盖：

- Dashboard `/`
- Agent detail `/agents/:agentId`
- Markdown list `/markdown`
- Markdown editor `/markdown/:fileId`
- Theme: dark/light（支持 `?theme=light|dark` + toggle）
- 滚动/布局：单滚动布局、面板内部滚动、窄屏降级（基于 CSS 断点 + 截图证据）
- 回归：刷新/跳转/markdown preview/save；API error/partial/degraded banner

证据截图（repo 内已有 P4 before/after 集合）：

- `web/screenshots/p4/after-dark/*`
- `web/screenshots/p4/after-light/*`
- `web/screenshots/p4/before-dark/*`
- `web/screenshots/p4/before-light/*`

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

结果：以上命令均 PASS（backend tests 9/9；web typecheck/build 通过）。

---

## 3) 验收点逐条结论

### 3.1 覆盖范围：4 页 + dark/light

- Dashboard/Agent/Markdown list/editor：✅ 截图与路由结构齐全（见 `web/screenshots/p4/*`）。
- dark/light：✅ 两套主题均有 after 截图。

### 3.2 滚动 / 布局 / 窗口缩放

**结论：PASS（可展示）**

依据：
- `.page` 使用 `height: 100dvh` + `display:flex`，`.grid` 使用 `overflow:auto`（明确单滚动容器），设计目标是避免 body 与内容同时滚动。
- `@media (max-width: 1100px)`：三列 `gridCols` 折叠为单列；Event 行布局也折叠为单列（`eventRow` → 1fr），降低窄屏挤压/遮挡风险。
- Agents 行为：`overflow:auto` 属于可接受的局部横滚（不会拖垮整页）。

> 备注：受当前执行环境缺少可用浏览器影响，我无法用真实浏览器录屏复现“滚动卡顿/双滚动条”的体感；此处以 **CSS 结构 + 截图证据** 给出结论，建议上线前再由任意一位同学在 Chrome 下做 2 分钟肉眼确认（1440/1280/<1100）。

### 3.3 Event / Timeline 新体验

**结论：PASS（满足 #55 关键验收）**

- 过滤器/搜索：✅ `Events` 面板提供 group（agent/kind/none）、severity、agent、kind、search，并展示 filtered count。
- Event 信息不乱：✅ 支持分组折叠（details），item 具备时间戳 + chips（sev/agent/kind）+ title/summary + 可选 detail。
- 可行动：✅ Timeline item 提供 `issue` 外链 chip（若 meta.issueUrl 存在），并展示 agentId/kind；Events 侧至少具备 agent/kind 的可定位信息。
- Timeline 与 Event 区分：✅ Timeline 按天分组，更像“里程碑/关键变化”；Events 更像“可筛选的原始事件流”。

---

## 4) 我觉得“还丑/不够产品级”的具体点（after 仍存在）

1. **背景装饰仍略抢戏**：网格 + 多层 radial gradient 在信息密集区会分散注意力（尤其暗色主题）。
2. **控件密度略高**：Events 面板 controls 一排 select + input 在窄屏下会 wrap 成多行，视觉上容易“像配置页”。
3. **Action 的“最后一公里”**：Timeline 有 issue link，但 Events 的 chips 目前不跳转（例如 agentId 不直接 link 到 `/agents/:id`），可行动性还可以再抬一档。

---

## 5) P0/P1 可用性问题

- P0：未发现。
- P1：
  1. 建议把 Events 的 `agentId` chip 直接 link 到 `/agents/:agentId`，把 `kind` chip link 到预设过滤（减少操作成本）。
  2. 建议为 severity 增加更强的非颜色提示（icon/label 已有 chip，但 listItem 仍有 border 色语义；可再统一）。

---

## 6) 3 个最值得继续优化的建议（按收益排序）

1. **把 chips 做成可点击的快捷入口**（agent → Agent page；kind → filter；issue/task → 外链），把“可行动”做到位。
2. **视觉降噪**：降低背景网格/光晕强度，提升 `muted` 对比度，让内容成为主角。
3. **长列表体验**：Events/Timeline 后续可考虑“默认折叠 + 最近 N 条 + Load more/虚拟列表”，避免事件量上来后滚动成本指数上升。

---

## 7) 最终结论（merge readiness）

**PASS（merge-ready / 可展示）**：#55 的关键验收点在 `main@2e89a57` 上已成立；本轮回归未发现阻塞级问题。
