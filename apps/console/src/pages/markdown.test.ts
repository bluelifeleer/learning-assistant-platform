import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("escapes HTML before applying formatting to prevent XSS", () => {
    const html = renderMarkdown('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;");
  });

  it("renders headings, bold, lists and quotes", () => {
    const html = renderMarkdown("## 小节标题\n- 第一项\n- 第二项\n> 引用内容\n普通 **粗体** 文本");
    expect(html).toContain("<h2>小节标题</h2>");
    expect(html).toContain("<ul><li>第一项</li><li>第二项</li></ul>");
    expect(html).toContain("<blockquote><p>引用内容</p></blockquote>");
    expect(html).toContain("<p>普通 <strong>粗体</strong> 文本</p>");
  });

  it("closes list and quote blocks when normal text follows", () => {
    const html = renderMarkdown("- 条目\n后续段落");
    expect(html).toContain("</ul><p>后续段落</p>");
  });

  it("escapes HTML inside formatted blocks too", () => {
    expect(renderMarkdown("- <b>注入</b>")).toContain("<li>&lt;b&gt;注入&lt;/b&gt;</li>");
    expect(renderMarkdown("**<i>x</i>**")).toContain("<strong>&lt;i&gt;x&lt;/i&gt;</strong>");
  });

  it("renders note-image placeholders as img tags with safe ids", () => {
    const html = renderMarkdown("![截图](note-image:img-ABC-123)");
    expect(html).toContain('<img data-note-image-id="img-ABC-123" alt="截图" />');
  });

  it("escapes the alt text of note images", () => {
    const html = renderMarkdown('![a"b<c](note-image:img-1)');
    expect(html).toContain('alt="a&quot;b&lt;c"');
    expect(html).not.toContain('alt="a"b');
  });

  it("rejects note-image ids with unsafe characters", () => {
    const html = renderMarkdown('![x](note-image:bad"onload="alert(1))');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("data-note-image-id");
  });
});
