import { CaptureClient, CaptureRequestError } from "./capture/client";
import { mapChapterForSnapshot } from "./capture/snapshotChapters";
import { genericArticleAdapter } from "./adapters/genericArticle";
import { enqueueOfflineCapture, pendingOfflineCount } from "./offlineQueue";
import { installScreenshotEditHost, requestScreenshotEditFromTop } from "./screenshotBridge";
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
import { assertAssistantOnlyElement } from "./safety/guardrails";
import { AssistantOverlay, formatVideoTime } from "./ui/overlay";

// 同一个文档可能被注入两次:manifest 的 document_idle 注入,以及 background 的
// 强制注入(见 backgroundReinject)。两份实例会各自注册监听、各自上报,
// 产生重复的快照/心跳/字幕。这里做一次性守卫,保证一个文档只跑一份。
const BOOT_FLAG = "__learningAssistantBooted";

function isOfflineError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof CaptureRequestError && error.status === 0);
}
const SELECTION_BUBBLE_ID = "learning-assistant-selection-bubble";

function selectionInsideAssistant(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement;
  return Boolean(element?.closest("#learning-assistant-overlay, #learning-assistant-overlay-mini, #learning-assistant-note-modal"));
}

function selectionInEditableField(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
}

/** 选中网页文字后出现的小气泡；只在浮层已挂载的 frame 里安装。 */
function installSelectionBubble(overlay: AssistantOverlay): () => void {
  let bubble: HTMLButtonElement | null = null;
  const hideBubble = (): void => {
    bubble?.remove();
    bubble = null;
  };
  const showBubble = (text: string, rect: DOMRect): void => {
    hideBubble();
    const button = document.createElement("button");
    button.id = SELECTION_BUBBLE_ID;
    button.type = "button";
    button.textContent = "记入笔记";
    button.title = "把选中的文字记入学习笔记";
    button.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "padding:6px 10px",
      "border:0",
      "border-radius:6px",
      "background:#1f8fff",
      "color:#fff",
      "font:600 12px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "cursor:pointer",
      "box-shadow:0 6px 18px rgba(0,0,0,.3)",
    ].join(";");
    const left = Math.min(Math.max(rect.left + rect.width / 2 - 44, 8), Math.max(8, window.innerWidth - 96));
    const top = Math.min(Math.max(rect.bottom + 8, 8), Math.max(8, window.innerHeight - 40));
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      overlay.openNoteFromSelection(text);
      hideBubble();
    });
    assertAssistantOnlyElement(button);
    document.documentElement.appendChild(button);
    bubble = button;
  };

  const onMouseUp = (): void => {
    window.setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      if (!selection || !text || selection.rangeCount === 0) {
        hideBubble();
        return;
      }
      if (selectionInsideAssistant(selection.anchorNode) || selectionInEditableField(selection.anchorNode)) {
        hideBubble();
        return;
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        hideBubble();
        return;
      }
      showBubble(text.slice(0, 2000), rect);
    }, 0);
  };
  const onMouseDown = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    if (!target?.closest?.(`#${SELECTION_BUBBLE_ID}`)) hideBubble();
  };

  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("scroll", hideBubble, true);
  window.addEventListener("resize", hideBubble);
  return () => {
    hideBubble();
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("mousedown", onMouseDown, true);
    document.removeEventListener("scroll", hideBubble, true);
    window.removeEventListener("resize", hideBubble);
  };
}

/** Alt+N/S/Q/R/H/O 快捷键；输入框里不触发。 */
function installShortcuts(overlay: AssistantOverlay): () => void {
  const handler = (event: KeyboardEvent): void => {
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as Element | null;
    if (target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
    const selected = window.getSelection()?.toString().trim() || "";
    switch (event.key.toLowerCase()) {
      case "n":
        event.preventDefault();
        if (selected) overlay.openNoteFromSelection(selected);
        else overlay.openNoteEditor();
        break;
      case "a":
        event.preventDefault();
        overlay.openAskFromTranscript();
        break;
      case "s":
        event.preventDefault();
        overlay.triggerScreenshot();
        break;
      case "q":
        event.preventDefault();
        overlay.openNoteEditor({ tags: ["疑问"], sourceText: selected || undefined });
        break;
      case "r":
        event.preventDefault();
        overlay.openNoteEditor({ addToReview: true, content: selected || undefined });
        break;
      case "h":
        event.preventDefault();
        overlay.toggleCollapsed();
        break;
      case "o":
        event.preventDefault();
        overlay.cycleOpacity();
        break;
      default:
        break;
    }
  };
  document.addEventListener("keydown", handler, true);
  return () => document.removeEventListener("keydown", handler, true);
}

async function boot(): Promise<void> {
  installScreenshotEditHost();
  const config = await loadExtensionConfig();
  const hostname = location.hostname;
  const paused = (config.pausedSites ?? []).some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  if (paused) {
    console.info("[Learning Assistant] site paused by user", hostname);
    return;
  }
  const adapter = pickAdapter(new URL(location.href), config.enabledAdapters, config.customAdapters)
    ?? (config.articleCapture ? genericArticleAdapter : null);
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
  const refreshPendingCaptures = (): void => {
    void pendingOfflineCount()
      .then((count) => overlay?.update({ pendingCaptures: count }))
      .catch(() => undefined);
  };
  const maybeFetchContinue = (): void => {
    const activeClient = client;
    const sessionId = videoSessionId();
    if (!activeClient || !sessionId) return;
    void activeClient
      .postJson<{ position_seconds: number | null }>("/capture/continue", { session_id: sessionId })
      .then((result) => {
        const position = result.position_seconds;
        if (typeof position === "number" && position > 10) {
          overlay?.update({ continueSeconds: position });
        } else {
          overlay?.update({ continueSeconds: undefined });
        }
      })
      .catch(() => undefined);
  };
  let selectionCleanup: (() => void) | undefined;
  let shortcutCleanup: (() => void) | undefined;
  const teardownOverlay = (): void => {
    selectionCleanup?.();
    shortcutCleanup?.();
    selectionCleanup = undefined;
    shortcutCleanup = undefined;
    overlay?.unmount();
    overlay = undefined;
  };
  const mountOverlay = (): void => {
    if (overlay) return;
    overlay = new AssistantOverlay({
      // 这三个回调在调用时再取 client —— 选项页后来补上 token 也能立即生效
      onSaveNote: async (content, tags, options = {}) => {
        const activeClient = client;
        if (!activeClient) throw new Error("尚未绑定插件 Token，请在扩展选项中完成绑定");
        const videoTimeSeconds = video?.currentTime;
        const payload = buildNotePayload({
          content,
          tags,
          sourceText: options.sourceText,
          videoTimeSeconds,
          externalCourseId: currentCourseId(),
          externalChapterId: currentChapterId(),
          pageId: `${location.origin}${location.pathname}`,
        });
        let noteId: string | undefined;
        try {
          const result = await activeClient.postJson<{ note_id: string }>("/capture/note", payload);
          noteId = result.note_id;
        } catch (error) {
          if (error instanceof CaptureRequestError && error.status === 404) {
            throw new Error("课程尚未采集，请先在课程页面停留片刻后重试");
          }
          if (isOfflineError(error)) {
            const queued = await enqueueOfflineCapture(
              "note",
              "/capture/note",
              payload as unknown as Record<string, unknown>,
              options.addToReview,
            );
            if (queued) {
              refreshPendingCaptures();
              return { seconds: videoTimeSeconds, queued: true };
            }
          }
          throw error;
        }

        let reviewCreated = false;
        let reviewError: string | undefined;
        if (options.addToReview && noteId) {
          try {
            await activeClient.postJson("/capture/review-card", { note_id: noteId });
            reviewCreated = true;
          } catch (error) {
            reviewError = error instanceof Error && error.message ? error.message : "复习卡创建失败";
          }
        }
        return { seconds: videoTimeSeconds, noteId, reviewCreated, reviewError };
      },
      onOpenExports: () => window.open(consoleUrlFromApiBaseUrl(config.apiBaseUrl), "_blank"),
      onUploadNoteImage: async (imageBase64: string) => {
        const activeClient = client;
        if (!activeClient) throw new Error("尚未绑定插件 Token，请在扩展选项中完成绑定");
        const result = await activeClient.postJson<{ id: string }>("/capture/note-image", { image_base64: imageBase64 });
        return result.id;
      },
      onRequestScreenshotEditor: (imageDataUrl) => requestScreenshotEditFromTop(imageDataUrl),
      onCaptureScreenshotImage: async () => {
        if (config.privacyMode) throw new Error("隐私模式已开启，截图存证已禁用");
        if (!client) throw new Error("尚未绑定插件 Token，请在扩展选项中完成绑定");
        return {
          imageBase64: await captureVisibleTabScreenshot(),
          videoTimeSeconds: video?.currentTime,
        };
      },
      onContinue: (seconds) => {
        if (!video) return;
        video.currentTime = Math.max(0, seconds);
        overlay?.update({ continueSeconds: undefined, status: `已定位到 ${formatVideoTime(seconds)}` });
      },
      onAsk: async (question) => {
        const activeClient = client;
        if (!activeClient) throw new Error("尚未绑定插件 Token，请在扩展选项中完成绑定");
        const courseId = currentCourseId();
        if (!courseId) throw new Error("课程尚未解析，请稍后重试");
        const result = await activeClient.postJson<{
          answer_md: string;
          citations: { chapter_title: string; start_seconds?: number | null; excerpt: string }[];
        }>("/capture/ask", {
          external_course_id: courseId,
          external_chapter_id: currentChapterId(),
          question,
        });
        return {
          answer: result.answer_md,
          citations: result.citations.map((item) => ({
            chapter_title: item.chapter_title,
            start_seconds: item.start_seconds,
            excerpt: item.excerpt,
          })),
        };
      },
      onSaveScreenshot: async (imageBase64, videoTimeSeconds) => {
        const activeClient = client;
        if (!activeClient) throw new Error("尚未绑定插件 Token，请在扩展选项中完成绑定");
        const payload = buildScreenshotPayload({
          imageBase64,
          videoTimeSeconds,
          externalCourseId: currentCourseId(),
          externalChapterId: currentChapterId(),
          pageId: `${location.origin}${location.pathname}`,
        });
        try {
          await activeClient.post("/capture/screenshot", payload);
        } catch (error) {
          if (error instanceof CaptureRequestError && error.status === 404) {
            throw new Error("课程尚未采集，请先在课程页面停留片刻后重试");
          }
          if (isOfflineError(error)) {
            const queued = await enqueueOfflineCapture(
              "screenshot",
              "/capture/screenshot",
              payload as unknown as Record<string, unknown>,
            );
            if (queued) {
              refreshPendingCaptures();
              return { seconds: videoTimeSeconds, queued: true };
            }
          }
          throw error;
        }
        return { seconds: videoTimeSeconds };
      },
    });
    overlay.mount();
    overlay.update({
      adapterName: adapter.name,
      courseTitle: course?.title,
      chapterTitle: currentChapter?.title,
      status: client ? "已连接页面" : "请先在扩展选项中完成插件绑定",
      transcript: adapter.extractTranscript(document)?.text,
      timeSeconds: video?.currentTime,
      draftKey: videoSessionId() ?? `${adapter.id}:${reportPageUrl}`,
    });
    overlay.setScreenshotEnabled(!config.privacyMode);
    refreshPendingCaptures();
    selectionCleanup = installSelectionBubble(overlay);
    shortcutCleanup = installShortcuts(overlay);
    if (adapter.id === "generic-article") {
      let lastArticleScrollAt = 0;
      const onArticleScroll = (): void => {
        const now = Date.now();
        if (now - lastArticleScrollAt < 800) return;
        lastArticleScrollAt = now;
        const chapter = adapter.extractCurrentChapter(document);
        if (chapter) {
          overlay?.update({
            chapterTitle: chapter.title,
            draftKey: videoSessionId() ?? `${adapter.id}:${reportPageUrl}`,
          });
        }
      };
      window.addEventListener("scroll", onArticleScroll, { passive: true });
      // 复用 cleanup 列表：页面卸载时由 teardown 统一移除
      const previousSelectionCleanup = selectionCleanup;
      selectionCleanup = () => {
        previousSelectionCleanup?.();
        window.removeEventListener("scroll", onArticleScroll);
      };
    }
    maybeFetchContinue();
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
      if (overlay) teardownOverlay();
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

  let playingSince: number | null = null;
  let lastWatchedFlushAt = 0;
  const flushWatched = (stop: boolean): void => {
    if (playingSince === null) return;
    const now = Date.now();
    const seconds = (now - playingSince) / 1000;
    if (seconds > 0.5) overlay?.addWatchedSeconds(seconds);
    playingSince = stop ? null : now;
    lastWatchedFlushAt = now;
  };

  if (video) {
    reportVideoSource("video-source");
    let lastOverlayTimeAt = 0;
    video.addEventListener("timeupdate", () => {
      const now = Date.now();
      if (now - lastOverlayTimeAt < 500) return;
      lastOverlayTimeAt = now;
      overlay?.update({ timeSeconds: video.currentTime });
      if (playingSince !== null && now - lastWatchedFlushAt >= 5000) flushWatched(false);
      // track 字幕的 activeCues 变化不会触发 DOM MutationObserver,
      // 所以播放中也要主动取一次当前字幕。
      acceptTranscript(adapter.extractTranscript(document), currentChapterId(), now);
    });
    video.addEventListener("play", () => {
      playingSince = Date.now();
      lastWatchedFlushAt = playingSince;
      overlay?.update({ adapterName: adapter.name, courseTitle: course?.title, status: "正在记录播放" });
      reportVideoSource("play");
      startProgressReporting();
    });
    video.addEventListener("pause", () => {
      // 暂停时补一次,把这一段实际的观看进度落到后端
      flushWatched(true);
      stopProgressReporting();
      reportVideoSource("progress");
    });
    video.addEventListener("ended", () => {
      flushWatched(true);
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

  const acceptTranscript = (
    transcript: { text: string; source: string } | null,
    chapterId: string | undefined,
    now = Date.now(),
  ): void => {
    if (!transcript || transcript.text === lastTranscriptText) return;
    // 字幕节点按行刷新,body 上的 characterData 监听触发非常频繁,做 1s 节流
    if (now - lastTranscriptAt < 1000) return;
    // 课程/章节 id 解析不出来时跳过,不发 "unknown"(后端 404 且静默丢弃);
    // 此时不更新 lastTranscriptText,等 id 可用后还能把当前这句补上
    if (!currentCourseId() || !chapterId) return;
    lastTranscriptAt = now;
    lastTranscriptText = transcript.text;
    overlay?.update({ transcript: transcript.text, timeSeconds: video?.currentTime });
    flushTranscript(video?.currentTime);
    pendingTranscript = { text: transcript.text, source: transcript.source, startSeconds: video?.currentTime };
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
      overlay?.update({
        transcript: "",
        timeSeconds: video?.currentTime,
        draftKey: videoSessionId() ?? `${adapter.id}:${reportPageUrl}`,
      });
      // 切章节后重新查该章节的上次位置
      window.setTimeout(maybeFetchContinue, 600);
    }
    acceptTranscript(adapter.extractTranscript(document), chapterId);
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  const shutdown = (): void => {
    // 收尾最后一句,不然每章最后一条字幕会丢
    flushWatched(true);
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
