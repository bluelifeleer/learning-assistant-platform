from app.exporters.json_export import render_course_json
from app.exporters.markdown import render_course_markdown


def sample_course() -> dict:
    return {
        "title": "供应链管理",
        "chapters": [
            {
                "title": "1.1 课程导论",
                "transcripts": [
                    {"start_seconds": 0, "text": "欢迎学习供应链管理"},
                    {"start_seconds": 8.5, "text": "本节介绍课程结构"},
                ],
                "notes": [{"video_time_seconds": 12, "content": "这里要复习"}],
            }
        ],
    }


def test_markdown_export_contains_transcripts_and_notes() -> None:
    output = render_course_markdown(sample_course())

    assert "# 供应链管理" in output
    assert "- 00:00 欢迎学习供应链管理" in output
    assert "- 00:12 这里要复习" in output


def test_json_export_is_stable() -> None:
    output = render_course_json(sample_course())

    assert '"title": "供应链管理"' in output
    assert '"text": "欢迎学习供应链管理"' in output
