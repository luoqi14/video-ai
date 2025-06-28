import os
from google import genai
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import StreamingResponse
from typing import Optional, AsyncGenerator, Dict
from fastapi.middleware.cors import CORSMiddleware
import tempfile
import os
import time
import hashlib
from pydantic import BaseModel
from dotenv import load_dotenv
from google.genai import types
import asyncio
import json
import uuid

# Load environment variables from .env file
load_dotenv()

# --- Progress Management ---
class ProcessProgress:
    def __init__(self):
        self.task_id: str = ""
        self.stage: str = "idle"  # idle, uploading, google_processing, ai_generating, streaming, complete, error
        self.percentage: int = 0
        self.message: str = ""
        self.start_time: float = 0
        self.error_message: str = ""
        self.result: Optional[Dict] = None
        # 流式响应支持
        self.streaming_text: str = ""
        self.is_streaming: bool = False
        self.stream_complete: bool = False
    
    def update(self, stage: str, percentage: int, message: str = ""):
        self.stage = stage
        self.percentage = percentage
        self.message = message
        if stage == "error":
            self.error_message = message
        print(f"Progress Update [{self.task_id}]: {stage} - {percentage}% - {message}")
    
    def append_streaming_text(self, text: str):
        """添加流式文本"""
        self.streaming_text += text
        self.is_streaming = True
    
    def complete_streaming(self):
        """标记流式完成"""
        self.is_streaming = False
        self.stream_complete = True

# 全局进度存储
progress_store: Dict[str, ProcessProgress] = {}

# --- Global State for Current Video (Simple In-Memory) ---
class CurrentVideoState:
    def __init__(self):
        self.google_file_name: Optional[str] = None
        self.original_file_name: Optional[str] = None
        self.mime_type: Optional[str] = None
        self.file_hash: Optional[str] = None  # 添加文件哈希用于缓存

current_video_state = CurrentVideoState()

# --- Helper Functions ---
def calculate_file_hash(file_content: bytes) -> str:
    """计算文件内容的SHA256哈希值"""
    return hashlib.sha256(file_content).hexdigest()

# --- Global Variables & Configuration ---
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
API_KEY = os.getenv("GOOGLE_API_KEY")
MODEL_NAME = "gemini-2.5-flash" # Using a stable model name

if not API_KEY:
    raise RuntimeError("GOOGLE_API_KEY not found in .env file")

# Initialize the new client, this is the recommended approach for the new SDK
client = genai.Client(api_key=API_KEY)

app = FastAPI()

# --- CORS Middleware ---
# This allows your frontend (running on localhost:3000) to communicate with this backend.
origins = [
    "http://localhost:3002",
    "http://127.0.0.1:3002",
    "https://video.jarvismedical.asia",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API Endpoints ---
@app.get("/")
async def root():
    return {"message": "Video AI Backend is running"}

@app.get("/api/progress/{task_id}")
async def get_progress(task_id: str):
    """获取任务进度"""
    if task_id not in progress_store:
        raise HTTPException(status_code=404, detail="Task not found")
    
    progress = progress_store[task_id]
    return {
        "task_id": progress.task_id,
        "stage": progress.stage,
        "percentage": progress.percentage,
        "message": progress.message,
        "error_message": progress.error_message,
        "elapsed_time": time.time() - progress.start_time if progress.start_time > 0 else 0,
        "result": progress.result,
        "streaming_text": progress.streaming_text,
        "is_streaming": progress.is_streaming,
        "stream_complete": progress.stream_complete
    }

@app.get("/api/stream/{task_id}")
async def stream_ai_response(task_id: str):
    """SSE流式AI响应"""
    
    print(f"[SSE] 客户端连接流式端点，任务ID: {task_id}")
    
    def create_sse_data(data: Dict) -> str:
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
    
    async def event_stream():
        if task_id not in progress_store:
            print(f"[SSE] 任务未找到: {task_id}")
            yield create_sse_data({"error": "Task not found"})
            return
            
        progress = progress_store[task_id]
        last_text_length = 0
        
        print(f"[SSE] 开始等待AI生成，当前阶段: {progress.stage}")
        
        # 等待AI开始生成
        while progress.stage not in ["ai_generating", "streaming", "complete", "error"]:
            await asyncio.sleep(0.1)
            if progress.stage == "error":
                print(f"[SSE] 发现错误状态: {progress.error_message}")
                yield create_sse_data({"type": "error", "message": progress.error_message})
                return
        
        print(f"[SSE] AI生成阶段开始，进入流式模式")
        
        # 持续发送流式更新
        while not progress.stream_complete and progress.stage != "error":
            current_text_length = len(progress.streaming_text)
            
            # 发送新的文本块
            if current_text_length > last_text_length:
                new_text = progress.streaming_text[last_text_length:]
                print(f"[SSE] 发送文本块: {repr(new_text)}")
                yield create_sse_data({
                    "type": "chunk",
                    "text": new_text,
                    "accumulated_text": progress.streaming_text
                })
                last_text_length = current_text_length
            
            await asyncio.sleep(0.1)  # 100ms轮询间隔
        
        # 发送完成信号
        if progress.stream_complete:
            yield create_sse_data({
                "type": "complete", 
                "final_text": progress.streaming_text,
                "result": progress.result
            })
        elif progress.stage == "error":
            yield create_sse_data({"type": "error", "message": progress.error_message})
    
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*"
        }
    )

@app.post("/api/start-processing")
async def start_processing(prompt: str = Form(...), video_file: Optional[UploadFile] = File(None)):
    """启动异步处理任务并返回任务ID"""
    task_id = str(uuid.uuid4())
    progress = ProcessProgress()
    progress.task_id = task_id
    progress.start_time = time.time()
    progress.update("starting", 0, "开始处理请求...")
    progress_store[task_id] = progress
    
    # 预先读取视频文件内容，避免后台任务中的文件句柄关闭问题
    video_content = None
    video_mime_type = None
    video_filename = None
    
    if video_file and video_file.filename:
        try:
            video_content = await video_file.read()
            video_mime_type = video_file.content_type
            video_filename = video_file.filename
            print(f"Successfully read video file in start_processing: {video_filename}, size: {len(video_content)}")
        except Exception as e:
            print(f"Error reading video file in start_processing: {str(e)}")
            progress.update("error", 0, f"读取视频文件失败: {str(e)}")
            return {"error": f"读取视频文件失败: {str(e)}"}
    
    # 启动后台任务，传递已读取的文件内容而不是文件对象
    asyncio.create_task(process_video_task_with_content(task_id, prompt, video_content, video_mime_type, video_filename))
    
    return {"task_id": task_id}

# --- Tool Definition for Video + Subtitles --- 
execute_ffmpeg_with_optional_subtitles_declaration = types.FunctionDeclaration(
    name="execute_ffmpeg_with_optional_subtitles",
    description=(
        "Executes an FFmpeg command in the user's web browser using FFmpeg.wasm and can optionally include subtitles. "
        "Use this tool when the user asks to perform video manipulations like trimming, converting, adding subtitles, etc. "
        "The input video file is always named 'input.mp4' in the FFmpeg.wasm environment. "
        "Provide the full FFmpeg command string, the desired output filename for the video, "
        "the content of the subtitles (if requested or appropriate, in SRT or VTT format), "
        "and a filename for the subtitles (e.g., 'subs.srt' or 'subs.vtt'). "
        "If subtitles are not requested or not applicable, subtitles_content and subtitles_filename can be omitted or empty."
    ),
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "command_array": types.Schema(
                type=types.Type.ARRAY,
                items=types.Schema(type=types.Type.STRING),
                description="The FFmpeg command arguments as an array of strings (without 'ffmpeg' at the beginning). For subtitles, use EXACT syntax: 'subtitles=filename.srt:fontsdir=/customfonts:force_style=\\'Fontname=Source Han Sans SC\\'' (CRITICAL: use 'fontsdir' NOT 'fontsize'). Example: ['-i', 'input.mp4', '-vf', 'subtitles=subs.srt:fontsdir=/customfonts:force_style=\\'Fontname=Source Han Sans SC\\'', 'output.mp4']"
            ),
            "output_filename": types.Schema(
                type=types.Type.STRING,
                description="The desired name for the output video file, e.g., 'output_with_subs.mp4', 'trimmed_video.mp4'."
            ),
            "subtitles_content": types.Schema(
                type=types.Type.STRING,
                description="The actual content of the subtitles (e.g., SRT or VTT format). Omit or leave empty if no subtitles are generated."
            ),
            "subtitles_filename": types.Schema(
                type=types.Type.STRING,
                description="The filename for the subtitles (e.g., 'subs.srt', 'subs.vtt'). Omit or leave empty if no subtitles are generated. This filename should be used in the command_string if burning subtitles."
            )
        },
        required=["command_array", "output_filename"] 
    )
)

async def process_video_task_with_content(task_id: str, prompt: str, video_content: Optional[bytes], video_mime_type: Optional[str], video_filename: Optional[str]):
    """异步处理视频的后台任务，接受已读取的文件内容"""
    progress = progress_store[task_id]
    
    try:
        progress.update("initializing", 2, "初始化处理流程...")
        print(f"Received prompt for video processing: {prompt}, and video: {video_filename if video_filename else 'No new video file provided (will attempt to use previous)'}")
        
        file_object_for_gemini: Optional[types.File] = None
        original_video_filename_for_prompt: str = "input.mp4" # Default
        temp_file_path = None # Initialize for cleanup

        if video_content and video_filename: # New video file is provided
            # 计算文件哈希以检查是否是同一个文件
            new_file_hash = calculate_file_hash(video_content)
            
            # 检查是否是同一个文件
            if (current_video_state.file_hash == new_file_hash and 
                current_video_state.google_file_name and 
                current_video_state.original_file_name == video_filename):
                
                progress.update("google_processing", 20, f"♻️ 检测到相同视频文件，使用缓存: {video_filename}")
                print(f"♻️ Same video file detected (hash: {new_file_hash[:8]}...), using cached version: {current_video_state.google_file_name}")
                
                # 验证缓存的文件是否仍然有效
                retrieved_file = await asyncio.to_thread(client.files.get, name=current_video_state.google_file_name)
                if retrieved_file and retrieved_file.state and retrieved_file.state.name == "ACTIVE":
                    progress.update("google_processing", 50, "✅ 缓存文件验证通过")
                    file_object_for_gemini = retrieved_file
                    original_video_filename_for_prompt = current_video_state.original_file_name
                else:
                    progress.update("uploading", 5, "⚠️ 缓存文件无效，重新上传")
                    print(f"⚠️ Cached file is invalid, re-uploading: {current_video_state.google_file_name}")
                    # 清除无效缓存
                    current_video_state.google_file_name = None
                    current_video_state.file_hash = None
                    # 继续执行上传逻辑
            else:
                progress.update("uploading", 5, f"📤 开始处理新视频文件: {video_filename}")
                print(f"📤 Processing new video file: {video_filename} (hash: {new_file_hash[:8]}...)")
            
            # 如果没有有效的缓存文件，则上传新文件
            if not file_object_for_gemini:
                progress.update("uploading", 10, "保存临时文件...")
                # Create temp file
                file_suffix = os.path.splitext(video_filename)[1]
                with tempfile.NamedTemporaryFile(delete=False, suffix=file_suffix) as tmp:
                    tmp.write(video_content)
                    temp_file_path = tmp.name
                
                print(f"Video content (size: {len(video_content)}) saved to temp file: {temp_file_path}")
                
                progress.update("google_processing", 15, f"上传到Google服务器: {video_filename}")
                print(f"Uploading temporary video file to Google: {video_filename}, mime_type: {video_mime_type}")

                upload_config = types.UploadFileConfig(
                    mime_type=video_mime_type,
                    display_name=video_filename
                )
                upload_start_time = time.time()
                
                uploaded_file_obj = await asyncio.to_thread(
                    client.files.upload,
                    file=temp_file_path,
                    config=upload_config
                )
                
                upload_duration = time.time() - upload_start_time
                print(f"PERF: client.files.upload took {upload_duration:.2f} seconds.")
                print(f"Initial file upload response. Name: {uploaded_file_obj.name}, Display Name: {uploaded_file_obj.display_name}, URI: {uploaded_file_obj.uri}, State: {uploaded_file_obj.state.name if uploaded_file_obj.state else 'UNKNOWN'}")
                
                progress.update("google_processing", 30, "等待Google处理文件...")
                # Wait for file to be processed
                processing_wait_start_time = time.time()
                wait_cycles = 0
                while uploaded_file_obj.state and uploaded_file_obj.state.name == "PROCESSING":
                    wait_cycles += 1
                    # 动态更新进度和消息，让用户知道仍在处理
                    progress_percent = min(30 + wait_cycles * 2, 45)  # 从30%逐渐增加到45%
                    progress.update("google_processing", progress_percent, f"Google正在处理文件... ({wait_cycles}s)")
                    
                    print(f"File {uploaded_file_obj.name} is still PROCESSING. Waiting 1 seconds... (cycle {wait_cycles})")
                    await asyncio.sleep(1)
                    
                    retrieved_file = await asyncio.to_thread(client.files.get, name=uploaded_file_obj.name)
                    if retrieved_file and retrieved_file.state:
                        uploaded_file_obj = retrieved_file
                        print(f"Updated file state: {uploaded_file_obj.name} is now {uploaded_file_obj.state.name}")
                    else:
                        print(f"Warning: client.files.get for {uploaded_file_obj.name} returned invalid data or state. Retrying...")
                
                processing_wait_duration = time.time() - processing_wait_start_time
                print(f"PERF: File state change from PROCESSING to ACTIVE took {processing_wait_duration:.2f} seconds.")
                
                if not (uploaded_file_obj.state and uploaded_file_obj.state.name == "ACTIVE"):
                    progress.update("error", 0, f"上传的文件 {uploaded_file_obj.name} 未能变为可用状态")
                    return
                
                progress.update("google_processing", 50, "文件已准备就绪")
                print(f"File {uploaded_file_obj.name} is ACTIVE.")
                current_video_state.google_file_name = uploaded_file_obj.name
                current_video_state.original_file_name = video_filename
                current_video_state.mime_type = video_mime_type
                current_video_state.file_hash = new_file_hash  # 保存文件哈希
                file_object_for_gemini = uploaded_file_obj
                original_video_filename_for_prompt = video_filename

                # Clean up temp file
                if temp_file_path and os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
                    print(f"Temporary file {temp_file_path} deleted.")
                        
        elif current_video_state.google_file_name:
            progress.update("google_processing", 20, f"使用已上传的视频: {current_video_state.original_file_name}")
            print(f"No new video file. Using last uploaded: {current_video_state.google_file_name} (Original: {current_video_state.original_file_name})")
            original_video_filename_for_prompt = current_video_state.original_file_name or "input.mp4"
            
            retrieved_file = await asyncio.to_thread(client.files.get, name=current_video_state.google_file_name)
            wait_cycles = 0
            while retrieved_file.state and retrieved_file.state.name == "PROCESSING":
                wait_cycles += 1
                # 动态更新进度，让用户知道正在验证文件状态
                progress_percent = min(20 + wait_cycles, 40)
                progress.update("google_processing", progress_percent, f"验证已缓存文件状态... ({wait_cycles}s)")
                
                print(f"File {retrieved_file.name} is PROCESSING. Waiting 1 seconds... (cycle {wait_cycles})")
                await asyncio.sleep(1)
                retrieved_file = await asyncio.to_thread(client.files.get, name=current_video_state.google_file_name)
            
            if not (retrieved_file.state and retrieved_file.state.name == "ACTIVE"):
                progress.update("error", 0, f"之前上传的文件 {current_video_state.google_file_name} 不可用，请重新上传")
                return
            
            progress.update("google_processing", 50, "已确认文件可用状态")
            print(f"Successfully retrieved and confirmed ACTIVE status for {current_video_state.google_file_name}")
            file_object_for_gemini = retrieved_file
        else:
            progress.update("error", 0, "未提供视频文件且未找到之前上传的视频")
            return

        # 验证 file_object_for_gemini 是否被正确设置
        if not file_object_for_gemini:
            progress.update("error", 0, "内部错误：文件对象未能正确设置")
            print("ERROR: file_object_for_gemini is None - this should not happen")
            return

        # --- At this point, file_object_for_gemini and original_video_filename_for_prompt are set ---
        progress.update("ai_generating", 60, "准备AI分析和指令生成...")

        # --- Construct the prompt for Gemini ---
        tool_config_video = types.Tool(function_declarations=[execute_ffmpeg_with_optional_subtitles_declaration])
        user_natural_language_prompt = prompt
        fixed_ffmpeg_input_filename = original_video_filename_for_prompt

        prompt_for_gemini = (
            f"You are a helpful AI assistant. The user has provided a video file named '{fixed_ffmpeg_input_filename}'.\n"
            f"The user's instruction is: '{user_natural_language_prompt}'.\n\n"
            f"IMPORTANT: Analyze the user's request carefully and choose the appropriate response type:\n\n"
            f"**TYPE 1 - Content Analysis (NO TOOLS)**: If the user wants to understand, analyze, or get information about the video content:\n"
            f"- Examples: 'summarize this video', 'what is in this video?', 'describe the content', 'what happens in the video?', 'analyze this video', 'tell me about this video'\n"
            f"- Action: Provide a direct text response by analyzing the video. DO NOT use any tools.\n\n"
            f"**TYPE 2 - Video Processing (USE TOOL)**: If the user wants to transform, edit, or modify the video file:\n"
            f"- Examples: 'convert to GIF', 'trim the video', 'extract audio', 'add subtitles', 'change format', 'resize video'\n"
            f"- Action: Call the 'execute_ffmpeg_with_optional_subtitles' tool.\n\n"
            f"**Current Request Analysis**: The instruction '{user_natural_language_prompt}' is asking for:\n"
            f"- If it's about understanding/analyzing content → Provide direct text answer in Chinese\n"
            f"- If it's about editing/converting video → Use the tool\n\n"
            f"**Tool Usage Details** (only if TYPE 2):\n"
            f"- The user's video is available as '{fixed_ffmpeg_input_filename}'. This MUST be the input file in your FFmpeg command.\n"
            f"- Generate the `command_array` (the arguments for FFmpeg, without 'ffmpeg' itself), the `output_filename`, and subtitle information if needed.\n"
            f"- **Subtitles**: If the instruction is about generating or burning in subtitles, create the content for 'subtitles_content' and a 'subtitles_filename'. When burning subtitles, your `command_array` MUST include the EXACT filter syntax:\n"
            f"  `subtitles=<subtitles_filename>:fontsdir=/customfonts:force_style='Fontname=Source Han Sans SC'`\n"
            f"  CRITICAL: Use 'fontsdir' NOT 'fontsize' or 'fontdir'. The correct parameter is 'fontsdir'.\n"
            f"  Example: For a subtitle file 'chinese_subs.srt', use:\n"
            f"  `['-i', 'input.mp4', '-vf', 'subtitles=chinese_subs.srt:fontsdir=/customfonts:force_style=\\'Fontname=Source Han Sans SC\\'', 'output.mp4']`\n"
            f"  The font 'SourceHanSansSC-Regular.otf' is available in '/customfonts'. If no subtitles are needed, provide empty strings for 'subtitles_content' and 'subtitles_filename'.\n\n"
            f"**CRITICAL: SRT Subtitle Format Requirements**:\n"
            f"If generating subtitles, the 'subtitles_content' MUST follow this EXACT SRT format:\n"
            f"```\n"
            f"1\n"
            f"00:00:01,500 --> 00:00:04,200\n"
            f"欢迎来到我们的视频\n"
            f"\n"
            f"2\n"
            f"00:00:05,300 --> 00:00:08,750\n"
            f"让我们开始学习吧\n"
            f"\n"
            f"3\n"
            f"00:00:10,000 --> 00:00:13,500\n"
            f"这里是第三段字幕内容\n"
            f"\n"
            f"```\n"
            f"MANDATORY SRT Rules:\n"
            f"1) Sequential numbering: 1, 2, 3, 4...\n"
            f"2) Time format: HH:MM:SS,mmm --> HH:MM:SS,mmm (use comma for milliseconds, NOT period)\n"
            f"   ✅ Correct: 00:00:01,500 --> 00:00:04,200\n"
            f"   ❌ Wrong: 00:00:01.500 --> 00:00:04.200\n"
            f"3) NO punctuation at sentence end: NO 。，！？\n"
            f"4) Empty line between subtitle blocks\n"
            f"5) Time ranges must match actual video content\n"
            f"6) Use reasonable subtitle duration (2-5 seconds per subtitle)\n"
            f"7) NO extra spaces, tabs, or special formatting\n\n"
            f"Now respond appropriately based on the request type."
        )

        # Explicitly create a Part for the video file, referencing it by URI and MIME type
        video_file_part = types.Part(
            file_data={
                'file_uri': file_object_for_gemini.uri,
                'mime_type': file_object_for_gemini.mime_type
            }
        )
        
        request_contents = [
            types.Part(text=prompt_for_gemini),
            video_file_part
        ]

        # --- Call Gemini API with Streaming and Process Response ---
        progress.update("ai_generating", 75, "开始流式AI生成...")
        progress.update("streaming", 75, "AI正在分析视频...")
        print(f"Sending to Gemini with streaming multimodal prompt (using file: {file_object_for_gemini.name if file_object_for_gemini else 'N/A'}) and tool: {execute_ffmpeg_with_optional_subtitles_declaration.name}")
        
        generate_content_start_time = time.time()
        
        # 使用流式API
        stream = await asyncio.to_thread(
            client.models.generate_content_stream,
            model=f'models/{MODEL_NAME}',
            contents=[types.Content(parts=request_contents)],
            config=types.GenerateContentConfig(
                tools=[types.Tool(function_declarations=[execute_ffmpeg_with_optional_subtitles_declaration])],
                tool_config=tool_config_video,
                temperature=0.3
            )
        )
        
        # 处理流式响应
        accumulated_response = None
        tool_call_result = None
        
        for chunk in stream:
            if chunk.candidates and len(chunk.candidates) > 0:
                candidate = chunk.candidates[0]
                
                if candidate.content and candidate.content.parts:
                    for part in candidate.content.parts:
                        # 处理文本流
                        if hasattr(part, 'text') and part.text:
                            # Gemini返回的文本块，我们需要人工创建流式效果
                            chunk_text = part.text
                            print(f"Gemini返回文本块 (长度: {len(chunk_text)}): {repr(chunk_text)}")
                            
                            # 逐字符添加，创建流式效果
                            for char in chunk_text:
                                progress.append_streaming_text(char)
                                # 小延迟以创建打字机效果（实际项目中可以调整或去掉）
                                await asyncio.sleep(0.02)  # 20ms每字符
                        
                        # 处理工具调用
                        elif hasattr(part, 'function_call') and part.function_call:
                            function_call = part.function_call
                            if function_call.name == execute_ffmpeg_with_optional_subtitles_declaration.name:
                                args = function_call.args
                                command_array = args.get("command_array")
                                output_filename = args.get("output_filename")
                                subtitles_content = args.get("subtitles_content", "") 
                                subtitles_filename = args.get("subtitles_filename", "")
                                
                                print(f"Gemini tool call received: {function_call.name} with args: {args}")
                                tool_call_result = {
                                    "tool_call": {
                                        "name": function_call.name,
                                        "arguments": {
                                            "command_array": command_array,
                                            "output_filename": output_filename,
                                            "subtitles_content": subtitles_content,
                                            "subtitles_filename": subtitles_filename
                                        }
                                    }
                                }
                
                # 保存最后的candidate用于最终检查
                accumulated_response = candidate
        
        generate_content_duration = time.time() - generate_content_start_time
        print(f"PERF: client.models.generate_content_stream took {generate_content_duration:.2f} seconds.")
        
        # 完成流式传输
        progress.complete_streaming()
        progress.update("ai_generating", 90, "处理AI回复...")
        
        # 处理最终结果
        if tool_call_result:
            # 工具调用结果
            progress.result = tool_call_result
            progress.update("complete", 100, "工具调用完成")
            return
        elif progress.streaming_text:
            # 文本响应
            result = {"text_response": progress.streaming_text.strip()}
            progress.result = result
            progress.update("complete", 100, "文本分析完成")
            return
        else:
            # 处理错误情况
            if accumulated_response:
                if accumulated_response.finish_reason != types.FinishReason.STOP:
                    print(f"Gemini generation stopped due to: {accumulated_response.finish_reason.name}")
                    if accumulated_response.safety_ratings:
                        for rating in accumulated_response.safety_ratings:
                            print(f"Safety Rating: {rating.category.name} - {rating.probability.name}")
                    progress.update("error", 0, f"Gemini生成停止: {accumulated_response.finish_reason.name}")
                    return
            progress.update("error", 0, "Gemini未返回有效的回复")
            return



    except Exception as e:
        print(f"Error in process_video_task: {str(e)}")
        progress.update("error", 0, f"处理过程中出现错误: {str(e)}")


