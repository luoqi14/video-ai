import os
from google import genai
from fastapi import FastAPI, File, UploadFile, HTTPException, Form

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



current_video_state = CurrentVideoState()

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
    
    file_object_for_gemini: Optional[types.File] = None
    original_video_filename_for_prompt: str = "input.mp4" # Default
    temp_file_path = None # Initialize for cleanup

    if video_file and video_file.filename: # New video file is provided
        print(f"Processing new video file: {video_file.filename}")
        
        video_content = await video_file.read()
        video_mime_type = video_file.content_type
        
        # Create temp file
        file_suffix = os.path.splitext(video_file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_suffix) as tmp:
            tmp.write(video_content)
            temp_file_path = tmp.name
        
        print(f"Video content (size: {len(video_content)}) saved to temp file: {temp_file_path}")
        print(f"Uploading temporary video file to Google: {video_file.filename}, mime_type: {video_mime_type}")

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
        print(f"Initial file upload response. Name: {uploaded_file_obj.name}, Display Name: {uploaded_file_obj.display_name}, URI: {uploaded_file_obj.uri}, State: {uploaded_file_obj.state.name if uploaded_file_obj.state else 'UNKNOWN'}")
        
        # Wait for file to be processed
        processing_wait_start_time = time.time()
        while uploaded_file_obj.state and uploaded_file_obj.state.name == "PROCESSING":
            print(f"File {uploaded_file_obj.name} is still PROCESSING. Waiting 1 seconds...")
            await asyncio.sleep(1)
            
            retrieved_file = client.files.get(name=uploaded_file_obj.name)
            if retrieved_file and retrieved_file.state:
                uploaded_file_obj = retrieved_file
                print(f"Updated file state: {uploaded_file_obj.name} is now {uploaded_file_obj.state.name}")
            else:
                print(f"Warning: client.files.get for {uploaded_file_obj.name} returned invalid data or state. Retrying...")
        
        processing_wait_duration = time.time() - processing_wait_start_time
        print(f"PERF: File state change from PROCESSING to ACTIVE took {processing_wait_duration:.2f} seconds.")
        
        if not (uploaded_file_obj.state and uploaded_file_obj.state.name == "ACTIVE"):
            raise HTTPException(status_code=500, detail=f"Uploaded file {uploaded_file_obj.name} did not become ACTIVE.")
        
        print(f"File {uploaded_file_obj.name} is ACTIVE.")
        current_video_state.google_file_name = uploaded_file_obj.name
        current_video_state.original_file_name = video_file.filename
        current_video_state.mime_type = video_mime_type
        file_object_for_gemini = uploaded_file_obj
        original_video_filename_for_prompt = video_file.filename

        # Clean up temp file
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
            print(f"Temporary file {temp_file_path} deleted.")
                    
    elif current_video_state.google_file_name:
        print(f"No new video file. Using last uploaded: {current_video_state.google_file_name} (Original: {current_video_state.original_file_name})")
        original_video_filename_for_prompt = current_video_state.original_file_name or "input.mp4"
        
        retrieved_file = client.files.get(name=current_video_state.google_file_name)
        while retrieved_file.state and retrieved_file.state.name == "PROCESSING":
            print(f"File {retrieved_file.name} is PROCESSING. Waiting 1 seconds...")
            time.sleep(1)
            retrieved_file = client.files.get(name=current_video_state.google_file_name) # Re-fetch
        
        if not (retrieved_file.state and retrieved_file.state.name == "ACTIVE"):
            raise HTTPException(status_code=500, detail=f"Previously uploaded file {current_video_state.google_file_name} not ACTIVE. State: {retrieved_file.state.name if retrieved_file.state else 'UNKNOWN'}. Please re-upload.")
        
        print(f"Successfully retrieved and confirmed ACTIVE status for {current_video_state.google_file_name}")
        file_object_for_gemini = retrieved_file
    else:
        raise HTTPException(status_code=400, detail="No video file provided and no previous video found to process.")

    # --- At this point, file_object_for_gemini and original_video_filename_for_prompt are set ---

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
        f"- **Subtitles**: If the instruction is about generating or burning in subtitles, create the content for 'subtitles_content' and a 'subtitles_filename'. When burning subtitles, your `command_array` MUST include the filter `subtitles=<subtitles_filename>:fontsdir=/customfonts:force_style='Fontname=Source Han Sans SC'`. The font 'SourceHanSansSC-Regular.otf' is available in '/customfonts'. If no subtitles are needed, provide empty strings for 'subtitles_content' and 'subtitles_filename'.\n\n"
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

    # --- Call Gemini API and Process Response ---
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


