import os
from google import genai
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import StreamingResponse
from typing import Optional, AsyncGenerator
from fastapi.middleware.cors import CORSMiddleware
import tempfile
import os
import time
from pydantic import BaseModel
from dotenv import load_dotenv
from google.genai import types
import asyncio
import json

# Load environment variables from .env file
load_dotenv()

# --- Global State for Current Video (Simple In-Memory) ---
class CurrentVideoState:
    def __init__(self):
        self.google_file_name: Optional[str] = None
        self.original_file_name: Optional[str] = None
        self.mime_type: Optional[str] = None

# --- 实时进度更新系统 ---
from asyncio import Queue
import asyncio.events

# 存储客户端队列的字典 {connection_id: asyncio.Queue}
client_queues = {}

# 获取事件循环，如果在线程中没有事件循环则创建一个新的
# 这解决了在同步代码中调用异步函数的问题
def get_or_create_eventloop():
    """获取当前线程的事件循环，如果不存在则创建新的"""
    try:
        return asyncio.get_event_loop()
    except RuntimeError as ex:
        if "There is no current event loop in thread" in str(ex):
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            return loop
        raise

# --- Upload Progress Manager ---
class UploadProgressManager:
    def __init__(self):
        self.progress = 0
        self.status = "idle"
        self.message = None
        self.updates = []  # 存储所有更新
    
    def update(self, progress=None, status=None, message=None):
        """更新进度，状态和消息（同步方法）"""
        # 只更新提供的值
        if progress is not None:
            self.progress = progress
        if status is not None:
            self.status = status
        if message is not None:
            self.message = message
            
        # 创建更新对象
        update = {
            "progress": self.progress,
            "status": self.status,
            "message": self.message
        }
        
        # 存储更新
        self.updates.append(update)
        
        # 将更新放入异步队列（不阻塞当前线程）
        try:
            loop = get_or_create_eventloop()
            asyncio.run_coroutine_threadsafe(self._send_update_to_queue(update), loop)
        except Exception as e:
            print(f"Error sending update to queue: {e}")
        
        print(f"Upload Progress: {self.progress}% - {self.status} - {self.message}")
    
    async def _send_update_to_queue(self, update):
        """将更新发送到所有客户端队列"""
        # 发送到所有客户端队列
        for client_id, queue in client_queues.items():
            try:
                await queue.put(update)
            except Exception as e:
                print(f"Error sending to client {client_id}: {e}")
    
    def get_updates(self, start_index=0):
        """获取从指定索引开始的所有更新"""
        return self.updates[start_index:]
    
    def get_last_update_index(self):
        """获取最后一个更新的索引"""
        return len(self.updates) - 1
    
    def reset(self):
        """重置进度"""
        self.progress = 0
        self.status = "idle"
        self.message = None
        self.updates = []  # 清空更新历史
        
        # 创建重置更新
        reset_update = {
            "progress": self.progress,
            "status": self.status,
            "message": self.message
        }
        
        # 将重置更新放入队列
        try:
            loop = get_or_create_eventloop()
            asyncio.run_coroutine_threadsafe(self._send_update_to_queue(reset_update), loop)
        except Exception as e:
            print(f"Error sending reset update to queue: {e}")

current_video_state = CurrentVideoState()
upload_progress = UploadProgressManager()

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
    "http://localhost:3000",
    "http://127.0.0.1:3000",
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
                description="The FFmpeg command arguments as an array of strings (without 'ffmpeg' at the beginning). Example: ['-i', 'input.mp4', '-vf', 'subtitles=subs.srt', 'output.mp4']"
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

@app.post("/api/generate-command-with-video")
async def generate_command_with_video(prompt: str = Form(...), video_file: Optional[UploadFile] = File(None)):
    print(f"Received prompt for video processing: {prompt}, and video: {video_file.filename if video_file else 'No new video file provided (will attempt to use previous)'}")
    
    # Reset upload progress at the start
    upload_progress.reset()
    
    file_object_for_gemini: Optional[types.File] = None
    original_video_filename_for_prompt: str = "input.mp4" # Default
    temp_file_path = None # Initialize for finally block

    if video_file and video_file.filename: # New video file is provided
        print(f"Processing new video file: {video_file.filename}")
        upload_progress.update(5, "uploading", f"准备上传文件: {video_file.filename}")
        await asyncio.sleep(0.001)
        
        video_content = await video_file.read()
        video_mime_type = video_file.content_type
        upload_progress.update(15, "uploading", "文件读取完成，准备上传到 Gemini")
        await asyncio.sleep(0.001)
        
        try:
            file_suffix = os.path.splitext(video_file.filename)[1]
            with tempfile.NamedTemporaryFile(delete=False, suffix=file_suffix) as tmp:
                tmp.write(video_content)
                temp_file_path = tmp.name
            
            print(f"Video content (size: {len(video_content)}) saved to temp file: {temp_file_path}")
            upload_progress.update(25, "uploading", f"开始上传到 Gemini (文件大小: {len(video_content)} bytes)")
            print(f"Uploading temporary video file to Google: {video_file.filename}, mime_type: {video_mime_type}")
            await asyncio.sleep(0.001)

            upload_config = types.UploadFileConfig(
                mime_type=video_mime_type,
                display_name=video_file.filename
            )
            upload_start_time = time.time()
            uploaded_file_obj = client.files.upload(
                file=temp_file_path,
                config=upload_config
            )
            upload_duration = time.time() - upload_start_time
            print(f"PERF: client.files.upload took {upload_duration:.2f} seconds.")
            upload_progress.update(60, "processing", f"文件上传完成，等待 Gemini 处理")
            print(f"Initial file upload response. Name: {uploaded_file_obj.name}, Display Name: {uploaded_file_obj.display_name}, URI: {uploaded_file_obj.uri}, State: {uploaded_file_obj.state.name if uploaded_file_obj.state else 'UNKNOWN'}")
            await asyncio.sleep(0.001)
            
            # Wait for file to be processed
            wait_progress = 60
            processing_wait_start_time = time.time()
            while uploaded_file_obj.state and uploaded_file_obj.state.name == "PROCESSING":
                wait_progress = min(90, wait_progress + 5)  # Gradually increase progress to 90%
                upload_progress.update(wait_progress, "processing", f"Gemini 正在处理文件 {uploaded_file_obj.name}")
                await asyncio.sleep(0.001)
                print(f"File {uploaded_file_obj.name} is still PROCESSING. Waiting 1 seconds...")
                await asyncio.sleep(1)
                try:
                    retrieved_file = client.files.get(name=uploaded_file_obj.name)
                    if retrieved_file and retrieved_file.state:
                        uploaded_file_obj = retrieved_file
                        print(f"Updated file state: {uploaded_file_obj.name} is now {uploaded_file_obj.state.name}")
                    else:
                        print(f"Warning: client.files.get for {uploaded_file_obj.name} returned invalid data or state. Retrying...")
                except Exception as e_get_file:
                    print(f"Error calling client.files.get(name='{uploaded_file_obj.name}'): {e_get_file}. Will retry.")
            
            processing_wait_duration = time.time() - processing_wait_start_time
            print(f"PERF: File state change from PROCESSING to ACTIVE took {processing_wait_duration:.2f} seconds.")
            if not (uploaded_file_obj.state and uploaded_file_obj.state.name == "ACTIVE"):
                upload_progress.update(100, "error", f"文件未能变为 ACTIVE 状态")
                raise HTTPException(status_code=500, detail=f"Uploaded file {uploaded_file_obj.name} did not become ACTIVE.")
            
            upload_progress.update(100, "completed", f"文件上传并处理完成: {uploaded_file_obj.name}")
            print(f"File {uploaded_file_obj.name} is ACTIVE.")
            current_video_state.google_file_name = uploaded_file_obj.name
            current_video_state.original_file_name = video_file.filename
            current_video_state.mime_type = video_mime_type
            file_object_for_gemini = uploaded_file_obj
            original_video_filename_for_prompt = video_file.filename

        except Exception as e:
            print(f"Error during new video processing (upload stage): {e}")
            upload_progress.update(100, "error", f"Error during new video processing (upload stage): {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to process new video (upload stage): {str(e)}")
        finally:
            if temp_file_path and os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                    print(f"Temporary file {temp_file_path} deleted.")
                except OSError as e_remove:
                    print(f"Error deleting temporary file {temp_file_path}: {e_remove}")
    elif current_video_state.google_file_name:
        print(f"No new video file. Using last uploaded: {current_video_state.google_file_name} (Original: {current_video_state.original_file_name})")
        original_video_filename_for_prompt = current_video_state.original_file_name or "input.mp4"
        try:
            retrieved_file = client.files.get(name=current_video_state.google_file_name)
            while retrieved_file.state and retrieved_file.state.name == "PROCESSING":
                print(f"File {retrieved_file.name} is PROCESSING. Waiting 1 seconds...")
                time.sleep(1)
                retrieved_file = client.files.get(name=current_video_state.google_file_name) # Re-fetch
            
            if not (retrieved_file.state and retrieved_file.state.name == "ACTIVE"):
                raise HTTPException(status_code=500, detail=f"Previously uploaded file {current_video_state.google_file_name} not ACTIVE. State: {retrieved_file.state.name if retrieved_file.state else 'UNKNOWN'}. Please re-upload.")
            
            print(f"Successfully retrieved and confirmed ACTIVE status for {current_video_state.google_file_name}")
            upload_progress.update(100, "completed", f"使用缓存文件 {current_video_state.google_file_name}")
            file_object_for_gemini = retrieved_file
        except Exception as e_get:
            print(f"Error retrieving or confirming status for {current_video_state.google_file_name}: {e_get}")
            # Clear state if file is problematic
            current_video_state.google_file_name = None
            current_video_state.original_file_name = None
            current_video_state.mime_type = None
            raise HTTPException(status_code=500, detail=f"Failed to retrieve previous video. Please re-upload. Error: {str(e_get)}")
    else:
        # This case should ideally be caught by frontend logic if it ensures a video is always selected for the first prompt.
        # However, if backend is called directly or state is lost, this is a fallback.
        raise HTTPException(status_code=400, detail="No video file provided and no previous video found to process.")

    # --- At this point, file_object_for_gemini and original_video_filename_for_prompt are set ---

    # --- Construct the prompt for Gemini ---
    tool_config_video = types.Tool(function_declarations=[execute_ffmpeg_with_optional_subtitles_declaration])
    user_natural_language_prompt = prompt
    fixed_ffmpeg_input_filename = original_video_filename_for_prompt

    prompt_for_gemini = (
        f"You are a helpful AI assistant. The user has provided a video file named '{fixed_ffmpeg_input_filename}'.\n"
        f"The user's instruction is: '{user_natural_language_prompt}'.\n\n"
        f"Based on this, you have two choices:\n"
        f"1. **Direct Text Answer**: If the instruction is a question about the video's content (e.g., 'summarize this video', 'what is in this video?', 'how many people are in this scene?'), provide a direct, concise answer. Do not invoke any tools for this.\n"
        f"2. **Video Processing Tool Call**: If the instruction requires transforming or editing the video (e.g., 'convert to GIF', 'trim the video', 'extract audio', 'add subtitles'), you MUST call the 'execute_ffmpeg_with_optional_subtitles' tool. Do not attempt to answer directly if a tool call is appropriate.\n\n"
        f"**Tool Usage Details for 'execute_ffmpeg_with_optional_subtitles'**:\n"
        f"- The user's video is available as '{fixed_ffmpeg_input_filename}'. This MUST be the input file in your FFmpeg command.\n"
        f"- Generate the `command_array` (the arguments for FFmpeg, without 'ffmpeg' itself), the `output_filename`, and subtitle information if needed.\n"
        f"- **Subtitles**: If the instruction is about generating or burning in subtitles, create the content for 'subtitles_content' and a 'subtitles_filename'. When burning subtitles, your `command_array` MUST include the filter `subtitles=<subtitles_filename>:fontsdir=/customfonts:force_style='Fontname=Source Han Sans SC'`. The font 'SourceHanSansSC-Regular.otf' is available in '/customfonts'. If no subtitles are needed, provide empty strings for 'subtitles_content' and 'subtitles_filename'.\n\n"
        f"**Decision Time**: Now, based on the instruction '{prompt}', decide whether to provide a direct text answer or to call the video processing tool. Please ensure all direct text answers are in Chinese."
    )

    # file_object_for_gemini is the File object from client.files.get() or client.files.upload()
    # It has attributes like .name (resource name like 'files/xxx'), .uri, .mime_type

    # Explicitly create a Part for the video file, referencing it by URI and MIME type
    # This avoids passing along potentially problematic metadata from the full File object.
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

    # --- Call Gemini API and Process Response ---
    try:
        print(f"Sending to Gemini with multimodal prompt (using file: {file_object_for_gemini.name if file_object_for_gemini else 'N/A'}) and tool: {execute_ffmpeg_with_optional_subtitles_declaration.name}")
        
        generate_content_start_time = time.time()
        response = client.models.generate_content(
            model=f'models/{MODEL_NAME}',
            contents=[types.Content(parts=request_contents)], # Ensure parts are wrapped in types.Content
            config=types.GenerateContentConfig(
                tools=[types.Tool(function_declarations=[execute_ffmpeg_with_optional_subtitles_declaration])],
                tool_config=tool_config_video,
                temperature=0.3
            )
        )
        
        generate_content_duration = time.time() - generate_content_start_time
        print(f"PERF: client.models.generate_content took {generate_content_duration:.2f} seconds.")
        print(f"Full Gemini response for video: {response}")
        candidate = response.candidates[0]

        if not candidate.content or not candidate.content.parts:
            print(f"Gemini response (video) is missing content or parts. Full response: {response}")
            if candidate.finish_reason != types.FinishReason.STOP:
                 print(f"Gemini generation (video) stopped due to: {candidate.finish_reason.name}")
                 if candidate.safety_ratings:
                     for rating in candidate.safety_ratings:
                         print(f"Safety Rating: {rating.category.name} - {rating.probability.name}")
                 raise HTTPException(status_code=500, detail=f"Gemini generation (video) stopped: {candidate.finish_reason.name}")
            raise HTTPException(status_code=500, detail="Gemini (video) returned empty content or parts.")

        part = candidate.content.parts[0]
        if part.function_call:
            function_call = part.function_call
            if function_call.name == execute_ffmpeg_with_optional_subtitles_declaration.name:
                args = function_call.args
                command_array = args.get("command_array")
                output_filename = args.get("output_filename")
                subtitles_content = args.get("subtitles_content", "") 
                subtitles_filename = args.get("subtitles_filename", "")
                
                if not command_array or not isinstance(command_array, list) or not output_filename:
                    print(f"Error: Gemini tool call (video) missing command_array (or it's not a list/is empty) or output_filename. Args: {args}")
                    text_fb = "Gemini tool call (video) missing required arguments (command_array or output_filename), or command_array is not a list/is empty."
                    if response.text: text_fb = response.text.strip()
                    elif hasattr(part, 'text') and part.text: text_fb = part.text.strip()
                    return {"error": text_fb, "text_response": text_fb}

                print(f"Gemini (video) wants to call tool '{function_call.name}' with command_array: {command_array}, output: '{output_filename}', subtitles_file: '{subtitles_filename}'")
                return {
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
            else:
                print(f"Gemini (video) called an unexpected function: {function_call.name}")
                text_resp_unexp = f"Gemini (video) called an unexpected function: {function_call.name}"
                if response.text: text_resp_unexp = response.text.strip()
                return {"text_response": text_resp_unexp, "error": f"Unexpected tool: {function_call.name}"}
        
        text_response_found = None
        if candidate.content and candidate.content.parts:
            for p_item in candidate.content.parts:
                if hasattr(p_item, 'text') and p_item.text:
                    text_response_found = p_item.text.strip()
                    break
        
        if text_response_found:
            print(f"Gemini (video) returned text response: {text_response_found}")
            return {"text_response": text_response_found}
        else:
            print(f"Gemini response (video) did not contain a valid function call or text. Parts: {candidate.content.parts}")
            raise HTTPException(status_code=500, detail="Gemini (video) did not return a usable function call or text response.")

    except HTTPException as http_exc:
        # Re-raise HTTPExceptions that might have occurred during file processing or explicitly raised
        raise http_exc
    except Exception as e:
        print(f"Error during Gemini API call or processing (video): {e}")
        # Avoid trying to print 'response' if it's not defined (e.g., error before API call)
        # It's better to rely on the specific exception 'e' for details.
        raise HTTPException(status_code=500, detail=f"Error processing request with Gemini (video): {str(e)}")

@app.get("/api/upload-progress")
async def upload_progress_stream():
    # 生成唯一的连接ID
    import uuid
    connection_id = str(uuid.uuid4())
    
    print(f"New client connected to upload_progress_stream (ID: {connection_id}). Current status: {upload_progress.status}")
    
    # Reset progress when a new client connects if previous upload was completed
    if upload_progress.status == "completed" or upload_progress.status == "error":
        print("Resetting upload progress state due to new client connection")
        upload_progress.reset()
    
    # 为该客户端创建专用队列
    client_queue = Queue()
    client_queues[connection_id] = client_queue
    print(f"Created queue for connection {connection_id}. Active connections: {len(client_queues)}")
    
    async def event_generator():
        try:
            # 发送初始状态
            initial_data = {
                "progress": upload_progress.progress,
                "status": upload_progress.status,
                "message": upload_progress.message or "连接到上传进度流"
            }
            print(f"Sending initial progress state: {initial_data}")
            yield f"data: {json.dumps(initial_data)}\n\n"
            
            # 获取并发送历史更新
            historical_updates = upload_progress.get_updates()
            sent_updates = set()  # 记录已经发送过的更新
            
            for update in historical_updates:
                update_hash = f"{update['progress']}-{update['status']}-{update['message']}"
                if update_hash not in sent_updates:
                    print(f"Sending historical update: {update}")
                    yield f"data: {json.dumps(update)}\n\n"
                    sent_updates.add(update_hash)
                    
                    # 如果是最终状态，结束流
                    if update["status"] in ["completed", "error"]:
                        print(f"Ending progress stream due to final status: {update['status']}")
                        return
            
            # 持续监听新更新
            heartbeat_counter = 0
            while True:
                try:
                    # 等待新的更新，带超时
                    update = await asyncio.wait_for(client_queue.get(), timeout=0.1)
                    
                    # 发送更新
                    update_hash = f"{update['progress']}-{update['status']}-{update['message']}"
                    if update_hash not in sent_updates:
                        print(f"Sending real-time update to {connection_id}: {update}")
                        yield f"data: {json.dumps(update)}\n\n"
                        sent_updates.add(update_hash)
                        
                        # 如果是最终状态，结束流
                        if update["status"] in ["completed", "error"]:
                            print(f"Ending progress stream due to final status: {update['status']}")
                            return
                    
                    # 重置心跳计数器
                    heartbeat_counter = 0
                    
                except asyncio.TimeoutError:
                    # 没有新更新，增加心跳计数器
                    heartbeat_counter += 1
                    
                    # 每秒发送一次心跳包
                    if heartbeat_counter >= 10:  # 10 * 0.1s = 1s
                        yield f"data: {json.dumps({'heartbeat': True})}\n\n"
                        heartbeat_counter = 0
                        
        finally:
            # 移除客户端队列
            if connection_id in client_queues:
                del client_queues[connection_id]
                print(f"Removed queue for connection {connection_id}. Active connections: {len(client_queues)}")
            print(f"Client disconnected from upload_progress_stream (ID: {connection_id})")




    return StreamingResponse(event_generator(), media_type="text/event-stream")
