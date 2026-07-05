import { genericDomCourseAdapter } from "./genericDomCourse";
import { genericVideoAdapter } from "./genericVideo";
import type { LearningAdapter } from "./types";
import { wencaiSchoolAdapter } from "./wencaiSchool";

export const adapters: LearningAdapter[] = [
  wencaiSchoolAdapter,
  genericDomCourseAdapter,
  genericVideoAdapter,
];

export function pickAdapter(url: URL, enabledAdapterIds?: string[]): LearningAdapter | null {
  const enabled = enabledAdapterIds?.length ? new Set(enabledAdapterIds) : null;
  const candidates = enabled ? adapters.filter((adapter) => enabled.has(adapter.id)) : adapters;
  return candidates.find((adapter) => adapter.matches(url)) ?? null;
}
