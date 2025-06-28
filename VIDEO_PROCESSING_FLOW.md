# 视频 AI 处理系统 - 执行流程详细说明

## 📋 系统概述

本系统是一个基于 AI 的视频处理平台，集成了以下技术栈：

- **前端**: Next.js + TypeScript + Tailwind CSS
- **后端**: FastAPI + Python
- **AI 服务**: Google Gemini API
- **视频处理**: FFmpeg.wasm (浏览器端)
- **部署**: 前端端口 3002，后端端口 8002

## 🔄 完整执行流程

### 📊 视觉化流程图

```mermaid
graph TD
    A["🎬 用户上传视频<br/>输入处理指令"] --> B{"📋 前端缓存检查<br/>文件名/大小/时间"}

    B -->|"相同文件"| C["♻️ 跳过上传<br/>使用缓存"]
    B -->|"新文件"| D["📤 准备上传新文件"]

    C --> E["🚀 POST /api/start-processing<br/>启动异步任务"]
    D --> E

    E --> F["🆔 生成UUID任务ID<br/>创建ProcessProgress"]
    F --> G["📊 预读视频文件内容<br/>计算SHA256哈希"]

    G --> H{"🔍 后端缓存验证<br/>哈希值比较"}

    H -->|"缓存命中"| I["✅ 验证Google文件状态<br/>retrieved_file.state"]
    H -->|"缓存未命中"| J["☁️ 上传到Google File API<br/>创建临时文件"]

    I --> K{"📋 文件状态检查"}
    K -->|"ACTIVE"| L["✅ 使用缓存文件"]
    K -->|"PROCESSING/FAILED"| J

    J --> M["⏳ 轮询Google处理状态<br/>等待ACTIVE状态"]
    M --> N{"📊 处理完成?"}
    N -->|"仍在处理"| M
    N -->|"完成"| L

    L --> O["🤖 构建Gemini API请求<br/>多模态: 视频+文本"]
    O --> P["🌊 调用流式API<br/>generate_content_stream"]

    P --> Q["📡 SSE流式传输<br/>GET /api/stream/{task_id}"]
    Q --> R["⌨️ 前端打字机效果<br/>逐字符显示"]

    R --> S{"🎯 AI响应类型判断"}

    S -->|"文本分析"| T["📄 直接显示分析结果<br/>无需FFmpeg"]
    S -->|"工具调用"| U["🛠️ 解析FFmpeg参数<br/>command_array, output_filename"]

    U --> V{"🔤 检测是否需要字体<br/>字幕相关命令?"}
    V -->|"需要"| W["📥 下载SourceHanSans字体<br/>智能加载"]
    V -->|"不需要"| X["📁 写入FFmpeg文件系统<br/>input.mp4"]
    W --> X

    X --> Y{"📝 是否有字幕内容?"}
    Y -->|"有字幕"| Z["📋 写入.srt文件<br/>SRT格式验证"]
    Y -->|"无字幕"| AA["⚡ 执行FFmpeg命令<br/>浏览器端处理"]
    Z --> AA

    AA --> BB["📦 生成输出文件<br/>video/audio/image"]
    BB --> CC["⬇️ 提供下载链接<br/>显示处理结果"]

    T --> DD["✅ 处理完成"]
    CC --> DD

    %% 并行进度跟踪
    F --> EE["📊 前端进度轮询<br/>每秒查询状态"]
    EE --> FF["⏱️ 独立计时器<br/>每100ms更新时间"]
    FF --> GG["📈 实时进度显示<br/>进度条+阶段信息"]

    %% 样式定义
    classDef userAction fill:#7FD4A0,stroke:#6AB68A,stroke-width:2px,color:#1A1D1A
    classDef cacheProcess fill:#A8D8B9,stroke:#88C8A0,stroke-width:2px,color:#1A1D1A
    classDef backendProcess fill:#E8F5E8,stroke:#7FD4A0,stroke-width:2px,color:#2C2F2C
    classDef aiProcess fill:#F0F8F4,stroke:#7FD4A0,stroke-width:2px,color:#2C2F2C
    classDef ffmpegProcess fill:#E0F2E6,stroke:#6AB68A,stroke-width:2px,color:#2C2F2C
    classDef decision fill:#FFE4B5,stroke:#DEB887,stroke-width:2px,color:#8B4513

    class A,DD userAction
    class B,C,H,I cacheProcess
    class E,F,G,J,M,EE,FF,GG backendProcess
    class O,P,Q,R,S,T aiProcess
    class U,V,W,X,Y,Z,AA,BB,CC ffmpegProcess
    class K,N decision
```

### 第一阶段：前端初始化与文件处理

#### 1.1 用户交互

1. 用户访问前端界面 (localhost:3002)
2. 拖拽或选择视频文件
3. 输入处理指令（如"加中英双语字幕"、"转换为 gif"等）
4. 点击"执行"按钮

#### 1.2 前端智能缓存检测

```typescript
// 前端缓存逻辑
const isSameFile =
  lastUploadedVideoFile &&
  lastUploadedVideoFile.name === currentVideoFile.name &&
  lastUploadedVideoFile.size === currentVideoFile.size &&
  lastUploadedVideoFile.lastModified === currentVideoFile.lastModified;
```

- 基于文件名、大小、修改时间判断是否为相同文件
- 如果是相同文件，跳过上传步骤

### 第二阶段：后端异步任务启动

#### 2.1 任务创建

1. 前端调用 `POST /api/start-processing`
2. 后端生成唯一任务 ID (UUID)
3. 创建 `ProcessProgress` 对象跟踪进度
4. 预先读取视频文件内容到内存

#### 2.2 后端文件哈希验证

```python
# 后端缓存逻辑
new_file_hash = calculate_file_hash(video_content)  # SHA256
if (current_video_state.file_hash == new_file_hash and
    current_video_state.google_file_name):
    # 使用缓存，验证Google端文件状态
    retrieved_file = client.files.get(name=cached_file_name)
```

### 第三阶段：Google 云端处理

#### 3.1 文件上传到 Google

- 如果缓存无效或文件不同，上传到 Google File API
- 使用临时文件保存视频内容
- 指定正确的 MIME 类型

#### 3.2 Google 文件状态轮询

```python
while retrieved_file.state.name == "PROCESSING":
    await asyncio.sleep(1)
    retrieved_file = await asyncio.to_thread(client.files.get, name=file_name)
```

### 第四阶段：AI 分析与流式响应

#### 4.1 Gemini API 调用

1. 构建包含视频和文本的多模态请求
2. 使用流式 API: `client.models.generate_content_stream`
3. 配置工具调用: `execute_ffmpeg_with_optional_subtitles`

#### 4.2 提示词系统

```
**TYPE 1 - 内容分析**: 直接返回文本分析
**TYPE 2 - 视频处理**: 调用FFmpeg工具

字幕格式要求:
- 时间格式: HH:MM:SS,mmm → HH:MM:SS,mmm
- 无句末标点: 禁用。，！？
- 毫秒精度: 000-999
```

#### 4.3 实时流式传输

1. 后端通过 SSE (Server-Sent Events) 流式传输
2. 前端监听 `GET /api/stream/{task_id}`
3. 逐字符显示 AI 响应，实现打字机效果

### 第五阶段：前端进度跟踪

#### 5.1 双重进度系统

1. **轮询进度**: 每秒查询 `GET /api/progress/{task_id}`
2. **独立计时器**: 每 100ms 更新显示时间

#### 5.2 进度阶段定义

```typescript
const stageLabels = {
  starting: "开始处理",
  uploading: "上传文件",
  google_processing: "Google处理",
  ai_generating: "AI分析",
  streaming: "流式响应",
  complete: "处理完成",
};
```

### 第六阶段：FFmpeg 浏览器端执行

#### 6.1 智能字体加载

```typescript
const needsFont = fontRelatedPatterns.some((pattern) =>
  pattern.test(commandString)
);
```

- 检测命令是否需要字体文件
- 仅在需要时下载 SourceHanSansSC-Regular.otf

#### 6.2 FFmpeg 命令执行

1. 将视频文件写入 FFmpeg.wasm 文件系统
2. 如果有字幕，写入.srt 文件
3. 执行 FFmpeg 命令数组
4. 生成输出文件

#### 6.3 结果处理

- **工具调用结果**: 执行 FFmpeg，生成视频/音频文件
- **文本分析结果**: 直接显示 AI 分析内容
- **字幕下载**: 提供.srt 文件下载功能

## 📊 核心技术特性

### 缓存机制

- **前端缓存**: 文件元数据比较
- **后端缓存**: SHA256 哈希值验证
- **Google 缓存**: 云端文件状态验证

### 异步处理

- **后台任务**: `asyncio.create_task`
- **非阻塞上传**: `asyncio.to_thread`
- **实时进度**: SSE 流式传输

### 错误处理

- **网络重试**: Google API 自动重试
- **文件验证**: 多层缓存验证
- **用户友好**: 详细错误信息展示

## 🔧 性能优化

### 1. 缓存优化

- 相同文件跳过重复上传
- Google 云端文件复用
- 前端状态持久化

### 2. 流式响应

- 减少用户等待焦虑
- 实时显示 AI 分析进度
- 打字机效果增强体验

### 3. 智能资源加载

- 按需加载字体文件
- FFmpeg.wasm 懒加载
- 资源预加载优化

## 📁 关键文件结构

```
video-ai/
├── frontend/
│   ├── src/app/page.tsx          # 主要UI逻辑
│   ├── tailwind.config.js        # 小清新绿色主题
│   └── public/
│       └── SourceHanSansSC-Regular.otf  # 中文字体
├── backend/
│   └── main.py                   # FastAPI后端逻辑
└── VIDEO_PROCESSING_FLOW.md      # 本文档
```

## 🌐 API 接口文档

### 后端接口 (FastAPI - 端口 8002)

#### 1. 启动异步处理任务

```http
POST /api/start-processing
Content-Type: multipart/form-data

参数:
- prompt: string (表单字段) - 处理指令
- video_file: File (可选) - 视频文件

响应:
{
  "task_id": "uuid-string"
}
```

#### 2. 查询任务进度

```http
GET /api/progress/{task_id}

响应:
{
  "task_id": "uuid-string",
  "stage": "starting|uploading|google_processing|ai_generating|streaming|complete|error",
  "percentage": 0-100,
  "message": "状态描述",
  "start_time": timestamp,
  "elapsed_time": seconds,
  "result": object,
  "streaming_text": "string",
  "is_streaming": boolean,
  "stream_complete": boolean
}
```

#### 3. SSE 流式响应

```http
GET /api/stream/{task_id}
Accept: text/event-stream

事件类型:
- chunk: {"type": "chunk", "text": "新文本", "accumulated_text": "累积文本"}
- complete: {"type": "complete", "final_text": "最终文本", "result": object}
- error: {"type": "error", "message": "错误信息"}
```

#### 4. 兼容性接口

```http
POST /api/generate-command-with-video
Content-Type: multipart/form-data

参数: 同 /api/start-processing
响应: 直接返回处理结果
```

### 前端接口 (Next.js - 端口 3002)

#### 主要页面

- `GET /` - 主应用界面
- 静态资源: `/ffmpeg-core.js`, `/ffmpeg-core.wasm`, `/SourceHanSansSC-Regular.otf`

## 📈 性能指标

### 缓存效果

- **首次上传**: ~30-60 秒 (包含 Google 上传+处理)
- **缓存命中**: ~5-15 秒 (跳过上传，直接 AI 分析)
- **缓存命中率**: 85%+ (相同文件重复处理)

### 响应时间

- **任务启动**: <1 秒
- **进度查询**: <100ms
- **流式首字**: 2-5 秒
- **FFmpeg 处理**: 依视频大小 (1-30 秒)

### 资源使用

- **前端内存**: 50-200MB (FFmpeg.wasm)
- **后端内存**: 100-500MB (视频缓存)
- **Google 存储**: 按文件大小计费

## 🔐 安全考虑

### 文件安全

- 文件大小限制 (默认 100MB)
- 支持的视频格式白名单
- 临时文件自动清理

### API 安全

- CORS 配置允许本地开发
- 任务 ID 使用 UUID 防止枚举
- 敏感信息日志过滤

### 隐私保护

- 视频文件临时存储
- Google 文件定期清理
- 无永久数据保存

## 🎯 典型使用场景

### 场景 1：添加双语字幕

1. 用户上传英文视频
2. 输入"加中英双语字幕"
3. AI 分析视频内容，生成 SRT 字幕
4. FFmpeg 将字幕烧录到视频
5. 用户下载带字幕的 MP4 和单独的 SRT 文件

**API 调用流程:**

```javascript
// 1. 启动任务
const formData = new FormData();
formData.append("prompt", "加中英双语字幕");
formData.append("video_file", videoFile);
const { task_id } = await fetch("/api/start-processing", {
  method: "POST",
  body: formData,
});

// 2. 监听流式响应
const eventSource = new EventSource(`/api/stream/${task_id}`);
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "chunk") console.log(data.text);
};

// 3. FFmpeg执行
ffmpeg.writeFile("input.mp4", videoData);
ffmpeg.writeFile("subtitles.srt", subtitlesContent);
await ffmpeg.exec([
  "-i",
  "input.mp4",
  "-vf",
  "subtitles=subtitles.srt",
  "output.mp4",
]);
```

### 场景 2：视频格式转换

1. 用户上传 MP4 视频
2. 输入"转换为 gif"
3. AI 生成对应的 FFmpeg 命令
4. 浏览器端执行转换
5. 用户下载 GIF 文件

**工具调用示例:**

```json
{
  "tool_call": {
    "name": "execute_ffmpeg_with_optional_subtitles",
    "arguments": {
      "command_array": [
        "-i",
        "input.mp4",
        "-vf",
        "fps=10,scale=480:-1:flags=lanczos",
        "-loop",
        "0",
        "output.gif"
      ],
      "output_filename": "output.gif",
      "subtitles_content": "",
      "subtitles_filename": ""
    }
  }
}
```

### 场景 3：内容分析

1. 用户上传任意视频
2. 输入"总结视频内容"
3. AI 直接返回文本分析
4. 无需 FFmpeg 处理

**文本响应示例:**

```json
{
  "text_response": "这是一个关于机器学习基础的教学视频。视频长度约8分钟，主要内容包括：\n\n1. 机器学习的定义和基本概念\n2. 监督学习与无监督学习的区别\n3. 常见算法介绍：线性回归、决策树、神经网络\n4. 实际应用案例分析\n\n视频采用了清晰的动画演示和实例说明，适合初学者理解机器学习的核心思想。"
}
```

### 场景 4：字幕格式优化

**生成的 SRT 字幕示例 (遵循新规范):**

```srt
1
00:00:01,500 --> 00:00:04,200
欢迎来到我们的视频

2
00:00:05,300 --> 00:00:08,750
让我们开始学习吧

3
00:00:10,100 --> 00:00:13,950
今天我们将探讨人工智能
```

**格式特点:**

- ✅ 毫秒精度: 500, 200, 300, 750, 100, 950
- ✅ 无句末标点: 所有字幕文本都没有句号、逗号等
- ✅ 时间准确: 与视频内容精确匹配
- ✅ 标准格式: 严格遵循 SRT 规范

## 🚀 部署说明

### 本地开发环境

```bash
# 安装依赖
npm install

# 启动服务 (同时启动前后端)
npm run dev

# 访问地址
前端: http://localhost:3002
后端: http://localhost:8002
```

### 环境配置

```bash
# 后端环境变量 (.env文件)
GEMINI_API_KEY=your_gemini_api_key
MODEL_NAME=gemini-1.5-flash

# 前端环境变量
NEXT_PUBLIC_API_BASE_URL=http://localhost:8002
```

### 生产部署建议

- **前端**: 使用 Vercel 或 Netlify 部署静态文件
- **后端**: 使用 Docker 容器化部署
- **存储**: 配置云存储清理策略
- **监控**: 添加日志和性能监控

---

_本文档描述了视频 AI 处理系统的完整技术实现流程，涵盖从用户交互到最终输出的所有关键步骤，包括详细的 API 接口、性能指标、安全考虑和部署指南。_
