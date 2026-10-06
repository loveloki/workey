# Workey

> **本项目几乎完全由 AI 生成。** 人工提供需求描述和方向指导。

个人工作管理系统：打卡与出差/加班/请假、Markdown 工作日志、待办、工单复盘、检查清单、迭代/节假日日历、历史记录、趋势分析与数据导出。

## 架构

| 层 | 技术 |
|---|---|
| 后端 | Go 1.27.1 · PocketBase v0.40.4 Go 扩展 |
| 数据 | PocketBase collection（`pb_data/data.db`），schema 由 `migrations/` 中的 Go migration 定义 |
| 认证 | PocketBase `workey_accounts` auth collection 与原生 auth token |
| 前端 | React 19 · TanStack Router / Query · Tailwind CSS v4 · Vite 6 |
| 测试 | 真实 PocketBase 临时应用 + Go testing · Vitest / Testing Library |

一个二进制同源提供 SPA 与 API：

- `/api/workey/*`：Workey 自定义路由，是前端唯一依赖的接口契约（请求/响应类型见 `internal/app/models.go`、`responses.go`）。按 PocketBase 官方建议使用应用前缀，避免与 `/api/settings` 等系统路由冲突。除注册/登录外均绑定 `apis.RequireAuth("workey_accounts")`，handler 通过 `e.Auth` 获取当前用户。
- PocketBase 原生接口（`/api/health`、管理后台 `/_/` 等）照常可用。业务 collection 的 list/view/create/update/delete 规则全部为空（仅超级管理员），普通用户不能通过原生 record API 绕过 Workey 的校验。
- 其余 GET 请求由 `apis.Static` 提供 `frontend/dist`，未知页面回退到 `index.html`；未匹配的 `/api/*` 返回 JSON 404。
- 错误响应统一为 PocketBase ApiError：`{"status": 400, "message": "...", "data": {}}`。

### 数据模型

| collection | 类型 | 说明 |
|---|---|---|
| `workey_accounts` | auth | `username` 为登录标识（唯一索引），用户设置（时区、主题、迭代参数、下班时长）作为记录字段 |
| `attendance` / `work_logs` | base | 每用户每天一条（`user, date` 唯一） |
| `todos` / `ticket_issues` | base | 待办、工单复盘 |
| `checklists` / `checklist_snapshots` | base | 清单与快照，快照随清单级联删除 |
| `iteration_overrides` / `holiday_calendar_days` | base | 迭代起止覆盖（`user, iteration_number` 唯一）、节假日例外日期（`user, date` 唯一） |

所有业务 collection 通过 `user` relation 归属账号（`CascadeDelete`），并使用 PocketBase 自动维护的 `created` / `updated`；API 中仍以 `id`、`user_id`、`created_at`、`updated_at` 输出，ID 为 PocketBase record ID（字符串）。

### 认证

- 注册/登录返回 `{token, user}`；token 由 PocketBase 签发和校验（有效期 72 小时）。
- 前端启动时调用 `POST /api/workey/auth/refresh` 换发新 token（等价于 PocketBase auth-refresh）。
- 修改密码后 PocketBase 轮换 `tokenKey`，所有旧 token 立即失效，响应返回新 token。

## 部署

```bash
# 构建前端（默认同源调用 API）与扩展服务
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend build
go build -o workey ./cmd/workey

# 运行：未应用的 migration 会在 serve 时自动执行
WORKEY_DATA=./pb_data ./workey serve --http=0.0.0.0:8000
```

首次启动后按终端提示创建 PocketBase 超级管理员（或 `./workey superuser upsert EMAIL PASS`），用于管理后台 `/_/`；Workey 用户在应用登录页注册。

`workey.service` 是 systemd 示例，`Dockerfile` / `docker-compose.yml` 用于容器部署（数据卷 `pocketbase-data`）。

| 配置 | 含义 | 默认 |
|---|---|---|
| `WORKEY_DATA` / `--dir` | PocketBase 数据目录（data.db、auxiliary.db 等） | `./pb_data` |
| `WORKEY_FRONTEND_DIST` | React 静态文件目录 | `./frontend/dist` |
| `serve --http` | HTTP 监听地址 | PocketBase CLI 默认值；示例为 `:8000` |
| `serve --origins` | CORS 允许来源（PocketBase 内置） | `*`（同源部署无需配置） |
| `VITE_API_BASE_URL` | React **构建时** API 根地址，前后端分开部署时才需要 | 空（同源） |

设置旧版的 `WORKEY_DB` 会直接报错：旧数据库不会被自动接管，也不会导入旧版数据。

## 数据导出

「设置 → 数据管理」可将当前账号的考勤、工作日志、待办、工单问题、清单与快照、业务设置、迭代覆盖、节假日日历导出为 `workey-export-*.zip`（内含 `data.json`），用于归档或人工处理。

不提供数据导入：旧版（自建 SQLite / 数字 ID）备份已不再支持导入，账号与业务数据也不会从旧数据库自动搬迁。

## 本地开发

```bash
mise install

# 后端（go run 时启用 Automigrate：在管理后台修改 collection 会自动生成 migrations/ 文件）
go run ./cmd/workey serve --http=0.0.0.0:8000

# 前端开发服务器 :3000，/api 由 Vite 代理到 localhost:8000
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend dev
```

## 开发与验证

```bash
go test ./...
go vet ./...
pnpm --dir frontend exec tsc --noEmit
pnpm --dir frontend exec vitest run --exclude '**/complexTable.test.ts'
tygo generate
```

Go `models.go` / `responses.go` 是类型单一来源，生成的 `frontend/src/lib/models.gen.ts` 禁止手改。修改 schema 时在 `migrations/` 新增 Go migration（`go run ./cmd/workey migrate create <name>`），不要修改已发布的 migration。

## 项目结构

- `cmd/workey/`：PocketBase CLI 入口，空白导入 `migrations`。
- `migrations/`：collection 定义（Go migrations）。
- `internal/app/app.go`：启动配置与 `/api/workey` 路由表。
- `internal/app/records.go`：collection 名称、record ↔ API 模型转换与归属查询。
- `internal/app/auth.go`：注册、登录、刷新 token、修改密码。
- `internal/app/handler_*.go`：业务 handler（`func(e *core.RequestEvent) error`）。
- `internal/app/spa.go`：前端静态文件。
- `frontend/`：React SPA。

## 许可

MIT
