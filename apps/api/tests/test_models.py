from app.db.base import Base
from app.models import entities


def test_expected_tables_are_registered() -> None:
    assert entities.Organization.__tablename__ == "organizations"
    table_names = set(Base.metadata.tables)

    assert {
        "organizations",
        "users",
        "memberships",
        "api_tokens",
        "sites",
        "courses",
        "chapters",
        "video_sessions",
        "timeline_events",
        "transcript_segments",
        "notes",
        "exports",
        "audit_logs",
    }.issubset(table_names)
