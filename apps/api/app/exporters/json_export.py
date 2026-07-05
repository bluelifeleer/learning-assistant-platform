import json


def render_course_json(course: dict) -> str:
    return json.dumps(course, ensure_ascii=False, indent=2, sort_keys=True)
