# Dokploy 部署文档索引

## 📖 文档清单

### 🚀 快速开始
**文件：** `DOKPLOY_QUICK_START.md`
- 5 分钟部署流程
- 配置清单
- 常见问题

### 📚 完整部署指南
**文件：** `DOKPLOY_DEPLOYMENT.md`
- 详细步骤说明
- 环境配置
- 健康检查
- 自动部署 (Webhook)
- 备份和恢复
- 故障排除

### 🐳 Docker Compose 指南
**文件：** `DOKPLOY_DOCKER_COMPOSE.md`
- docker-compose 部署方式
- 与 Dokploy 集成
- 容器编排
- 数据备份

### 💾 卷挂载和备份
**文件：** `DOKPLOY_VOLUMES_SETUP.md`
- 命名卷配置
- Dokploy UI 操作步骤
- 备份策略
- 数据恢复
- 卷迁移
- 监控卷大小

### 📋 汇总文档
**文件：** `DOKPLOY_SUMMARY.md`
- 两种部署方案对比
- 快速参考
- 部署流程图
- 检查清单

### ⚙️ 配置文件
**文件：** `dokploy.json`
- 应用配置样本
- 资源限制
- 健康检查设置

---

## 🎯 我应该读哪个文档？

### 我想快速部署应用
👉 **读这个：** `DOKPLOY_QUICK_START.md`
- 5 分钟上手
- 简明扼要

### 我是初次使用 Dokploy
👉 **读这个：** `DOKPLOY_SUMMARY.md`
- 了解两种方案
- 快速开始部分详细说明

### 我需要完整的部署指南
👉 **读这个：** `DOKPLOY_DEPLOYMENT.md`
- 所有配置项说明
- 高级功能
- 监控和日志

### 我想用 docker-compose
👉 **读这个：** `DOKPLOY_DOCKER_COMPOSE.md`
- docker-compose 语法
- 本地测试
- 服务器部署

### 我需要管理数据卷
👉 **读这个：** `DOKPLOY_VOLUMES_SETUP.md`
- 卷配置方式
- 备份恢复
- 故障排除

### 我需要一个配置样本
👉 **看这个：** `dokploy.json`

---

## ⚡ 核心概念速查

### 两种部署方式

| 方面 | 选项 A: Dockerfile | 选项 B: docker-compose |
|------|------------------|----------------------|
| 使用 Dokploy UI | ✅ | ❌ |
| 自动处理卷 | ✅ | ❌ |
| 需要 SSH 访问 | ❌ | ✅ |
| 适合初学者 | ✅ | ❌ |
| 推荐使用 | ✅✅✅ | 备选 |

### 关键环境变量

```
WORKEY_DATA=/app/data         # 数据存储目录
WORKEY_DB=/app/data/workey.db # 数据库文件（可选）
```

### 关键卷挂载

```
挂载点: /app/data
卷类型: Named Volume（推荐）
```

### 应用端口

```
内部端口: 8000
外部访问: 通过你的域名（Dokploy 反向代理）
```

---

## 📋 部署检查清单

### 部署前
- [ ] GitHub 仓库已创建
- [ ] 代码已提交并推送
- [ ] Dockerfile 正确
- [ ] 环境配置正确

### Dokploy UI 配置
- [ ] 创建新应用
- [ ] 连接 GitHub
- [ ] Build Type: Dockerfile
- [ ] 设置环境变量
- [ ] 配置卷挂载
- [ ] 端口: 8000

### 部署后验证
- [ ] 应用成功启动
- [ ] 可以访问（https://domain）
- [ ] 卷已挂载
- [ ] 数据库正常
- [ ] 上传文件功能正常

---

## 🔧 常见任务快速解决

### 我想...

**查看应用日志**
```bash
# Dokploy UI: 应用 → Logs
# 或命令行: docker logs workey -f
```

**查看卷中的数据**
```bash
docker exec workey ls -la /app/data
```

**备份数据**
```bash
docker run --rm -v workey-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/backup.tar.gz -C /data .
```

**更新应用**
```bash
git push origin main
# Dokploy 自动部署（如果启用 Webhook）
# 或手动: Dokploy UI → Redeploy
```

**查看卷大小**
```bash
docker run --rm -v workey-data:/data alpine du -sh /data
```

**访问数据库**
```bash
docker exec workey sqlite3 /app/data/workey.db
```

---

## 🐛 故障排除快速表

| 症状 | 原因 | 解决方案 |
|------|------|--------|
| 数据库打不开 | 卷未挂载 | 检查 Dokploy 卷配置 |
| 文件上传后消失 | 卷未挂载 | 确保 /app/data 卷已创建 |
| 容器无法启动 | 配置错误 | 查看日志找错误 |
| 构建失败 | 依赖问题 | 检查 Node.js 和 Go 依赖 |
| 无法访问应用 | 域名/反向代理 | 检查 Dokploy 反向代理配置 |

---

## 📞 获取帮助

**Dokploy 官网**
- https://dokploy.com
- 文档：https://dokploy.com/docs
- 社区：https://discord.com/invite/dokploy

**Docker 文档**
- 卷：https://docs.docker.com/storage/volumes/
- Compose：https://docs.docker.com/compose/

**项目相关**
- GitHub: [项目地址]
- Issues: [问题跟踪]

---

## 💡 关键理解点

### 1. Dokploy 是什么？
一个开源的、自托管的部署平台（类似 Vercel/Heroku），但运行在你自己的服务器上。

### 2. 为什么要用卷？
SQLite 数据库和上传文件需要持久化存储。卷确保容器重启后数据不丢失。

### 3. 命名卷如何工作？
```
Docker 管理卷 → 存储在 /var/lib/docker/volumes/
容器与卷连接 → 应用读写卷中的文件
容器删除 → 卷保留（数据不丢失）
```

### 4. Dockerfile 多阶段构建做什么？
```
Stage 1: 构建前端（Node.js）
Stage 2: 编译后端（Go）
Stage 3: 创建最小运行镜像（Alpine）
结果: ~50MB 的优化镜像
```

### 5. 何时选择 docker-compose？
- 需要编排多个服务（如数据库容器）
- 本地开发测试
- 完全脚本自动化

---

## 🚀 立即开始

1. **阅读快速开始：** `DOKPLOY_QUICK_START.md`
2. **按步骤配置：** 按照快速开始中的 6 个步骤
3. **部署：** 点击 Deploy 按钮
4. **完成！** 等待部署完成，访问你的应用

---

**最后提醒：** 选择**选项 A（Dockerfile + Dokploy UI）**是最简单最推荐的方式！

有问题？查看对应的文档或 Dokploy 官方文档。

祝部署顺利！🎉
