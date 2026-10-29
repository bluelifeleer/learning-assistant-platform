"""给 e2e 造一份固定的种子数据（独立 sqlite 库，绝不连真实数据库）。

由 e2e/scripts/start-api.mjs 在迁移之后调用；数据库文件每次运行前会重建，
所以这里直接按"空库"写入，并把关键 id 写到 e2e/.tmp/seed.json 供用例断言。
"""

from __future__ import annotations

import json
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API_DIR = ROOT / "apps" / "api"
sys.path.insert(0, str(API_DIR))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.models.entities import (  # noqa: E402
    Chapter,
    ChapterMemo,
    Course,
    Membership,
    Note,
    Organization,
    QuizQuestion,
    ReviewCard,
    Site,
    TranscriptSegment,
    User,
)
from app.services.auth import hash_password  # noqa: E402

ADMIN_EMAIL = "e2e@example.com"
ADMIN_PASSWORD = "e2e-password-12345"
ORG_NAME = "E2E 空间"

COURSES = [
    {
        "external_id": "e2e-ops",
        "title": "E2E 运筹学",
        "term": "2026 秋",
        "chapters": [
            {"external_id": "e2e-ops-ch1", "title": "线性规划"},
            {"external_id": "e2e-ops-ch2", "title": "对偶理论"},
        ],
    },
    {
        "external_id": "e2e-ds",
        "title": "E2E 数据结构",
        "term": "2026 秋",
        "chapters": [{"external_id": "e2e-ds-ch1", "title": "树与图"}],
    },
]


def main() -> int:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url or "sqlite" not in database_url:
        print("[seed] 拒绝执行：DATABASE_URL 必须是 sqlite（e2e 专用库）", file=sys.stderr)
        return 2

    engine = create_engine(database_url, future=True)
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = session_factory()
    try:
        organization = Organization(name=ORG_NAME)
        db.add(organization)
        db.flush()

        admin = User(
            email=ADMIN_EMAIL,
            display_name="E2E 管理员",
            password_hash=hash_password(ADMIN_PASSWORD),
        )
        db.add(admin)
        db.flush()
        db.add(Membership(organization_id=organization.id, user_id=admin.id, role="owner"))

        site = Site(adapter_id="e2e-site", name="E2E 站点", host_patterns={}, status="enabled")
        db.add(site)
        db.flush()

        seed: dict = {
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "organization": ORG_NAME,
            "courses": [],
        }

        for course_def in COURSES:
            course = Course(
                organization_id=organization.id,
                site_id=site.id,
                external_course_id=course_def["external_id"],
                title=course_def["title"],
                term=course_def["term"],
            )
            db.add(course)
            db.flush()
            course_entry = {"id": course.id, "title": course.title, "chapters": []}

            for index, chapter_def in enumerate(course_def["chapters"], start=1):
                chapter = Chapter(
                    course_id=course.id,
                    external_chapter_id=chapter_def["external_id"],
                    title=chapter_def["title"],
                    sort_order=index,
                )
                db.add(chapter)
                db.flush()
                course_entry["chapters"].append({"id": chapter.id, "title": chapter.title})

                for seg_index in range(3):
                    db.add(
                        TranscriptSegment(
                            course_id=course.id,
                            chapter_id=chapter.id,
                            start_seconds=seg_index * 60,
                            end_seconds=seg_index * 60 + 55,
                            text=f"{chapter.title} 第 {seg_index + 1} 段：这是 e2e 用的字幕内容。",
                            source="e2e",
                        )
                    )

            db.add(
                ChapterMemo(
                    chapter_id=course_entry["chapters"][0]["id"],
                    course_id=course.id,
                    content_md=f"{course.title} 的章节备忘（e2e）。",
                )
            )
            seed["courses"].append(course_entry)

        ops = seed["courses"][0]
        ops_ch1 = ops["chapters"][0]["id"]
        ops_ch2 = ops["chapters"][1]["id"]

        notes = [
            Note(
                course_id=ops["id"],
                chapter_id=ops_ch1,
                user_id=admin.id,
                video_time_seconds=120,
                content="E2E 笔记：线性规划的可行域是凸集。",
                tags=["考点"],
            ),
            Note(
                course_id=ops["id"],
                chapter_id=ops_ch2,
                user_id=admin.id,
                video_time_seconds=240,
                content="E2E 笔记：对偶问题的最优值相等。",
                tags=["高频"],
            ),
            Note(
                course_id=seed["courses"][1]["id"],
                chapter_id=seed["courses"][1]["chapters"][0]["id"],
                user_id=admin.id,
                content="E2E 笔记：树的遍历有三种顺序。",
                tags=[],
            ),
        ]
        db.add_all(notes)

        due = datetime.now(UTC)
        db.add_all(
            [
                ReviewCard(
                    organization_id=organization.id,
                    course_id=ops["id"],
                    chapter_id=ops_ch1,
                    user_id=admin.id,
                    front="可行域是凸集吗？",
                    back="是，线性约束的交集仍是凸集。",
                    due_at=due,
                ),
                ReviewCard(
                    organization_id=organization.id,
                    course_id=ops["id"],
                    chapter_id=ops_ch2,
                    user_id=admin.id,
                    front="强对偶成立的条件？",
                    back="原问题可行且有界时成立。",
                    due_at=due + timedelta(seconds=1),
                ),
            ]
        )

        db.add_all(
            [
                QuizQuestion(
                    course_id=ops["id"],
                    chapter_id=ops_ch1,
                    question_type="choice",
                    question="E2E 题目：线性规划的可行域是什么形状？",
                    options=["凸集", "非凸集", "空集"],
                    answer="凸集",
                    explanation="线性约束的交集是凸集。",
                    model="e2e",
                ),
                QuizQuestion(
                    course_id=ops["id"],
                    chapter_id=ops_ch1,
                    question_type="truefalse",
                    question="E2E 判断题：对偶问题一定可行。",
                    options=["正确", "错误"],
                    answer="错误",
                    explanation="对偶可能不可行。",
                    model="e2e",
                ),
            ]
        )

        db.commit()
    finally:
        db.close()

    out_dir = ROOT / "e2e" / ".tmp"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "seed.json").write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[seed] 完成：{ORG_NAME}，{len(seed['courses'])} 门课程，管理员 {ADMIN_EMAIL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
