import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders installer when setup is not installed", () => {
    const html = renderToString(<App initialSetupStatus={{ installed: false, next_step: "Create .env" }} />);

    expect(html).toContain("系统安装向导");
    expect(html).toContain("数据库类型");
    expect(html).toContain("远端数据库地址");
  });

  it("renders the work console navigation when installed", () => {
    const html = renderToString(<App initialSetupStatus={{ installed: true, next_step: "Open console" }} />);

    expect(html).toContain("学习助手控制台");
    expect(html).toContain("课程");
    expect(html).toContain("导出");
    expect(html).toContain("站点适配器");
  });
});
