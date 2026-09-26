import { CaptureClient, CaptureRequestError } from "./capture/client";
import { mapChapterForSnapshot } from "./capture/snapshotChapters";
import { pickAdapter } from "./adapters/registry";
import { isValidApiBaseUrl, loadExtensionConfig, type ExtensionConfig } from "./config";
import { registerContentScriptPing } from "./contentPing";
import { overlayMountPlan } from "./framePolicy";
import { buildOverlayMountedMessage, isTrustedOverlayMountedMessage } from "./overlayMessage";
import { buildNotePayload, consoleUrlFromApiBaseUrl } from "./noteCapture";
import { buildScreenshotPayload } from "./screenshotCapture";
import { captureVisibleTabScreenshot } from "./screenshotCaptureClient";
import { fetchSubtitleFileText } from "./subtitleFetchClient";
import { collectAndReportSubtitleTrackFiles } from "./subtitleTrackReporter";
import { AssistantOverlay } from "./ui/overlay";

// 同一个文档可能被注入两次:manifest 的 document_idle 注入,以及 background 的
// 强制注入(见 backgroundReinject)。两份实例会各自注册监听、各自上报,
// 产生重复的快照/心跳/字幕。这里做一次性守卫,保证一个文档只跑一份。
const BOOT_FLAG = "__learningAssistantBooted";

async function boot(): Promise<void> {
  const config = await loadExtensionConfig();
  const adapter = pickAdapter(new URL(location.href), config.enabledAdapters);
  if (!adapter) return;
  console.info("[Learning Assistant] adapter matched", adapter.id, location.hostname);
  // 上报到 API 的页面 URL 只保留 origin+pathname,避免 query/fragment 中可能携带的 token 被采集
  const reportPageUrl = location.origin + location.pathname;

  const course = adapter.extractCourse(document);
  const currentChapter = adapter.extractCurrentChapter(document);
  console.info(
    "[LA] extraction",
    location.pathname,
    "| course:", course ? `${course.title} (${course.externalCourseId})` : null,
    "| chapters:", course?.chapters.length ?? 0,
    "| first:", course?.chapters[0]?.externalChapterId,
    "| sections:", course?.chapters[0]?.children.length ?? 0,
  );
  const video = adapter.findVideo(document);
  // 章节树由页面 JS 动态渲染,boot 时可能不存在;且切换章节不刷新页面。
  // 记笔记/截图时实时提取当前章节,保证与快照章节 ID 一致
  const currentChapterId = (): string | undefined =>
    adapter.extractCurrentChapter(document)?.externalChapterId ?? currentChapter?.externalChapterId;
  const currentCourseId = (): string | undefined =>
    adapter.extractCourse(document)?.externalCourseId ?? course?.externalCourseId;
  // session id 必须由"实时解析出来的"课程+章节拼成,才能和后端 VideoSession.external_session_id
  // 对上;解析不出来时返回 undefined —— 宁可不上报,也不要发 "unknown" 让后端 404 后静默丢弃。
  const videoSessionId = (): string | undefined => {
    const courseId = currentCourseId();
    const chapterId = currentChapterId();
    if (!courseId || !chapterId) return undefined;
    return `${adapter.id}:${courseId}:${chapterId}`;
  };
  // 地址非法时不要建客户端:否则请求会走相对路径,把 token 发到当前学习站点所在的 host
  const buildClient = (next: ExtensionConfig): CaptureClient | undefined => {
    if (!next.apiToken || !isValidApiBaseUrl(next.apiBaseUrl)) return undefined;
    return new CaptureClient({ apiBaseUrl: next.apiBaseUrl, apiToken: next.apiToken });
  };
  if (config.apiToken && !isValidApiBaseUrl(config.apiBaseUrl)) {
    console.error("[Learning Assistant] API 地址非法,已停止上报:", config.apiBaseUrl);
  }
  let client = buildClient(config);

  let overlay: AssistantOverlay | undefined;
  const mountOverlay = (): void => {
    if (overlay) return;
    overlay = new AssistantOverlay({
      // 这三个回调在调用时再取 client —— 选项页后来补上 token 也能立即生效
      onSaveNote: async (content: string, tags: string[]) => {
        const activeClient = client;
        if (!activeClient) throw new Error("尚未绑定插件 Token，请在扩展选项中完成绑定");
        const videoTimeSeconds = video?.currentTime;
        try {
          await activeClient.post("/capture/note", buildNotePayload({
            content,
            tags,
            videoTimeSeconds,
            externalCourseId: currentCourseId(),
            externalChapterId: currentChapterId(),
            pageId: `${location.origin}${location.pathname}`,
          }));
        } catch (error) {
          if (error instanceof Error && error.message.includes("404")) {
            throw new Error("课程尚未采集，请先在课程页面停留片刻后重试");
          }
          throw error;
        }
        return videoTimeSeconds;
      },
      onOpenExports: () => window.open(consoleUrlFromApiBaseUrl(config.apiBaseUrl), "_blank"),
      onUploadNoteImage: async (imageBase64: string) => {
        const activeClient = client;
        if (!activeClient) throw new Error("尚未绑定插件 Token，请在扩展选项中完成绑定");
        const result = await activeClient.postJson<{ id: string }>("/capture/note-image", { image_base64: imageBase64 });
        return result.id;
      },
      onCaptureScreenshot: async () => {
        const activeClient = client;
        if (!activeClient) throw new Error("尚未绑定插件 Token，请在扩展选项中完成绑定");
        const videoTimeSeconds = video?.currentTime;
        const imageBase64 = await captureVisibleTabScreenshot();
        try {
          await activeClient.post("/capture/screenshot", buildScreenshotPayload({
            imageBase64,
            videoTimeSeconds,
            externalCourseId: currentCourseId(),
            externalChapterId: currentChapterId(),
            pageId: `${location.origin}${location.pathname}`,
          }));
        } catch (error) {
          if (error instanceof Error && error.message.includes("404")) {
            throw new Error("课程尚未采集，请先在课程页面停留片刻后重试");
          }
          throw error;
        }
        return videoTimeSeconds;
      },
    });
    overlay.mount();
    overlay.update({
      adapterName: adapter.name,
      courseTitle: course?.title,
      chapterTitle: currentChapter?.title,
      status: client ? "已连接页面" : "请先在扩展选项中完成插件绑定",
    });
  };

  // 顶层浮层消息的口令:用只有扩展隔离世界读得到的 runtime.id。
  // 页面脚本和第三方 iframe 拿不到它,所以无法伪造这条消息把浮层撤掉。
  const overlayToken = (() => {
    try {
      return typeof chrome !== "undefined" && chrome.runtime?.id ? chrome.runtime.id : "";
    } catch {
      return "";
    }
  })();
  const plan = overlayMountPlan(window.top === window, Boolean(video));
  let iframeMounted = false;
  if (window.top === window) {
    window.addEventListener("message", (event) => {
      // 口令 + 直接子框架双重校验,页面脚本/第三方 iframe 伪造不了
      if (!isTrustedOverlayMountedMessage(event.data, event.source, window.frames, overlayToken)) return;
      iframeMounted = true;
      // iframe(视频实际播放帧)已挂载,撤销顶层的重复浮层
      if (overlay) {
        overlay.unmount();
        overlay = undefined;
      }
    });
  }
  if (plan === "now") {
    mountOverlay();
    if (window.top !== window) {
      const notifyTop = (): void => {
        try {
          window.top?.postMessage(buildOverlayMountedMessage(overlayToken), "*");
        } catch {
          // 跨域 postMessage 失败时忽略,顶层会按超时兜底挂载
        }
      };
      // 多广播几次,防止顶层监听尚未就绪导致消息丢失
      notifyTop();
      setTimeout(notifyTop, 1000);
      setTimeout(notifyTop, 2500);
    }
  } else if (plan === "wait-for-iframe") {
    setTimeout(() => {
      if (!iframeMounted) mountOverlay();
    }, 1500);
  }

  // 选项页改了 token / API 地址后,已经打开的标签页要立刻生效,否则用户必须手动刷新学习页面
  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (!("apiToken" in changes) && !("apiBaseUrl" in changes)) return;
      void loadExtensionConfig().then((next) => {
        client = buildClient(next);
        overlay?.update({ status: client ? "插件配置已更新" : "插件配置不完整，已停止上报" });
      });
    });
  }

  void client?.post("/plugin-heartbeat", {
    extension_version: chrome.runtime.getManifest().version,
    current_url: reportPageUrl,
    adapter_id: adapter.id,
    adapter_name: adapter.name,
    enabled_adapters: config.enabledAdapters,
  }).catch((error: unknown) => {
    // token 被吊销/过期(401)和"后端没启动"要给用户不同的提示,不然只会显示"未连接"
    const status = error instanceof CaptureRequestError ? error.status : 0;
    overlay?.update({
      adapterName: adapter.name,
      courseTitle: course?.title,
      status: status === 401 ? "插件 Token 已失效，请在扩展选项中重新绑定" : "本地服务未连接",
    });
  });

  if (course) {
    void client?.post("/capture/course-snapshot", {
      adapter_id: adapter.id,
      site_url: reportPageUrl,
      external_course_id: course.externalCourseId,
      course_title: course.title,
      term: course.term,
      chapters: course.chapters.map(mapChapterForSnapshot),
    }).catch(() => overlay?.update({ adapterName: adapter.name, courseTitle: course.title, status: "本地服务未连接" }));
  }

  // 章节树由页面 JS 动态渲染,boot 时可能尚不存在;
  // 在 DOM 变化中检测到更多章节时重新提取并重新上报快照
  let snapshotChapterCount = course?.chapters.length ?? 0;
  let lastSnapshotCheckAt = 0;
  const maybeRefreshSnapshot = (): void => {
    const now = Date.now();
    if (now - lastSnapshotCheckAt < 2000) return;
    lastSnapshotCheckAt = now;
    const freshCourse = adapter.extractCourse(document);
    if (!freshCourse || freshCourse.chapters.length <= snapshotChapterCount) return;
    snapshotChapterCount = freshCourse.chapters.length;
    console.info(
      "[LA] re-snapshot",
      location.pathname,
      "| chapters:", freshCourse.chapters.length,
      "| first:", freshCourse.chapters[0]?.externalChapterId,
      "| sections:", freshCourse.chapters[0]?.children.length ?? 0,
    );
    overlay?.update({ courseTitle: freshCourse.title });
    void client?.post("/capture/course-snapshot", {
      adapter_id: adapter.id,
      site_url: reportPageUrl,
      external_course_id: freshCourse.externalCourseId,
      course_title: freshCourse.title,
      term: freshCourse.term,
      chapters: freshCourse.chapters.map(mapChapterForSnapshot),
    }).catch(() => undefined);
  };

  const reportVideoSource = (eventType: "video-source" | "play" | "progress"): void => {
    const videoSource = adapter.extractVideoSource(document);
    // video-source 是专门上报播放源的事件,拿不到就跳过;
    // play / progress 主要用于记录学习时长,播放源缺失不应阻断上报
    if (!videoSource && eventType === "video-source") return;
    const sessionId = videoSessionId();
    // 章节尚未解析出来时后端会直接丢弃(accept_video_event 找不到 chapter 就 return),
    // 所以这里跳过而不是发一个对不上的 id
    if (!sessionId) return;
    void client?.post("/capture/video-event", {
      session_id: sessionId,
      event_type: eventType,
      video_time_seconds: video?.currentTime,
      payload: {
        course_url: reportPageUrl,
        external_course_id: currentCourseId(),
        // 章节树由页面异步渲染,boot 时的提取可能失败退回 item id;上报时实时提取
        external_chapter_id: currentChapterId(),
        video_source: videoSource ?? {},
      },
    }).catch(() => undefined);
  };

  // 后端按 max(video_time_seconds) 记录学习时长。只在 play 事件采样的话,
  // 从头看到尾的视频只会在 currentTime≈0 时上报一次,时长会被记成 0 ——
  // 所以播放期间每 30s 补报一次当前位置。
  const PROGRESS_INTERVAL_MS = 30000;
  let progressTimer: ReturnType<typeof setInterval> | undefined;
  const startProgressReporting = (): void => {
    if (progressTimer !== undefined) return;
    progressTimer = setInterval(() => {
      if (!video || video.paused || video.ended) return;
      reportVideoSource("progress");
    }, PROGRESS_INTERVAL_MS);
  };
  const stopProgressReporting = (): void => {
    if (progressTimer === undefined) return;
    clearInterval(progressTimer);
    progressTimer = undefined;
  };

  // 字幕文件导入是一次性的,但章节树可能尚未渲染。
  // 以前直接用 boot 时的值(常常退化成 "unknown")→ 后端 404 → 整批字幕静默丢失。
  // 现在等课程/章节 id 解析出来再导,且只导一次。
  let subtitleImportStarted = false;
  const maybeImportSubtitleTracks = (): void => {
    if (subtitleImportStarted) return;
    // 绑定 token 之前不做导入;后续配置热更新也会再次触发这里
    const activeClient = client;
    if (!activeClient) return;
    const courseId = currentCourseId();
    const chapterId = currentChapterId();
    const sessionId = videoSessionId();
    if (!courseId || !chapterId || !sessionId) return;
    subtitleImportStarted = true;
    void collectAndReportSubtitleTrackFiles({
      document,
      locationHref: reportPageUrl,
      client: activeClient,
      fetchSubtitleFileText,
      externalCourseId: courseId,
      externalChapterId: chapterId,
      sessionId,
    }).catch((error: unknown) => console.warn("[Learning Assistant] 字幕文件导入失败", error));
  };
  maybeImportSubtitleTracks();

  if (video) {
    reportVideoSource("video-source");
    video.addEventListener("play", () => {
      overlay?.update({ adapterName: adapter.name, courseTitle: course?.title, status: "正在记录播放" });
      reportVideoSource("play");
      startProgressReporting();
    });
    video.addEventListener("pause", () => {
      // 暂停时补一次,把这一段实际的观看进度落到后端
      stopProgressReporting();
      reportVideoSource("progress");
    });
    video.addEventListener("ended", () => {
      stopProgressReporting();
      reportVideoSource("progress");
      overlay?.remindManualSave();
    });
  }

  // DOM 里的字幕节点只反映"当前这一句",拿不到它的结束时间。
  // 所以改成"下一句出现时给上一句收尾":每段的 start/end 就是它真正停留在屏幕上的区间,
  // 而不是原来的 start == end 零长度片段。收尾时取 id,切章节后的残留片段也能挂对章节。
  let pendingTranscript: { text: string; source: string; startSeconds: number | undefined } | null = null;
  let lastTranscriptText = "";
  let lastTranscriptAt = 0;
  let observedChapterId: string | undefined;

  const flushTranscript = (endSeconds: number | undefined): void => {
    const pending = pendingTranscript;
    pendingTranscript = null;
    if (!pending) return;
    const courseId = currentCourseId();
    const chapterId = currentChapterId();
    if (!courseId || !chapterId) return;
    void client?.post("/capture/transcript-segment", {
      external_course_id: courseId,
      external_chapter_id: chapterId,
      session_id: videoSessionId(),
      text: pending.text,
      source: pending.source,
      start_seconds: pending.startSeconds,
      end_seconds: endSeconds,
    }).catch(() => undefined);
  };

  const observer = new MutationObserver(() => {
    maybeRefreshSnapshot();
    maybeImportSubtitleTracks();
    // SPA 切章节不刷新页面:先把上一章的残留字幕收尾,再重置去重状态
    const chapterId = currentChapterId();
    if (chapterId !== observedChapterId) {
      flushTranscript(video?.currentTime);
      lastTranscriptText = "";
      observedChapterId = chapterId;
    }
    const transcript = adapter.extractTranscript(document);
    if (!transcript || transcript.text === lastTranscriptText) return;
    // 字幕节点按行刷新,body 上的 characterData 监听触发非常频繁,做 1s 节流
    const now = Date.now();
    if (now - lastTranscriptAt < 1000) return;
    // 课程/章节 id 解析不出来时跳过,不发 "unknown"(后端 404 且静默丢弃);
    // 此时不更新 lastTranscriptText,等 id 可用后还能把当前这句补上
    if (!currentCourseId() || !chapterId) return;
    lastTranscriptAt = now;
    lastTranscriptText = transcript.text;
    flushTranscript(video?.currentTime);
    pendingTranscript = { text: transcript.text, source: transcript.source, startSeconds: video?.currentTime };
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  const shutdown = (): void => {
    // 收尾最后一句,不然每章最后一条字幕会丢
    flushTranscript(video?.currentTime);
    reportVideoSource("progress");
    stopProgressReporting();
    observer.disconnect();
  };
  window.addEventListener("pagehide", shutdown);
  window.addEventListener("beforeunload", shutdown);
}

const bootedWindow = window as unknown as Record<string, unknown>;
if (bootedWindow[BOOT_FLAG]) {
  console.info("[Learning Assistant] content script already booted, skip duplicate instance");
} else {
  bootedWindow[BOOT_FLAG] = true;
  registerContentScriptPing();
  void boot().catch((error: unknown) => console.error("[Learning Assistant] content script failed", error));
}
