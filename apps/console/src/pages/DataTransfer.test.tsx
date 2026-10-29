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
    expect(html).toContain("确认导入");
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

  it("提供三种导入策略，默认合并", () => {
    const html = renderToString(<DataTransfer />);

    expect(html).toContain("导入策略");
    expect(html).toContain("合并（推荐）");
    expect(html).toContain("新建副本");
    expect(html).toContain("覆盖");
    // 默认策略是 merge：不会出现「确认覆盖导入」这种二次确认文案
    expect(html).not.toContain("确认覆盖导入");
    expect(html).toContain("只补缺失内容");
  });

  it("说明支持的文件类型（包 / Anki TSV / CSV）", () => {
    const html = renderToString(<DataTransfer />);

    expect(html).toContain(".lapkg");
    expect(html).toContain(".tsv");
    expect(html).toContain(".csv");
    expect(html).toContain("Anki");
  });

  it("导出记录提供手动清理入口", () => {
    const html = renderToString(<DataTransfer />);

    expect(html).toContain("保留最近");
    expect(html).toContain("清理更早的导出");
  });

  it("导入区提供「导入到课程」，未选文件时处于禁用态", () => {
    const html = renderToString(<DataTransfer />);

    expect(html).toContain("导入到课程");
    expect(html).toContain("自动（按来源新建课程）");
    expect(html).toContain("选择文件后可指定课程");
    // 未选文件时下拉是禁用的（不能给完整包指定目标课程）
    expect(html).toMatch(/<select[^>]*disabled[^>]*>[\s\S]*自动（按来源新建课程）/);
  });
});
