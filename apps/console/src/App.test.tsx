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
    const html = renderToString(<App initialSetupStatus={{ installed: true, next_step: "Open console" }} initialSession={{ token: "la_test", user: { id: "u1", username: "userone", email: "user@example.com", display_name: "User One" } }} />);

    expect(html).toContain("学习助手控制台");
    expect(html).toContain("课程");
    expect(html).toContain("插件管理");
    expect(html).toContain("User One");
  });

  it("renders a standalone auth screen before login", () => {
    const html = renderToString(<App initialSetupStatus={{ installed: true, next_step: "Open console" }} />);

    expect(html).toContain("登录学习助手");
    expect(html).toContain("机构在线学习数据中台");
    expect(html).toContain("浏览器插件托管");
    expect(html).toContain("私有化部署");
    expect(html).toContain("邮箱或用户名");
    expect(html).toContain("用户名");
    expect(html).not.toContain("插件状态:");
  });

  it("can render a left-navigation workspace page", () => {
    const html = renderToString(<App initialSetupStatus={{ installed: true, next_step: "Open console" }} initialPage="字幕" initialSession={{ token: "la_test", user: { id: "u1", username: "userone", email: "user@example.com", display_name: "User One" } }} />);

    expect(html).toContain("字幕");
    expect(html).toContain("正在读取字幕");
  });

  it("renders actionable adapter and settings pages", () => {
    const adapterHtml = renderToString(<App initialSetupStatus={{ installed: true, next_step: "Open console" }} initialPage="站点适配器" initialSession={{ token: "la_test", user: { id: "u1", username: "userone", email: "user@example.com", display_name: "User One" } }} />);
    const settingsHtml = renderToString(<App initialSetupStatus={{ installed: true, next_step: "Open console" }} initialPage="设置" initialSession={{ token: "la_test", user: { id: "u1", username: "userone", email: "user@example.com", display_name: "User One" } }} />);

    expect(adapterHtml).toContain("新增适配器");
    expect(adapterHtml).toContain("保存适配器");
    expect(settingsHtml).toContain("系统设置");
    expect(settingsHtml).toContain("保存设置");
  });

  it("renders plugin packaging and video source sections", () => {
    const html = renderToString(<App initialSetupStatus={{ installed: true, next_step: "Open console" }} initialPage="插件管理" initialSession={{ token: "la_test", user: { id: "u1", username: "userone", email: "user@example.com", display_name: "User One" } }} />);

    expect(html).toContain("导出插件包");
    expect(html).toContain("最近视频源");
    expect(html).toContain("暂无视频源采集记录");
  });
});
