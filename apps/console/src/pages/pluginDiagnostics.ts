import type { VideoEventItem } from "../api/client";

export interface SubtitleDiagnosticView {
  id: string;
  status: string;
  detail: string;
  subtitleUrl: string;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function formatStatus(status: string | null): string {
  if (status === "imported") return "已导入";
  if (status === "fetch-failed") return "读取失败";
  if (status === "parse-empty") return "未解析到字幕";
  return "未知状态";
}

function formatDetail(event: VideoEventItem): string {
  const segmentCount = event.payload.segment_count;
  if (typeof segmentCount === "number") return `${segmentCount} 条字幕片段`;
  return textValue(event.payload.error) ?? "等待更多诊断信息";
}

export function getSubtitleDiagnostics(events: VideoEventItem[]): SubtitleDiagnosticView[] {
  return events
    .filter((event) => event.event_type === "subtitle-diagnostic")
    .map((event) => ({
      id: event.id,
      status: formatStatus(textValue(event.payload.status)),
      detail: formatDetail(event),
      subtitleUrl: textValue(event.payload.subtitle_url) ?? "未上报",
    }));
}
