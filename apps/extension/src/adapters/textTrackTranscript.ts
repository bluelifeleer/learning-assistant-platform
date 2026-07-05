import type { TranscriptSnapshot } from "./types";

function cueText(cue: unknown): string {
  if (!cue || typeof cue !== "object") return "";
  const text = (cue as { text?: unknown }).text;
  return typeof text === "string" ? text.trim() : "";
}

export function extractHtmlTextTrackTranscript(document: Document): TranscriptSnapshot | null {
  const video = document.querySelector("video");
  const tracks = Array.from(video?.textTracks ?? []);
  for (const track of tracks) {
    const activeCues = Array.from(track.activeCues ?? []);
    const text = activeCues.map(cueText).filter(Boolean).join("\n").trim();
    if (text) return { text, source: "track" };
  }
  return null;
}
