import type { TranscriptSnapshot } from "./types";

export interface SubtitleSegment {
  startSeconds: number;
  endSeconds: number;
  text: string;
  source: TranscriptSnapshot["source"];
}

const TIMING_SEPARATOR = "-->";
const CAPTION_TRACK_KINDS = new Set(["subtitles", "captions"]);

function parseTimestamp(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  const parts = normalized.split(":");
  if (parts.length < 2 || parts.length > 3) return null;

  const seconds = Number(parts[parts.length - 1]);
  const minutes = Number(parts[parts.length - 2]);
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;

  return hours * 3600 + minutes * 60 + seconds;
}

function parseTimingLine(line: string): { startSeconds: number; endSeconds: number } | null {
  const [startPart, endPartWithSettings] = line.split(TIMING_SEPARATOR);
  if (!startPart || !endPartWithSettings) return null;

  const endPart = endPartWithSettings.trim().split(/\s+/)[0];
  const startSeconds = parseTimestamp(startPart);
  const endSeconds = parseTimestamp(endPart);
  if (startSeconds === null || endSeconds === null) return null;

  return { startSeconds, endSeconds };
}

function isIgnoredBlockStart(line: string): boolean {
  return /^(NOTE|STYLE|REGION)(\s|$)/i.test(line.trim());
}

function isCueId(line: string): boolean {
  return /^\d+$/.test(line.trim());
}

function cleanCueText(lines: string[]): string {
  return lines
    .join("\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export function parseSubtitleFile(
  content: string,
  source: TranscriptSnapshot["source"] = "track-file",
): SubtitleSegment[] {
  const lines = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const segments: SubtitleSegment[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (!line || /^WEBVTT($|\s)/i.test(line) || isCueId(line)) {
      continue;
    }

    if (isIgnoredBlockStart(line)) {
      while (index + 1 < lines.length && lines[index + 1].trim()) {
        index += 1;
      }
      continue;
    }

    const timing = parseTimingLine(line);
    if (!timing) continue;

    const textLines: string[] = [];
    while (index + 1 < lines.length && lines[index + 1].trim()) {
      index += 1;
      textLines.push(lines[index]);
    }

    const text = cleanCueText(textLines);
    if (text) {
      segments.push({ ...timing, text, source });
    }
  }

  return segments;
}

export function extractSubtitleTrackUrls(document: Document, baseUrl: string = location.href): string[] {
  const urls = new Set<string>();
  const tracks = Array.from(document.querySelectorAll("video track[src]")) as HTMLTrackElement[];

  for (const track of tracks) {
    const kind = (track.getAttribute("kind") || "subtitles").toLowerCase();
    if (!CAPTION_TRACK_KINDS.has(kind)) continue;

    const rawUrl = track.src || track.getAttribute("src") || "";
    if (!rawUrl) continue;

    try {
      urls.add(new URL(rawUrl, baseUrl).href);
    } catch {
      // Ignore malformed track URLs; adapters should keep scanning the rest of the page.
    }
  }

  return Array.from(urls);
}
