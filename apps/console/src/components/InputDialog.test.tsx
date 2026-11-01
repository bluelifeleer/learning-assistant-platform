import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InputDialog } from "./InputDialog";

const noop = () => undefined;

describe("InputDialog", () => {
  it("带出初始值、说明和自定义按钮文案", () => {
    const html = renderToString(
      <InputDialog
        title="重命名课程"
        label="课程名称"
        initialValue="战略管理"
        hint="最长 500 个字符"
        confirmLabel="保存名称"
        maxLength={500}
        onCancel={noop}
        onConfirm={noop}
      />,
    );

    expect(html).toContain("重命名课程");
    expect(html).toContain("战略管理");
    expect(html).toContain("最长 500 个字符");
    expect(html).toContain("保存名称");
    expect(html).toContain('maxLength="500"');
  });

  it("服务端错误会显示在弹窗内", () => {
    const html = renderToString(
      <InputDialog
        title="修改学期"
        label="学期"
        initialValue=""
        confirmLabel="保存学期"
        error="学期长度不能超过 120 个字符"
        onCancel={noop}
        onConfirm={noop}
      />,
    );

    expect(html).toContain("学期长度不能超过 120 个字符");
    expect(html).toContain('role="alert"');
  });

  it("可为空字段不要求必填", () => {
    const html = renderToString(
      <InputDialog
        title="修改学期"
        label="学期"
        initialValue=""
        required={false}
        confirmLabel="保存学期"
        onCancel={noop}
        onConfirm={noop}
      />,
    );

    expect(html).toContain("保存学期");
  });
});
