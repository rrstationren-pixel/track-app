# 任务管理系统重构方案

## 一、数据库变更

新增 `profiles.active boolean default true`，用于启用/禁用用户（不删除）。

新增 `tasks.archived_at timestamptz`，用于归档（软删除）。

新增 `tasks.updated_at timestamptz` + 触发器，供"最后更新时间"显示。

为了支持"报告数量"和"最后更新时间"快速聚合，创建 SQL 视图 `task_overview`：
- 字段：task 全字段 + `assignee_name`、`assignee_email`、`report_count`、`last_report_at`。
- 视图沿用底层表 RLS，无需额外策略。

## 二、服务端函数（createServerFn，全部 requireSupabaseAuth + 管理员校验）

放在 `src/lib/admin.functions.ts`：
- `listUsers({ search })` — 列出所有用户（profiles + roles + active + email 来自 auth.users via admin client）。
- `createUser({ email, password, name, role })` — 调用 supabase admin auth.createUser。
- `setUserActive({ userId, active })` — 更新 profiles.active；禁用时同时 admin.updateUserById ban_duration。
- `setUserRole({ userId, role })` — 更新 user_roles。
- `resetUserPassword({ userId, newPassword })` — admin.updateUserById。

均在 handler 内 `await import('@/integrations/supabase/client.server')`，并先用 `has_role` 校验调用者为 admin。

## 三、路由结构

```text
src/routes/_authenticated/
  admin.tsx                  # 管理员布局（侧边导航 + Outlet）
  admin.index.tsx            # 仪表盘（统计卡 + 任务列表）
  admin.tasks.tsx            # 任务管理（搜索/过滤/排序/操作）
  admin.reports.tsx          # 报告管理（按任务分组卡片，点击展开）
  admin.users.tsx            # 用户管理
  employee.tsx               # 员工仪表盘（"我的任务" + 搜索 + 过滤）
  task.$taskId.tsx           # 任务详情（报告列表 + "查看图片"按钮）
```

注：现有 `admin.tsx` 改为布局，原内容拆到 `admin.index.tsx` 与 `admin.tasks.tsx`。

## 四、关键页面行为

**管理员仪表盘**：5 个统计卡 + 全局搜索 + 状态过滤标签 + 排序下拉；任务列表显示标题/负责人/状态/创建/截止/报告数/最后更新，行内动作：查看/编辑/转派/标完成/归档。

**报告管理（重构）**：默认只显示任务卡（标题、员工、状态、报告数、最后更新）。点"查看详情"跳到任务详情；点"展开"在卡片内 lazy 拉取该任务的报告（不含图片）。

**任务详情**：报告时间线，每条显示提交时间和备注。"查看图片"按钮 → 打开模态：缩略图网格（懒加载 signed URL）→ 点击放大 → 上一张/下一张/下载。

**用户管理**：表格显示姓名/邮箱/角色/状态/创建时间；搜索框；新建用户对话框；启用/禁用切换；重置密码对话框；编辑姓名与角色。

**员工仪表盘**：仅"我的任务"，搜索 + 状态标签过滤。

## 五、UI 规范

- 中文界面，企业级简洁卡片布局。
- 使用现有 shadcn 组件（Card/Table/Tabs/Dialog/Badge/Input/Select）。
- 移除多余动画；保持快速。
- 全部颜色走 `src/styles.css` 语义 token，不写 `bg-white` 等硬编码。

## 六、性能

- 报告与图片均按需加载（按钮触发）。
- 图片用 signed URL；仅在模态打开时生成。
- 任务列表读 `task_overview` 视图，避免 N+1。
- 用 TanStack Query 缓存任务列表与用户列表。

## 七、文件改动概览

新增：5 个路由文件、`src/lib/admin.functions.ts`、`src/components/image-gallery.tsx`、`src/components/admin-sidebar.tsx`、一个数据库迁移。
修改：`admin.tsx`、`employee.tsx`、`task.$taskId.tsx`。

确认后我会先提交数据库迁移，待批准执行后再实现前端代码。