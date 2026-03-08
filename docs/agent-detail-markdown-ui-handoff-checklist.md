# Agent 详情页与 Markdown 浏览/编辑界面交接清单

> 对应任务：Issue #25
> 用途：在前端工程骨架尚未落库时，给后续实现 / 联调 / QA 一个可直接照着推进的最小交接单。

## 1. 本轮目标一句话

先把 Agent 详情页与 Markdown 文件浏览/编辑能力拆成可执行的实现步骤，避免后续接手时重新拆题。

## 2. 建议实现顺序

### Step 1：补齐前端承载骨架

最低要求：

- 有可运行的前端应用入口
- 有 Agent 详情页路由或占位页面
- 有基础布局容器、按钮、输入框、反馈提示组件

未满足时不要直接开做页面细节，否则产物无法落地。

### Step 2：先用 mock 跑通页面状态

最低要求：

- 左栏文件列表可切换
- 右栏浏览态 / 编辑态可切换
- `TASK.md` 可编辑
- `AGENTS.md` 可只读展示
- 缺失文件可显示 missing 状态

### Step 3：接真实读取接口

最低要求：

- Agent 详情接口
- Markdown 文件列表接口
- 文件内容读取接口
- 三类接口失败时有独立错误反馈

### Step 4：接保存链路

最低要求：

- 保存按钮 loading
- 成功后刷新版本与修改时间
- 失败后保留本地输入
- 冲突时提示刷新后重试

## 3. 页面最小组件表

| 组件 | 必须 | 说明 |
| --- | --- | --- |
| `AgentHeader` | 是 | 展示名称、角色、状态、最近活跃 |
| `AgentSummaryCard` | 是 | 展示任务、积分、工作目录 |
| `MarkdownFileList` | 是 | 左栏文件导航 |
| `MarkdownViewer` | 是 | Markdown 浏览态 |
| `MarkdownEditor` | 是 | 文本编辑态 |
| `MarkdownToolbar` | 是 | 编辑 / 保存 / 取消操作 |
| `UnsavedChangesDialog` | 建议 | 处理切文件或离开页前确认 |

## 4. 必验交互

- 默认进入页面自动选中 `TASK.md`
- 已编辑未保存时切换文件会拦截
- 只读文件不能进入编辑态，且要解释原因
- 保存失败后不清空本地内容
- 文件缺失时列表位仍保留

## 5. 接口对齐最小字段

### Agent 详情

- `agentId`
- `agentName`
- `role`
- `title`
- `status`
- `lastActiveAt`
- `currentTaskSummary`
- `score`
- `workspacePath`

### 文件列表

- `path`
- `name`
- `category`
- `editable`
- `exists`
- `lastModifiedAt`
- `size`

### 文件内容

- `path`
- `name`
- `content`
- `editable`
- `version`
- `lastModifiedAt`

## 6. QA 最小回归集

| 场景 | 预期 |
| --- | --- |
| 默认打开 `TASK.md` | 左栏选中正确，右栏内容正确 |
| 打开只读文件 | 编辑按钮禁用或隐藏，原因清楚 |
| 修改后切文件 | 出现保存/放弃/取消确认 |
| 保存成功 | 展示成功反馈并刷新版本 |
| 保存失败 | 保留编辑内容并展示失败原因 |
| 冲突保存 | 明确提示文件已被外部更新 |
| 文件不存在 | 列表保留位置，右侧展示 missing |

## 7. 当前已知阻塞

- 仓库尚未提供可承载页面代码的前端应用骨架
- 当前环境无法直连 GitHub API，未能补抓 Issue #25 原文做逐字核对

## 8. 下一步建议

1. 先补前端工程骨架或确认已有 UI 工程入口
2. 依据 `docs/agent-detail-markdown-ui-plan.md` + 本清单完成 mock 页面
3. 再进入真实接口读取与保存联调
4. 最后补冲突、只读原因与 QA 回归
