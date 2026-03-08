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

## 11. QA 对齐点

QA 后续可重点验证：

- 默认文件是否按预期选中
- 文件切换时未保存提醒是否准确
- 只读文件是否禁止进入编辑
- 保存失败后内容是否仍保留
- 加载态 / 空态 / 错误态是否区分清楚
- 长 Markdown 文件滚动与显示是否稳定
- 冲突提示是否可理解

## 12. 当前阻塞与下一步

### 当前阻塞

- 仓库中尚无可承载界面的前端应用骨架
- 当前无法在现有仓库内直接落真实页面代码、路由和组件
- 本轮未能直接读取 Issue 原文，需要后续补齐 issue 细节核对

### 建议下一步

1. 由负责前端实现的同学补充应用初始化或现有 UI 工程落库
2. 基于本草案先实现 AgentDetailPage 静态页面与 mock 数据
3. 再接入 Markdown 文件列表读取 / 内容读取 / 保存接口
4. 最后补页面状态、冲突提示与回归验证
