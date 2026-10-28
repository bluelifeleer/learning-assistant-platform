import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataTransfer } from "./DataTransfer";

describe("导入导出页", () => {
  it("同时提供导出与导入两个面板，并默认选中完整包", () => {
    const html = renderToString(<DataTransfer />);

    expect(html).toContain("导出");
    expect(html).toContain("导入");
    // 默认格式是完整包，且带媒体开关
    expect(html).toContain("完整包（.lapkg）");
    expect(html).toContain("包含截图与笔记图片");
    // 导入区：预览与确认两个动作
    expect(html).toContain("预览（不写入）");
    expect(html).toContain("确认导入（merge）");
    // 记录区空态
    expect(html).toContain("暂无导出记录");
    expect(html).toContain("暂无导入记录");
  });

  it("渲染出课程选择区与文件选择按钮", () => {
    const html = renderToString(<DataTransfer />);

    expect(html).toContain("选择课程");
    expect(html).toContain("选择导入包");
    expect(html).toContain("未选择文件");
  });
});
