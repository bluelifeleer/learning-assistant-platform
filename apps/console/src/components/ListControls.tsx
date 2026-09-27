import type { ReactNode } from "react";

/** 列表页通用搜索框(带图标与一键清空)。 */
export function ToolbarSearch({
  value,
  onChange,
  placeholder = "搜索…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="list-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20.5 20.5 16.8 16.8" />
      </svg>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button type="button" className="list-search-clear" aria-label="清空搜索" onClick={() => onChange("")}>
          ×
        </button>
      ) : null}
    </div>
  );
}

/** 工具条里的下拉筛选,复用 .filter-item 的样式。 */
export function ToolbarSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="filter-item">
      <span>{label}</span>
      <select value={value} aria-label={label} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 搜索 + 筛选 + 排序的统一容器,右侧统一显示命中条数。 */
export function ListToolbar({ children, count, total }: { children: ReactNode; count: number; total?: number }) {
  const label = total !== undefined && total !== count ? `${count} / ${total} 条` : `${count} 条`;
  return (
    <div className="list-toolbar">
      {children}
      <span className="list-count">{label}</span>
    </div>
  );
}

/** 行内操作:默认隐藏,悬停或键盘聚焦时出现,避免列表视觉噪音。 */
export function RowActions({ children }: { children: ReactNode }) {
  return <span className="row-actions">{children}</span>;
}

/** 批量操作条:有选中项时出现,吸底避免长列表里滚出视野。 */
export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="bulk-bar" role="region" aria-label="批量操作">
      <strong>已选 {count} 项</strong>
      <span className="bulk-bar-actions">{children}</span>
      <button type="button" className="text-button" onClick={onClear}>
        取消选择
      </button>
    </div>
  );
}
