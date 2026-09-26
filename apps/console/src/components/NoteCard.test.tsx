import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChapterMemoPanel } from "./ChapterMemoPanel";
import { NoteCard, NoteEditorFields } from "./NoteCard";

function renderEditor(mode: "edit" | "correct") {
  return renderToString(
    <NoteEditorFields mode={mode} original="原始字幕内容" draft="草稿" onModeChange={() => undefined} onDraftChange={() => undefined} />,
  );
}

describe("note card and chapter memo", () => {
  it("renders note card actions including 编辑 (distinct from 勘误)", () => {
    const note = { id: "n1", video_time_seconds: 100, content: "笔记内容", tags: [] };

    const html = renderToString(<NoteCard note={note} onUpdated={() => undefined} />);

    expect(html).toContain("编辑");
    expect(html).toContain("勘误");
    expect(html).toContain("标签");
    expect(html).toContain("生成卡片");
    expect(html).toContain("发送");
  });

  it("renders the chapter memo module with a heading", () => {
    const html = renderToString(<ChapterMemoPanel chapterId="ch1" />);

    expect(html).toContain("总结");
  });

  it("exposes both editor modes and keeps the original visible in 勘误模式", () => {
    const html = renderEditor("correct");

    expect(html).toContain("勘误模式");
    expect(html).toContain("编辑模式");
    // 勘误模式保留并展示原文
    expect(html).toContain("不可修改");
    expect(html).toContain("勘误后的正确内容");
  });

  it("hides the original text in 编辑模式", () => {
    const html = renderEditor("edit");

    expect(html).toContain("编辑模式");
    expect(html).not.toContain("不可修改");
    expect(html).toContain("笔记内容(支持 Markdown)");
  });
});
