# Dokploy 快速开始

## 5 分钟部署

### Step 1: 准备仓库
```bash
# 确保代码已推送到 Git
git push origin main
```

### Step 2: 登录 Dokploy
访问你的 Dokploy 实例仪表板

### Step 3: 创建应用
```
仪表板 → Create Application → Connect Repository
├─ Git Provider: GitHub/GitLab/etc
├─ Repository: your-org/workey
├─ Branch: main
└─ Click "Create"
```

### Step 4: 配置
在应用设置中：

**Environment Variables:**
```
WORKEY_DATA=/app/data
```

**Volumes:**
```
Mount: /app/data
```

**Port:** `8000`

### Step 5: 部署
点击 "Deploy" 按钮

### Step 6: 访问应用
```
https://your-domain.com
```

---

## 配置清单

- [ ] Git 仓库已连接
- [ ] 环境变量已设置 (`WORKEY_DATA=/app/data`)
- [ ] 持久化卷已配置 (`/app/data`)
- [ ] 端口配置为 `8000`
- [ ] 健康检查路径设置为 `/`
- [ ] 域名已配置
- [ ] SSL 证书已启用（推荐）

---

## 监控

部署后查看：

**日志：** 应用 → Logs
**监控：** 应用 → Metrics
**状态：** 应用 → Status

---

## 常见问题

**Q: 数据库文件丢失**
A: 确保 `/app/data` 卷已挂载且有读写权限

**Q: 前端不显示**
A: 检查构建日志，确保 Node.js 依赖正确安装

**Q: 连接超时**
A: 检查防火墙和网络配置，确保端口 8000 可访问

---

## 更新应用

```bash
# 1. 本地推送新代码
git push origin main

# 2. 在 Dokploy 点击 "Redeploy"
# 或配置自动部署 webhook
```

---

## 需要帮助？

- 📚 [Dokploy 文档](https://dokploy.com/docs)
- 💬 [Dokploy 社区](https://discord.com/invite/dokploy)
- 🐛 [问题报告](https://github.com/dokploy/dokploy/issues)
