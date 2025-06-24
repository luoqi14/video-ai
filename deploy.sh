#!/bin/bash

# 视频AI应用一键部署脚本
# 适用于Ubuntu/Debian系统

# 显示彩色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== 视频AI应用一键部署脚本 ===${NC}"
echo -e "${BLUE}该脚本将自动部署前端和后端服务${NC}"

# 检查必要的工具
echo -e "${BLUE}检查必要的工具...${NC}"

# 检查git
if ! command -v git &> /dev/null; then
    echo -e "${RED}Git未安装，正在安装...${NC}"
    sudo apt update
    sudo apt install -y git
fi

# 检查node
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js未安装，正在安装...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# 检查npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm未安装，正在安装...${NC}"
    sudo apt install -y npm
fi

# 检查python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Python3未安装，正在安装...${NC}"
    sudo apt install -y python3 python3-pip python3-venv
fi

# 检查pm2
if ! command -v pm2 &> /dev/null; then
    echo -e "${RED}PM2未安装，正在安装...${NC}"
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
    cd $DEPLOY_DIR
fi

# 设置环境变量文件
echo -e "${BLUE}设置环境变量...${NC}"
if [ ! -f "$DEPLOY_DIR/backend/.env" ]; then
    echo -e "${RED}未找到.env文件，请创建...${NC}"
    echo "GOOGLE_API_KEY=your_api_key_here" > $DEPLOY_DIR/backend/.env
    echo -e "${RED}请编辑 $DEPLOY_DIR/backend/.env 文件，填入您的Google API密钥${NC}"
    read -p "按回车键继续..." </dev/tty
fi

# 设置后端
echo -e "${BLUE}设置后端环境...${NC}"
cd $DEPLOY_DIR/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

# 设置前端和安装项目依赖
echo -e "${BLUE}设置前端和项目依赖...${NC}"
cd $DEPLOY_DIR
npm install

# 构建前端
echo -e "${BLUE}构建前端...${NC}"
cd $DEPLOY_DIR/frontend
npm run build

# 创建PM2配置文件
echo -e "${BLUE}创建PM2配置文件...${NC}"
cat > $DEPLOY_DIR/ecosystem.config.js << EOL
module.exports = {
  apps: [
    {
      name: 'video-ai',
      cwd: '$DEPLOY_DIR',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'production'
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1G'
    }
  ]
};
EOL

# 启动服务
echo -e "${BLUE}启动服务...${NC}"
cd $DEPLOY_DIR
pm2 start ecosystem.config.js

# 设置PM2开机自启
echo -e "${BLUE}设置PM2开机自启...${NC}"
pm2 save
echo "请运行以下命令设置PM2开机自启（需要root权限）："
echo "sudo env PATH=$PATH:/usr/bin pm2 startup"

# 显示服务状态
echo -e "${GREEN}服务已启动！${NC}"
pm2 status

echo -e "${GREEN}部署完成！${NC}"
# 获取服务器IP
SERVER_IP=$(hostname -I | awk '{print $1}')
echo -e "${GREEN}前端和后端已启动，访问地址: http://$SERVER_IP:3002${NC}"
echo -e "${BLUE}如需停止服务，请运行: pm2 stop all${NC}"
echo -e "${BLUE}如需重启服务，请运行: pm2 restart all${NC}"
echo -e "${BLUE}如需查看日志，请运行: pm2 logs${NC}"
