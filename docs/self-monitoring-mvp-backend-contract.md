# OpenClaw 自监控 MVP：数据源清单与后端契约草案

> 对应 Issue: #14
> 目标：为前端提供只读聚合接口，覆盖 Agent 卡片、排行榜、活动时间线、实时事件流。

## 1. 设计边界

### 1.1 MVP 范围

MVP 只解决 **读聚合**，不负责：

- 改写 OpenClaw 原始运行状态
- 直接控制 Agent 行为
- 长期历史归档与复杂 BI 分析
- 跨环境统一认证编排

### 1.2 聚合原则

- **只读优先**：所有接口仅返回观测数据，不产生副作用。
- **源头分层**：优先读取 OpenClaw 可直接获取的数据；缺失时返回 `degraded` 元信息，而不是伪造数据。
- **刷新可解释**：每个对象都要标明 `collectedAt`、`sourceLagMs`、`degraded`。
- **前端友好**：聚合层输出稳定字段，屏蔽底层源差异。
- **实时与快照分离**：列表页走快照 API；事件订阅走 SSE。

---

## 2. 页面能力到后端能力映射

| 前端模块 | 目标 | 后端能力 | 刷新方式 |
| --- | --- | --- | --- |
| Agent 卡片 | 展示单个 Agent 当前状态、最近活动、健康度 | `GET /api/v1/agents` / `GET /api/v1/agents/:agentId` | 轮询快照 |
| 排行榜 | 按完成数、活跃度、稳定性排序 | `GET /api/v1/leaderboard` | 轮询快照 |
| 活动时间线 | 展示最近任务、状态切换、异常、评论等 | `GET /api/v1/timeline` | 分页拉取 |
| 实时事件流 | 展示最新运行事件、状态更新、异常提示 | `GET /api/v1/events/stream` | SSE |

---

## 3. 数据源清单

## 3.1 一级数据源

| 数据源 | 用途 | 读取方式 | 新鲜度预期 | 降级策略 |
| --- | --- | --- | --- | --- |
| OpenClaw Session/Agent 运行状态 | Agent 在线状态、当前模型、最近消息、会话活跃时间 | 通过 OpenClaw 会话/状态接口聚合 | 5~15 秒 | 不可达时标记 `agent.status=unknown` |
| TASK.md / SCORE.md / 角色工作区文件 | 当前任务、角色身份、积分、执行状态 | 工作区文件扫描 | 30~60 秒 | 文件缺失时字段置空并标记 `degraded` |
| GitHub Issues / PRs | 任务来源、进度、PR 关联、评论时间线 | GitHub REST API | 30~120 秒 | API 失败时保留上次缓存并标记 `partial` |
| Git 仓库状态 | 当前分支、是否在 main、最近 commit | 本地仓库只读命令 | 10~30 秒 | 仓库缺失时隐藏开发态字段 |
| OpenClaw 事件/消息流 | 实时活动事件、错误、完成通知 | 内部事件订阅/转发 | 秒级 | 中断时 SSE 发 `stream.degraded` 事件 |

## 3.2 二级派生数据

| 派生对象 | 计算逻辑 | 依赖源 |
| --- | --- | --- |
| `healthScore` | 在线性、最近心跳、错误率、阻塞状态加权 | Session 状态 + 事件流 + TASK |
| `activeTask` | `TASK.md` 第一条未完成任务 + GitHub issue 元信息 | TASK.md + GitHub Issue |
| `throughput24h` | 24 小时完成任务数 / 事件数 | GitHub + 事件流 |
| `stabilityScore` | 最近 24 小时错误事件占比、失败恢复时间 | 事件流 |
| `leaderboardScore` | 完成数、活跃度、稳定性加权 | GitHub + Session + 事件流 |

---

## 4. 核心数据对象

## 4.1 AgentSummary

```json
{
  "agentId": "buding",
  "displayName": "布丁",
  "emoji": "🍮",
  "role": "后端开发",
  "title": "接口与服务实现者",
  "status": "active",
  "healthScore": 92,
  "currentModel": "openai/gpt-5.4",
  "currentBranch": "claw/buding/self-monitoring-contract",
  "activeTask": {
    "title": "设计 OpenClaw 自监控 MVP 的数据源清单与后端契约",
    "issueNumber": 14,
    "issueUrl": "https://github.com/gstranded/openclaw-monitor/issues/14",
    "priority": "high",
    "state": "in_progress"
  },
  "lastActivityAt": "2026-03-08T12:56:00Z",
  "throughput24h": 3,
  "stabilityScore": 95,
  "degraded": false,
  "degradeReasons": [],
  "collectedAt": "2026-03-08T12:56:05Z",
  "sourceLagMs": 2100
}
```

### 字段来源

| 字段 | 来源 |
| --- | --- |
| `agentId/displayName/emoji/role/title` | 工作区身份文件（AGENTS.md / IDENTITY.md / SOUL.md） |
| `status/currentModel/lastActivityAt` | OpenClaw Session/Status |
| `currentBranch` | Git 仓库状态 |
| `activeTask` | TASK.md 第一条未完成任务 + GitHub Issue |
| `throughput24h/stabilityScore/healthScore` | 聚合派生 |
| `degraded*` / `collectedAt` / `sourceLagMs` | 聚合层统一补充 |

## 4.2 LeaderboardEntry

```json
{
  "agentId": "buding",
  "displayName": "布丁",
  "role": "后端开发",
  "rank": 1,
  "leaderboardScore": 88.4,
  "completedCount7d": 5,
  "throughput24h": 3,
  "stabilityScore": 95,
  "healthScore": 92,
  "lastActivityAt": "2026-03-08T12:56:00Z",
  "trend": "up",
  "degraded": false
}
```

## 4.3 TimelineEvent

```json
{
  "eventId": "evt_01JNX8F4K3Y2D9J3R4M5",
  "timestamp": "2026-03-08T12:56:00Z",
  "agentId": "buding",
  "kind": "task.progressed",
  "title": "输出自监控后端契约草案",
  "summary": "已创建任务分支并新增契约文档初稿",
  "severity": "info",
  "source": "git",
  "links": [
    {
      "label": "Issue #14",
      "url": "https://github.com/gstranded/openclaw-monitor/issues/14"
    }
  ],
  "metadata": {
    "branch": "claw/buding/self-monitoring-contract",
    "files": ["docs/self-monitoring-mvp-backend-contract.md"]
  },
  "degraded": false
}
```

### 事件类型建议

- `agent.heartbeat`
- `agent.status_changed`
- `task.started`
- `task.progressed`
- `task.blocked`
- `task.completed`
- `issue.updated`
- `pr.opened`
- `pr.merged`
- `runtime.error`
- `stream.degraded`

## 4.4 StreamEvent（SSE）

```json
{
  "type": "agent.status_changed",
  "sequence": 1042,
  "timestamp": "2026-03-08T12:56:00Z",
  "payload": {
    "agentId": "buding",
    "from": "idle",
    "to": "active",
    "reason": "heartbeat_task_started"
  }
}
```

---

## 5. API 契约草案

统一约定：

- Base path：`/api/v1`
- 时间：ISO 8601 UTC
- 分页：`cursor` + `limit`
- 错误结构统一返回 `error`
- 所有响应都带 `meta`

## 5.1 GET /api/v1/agents

用途：返回 Agent 卡片列表。

### Query

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `status` | string | 可选；`active/idle/blocked/offline/unknown` |
| `role` | string | 可选；按角色过滤 |
| `limit` | number | 可选；默认 50，最大 200 |

### Response

```json
{
  "data": [
    {
      "agentId": "buding",
      "displayName": "布丁",
      "emoji": "🍮",
      "role": "后端开发",
      "title": "接口与服务实现者",
      "status": "active",
      "healthScore": 92,
      "currentModel": "openai/gpt-5.4",
      "currentBranch": "claw/buding/self-monitoring-contract",
      "activeTask": {
        "title": "设计 OpenClaw 自监控 MVP 的数据源清单与后端契约",
        "issueNumber": 14,
        "priority": "high",
        "state": "in_progress"
      },
      "lastActivityAt": "2026-03-08T12:56:00Z",
      "throughput24h": 3,
      "stabilityScore": 95,
      "degraded": false,
      "degradeReasons": [],
      "collectedAt": "2026-03-08T12:56:05Z",
      "sourceLagMs": 2100
    }
  ],
  "meta": {
    "nextCursor": null,
    "partial": false,
    "collectedAt": "2026-03-08T12:56:05Z"
  }
}
```

## 5.2 GET /api/v1/agents/:agentId

用途：返回单个 Agent 详情，供卡片侧边栏/详情面板使用。

### 附加字段

- `recentEvents`: 最近 20 条 TimelineEvent
- `sourceStatus`: 各数据源采集状态
- `activeTask.notes`: 从 TASK.md 或 Issue 聚合的附加说明

## 5.3 GET /api/v1/leaderboard

用途：返回排行榜。

### Query

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `window` | string | `24h` / `7d`，默认 `24h` |
| `sortBy` | string | `score` / `throughput` / `stability`，默认 `score` |
| `limit` | number | 默认 20，最大 100 |

### Response

```json
{
  "data": [
    {
      "agentId": "buding",
      "displayName": "布丁",
      "role": "后端开发",
      "rank": 1,
      "leaderboardScore": 88.4,
      "completedCount7d": 5,
      "throughput24h": 3,
      "stabilityScore": 95,
      "healthScore": 92,
      "lastActivityAt": "2026-03-08T12:56:00Z",
      "trend": "up",
      "degraded": false
    }
  ],
  "meta": {
    "window": "24h",
    "sortBy": "score",
    "partial": false,
    "collectedAt": "2026-03-08T12:56:05Z"
  }
}
```

## 5.4 GET /api/v1/timeline

用途：返回活动时间线。

### Query

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `agentId` | string | 可选 |
| `kind` | string | 可选；多值逗号分隔 |
| `cursor` | string | 可选 |
| `limit` | number | 默认 50，最大 200 |
| `since` | datetime | 可选；仅返回某时间之后的事件 |

### Response

```json
{
  "data": [
    {
      "eventId": "evt_01JNX8F4K3Y2D9J3R4M5",
      "timestamp": "2026-03-08T12:56:00Z",
      "agentId": "buding",
      "kind": "task.progressed",
      "title": "输出自监控后端契约草案",
      "summary": "已创建任务分支并新增契约文档初稿",
      "severity": "info",
      "source": "git",
      "links": [
        {
          "label": "Issue #14",
          "url": "https://github.com/gstranded/openclaw-monitor/issues/14"
        }
      ],
      "metadata": {
        "branch": "claw/buding/self-monitoring-contract"
      },
      "degraded": false
    }
  ],
  "meta": {
    "nextCursor": "evt_01JNX8...",
    "partial": false,
    "collectedAt": "2026-03-08T12:56:05Z"
  }
}
```

## 5.5 GET /api/v1/events/stream

用途：为前端提供实时事件流。

### 协议

- Content-Type: `text/event-stream`
- 事件重连：支持 `Last-Event-ID`
- 心跳：每 15 秒发送一次 `event: heartbeat`
- 服务端应保证单调递增 `sequence`

### SSE 示例

```text
event: agent.status_changed
id: 1042
data: {"type":"agent.status_changed","sequence":1042,"timestamp":"2026-03-08T12:56:00Z","payload":{"agentId":"buding","from":"idle","to":"active","reason":"heartbeat_task_started"}}

event: heartbeat
id: 1043
data: {"type":"heartbeat","sequence":1043,"timestamp":"2026-03-08T12:56:15Z"}
```

---

## 6. 统一元信息与错误契约

## 6.1 Meta

```json
{
  "partial": true,
  "collectedAt": "2026-03-08T12:56:05Z",
  "sourceLagMs": 2100,
  "degradeReasons": [
    "github_api_unavailable"
  ]
}
```

## 6.2 Error

```json
{
  "error": {
    "code": "UPSTREAM_UNAVAILABLE",
    "message": "GitHub API is temporarily unavailable",
    "retryable": true,
    "details": {
      "source": "github"
    }
  },
  "meta": {
    "partial": true,
    "collectedAt": "2026-03-08T12:56:05Z"
  }
}
```

### 错误码建议

- `INVALID_ARGUMENT`
- `NOT_FOUND`
- `UPSTREAM_UNAVAILABLE`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

---

## 7. 刷新策略

| 对象 | 默认刷新 | 说明 |
| --- | --- | --- |
| Agent 列表 | 10 秒 | 页面主视图轮询 |
| Agent 详情 | 5~10 秒 | 打开详情时拉取 |
| 排行榜 | 30 秒 | 分值无需秒级刷新 |
| 时间线 | 手动分页 + 15 秒顶部刷新提示 | 降低重复拉取成本 |
| SSE 事件流 | 常连 | 用于秒级状态变化 |

### 服务端缓存建议

- Agent 快照缓存：5 秒
- Leaderboard 缓存：15 秒
- Timeline 聚合缓存：5 秒
- GitHub Issue / PR 元数据缓存：60 秒

---

## 8. 降级策略

| 场景 | 表现 | 前端建议 |
| --- | --- | --- |
| GitHub API 不可用 | 任务/PR 字段缺失，`meta.partial=true` | 显示“任务信息暂不可用” |
| OpenClaw Session 不可用 | Agent `status=unknown`，保留静态身份 | 卡片显示灰态 |
| Git 仓库不可读 | 无 `currentBranch` / commit 信息 | 隐藏开发态徽标 |
| 事件流中断 | SSE 推送 `stream.degraded` 后断开 | 前端退回轮询 |
| 工作区文件缺失 | activeTask / score 为空 | 展示“未配置”而非报错 |

---

## 9. 推荐实现切分

### 9.1 采集器

- `sessionCollector`
- `workspaceCollector`
- `githubCollector`
- `gitCollector`
- `eventCollector`

### 9.2 聚合器

- `buildAgentSummary()`
- `buildLeaderboard()`
- `buildTimelinePage()`
- `mapStreamEvent()`

### 9.3 API 层

- `GET /api/v1/agents`
- `GET /api/v1/agents/:agentId`
- `GET /api/v1/leaderboard`
- `GET /api/v1/timeline`
- `GET /api/v1/events/stream`

---

## 10. 本轮结论

当前仓库仍是空仓，适合先提交 **后端契约草案** 作为第一步；后续可继续补：

1. OpenAPI/JSON Schema 版本化定义
2. 聚合服务骨架
3. SSE 事件映射与缓存实现
4. GitHub / OpenClaw 数据采集适配层
