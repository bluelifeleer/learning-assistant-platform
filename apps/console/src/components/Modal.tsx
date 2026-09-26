import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** 过滤掉不可见元素(jsdom 里 getComputedStyle 也能给出默认值,不会误杀) */
function isVisible(element: HTMLElement): boolean {
  if (element.closest("[hidden]")) return false;
  if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") return true;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

export function Modal({ title, onClose, children, footer }: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // 记住打开前的焦点,卸载时还回去 —— 否则键盘/读屏用户关掉弹窗后位置会丢失
  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const previous = restoreFocusRef.current;
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const focusables = (): HTMLElement[] =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);

    // 打开时把焦点移进弹窗:优先第一个可聚焦元素,否则聚焦面板本身
    const initial = focusables()[0];
    (initial ?? panel).focus();

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      // 焦点陷阱:Tab / Shift+Tab 只在弹窗内部循环,不会跑到背后的页面上
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        panel!.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = active !== null && panel!.contains(active);
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" aria-label="关闭" onClick={onClose}>×</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
