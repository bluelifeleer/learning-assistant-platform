import { CaptureClient } from "./capture/client";
import { pickAdapter } from "./adapters/registry";
import { loadExtensionConfig } from "./config";
import { shouldMountAssistantOverlay } from "./framePolicy";
import { fetchSubtitleFileText } from "./subtitleFetchClient";
import { collectAndReportSubtitleTrackFiles } from "./subtitleTrackReporter";
import { AssistantOverlay } from "./ui/overlay";

console.info("[Learning Assistant] content script loaded", location.href);

async function boot(): Promise<void> {
  const config = await loadExtensionConfig();
  const adapter = pickAdapter(new URL(location.href), config.enabledAdapters);
  if (!adapter) return;
  const overlay = shouldMountAssistantOverlay(window.top === window) ? new AssistantOverlay() : undefined;
  overlay?.mount();

  const course = adapter.extractCourse(document);
  const currentChapter = adapter.extractCurrentChapter(document);
  overlay?.update({
    adapterName: adapter.name,
    courseTitle: course?.title,
    chapterTitle: currentChapter?.title,
    status: config.apiToken ? "已连接页面" : "请先在扩展选项中完成插件绑定",
  });

  if (!config.apiToken) return;

  const client = new CaptureClient({ apiBaseUrl: config.apiBaseUrl, apiToken: config.apiToken });
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
      chapters: course.chapters.map((chapter) => ({
        external_chapter_id: chapter.externalChapterId,
        title: chapter.title,
        sort_order: chapter.sortOrder,
        children: [],
      })),
    }).catch(() => overlay?.update({ adapterName: adapter.name, courseTitle: course.title, status: "本地服务未连接" }));
  }

  const video = adapter.findVideo(document);
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
}

void boot().catch((error: unknown) => console.error("[Learning Assistant] content script failed", error));
