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
        lines.extend([f"## {chapter['title']}", ""])
        video = chapter.get("video")
        if video and (video.get("page_url") or video.get("media_url")):
            if video.get("page_url"):
                lines.append(f"- 视频页面:{video['page_url']}")
            if video.get("media_url"):
                suffix = "（签名/临时链接,可能已过期）" if video.get("is_likely_signed") else ""
                lines.append(f"- 媒体地址:{video['media_url']}{suffix}")
            lines.append("")
        lines.extend(["### 字幕", ""])
        for segment in chapter.get("transcripts", []):
            lines.append(f"- {format_time(segment.get('start_seconds'))} {segment['text']}")
        lines.extend(["", "### 笔记", ""])
        for note in chapter.get("notes", []):
            tag_marks = "".join(f"【{tag}】" for tag in note.get("tags") or [])
            corrected = note.get("corrected_content")
            if corrected:
                lines.append(f"- {format_time(note.get('video_time_seconds'))} {tag_marks}【勘误】{corrected}")
                lines.append(f"  - 原文:{note['content']}")
            else:
                lines.append(f"- {format_time(note.get('video_time_seconds'))} {tag_marks}{note['content']}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"
