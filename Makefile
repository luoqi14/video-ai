# Video AI 项目 Makefile
# 提供便捷的 Docker 管理命令

.PHONY: help start stop restart build logs clean status shell setup

# 默认目标
help:
	@echo "Video AI 项目管理命令"
	@echo ""
	@echo "服务管理:"
	@echo "  make start        启动服务"
	@echo "  make stop         停止服务"
	@echo "  make restart      重启服务"
	@echo "  make build        重新构建镜像"
	@echo "  make logs         查看日志"
	@echo "  make status       查看服务状态"
	@echo "  make clean        清理环境"
	@echo "  make shell        进入容器shell"
	@echo ""
	@echo "其他:"
	@echo "  make setup        初始化项目环境"
	@echo "  make help         显示此帮助信息"

# 初始化项目环境
setup:
	@echo "初始化 Video AI 项目环境..."
	@chmod +x scripts/docker.sh
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "已创建 .env 文件，请编辑并填入正确的 GOOGLE_API_KEY"; \
		echo "获取API密钥: https://ai.google.dev/"; \
	fi
	@echo "环境初始化完成！"

# 服务管理命令
start:
	@./scripts/docker.sh start

stop:
	@./scripts/docker.sh stop

restart:
	@./scripts/docker.sh restart

build:
	@echo "重新构建镜像..."
	@docker compose build --no-cache --parallel

logs:
	@./scripts/docker.sh logs

status:
	@./scripts/docker.sh status

clean:
	@./scripts/docker.sh clean

shell-frontend:
	@./scripts/docker.sh shell frontend

shell-backend:
	@./scripts/docker.sh shell backend

# 快速别名
shell: shell-frontend
