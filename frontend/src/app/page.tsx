"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";

const SunIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-6.364-.386 1.591-1.591M3 12h2.25m.386-6.364 1.591 1.591"
    />
  </svg>
);

const MoonIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
    />
  </svg>
);

// The API call is now handled by the backend for security.

// Placeholder for a notebook icon, replace with actual SVG or image component if available
const NotebookIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-24 h-24 text-gray-300 dark:text-dropzone-border"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
    />
  </svg>
);

const FONT_URL = "/SourceHanSansSC-Regular.otf"; // Load from public directory
const FONT_DIR_IN_FS = "/customfonts"; // Directory for fonts in FFmpeg's virtual FS
const FONT_ACTUAL_FILENAME = "SourceHanSansSC-Regular.otf"; // Actual name of the font file

export default function VideoAiPage() {
  const [theme, setTheme] = useState("light");
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [outputMimeType, setOutputMimeType] = useState<string | null>(null);
  const [outputActualFilename, setOutputActualFilename] = useState<
    string | null
  >(null);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [naturalLanguageInput, setNaturalLanguageInput] = useState<string>("");
  const [generatedFfmpegCommand, setGeneratedFfmpegCommand] = useState<
    string | null
  >(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textOutput, setTextOutput] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lastProcessedVideoFile, setLastProcessedVideoFile] =
    useState<File | null>(null);

  // Upload progress states

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "dark" ? "light" : "dark"));
  };

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadFfmpeg = async () => {
      const ffmpegInstance = new FFmpeg();
      ffmpegInstance.on("log", ({ message }) => {
        // Prevent duplicate "处理完成" messages if FFMPEG_END is already handled
        if (
          message.startsWith("FFMPEG_END") &&
          logs[logs.length - 1] === "处理完成。"
        )
          return;
        setLogs((prev) => [
          ...prev,
          message.startsWith("FFMPEG_END") ? "处理完成。" : message,
        ]);
      });
      ffmpegInstance.on("progress", ({ progress }) => {
        if (progress > 0 && progress <= 1)
          setProgress(Math.round(progress * 100));
      });

      ffmpegRef.current = ffmpegInstance;

      // 从本地public目录加载FFmpeg文件
      // 不需要使用toBlobURL，因为文件已经在本地服务器上

      try {
        await ffmpegInstance.load({
          coreURL: "/ffmpeg-core.js",
          wasmURL: "/ffmpeg-core.wasm",
          workerURL: "/ffmpeg-core.worker.js", // 直接使用本地文件路径
          // You can also pass arguments to enable threading,
          // though often just providing the worker is enough for it to attempt to use threads.
          // For explicit control, some versions might use:
          // initialArgs: ['-threads', 'auto'], // or a specific number like '4'
          // Or within coreOptions if supported by this specific instantiation method
        });
        setFfmpegLoaded(true);
        setLogs((prev) => [...prev, "FFmpeg 加载成功 (多线程模式)。"]);
      } catch (err) {
        console.error("Error loading FFmpeg with multithreading:", err);
        setError("FFmpeg 加载失败 (多线程尝试)。请检查控制台获取详细信息。");
        setLogs((prev) => [...prev, "错误：FFmpeg 加载失败 (多线程尝试)。"]);
      }
    };
    if (!ffmpegRef.current?.loaded) {
      // Ensure loadFfmpeg is called only if not loaded
      loadFfmpeg();
    }
  }, []); // Empty dependency array means this runs once on mount

  const resetStateForNewFile = () => {
    setOutputUrl(null);
    setOutputMimeType(null);
    setOutputActualFilename(null);
    setLogs([logs[0] || "FFmpeg 日志将显示在此处。"]); // 保留初始的 FFmpeg 加载信息
    setProgress(0);
    setGeneratedFfmpegCommand(null);
    setError(null);
  };

  const handleFileSelect = (file: File | null) => {
    if (file) {
      setVideoFile(file);
      const objectURL = URL.createObjectURL(file);
      setVideoUrl(objectURL);
      resetStateForNewFile();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(event.target.files?.[0] || null);
  };

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      handleFileSelect(event.dataTransfer.files[0]);
    }
  }, []);

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(true);
    },
    []
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
    },
    []
  );

  interface AiResponse {
    tool_call?: {
      name: string;
      arguments: {
        command_array?: string[];
        output_filename?: string;
        subtitles_content?: string; // For SRT/VTT content
        subtitles_filename?: string; // e.g., 'subs.srt'
      };
    };
    text_response?: string;
    error?: string; // For backend or network errors
  }

  const getAiAssistance = async (
    currentPrompt: string,
    currentVideoFile: File | null,
    lastVideoFile: File | null
  ): Promise<{ response: AiResponse; videoWasSent: boolean }> => {
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8002";
    const formData = new FormData();
    formData.append("prompt", currentPrompt);

    let sendVideo = false;
    if (currentVideoFile) {
      if (!lastVideoFile) {
        sendVideo = true;
      } else {
        // Compare current selected file with the last successfully processed one
        if (
          currentVideoFile.name !== lastVideoFile.name ||
          currentVideoFile.size !== lastVideoFile.size
        ) {
          sendVideo = true;
        }
      }
    }

    if (sendVideo && currentVideoFile) {
      formData.append("video_file", currentVideoFile);
      console.log("Sending video file to backend:", currentVideoFile.name);
    } else {
      console.log(
        "Not sending video file to backend, will use cached version if available."
      );
    }

    try {
      const response = await fetch(
        `${backendUrl}/api/generate-command-with-video`,
        {
          method: "POST",
          body: formData, // Browser sets 'Content-Type': 'multipart/form-data' automatically
        }
      );

      if (!response.ok) {
        let errorDetail = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorDetail = errorData.detail || JSON.stringify(errorData);
        } catch {
          errorDetail = (await response.text()) || errorDetail;
        }
        return { response: { error: errorDetail }, videoWasSent: sendVideo };
      }
      const data: AiResponse = await response.json();
      return { response: data, videoWasSent: sendVideo };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      // When a fetch-level error occurs, videoWasSent reflects the intention before the failed fetch.
      return {
        response: { error: `Network or client-side error: ${errorMessage}` },
        videoWasSent: sendVideo,
      };
    }
  };

  const getMimeType = (filename: string): string => {
    const extension = filename.split(".").pop()?.toLowerCase();
    switch (extension) {
      case "mp4":
        return "video/mp4";
      case "webm":
        return "video/webm";
      case "mov":
        return "video/quicktime";
      case "avi":
        return "video/x-msvideo";
      case "mkv":
        return "video/x-matroska";
      case "gif":
        return "image/gif";
      case "mp3":
        return "audio/mpeg";
      case "wav":
        return "audio/wav";
      default:
        return "application/octet-stream";
    }
  };

  const loadFont = async () => {
    setLogs((prev) => [...prev, "Checking for existing font in FFmpeg FS..."]);
    if (!ffmpegRef.current || !ffmpegRef.current.loaded) {
      const notLoadedMsg = "FFmpeg is not loaded yet, cannot load font.";
      setError(notLoadedMsg);
      setLogs((prev) => [...prev, notLoadedMsg]);
      return false;
    }

    const fullPathInFs = `${FONT_DIR_IN_FS}/${FONT_ACTUAL_FILENAME}`;

    try {
      // Attempt to read the font file to see if it already exists
      await ffmpegRef.current.readFile(fullPathInFs);
      setLogs((prev) => [
        ...prev,
        `Font ${FONT_ACTUAL_FILENAME} already exists at ${fullPathInFs}. Skipping reload.`,
      ]);
      return true; // Font is already there
    } catch {
      // This catch block means the file likely doesn't exist, or there was an FS error trying to read it.
      // We should proceed to load it.
      setLogs((prev) => [
        ...prev,
        `Font not found at ${fullPathInFs} or error checking. Proceeding to load font...`,
      ]);
    }

    // If we reach here, font needs to be loaded
    setLogs((prev) => [...prev, "Loading font..."]);
    try {
      const fontResponse = await fetch(FONT_URL);
      if (!fontResponse.ok) {
        throw new Error(
          `Failed to fetch font: ${fontResponse.status} ${fontResponse.statusText}`
        );
      }
      const fontData = await fontResponse.arrayBuffer();

      await ffmpegRef.current.createDir(FONT_DIR_IN_FS); // Ensure directory exists
      setLogs((prev) => [
        ...prev,
        `Ensured directory ${FONT_DIR_IN_FS} exists or was created.`,
      ]);

      await ffmpegRef.current.writeFile(fullPathInFs, new Uint8Array(fontData));
      setLogs((prev) => [...prev, `Font loaded and saved as ${fullPathInFs}`]);
      return true;
    } catch (error: unknown) {
      let detailMessage = "No specific error message available.";
      if (error instanceof Error && error.message) {
        detailMessage = error.message;
      } else if (typeof error === "string" && error) {
        detailMessage = error;
      } else {
        // Try to stringify, but be cautious as it might be circular or too large
        try {
          const errorString = String(error);
          // Avoid logging generic "[object Object]" if String() doesn't provide more detail
          if (errorString && errorString !== "[object Object]") {
            detailMessage = errorString;
          } else {
            detailMessage =
              "Caught an error object without a standard message. Check browser console for details.";
            console.error("Raw error caught in loadFont:", error); // Log raw error to console
          }
        } catch {
          detailMessage =
            "Caught an error, and failed to stringify it. Check browser console for details.";
          console.error(
            "Raw error caught in loadFont (stringify failed):",
            error
          );
        }
      }
      const errorMessage = `Error loading font: ${detailMessage}`;
      setError(errorMessage);
      // Add a note to check console for potentially more detailed raw error object
      setLogs((prev) => [
        ...prev,
        errorMessage,
        `(See browser console for full error details if needed)`,
      ]);
      return false;
    }
  };

  const runFfmpeg = async (command: string[], outputFilename: string) => {
    if (!ffmpegRef.current) {
      setError("FFmpeg instance not available in runFfmpeg.");
      setLogs((prevLogs: string[]) => [
        ...prevLogs,
        "Error: FFmpeg instance not available in runFfmpeg.",
      ]);
      return;
    }
    const ffmpeg = ffmpegRef.current;

    try {
      setLogs((prevLogs: string[]) => [
        ...prevLogs,
        `Executing FFmpeg command: ffmpeg ${command.join(" ")}`,
      ]);
      await ffmpeg.exec(command);
      setLogs((prevLogs: string[]) => [
        ...prevLogs,
        `Command executed. Reading output file: ${outputFilename}`,
      ]);

      const data = await ffmpeg.readFile(outputFilename);
      setLogs((prevLogs: string[]) => [
        ...prevLogs,
        `Output file ${outputFilename} read successfully. Size: ${data.length} bytes.`,
      ]);

      const mimeType = getMimeType(outputFilename);
      setOutputMimeType(mimeType);
      setOutputActualFilename(outputFilename);
      const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
      setOutputUrl(url);
      setLogs((prevLogs: string[]) => [
        ...prevLogs,
        `Output available: ${outputFilename}`,
      ]);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setError(`Error in runFfmpeg: ${errorMessage}`);
      setLogs((prevLogs: string[]) => [
        ...prevLogs,
        `FFmpeg execution error: ${errorMessage}`,
      ]);
    }
  };

  const processVideo = async () => {
    if (!ffmpegLoaded) {
      setError("FFmpeg is not loaded yet. Please wait.");
      return;
    }

    if (!videoFile) {
      setError("Please select a video file first.");
      return;
    }

    if (!naturalLanguageInput.trim()) {
      setError("Please enter a natural language instruction.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setOutputUrl(null);
    setTextOutput(null);
    setGeneratedFfmpegCommand(null);
    setLogs([]);
    setProgress(0);

    try {
      setLogs((prevLogs) => [
        ...prevLogs,
        "Sending video and prompt to AI for processing...",
      ]);
      // Pass videoFile (current selection) and lastProcessedVideoFile to getAiAssistance
      const { response: aiResult, videoWasSent } = await getAiAssistance(
        naturalLanguageInput,
        videoFile,
        lastProcessedVideoFile
      );
      setLogs((prevLogs) => [
        ...prevLogs,
        `AI Raw Response: ${JSON.stringify(aiResult, null, 2)}`,
      ]);

      if (
        aiResult.tool_call &&
        aiResult.tool_call.name === "execute_ffmpeg_with_optional_subtitles" &&
        aiResult.tool_call.arguments
      ) {
        const args = aiResult.tool_call.arguments;
        const command_array = args.command_array as string[];
        const output_filename = args.output_filename as string;
        const subtitles_content = args.subtitles_content as string | undefined;
        const subtitles_filename = args.subtitles_filename as
          | string
          | undefined;

        if (
          command_array &&
          Array.isArray(command_array) &&
          command_array.length > 0 &&
          output_filename
        ) {
          setGeneratedFfmpegCommand(`ffmpeg ${command_array.join(" ")}`);
          setLogs((prevLogs) => [
            ...prevLogs,
            `AI tool call: ffmpeg ${command_array.join(" ")}`,
          ]);

          if (!ffmpegRef.current) {
            setError("FFmpeg instance is not available. Please reload.");
            setIsProcessing(false);
            return;
          }

          // Extract the input filename from the command array
          let ffmpegInputFilename = "input.mp4"; // Default fallback
          const inputFlagIndex = command_array.indexOf("-i");
          if (
            inputFlagIndex !== -1 &&
            inputFlagIndex + 1 < command_array.length
          ) {
            ffmpegInputFilename = command_array[inputFlagIndex + 1];
          }
          setLogs((prevLogs) => [
            ...prevLogs,
            `Identified FFmpeg input filename from AI command: ${ffmpegInputFilename}`,
          ]);

          setLogs((prevLogs) => [
            ...prevLogs,
            `Writing video to FFmpeg.wasm virtual filesystem as ${ffmpegInputFilename}...`,
          ]);
          // Ensure videoFile is not null before accessing arrayBuffer
          if (videoFile) {
            await ffmpegRef.current.writeFile(
              ffmpegInputFilename,
              new Uint8Array(await videoFile.arrayBuffer())
            );
            setLogs((prevLogs) => [
              ...prevLogs,
              `${ffmpegInputFilename} written to FFmpeg.wasm. Size: ${(
                videoFile.size /
                1024 /
                1024
              ).toFixed(2)} MB.`,
            ]);
          } else {
            setError("Video file is missing, cannot write to FFmpeg.wasm.");
            setLogs((prevLogs) => [
              ...prevLogs,
              "Error: Video file is missing.",
            ]);
            setIsProcessing(false);
            return; // Exit if videoFile is null
          }

          const fontLoaded = await loadFont();
          if (!fontLoaded) {
            if (!error)
              setError("Font loading failed, preventing further processing.");
            setIsProcessing(false);
            return;
          }

          if (subtitles_content && subtitles_filename) {
            setLogs((prevLogs) => [
              ...prevLogs,
              `Attempting to write subtitles to FFmpeg.wasm as ${subtitles_filename}...`,
            ]);
            try {
              await ffmpegRef.current.writeFile(
                subtitles_filename,
                subtitles_content
              );
              setLogs((prevLogs) => [
                ...prevLogs,
                `Successfully wrote subtitles to ${subtitles_filename}.`,
              ]);
            } catch (subError: unknown) {
              const subErrorMessage = `Error writing subtitles (${subtitles_filename}) to FFmpeg.wasm: ${
                subError instanceof Error ? subError.message : "Unknown error"
              }`;
              setError(subErrorMessage);
              setLogs((prevLogs) => [...prevLogs, subErrorMessage]);
              setIsProcessing(false);
              return;
            }
          }

          setLogs((prevLogs) => [...prevLogs, "Executing FFmpeg command..."]);
          await runFfmpeg(command_array, output_filename);
        } else {
          const missingArgsError =
            "AI response tool_call missing critical arguments (command_array or output_filename).";
          setError(missingArgsError);
          setLogs((prevLogs) => [...prevLogs, `Error: ${missingArgsError}`]);
        }
      } else if (aiResult.text_response) {
        setTextOutput(aiResult.text_response);
        setLogs((prevLogs) => [...prevLogs, "AI returned a text response."]);
      } else if (aiResult.error) {
        setError(`AI Service Error: ${aiResult.error}`);
        setLogs((prevLogs) => [
          ...prevLogs,
          `Error from AI service: ${aiResult.error}`,
        ]);
      } else {
        const unexpectedResponseError =
          "Received an unexpected response structure from AI backend.";
        setError(unexpectedResponseError);
        setLogs((prevLogs) => [
          ...prevLogs,
          `Error: ${unexpectedResponseError}`,
        ]);
      }

      // If AI processing was successful (no error from AI and we got a tool_call or text_response)
      // update the last processed video file if a video was actually sent and processed successfully.
      if (
        videoWasSent &&
        videoFile &&
        !aiResult.error &&
        (aiResult.tool_call || aiResult.text_response)
      ) {
        setLastProcessedVideoFile(videoFile); // Use videoFile from processVideo's scope
      } else if (
        !videoWasSent &&
        !aiResult.error &&
        (aiResult.tool_call || aiResult.text_response)
      ) {
        // If we didn't send a video (meaning we intended to use cache) and it was successful,
        // the lastProcessedVideoFile (which should be same as videoFile in this case if user hasn't changed selection)
        // remains valid. No change needed to lastProcessedVideoFile.
      } else if (aiResult.error) {
        // If there was an error, the concept of 'last successfully processed video' might be less certain.
        // For now, we leave lastProcessedVideoFile as is. If the error was due to the video itself,
        // the user would likely select a new one, which would then correctly be sent.
        // If the error was transient, retrying might work with the cached video (if not sent) or by resending.
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setError(`Overall processing error: ${errorMessage}`);
      setLogs((prevLogs) => [
        ...prevLogs,
        `Error during video processing: ${errorMessage}`,
      ]);
    } finally {
      setIsProcessing(false);
      setLogs((prevLogs) => [...prevLogs, "Processing finished."]);
    }
  }; // End of processVideo function

  // Main JSX return for VideoAiPage component
  return (
    <div className="min-h-screen bg-linear-to-b from-white to-light-green-start dark:bg-none dark:bg-dark-bg text-gray-800 dark:text-text-light p-4 sm:p-6 lg:p-8 flex flex-col items-center font-sans transition-colors duration-300">
      <div className="max-w-3xl w-full space-y-6 md:space-y-8">
        <header className="text-center w-full relative">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-text-light">
            AI 视频增强工具
          </h1>
          <p className="text-gray-600 dark:text-text-muted mt-2">
            上传您的视频，使用 AI 指令编辑和增强您的内容
          </p>
          <button
            onClick={toggleTheme}
            className="absolute top-0 right-0 p-2 rounded-full text-gray-500 dark:text-text-muted hover:bg-gray-100 dark:hover:bg-input-bg transition-colors"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <SunIcon className="w-6 h-6" />
            ) : (
              <MoonIcon className="w-6 h-6" />
            )}
          </button>
        </header>

        {error && !isProcessing && (
          <div className="bg-red-100 border border-red-400 text-red-700 dark:bg-red-800 dark:border-red-700 dark:text-red-200 p-3 rounded-md text-sm w-full">
            <p className="font-semibold">错误：</p>
            <p>{error}</p>
          </div>
        )}

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`rounded-xl p-6 sm:p-8 text-center space-y-3 transition-all duration-300 backdrop-blur-lg shadow-lg border
              ${
                isDragging
                  ? "bg-light-glass-bg/95 dark:bg-dark-glass-bg/95 border-green-500 dark:border-accent-green"
                  : "bg-light-glass-bg dark:bg-dark-glass-bg border-white/20 dark:border-white/10"
              }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="video/*"
            className="hidden"
            disabled={isProcessing}
          />
          <p className="text-lg font-medium text-gray-800 dark:text-text-light">
            将视频文件拖放到此处
          </p>
          <p className="text-sm text-gray-500 dark:text-text-muted">
            或浏览以从您的计算机中选择文件
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-text-muted font-medium py-2 px-4 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors ring-1 ring-inset ring-black/10 dark:ring-white/20 shadow-xs"
          >
            浏览文件
          </button>
          {videoUrl && (
            <div className="mt-4">
              <video
                src={videoUrl}
                controls
                className="max-h-60 w-auto mx-auto rounded-md bg-black"
              />
            </div>
          )}
        </div>

        <div className="flex items-end space-x-3">
          <textarea
            placeholder="输入处理指令（例如：'转换为gif'，'从10秒裁剪到15秒'，'加中英双语字幕'，'总结视频内容'等）"
            value={naturalLanguageInput}
            onChange={(e) => setNaturalLanguageInput(e.target.value)}
            rows={3}
            className="grow bg-light-glass-bg dark:bg-dark-glass-bg backdrop-blur-lg shadow-inner border border-white/20 dark:border-white/10 rounded-xl p-3 text-gray-900 dark:text-text-light focus:ring-2 focus:ring-green-500 dark:focus:ring-accent-green focus:outline-none placeholder-gray-500 dark:placeholder-text-muted disabled:opacity-50 resize-none transition-colors"
            disabled={isProcessing || !ffmpegLoaded}
          />
          <button
            onClick={processVideo}
            disabled={
              !ffmpegLoaded ||
              isProcessing ||
              !videoFile ||
              !naturalLanguageInput.trim()
            }
            className="shrink-0 bg-green-500 hover:bg-green-600 text-white dark:bg-accent-green dark:hover:bg-accent-green-darker dark:text-dark-bg font-bold py-3 px-6 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all h-[calc(3*1.5rem+2*0.75rem+2px)] shadow-lg ring-1 ring-inset ring-white/75 dark:ring-black/30"
          >
            {isProcessing ? (
              <div className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white dark:text-dark-bg"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                处理中...
              </div>
            ) : (
              "执行"
            )}
          </button>
        </div>

        {generatedFfmpegCommand && (
          <div className="rounded-xl bg-light-glass-bg dark:bg-dark-glass-bg backdrop-blur-lg shadow-lg border border-white/20 dark:border-white/10 p-3">
            <p className="text-sm text-gray-500 dark:text-text-muted">
              生成的 FFmpeg 命令：
            </p>
            <code className="block bg-gray-900 dark:bg-black p-2 rounded-md text-xs text-green-400 dark:text-accent-green overflow-x-auto font-mono mt-1">
              {generatedFfmpegCommand}
            </code>
          </div>
        )}

        {isProcessing && progress > 0 && (
          <div className="w-full bg-gray-200 dark:bg-input-bg rounded-full h-2.5 mt-4">
            <div
              className="bg-green-500 dark:bg-accent-green h-2.5 rounded-full transition-all duration-300 ease-linear"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-text-light mb-3">
              处理日志
            </h2>
            <div className="rounded-xl bg-light-glass-bg dark:bg-dark-glass-bg backdrop-blur-lg shadow-lg border border-white/20 dark:border-white/10 p-3 h-64 overflow-y-auto text-xs font-mono text-gray-600 dark:text-text-muted space-y-1">
              {logs.length === 0 && <p>暂无日志。开始处理以查看日志。</p>}
              {logs.map((log, i) => (
                <p
                  key={i}
                  className={`${
                    log.toLowerCase().includes("error") ||
                    log.toLowerCase().includes("错误")
                      ? "text-red-600 dark:text-red-400"
                      : ""
                  }`}
                >
                  {log}
                </p>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-text-light mb-3">
              输出结果
            </h2>
            <div className="rounded-xl bg-light-glass-bg dark:bg-dark-glass-bg backdrop-blur-lg shadow-lg border border-white/20 dark:border-white/10 p-4 h-64 flex flex-col items-center justify-center text-center">
              {isProcessing && !outputUrl && !textOutput && (
                <p className="text-gray-500 dark:text-text-muted">
                  正在处理视频，请稍候...
                </p>
              )}
              {!isProcessing && error && (
                <div className="text-red-500 dark:text-red-400 p-4 text-left">
                  <p className="font-bold">An error occurred:</p>
                  <p className="text-sm mt-1">{error}</p>
                </div>
              )}
              {!isProcessing && !error && outputUrl && (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  {outputMimeType?.startsWith("video/") ? (
                    <video
                      src={outputUrl}
                      controls
                      className="max-w-full max-h-[calc(100%-40px)] rounded-md bg-black"
                    />
                  ) : outputMimeType?.startsWith("audio/") ? (
                    <audio src={outputUrl} controls className="w-full" />
                  ) : outputMimeType?.startsWith("image/") ? (
                    <img
                      src={outputUrl}
                      alt="处理后的输出"
                      className="max-w-full max-h-[calc(100%-40px)] rounded-md"
                    />
                  ) : (
                    <p className="text-gray-500 dark:text-text-muted">
                      此文件类型无法预览。
                    </p>
                  )}
                  {outputActualFilename && (
                    <a
                      href={outputUrl}
                      download={outputActualFilename}
                      className="mt-3 bg-green-500 hover:bg-green-600 text-white dark:bg-accent-green dark:hover:bg-accent-green-darker dark:text-dark-bg font-semibold py-1.5 px-3 rounded-xl text-sm transition-colors shadow-md ring-1 ring-inset ring-white/75 dark:ring-black/30"
                    >
                      下载 {outputActualFilename}
                    </a>
                  )}
                </div>
              )}
              {!isProcessing && !outputUrl && textOutput && (
                <div className="p-4 text-left w-full h-full overflow-y-auto">
                  <p className="text-sm mt-1">{textOutput}</p>
                </div>
              )}
              {!isProcessing && !outputUrl && !textOutput && !error && (
                <div className="space-y-2 flex flex-col items-center">
                  <NotebookIcon />
                  <p className="font-semibold text-gray-800 dark:text-text-light">
                    暂无结果
                  </p>
                  <p className="text-sm text-gray-500 dark:text-text-muted">
                    处理视频或获取文本分析后在此处查看输出
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  ); // End of main return for VideoAiPage
} // End of VideoAiPage component
