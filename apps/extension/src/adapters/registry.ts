import type { CustomAdapterConfig } from "../config";
import { createCustomAdapter } from "./customAdapter";
import { genericDomCourseAdapter } from "./genericDomCourse";
import { genericVideoAdapter } from "./genericVideo";
import type { LearningAdapter } from "./types";
import { wencaiSchoolAdapter } from "./wencaiSchool";

export const adapters: LearningAdapter[] = [
  wencaiSchoolAdapter,
  genericDomCourseAdapter,
  genericVideoAdapter,
];

export function pickAdapter(
  url: URL,
  enabledAdapterIds?: string[],
  customAdapters: CustomAdapterConfig[] = [],
): LearningAdapter | null {
  // 自定义站点优先于通用 adapter，避免同一域名被 generic-video 抢先匹配
  const custom = customAdapters
    .filter((adapter) => adapter.enabled !== false)
    .map(createCustomAdapter);
  const enabled = enabledAdapterIds?.length ? new Set(enabledAdapterIds) : null;
  const builtIn = enabled ? adapters.filter((adapter) => enabled.has(adapter.id)) : adapters;
  return [...custom, ...builtIn].find((adapter) => adapter.matches(url)) ?? null;
}
