import { useRef, useState } from "react";
import { Modal } from "./Modal";

interface InputDialogProps {
  title: string;
  label: string;
  initialValue: string;
  placeholder?: string;
  hint?: string;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  /** 服务端返回的错误,展示在弹窗内 */
  error?: string;
  required?: boolean;
  maxLength?: number;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

/**
 * 单行文本编辑弹窗:替代 window.prompt。
 *
 * 输入框自动聚焦并全选,回车直接提交;必填项为空时先在本地拦下,
 * 服务端错误由父组件通过 error 传回来,弹窗保持打开。
 */
export function InputDialog({
  title,
  label,
  initialValue,
  placeholder,
  hint,
  confirmLabel,
  busyLabel = "保存中...",
  busy = false,
  error,
  required = true,
  maxLength,
  onCancel,
  onConfirm,
}: InputDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(initialValue);
  const [localError, setLocalError] = useState("");

  function submit() {
    if (busy) return;
    const next = value.trim();
    if (required && !next) {
      setLocalError(`${label}不能为空`);
      return;
    }
    setLocalError("");
    onConfirm(next);
  }

  return (
    <Modal
      title={title}
      size="sm"
      initialFocusRef={inputRef}
      onClose={() => {
        if (!busy) onCancel();
      }}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </>
      )}
    >
      <label className="modal-field">
        <span>{label}</span>
        <input
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(event) => {
            setValue(event.target.value);
            setLocalError("");
          }}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
      </label>
      {hint ? <p className="modal-hint">{hint}</p> : null}
      {localError || error ? <p className="form-error" role="alert">{localError || error}</p> : null}
    </Modal>
  );
}
