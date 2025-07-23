# 前端 Dockerfile - Next.js 应用
# 使用多阶段构建来优化镜像大小和安全性

# 阶段1: 依赖安装
FROM node:20-alpine AS deps
LABEL maintainer="Video AI Team"
LABEL description="Next.js frontend for Video AI application"

# 安装必要的系统依赖
RUN apk add --no-cache libc6-compat

# 设置工作目录
WORKDIR /app

# 复制包管理文件
COPY package*.json ./

# 安装所有依赖（构建时需要）
RUN npm ci && npm cache clean --force

# 阶段2: 构建应用
FROM node:20-alpine AS builder
WORKDIR /app

# 从deps阶段复制node_modules
COPY --from=deps /app/node_modules ./node_modules

# 复制源代码
COPY . .

# 尝试复制根目录的 .env 文件（如果存在）
RUN if [ -f "../.env" ]; then cp ../.env .env; else echo "No .env file found in parent directory"; fi

# 设置构建环境变量
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 接收构建参数
ARG NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

# 构建应用
RUN npm run build

# 阶段3: 生产运行
FROM node:20-alpine AS runner
WORKDIR /app

# 创建非root用户以提高安全性
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 设置环境变量
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002

# 复制必要的文件
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# 复制构建输出
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 切换到非root用户
USER nextjs

# 暴露端口
EXPOSE 3002

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js || exit 1

# 启动应用
CMD ["node", "server.js"]
