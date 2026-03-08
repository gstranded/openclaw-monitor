# Agent 详情页与 Markdown 浏览/编辑界面草案

> 对应任务：Issue #25
> 当前目的：在仓库尚未具备前端应用骨架时，先补齐信息架构、页面状态、数据契约与最小交付切分，降低后续正式实现的不确定性。

## 1. 本轮结论

当前仓库仍只有文档产物，尚未出现可直接承载页面开发的前端工程、路由结构或组件体系。

因此本轮先输出：

- Agent 详情页信息架构
- Markdown 文件浏览 / 编辑流设计
- 页面状态与交互约束
- 建议的数据结构与接口草案
- 可落地的前端拆分建议

这份草案可直接作为后续实现的开发输入，也可供后端与 QA 对齐。

## 2. 页面目标

Agent 详情页用于回答三个核心问题：

1. 当前这个 Agent 是谁、在做什么、状态如何？
2. 它有哪些关键运行资料可查看？
3. 与该 Agent 绑定的 Markdown 文件如何被浏览、切换、编辑与保存？

Markdown 浏览 / 编辑界面用于承接以下文件场景：

- `TASK.md`
- `SCORE.md`
- `AGENTS.md`
- `SOUL.md`
- 其他 agent 工作目录内允许暴露的 markdown 文件

## 3. 页面范围

## 3.1 In Scope

- Agent 基础信息展示
- Agent 当前状态 / 最近活跃 / 当前任务摘要
- Markdown 文件列表
- Markdown 文件内容浏览
- Markdown 文件编辑与保存入口
- 加载态 / 空态 / 错误态 / 保存中状态
- 编辑冲突与只读场景的前端提示

## 3.2 Out of Scope

- 富文本所见即所得编辑器
- 多人协同实时编辑
- 复杂版本比较与 merge UI
- 非 Markdown 类型文件编辑
- 权限体系细化配置页
- 文件上传 / 下载中心

## 4. 页面结构建议

```text
Agent Detail Page
├── 顶部返回与标题区
│   ├── Agent 名称
│   ├── 角色 / 头衔
│   └── 状态标签 + 最近活跃时间
├── 概览区
│   ├── 当前任务
│   ├── 当前积分
│   ├── 工作目录
│   └── 最近事件摘要
└── 主内容区（左右双栏）
    ├── 左栏：Markdown 文件导航
    │   ├── 文件分类 / 列表
    │   ├── 当前选中文件
    │   └── 文件状态（可编辑 / 只读 / 不可用）
    └── 右栏：文件内容区
        ├── 工具栏（浏览 / 编辑 / 保存 / 取消）
        ├── Markdown 渲染预览或源码文本域
        └── 状态反馈（保存成功 / 失败 / 冲突）
```

## 5. 核心模块定义

## 5.1 Agent 概览卡

最小字段：

- `agentId`
- `agentName`
- `role`
- `title`
- `status`
- `lastActiveAt`
- `currentTaskSummary`
- `score`
- `workspacePath`

展示重点：

- 状态标签明确区分 `running / standby / blocked / error / offline`
- 当前任务为空时给出明确空态说明
- 工作目录仅展示必要路径信息，避免堆太长原始字符串

## 5.2 Markdown 文件导航

建议优先内置固定文件：

- `TASK.md`
- `SCORE.md`
- `AGENTS.md`
- `SOUL.md`
- `IDENTITY.md`
- `USER.md`

文件项最小字段：

- `path`
- `name`
- `category`
- `editable`
- `lastModifiedAt`
- `size`

展示规则：

- 默认按预设重要性排序，而不是单纯字母序
- 不可编辑文件要提前标识
- 文件不存在时保留列表位置，但展示“未找到”而不是静默消失

## 5.3 文件浏览区

浏览模式下应支持：

- Markdown 渲染展示
- 代码块、标题、列表、引用基础样式
- 长文滚动
- 加载中骨架屏
- 文件不存在 / 读取失败提示

## 5.4 文件编辑区

编辑模式下应支持：

- 原始 Markdown 文本编辑
- 明确的保存 / 取消按钮
- 未保存变更提示
- 保存中禁用重复提交
- 保存失败后保留本地编辑内容

可选增强（后续阶段）：

- 分栏预览
- 快捷键保存
- 行号
- 简单差异提示

## 6. 关键交互流

## 6.1 首次进入页面

1. 加载 Agent 详情数据
2. 加载允许展示的 Markdown 文件列表
3. 默认选中优先文件（建议 `TASK.md`）
4. 右侧展示对应文件内容

## 6.2 切换文件

1. 用户点击左侧文件
2. 若当前无未保存变更，直接切换
3. 若当前存在未保存变更，弹出确认：
   - 保存后切换
   - 放弃变更并切换
   - 取消

## 6.3 进入编辑模式

1. 浏览态点击“编辑”
2. 右侧切到源码编辑态
3. 顶部显示“正在编辑 <file>”
4. 保存前离开页面需给出未保存提醒

## 6.4 保存文件

1. 点击保存
2. 按钮进入 loading
3. 成功后退出 loading，并刷新文件内容 / 修改时间
4. 失败后展示失败原因，保留编辑内容
5. 若后端返回冲突，前端提示“文件已被外部更新，请刷新后重试”

## 7. 页面状态约束

## 7.1 Loading

- Agent 概览和文件内容可分开加载
- 左栏列表未返回前显示占位项
- 右栏显示骨架屏或“正在读取文件内容”

## 7.2 Empty

- Agent 无当前任务：显示“当前暂无执行任务”
- 无可展示 Markdown 文件：显示“暂无可浏览文件”
- 文件内容为空：显示“该文件当前为空”

## 7.3 Error

- Agent 详情加载失败：整页错误态
- 文件列表失败：左栏错误态，可重试
- 文件读取失败：右栏错误态，不影响列表继续浏览
- 文件保存失败：顶部 toast + 编辑区内联错误

## 7.4 Readonly

以下情况建议只读：

- 文件被策略禁止编辑
- 当前用户无写权限
- Agent 工作目录不可写
- 系统处于保护模式

只读时：

- 隐藏或禁用编辑按钮
- 明确解释原因，不要只置灰

## 8. 建议接口草案

## 8.1 Agent 详情

```ts
interface AgentDetail {
  agentId: string
  agentName: string
  role: string
  title: string
  status: 'running' | 'standby' | 'blocked' | 'error' | 'offline'
  lastActiveAt: string
  currentTaskSummary?: string
  score?: number
  workspacePath?: string
  recentEvents?: Array<{
    timestamp: string
    level: 'info' | 'warning' | 'error'
    message: string
  }>
}
```

## 8.2 Markdown 文件列表

```ts
interface AgentMarkdownFileItem {
  path: string
  name: string
  category: 'task' | 'score' | 'identity' | 'config' | 'other'
  editable: boolean
  exists: boolean
  lastModifiedAt?: string
  size?: number
}
```

## 8.3 Markdown 文件内容

```ts
interface AgentMarkdownFileContent {
  path: string
  name: string
  content: string
  editable: boolean
  version?: string
  lastModifiedAt?: string
}
```

## 8.4 保存请求

```ts
interface UpdateAgentMarkdownFileRequest {
  path: string
  content: string
  version?: string
}
```

保存返回建议至少带：

- 最新 `version`
- 最新 `lastModifiedAt`
- 是否成功
- 冲突 / 权限 / 校验失败原因

## 9. 前端组件拆分建议

```text
AgentDetailPage
├── AgentHeader
├── AgentSummaryCard
├── MarkdownFileList
├── MarkdownFileListItem
├── MarkdownViewer
├── MarkdownEditor
├── MarkdownToolbar
└── UnsavedChangesDialog
```

拆分原则：

- Agent 信息与文件编辑逻辑解耦
- 浏览态与编辑态组件分离
- 文件切换逻辑尽量集中，避免状态散落

## 10. 路由建议

若后续有真实前端工程，建议路由形态如下：

- `/agents`
- `/agents/:agentId`
- `/agents/:agentId/files/:fileKey`（可选）

若先做单页内状态切换，也应保留未来可升级到独立 URL 的能力。

## 11. 文件暴露与编辑策略建议

为避免前端先做了入口、后端再临时收口，建议先固定一版白名单策略。

| 文件 | 默认展示 | 默认可编辑 | 说明 |
| --- | --- | --- | --- |
| `TASK.md` | 是 | 是 | 任务推进主文件，需支持编辑与保存 |
| `SCORE.md` | 是 | 是 | 积分记录需要直接修订 |
| `AGENTS.md` | 是 | 否/按策略 | 角色规则文件，建议默认只读 |
| `SOUL.md` | 是 | 否/按策略 | 角色人格说明，建议默认只读 |
| `IDENTITY.md` | 是 | 否 | 身份信息通常不应频繁编辑 |
| `USER.md` | 是 | 否 | 用户偏好类说明，建议默认只读 |
| 其他 `.md` | 可选 | 按白名单 | 仅当后端明确放行时展示 |

前端不应自行猜测可写权限，应完全以后端返回的 `editable` 为准。

## 12. 接口与错误码建议

除字段结构外，建议后端补齐最小行为约定，方便前端稳定处理状态。

### 12.1 建议接口形态

- `GET /api/agents/:agentId`
- `GET /api/agents/:agentId/markdown-files`
- `GET /api/agents/:agentId/markdown-files/content?path=<encodedPath>`
- `PUT /api/agents/:agentId/markdown-files/content`

### 12.2 建议响应示例

Agent 详情响应示例：

```json
{
  "agentId": "tangyuan",
  "agentName": "汤圆",
  "role": "前端与文档",
  "title": "交付与说明完善者",
  "status": "running",
  "lastActiveAt": "2026-03-08T17:45:00Z",
  "currentTaskSummary": "实现 Agent 详情页与 Markdown 浏览/编辑界面",
  "score": 16,
  "workspacePath": "/workspace/agents/tangyuan"
}
```

文件列表响应示例：

```json
[
  {
    "path": "TASK.md",
    "name": "TASK.md",
    "category": "task",
    "editable": true,
    "exists": true,
    "lastModifiedAt": "2026-03-08T17:20:00Z",
    "size": 2184
  },
  {
    "path": "AGENTS.md",
    "name": "AGENTS.md",
    "category": "identity",
    "editable": false,
    "exists": true
  },
  {
    "path": "README.md",
    "name": "README.md",
    "category": "other",
    "editable": false,
    "exists": false
  }
]
```

文件内容响应示例：

```json
{
  "path": "TASK.md",
  "name": "TASK.md",
  "content": "# TASK\n\n- [ ] example",
  "editable": true,
  "version": "etag-1709880000",
  "lastModifiedAt": "2026-03-08T17:20:00Z"
}
```

保存成功响应示例：

```json
{
  "ok": true,
  "path": "TASK.md",
  "version": "etag-1709880300",
  "lastModifiedAt": "2026-03-08T17:25:00Z"
}
```

### 12.3 保存失败的最小错误码

```ts
type UpdateMarkdownFileErrorCode =
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation_failed'
  | 'workspace_readonly'
  | 'unknown_error'
```

前端映射建议：

- `forbidden`：你当前没有编辑该文件的权限
- `not_found`：目标文件不存在或已被移除
- `conflict`：文件已被外部更新，请刷新后重试
- `validation_failed`：保存内容未通过校验
- `workspace_readonly`：当前工作目录处于只读保护状态
- `unknown_error`：保存失败，请稍后重试

## 13. Mock 数据建议

在真实页面落地前，建议先准备一组覆盖关键状态的 mock，用于前端布局与 QA 走查。

```ts
const mockAgentDetail: AgentDetail = {
  agentId: 'tangyuan',
  agentName: '汤圆',
  role: '前端与文档',
  title: '交付与说明完善者',
  status: 'running',
  lastActiveAt: '2026-03-08T17:45:00Z',
  currentTaskSummary: '实现 Agent 详情页与 Markdown 浏览/编辑界面',
  score: 16,
  workspacePath: '/workspace/agents/tangyuan'
}

const mockFiles: AgentMarkdownFileItem[] = [
  { path: 'TASK.md', name: 'TASK.md', category: 'task', editable: true, exists: true },
  { path: 'SCORE.md', name: 'SCORE.md', category: 'score', editable: true, exists: true },
  { path: 'AGENTS.md', name: 'AGENTS.md', category: 'identity', editable: false, exists: true },
  { path: 'SOUL.md', name: 'SOUL.md', category: 'identity', editable: false, exists: true },
  { path: 'README.md', name: 'README.md', category: 'other', editable: false, exists: false }
]
```

建议至少覆盖以下演示场景：

- `TASK.md` 可编辑并可成功保存
- `AGENTS.md` 只读
- 文件不存在但保留列表位
- 保存冲突
- 文件内容为空

## 14. QA 对齐点

QA 后续可重点验证：

- 默认文件是否按预期选中
- 文件切换时未保存提醒是否准确
- 只读文件是否禁止进入编辑
- 保存失败后内容是否仍保留
- 加载态 / 空态 / 错误态是否区分清楚
- 长 Markdown 文件滚动与显示是否稳定
- 冲突提示是否可理解
- 不存在文件是否以“缺失”展示，而不是直接从列表消失
- 权限变化后编辑按钮是否与返回字段一致

## 15. 最小验收清单（实现前对齐版）

- [ ] Agent 详情页具备概览区 + Markdown 文件区双层结构
- [ ] 左栏可以稳定展示固定 markdown 文件列表
- [ ] 右栏支持浏览态与编辑态切换
- [ ] 至少 1 个可编辑文件支持保存链路演示
- [ ] 只读文件有明确原因提示
- [ ] 未保存变更切换文件时会触发确认
- [ ] 文件读取失败、保存失败、冲突三类状态可区分
- [ ] mock 数据能覆盖 running / readonly / missing / conflict 四类核心场景

## 16. 建议实现切片（按最小可交付拆分）

### Slice 1：静态页面与 mock 数据

目标：先把页面骨架、双栏布局与浏览/编辑切换跑通，不依赖真实接口。

最小内容：

- `AgentDetailPage` 页面骨架
- `AgentHeader` / `AgentSummaryCard`
- `MarkdownFileList`
- `MarkdownViewer`
- `MarkdownEditor`
- 本地 mock 数据与状态切换

完成标志：

- 能展示 1 个 agent 概览
- 能在左栏切换 `TASK.md` / `SCORE.md` / `AGENTS.md`
- 能在右栏切换浏览态 / 编辑态
- 只读文件与缺失文件有明确提示

### Slice 2：文件读取链路

目标：把文件列表和文件内容从 mock 切到真实接口读取。

最小内容：

- 对接 agent 详情接口
- 对接 markdown 文件列表接口
- 对接文件内容读取接口
- 区分整页失败、列表失败、内容失败

完成标志：

- 默认进入页后自动选中首个优先文件
- 切换文件时内容能正确刷新
- 加载态 / 空态 / 错误态有独立表现

### Slice 3：编辑保存链路

目标：完成单文件编辑、保存、取消、未保存保护。

最小内容：

- 编辑态文本输入
- 保存 / 取消
- 未保存变更拦截
- 保存中禁用重复提交
- 保存成功后刷新版本信息

完成标志：

- 至少 `TASK.md` 可完成一次编辑并保存演示
- 保存失败后本地内容不丢
- 切文件或离开页时未保存提醒生效

### Slice 4：冲突与权限细节

目标：补齐只读、冲突、工作区保护等边界状态。

最小内容：

- `editable=false` 的只读说明
- `conflict` / `forbidden` / `workspace_readonly` 错误处理
- 文件不存在但保留列表位

完成标志：

- 用户能明确知道“为什么不能编辑”
- 冲突重试路径清楚
- QA 可稳定复现四类关键状态

## 17. 建议前端文件落位（实现接手版）

如果后续仓库补齐前端工程，建议先按下面的最小文件结构落位，避免页面状态、接口请求与编辑逻辑混在同一个文件里。

```text
src/
├── pages/
│   └── agents/
│       └── AgentDetailPage.tsx
├── components/agents/
│   ├── AgentHeader.tsx
│   ├── AgentSummaryCard.tsx
│   ├── MarkdownFileList.tsx
│   ├── MarkdownToolbar.tsx
│   ├── MarkdownViewer.tsx
│   ├── MarkdownEditor.tsx
│   └── UnsavedChangesDialog.tsx
├── hooks/
│   └── useAgentMarkdownFile.ts
├── services/
│   └── agentMarkdown.ts
├── mocks/
│   └── agentDetail.ts
└── types/
    └── agent.ts
```

落位原则：

- 页面文件只负责组装与状态编排
- 接口请求集中在 `services/`
- 数据类型集中在 `types/`
- mock 数据不要散落到组件内部
- 文件读写与脏数据判断尽量收敛到 hook

## 18. 页面状态机建议

为了减少后续实现时的状态分叉，建议先统一页面主状态。

```ts
type FilePaneMode = 'view' | 'edit'

type FilePaneStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'missing'
  | 'readonly'
  | 'saving'
  | 'save_error'
  | 'conflict'
  | 'load_error'
```

建议约束：

- `mode=view` 时允许 `loading/ready/empty/missing/readonly/load_error`
- `mode=edit` 时允许 `ready/saving/save_error/conflict/readonly`
- `saving` 期间禁止再次提交与切换文件
- `conflict` 与 `save_error` 都必须保留本地编辑内容

## 19. 组件职责切分建议

### 19.1 AgentDetailPage

负责：

- 解析 `agentId`
- 拉取 agent 详情 / 文件列表
- 管理当前选中文件
- 管理未保存切换拦截
- 组合 header、列表、viewer、editor

不负责：

- 直接写 markdown 渲染细节
- 直接内嵌所有接口实现

### 19.2 MarkdownFileList

负责：

- 渲染文件列表
- 展示选中态、只读态、缺失态
- 抛出切换事件

不负责：

- 保存逻辑
- 文件内容拉取

### 19.3 MarkdownEditor

负责：

- 文本编辑
- 脏数据跟踪
- 保存按钮启停状态

不负责：

- 文件列表切换确认弹窗
- agent 详情展示

## 20. Mock → 真实接口切换顺序

建议按下面顺序落地，能最大化减少返工：

1. `mocks/agentDetail.ts` 先覆盖 running / readonly / missing / conflict 四类场景
2. 页面骨架先只消费 mock 数据，走通浏览 / 编辑 / 切换 / 未保存提示
3. 替换 agent 详情接口与文件列表接口
4. 再替换文件内容读取接口
5. 最后接保存接口与冲突处理

原因：

- 页面布局和状态交互先稳定
- 真接口接入时只替换数据源，不推翻组件职责
- QA 可以更早介入看交互，而不是等后端齐备后才开始

## 21. 最小 issue / PR 回写摘要模板

后续如果进入实现或提 PR，建议摘要至少包含：

- 本次覆盖的 slice（例如：静态双栏 + mock 浏览编辑）
- 当前未覆盖的能力（例如：真实保存接口、冲突处理）
- 已验证内容（例如：默认文件选中、只读提示、未保存切换拦截）

示例：

> 本次先完成 Agent 详情页静态骨架与 markdown 文件双栏浏览/编辑流，使用 mock 数据覆盖 TASK/SCORE/AGENTS 三类文件场景；已验证默认文件选中、只读提示、未保存切换确认，真实文件保存接口与冲突处理留在下一 slice 接入。

## 22. 当前阻塞与下一步

### 当前阻塞

- 仓库中尚无可承载界面的前端应用骨架
- 当前无法在现有仓库内直接落真实页面代码、路由和组件
- 当前环境无法直接拉取 GitHub Issue 原文，需后续补做 issue 细节核对

### 建议下一步

1. 由负责前端实现的同学补充应用初始化或现有 UI 工程落库
2. 按本文件第 16~20 节先完成静态页面与 mock 状态流
3. 再接入 Markdown 文件列表读取 / 内容读取 / 保存接口
4. 最后补冲突处理、只读原因文案与 QA 回归验证
