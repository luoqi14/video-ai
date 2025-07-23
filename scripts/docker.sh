#!/bin/bash
# Video AI Docker 管理脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目名称
PROJECT_NAME="video-ai"

# 显示帮助信息
show_help() {
    echo -e "${BLUE}Video AI Docker 管理脚本${NC}"
    echo ""
    echo "用法: $0 [命令]"
    echo ""
    echo "可用命令:"
    echo "  start     启动服务"
    echo "  stop      停止服务"
    echo "  restart   重启服务"
    echo "  build     重新构建镜像"
    echo "  logs      查看日志"
    echo "  status    查看服务状态"
    echo "  clean     清理容器和镜像"
    echo "  shell     进入容器shell"
    echo "  help      显示此帮助信息"
    echo ""
}

# 检查环境变量文件
check_env() {
    if [ ! -f .env ]; then
        echo -e "${YELLOW}警告: .env 文件不存在，正在从模板创建...${NC}"
        cp .env.example .env
        echo -e "${RED}请编辑 .env 文件并填入正确的 GOOGLE_API_KEY${NC}"
        exit 1
    fi
}

# 启动服务
start_service() {
    echo -e "${GREEN}启动 Video AI 服务...${NC}"
    check_env
    docker-compose up -d
    echo -e "${GREEN}服务已启动！${NC}"
    echo -e "前端: ${BLUE}http://localhost:3002${NC}"
    echo -e "后端: ${BLUE}http://localhost:8002${NC}"
}

# 停止服务
stop_service() {
    echo -e "${YELLOW}停止 Video AI 服务...${NC}"
    docker-compose down
    echo -e "${GREEN}服务已停止${NC}"
}

# 重启服务
restart_service() {
    echo -e "${YELLOW}重启 Video AI 服务...${NC}"
    stop_service
    start_service
}

# 重新构建镜像
build_service() {
    echo -e "${BLUE}重新构建镜像...${NC}"
    docker-compose build --no-cache
    echo -e "${GREEN}镜像构建完成${NC}"
}

# 查看日志
show_logs() {
    if [ -z "$2" ]; then
        docker-compose logs -f
    else
        docker-compose logs -f "$2"
    fi
}

# 查看服务状态
show_status() {
    echo -e "${BLUE}Video AI 服务状态:${NC}"
    docker-compose ps
}

# 清理容器和镜像
clean_service() {
    echo -e "${YELLOW}清理 Video AI 环境...${NC}"
    docker-compose down -v --rmi all
    docker system prune -f
    echo -e "${GREEN}清理完成${NC}"
}

# 进入容器shell
enter_shell() {
    if [ -z "$2" ]; then
        echo -e "${YELLOW}请指定服务名称: frontend 或 backend${NC}"
        exit 1
    fi
    docker-compose exec "$2" /bin/sh
}

# 主逻辑
case "$1" in
    start)
        start_service
        ;;
    stop)
        stop_service
        ;;
    restart)
        restart_service
        ;;
    build)
        build_service
        ;;
    logs)
        show_logs "$@"
        ;;
    status)
        show_status
        ;;
    clean)
        clean_service
        ;;
    shell)
        enter_shell "$@"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}未知命令: $1${NC}"
        show_help
        exit 1
        ;;
esac
