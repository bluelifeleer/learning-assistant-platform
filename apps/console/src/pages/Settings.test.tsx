import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModelField } from "./Settings";

const noop = () => undefined;

describe("AI 模型字段", () => {
  it("有预设时渲染下拉框，并列出预设模型", () => {
    const html = renderToString(
      <ModelField options={["kimi-k3", "kimi-k2.6"]} value="kimi-k3" onChange={noop} placeholder="对话模型" />,
    );

    expect(html).toContain("<select");
    expect(html).not.toContain("<input");
    expect(html).toContain("kimi-k3");
    expect(html).toContain("kimi-k2.6");
    // 始终留一个"自定义模型…"出口
    expect(html).toContain("自定义模型…");
  });

  it("当前值不在预设里时，把它作为一条选项显示出来，不让人以为配置丢了", () => {
    const html = renderToString(
      <ModelField options={["kimi-k3"]} value="kimi-k2-0905-preview" onChange={noop} placeholder="对话模型" />,
    );

    expect(html).toContain("kimi-k2-0905-preview");
    expect(html).toContain("当前值，不在预设中");
  });

  it("没有预设（自定义 Base URL）时退回普通输入框", () => {
    const html = renderToString(<ModelField options={[]} value="" onChange={noop} placeholder="对话模型" />);

    expect(html).toContain("<input");
    expect(html).not.toContain("<select");
  });

  it("视觉模型支持留空（表示与对话模型相同）", () => {
    const html = renderToString(
      <ModelField options={["kimi-k3"]} value="" onChange={noop} placeholder="视觉模型" emptyLabel="（留空 = 与对话模型相同）" />,
    );

    expect(html).toContain("<select");
    expect(html).toContain("留空 = 与对话模型相同");
  });
});
