export type SortDir = "asc" | "desc";

/**
 * 关键词匹配:按空白拆成多个词,要求**每个词都出现**(顺序无关),
 * 这样"党史 笔记"能同时命中"中共党史"和内容里的"笔记"。
 * 大小写与中英文混排都做小写归一。
 */
export function matchesKeyword(fields: Array<string | number | null | undefined>, keyword: string): boolean {
  const terms = keyword.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = fields
    .filter((field) => field !== null && field !== undefined)
    .join("\n")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** 排序;空值恒排最后,字符串按中文拼音序。 */
export function sortItems<T>(
  items: T[],
  selector: (item: T) => string | number | null | undefined,
  dir: SortDir = "asc",
): T[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...items].sort((left, right) => {
    const a = selector(left);
    const b = selector(right);
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === "number" && typeof b === "number") return (a - b) * factor;
    return String(a).localeCompare(String(b), "zh-Hans-CN") * factor;
  });
}

/** 单选 / 取消单选。 */
export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

/**
 * 全选 / 全不选当前列表。
 * 只影响 visibleIds 里的项,已经选中的其它项保持不变。
 */
export function toggleAllIds(ids: string[], visibleIds: string[], selectAll: boolean): string[] {
  const visible = new Set(visibleIds);
  const kept = ids.filter((id) => !visible.has(id));
  return selectAll ? [...kept, ...visibleIds] : kept;
}
