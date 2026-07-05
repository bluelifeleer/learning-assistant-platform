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
  subtitleUrl: string,
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

  for (const subtitleUrl of subtitleUrls) {
    try {
      const text = await options.fetchSubtitleFileText(subtitleUrl);
      const segments = parseSubtitleFile(text, "track-file").slice(0, MAX_TRACK_FILE_SEGMENTS);

      for (const segment of segments) {
        await options.client.post("/capture/transcript-segment", {
          external_course_id: options.externalCourseId,
          external_chapter_id: options.externalChapterId,
          session_id: options.sessionId,
          text: segment.text,
          source: segment.source,
          start_seconds: segment.startSeconds,
          end_seconds: segment.endSeconds,
        });
      }

      await reportDiagnostic(options, subtitleUrl, { status: segments.length > 0 ? "imported" : "parse-empty", segment_count: segments.length });
    } catch (error) {
      await reportDiagnostic(options, subtitleUrl, {
        status: "fetch-failed",
        error: error instanceof Error ? error.message : "Subtitle file fetch failed",
      });
    }
  }
}
