import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthPanel } from "./AuthPanel";

const noop = () => undefined;

describe("AuthPanel 登录框", () => {
  it("密码默认以密文显示，并提供可访问的“显示密码”开关", () => {
    const html = renderToString(<AuthPanel session={null} onSessionChange={noop} />);

    expect(html).toContain('type="password"');
    expect(html).toContain("auth-input-toggle");
    expect(html).toContain('aria-label="显示密码"');
    expect(html).toContain('aria-pressed="false"');
    // 初始状态是"闭眼"图标，点击后才切到明文
    expect(html).not.toContain('type="text"');
  });

  it("注册模式下同样有显示密码开关", () => {
    const html = renderToString(<AuthPanel session={null} onSessionChange={noop} />);

    expect(html).toContain("登录学习助手");
    expect(html).toContain('aria-label="显示密码"');
  });
});
