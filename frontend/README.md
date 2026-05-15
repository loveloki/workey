# Workey Frontend

React 19 单页应用，为 Workey 后端 API 提供 Web 界面。

## 技术栈

- **React 19** — UI 框架
- **TanStack Router** — 文件路由，类型安全的路由参数
- **TanStack Query** — 服务端状态管理，自动缓存/去重/轮询
- **Tailwind CSS v4** — 原子化样式 + CSS 变量设计系统（Radix Colors）
- **Vite 6** — 构建工具，HMR 极速
- **vite-plugin-pwa** — 离线支持 + Service Worker
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
│   ├── settings/           # 设置子组件（主题/时区/密码/Passkey 等）
│   ├── Card.tsx            # 通用卡片容器
│   ├── CopyButton.tsx      # 复制到剪贴板
│   ├── InputField.tsx      # 通用输入框
│   └── LoadingScreen.tsx   # 加载状态
├── lib/
│   ├── api.ts              # HTTP API 层（类型安全的请求/响应）
│   ├── queries.ts          # TanStack Query hooks（30+ query/mutation）
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
