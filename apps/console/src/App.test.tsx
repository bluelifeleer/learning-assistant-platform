import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the work console navigation", () => {
    const html = renderToString(<App />);

    expect(html).toContain("学习助手控制台");
    expect(html).toContain("课程");
    expect(html).toContain("导出");
    expect(html).toContain("站点适配器");
  });
});
