import { CaptureClient } from "./capture/client";
import { mapChapterForSnapshot } from "./capture/snapshotChapters";
import { pickAdapter } from "./adapters/registry";
import { loadExtensionConfig } from "./config";
import { overlayMountPlan } from "./framePolicy";
import { buildNotePayload, consoleUrlFromApiBaseUrl } from "./noteCapture";
import { buildScreenshotPayload } from "./screenshotCapture";
import { captureVisibleTabScreenshot } from "./screenshotCaptureClient";
import { fetchSubtitleFileText } from "./subtitleFetchClient";
import { collectAndReportSubtitleTrackFiles } from "./subtitleTrackReporter";
import { AssistantOverlay } from "./ui/overlay";

async function boot(): Promise<void> {
  const config = await loadExtensionConfig();
  const adapter = pickAdapter(new URL(location.href), config.enabledAdapters);
  if (!adapter) return;
  console.info("[Learning Assistant] adapter matched", adapter.id, location.hostname);

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
  const client = config.apiToken
    ? new CaptureClient({ apiBaseUrl: config.apiBaseUrl, apiToken: config.apiToken })
    : undefined;

  const OVERLAY_MOUNTED_MESSAGE = "learning-assistant:overlay-mounted";
  let overlay: AssistantOverlay | undefined;
  const mountOverlay = (): void => {
    if (overlay) return;
    overlay = new AssistantOverlay({
      onSaveNote: client
        ? async (content: string) => {
            const videoTimeSeconds = video?.currentTime;
            try {
              await client.post("/capture/note", buildNotePayload({
                content,
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
    current_url: location.href,
    adapter_id: adapter.id,
    adapter_name: adapter.name,
    enabled_adapters: config.enabledAdapters,
  }).catch(() => overlay?.update({ adapterName: adapter.name, courseTitle: course?.title, status: "本地服务未连接" }));

  if (course) {
    void client.post("/capture/course-snapshot", {
      adapter_id: adapter.id,
      site_url: location.href,
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
      site_url: location.href,
      external_course_id: freshCourse.externalCourseId,
      course_title: freshCourse.title,
      term: freshCourse.term,
      chapters: freshCourse.chapters.map(mapChapterForSnapshot),
    }).catch(() => undefined);
  };

  const videoSessionId = `${adapter.id}:${course?.externalCourseId ?? location.href}:${currentChapter?.externalChapterId ?? "unknown"}`;
  const reportVideoSource = (eventType: "video-source" | "play"): void => {
    const videoSource = adapter.extractVideoSource(document);
    if (!videoSource) return;
    void client.post("/capture/video-event", {
      session_id: videoSessionId,
      event_type: eventType,
      video_time_seconds: video?.currentTime,
      payload: {
        course_url: location.href,
        external_course_id: course?.externalCourseId,
        external_chapter_id: currentChapter?.externalChapterId,
        video_source: videoSource,
      },
    }).catch(() => undefined);
  };

  void collectAndReportSubtitleTrackFiles({
    document,
    locationHref: location.href,
    client,
    fetchSubtitleFileText,
    externalCourseId: course?.externalCourseId ?? location.href,
    externalChapterId: currentChapter?.externalChapterId ?? "unknown",
    sessionId: videoSessionId,
  }).catch(() => undefined);

  if (video) {
    reportVideoSource("video-source");
    video.addEventListener("play", () => {
      overlay?.update({ adapterName: adapter.name, courseTitle: course?.title, status: "正在记录播放" });
      reportVideoSource("play");
    });
    video.addEventListener("ended", () => overlay?.remindManualSave());
  }

  let lastTranscript = "";
  const observer = new MutationObserver(() => {
    maybeRefreshSnapshot();
    const transcript = adapter.extractTranscript(document);
    if (!transcript || transcript.text === lastTranscript) return;
    lastTranscript = transcript.text;
    void client.post("/capture/transcript-segment", {
      external_course_id: course?.externalCourseId ?? location.href,
      external_chapter_id: currentChapter?.externalChapterId ?? "unknown",
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

void boot().catch((error: unknown) => console.error("[Learning Assistant] content script failed", error));
