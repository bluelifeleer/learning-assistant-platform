import type { VideoSourceSnapshot } from "./types";

function inferMediaType(urls: string[], isBlob: boolean): VideoSourceSnapshot["mediaType"] {
  if (urls.some((url) => /\.m3u8(\?|#|$)/i.test(url) || /mpegurl/i.test(url))) return "hls";
  if (urls.some((url) => /\.mpd(\?|#|$)/i.test(url) || /dash/i.test(url))) return "dash";
  if (isBlob) return "blob";
  if (urls.some((url) => /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url))) return "file";
  return "unknown";
}

function looksSigned(url: string): boolean {
  return /[?&](token|signature|sign|expires|expire|auth|key|policy)=/i.test(url);
}

export function extractHtmlVideoSource(document: Document): VideoSourceSnapshot | null {
  const video = document.querySelector("video");
  if (!video) return null;

  const currentSrc = video.currentSrc || video.src || null;
  const sourceUrls = Array.from(video.querySelectorAll("source"))
    .map((source) => source.src || source.getAttribute("src") || "")
    .filter((url): url is string => url.length > 0);
  const allUrls = [currentSrc, ...sourceUrls].filter((url): url is string => Boolean(url));
  const isBlob = allUrls.some((url) => url.startsWith("blob:"));

  return {
    currentSrc,
    sourceUrls,
    posterUrl: video.poster || null,
    isBlob,
    isLikelySigned: allUrls.some(looksSigned),
    mediaType: inferMediaType(allUrls, isBlob),
  };
}
