import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Quiz } from "./Quiz";
import { Courses } from "./Courses";

describe("测验页", () => {
  it("提供题目管理入口", () => {
    const html = renderToString(<Quiz />);

    expect(html).toContain("管理题目");
    expect(html).toContain("开始测验");
    // 默认收起，管理区不渲染
    expect(html).not.toContain("清空当前范围");
  });
});

describe("课程页", () => {
  it("工具栏提供批量归档与恢复", () => {
    const html = renderToString(<Courses />);

    expect(html).toContain("归档当前");
    expect(html).toContain("恢复当前");
    expect(html).toContain("正在读取课程");
  });
});
