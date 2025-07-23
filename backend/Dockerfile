# 后端 Dockerfile - FastAPI 应用
# 使用多阶段构建来优化镜像大小和安全性

# 阶段1: 基础镜像和依赖安装
FROM python:3.11-slim AS base
LABEL maintainer="Video AI Team"
LABEL description="FastAPI backend for Video AI application"

# 设置环境变量
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 创建非root用户
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --shell /bin/bash --create-home appuser

# 设置工作目录
WORKDIR /app

# 阶段2: 依赖安装
FROM base AS deps

# 复制依赖文件
COPY requirements.txt .

# 安装Python依赖
RUN pip install --no-cache-dir -r requirements.txt

# 阶段3: 生产运行
FROM base AS runner

# 从deps阶段复制已安装的包
COPY --from=deps /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

# 复制应用代码
COPY --chown=appuser:appgroup . .

# 创建临时文件目录
RUN mkdir -p /app/temp && chown appuser:appgroup /app/temp

# 切换到非root用户
USER appuser

# 暴露端口
EXPOSE 8002

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8002/ || exit 1

# 启动命令
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "1"]
