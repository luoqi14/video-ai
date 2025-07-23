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

  // 进度跟踪状态
  const [progressStage, setProgressStage] = useState<string>("");
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [startTime, setStartTime] = useState<number>(0);

  // 流式响应状态
  const [streamingText, setStreamingText] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  // 字幕相关状态
  const [subtitlesContent, setSubtitlesContent] = useState<string>("");
  const [subtitlesFilename, setSubtitlesFilename] = useState<string>("");
  const [showSubtitlePreview, setShowSubtitlePreview] =
    useState<boolean>(false);

  // 视频缓存状态 - 跟踪已上传的视频文件
  const [lastUploadedVideoFile, setLastUploadedVideoFile] =
    useState<File | null>(null);

  // 智能滚动相关状态和引用
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const outputContainerRef = useRef<HTMLDivElement>(null);
  const [isLogsAtBottom, setIsLogsAtBottom] = useState(true);
  const [isOutputAtBottom, setIsOutputAtBottom] = useState(true);
  const [userScrolledLogs, setUserScrolledLogs] = useState(false);
  const [userScrolledOutput, setUserScrolledOutput] = useState(false);

  // Upload progress states

  // 智能滚动检测函数
  const checkScrollPosition = useCallback(
    (
      container: HTMLDivElement,
      setIsAtBottom: (value: boolean) => void,
      setUserScrolled: (value: boolean) => void
    ) => {
      if (!container) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 3; // 3px tolerance

      setIsAtBottom(isAtBottom);

      // 如果用户滚动到了非底部位置，标记为用户滚动
      if (!isAtBottom) {
        setUserScrolled(true);
      } else if (isAtBottom) {
        // 如果回到底部，重置用户滚动标记
        setUserScrolled(false);
      }
    },
    []
  );

  // 自动滚动到底部函数
  const scrollToBottom = useCallback((container: HTMLDivElement | null) => {
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  // 监听日志变化，智能滚动
  useEffect(() => {
    if (logsContainerRef.current && isLogsAtBottom && !userScrolledLogs) {
      scrollToBottom(logsContainerRef.current);
    }
  }, [logs, isLogsAtBottom, userScrolledLogs, scrollToBottom]);

  // 监听流式文本变化，智能滚动
  useEffect(() => {
    if (
      outputContainerRef.current &&
      isOutputAtBottom &&
      !userScrolledOutput &&
      isStreaming
    ) {
      scrollToBottom(outputContainerRef.current);
    }
  }, [
    streamingText,
    isOutputAtBottom,
    userScrolledOutput,
    isStreaming,
    scrollToBottom,
  ]);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // 独立计时器 - 不依赖轮询，保证计时不卡顿
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    if (isProcessing && startTime > 0) {
      timer = setInterval(() => {
        const now = Date.now();
        setElapsedTime((now - startTime) / 1000);
      }, 100); // 每100ms更新一次，确保流畅
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [isProcessing, startTime]);

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

    // 重置滚动状态
    setIsLogsAtBottom(true);
    setIsOutputAtBottom(true);
    setUserScrolledLogs(false);
    setUserScrolledOutput(false);

    // 重置字幕和预览状态
    setSubtitlesContent("");
    setSubtitlesFilename("");
    setShowSubtitlePreview(false);
  };

  const handleFileSelect = (file: File | null) => {
    if (file) {
      // 检查是否是同一个文件（基于基本属性比较）
      const isSameFile =
        lastUploadedVideoFile &&
        lastUploadedVideoFile.name === file.name &&
        lastUploadedVideoFile.size === file.size &&
        lastUploadedVideoFile.lastModified === file.lastModified;

      if (!isSameFile) {
        setLastUploadedVideoFile(null); // 清除缓存标记
      }

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

  // 启动处理任务
  const startProcessingTask = async (
    currentPrompt: string,
    currentVideoFile: File | null
  ): Promise<string> => {
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8002";

    const formData = new FormData();
    formData.append("prompt", currentPrompt);

    // 智能缓存逻辑：只有在文件真正改变时才上传
    const shouldUploadVideo =
      currentVideoFile &&
      (lastUploadedVideoFile === null ||
        lastUploadedVideoFile.name !== currentVideoFile.name ||
        lastUploadedVideoFile.size !== currentVideoFile.size ||
        lastUploadedVideoFile.lastModified !== currentVideoFile.lastModified);

    if (shouldUploadVideo) {
      formData.append("video_file", currentVideoFile);
      setLastUploadedVideoFile(currentVideoFile); // 更新缓存标记
    }

    const response = await fetch(`${backendUrl}/api/start-processing`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      let errorDetail = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorDetail = errorData.detail || JSON.stringify(errorData);
      } catch {
        errorDetail = (await response.text()) || errorDetail;
      }
      throw new Error(errorDetail);
    }

    const data = await response.json();
    return data.task_id;
  };

  // SSE流式响应处理
  const handleStreamingResponse = async (taskId: string): Promise<void> => {
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8002";

    setIsStreaming(true);
    setStreamingText("");

    const eventSource = new EventSource(`${backendUrl}/api/stream/${taskId}`);

    eventSource.onopen = () => {
      setLogs((prevLogs) => [...prevLogs, "🔗 流式连接已建立"]);
    };

    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "chunk") {
          // 接收到文本块，追加到流式文本
          setStreamingText((prev) => prev + data.text);
        } else if (data.type === "complete") {
          // 流式完成
          setIsStreaming(false);
          eventSource.close();

          // 处理最终结果
          if (data.result) {
            const result = data.result;
            if (result.tool_call) {
              setGeneratedFfmpegCommand(
                `ffmpeg ${result.tool_call.arguments.command_array.join(" ")}`
              );
              setLogs((prevLogs) => [
                ...prevLogs,
                `AI工具调用: ffmpeg ${result.tool_call.arguments.command_array.join(
                  " "
                )}`,
              ]);

              // 保存字幕信息
              if (result.tool_call.arguments.subtitles_content) {
                setSubtitlesContent(
                  result.tool_call.arguments.subtitles_content
                );
                setSubtitlesFilename(
                  result.tool_call.arguments.subtitles_filename ||
                    "subtitles.srt"
                );
                setLogs((prevLogs) => [
                  ...prevLogs,
                  `字幕文件已生成: ${
                    result.tool_call.arguments.subtitles_filename ||
                    "subtitles.srt"
                  }`,
                ]);
              }

              // 执行FFmpeg
              await executeFFmpegCommand(result.tool_call.arguments);
            } else if (result.subtitle_generation) {
              // 处理纯字幕生成结果
              setSubtitlesContent(
                result.subtitle_generation.arguments.subtitles_content
              );
              setSubtitlesFilename(
                result.subtitle_generation.arguments.subtitles_filename ||
                  "subtitles.srt"
              );

              // 设置文本输出显示描述
              setTextOutput(result.subtitle_generation.arguments.description);

              setLogs((prevLogs) => [
                ...prevLogs,
                `字幕文件已生成: ${result.subtitle_generation.arguments.subtitles_filename}`,
                `内容描述: ${result.subtitle_generation.arguments.description}`,
              ]);
            } else if (result.text_response) {
              // 对于流式文本响应，不再设置textOutput，避免重复显示
              // streamingText已经包含了完整内容
              setLogs((prevLogs) => [...prevLogs, "AI文本分析完成"]);
            }
          }

          setIsProcessing(false);
          setStartTime(0); // 重置计时器
        } else if (data.type === "error") {
          setError(`处理错误: ${data.message}`);
          setIsStreaming(false);
          setIsProcessing(false);
          setStartTime(0); // 重置计时器
          eventSource.close();
        }
      } catch (error) {
        console.error("Error parsing SSE data:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      setIsStreaming(false);
      eventSource.close();

      // 回退到轮询模式
      setLogs((prevLogs) => [...prevLogs, "流式连接断开，切换到轮询模式"]);
      pollProgress(taskId);
    };

    // 同时启动轮询来跟踪进度（不包括AI生成阶段）
    pollProgressForStreaming(taskId);
  };

  // 专门用于流式模式的进度轮询（只跟踪前期进度）
  const pollProgressForStreaming = async (taskId: string): Promise<void> => {
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8002";

    try {
      const response = await fetch(`${backendUrl}/api/progress/${taskId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const progressData = await response.json();
      setProgressStage(progressData.stage);
      setProgressMessage(progressData.message);
      // elapsedTime现在由独立计时器管理，不再从轮询更新
      setProgress(progressData.percentage);

      // 添加日志
      const stageTranslations: { [key: string]: string } = {
        starting: "开始处理",
        initializing: "初始化",
        uploading: "上传中",
        google_processing: "Google处理",
        ai_generating: "AI生成",
        streaming: "流式响应",
        complete: "完成",
        error: "错误",
      };

      const stageText =
        stageTranslations[progressData.stage] || progressData.stage;
      const logMessage = `[${stageText}] ${progressData.percentage}% - ${progressData.message}`;

      setLogs((prevLogs) => {
        const lastLog = prevLogs[prevLogs.length - 1];
        if (lastLog !== logMessage) {
          return [...prevLogs, logMessage];
        }
        return prevLogs;
      });

      // 只在非流式阶段继续轮询
      if (
        progressData.stage !== "streaming" &&
        progressData.stage !== "complete" &&
        progressData.stage !== "error"
      ) {
        setTimeout(() => pollProgressForStreaming(taskId), 1000);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Error polling progress:", errorMessage);
    }
  };

  // 查询进度（传统轮询模式，保留作为备用）
  const pollProgress = async (taskId: string): Promise<void> => {
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8002";

    try {
      const response = await fetch(`${backendUrl}/api/progress/${taskId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const progressData = await response.json();
      setProgressStage(progressData.stage);
      setProgressMessage(progressData.message);
      // elapsedTime现在由独立计时器管理，不再从轮询更新
      setProgress(progressData.percentage);

      // 添加日志
      const stageTranslations: { [key: string]: string } = {
        starting: "开始处理",
        initializing: "初始化",
        uploading: "上传中",
        google_processing: "Google处理",
        ai_generating: "AI生成",
        streaming: "流式响应",
        complete: "完成",
        error: "错误",
      };

      const stageText =
        stageTranslations[progressData.stage] || progressData.stage;
      const logMessage = `[${stageText}] ${progressData.percentage}% - ${progressData.message}`;

      setLogs((prevLogs) => {
        const lastLog = prevLogs[prevLogs.length - 1];
        if (lastLog !== logMessage) {
          return [...prevLogs, logMessage];
        }
        return prevLogs;
      });

      if (progressData.stage === "complete" && progressData.result) {
        // 处理完成，设置结果
        const result = progressData.result;
        if (result.tool_call) {
          setGeneratedFfmpegCommand(
            `ffmpeg ${result.tool_call.arguments.command_array.join(" ")}`
          );
          setLogs((prevLogs) => [
            ...prevLogs,
            `AI工具调用: ffmpeg ${result.tool_call.arguments.command_array.join(
              " "
            )}`,
          ]);

          // 保存字幕信息
          if (result.tool_call.arguments.subtitles_content) {
            setSubtitlesContent(result.tool_call.arguments.subtitles_content);
            setSubtitlesFilename(
              result.tool_call.arguments.subtitles_filename || "subtitles.srt"
            );
          }

          // 执行FFmpeg
          await executeFFmpegCommand(result.tool_call.arguments);
        } else if (result.subtitle_generation) {
          // 处理纯字幕生成结果
          setSubtitlesContent(
            result.subtitle_generation.arguments.subtitles_content
          );
          setSubtitlesFilename(
            result.subtitle_generation.arguments.subtitles_filename ||
              "subtitles.srt"
          );

          // 设置文本输出显示描述
          setTextOutput(result.subtitle_generation.arguments.description);

          setLogs((prevLogs) => [
            ...prevLogs,
            `字幕文件已生成: ${result.subtitle_generation.arguments.subtitles_filename}`,
            `内容描述: ${result.subtitle_generation.arguments.description}`,
          ]);
        } else if (result.text_response) {
          setTextOutput(result.text_response);
          setLogs((prevLogs) => [...prevLogs, "AI返回文本回复"]);
        }

        setIsProcessing(false);
        setStartTime(0); // 重置计时器
        return;
      } else if (progressData.stage === "error") {
        setError(`处理错误: ${progressData.error_message}`);
        setLogs((prevLogs) => [
          ...prevLogs,
          `错误: ${progressData.error_message}`,
        ]);
        setIsProcessing(false);
        setStartTime(0); // 重置计时器
        return;
      }

      // 继续轮询
      if (progressData.stage !== "complete" && progressData.stage !== "error") {
        setTimeout(() => pollProgress(taskId), 1000); // 1秒后再次查询
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Error polling progress:", errorMessage);
      setError(`查询进度时出错: ${errorMessage}`);
      setIsProcessing(false);
      setStartTime(0); // 重置计时器
    }
  };

  // 执行FFmpeg命令
  const executeFFmpegCommand = async (toolArgs: {
    command_array: string[];
    output_filename: string;
    subtitles_content?: string;
    subtitles_filename?: string;
  }) => {
    if (!ffmpegRef.current) {
      setError("FFmpeg实例不可用");
      return;
    }

    const {
      command_array,
      output_filename,
      subtitles_content,
      subtitles_filename,
    } = toolArgs;

    try {
      setLogs((prevLogs) => [...prevLogs, "开始在浏览器中执行FFmpeg..."]);

      // 确保视频文件已写入FFmpeg文件系统
      if (videoFile) {
        const inputFilename = "input.mp4"; // 固定输入文件名
        await ffmpegRef.current.writeFile(
          inputFilename,
          new Uint8Array(await videoFile.arrayBuffer())
        );
        setLogs((prevLogs) => [
          ...prevLogs,
          `视频文件已写入FFmpeg文件系统: ${inputFilename}`,
        ]);
      }

      // 智能字体加载：检查是否需要字体
      const commandString = command_array.join(" ");
      const fontRelatedPatterns = [
        /subtitles=/i, // 字幕滤镜
        /force_style=/i, // 强制样式
        /fontsdir=/i, // 字体目录
        /fontname=/i, // 字体名称
        /font.*=.*['"]/i, // 字体相关参数
        /style.*font/i, // 样式中的字体
      ];

      const needsFont = fontRelatedPatterns.some((pattern) =>
        pattern.test(commandString)
      );

      if (needsFont) {
        setLogs((prevLogs) => [...prevLogs, "🔤 检测到需要字体，正在加载..."]);
        const fontLoaded = await loadFont();
        if (!fontLoaded) {
          setLogs((prevLogs) => [
            ...prevLogs,
            "⚠️ 字体加载失败，字幕可能使用默认字体",
          ]);
          // 不再直接返回，允许继续执行
        } else {
          setLogs((prevLogs) => [...prevLogs, "✅ 字体加载成功"]);
        }
      } else {
        setLogs((prevLogs) => [
          ...prevLogs,
          "ℹ️ 当前命令无需字体，跳过字体下载",
        ]);
      }

      // 写入字幕文件（如果有）
      if (subtitles_content && subtitles_filename) {
        await ffmpegRef.current.writeFile(
          subtitles_filename,
          subtitles_content
        );
        setLogs((prevLogs) => [
          ...prevLogs,
          `字幕文件已写入: ${subtitles_filename}`,
        ]);
      }

      // 执行FFmpeg命令
      await runFfmpeg(command_array, output_filename);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setError(`FFmpeg执行错误: ${errorMessage}`);
      setLogs((prevLogs) => [...prevLogs, `FFmpeg执行错误: ${errorMessage}`]);
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

  // 下载字幕文件
  const downloadSubtitles = () => {
    if (!subtitlesContent || !subtitlesFilename) return;

    const blob = new Blob([subtitlesContent], {
      type: "text/plain; charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = subtitlesFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setLogs((prevLogs) => [
      ...prevLogs,
      `已下载字幕文件: ${subtitlesFilename}`,
    ]);
  };

  // 烧录字幕到视频
  const burnSubtitlesToVideo = async () => {
    if (!ffmpegLoaded) {
      setError("FFmpeg尚未加载完成，请稍候");
      return;
    }

    if (!videoFile) {
      setError("没有视频文件，请重新上传视频");
      return;
    }

    if (!subtitlesContent || !subtitlesFilename) {
      setError("没有字幕内容可以烧录");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setOutputUrl(null);
    setProgress(0);
    setStartTime(Date.now());

    try {
      setLogs((prevLogs) => [...prevLogs, "开始烧录字幕到视频..."]);

      // 确保字体加载
      const fontLoaded = await loadFont();
      if (!fontLoaded) {
        setError("字体加载失败，无法烧录中文字幕");
        setIsProcessing(false);
        return;
      }

      const ffmpeg = ffmpegRef.current!;

      // 写入视频文件到FFmpeg文件系统
      setLogs((prevLogs) => [...prevLogs, "正在加载视频文件到FFmpeg..."]);

      const videoData = new Uint8Array(await videoFile.arrayBuffer());
      await ffmpeg.writeFile("input.mp4", videoData);

      // 写入字幕文件到FFmpeg文件系统 - 使用安全的文件名
      const safeSubtitleFilename = "subtitles.srt";
      setLogs((prevLogs) => [
        ...prevLogs,
        `正在加载字幕文件: ${safeSubtitleFilename}`,
      ]);

      await ffmpeg.writeFile(safeSubtitleFilename, subtitlesContent);

      // 构建FFmpeg命令 - 烧录字幕
      const outputFilename = "video_with_subtitles.mp4";
      const command = [
        "-i",
        "input.mp4",
        "-vf",
        `subtitles=${safeSubtitleFilename}:fontsdir=/customfonts:force_style='Fontname=Source Han Sans SC'`,
        "-c:a",
        "copy",
        outputFilename,
      ];

      setLogs((prevLogs) => [
        ...prevLogs,
        `执行FFmpeg命令: ffmpeg ${command.join(" ")}`,
      ]);

      // 执行FFmpeg命令
      await runFfmpeg(command, outputFilename);

      setLogs((prevLogs) => [...prevLogs, "字幕烧录完成！"]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      setError(`烧录字幕时出错: ${errorMessage}`);
      setLogs((prevLogs) => [...prevLogs, `错误: ${errorMessage}`]);
    } finally {
      setIsProcessing(false);
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
    setProgressStage("");
    setProgressMessage("");
    setElapsedTime(0);
    // 设置开始时间，启动独立计时器
    setStartTime(Date.now());
    // 重置流式状态
    setStreamingText("");
    setIsStreaming(false);
    // 重置字幕状态
    setSubtitlesContent("");
    setSubtitlesFilename("");
    setShowSubtitlePreview(false);

    try {
      // 启动后台处理任务
      const taskId = await startProcessingTask(naturalLanguageInput, videoFile);
      setLogs((prevLogs) => [...prevLogs, `任务已启动，ID: ${taskId}`]);

      // 使用流式响应处理
      await handleStreamingResponse(taskId);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setError(`启动处理任务失败: ${errorMessage}`);
      setLogs((prevLogs) => [...prevLogs, `启动处理任务失败: ${errorMessage}`]);
      setIsProcessing(false);
      setIsStreaming(false);
      setStartTime(0); // 重置计时器
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
                  ? "bg-light-glass-bg/95 dark:bg-dark-glass-bg/95 border-accent-green dark:border-accent-green"
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
            placeholder="输入处理指令（例如：'转换为gif'，'从10秒裁剪到15秒'，‘生成字幕文件’，'加中英双语字幕'，'总结视频内容'等）"
            value={naturalLanguageInput}
            onChange={(e) => setNaturalLanguageInput(e.target.value)}
            rows={3}
            className="grow bg-light-glass-bg dark:bg-dark-glass-bg backdrop-blur-lg shadow-inner border border-white/20 dark:border-white/10 rounded-xl p-3 text-gray-900 dark:text-text-light focus:ring-2 focus:ring-accent-green dark:focus:ring-accent-green focus:outline-none placeholder-gray-500 dark:placeholder-text-muted disabled:opacity-50 resize-none transition-colors"
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
            className="shrink-0 bg-accent-green hover:bg-accent-green-darker text-dark-bg dark:bg-accent-green dark:hover:bg-accent-green-darker dark:text-dark-bg font-bold py-3 px-6 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all h-[calc(3*1.5rem+2*0.75rem+2px)] shadow-lg ring-1 ring-inset ring-white/75 dark:ring-black/30"
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
            <code className="block bg-gray-900 dark:bg-black p-2 rounded-md text-xs text-accent-green dark:text-accent-green overflow-x-auto font-mono mt-1">
              {generatedFfmpegCommand}
            </code>
          </div>
        )}

        {/* 字幕下载区域 */}
        {subtitlesContent && (
          <div className="rounded-xl bg-light-glass-bg dark:bg-dark-glass-bg backdrop-blur-lg shadow-lg border border-white/20 dark:border-white/10 p-3">
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500 dark:text-text-muted">
                  生成的字幕文件：
                </p>
                <p className="text-xs text-gray-400 dark:text-text-muted mt-1">
                  {subtitlesFilename} • SRT 格式
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setShowSubtitlePreview(true)}
                  className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-3 rounded-lg text-sm transition-colors shadow-md"
                >
                  预览字幕
                </button>
                <button
                  onClick={downloadSubtitles}
                  className="bg-accent-green hover:bg-accent-green-darker text-dark-bg dark:bg-accent-green dark:hover:bg-accent-green-darker dark:text-dark-bg font-semibold py-2 px-3 rounded-lg text-sm transition-colors shadow-md ring-1 ring-inset ring-white/75 dark:ring-black/30"
                >
                  下载字幕
                </button>
                {videoFile && !isProcessing && (
                  <button
                    onClick={burnSubtitlesToVideo}
                    className="bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-3 rounded-lg text-sm transition-colors shadow-md"
                  >
                    烧录视频
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="rounded-xl bg-light-glass-bg dark:bg-dark-glass-bg backdrop-blur-lg shadow-lg border border-white/20 dark:border-white/10 p-4 mt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700 dark:text-text-light">
                处理进度
              </h3>
              <span className="text-xs text-gray-500 dark:text-text-muted">
                {Math.floor(elapsedTime)}秒
              </span>
            </div>

            <div className="w-full bg-gray-200 dark:bg-input-bg rounded-full h-2.5 mb-3">
              <div
                className="bg-accent-green dark:bg-accent-green h-2.5 rounded-full transition-all duration-300 ease-linear"
                style={{ width: `${progress}%` }}
              ></div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600 dark:text-text-muted">
                {progressMessage || "正在处理..."}
              </span>
              <span className="font-medium text-gray-700 dark:text-text-light">
                {progress}%
              </span>
            </div>

            {progressStage && (
              <div className="mt-2 text-xs text-gray-500 dark:text-text-muted">
                当前阶段: {progressStage}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-text-light mb-3">
              处理日志
            </h2>
            <div
              ref={logsContainerRef}
              onScroll={() =>
                checkScrollPosition(
                  logsContainerRef.current!,
                  setIsLogsAtBottom,
                  setUserScrolledLogs
                )
              }
              className="rounded-xl bg-light-glass-bg dark:bg-dark-glass-bg backdrop-blur-lg shadow-lg border border-white/20 dark:border-white/10 p-3 h-64 overflow-y-auto text-xs font-mono text-gray-600 dark:text-text-muted space-y-1"
            >
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
              {isProcessing && !outputUrl && !textOutput && !isStreaming && (
                <p className="text-gray-500 dark:text-text-muted">
                  正在处理视频，请稍候...
                </p>
              )}

              {/* 流式文本显示 */}
              {(isStreaming || (streamingText && !isProcessing)) && (
                <div
                  ref={outputContainerRef}
                  onScroll={() =>
                    checkScrollPosition(
                      outputContainerRef.current!,
                      setIsOutputAtBottom,
                      setUserScrolledOutput
                    )
                  }
                  className="w-full h-full overflow-y-auto text-left"
                >
                  <div className="flex items-center mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-text-light">
                      AI分析结果
                    </span>
                    {isStreaming && (
                      <span className="ml-2 animate-pulse text-accent-green dark:text-accent-green">
                        ●
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-800 dark:text-text-light leading-relaxed whitespace-pre-wrap">
                    {streamingText}
                    {isStreaming && (
                      <span className="ml-1 animate-pulse text-accent-green dark:text-accent-green">
                        |
                      </span>
                    )}
                  </div>
                  {isStreaming && (
                    <div className="mt-2 text-xs text-gray-500 dark:text-text-muted">
                      正在分析视频内容...
                    </div>
                  )}
                </div>
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
                      className="mt-3 bg-accent-green hover:bg-accent-green-darker text-dark-bg dark:bg-accent-green dark:hover:bg-accent-green-darker dark:text-dark-bg font-semibold py-1.5 px-3 rounded-xl text-sm transition-colors shadow-md ring-1 ring-inset ring-white/75 dark:ring-black/30"
                    >
                      下载 {outputActualFilename}
                    </a>
                  )}
                </div>
              )}
              {!isProcessing && !outputUrl && textOutput && !streamingText && (
                <div className="p-4 text-left w-full h-full overflow-y-auto">
                  <p className="text-sm mt-1">{textOutput}</p>
                </div>
              )}
              {!isProcessing &&
                !outputUrl &&
                !textOutput &&
                !error &&
                !streamingText && (
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

      {/* 字幕预览模态框 */}
      {showSubtitlePreview && subtitlesContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl max-h-[80vh] w-full mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                字幕预览 - {subtitlesFilename}
              </h3>
              <button
                onClick={() => setShowSubtitlePreview(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl font-bold p-1"
              >
                ×
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 font-mono leading-relaxed">
                {subtitlesContent}
              </pre>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowSubtitlePreview(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  downloadSubtitles();
                  setShowSubtitlePreview(false);
                }}
                className="bg-accent-green hover:bg-accent-green-darker text-dark-bg font-semibold py-2 px-4 rounded-lg text-sm transition-colors shadow-md"
              >
                下载字幕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  ); // End of main return for VideoAiPage
} // End of VideoAiPage component
