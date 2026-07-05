def format_time(seconds: float | int | None) -> str:
    if seconds is None:
        return "--:--"
    whole = int(seconds)
    minutes = whole // 60
    remaining = whole % 60
    return f"{minutes:02d}:{remaining:02d}"


def render_course_markdown(course: dict) -> str:
    lines = [f"# {course['title']}", ""]
    for chapter in course.get("chapters", []):
        lines.extend([f"## {chapter['title']}", "", "### 字幕", ""])
        for segment in chapter.get("transcripts", []):
            lines.append(f"- {format_time(segment.get('start_seconds'))} {segment['text']}")
        lines.extend(["", "### 笔记", ""])
        for note in chapter.get("notes", []):
            lines.append(f"- {format_time(note.get('video_time_seconds'))} {note['content']}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"
