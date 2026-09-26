import { CaptureClient, CaptureRequestError } from "./capture/client";
import { mapChapterForSnapshot } from "./capture/snapshotChapters";
import { pickAdapter } from "./adapters/registry";
import { isValidApiBaseUrl, loadExtensionConfig } from "./config";
import { registerContentScriptPing } from "./contentPing";
import { overlayMountPlan } from "./framePolicy";
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
  const apiBaseUrlValid = isValidApiBaseUrl(config.apiBaseUrl);
  const client = config.apiToken && apiBaseUrlValid
    ? new CaptureClient({ apiBaseUrl: config.apiBaseUrl, apiToken: config.apiToken })
    : undefined;
  if (config.apiToken && !apiBaseUrlValid) {
    console.error("[Learning Assistant] API 地址非法,已停止上报:", config.apiBaseUrl);
  }

  const OVERLAY_MOUNTED_MESSAGE = "learning-assistant:overlay-mounted";
  let overlay: AssistantOverlay | undefined;
  const mountOverlay = (): void => {
    if (overlay) return;
    overlay = new AssistantOverlay({
      onSaveNote: client
        ? async (content: string, tags: string[]) => {
            const videoTimeSeconds = video?.currentTime;
            try {
              await client.post("/capture/note", buildNotePayload({
                content,
                tags,
                videoTimeSeconds,
                externalCourseId: course?.externalCourseId,
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
          }
        : undefined,
      onOpenExports: () => window.open(consoleUrlFromApiBaseUrl(config.apiBaseUrl), "_blank"),
      onUploadNoteImage: client
        ? async (imageBase64: string) => {
            const result = await client.postJson<{ id: string }>("/capture/note-image", { image_base64: imageBase64 });
            return result.id;
          }
        : undefined,
      onCaptureScreenshot: client
        ? async () => {
            const videoTimeSeconds = video?.currentTime;
            const imageBase64 = await captureVisibleTabScreenshot();
            try {
              await client.post("/capture/screenshot", buildScreenshotPayload({
                imageBase64,
                videoTimeSeconds,
                externalCourseId: course?.externalCourseId,
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
          }
        : undefined,
    });
    overlay.mount();
    overlay.update({
      adapterName: adapter.name,
      courseTitle: course?.title,
      chapterTitle: currentChapter?.title,
      status: config.apiToken ? "已连接页面" : "请先在扩展选项中完成插件绑定",
    });
  };

  const plan = overlayMountPlan(window.top === window, Boolean(video));
  let iframeMounted = false;
  if (window.top === window) {
    window.addEventListener("message", (event) => {
      if (event.data !== OVERLAY_MOUNTED_MESSAGE) return;
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
          window.top?.postMessage(OVERLAY_MOUNTED_MESSAGE, "*");
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

  if (!client) return;

  void client.post("/plugin-heartbeat", {
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
    void client.post("/capture/course-snapshot", {
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
    void client.post("/capture/course-snapshot", {
      adapter_id: adapter.id,
      site_url: reportPageUrl,
      external_course_id: freshCourse.externalCourseId,
      course_title: freshCourse.title,
      term: freshCourse.term,
      chapters: freshCourse.chapters.map(mapChapterForSnapshot),
    }).catch(() => undefined);
  };

  const reportVideoSource = (eventType: "video-source" | "play"): void => {
    const videoSource = adapter.extractVideoSource(document);
    if (!videoSource) return;
    const sessionId = videoSessionId();
    // 章节尚未解析出来时后端会直接丢弃(accept_video_event 找不到 chapter 就 return),
    // 所以这里跳过而不是发一个对不上的 id
    if (!sessionId) return;
    void client.post("/capture/video-event", {
      session_id: sessionId,
      event_type: eventType,
      video_time_seconds: video?.currentTime,
      payload: {
        course_url: reportPageUrl,
        external_course_id: course?.externalCourseId,
        // 章节树由页面异步渲染,boot 时的提取可能失败退回 item id;上报时实时提取
        external_chapter_id: currentChapterId(),
        video_source: videoSource,
      },
    }).catch(() => undefined);
  };

  // 字幕文件导入是一次性的,但章节树可能尚未渲染。
  // 以前直接用 boot 时的值(常常退化成 "unknown")→ 后端 404 → 整批字幕静默丢失。
  // 现在等课程/章节 id 解析出来再导,且只导一次。
  let subtitleImportStarted = false;
  const maybeImportSubtitleTracks = (): void => {
    if (subtitleImportStarted) return;
    const courseId = currentCourseId();
    const chapterId = currentChapterId();
    const sessionId = videoSessionId();
    if (!courseId || !chapterId || !sessionId) return;
    subtitleImportStarted = true;
    void collectAndReportSubtitleTrackFiles({
      document,
      locationHref: reportPageUrl,
      client,
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
    });
    video.addEventListener("ended", () => overlay?.remindManualSave());
  }

  let lastTranscript = "";
  let lastTranscriptAt = 0;
  const observer = new MutationObserver(() => {
    maybeRefreshSnapshot();
    maybeImportSubtitleTracks();
    const transcript = adapter.extractTranscript(document);
    if (!transcript || transcript.text === lastTranscript) return;
    // 字幕节点按行刷新,body 上的 characterData 监听会触发得非常频繁,做 1s 节流
    const now = Date.now();
    if (now - lastTranscriptAt < 1000) return;
    // 课程/章节 id 解析不出来时跳过,不发 "unknown"(后端 404 且静默丢弃);
    // 此时不更新 lastTranscript,等 id 可用后还能把当前这句补上
    const courseId = currentCourseId();
    const chapterId = currentChapterId();
    if (!courseId || !chapterId) return;
    lastTranscriptAt = now;
    lastTranscript = transcript.text;
    void client.post("/capture/transcript-segment", {
      external_course_id: courseId,
      external_chapter_id: chapterId,
      text: transcript.text,
      source: transcript.source,
      start_seconds: video?.currentTime,
      end_seconds: video?.currentTime,
    }).catch(() => undefined);
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  const disconnectObserver = (): void => observer.disconnect();
  window.addEventListener("pagehide", disconnectObserver);
  window.addEventListener("beforeunload", disconnectObserver);
}

const bootedWindow = window as unknown as Record<string, unknown>;
if (bootedWindow[BOOT_FLAG]) {
  console.info("[Learning Assistant] content script already booted, skip duplicate instance");
} else {
  bootedWindow[BOOT_FLAG] = true;
  registerContentScriptPing();
  void boot().catch((error: unknown) => console.error("[Learning Assistant] content script failed", error));
}
