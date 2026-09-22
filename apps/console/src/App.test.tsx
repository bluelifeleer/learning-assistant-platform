import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { SystemSettings } from "./pages/SystemSettings";

const session = { token: "la_test", user: { id: "u1", username: "userone", email: "user@example.com", display_name: "User One" } };
const installed = { installed: true, next_step: "Open console" };

describe("App", () => {
  it("renders installer when setup is not installed", () => {
    const html = renderToString(<App initialSetupStatus={{ installed: false, next_step: "Create .env" }} />);

    expect(html).toContain("系统安装向导");
    expect(html).toContain("数据库类型");
    expect(html).toContain("远端数据库地址");
  });

  it("renders the streamlined five-item navigation when installed", () => {
    const html = renderToString(<App initialSetupStatus={installed} initialSession={session} />);

    expect(html).toContain("学习助手控制台");
    expect(html).toContain("总览");
    expect(html).toContain("课程");
    expect(html).toContain("复习");
    expect(html).toContain("搜索");
    expect(html).toContain("系统设置");
    expect(html).toContain("User One");
  });

  it("shows the dashboard as the default page", () => {
    const html = renderToString(<App initialSetupStatus={installed} initialSession={session} />);

    expect(html).toContain("总览");
    expect(html).toContain("正在读取统计");
  });

  it("renders a standalone auth screen before login", () => {
    const html = renderToString(<App initialSetupStatus={installed} />);

    expect(html).toContain("登录学习助手");
    expect(html).toContain("机构在线学习数据中台");
    expect(html).toContain("浏览器插件托管");
    expect(html).toContain("私有化部署");
    expect(html).toContain("邮箱或用户名");
    expect(html).toContain("用户名");
    expect(html).not.toContain("插件状态:");
  });

  it("can render the review workspace page", () => {
    const html = renderToString(<App initialSetupStatus={installed} initialPage="复习" initialSession={session} />);

    expect(html).toContain("复习");
    expect(html).toContain("正在读取到期卡片");
  });

  it("renders system settings with the general tab by default", () => {
    const html = renderToString(<App initialSetupStatus={installed} initialPage="系统设置" initialSession={session} />);

    expect(html).toContain("系统设置");
    expect(html).toContain("插件管理");
    expect(html).toContain("站点适配器");
    expect(html).toContain("用户与授权");
    expect(html).toContain("保存设置");
  });

  it("renders plugin packaging inside the plugins settings tab", () => {
    const html = renderToString(<SystemSettings tab="plugins" onTabChange={() => undefined} session={null} onSessionChange={() => undefined} onPluginStatusChange={() => undefined} />);

    expect(html).toContain("导出插件包");
    expect(html).toContain("最近视频源");
    expect(html).toContain("最近字幕采集");
    expect(html).toContain("暂无字幕采集诊断");
    expect(html).toContain("暂无视频源采集记录");
  });

  it("renders the adapters management inside the adapters settings tab", () => {
    const html = renderToString(<SystemSettings tab="adapters" onTabChange={() => undefined} session={null} onSessionChange={() => undefined} onPluginStatusChange={() => undefined} />);

    expect(html).toContain("新增适配器");
    expect(html).toContain("适配器列表");
  });
});
