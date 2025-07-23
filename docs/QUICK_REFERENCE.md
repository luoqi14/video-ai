# Video AI Docker 快速参考

## 🚀 快速启动

```bash
# 1. 克隆项目
git clone <repository-url>
cd video-ai

# 2. 初始化环境
make setup

# 3. 配置 API 密钥
# 编辑项目根目录的 .env 文件，设置 GOOGLE_API_KEY="your_api_key"

# 4. 启动服务
make start

# 5. 访问应用
# 前端: http://localhost:3002
# 后端: http://localhost:8002
```

## 📋 常用命令

### 服务管理
```bash
make start          # 启动服务
make stop           # 停止服务
make restart        # 重启服务
make build          # 重新构建镜像
make logs           # 查看日志
make status         # 查看服务状态
make clean          # 清理环境
```

### Docker Compose 原生命令
```bash
docker compose up -d        # 启动服务
docker compose down         # 停止服务
docker compose logs -f      # 查看日志
docker compose ps           # 查看状态
```

## 🔧 故障排除

### 容器无法启动
```bash
# 查看详细日志
make logs

# 检查配置
docker compose config

# 重新构建
make dev-build
```

### API 连接失败
```bash
# 检查后端状态
curl http://localhost:8002/

# 查看后端日志
docker compose logs backend

# 检查环境变量
docker compose exec backend env | grep GOOGLE
```

### 端口冲突
```bash
# 检查端口占用
lsof -i :3002
lsof -i :8002

# 修改端口配置
# 编辑 .env 文件中的 FRONTEND_PORT 和 BACKEND_PORT
```

## 📁 项目结构

```
video-ai/
├── frontend/                 # Next.js 前端
│   ├── Dockerfile           # 生产环境镜像
│   ├── Dockerfile.dev       # 开发环境镜像
│   ├── .dockerignore        # Docker 忽略文件
│   └── healthcheck.js       # 健康检查脚本
├── backend/                 # FastAPI 后端
│   ├── Dockerfile           # 生产环境镜像
│   ├── Dockerfile.dev       # 开发环境镜像
│   ├── .dockerignore        # Docker 忽略文件
│   └── main.py              # 主应用文件
├── scripts/                 # 管理脚本
│   └── docker.sh            # Docker管理脚本
├── docs/                    # 文档目录
├── docker-compose.yml       # 服务编排文件
├── .env.example             # 环境变量模板
├── .dockerignore            # 全局 Docker 忽略
└── Makefile                 # 便捷命令
```

## 🌐 端口配置

| 服务 | 开发端口 | 生产端口 | 调试端口 |
|------|----------|----------|----------|
| 前端 | 3002 | 3002 | 9229 |
| 后端 | 8002 | 8002 | 5678 |

## 📊 环境变量

### 必需变量
```bash
GOOGLE_API_KEY="your_api_key_here"
```

### 可选变量
```bash
NODE_ENV=development
FRONTEND_PORT=3002
BACKEND_PORT=8002
WORKERS=2
MAX_FILE_SIZE=104857600
```

## 🔍 调试技巧

### 进入容器
```bash
# 前端容器
make shell-frontend

# 后端容器
make shell-backend

# 或使用 Docker Compose
docker compose exec frontend /bin/sh
docker compose exec backend /bin/bash
```

### 查看日志
```bash
# 所有服务日志
make logs

# 特定服务日志
docker compose logs -f frontend
docker compose logs -f backend

# 最近 100 行日志
docker compose logs --tail=100
```

### 监控资源
```bash
# 实时资源使用
docker stats

# 容器状态
docker ps -a

# 网络信息
docker network ls
docker network inspect video-ai-dev-network
```

## 🛠 维护命令

### 清理资源
```bash
# 清理开发环境
make dev-clean

# 清理 Docker 系统
docker system prune -f

# 清理无用镜像
docker image prune -f

# 清理无用卷
docker volume prune -f
```

### 更新镜像
```bash
# 重新构建所有镜像
make dev-build

# 拉取最新基础镜像
docker pull node:20-alpine
docker pull python:3.11-slim
```

## 🔐 安全检查

```bash
# 检查容器用户
docker inspect video-ai-frontend-dev | grep -i user
docker inspect video-ai-backend-dev | grep -i user

# 扫描镜像漏洞
docker scan video-ai-frontend:latest
docker scan video-ai-backend:latest

# 检查网络配置
docker network inspect video-ai-dev-network
```

## 📈 性能优化

### 镜像优化
- 使用多阶段构建
- 最小化层数
- 使用 .dockerignore

### 运行时优化
- 设置适当的资源限制
- 配置健康检查
- 使用非 root 用户

### 网络优化
- 使用专用网络
- 配置适当的 DNS
- 启用 gzip 压缩

## 🆘 紧急处理

### 服务完全无响应
```bash
# 1. 强制停止所有容器
docker kill $(docker ps -q)

# 2. 清理资源
docker system prune -f

# 3. 重新启动
make dev-start
```

### 磁盘空间不足
```bash
# 1. 清理 Docker 资源
docker system prune -a -f

# 2. 清理日志文件
sudo truncate -s 0 /var/lib/docker/containers/*/*-json.log

# 3. 重启 Docker 服务
sudo systemctl restart docker
```

### 内存不足
```bash
# 1. 查看内存使用
free -h
docker stats

# 2. 停止非必要容器
docker stop $(docker ps -q)

# 3. 调整资源限制
# 编辑 docker-compose.yml 中的 memory 配置
```
