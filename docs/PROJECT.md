# Project

## 一句话介绍

openclaw-monitor 是一个面向 OpenClaw 运行态的 **只读监控台 + 受控文档编辑入口**。

## 设计原则

- 观察优先：先把状态、延迟、事件、协作进度变得可见
- 失败可读：降级/部分失败要在 UI 与 API 中明确表达
- 写入克制：写操作（Markdown）必须有边界、可回滚、可审计
- 可复现：README 里的命令在 main 上可跑通

## 阶段里程碑

- Phase 1：定义 MVP 范围与信息架构（docs）
- Phase 2：实现后端聚合 API + 前端 dashboard/详情页/markdown 管理 + QA 验收
- Phase 3：对外文档与交付呈现（README/架构/团队/贡献）
