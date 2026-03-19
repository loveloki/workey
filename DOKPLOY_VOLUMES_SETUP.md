# Dokploy 卷挂载配置指南

Dokploy 使用 Docker 命名卷（named volumes）来持久化数据。这是在 Dokploy UI 中配置的方式。

## 快速配置

### 1. 在应用设置中配置卷

**路径：** 应用详情 → Settings → Volumes

点击 "Add Volume" 添加：

```
Mount Path:  /app/data
Volume Name: workey-data (自动生成或自定义)
Volume Type: Named Volume
```

### 2. 创建一个卷用于上传文件（可选但推荐）

```
Mount Path:  /app/data/uploads
Volume Name: workey-uploads
Volume Type: Named Volume
```

完成！Dokploy 会自动：
- 创建 Docker 命名卷
- 挂载到容器的指定路径
- 在容器重启时保留数据

---

## 理解卷类型

### Named Volume（命名卷）✅ 推荐
```
特点:
- Docker 管理存储
- 数据存储在 /var/lib/docker/volumes/
- 容器间可共享
- 备份和迁移相对容易
- 性能好
```

**用途：** 生产环境，数据库，上传文件

### Bind Mount（绑定挂载）
```
特点:
- 直接挂载主机目录
- 数据存储在主机任意位置
- 需要手动管理权限
- 性能可能受主机文件系统影响
```

**用途：** 开发环境，需要直接访问文件的场景

---

## Dokploy UI 中的卷配置步骤

### Step 1: 打开应用设置

```
Dokploy Dashboard
  └─ Projects
      └─ Your Project
          └─ Applications
              └─ workey
                  └─ Settings
                      └─ Volumes
```

### Step 2: 添加数据卷

点击 "Add Volume" 按钮：

| 字段 | 值 |
|------|-----|
| **Mount Path** | `/app/data` |
| **Volume Name** | `workey-data` |
| **Volume Type** | Named Volume |

点击 "Create"

### Step 3: 验证配置

部署应用后：
```bash
# 在 Dokploy 主机上验证
docker volume ls | grep workey-data
docker volume inspect workey-data
```

### 可选：为上传文件创建独立卷

```
Mount Path:  /app/data/uploads
Volume Name: workey-uploads
Volume Type: Named Volume
```

---

## 卷的数据结构

部署后，卷内的目录结构：

```
/app/data/
├── workey.db              # SQLite 数据库
├── workey.db-shm         # SQLite WAL 共享内存
├── workey.db-wal         # SQLite WAL 日志
├── .jwt_secret           # JWT 密钥（自动生成）
└── uploads/              # 上传文件
    ├── file1.pdf
    ├── file2.zip
    └── ...
```

---

## 访问卷中的数据

### 通过 Docker

```bash
# 进入容器查看卷中的数据
docker exec workey ls -la /app/data

# 从卷复制文件到主机
docker cp workey:/app/data/workey.db ./workey-backup.db
```

### 直接访问卷（在 Dokploy 主机上）

```bash
# 查看卷的实际位置
docker volume inspect workey-data

# 通过临时容器访问
docker run --rm -it -v workey-data:/data alpine ls -la /data
```

---

## 备份策略

### 方式 1: 使用 Docker 卷备份命令

```bash
#!/bin/bash
# backup.sh

VOLUME_NAME="workey-data"
BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 创建备份
docker run --rm -v ${VOLUME_NAME}:/data \
  -v ${BACKUP_DIR}:/backup \
  alpine tar czf /backup/workey-${TIMESTAMP}.tar.gz -C /data .

echo "Backup completed: workey-${TIMESTAMP}.tar.gz"
```

### 方式 2: 定期备份（cron）

```bash
# 每天 2:00 AM 备份
0 2 * * * /opt/scripts/backup.sh
```

### 方式 3: 从 Dokploy 内部备份

在 Dokploy 应用中添加一个备份脚本任务（如果支持）。

---

## 恢复数据

### 从备份恢复

```bash
#!/bin/bash
# restore.sh

VOLUME_NAME="workey-data"
BACKUP_FILE="/backups/workey-20240315_120000.tar.gz"

# 停止应用
docker stop workey

# 清空卷（警告：不可恢复）
docker run --rm -v ${VOLUME_NAME}:/data \
  alpine rm -rf /data/*

# 恢复备份
docker run --rm -v ${VOLUME_NAME}:/data \
  -v $(dirname ${BACKUP_FILE}):/backup \
  alpine tar xzf /backup/$(basename ${BACKUP_FILE}) -C /data

# 启动应用
docker start workey

echo "Data restored from ${BACKUP_FILE}"
```

---

## 卷迁移

### 从一个 Dokploy 实例迁移到另一个

```bash
# 在源服务器上
docker run --rm -v workey-data:/data \
  -v /tmp:/backup \
  alpine tar czf /backup/workey-data.tar.gz -C /data .

# 传输备份文件
scp user@source-server:/tmp/workey-data.tar.gz ./

# 在目标服务器上
docker volume create workey-data

docker run --rm -v workey-data:/data \
  -v /tmp:/backup \
  alpine tar xzf /backup/workey-data.tar.gz -C /data
```

---

## 监控卷大小

```bash
# 查看单个卷大小
docker run --rm -v workey-data:/data \
  alpine du -sh /data

# 定期检查
watch "docker run --rm -v workey-data:/data alpine du -sh /data"
```

---

## 常见问题

### Q: 如何在 Dokploy UI 中删除卷？

A: 
1. 应用详情 → Volumes
2. 找到卷
3. 点击删除按钮（⚠️ 警告：会永久删除数据）
4. 确认删除

### Q: 卷和容器是独立的吗？

A: 是的。即使删除或重新部署应用，命名卷中的数据仍然存在。

### Q: 如何共享卷给多个应用？

A: 在 Dokploy 中，多个应用可以挂载同一个卷，但 SQLite 不支持多进程访问。如果需要，使用 PostgreSQL 等。

### Q: 卷会占用多少存储空间？

A: 取决于：
- 数据库大小（workey.db）
- 上传文件大小
- 日志大小

定期检查：
```bash
docker volume inspect workey-data
du -sh /var/lib/docker/volumes/workey-data/_data
```

### Q: 如何清理卷中的临时文件？

A:
```bash
# 进入卷
docker run --rm -it -v workey-data:/data alpine

# 删除临时文件
rm -rf /data/uploads/temp/*
exit
```

---

## 生产环境最佳实践

1. **定期备份**
   - 每天自动备份
   - 异地存储备份（S3、NAS 等）

2. **监控卷大小**
   - 定期检查磁盘使用率
   - 实施清理策略（删除旧上传文件等）

3. **权限管理**
   - 确保容器有正确的文件权限
   - 定期审计访问日志

4. **多副本场景**
   - SQLite 不支持分布式，考虑迁移到 PostgreSQL
   - 使用共享存储（NFS、S3）

5. **故障恢复**
   - 保留 3-5 个备份版本
   - 定期测试恢复流程

---

## 相关命令速查表

```bash
# 卷管理
docker volume ls                           # 列出所有卷
docker volume inspect workey-data          # 查看卷详情
docker volume rm workey-data              # 删除卷（⚠️ 谨慎）

# 数据操作
docker exec workey ls -la /app/data       # 列出卷中文件
docker cp workey:/app/data ./backup       # 复制卷中文件
docker run -v workey-data:/data alpine du -sh /data  # 查看卷大小

# 备份恢复
docker run -v workey-data:/data -v $(pwd):/backup alpine tar czf /backup/backup.tar.gz -C /data .
docker run -v workey-data:/data -v $(pwd):/backup alpine tar xzf /backup/backup.tar.gz -C /data
```

---

## 支持

- [Docker Volumes 官网](https://docs.docker.com/storage/volumes/)
- [Dokploy 文档](https://dokploy.com/docs)
- [Docker 最佳实践](https://docs.docker.com/develop/dev-best-practices/)
