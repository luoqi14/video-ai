# Video AI Monorepo 项目

## 1. 项目概览

这是一个整合了现代化 Next.js 前端与强大 FastAPI 后端的 Monorepo 项目。该应用允许用户上传视频，并通过自然语言指令来生成并应用 FFmpeg 视频变换，所有 AI 相关的处理都由后端安全地完成。

- **前端**: 使用 Next.js 和 Tailwind CSS 构建的流畅、响应式的用户界面。
- **后端**: 一个安全的 FastAPI 服务器，作为 Google Gemini API 的代理，以保护 API 密钥不被泄露。

## 2. 技术栈

### 前端
- **框架**: [Next.js](https://nextjs.org/)
- **UI 库**: [React](https://reactjs.org/)
- **CSS**: [Tailwind CSS v4](https://tailwindcss.com/)
- **FFmpeg**: [FFmpeg.wasm](https://ffmpegwasm.netlify.app/) 用于在浏览器端进行视频处理。

### 后端
- **框架**: [FastAPI](https://fastapi.tiangolo.com/)
- **语言**: Python 3
- **AI**: [Google Gemini API](https://ai.google.dev/) (通过 `google-genai` SDK)
- **服务器**: [Uvicorn](https://www.uvicorn.org/)

### Monorepo 管理
- **任务运行器**: [npm scripts](https://docs.npmjs.com/cli/v7/using-npm/scripts) (配合 `concurrently`)

## 3. 项目结构

```
video-ai/
├── backend/                # FastAPI 后端源代码
│   ├── venv/               # Python 虚拟环境 (已被 gitignore)
│   ├── main.py             # 主应用文件
│   ├── requirements.txt    # Python 依赖
│   └── .env                # 环境变量 (例如 GOOGLE_API_KEY)
│
├── frontend/               # Next.js 前端源代码
│   ├── src/
│   └── ...
│
├── .gitignore              # Git 忽略规则
├── package.json            # 根目录的依赖与脚本
└── README.md
```

## 4. 安装与设置

### 先决条件
- [Node.js](https://nodejs.org/) (推荐使用 LTS 版本)
- [Python 3](https://www.python.org/)

### 分步安装指南

1.  **克隆仓库:**
    ```bash
    git clone <your-repository-url>
    cd video-ai
    ```

2.  **安装根目录依赖:**
    此步骤会安装 `concurrently`，用于同时运行前后端服务。
    ```bash
    npm install
    ```

3.  **设置前端:**
    ```bash
    cd frontend
    npm install
    cd ..
    ```

4.  **设置后端:**
    ```bash
    cd backend
    # 创建 Python 虚拟环境
    python3 -m venv venv
    # 激活虚拟环境
    source venv/bin/activate
    # 安装 Python 依赖
    pip install -r requirements.txt
    # (可选) 当你完成工作后，可以停用虚拟环境
    # deactivate
    cd ..
    ```

5.  **配置后端环境变量:**
    在 `backend` 目录下创建一个名为 `.env` 的文件，并填入你的 Google API 密钥：
    ```
    # backend/.env
    GOOGLE_API_KEY="你的_GEMINI_API_密钥"
    ```

## 5. 运行项目

### 传统方式运行

要同时启动前端和后端的开发服务器，请在项目的**根目录**下运行以下命令：

```bash
npm run dev
```

- **Next.js 前端** 将运行在 `http://localhost:3002`
- **FastAPI 后端** 将运行在 `http://localhost:8002`

### Docker 方式运行（推荐）

本项目已完全 Docker 化，支持一键启动：

```bash
# 初始化环境
make setup

# 启动服务
make start

# 访问应用
# 前端: http://localhost:3002
# 后端: http://localhost:8002
```

更多 Docker 相关命令请参考 [Docker 部署指南](docs/DOCKER_DEPLOYMENT.md)。

## 6. Tailwind CSS 配置

确保 `tailwind.config.js` 文件配置正确，特别是 `content` 路径，以便Tailwind能够扫描到所有使用其工具类的地方：

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'theme-green-light': '#A8D8B9',
        'theme-green-medium': '#88C8A0',
        'theme-green-dark': '#68B888',
        // 根据需要添加更多自定义颜色
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      // 添加玻璃磨砂效果所需的 backdrop-filter (如果需要插件)
      // 添加3D圆角所需的 box-shadow 或其他自定义工具类
    },
  },
  plugins: [
    // require('@tailwindcss/forms'), // 如果使用表单样式
    // require('@tailwindcss/typography'), // 如果使用排版样式
  ],
}
```

同时，在您的全局CSS文件 (例如 `src/styles/globals.css` 或 `src/app/globals.css`) 中引入Tailwind的基础样式、组件和工具类：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* 您可以在这里添加自定义的全局样式 */
body {
  /* 示例：设置一个基础背景色 */
  /* background-color: #f0fdf4; */ /* 一个非常浅的绿色作为背景 */
}
```

## 8. Docker 部署

本项目提供完整的 Docker 化解决方案，支持开发和生产环境：

### 服务管理
```bash
make start         # 启动服务
make stop          # 停止服务
make logs          # 查看日志
make status        # 查看状态
```

### 详细文档
- [Docker 部署指南](docs/DOCKER_DEPLOYMENT.md) - 完整的部署说明
- [运维指南](docs/OPERATIONS_GUIDE.md) - 监控和维护
- [快速参考](docs/QUICK_REFERENCE.md) - 常用命令速查

### Docker 特性
- ✅ 多阶段构建优化镜像大小
- ✅ 非 root 用户安全运行
- ✅ 健康检查和自动重启
- ✅ 开发环境热重载支持
- ✅ 生产环境性能优化
- ✅ 完整的日志和监控配置

## 9. 代码规范与提交

*   遵循 ESLint 和 Prettier (如果配置) 的代码规范。
*   Commit messages 建议遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

## 10. 贡献指南

(如果项目需要多人协作，请在此处添加贡献指南，例如如何创建分支、提交Pull Request等。)

---

本文档旨在为项目开发提供指导，请根据项目实际进展持续更新。
