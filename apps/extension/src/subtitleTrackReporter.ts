import { extractSubtitleTrackUrls, parseSubtitleFile } from "./adapters/subtitleFiles";

const MAX_TRACK_FILE_SEGMENTS = 1000;

interface CaptureClientLike {
  post(path: string, body: unknown): Promise<void>;
}

interface SubtitleTrackReporterOptions {
  document: Document;
  locationHref: string;
  client: CaptureClientLike;
  fetchSubtitleFileText(url: string): Promise<string>;
  externalCourseId: string;
  externalChapterId: string;
  sessionId: string;
}

async function reportDiagnostic(
  options: SubtitleTrackReporterOptions,
  subtitleUrl: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  await options.client.post("/capture/video-event", {
    session_id: options.sessionId,
    event_type: "subtitle-diagnostic",
    payload: {
      course_url: options.locationHref,
      external_course_id: options.externalCourseId,
      external_chapter_id: options.externalChapterId,
      subtitle_url: subtitleUrl,
      ...payload,
    },
  });
}

export async function collectAndReportSubtitleTrackFiles(options: SubtitleTrackReporterOptions): Promise<void> {
  const subtitleUrls = extractSubtitleTrackUrls(options.document, options.locationHref);
  if (subtitleUrls.length === 0) {
    await reportDiagnostic(options, null, { status: "no-track" });
    return;
  }

  for (const subtitleUrl of subtitleUrls) {
    // 只有"取文件/解析"失败才算 fetch-failed
    let segments;
    try {
      const text = await options.fetchSubtitleFileText(subtitleUrl);
      segments = parseSubtitleFile(text, "track-file").slice(0, MAX_TRACK_FILE_SEGMENTS);
    } catch (error) {
      await reportDiagnostic(options, subtitleUrl, {
        status: "fetch-failed",
        error: error instanceof Error ? error.message : "Subtitle file fetch failed",
      });
      continue;
    }

    // 逐条发送、各自兜错:一条被 API 拒掉(404/500/超时)不能连带丢掉后面所有字幕
    let imported = 0;
    let failed = 0;
    let firstError: string | undefined;
    for (const segment of segments) {
      try {
        await options.client.post("/capture/transcript-segment", {
          external_course_id: options.externalCourseId,
          external_chapter_id: options.externalChapterId,
          session_id: options.sessionId,
          text: segment.text,
          source: segment.source,
          start_seconds: segment.startSeconds,
          end_seconds: segment.endSeconds,
        });
        imported += 1;
      } catch (error) {
        failed += 1;
        if (firstError === undefined) {
          firstError = error instanceof Error ? error.message : "Subtitle segment post failed";
        }
      }
    }

    if (failed === 0) {
      await reportDiagnostic(options, subtitleUrl, {
        status: imported > 0 ? "imported" : "parse-empty",
        segment_count: imported,
      });
    } else {
      // 部分或全部发送失败:状态如实反映,并把失败条数暴露出来,不再谎报成 fetch-failed
      await reportDiagnostic(options, subtitleUrl, {
        status: imported > 0 ? "partially-imported" : "post-failed",
        segment_count: imported,
        failed_count: failed,
        error: firstError,
      });
    }
  }
}
