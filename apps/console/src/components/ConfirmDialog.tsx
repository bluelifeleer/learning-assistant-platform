import { useRef, type ReactNode } from "react";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  title: string;
  /** 主按钮文案,如「删除适配器」「删除 2 条」 */
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  /** 服务端返回的错误,展示在弹窗内,关掉弹窗之前就能看到原因 */
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
  children: ReactNode;
}

/**
 * 危险操作确认条:替代 window.confirm。
 *
 * 默认把焦点放在「取消」上;确认按钮用实心红,和普通主按钮区分开。
 * 删除失败时弹窗不关闭,错误直接显示在正文里(例如适配器下还有课程)。
 */
export function ConfirmDialog({
  title,
  confirmLabel,
  busyLabel = "处理中...",
  busy = false,
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
          <button type="button" className="btn btn-danger" disabled={busy} onClick={onConfirm}>
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
