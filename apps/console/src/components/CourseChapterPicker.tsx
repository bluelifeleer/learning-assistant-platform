import { useEffect, useState } from "react";
import { fetchCourseDetail, type CourseChapterNode, type CourseItem } from "../api/client";

export interface CourseChapterFilter {
  courseId: string;
  chapterId: string;
  sectionId: string;
}

export const EMPTY_COURSE_CHAPTER_FILTER: CourseChapterFilter = { courseId: "", chapterId: "", sectionId: "" };

export function useCourseChapters(courseId: string): CourseChapterNode[] {
  const [chapters, setChapters] = useState<CourseChapterNode[]>([]);
  useEffect(() => {
    setChapters([]);
    if (!courseId) return;
    let cancelled = false;
    void fetchCourseDetail(courseId)
      .then((detail) => {
        if (!cancelled) setChapters(detail.chapters);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [courseId]);
  return chapters;
}

interface CourseChapterPickerProps {
  courses: CourseItem[];
  value: CourseChapterFilter;
  onChange: (next: CourseChapterFilter) => void;
  allLabels?: { course: string; chapter: string; section: string };
}

export function CourseChapterPicker({ courses, value, onChange, allLabels }: CourseChapterPickerProps) {
  const chapters = useCourseChapters(value.courseId);
  const sections = chapters.find((chapter) => chapter.id === value.chapterId)?.children ?? [];
  const labels = allLabels ?? { course: "全部课程", chapter: "全部章", section: "全部节" };
  return (
    <div className="filter-bar">
      <label className="filter-item">
        <span>课程</span>
        <select
          value={value.courseId}
          onChange={(event) => onChange({ courseId: event.target.value, chapterId: "", sectionId: "" })}
        >
          <option value="">{labels.course}</option>
          {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
        </select>
      </label>
      <label className="filter-item">
        <span>章</span>
        <select
          value={value.chapterId}
          disabled={!value.courseId || !chapters.length}
          onChange={(event) => onChange({ ...value, chapterId: event.target.value, sectionId: "" })}
        >
          <option value="">{labels.chapter}</option>
          {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
        </select>
      </label>
      <label className="filter-item">
        <span>节</span>
        <select
          value={value.sectionId}
          disabled={!value.chapterId || !sections.length}
          onChange={(event) => onChange({ ...value, sectionId: event.target.value })}
        >
          <option value="">{labels.section}</option>
          {sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}
        </select>
      </label>
    </div>
  );
}
