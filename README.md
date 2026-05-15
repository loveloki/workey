# Workey

> **本项目几乎完全由 AI 生成。** 从后端 API、数据库设计、前端 UI 到测试用例，均由 AI（Claude）编写，人工仅提供需求描述和方向性指导，极少直接修改代码。

Workey 是一个轻量级的个人工作管理系统，用于日常打卡、工作日志记录、待办事项管理和检查清单执行。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Go 1.25 · 标准库 `net/http` · SQLite (modernc.org/sqlite) |
| 认证 | JWT + WebAuthn (Passkey) |
| 前端 | React 19 · TanStack Router · TanStack Query · Tailwind CSS v4 · Vite 6 |
| PWA | vite-plugin-pwa + Workbox |
| 测试 | Go `testing` · Vitest + Testing Library |
| 部署 | Docker 多阶段构建 · 单二进制文件 |

## 功能

- **打卡签到** — 上班/下班打卡，加班标记，请假记录
- **工作日志** — Markdown 编辑器，每日工作内容记录
- **待办事项** — 创建/编辑/完成待办，支持关联链接
- **检查清单** — 可复用的检查流程模板，支持快照保存和回溯
- **历史记录** — 按日期/迭代周期查看历史数据，一键复制为 Markdown
- **趋势分析** — 工时统计图表，加班/请假趋势可视化
- **数据管理** — JSON 导入/导出，数据自主可控

## 快速开始

### Docker（推荐）

```bash
docker compose up -d
```

访问 http://localhost:8000

### 本地开发

依赖 [mise](https://mise.jdx.dev/) 管理工具链版本：

```bash
mise install

# 启动后端
go run .

# 启动前端开发服务器（另一个终端）
cd frontend && pnpm install && pnpm dev
```

后端监听 `:8000`，前端开发服务器 `:3000`。

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `WORKEY_DATA` | 数据目录路径 | `.`（当前目录） |
| `WORKEY_DB` | SQLite 数据库路径 | `$WORKEY_DATA/workey.db` |

## 项目结构

```
.
├── *.go                    # Go 后端（handler/model/middleware/database）
├── *_test.go               # Go 单元测试
├── frontend/
│   ├── src/
│   │   ├── routes/         # TanStack Router 文件路由
│   │   ├── components/     # React 组件（按功能分组）
│   │   ├── lib/            # 工具函数、API 层、Context
│   │   └── styles.css      # Tailwind + 设计系统变量
│   └── tests/              # 前端测试
├── Dockerfile              # 多阶段构建
└── docker-compose.yml
```

## 许可

MIT
