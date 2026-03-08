# Dashboard / Agent 详情聚合接口响应示例

> 对应 Issue: #23
> 目的：在 OpenAPI 字段契约之外，补一份前端联调用的最小真实响应样例，明确正常态与降级态的返回边界。

## 1. Dashboard Agent 列表 `GET /api/v1/agents`

### 1.1 正常态

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
      "currentBranch": "claw/buding/实现-dashboard-与-agent-详情页的后端聚合接口",
      "activeTask": {
        "title": "实现 Dashboard 与 Agent 详情页的后端聚合接口",
        "issueNumber": 23,
        "issueUrl": "https://github.com/gstranded/openclaw-monitor/issues/23",
        "priority": "high",
        "state": "in_progress",
        "notes": "先交前端可接入的最小真实接口"
      },
      "lastActivityAt": "2026-03-08T17:37:00Z",
      "throughput24h": 1,
      "stabilityScore": 95,
      "degraded": false,
      "degradeReasons": [],
      "collectedAt": "2026-03-08T17:37:05Z",
      "sourceLagMs": 2100
    }
  ],
  "meta": {
    "partial": false,
    "collectedAt": "2026-03-08T17:37:05Z",
    "sourceLagMs": 2100,
    "degradeReasons": []
  }
}
```

### 1.2 降级态（GitHub 不可用）

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
      "healthScore": 88,
      "currentModel": "openai/gpt-5.4",
      "currentBranch": "claw/buding/实现-dashboard-与-agent-详情页的后端聚合接口",
      "lastActivityAt": "2026-03-08T17:37:00Z",
      "throughput24h": 1,
      "stabilityScore": 95,
      "degraded": true,
      "degradeReasons": ["github_api_unavailable"],
      "collectedAt": "2026-03-08T17:37:05Z",
      "sourceLagMs": 3200
    }
  ],
  "meta": {
    "partial": true,
    "collectedAt": "2026-03-08T17:37:05Z",
    "sourceLagMs": 3200,
    "degradeReasons": ["github_api_unavailable"]
  }
}
```

### 1.3 前端接入约束

- `data[*].degraded=true` 只表示该 Agent 卡片信息不完整，不代表整体接口失败。
- `meta.partial=true` 表示本次聚合结果存在上游缺口；前端应显示轻提示，但不要整页报错。
- `activeTask` 可能整体缺失；不要假设任务字段永远存在。

## 2. Agent 详情 `GET /api/v1/agents/{agentId}`

### 2.1 正常态

```json
{
  "data": {
    "agentId": "buding",
    "displayName": "布丁",
    "emoji": "🍮",
    "role": "后端开发",
    "title": "接口与服务实现者",
    "status": "active",
    "healthScore": 92,
    "currentModel": "openai/gpt-5.4",
    "currentBranch": "claw/buding/实现-dashboard-与-agent-详情页的后端聚合接口",
    "activeTask": {
      "title": "实现 Dashboard 与 Agent 详情页的后端聚合接口",
      "issueNumber": 23,
      "issueUrl": "https://github.com/gstranded/openclaw-monitor/issues/23",
      "priority": "high",
      "state": "in_progress"
    },
    "lastActivityAt": "2026-03-08T17:37:00Z",
    "throughput24h": 1,
    "stabilityScore": 95,
    "degraded": false,
    "degradeReasons": [],
    "collectedAt": "2026-03-08T17:37:05Z",
    "sourceLagMs": 2100,
    "recentEvents": [
      {
        "eventId": "evt_task_progress_001",
        "timestamp": "2026-03-08T17:36:12Z",
        "agentId": "buding",
        "kind": "task.progressed",
        "title": "更新聚合接口契约",
        "summary": "补充 Dashboard 与 Agent 详情页的 OpenAPI 定义",
        "severity": "info",
        "source": "git",
        "links": [
          {
            "label": "Issue #23",
            "url": "https://github.com/gstranded/openclaw-monitor/issues/23"
          }
        ],
        "metadata": {
          "branch": "claw/buding/实现-dashboard-与-agent-详情页的后端聚合接口"
        },
        "degraded": false
      }
    ],
    "sourceStatus": [
      {
        "name": "session",
        "status": "ok",
        "message": "session snapshot fresh",
        "collectedAt": "2026-03-08T17:37:05Z"
      },
      {
        "name": "workspace",
        "status": "ok",
        "message": "TASK.md parsed",
        "collectedAt": "2026-03-08T17:37:05Z"
      },
      {
        "name": "github",
        "status": "degraded",
        "message": "issue metadata cache reused",
        "collectedAt": "2026-03-08T17:37:05Z"
      },
      {
        "name": "git",
        "status": "ok",
        "message": "branch resolved",
        "collectedAt": "2026-03-08T17:37:05Z"
      },
      {
        "name": "events",
        "status": "ok",
        "message": "recent events available",
        "collectedAt": "2026-03-08T17:37:05Z"
      }
    ]
  },
  "meta": {
    "partial": true,
    "collectedAt": "2026-03-08T17:37:05Z",
    "sourceLagMs": 2100,
    "degradeReasons": ["github_issue_cache_reused"]
  }
}
```

### 2.2 404

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Agent 'unknown-agent' not found",
    "retryable": false,
    "details": {
      "agentId": "unknown-agent"
    }
  },
  "meta": {
    "partial": false,
    "collectedAt": "2026-03-08T17:37:05Z",
    "degradeReasons": []
  }
}
```

### 2.3 前端接入约束

- `recentEvents` 可以为空数组，但字段应保留。
- `sourceStatus` 是详情页解释层，不应用来驱动主状态颜色；主状态仍以 `status` / `degraded` 为准。
- `meta.degradeReasons` 是本次响应整体降级原因；`data.degradeReasons` 是该 agent 对象自身降级原因。

## 3. 排行榜 `GET /api/v1/leaderboard`

### 3.1 正常态

```json
{
  "data": [
    {
      "agentId": "buding",
      "displayName": "布丁",
      "role": "后端开发",
      "rank": 1,
      "leaderboardScore": 88.4,
      "completedCount7d": 1,
      "throughput24h": 1,
      "stabilityScore": 95,
      "healthScore": 92,
      "lastActivityAt": "2026-03-08T17:37:00Z",
      "trend": "up",
      "degraded": false
    }
  ],
  "meta": {
    "partial": false,
    "collectedAt": "2026-03-08T17:37:05Z",
    "sourceLagMs": 2100,
    "degradeReasons": [],
    "window": "24h",
    "sortBy": "score"
  }
}
```

## 4. 实现备注

为避免接口语义漂移，后续服务层落地时建议直接按下面的对象边界组装：

- `buildAgentSummary()` -> 列表卡片 `data[*]`
- `buildAgentDetail()` -> 详情页 `data`
- `buildLeaderboardEntry()` -> 排行榜 `data[*]`
- `buildMeta()` -> 所有接口统一 `meta`

这样前端先按示例接入，后端再把采集器逐步换成真实数据源，字段外形不变。 
