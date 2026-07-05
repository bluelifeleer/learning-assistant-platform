import { CaptureClient } from "./capture/client";
import { pickAdapter } from "./adapters/registry";
import { AssistantOverlay } from "./ui/overlay";

const adapter = pickAdapter(new URL(location.href));
const overlay = new AssistantOverlay();
overlay.mount();

const course = adapter.extractCourse(document);
const currentChapter = adapter.extractCurrentChapter(document);
overlay.update({
  adapterName: adapter.name,
  courseTitle: course?.title,
  chapterTitle: currentChapter?.title,
  status: "已连接页面",
});

const client = new CaptureClient({ apiBaseUrl: "http://127.0.0.1:17890/api/v1", apiToken: "local-dev-token" });

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
  }).catch(() => overlay.update({ adapterName: adapter.name, courseTitle: course.title, status: "本地服务未连接" }));
}

const video = adapter.findVideo(document);
if (video) {
  video.addEventListener("play", () => overlay.update({ adapterName: adapter.name, courseTitle: course?.title, status: "正在记录播放" }));
  video.addEventListener("ended", () => overlay.remindManualSave());
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

observer.observe(document.body, { childList: true, subtree: true, characterData: true });
