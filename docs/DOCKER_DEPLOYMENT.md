# Video AI 项目 Docker 部署指南

## 项目概述

Video AI 是一个基于 AI 的视频处理应用，采用现代化的全栈架构：

- **前端**: Next.js 15.3.3 + React 19 + Tailwind CSS 4 + FFmpeg.wasm
- **后端**: FastAPI + Python 3.11 + Google Gemini API
- **架构**: Monorepo 结构，容器化部署

## 技术架构分析

### 前端技术栈
- **Next.js**: 使用最新的 App Router 和 Server Components
- **FFmpeg.wasm**: 在浏览器端进行视频处理，无需服务器端 FFmpeg
- **Tailwind CSS**: 现代化的 CSS 框架
- **TypeScript**: 类型安全的 JavaScript

### 后端技术栈
- **FastAPI**: 高性能的 Python Web 框架
- **Google Gemini API**: AI 视频分析和处理
- **Uvicorn**: ASGI 服务器
- **异步处理**: 支持流式响应和进度跟踪

### Docker 化设计决策

#### 1. 多阶段构建
- **前端**: 依赖安装 → 构建 → 生产运行
- **后端**: 基础环境 → 依赖安装 → 生产运行
- **优势**: 减少镜像大小，提高安全性

#### 2. 安全配置
- 使用非 root 用户运行容器
- 最小化系统依赖
- 环境变量管理敏感信息

#### 3. 性能优化
- 依赖缓存优化
- 健康检查配置
- 资源限制设置

## 快速开始

### 1. 环境准备

```bash
# 克隆项目
git clone <your-repository-url>
cd video-ai

# 初始化环境
make setup
```

### 2. 配置环境变量

编辑项目根目录的 `.env` 文件：
```bash
# 必需配置
GOOGLE_API_KEY="your_google_api_key_here"

# 可选配置（已有默认值）
NODE_ENV=development
FRONTEND_PORT=3002
BACKEND_PORT=8002
```

**重要**: 请确保将 `your_google_api_key_here` 替换为您的实际 Google Gemini API 密钥。

### 3. 启动服务

```bash
# 使用 Make 命令（推荐）
make start

# 或使用脚本
./scripts/docker.sh start

# 或使用 Docker Compose
docker-compose up -d
```

### 4. 访问应用

- 前端: http://localhost:3002
- 后端: http://localhost:8002
- 后端文档: http://localhost:8002/docs

## 服务管理

### 统一环境配置

**特点**:
- 简化的配置管理
- 统一的环境变量
- 容器化部署
- 自动健康检查

**启动命令**:
```bash
make start
```

**服务访问**:
- 前端: http://localhost:3002
- 后端: http://localhost:8002
- 后端文档: http://localhost:8002/docs

## 常用命令

### 服务管理
```bash
make start         # 启动服务
make stop          # 停止服务
make restart       # 重启服务
make build         # 重新构建镜像
make logs          # 查看日志
make status        # 查看服务状态
make clean         # 清理环境
```

### 容器操作
```bash
# 进入容器 shell
make shell-frontend
make shell-backend

# 查看容器状态
docker-compose ps

# 查看资源使用
docker stats
```

## 环境配置详解

### 环境变量说明

| 变量名 | 说明 | 必需 | 默认值 |
|--------|------|------|--------|
| `GOOGLE_API_KEY` | Google Gemini API 密钥 | 是 | - |
| `NODE_ENV` | 应用环境 | 否 | development |
| `FRONTEND_PORT` | 前端端口 | 否 | 3002 |
| `BACKEND_PORT` | 后端端口 | 否 | 8002 |
| `WORKERS` | 后端工作进程数 | 否 | 2 |
| `MAX_FILE_SIZE` | 最大文件大小 | 否 | 104857600 |

### 配置文件说明

- `.env.example`: 环境变量模板
- `.env.development`: 开发环境配置
- `.env.production`: 生产环境配置模板

## 故障排除

### 常见问题

1. **容器启动失败**
   ```bash
   # 查看详细日志
   make dev-logs
   
   # 检查容器状态
   docker-compose -f docker-compose.dev.yml ps
   ```

2. **API 密钥错误**
   ```bash
   # 检查环境变量
   docker-compose -f docker-compose.dev.yml exec backend-dev env | grep GOOGLE
   ```

3. **端口冲突**
   ```bash
   # 检查端口占用
   lsof -i :3002
   lsof -i :8002
   ```

4. **文件上传失败**
   ```bash
   # 检查临时目录权限
   docker-compose -f docker-compose.dev.yml exec backend-dev ls -la /app/temp
   ```

### 日志查看

```bash
# 查看所有服务日志
make dev-logs

# 查看特定服务日志
docker-compose -f docker-compose.dev.yml logs -f frontend-dev
docker-compose -f docker-compose.dev.yml logs -f backend-dev

# 查看最近的日志
docker-compose -f docker-compose.dev.yml logs --tail=100
```

### 性能监控

```bash
# 查看容器资源使用
docker stats

# 查看系统资源
htop

# 查看磁盘使用
df -h
```

## 安全注意事项

1. **环境变量安全**
   - 不要将 `.env` 文件提交到版本控制
   - 生产环境使用密钥管理服务
   - 定期轮换 API 密钥

2. **容器安全**
   - 使用非 root 用户运行
   - 定期更新基础镜像
   - 限制容器资源使用

3. **网络安全**
   - 配置适当的 CORS 策略
   - 使用 HTTPS（生产环境）
   - 限制文件上传大小

## 维护和更新

### 镜像更新
```bash
# 重新构建镜像
make dev-build

# 清理旧镜像
docker image prune -f
```

### 数据备份
```bash
# 备份配置和日志
make prod-backup

# 手动备份
cp -r logs backups/$(date +%Y%m%d_%H%M%S)/
```

### 版本升级
```bash
# 拉取最新代码
git pull origin main

# 重新部署
make prod-deploy
```

## 技术特性详解

### FFmpeg.wasm 集成
- **浏览器端处理**: 所有视频处理在客户端完成
- **无服务器依赖**: 不需要在 Docker 容器中安装 FFmpeg
- **跨平台兼容**: 支持所有现代浏览器
- **内存优化**: 使用 SharedArrayBuffer 提高性能

### AI 视频分析
- **Google Gemini 集成**: 先进的多模态 AI 模型
- **流式响应**: 实时显示 AI 分析进度
- **智能字幕生成**: 自动生成中文字幕
- **自然语言指令**: 支持中文视频编辑指令

### 容器化优势
- **环境一致性**: 开发、测试、生产环境完全一致
- **快速部署**: 一键部署到任何支持 Docker 的环境
- **资源隔离**: 服务间完全隔离，提高稳定性
- **水平扩展**: 支持多实例负载均衡

## 最佳实践建议

### 开发流程
1. 使用开发环境进行功能开发
2. 定期运行健康检查
3. 监控容器资源使用情况
4. 及时清理无用的镜像和容器

### 生产部署
1. 使用专用的生产环境配置
2. 配置适当的资源限制
3. 设置监控和告警
4. 定期备份重要数据

### 安全管理
1. 定期更新依赖包
2. 使用最新的基础镜像
3. 配置防火墙规则
4. 监控异常访问
