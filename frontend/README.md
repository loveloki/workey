# Workey Frontend

React 19 单页应用，为 Workey Go PocketBase 扩展的自定义 `/api` 路由提供 Web 界面，保持现有 Workey 请求/响应格式。

## 技术栈

- **React 19** — UI 框架
- **TanStack Router** — 文件路由，类型安全的路由参数
- **TanStack Query** — 服务端状态管理，自动缓存/去重/轮询
- **Tailwind CSS v4** — 原子化样式 + CSS 变量设计系统（Radix Colors）
- **Vite 6** — 构建工具，HMR 极速
- **vite-plugin-pwa** — 离线支持 + Service Worker（仅缓存，不含推送）
- **Vitest + Testing Library** — 单元/集成测试

## 开发

```bash
pnpm install
pnpm dev          # 启动开发服务器 :3000
pnpm build        # 生产构建
pnpm test         # 运行测试（watch 模式）
pnpm test:run     # 运行测试（单次）
pnpm test:coverage  # 覆盖率报告
```

## API 地址与部署

前端与后端由**同一个二进制同源提供**：`apiUrl()` 未配置时使用相对路径 `/api/workey/*`，无需跨域。仅当后端部署在另一台主机时，才通过构建时变量指定：

```bash
# 默认同源（推荐）
pnpm build

# 后端在别的主机
VITE_API_BASE_URL=https://api.example.com pnpm build

# 本地开发：Vite 将 /api 代理到 localhost:8000
pnpm dev
```

`frontend/.env.local`（不提交）可用于本地覆盖。此变量在构建时写入浏览器代码，修改后需重新构建；**禁止放入任何凭据**。

请求统一携带 `credentials: 'include'`（用于 exe.dev 代理会话）与 Workey Bearer token。后端自定义路由都在 `/api/workey/*`（避免与 PocketBase 的 `/api/settings` 等系统路由冲突）；接口契约见 `frontend/src/lib/models.gen.ts`，由 tygo 从 `internal/app/` 的 Go 结构体生成，禁止手改。

错误响应为 PocketBase ApiError：`{"status": 400, "message": "...", "data": {}}`，`api.ts` 读取 `message` 作为展示文案。登录态续期由 `POST /api/workey/auth/refresh` 完成（启动时用现有 token 换新 token）；修改密码会吊销旧 token，因此前端使用响应中的新 token。

跳过验证使用后端提供的完整 API，**不要使用 PocketBase 超级管理员账号**登录前端。

## 目录结构

```
src/
├── routes/                 # TanStack Router 文件路由
│   ├── __root.tsx          # 根布局（Header/Footer/Providers）
│   ├── index.tsx           # 首页 Dashboard
│   ├── clock.tsx           # 打卡签到
│   ├── todos.tsx           # 待办事项
│   ├── checklists.tsx      # 检查清单
│   ├── history.tsx         # 历史记录
│   ├── trends.tsx          # 趋势分析
│   ├── settings.tsx        # 设置入口
│   └── login.tsx           # 登录/注册
├── components/
│   ├── dashboard/          # 首页模块（工作日志、待办、已完成统计）
│   ├── checklists/         # 检查清单子组件
│   ├── settings/           # 设置子组件（主题/时区/密码/数据管理等）
│   ├── Card.tsx            # 通用卡片容器
│   ├── CopyButton.tsx      # 复制到剪贴板
│   ├── InputField.tsx      # 通用输入框
│   └── LoadingScreen.tsx   # 加载状态
├── lib/
│   ├── api.ts              # HTTP API 层（/api/workey 契约，类型安全）
│   ├── queries.ts          # TanStack Query hooks
│   ├── auth-context.tsx    # 认证状态 Context
│   ├── useAuthGuard.ts     # 路由级认证守卫 hook
│   ├── toast-context.tsx   # Toast 通知系统
│   ├── theme-context.tsx   # 主题切换 Context
│   ├── date-utils.ts       # 日期/迭代周期工具函数
│   ├── report-utils.ts     # Markdown 报告生成
│   ├── markdown-editor.tsx # Markdown 编辑/预览组件
│   └── pwa-reload-prompt.tsx # PWA 更新提示
├── styles.css              # Tailwind 入口 + 设计系统 CSS 变量
└── tests/                  # 测试文件
```

## 设计系统

基于 Radix Colors Sand 色阶，通过 CSS 变量定义语义化 token（`--color-ink`、`--color-surface`、`--color-border` 等），支持亮色/暗色主题自动切换。

字体使用等宽字体（UI 默认）+ Georgia 衬线体（标题/正文强调），营造技术感与可读性的平衡。
