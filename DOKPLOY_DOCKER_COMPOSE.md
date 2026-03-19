# Dokploy 使用 Docker Compose 部署

Dokploy 不直接支持 docker-compose 作为 Build Type，但有两种方式在 Dokploy 中使用 docker-compose：

## 方案 A: 使用 Dockerfile Build Type（推荐）

Dokploy 会自动处理卷挂载，无需手动配置。

### 步骤

1. **在 Dokploy 中创建应用**
   - Build Type: `Dockerfile`
   - Dockerfile Path: `Dockerfile`
   - Docker Context Path: `.`

2. **配置环境变量**
   ```
   WORKEY_DATA=/app/data
   ```

3. **配置卷挂载**
   在应用的 "Volumes" 部分：
   ```
   Mount Path: /app/data
   ```

4. **点击部署**

Dokploy 会自动处理持久化卷的创建和挂载。

---

## 方案 B: 在服务器上运行 Docker Compose

如果你想在 Dokploy 主机上直接使用 docker-compose：

### 前置条件

- SSH 访问 Dokploy 服务器
- Docker 和 Docker Compose 已安装
- Git 已安装

### 部署步骤

#### 1. 克隆仓库

```bash
ssh user@dokploy-host
cd /opt/apps
git clone https://github.com/your-org/workey.git
cd workey
```

#### 2. 运行 docker-compose

```bash
# 构建镜像并启动容器
docker-compose up -d

# 验证服务状态
docker-compose ps

# 查看日志
docker-compose logs -f app
```

#### 3. 配置反向代理（可选）

如果 Dokploy 使用 Nginx/Caddy，配置代理指向 `localhost:8000`。

#### 4. 更新应用

```bash
# 拉取最新代码
git pull origin main

# 重新构建并重启
docker-compose up -d --build

# 清理旧镜像（可选）
docker image prune -a
```

---

## docker-compose.yml 说明

项目已包含 `docker-compose.yml`，包括：

### 服务配置
```yaml
services:
  app:
    build:                    # 从 Dockerfile 构建
      context: .
      dockerfile: Dockerfile
    container_name: workey
    ports:
      - "8000:8000"          # 映射端口
    environment:
      - WORKEY_DATA=/app/data  # 环境变量
    volumes:                  # 持久化卷
      - workey-data:/app/data
      - workey-uploads:/app/data/uploads
    restart: unless-stopped   # 自动重启
    healthcheck:              # 健康检查
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:8000"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### 卷配置
```yaml
volumes:
  workey-data:       # 数据库和配置
    driver: local
  workey-uploads:    # 上传文件
    driver: local
```

卷由 Docker 管理，自动持久化到主机的 `/var/lib/docker/volumes/` 目录。

---

## 常见命令

### 启动服务
```bash
docker-compose up -d
```

### 停止服务
```bash
docker-compose down
```

### 查看日志
```bash
docker-compose logs -f app
```

### 进入容器
```bash
docker-compose exec app sh
```

### 重建镜像
```bash
docker-compose up -d --build
```

### 清理所有资源
```bash
docker-compose down -v  # 包括卷
```

---

## 数据备份

### 备份数据卷

```bash
# 备份到 tar 文件
docker run --rm -v workey_workey-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/workey-data-backup.tar.gz -C /data .

# 备份上传文件
docker run --rm -v workey_workey-uploads:/data -v $(pwd):/backup \
  alpine tar czf /backup/workey-uploads-backup.tar.gz -C /data .
```

### 恢复数据卷

```bash
# 恢复数据
docker run --rm -v workey_workey-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/workey-data-backup.tar.gz -C /data

# 恢复上传文件
docker run --rm -v workey_workey-uploads:/data -v $(pwd):/backup \
  alpine tar xzf /backup/workey-uploads-backup.tar.gz -C /data
```

---

## 监控和日志

### 实时日志
```bash
docker-compose logs -f
```

### 特定服务日志
```bash
docker-compose logs -f app
```

### 查看内存/CPU 使用
```bash
docker stats
```

### 检查卷占用空间
```bash
docker volume ls
docker volume inspect workey_workey-data
```

---

## 生产环境建议

### 1. 使用命名卷而不是 bind mount
✅ **推荐**（已在 docker-compose.yml 中）
```yaml
volumes:
  - workey-data:/app/data
```

❌ **不推荐**
```yaml
volumes:
  - /host/path:/app/data
```

### 2. 设置资源限制

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### 3. 启用日志驱动

```yaml
services:
  app:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### 4. 配置网络隔离

```yaml
networks:
  workey-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

---

## 与 Dokploy 集成的混合方案

**最佳实践**：在 Dokploy 中使用 Dockerfile Build Type

1. Dokploy 的 UI 管理部署
2. 自动处理卷挂载和网络
3. 简化的日志和监控
4. 无需 SSH 访问服务器

```
Dokploy UI
    ↓
连接 GitHub → Dockerfile Build → 自动部署 → 卷管理 → 反向代理
```

---

## 故障排除

| 问题 | 解决方案 |
|------|--------|
| 容器无法启动 | `docker-compose logs app` 查看错误 |
| 数据库文件丢失 | 检查卷是否正确挂载：`docker volume ls` |
| 端口已被占用 | 修改 docker-compose.yml 中的 ports |
| 权限拒绝错误 | 检查卷的权限：`docker exec workey ls -la /app/data` |
| 构建失败 | 检查 Dockerfile 和依赖，`docker-compose build --no-cache` |

---

## 何时选择方案

| 场景 | 方案 |
|------|------|
| Dokploy UI 管理 + 自动部署 | A（Dockerfile） |
| 完全自动化脚本 | B（docker-compose） |
| 本地开发测试 | B（docker-compose） |
| 生产环境稳定运行 | A（Dockerfile） + Dokploy |
| 需要编排多个服务 | B（docker-compose） |

---

## 更多资源

- [Docker Compose 官网](https://docs.docker.com/compose/)
- [Dokploy 文档](https://dokploy.com/docs)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
