#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 部署目录
DEPLOY_DIR="/opt/video-ai"

# 显示欢迎信息
echo -e "${GREEN}====================================${NC}"
echo -e "${GREEN}     视频AI项目一键部署脚本        ${NC}"
echo -e "${GREEN}====================================${NC}"

# 检查是否有root权限
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${YELLOW}注意: 此脚本需要root权限运行某些命令。${NC}"
    echo -e "${YELLOW}如果遇到权限问题，请使用sudo运行此脚本。${NC}"
fi

# 安装系统依赖
echo -e "${BLUE}安装系统依赖...${NC}"
sudo apt-get update
sudo apt-get install -y git nodejs npm python3 python3-pip python3-venv nginx

# 安装PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${BLUE}安装PM2...${NC}"
    sudo npm install -g pm2
fi

# 设置部署目录
DEPLOY_DIR="/opt/video-ai"
REPO_URL="https://github.com/luoqi14/video-ai.git"

# 创建部署目录
echo -e "${BLUE}创建部署目录...${NC}"
sudo mkdir -p $DEPLOY_DIR
sudo chown $USER:$USER $DEPLOY_DIR

# 克隆或更新代码
if [ -d "$DEPLOY_DIR/.git" ]; then
    echo -e "${BLUE}更新代码...${NC}"
    cd $DEPLOY_DIR
    git pull
else
    echo -e "${BLUE}克隆代码...${NC}"
    git clone $REPO_URL $DEPLOY_DIR
fi

# 创建并激活Python虚拟环境
echo -e "${BLUE}设置Python虚拟环境...${NC}"
cd $DEPLOY_DIR/backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate

# 安装Python依赖
echo -e "${BLUE}安装Python依赖...${NC}"
pip install -r requirements.txt
deactivate

# 安装前端依赖
echo -e "${BLUE}安装前端依赖...${NC}"
cd $DEPLOY_DIR
npm install
cd $DEPLOY_DIR/frontend
npm install

# 构建前端并生成静态文件
echo -e "${BLUE}构建前端并生成静态文件...${NC}"
cd $DEPLOY_DIR/frontend
npm run build

# 配置Nginx部署前端静态文件
echo -e "${BLUE}配置Nginx部署前端静态文件...${NC}"
# 创建Nginx配置文件
sudo tee /etc/nginx/sites-available/video-ai << EOL
server {
    listen 3002;
    server_name _;
    
    # 前端静态文件目录
    root $DEPLOY_DIR/frontend/out;
    index index.html;
    
    # 处理前端路由
    location / {
        try_files \$uri \$uri/ /index.html;
    }
    
    # 允许跨域请求
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS';
    add_header Access-Control-Allow-Headers 'DNT,X-CustomHeader,Keep-Alive,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type';
}
EOL

# 启用站点配置
sudo ln -sf /etc/nginx/sites-available/video-ai /etc/nginx/sites-enabled/
# 检查Nginx配置
sudo nginx -t
# 重启Nginx
sudo systemctl restart nginx

# 创建后端服务的systemd服务文件
echo -e "${BLUE}创建后端服务的systemd服务文件...${NC}"
sudo tee /etc/systemd/system/video-ai-backend.service << EOL
[Unit]
Description=Video AI Backend Service
After=network.target

[Service]
User=$USER
WorkingDirectory=$DEPLOY_DIR/backend
ExecStart=$DEPLOY_DIR/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8002
Restart=always
RestartSec=5
Environment="PATH=$DEPLOY_DIR/backend/venv/bin:/usr/local/bin:/usr/bin:/bin"

[Install]
WantedBy=multi-user.target
EOL

# 启用并启动后端服务
sudo systemctl daemon-reload
sudo systemctl enable video-ai-backend.service
sudo systemctl start video-ai-backend.service

# 确保Nginx开机自启
echo -e "${BLUE}确保Nginx开机自启...${NC}"
sudo systemctl enable nginx

# 显示服务状态
echo -e "${GREEN}服务已启动！${NC}"
sudo systemctl status nginx
sudo systemctl status video-ai-backend.service

# 显示访问地址
echo -e "${GREEN}部署完成！${NC}"
IP_ADDRESS=$(hostname -I | awk '{print $1}')
echo -e "${GREEN}您可以通过以下地址访问应用：${NC}"
echo -e "${GREEN}前端: http://$IP_ADDRESS:3002${NC}"
echo -e "${GREEN}后端API: http://$IP_ADDRESS:8002${NC}"

# 显示常用命令
echo -e "${BLUE}常用命令：${NC}"
echo -e "${YELLOW}重启Nginx: ${NC}sudo systemctl restart nginx"
echo -e "${YELLOW}查看Nginx状态: ${NC}sudo systemctl status nginx"
echo -e "${YELLOW}查看Nginx错误日志: ${NC}sudo tail -f /var/log/nginx/error.log"
echo -e "${YELLOW}重启后端: ${NC}sudo systemctl restart video-ai-backend.service"
echo -e "${YELLOW}查看后端状态: ${NC}sudo systemctl status video-ai-backend.service"
echo -e "${YELLOW}查看后端日志: ${NC}sudo journalctl -u video-ai-backend.service -f"
echo -e "${YELLOW}停止后端服务: ${NC}sudo systemctl stop video-ai-backend.service"
echo -e "${YELLOW}停止Nginx服务: ${NC}sudo systemctl stop nginx"
