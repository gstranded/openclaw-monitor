# openclaw-monitor 首页 Dashboard 线框与前端拆分建议

## 1. 页面目标
首页聚焦“当前状态一眼可见、事件变化能追踪、排名对比可扫读”。

固定结构：
- 顶部：Agent 状态卡片
- 中间：积分排行榜
- 左侧：活动时间线
- 右侧：实时事件流

---

## 2. 线框草图（低保真）

```text
┌─────────────────────────────────────────────────────────────────────┐
│ OpenClaw Monitor Dashboard                                         │
│ 环境 / 更新时间 / 全局筛选（时间范围、Agent、状态）                │
├─────────────────────────────────────────────────────────────────────┤
│ Agent 状态卡片区                                                    │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│ │ Agent A  │ │ Agent B  │ │ Agent C  │ │ Agent D  │                │
│ │ online   │ │ busy     │ │ idle     │ │ error    │                │
│ │ score 88 │ │ score 71 │ │ score 64 │ │ retrying │                │
│ │ 最近心跳 │ │ 当前任务 │ │ 空闲时长 │ │ 错误摘要 │                │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘                │
├─────────────────────────────────────────────────────────────────────┤
│ 积分排行榜                                                          │
│ #1 奶茶      128 pts   ▲12                                          │
│ #2 布丁      117 pts   ▲4                                           │
│ #3 闪电      103 pts   ▼2                                           │
│ ...                                                                 │
├───────────────────────────────┬─────────────────────────────────────┤
│ 活动时间线                     │ 实时事件流                          │
│ 20:35 Agent 启动任务           │ [INFO] 奶茶 推送 heartbeat          │
│ 20:37 PR 创建                  │ [WARN] 布丁 API 重试                │
│ 20:40 QA 回归                  │ [ERROR] 闪电 校验失败               │
│ 20:43 任务完成                 │ [INFO] 奥利 指派新任务              │
│ ...                            │ ...                                 │
└───────────────────────────────┴─────────────────────────────────────┘
```

---

## 3. 信息层级建议

### P0：首屏必须看清
1. 当前有哪些 Agent 在线/忙碌/异常
2. 当前谁的积分领先
3. 最近发生了什么关键动作
4. 是否存在错误或阻塞

### P1：辅助判断
- 最近心跳时间
- 当前任务标题
- 分数变化趋势
- 事件等级（info / warn / error）

### P2：后续可扩展
- 事件筛选
- 排行榜周期切换
- Agent 详情抽屉
- 时间线按类型过滤

---

## 4. 前端组件拆分

## 页面级
- `DashboardPage`
  - 负责页面布局、筛选条件、数据请求编排

## 顶部区
- `AgentStatusSection`
  - `AgentStatusCard`
    - `AgentAvatar`
    - `AgentStateBadge`
    - `AgentMetricList`
    - `HeartbeatIndicator`

## 中间区
- `ScoreboardSection`
  - `ScoreboardTable`
  - `ScoreTrendBadge`
  - `RankMedal`

## 左侧区
- `ActivityTimelineSection`
  - `TimelineList`
  - `TimelineItem`
  - `TimelineTypeTag`

## 右侧区
- `RealtimeEventSection`
  - `EventStreamList`
  - `EventStreamItem`
  - `EventLevelBadge`
  - `EventSourceTag`

## 通用基础组件
- `SectionHeader`
- `EmptyState`
- `ErrorState`
- `LoadingSkeleton`
- `StatusChip`
- `RefreshTimestamp`

---

## 5. 推荐数据模型（前端视角）

```ts
interface AgentStatus {
  id: string
  name: string
  status: 'online' | 'busy' | 'idle' | 'error' | 'offline'
  score: number
  currentTask?: string
  lastHeartbeatAt?: string
  idleDurationSec?: number
  errorSummary?: string
}

interface ScoreboardEntry {
  agentId: string
  name: string
  score: number
  rank: number
  trend?: 'up' | 'down' | 'flat'
  delta?: number
}

interface TimelineEvent {
  id: string
  type: string
  title: string
  createdAt: string
  agentName?: string
}

interface RealtimeEvent {
  id: string
  level: 'info' | 'warn' | 'error'
  message: string
  source?: string
  createdAt: string
}
```

---

## 6. 状态处理建议

### 加载态
- 首屏使用骨架屏，不要整页白屏
- 顶部卡片区与下方三块区可分区独立 loading
- 若事件流支持实时推送，首次加载与后续增量更新状态分离

### 空态
- Agent 状态区：显示“暂无 Agent 数据”与刷新提示
- 排行榜：显示“暂无积分记录”
- 活动时间线：显示“暂无活动”
- 事件流：显示“暂无实时事件”

### 错误态
- 模块级错误优先，不因单区失败拖垮整页
- 错误文案包含：失败模块 + 建议动作（重试 / 稍后刷新）
- 右侧实时事件流如果断连，展示“实时连接中断，当前为静态快照”

### 降级处理
- 实时事件流 websocket 失败时降级为轮询
- 排行榜无法获取趋势时，只展示当前分数与排名
- Agent 卡片缺少部分字段时优先保留状态与名称，缺失项显示 `--`

---

## 7. 布局与交互建议

### 布局
- 页面采用 3 段结构：顶部卡片 / 中部排行 / 底部双栏
- 底部建议 5:7 或 6:6 分栏，保证事件流阅读空间
- 移动端降级为单列堆叠：状态卡片 → 排行榜 → 时间线 → 事件流

### 交互
- Agent 状态卡片支持点击查看详情（后续能力，可先预留）
- 排行榜支持 hover 高亮当前行
- 时间线和事件流都需要时间戳对齐与颜色分级
- 错误事件默认高亮，帮助首屏发现风险

---

## 8. 第一轮实现建议

### 最小可交付（本轮）
1. 先实现 `DashboardPage` 静态布局
2. 用 mock 数据渲染四大区域
3. 补齐 loading / empty / error 三态占位
4. 保持组件边界清晰，暂不提前复杂化数据层

### 第二轮再推进
1. 接真实接口或 mock service
2. 接入实时事件流
3. 增加筛选、刷新、详情抽屉
4. 做响应式与视觉打磨

---

## 9. 结论
这个首页建议先以“信息层级稳定 + 模块可独立失败”为核心来搭。前端上优先拆成四个业务区块和一组通用状态组件，先做可浏览、可占位、可扩展的骨架，再接实时数据，风险最低，也方便后续多人并行协作。
