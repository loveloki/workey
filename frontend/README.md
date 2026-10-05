# Workey Frontend

React 19 单页应用，为 Workey Go PocketBase 扩展的自定义 `/api` 路由提供 Web 界面，保持现有 Workey 请求/响应格式。

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

## API 地址与部署

未配置时，开发和构建均默认连接 `https://pockethost.exe.xyz`，不自动回退到本地旧版 `/api`。该服务必须将普通 PocketBase 二进制替换为 **Workey Go PocketBase 扩展二进制**；普通 PocketBase 的管理/集合 API 不能替代 Workey 路由。

可复制 `.env.example` 为 `.env.local` 并设置 `VITE_API_BASE_URL`。地址末尾的 `/` 会自动规范化，也支持带路径前缀的地址。此变量在构建时写入浏览器代码，修改后须重启开发服务器或重新构建；**禁止放入 PocketBase 管理员凭据或任何密钥**。

```bash
# 默认远程后端
pnpm build

# 显式空字符串：同源本地一体部署
VITE_API_BASE_URL= pnpm build

# 本地开发：/api 由现有 Vite 代理转发到 localhost:8000
VITE_API_BASE_URL= pnpm dev
```

本地开发也可在不提交到 Git 的 `frontend/.env.local` 中显式配置：

```dotenv
VITE_API_BASE_URL=
```

这会让开发请求走同源 `/api` 的 Vite proxy，也会影响后续构建；若此文件存在，远程构建应显式设置 `VITE_API_BASE_URL=https://pockethost.exe.xyz`。为不覆盖可能被旧服务使用的 `frontend/dist`，构建验证使用 `pnpm exec vite build --outDir /tmp/workey-pocketbase-frontend`，不代表已经部署或重启服务。

所有 API 请求（含导出 ZIP、导入、Passkey 和 Push）均使用该地址并带 `credentials: include`，用于 exe.dev 代理会话；Workey 用户 token 仍使用 Bearer 认证。远程服务需允许 **React 页面真实 Origin** 的跨域请求与 credentials（不能使用通配符来源），并暴露 `X-New-Token` 响应头以支持 token 刷新。浏览器 Cookie 策略仍可能限制跨站会话。

首次使用远程服务，用户需先在浏览器中访问 `https://pockethost.exe.xyz` 完成 exe.dev 代理登录，不能仅依靠 `credentials: include` 自动完成首次登录。若收到登录 HTML，或代理重定向受 CORS 限制导致 fetch 网络错误，界面会显示本地化提示而不清除 Workey token。不要使用 PocketBase 管理员账号作为 Workey 用户认证。

Passkey 使用浏览器生成的真实页面 Origin，前端直接使用扩展根据 Origin allowlist 返回的 `rp.id` / `rpId`，不将它们改成 API 后端 host。后端 allowlist 应包含实际 React 页面来源（本地开发如 `http://localhost:3000`）；生产页面使用 HTTPS，切换页面域名后旧域名的 Passkey 不一定可用。

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
