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
    const html = renderToString(<App initialSetupStatus={{ installed: true, next_step: "Open console" }} initialSession={{ token: "la_test", user: { id: "u1", email: "user@example.com", display_name: "User One" } }} />);

    expect(html).toContain("学习助手控制台");
    expect(html).toContain("课程");
    expect(html).toContain("插件管理");
    expect(html).toContain("User One");
  });

  it("renders a standalone auth screen before login", () => {
    const html = renderToString(<App initialSetupStatus={{ installed: true, next_step: "Open console" }} />);

    expect(html).toContain("登录学习助手");
    expect(html).not.toContain("插件状态:");
  });

  it("can render a left-navigation workspace page", () => {
    const html = renderToString(<App initialSetupStatus={{ installed: true, next_step: "Open console" }} initialPage="字幕" initialSession={{ token: "la_test", user: { id: "u1", email: "user@example.com", display_name: "User One" } }} />);

    expect(html).toContain("字幕");
    expect(html).toContain("正在读取字幕");
  });
});
