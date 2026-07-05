import { genericDomCourseAdapter } from "./genericDomCourse";
import { genericVideoAdapter } from "./genericVideo";
import type { LearningAdapter } from "./types";
import { wencaiSchoolAdapter } from "./wencaiSchool";

export const adapters: LearningAdapter[] = [
  wencaiSchoolAdapter,
  genericDomCourseAdapter,
  genericVideoAdapter,
];

export function pickAdapter(url: URL): LearningAdapter {
  return adapters.find((adapter) => adapter.matches(url)) ?? genericVideoAdapter;
}
