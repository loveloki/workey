# Dokploy 部署指南

这个项目已经配置好可以在 Dokploy 上部署。Dokploy 是一个开源的、自托管的部署平台。

## 前置条件

- Dokploy 服务器已安装并运行
- 项目已推送到 Git 仓库（GitHub、GitLab、Gitea 等）
- 有权限访问 Dokploy 仪表板

## 部署步骤

### 1. 在 Dokploy 中创建新项目

1. 登录 Dokploy 仪表板
2. 点击 "Create Project"
3. 选择你的 Git 提供商（GitHub、GitLab 等）
4. 选择 `workey` 仓库
5. 配置项目设置

### 2. 配置环境变量

在 Dokploy 中设置以下环境变量：

```
WORKEY_DATA=/app/data
```

如果需要更改 JWT 密钥位置：

```
WORKEY_DB=/app/data/workey.db
JWT_SECRET_FILE=/app/data/.jwt_secret
```

### 3. 配置持久化存储

项目使用 SQLite 数据库和上传文件夹。需要配置持久化卷：

**卷挂载：**
- `/app/data` → 用于数据库和上传文件

**确保数据库文件持久化：**
- `workey.db` 和 WAL 文件 (`workey.db-shm`, `workey.db-wal`)
- `uploads/` 目录

### 4. 配置域名和端口

- **内部端口：** 8000（应用默认监听）
- **配置外部域名** 指向你的 Dokploy 实例

### 5. 健康检查（可选）

配置健康检查端点（如果应用提供）：
- 路径：`/health` 或根路径 `/`
- 超时：30 秒

### 6. 部署

1. 选择分支（通常是 `main` 或 `master`）
2. 点击 "Deploy"
3. Dokploy 将：
   - 克隆仓库
   - 构建 Docker 镜像（使用 Dockerfile）
   - 启动容器并挂载卷
   - 配置反向代理

## 构建过程

Dokploy 会使用项目的 `Dockerfile`，该文件包含三个阶段：

1. **frontend 阶段**：构建 React/前端应用
2. **backend 阶段**：构建 Go 二进制文件
3. **runtime 阶段**：最小化的 Alpine 容器

总镜像大小：~50MB（优化后）

## 监控和日志

### 查看日志

```bash
dokploy logs <project-id>
```

### 常见日志

- `Failed to open database` → 检查 `/app/data` 卷是否挂载
- `Failed to create uploads directory` → 检查卷权限
- `address already in use` → 检查端口配置

## 自动更新/CD

### 启用自动部署

1. 在 Dokploy 中配置 Webhook
2. 在 Git 仓库设置中添加 Webhook URL
3. 每次推送时自动部署

### 手动部署

如果 Webhook 失败，可以在 Dokploy 仪表板手动触发部署。

## 备份和恢复

### 备份数据

定期备份 `/app/data` 目录：

```bash
# 在 Dokploy 主机上
docker run --rm -v <volume-name>:/data -v $(pwd):/backup \
  alpine tar czf /backup/workey-backup.tar.gz -C /data .
```

### 恢复数据

```bash
docker run --rm -v <volume-name>:/data -v $(pwd):/backup \
  alpine tar xzf /backup/workey-backup.tar.gz -C /data
```

## 环境配置建议

```bash
# .env 文件（本地测试用）
WORKEY_DATA=/app/data
WORKEY_DB=/app/data/workey.db

# Dokploy 仪表板环境变量
# 设置这些以启用自定义配置
```

## 故障排除

| 问题 | 解决方案 |
|------|--------|
| 数据库文件丢失 | 检查 `/app/data` 卷是否正确挂载 |
| 上传文件丢失 | 确保 `uploads/` 在持久化卷中 |
| 应用无法启动 | 检查日志，确认环境变量设置正确 |
| 构建失败 | 检查 Node.js 和 Go 版本是否匹配 Dockerfile |

## 扩展和优化

### 性能优化

1. **数据库优化**：
   - 定期运行 `VACUUM` 和 `ANALYZE`
   - 启用 WAL 模式（已在代码中启用）

2. **前端优化**：
   - 启用 gzip 压缩
   - 设置长期缓存头

3. **并发**：
   - 可在 Go 代码中调整 `MaxOpenConns`

### 扩展到多个实例

如果需要多个副本：
1. 使用外部数据库（PostgreSQL）替代 SQLite
2. 配置共享文件存储
3. 在 Dokploy 中设置副本数

## 更新应用

推送新代码到 Git 仓库后：

```bash
# 如果启用了自动部署，Dokploy 将自动部署
# 如果没有，手动触发：
# - 在 Dokploy 仪表板点击 "Redeploy"
# - 或配置 Webhook
```

## 相关文档

- [Dokploy 官网](https://dokploy.com)
- [Docker 多阶段构建](https://docs.docker.com/build/building/multi-stage/)
- [SQLite 最佳实践](https://www.sqlite.org/bestpractice.html)

---

部署问题？查看 Dokploy 日志或访问 https://dokploy.com/docs
