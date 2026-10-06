# Workey

> **本项目几乎完全由 AI 生成。** 人工提供需求描述和方向指导。

个人工作管理系统：打卡与出差/加班/请假、Markdown 工作日志、待办、工单复盘、检查清单、迭代/节假日日历、历史记录、趋势分析与 ZIP 备份。

## 架构

| 层 | 技术 |
|---|---|
| 后端 | Go 1.27.1 · PocketBase v0.40.4 Go 扩展 |
| 数据 | PocketBase 管理的 `pb_data/data.db`，业务 SQL 经 `core.App.DB()` / dbx 执行 |
| 认证 | PocketBase `workey_accounts` auth collection、原生 auth token + WebAuthn |
| 前端 | React 19 · TanStack Router / Query · Tailwind CSS v4 · Vite 6 |
| 测试 | 真实 PocketBase 临时应用 + Go testing · Vitest / Testing Library |

后端按 PocketBase 的 [Go 扩展文档](https://pocketbase.io/docs/go-overview/) 使用 `pocketbase.NewWithConfig`、生命周期 hook、原生路由、认证记录和 Go migrations。业务 HTTP handler 通过官方 `apis.WrapStdHandler` 注册，`/api/...` 保持既有的请求/响应格式；PocketBase 的 `/api/health`、管理后台 `/_/` 等原生接口同样可用。

业务数据使用 **PocketBase 数据库内的自定义 SQL 表**，不是原生 record collection；数字业务 ID 经 `workey_profiles` 映射到 auth record ID，该表不存密码。业务表不会作为集合出现在管理后台，也不会暴露不带用户归属校验的原生 record CRUD。数据统一存于 PocketBase 的 `pb_data/data.db`。

## 使用 pockethost 服务

**React 默认连接 `https://pockethost.exe.xyz`。该地址必须运行本项目编译的 Workey PocketBase 扩展二进制。** Go 扩展不是远程 SDK：现有普通 PocketBase 二进制不会自动获得 Workey 的 `/api/auth/login`、`/api/todos` 等业务路由，需要在服务主机替换为新二进制。现有 `pb_data` 可继续作为 PocketBase 数据目录使用；首次运行会创建 Workey auth collection 和业务表。

首次迁移如发现已有同名业务表/集合会拒绝启动，不会擅自接管或覆盖；此时使用独立 PocketBase 数据目录，或自行处理命名冲突。

```bash
# 编译扩展服务（Go 1.27.1）
go build -o workey-pocketbase ./cmd/workey

# 在 pockethost 主机运行；也可使用后面的 Docker 配置
WORKEY_DATA=/path/to/pb_data \
WORKEY_ALLOWED_ORIGINS=https://workey.exe.xyz,https://pockethost.exe.xyz \
./workey-pocketbase serve --http=0.0.0.0:8000

# React 构建后可单独托管到 workey.exe.xyz，也可由 Go 服务提供静态文件
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend build
```

- 若 pockethost 启用了 exe.dev 代理认证，先在浏览器打开该地址并完成 **exe.dev 登录**，再在 Workey 注册/登录应用账号。exe.dev 登录与 PocketBase/Workey 登录是两个独立步骤。
- 前端请求携带代理 Cookie 和 Workey Bearer token；后端仅允许 `WORKEY_ALLOWED_ORIGINS` 中的精确来源，禁止通配符凭据跨域。代理自身也必须允许所需的跨域请求；若浏览器 Cookie/CORS 策略阻止连接，可以在 pockethost 同源提供前端，或自行配置已认证的同源反向代理。
- `VITE_API_BASE_URL` 是**构建时**配置。默认远程地址，显式空字符串表示同源；禁止将管理员凭据填入 `VITE_*`。
- Passkey 使用允许的 React 页面 Origin 作为 RP，而非远程 API 的主机名；更换页面域名后需要重新绑定。
- 访问 `/api/health` 只证明 PocketBase 在运行；访问 Workey 登录页完成注册/登录，才验证扩展业务接口已部署。

## 从旧版迁移

1. 保留旧服务及旧数据库，在旧版「设置 → 数据管理」导出 `workey-export-*.zip`。
2. 部署新的扩展后端和 React，**重新注册 Workey 账号**。
3. 登录新账号，在「数据管理」上传旧 ZIP（里面的 `data.json` 不需编辑）。
4. 检查历史日期、工作日志、待办、清单及快照，然后再自行处理旧服务。

导入包含：考勤、工作日志、待办、工单问题、清单与快照、业务设置、迭代覆盖、节假日日历。缺失的可选字段会补默认值；所有用户 ID 都改为当前账号，清单与快照 ID 重新映射，创建/更新时间点保留。自动清单以手动清单导入；已删除模板的历史快照恢复到占位清单，避免丢失或误关联。

业务备份不包含账号密码、已有登录会话、Passkey、推送订阅、WebDAV 配置/主密钥、上传文件和服务部署配置；这些按需手动重新配置。导入仅支持 ZIP 导出文件，不处理 SQLite 数据库文件。

导入是一个事务：校验错误或任何写入失败都不会留下部分数据。压缩文件、总解压内容限制均为 50 MiB，拒绝重复文件、危险路径、损坏 ZIP、歧义/非法 JSON。导入采用合并方式；为确保迁移完整，推荐首次导入到空账号。

## 本地开发 / 一体部署

```bash
mise install

# 后端：PocketBase 需要明确的 serve 命令
go run ./cmd/workey serve --http=0.0.0.0:8000

# 前端开发：显式使用同源 API，Vite 会代理到 localhost:8000
pnpm --dir frontend install --frozen-lockfile
VITE_API_BASE_URL= pnpm --dir frontend dev

# 本地一体 Docker；空字符串使 React 使用容器内的同源后端
VITE_API_BASE_URL= docker compose up -d --build
```

默认 Docker 构建的 React 指向 pockethost；如果将容器部署在 pockethost，这就是同源调用。Compose 使用独立的 `pocketbase-data` 卷存放数据。

环境变量 / CLI：

| 配置 | 含义 | 默认 |
|---|---|---|
| `WORKEY_DATA` / `--dir` | PocketBase 数据目录，包含 data.db、auxiliary.db、存储等 | `./pb_data` |
| `WORKEY_ALLOWED_ORIGINS` | 逗号分隔的前端来源白名单 | 两个 exe.xyz 域名 + localhost:3000/8000 |
| `WORKEY_FRONTEND_DIST` | 一体部署的 React 静态目录 | `./frontend/dist` |
| `VITE_API_BASE_URL` | React 构建时 API 根地址，可显式为空 | `https://pockethost.exe.xyz` |
| `serve --http` | HTTP 监听地址 | PocketBase CLI 默认值；示例显式设为 `:8000` |

设置 `WORKEY_DB` 会报错，业务数据统一存于 PocketBase 数据目录。部署示例见 `workey.service`、`Dockerfile` 和 `docker-compose.yml`；替换运行服务前自行备份数据并调整主机路径。

## 开发与验证

```bash
go test ./...
go vet ./...
pnpm --dir frontend exec tsc --noEmit
pnpm --dir frontend exec vitest run --exclude '**/complexTable.test.ts'
tygo generate
```

Go `models.go` / `responses.go` 是类型单一来源，生成的 `frontend/src/lib/models.gen.ts` 禁止手改。修改业务 schema 时新增 Go migration；不要重新引入独立 SQLite 初始化或自签 JWT。

## 项目结构

- `cmd/workey/`：PocketBase CLI 入口。
- `internal/app/app.go`：PocketBase 生命周期、原生路由和前端适配。
- `internal/app/database.go`：Workey auth collection 与业务 schema 的 Go migration。
- `internal/app/database_adapter.go`：参数绑定、PB 读写池与已有事务模块的适配。
- `internal/app/handler_*.go`：保留兼容 API 的业务模块。
- `frontend/`：React SPA，统一 API URL 与 TanStack Query。

## 许可

MIT
