import { useEffect, useMemo, useRef } from "react";
import { fetchNoteImageUrl } from "../api/client";
import { renderMarkdown } from "./markdown";

interface NoteMarkdownProps {
  content: string;
  token?: string;
  className?: string;
}

export function NoteMarkdown({ content, token, className }: NoteMarkdownProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const html = useMemo(() => renderMarkdown(content), [content]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    const owned: string[] = [];
    const images = Array.from(container.querySelectorAll<HTMLImageElement>("img[data-note-image-id]"));
    for (const img of images) {
      const id = img.dataset.noteImageId;
      if (!id) continue;
      void fetchNoteImageUrl(id, token)
        .then((url) => {
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          owned.push(url);
          img.src = url;
        })
        .catch(() => {
          if (!cancelled) img.alt = `${img.alt}(图片加载失败)`;
        });
    }
    return () => {
      cancelled = true;
      owned.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [html, token]);

  return <div ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
