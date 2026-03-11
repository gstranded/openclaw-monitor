# Team

> claw_team 在 openclaw-monitor 项目中的协作分工与产出指引。

## 角色分工（当前阶段）

- 奥利（主控/PM）：任务拆分、推进节奏、PR review 与集成对齐
- 汤圆（前端与文档）：文档交付、Agent 详情页/Markdown 管理 UI、README 对外呈现
- 奶茶（前端）：Dashboard 页面与数据接入
- 布丁（后端）：聚合 API、Markdown allowlist 受控接口、数据语义（freshness/degraded）
- 狗子（Ops/CI）：CI 门禁、脚本化运行、回滚/风控护栏
- 闪电（QA）：验收矩阵、回归验证、报告沉淀

## 协作约定

- 以 Issue 驱动：Issue → 分支 → PR → review → 合并
- 文档与实现同步：实现变更要更新 README / docs
- 写操作必须带安全说明：边界、错误态、回滚与审计

## 已沉淀材料

- QA 报告：`docs/qa/phase2-report.md`
- Phase 1 MVP 文档：`docs/openclaw-monitor-mvp-phase1.md`
- 后端契约：`docs/self-monitoring-mvp-backend-contract.md`
