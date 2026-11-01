import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

const noop = () => undefined;

describe("ConfirmDialog", () => {
  it("渲染自定义标题、危险主按钮和取消按钮", () => {
    const html = renderToString(
      <ConfirmDialog title="删除适配器？" confirmLabel="删除适配器" onCancel={noop} onConfirm={noop}>
        <p className="confirm-text">确定删除？</p>
      </ConfirmDialog>,
    );

    expect(html).toContain("删除适配器？");
    expect(html).toContain("btn-danger");
    expect(html).toContain("取消");
    expect(html).toContain("确定删除？");
  });

  it("可逆操作用主色按钮，而不是危险红", () => {
    const html = renderToString(
      <ConfirmDialog title="归档当前列表？" confirmLabel="归档 3 门" tone="primary" onCancel={noop} onConfirm={noop}>
        <p className="confirm-text">将归档 3 门课程。</p>
      </ConfirmDialog>,
    );

    expect(html).toContain("btn-primary");
    expect(html).not.toContain("btn-danger");
  });

  it("忙碌时换文案，服务端错误直接显示在弹窗里", () => {
    const html = renderToString(
      <ConfirmDialog
        title="删除操作日志？"
        confirmLabel="删除 2 条"
        busy
        busyLabel="删除中..."
        error="该适配器下还有 2 门课程"
        onCancel={noop}
        onConfirm={noop}
      >
        <p className="confirm-text">确定删除？</p>
      </ConfirmDialog>,
    );

    expect(html).toContain("删除中...");
    expect(html).toContain("该适配器下还有 2 门课程");
    expect(html).toContain("role=\"alert\"");
  });
});
