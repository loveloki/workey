# Dokploy 部署汇总

## 📌 核心要点

**Dokploy 不支持 docker-compose 作为 Build Type**，但你有两个选择：

### 选项 A：Dokploy UI + Dockerfile（推荐 ✅）

```
优点：
✅ 通过 Dokploy UI 管理和监控
✅ 自动处理卷和网络
✅ 一键部署和更新
✅ 集成日志和监控
✅ 不需要 SSH 访问

步骤：
1. Build Type: Dockerfile
2. 设置环境变量: WORKEY_DATA=/app/data
3. 添加卷挂载: /app/data
4. 点击 Deploy
```

**文档：** 
- `DOKPLOY_QUICK_START.md` - 5 分钟快速开始
- `DOKPLOY_DEPLOYMENT.md` - 完整指南
- `DOKPLOY_VOLUMES_SETUP.md` - 卷配置详解

---

### 选项 B：直接在服务器运行 docker-compose（备选）

```
优点：
✅ 完全自动化（CI/CD）
✅ 易于本地测试
✅ 编排多个服务

缺点：
❌ 需要 SSH 访问服务器
❌ Dokploy UI 无法管理
❌ 需要手动配置反向代理

步骤：
1. SSH 到 Dokploy 主机
2. git clone 项目
3. docker-compose up -d
4. 配置反向代理
```

**文档：** `DOKPLOY_DOCKER_COMPOSE.md` - 完整指南

---

## 🚀 快速开始（推荐选项 A）

### 1. 准备阶段
```bash
# 确保代码已提交并推送
git push origin main
```

### 2. Dokploy UI 配置

| 设置项 | 值 |
|-------|-----|
| Build Type | Dockerfile |
| Dockerfile Path | `Dockerfile` |
| Docker Context | `.` |
| Port | `8000` |

### 3. 环境变量
```
WORKEY_DATA=/app/data
```

### 4. 卷挂载

**主数据卷：**
```
Mount Path:  /app/data
Volume Type: Named Volume
```

**上传文件卷（可选）：**
```
Mount Path:  /app/data/uploads
Volume Type: Named Volume
```

### 5. 部署
```
点击 "Deploy" 按钮
```

### 6. 完成！
```
访问: https://your-domain.com
```

---

## 📁 项目文件说明

| 文件 | 用途 |
|------|------|
| `Dockerfile` | 多阶段构建（Node.js + Go） |
| `docker-compose.yml` | 本地/服务器部署配置 |
| `DOKPLOY_QUICK_START.md` | 5 分钟快速指南 |
| `DOKPLOY_DEPLOYMENT.md` | 深入部署指南 |
| `DOKPLOY_DOCKER_COMPOSE.md` | docker-compose 使用指南 |
| `DOKPLOY_VOLUMES_SETUP.md` | 卷管理和备份 |
| `dokploy.json` | 配置文件（可选） |

---

## 💾 卷挂载概念

### 为什么需要卷？

SQLite 数据库和上传的文件需要持久化存储。Dokploy 使用 Docker 命名卷：

```
应用容器重启 → 卷中的数据保留 ✅
应用更新     → 卷中的数据保留 ✅
应用删除     → 卷中的数据保留 ✅（除非手动删除）
```

### 命名卷 vs 绑定挂载

```yaml
# ✅ 命名卷（推荐）
volumes:
  - workey-data:/app/data

# ❌ 绑定挂载（不推荐）
volumes:
  - /host/path:/app/data
```

**建议：** 在 Dokploy UI 中使用命名卷（Named Volume）。

---

## 🔧 常见配置

### 环境变量
```
WORKEY_DATA=/app/data
WORKEY_DB=/app/data/workey.db (可选，默认同上)
```

### 端口
```
内部端口: 8000（应用监听）
外部访问: 你的域名（通过 Dokploy 反向代理）
```

### 资源限制（可选）
```
CPU: 1 core
Memory: 512 MB
```

---

## 📊 部署流程图

```
GitHub Repository
    ↓
Dokploy 检测推送
    ↓
克隆代码
    ↓
构建镜像（Dockerfile）
  ├─ 前端构建（Node.js）
  ├─ Go 后端编译
  └─ 最终镜像（Alpine）
    ↓
创建和启动容器
    ↓
挂载卷 (/app/data)
    ↓
配置反向代理
    ↓
应用上线 ✅
```

---

## 🔍 监控和维护

### Dokploy UI 中查看

- **Logs：** 应用 → Logs → 实时日志
- **Status：** 应用 → Status → 运行状态
- **Metrics：** 应用 → Metrics → CPU/内存使用

### 命令行查看

```bash
# 进入 Dokploy 主机
ssh user@dokploy-host

# 查看日志
docker logs workey -f

# 查看卷
docker volume ls | grep workey

# 查看卷大小
docker run --rm -v workey-data:/data alpine du -sh /data

# 访问卷中的文件
docker exec workey ls -la /app/data
```

---

## 💾 备份和恢复

### 备份卷

```bash
docker run --rm -v workey-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/backup-$(date +%s).tar.gz -C /data .
```

### 恢复卷

```bash
docker run --rm -v workey-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/backup-1234567890.tar.gz -C /data
```

**建议：** 在 Dokploy 主机上设置定期备份 cron 任务。

---

## 🐛 故障排除

### 数据库无法访问

```
❌ 问题: Failed to open database
✅ 解决: 检查卷是否正确挂载
   - Dokploy UI: Settings → Volumes 确认
   - 命令行: docker volume ls | grep workey
```

### 上传文件丢失

```
❌ 问题: uploads/ 目录为空
✅ 解决: 确保卷挂载了 /app/data
   - 检查 Mount Path 是否正确
   - 确保容器重启后卷仍然挂载
```

### 应用无法启动

```
❌ 问题: 容器启动失败
✅ 解决: 
   1. 查看日志: docker logs workey
   2. 检查环境变量: docker inspect workey | grep -A 20 Env
   3. 检查卷权限: docker exec workey ls -la /app/data
```

### 构建失败

```
❌ 问题: Docker 镜像构建失败
✅ 解决:
   1. 检查 Node.js 依赖: frontend/package.json
   2. 检查 Go 依赖: go.mod
   3. 检查 Dockerfile 语法
   4. Dokploy UI 查看构建日志
```

---

## 🔄 更新应用

### 部署新版本

```bash
# 1. 本地提交和推送
git commit -am "update: new feature"
git push origin main

# 2. Dokploy 自动部署（如果启用了 Webhook）
# 或手动：Dokploy UI → 应用 → Redeploy

# 3. 应用更新完成，卷中的数据保留 ✅
```

---

## 📚 文档导航

需要什么帮助？

- **快速部署？** → `DOKPLOY_QUICK_START.md`
- **详细配置？** → `DOKPLOY_DEPLOYMENT.md`
- **卷管理和备份？** → `DOKPLOY_VOLUMES_SETUP.md`
- **docker-compose？** → `DOKPLOY_DOCKER_COMPOSE.md`
- **完整配置文件？** → `dokploy.json`

---

## ✅ 部署检查清单

### 部署前
- [ ] 代码已提交并推送到 GitHub
- [ ] Dockerfile 存在且正确
- [ ] frontend/package.json 和 go.mod 配置正确

### Dokploy UI 配置
- [ ] Build Type: Dockerfile
- [ ] Dockerfile Path: Dockerfile
- [ ] Docker Context: .
- [ ] Port: 8000
- [ ] 环境变量：WORKEY_DATA=/app/data

### 卷挂载
- [ ] 主卷：/app/data
- [ ] 上传卷：/app/data/uploads（可选但推荐）
- [ ] 卷类型：Named Volume

### 部署后
- [ ] 应用成功启动
- [ ] 可以通过浏览器访问
- [ ] 卷已正确挂载
- [ ] 数据库文件存在
- [ ] 上传功能正常

---

## 🆘 需要帮助？

- **Dokploy 官网：** https://dokploy.com
- **Dokploy 文档：** https://dokploy.com/docs
- **Docker 文档：** https://docs.docker.com
- **项目 GitHub：** your-repo-url

---

**记住：** 选择 **选项 A（Dockerfile + Dokploy UI）** 是最简单和最推荐的方式！

部署愉快！🚀
