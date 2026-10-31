import type { ReactNode } from "react";

/**
 * 设置页的公共排版件。
 *
 * 之前设置表单直接复用 .inline-form（三列网格），按钮会被拉伸成
 * 几百像素宽的实心色块；这里改用「标题 + 说明 + 表单行 + 右对齐操作区」，
 * 让每个设置分组只有一处主操作。
 */

export type SettingsTone = "ok" | "warn" | "muted";

export function PanelHead({
  title,
  description,
  status,
  tone = "muted",
}: {
  title: string;
  description?: ReactNode;
  status?: string;
  tone?: SettingsTone;
}) {
  return (
    <header className="settings-head">
      <div className="settings-head-text">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {status ? (
        <span className="settings-status" data-tone={tone}>
          {status}
        </span>
      ) : null}
    </header>
  );
}

/** 简单字段：label / 控件 / 说明，控件用 label 包裹，点标签即可聚焦。 */
export function Field({
  label,
  hint,
  wide = false,
  children,
}: {
  label: string;
  hint?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={wide ? "field field-wide" : "field"}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

/**
 * 复合字段：控件里还有按钮（如「用预设」「清除 Key」）时不能用 label 包裹，
 * 否则点按钮会连带触发标签默认行为。控件的 aria-label 由调用方补。
 */
export function FieldGroup({
  label,
  hint,
  wide = false,
  children,
}: {
  label: string;
  hint?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? "field field-wide" : "field"}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}
