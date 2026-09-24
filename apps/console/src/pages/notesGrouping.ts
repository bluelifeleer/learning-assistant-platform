import type { NoteItem } from "../api/client";

export const NOTE_TAG_FILTERS = ["考点", "高频", "简答", "疑问"] as const;

export interface NoteGroup {
  course_id: string;
  course_title: string;
  items: NoteItem[];
}

export function noteDisplayContent(note: Pick<NoteItem, "content" | "corrected_content">): string {
  const corrected = note.corrected_content?.trim();
  return corrected ? corrected : note.content;
}

export function filterNotesByTags(notes: NoteItem[], tags: string[]): NoteItem[] {
  if (!tags.length) return notes;
  const wanted = new Set(tags);
  return notes.filter((note) => (note.tags ?? []).some((tag) => wanted.has(tag)));
}

export function groupNotesByCourse(notes: NoteItem[]): NoteGroup[] {
  const groups: NoteGroup[] = [];
  const byCourse = new Map<string, NoteGroup>();
  for (const note of notes) {
    let group = byCourse.get(note.course_id);
    if (!group) {
      group = { course_id: note.course_id, course_title: note.course_title, items: [] };
      byCourse.set(note.course_id, group);
      groups.push(group);
    }
    group.items.push(note);
  }
  return groups;
}
