# Video AI 项目运维指南

## 系统监控

### 容器健康状态监控

```bash
# 查看所有容器状态
docker ps -a

# 查看特定服务健康状态
docker-compose -f docker-compose.prod.yml ps

# 实时监控资源使用
docker stats --no-stream
```

### 应用健康检查

```bash
# 前端健康检查
curl -f http://localhost:3002/

# 后端健康检查
curl -f http://localhost:8002/

# 使用脚本进行全面检查
./scripts/docker-prod.sh health
```

### 日志监控

```bash
# 查看实时日志
make prod-logs

# 查看错误日志
docker-compose -f docker-compose.prod.yml logs | grep ERROR

# 查看特定时间段日志
docker-compose -f docker-compose.prod.yml logs --since="2024-01-01T00:00:00"
```

## 性能优化

### 容器资源配置

**开发环境资源配置**:
```yaml
deploy:
  resources:
    limits:
      cpus: '0.5'
      memory: 256M
    reservations:
      cpus: '0.25'
      memory: 128M
```

**生产环境资源配置**:
```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 1G
    reservations:
      cpus: '1.0'
      memory: 512M
```

### 性能调优建议

1. **前端优化**
   - 启用 gzip 压缩
   - 配置静态资源缓存
   - 使用 CDN 加速

2. **后端优化**
   - 调整 worker 进程数
   - 配置连接池
   - 启用异步处理

3. **Docker 优化**
   - 使用多阶段构建
   - 优化镜像层
   - 配置适当的资源限制

## 备份和恢复

### 数据备份策略

```bash
# 自动备份脚本
#!/bin/bash
BACKUP_DIR="/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# 备份配置文件
cp .env.production "$BACKUP_DIR/"
cp docker-compose.prod.yml "$BACKUP_DIR/"

# 备份日志文件
if [ -d "logs" ]; then
    tar -czf "$BACKUP_DIR/logs.tar.gz" logs/
fi

# 备份数据卷
docker run --rm -v video-ai-temp-prod:/data -v "$BACKUP_DIR":/backup alpine tar -czf /backup/volumes.tar.gz -C /data .

echo "备份完成: $BACKUP_DIR"
```

### 恢复流程

```bash
# 1. 停止服务
make prod-stop

# 2. 恢复配置文件
cp /backups/20240101_120000/.env.production ./

# 3. 恢复数据卷
docker run --rm -v video-ai-temp-prod:/data -v /backups/20240101_120000:/backup alpine tar -xzf /backup/volumes.tar.gz -C /data

# 4. 重启服务
make prod-start
```

## 故障处理

### 常见故障及解决方案

#### 1. 容器启动失败

**症状**: 容器无法启动或立即退出

**排查步骤**:
```bash
# 查看容器日志
docker-compose -f docker-compose.prod.yml logs [service_name]

# 检查配置文件
docker-compose -f docker-compose.prod.yml config

# 验证环境变量
docker-compose -f docker-compose.prod.yml exec [service_name] env
```

**常见原因**:
- 环境变量配置错误
- 端口冲突
- 资源不足
- 镜像构建失败

#### 2. API 连接失败

**症状**: 前端无法连接后端 API

**排查步骤**:
```bash
# 检查网络连接
docker network ls
docker network inspect video-ai-prod-network

# 测试服务间连接
docker-compose -f docker-compose.prod.yml exec frontend curl http://backend:8002/

# 检查防火墙设置
iptables -L
```

#### 3. 内存不足

**症状**: 容器被 OOM Killer 终止

**排查步骤**:
```bash
# 查看系统内存使用
free -h

# 查看容器内存使用
docker stats

# 检查 OOM 日志
dmesg | grep -i "killed process"
```

**解决方案**:
- 增加系统内存
- 调整容器内存限制
- 优化应用内存使用

#### 4. 磁盘空间不足

**症状**: 容器无法写入文件

**排查步骤**:
```bash
# 检查磁盘使用
df -h

# 查看 Docker 空间使用
docker system df

# 清理无用资源
docker system prune -f
```

### 紧急恢复流程

```bash
# 1. 立即停止所有服务
docker-compose -f docker-compose.prod.yml down

# 2. 检查系统资源
free -h
df -h

# 3. 清理临时文件
docker system prune -f
docker volume prune -f

# 4. 从最近备份恢复
./scripts/restore-backup.sh /backups/latest

# 5. 重启服务
make prod-start

# 6. 验证服务状态
make prod-health
```

## 安全管理

### 安全检查清单

- [ ] 定期更新基础镜像
- [ ] 扫描镜像安全漏洞
- [ ] 检查容器权限配置
- [ ] 验证网络安全策略
- [ ] 审查环境变量配置
- [ ] 监控异常访问日志

### 安全加固措施

```bash
# 1. 镜像安全扫描
docker scan video-ai-frontend:latest
docker scan video-ai-backend:latest

# 2. 容器权限检查
docker inspect video-ai-frontend-prod | grep -i user
docker inspect video-ai-backend-prod | grep -i user

# 3. 网络安全配置
docker network inspect video-ai-prod-network

# 4. 文件权限检查
docker-compose -f docker-compose.prod.yml exec backend ls -la /app
```

## 监控告警

### 关键指标监控

1. **系统指标**
   - CPU 使用率 > 80%
   - 内存使用率 > 85%
   - 磁盘使用率 > 90%

2. **应用指标**
   - 响应时间 > 5s
   - 错误率 > 5%
   - 并发连接数

3. **容器指标**
   - 容器重启次数
   - 健康检查失败
   - 资源限制触发

### 告警配置示例

```bash
# 使用 crontab 定期检查
*/5 * * * * /path/to/health-check.sh

# health-check.sh 内容
#!/bin/bash
if ! curl -f http://localhost:3002/ > /dev/null 2>&1; then
    echo "前端服务异常" | mail -s "Video AI 告警" admin@example.com
fi

if ! curl -f http://localhost:8002/ > /dev/null 2>&1; then
    echo "后端服务异常" | mail -s "Video AI 告警" admin@example.com
fi
```

## 维护计划

### 日常维护任务

- 检查服务状态
- 查看错误日志
- 监控资源使用
- 清理临时文件

### 周期性维护任务

**每周**:
- 备份重要数据
- 检查安全更新
- 分析性能指标

**每月**:
- 更新依赖包
- 清理旧日志文件
- 审查安全配置

**每季度**:
- 更新基础镜像
- 性能压力测试
- 灾难恢复演练
