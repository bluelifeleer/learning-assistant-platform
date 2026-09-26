"""性能索引:补齐高频过滤/排序列

Revision ID: 0017_perf_indexes
Revises: 0016_chapter_memo
Create Date: 2026-09-26

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0017_perf_indexes"
down_revision: str | None = "0016_chapter_memo"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# (索引名, 表名, 列) —— ix_screenshots_course_id 已由迁移 0006 建立,这里不重复
INDEXES: list[tuple[str, str, list[str]]] = [
    # 字幕:章节时间轴读取 + OCR 去重(chapter_id, source, start_seconds)
    ("ix_transcript_segments_chapter_source_start", "transcript_segments", ["chapter_id", "source", "start_seconds"]),
    ("ix_transcript_segments_course", "transcript_segments", ["course_id"]),
    # 笔记:按用户倒序分页,以及课程/章节过滤
    ("ix_notes_user_created", "notes", ["user_id", "created_at"]),
    ("ix_notes_chapter", "notes", ["chapter_id"]),
    ("ix_notes_course", "notes", ["course_id"]),
    # 导出:列表按创建时间倒序 + LIMIT
    ("ix_exports_created", "exports", ["created_at"]),
    # 视频会话:学习时长统计与章节进度
    ("ix_video_sessions_user_started", "video_sessions", ["user_id", "started_at"]),
    ("ix_video_sessions_chapter", "video_sessions", ["chapter_id"]),
    # 截图:章节截图列表与用户维度
    ("ix_screenshots_chapter", "screenshots", ["chapter_id"]),
    ("ix_screenshots_user", "screenshots", ["user_id"]),
    # 复习卡:取某用户到期卡片
    ("ix_review_cards_user_due", "review_cards", ["user_id", "due_at"]),
]


def upgrade() -> None:
    for name, table, columns in INDEXES:
        op.create_index(name, table, columns)


def downgrade() -> None:
    for name, table, _ in reversed(INDEXES):
        op.drop_index(name, table_name=table)
