import { useRef, type ReactNode } from "react";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  title: string;
  /** 主按钮文案,如「删除适配器」「删除 2 条」 */
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  /** danger = 不可逆操作(红);primary = 可逆操作(蓝) */
  tone?: "danger" | "primary";
  /** 服务端返回的错误,展示在弹窗内,关掉弹窗之前就能看到原因 */
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
  children: ReactNode;
}

/**
 * 确认条:替代 window.confirm。
 *
 * 默认把焦点放在「取消」上;危险操作用实心红,可逆操作(批量归档等)用普通主色。
 * 请求失败时弹窗不关闭,错误直接显示在正文里。
 */
export function ConfirmDialog({
  title,
  confirmLabel,
  busyLabel = "处理中...",
  busy = false,
  tone = "danger",
  error,
  onCancel,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  return (
    <Modal
      title={title}
      size="sm"
      initialFocusRef={cancelRef}
      onClose={() => {
        if (!busy) onCancel();
      }}
      footer={(
        <>
          <button ref={cancelRef} type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className={tone === "primary" ? "btn btn-primary" : "btn btn-danger"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </>
      )}
    >
      {children}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </Modal>
  );
}
